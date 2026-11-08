"""Spoken practice: measuring a take from its levels and words, storing recordings, and the transcript job."""
import base64
import time
import unittest

from _load import HTTPException, api, ballots, fake_model, reset, run, speech, store


def levels(pattern):
    """'5:loud,3:quiet' -> samples at 10 Hz (seconds:kind)."""
    out = []
    for part in pattern.split(","):
        secs, kind = part.split(":")
        out += [0.6 if kind == "loud" else 0.003] * int(float(secs) * 10)
    return out


def words_at(text, start=0.0, step=0.4):
    out, t = [], start
    for w in text.split():
        out.append({"word": w, "start": round(t, 2), "end": round(t + 0.3, 2)})
        t += step
    return out


class Measuring(unittest.TestCase):
    def test_pauses_and_speaking_time_come_from_levels(self):
        lv = levels("1:quiet,10:loud,2.5:quiet,5:loud,1:quiet,4:loud,3:quiet")
        m = speech.measure({"duration": 26.5, "levels": lv})
        self.assertEqual(m["starts_at"], 1.0)
        self.assertEqual(m["speaking"], 22.5)  # first sound to last sound, not the whole take
        self.assertEqual([p["length"] for p in m["pauses"]], [2.5])  # 1 s is not a pause; the trailing quiet is not either
        self.assertEqual(m["pauses"][0]["at"], 11.0)
        self.assertEqual(m["measured_from"], "levels")

    def test_silent_take(self):
        m = speech.measure({"duration": 5, "levels": [0.0] * 50})
        self.assertEqual(m["speaking"], 0.0)
        self.assertEqual(m["pauses"], [])

    def test_quiet_mic_judged_like_a_loud_one(self):
        quiet = [v / 10 for v in levels("5:loud,3:quiet,5:loud")]
        self.assertEqual(len(speech.measure({"duration": 13, "levels": quiet})["pauses"]), 1)

    def test_fillers(self):
        self.assertEqual(speech.count_fillers("Um, the answer is, uh, yes. You know, it is."), 3)
        self.assertEqual(speech.count_fillers("I like tariffs. So, here we go."), 1)  # "like" in a sentence is not a filler
        self.assertEqual(speech.count_fillers("The answer is clear."), 0)

    def test_words_a_minute_skip_fillers(self):
        text = "um " + " ".join(["word"] * 150)
        m = speech.measure({"duration": 61, "levels": levels("60:loud,1:quiet")}, {"text": text, "words": []})
        self.assertEqual(m["words"], 150)
        self.assertEqual(m["wpm"], 150)

    def test_answer_time_from_the_outline(self):
        w = words_at("So today we ask whether Congress can change trade policy and my view is partly through the budget riders")
        t = speech.answer_time(w, "Partly, through the budget")
        self.assertAlmostEqual(t, w[13]["start"], delta=2.0)
        self.assertLess(t, w[16]["start"] + 0.01)

    def test_answer_time_from_a_cue_and_none(self):
        w = words_at("Good evening. Prices rose again. My answer is yes because the Fed waited", step=0.5)
        self.assertEqual(speech.answer_time(w), w[5]["start"])
        self.assertIsNone(speech.answer_time(words_at("Prices rose again this fall")))
        self.assertIsNone(speech.answer_time([]))

    def test_answer_time_counts_from_the_first_sound(self):
        w = words_at("my answer is yes", start=3.0)
        lv = levels("3:quiet,5:loud")
        m = speech.measure({"duration": 8, "levels": lv}, {"text": "my answer is yes", "words": w})
        self.assertEqual(m["answer_at"], 0.0)

    def test_typed_take_is_marked_estimated(self):
        reset()
        t = speech.new_take({"event": "drill", "limit": 60, "typed": True, "text": " ".join(["word"] * 140), "duration": 0})
        self.assertTrue(t["stats"]["estimated"])
        self.assertEqual(t["stats"]["estimated_seconds"], 60.0)
        self.assertEqual(t["transcript"]["status"], "typed")


class Recordings(unittest.TestCase):
    def setUp(self):
        reset()

    def take(self, **kw):
        return speech.new_take({"event": "extemp", "limit": 420, "duration": 30, "levels": levels("30:loud"), **kw})

    def test_unknown_event_and_mime_refused(self):
        with self.assertRaises(ValueError):
            speech.new_take({"event": "poetry"})
        t = self.take()
        with self.assertRaises(ValueError):
            speech.save_audio(t["id"], b"x", "text/html")
        with self.assertRaises(ValueError):
            speech.save_audio(t["id"], b"", "audio/webm")

    def test_cap_and_bad_base64(self):
        t = self.take()
        with self.assertRaises(ValueError):
            speech.save_audio(t["id"], b"x" * (speech.UPLOAD_CAP + 1), "audio/webm")
        with self.assertRaises(ValueError):
            speech.save_audio_b64(t["id"], "not base64!!", "audio/webm")

    def test_saved_file_and_public_view_hides_the_name(self):
        t = self.take()
        speech.save_audio_b64(t["id"], base64.b64encode(b"OggS" * 100).decode(), "audio/webm;codecs=opus")
        got = speech.get_take(t["id"])
        self.assertTrue(speech.audio_path(got).exists())
        self.assertEqual(got["mime"], "audio/webm")
        pub = speech.public(got)
        self.assertNotIn("file", pub)
        self.assertTrue(pub["has_audio"])

    def test_prune_keeps_the_newest_twenty(self):
        ids = []
        for i in range(23):
            t = self.take()
            speech.change_take(t["id"], lambda x, i=i: x.__setitem__("at", 1000 + i))
            speech.save_audio(t["id"], b"a" * 10, "audio/webm")
            ids.append(t["id"])
        kept = [t["id"] for t in store.read("practice.json")["takes"] if t["file"]]
        self.assertEqual(len(kept), 20)
        self.assertNotIn(ids[0], kept)
        self.assertIn(ids[-1], kept)
        self.assertEqual(len(list((store.data_dir() / "recordings").iterdir())), 20)

    def test_delete_all(self):
        t = self.take()
        speech.save_audio(t["id"], b"a" * 10, "audio/webm")
        self.assertEqual(speech.delete_all_recordings(), 1)
        self.assertFalse(speech.get_take(t["id"])["file"])
        self.assertEqual(speech.recordings_summary()["count"], 0)


def wait_status(take_id, done=("done", "failed", "unavailable", "cancelled"), timeout=5):
    end = time.time() + timeout
    while time.time() < end:
        st = speech.get_take(take_id)["transcript"]["status"]
        if st in done:
            return st
        time.sleep(0.02)
    raise AssertionError("transcript never finished")


class Transcript(unittest.TestCase):
    def setUp(self):
        reset()
        self.saved = speech.TRANSCRIBER

    def tearDown(self):
        speech.TRANSCRIBER = self.saved
        api.speech.TRANSCRIBER = self.saved

    def use(self, engine):
        speech.TRANSCRIBER = speech.Transcriber(engine)
        api.speech.TRANSCRIBER = speech.TRANSCRIBER

    def recorded(self):
        t = speech.new_take({"event": "drill", "limit": 60, "duration": 20, "levels": levels("20:loud"), "answer": "yes, through the budget"})
        speech.save_audio(t["id"], b"audio", "audio/webm")
        return t

    def test_done_fills_transcript_and_stats(self):
        self.use(lambda path, model: {"text": "Um, my answer is yes, through the budget.",
                                      "words": words_at("Um, my answer is yes, through the budget.")})
        t = self.recorded()
        speech.TRANSCRIBER.start(t["id"])
        self.assertEqual(wait_status(t["id"]), "done")
        got = speech.get_take(t["id"])
        self.assertEqual(got["stats"]["fillers"], 1)
        self.assertIsNotNone(got["stats"]["answer_at"])
        self.assertEqual(got["transcript"]["model"], "base.en")

    def test_failure_is_plain_and_keeps_timing(self):
        def boom(path, model):
            raise RuntimeError("Unable to download faster-whisper model: connect timeout")
        self.use(boom)
        t = self.recorded()
        speech.TRANSCRIBER.start(t["id"])
        self.assertEqual(wait_status(t["id"]), "failed")
        got = speech.get_take(t["id"])
        self.assertIn("could not be downloaded", got["transcript"]["error"])
        self.assertEqual(got["stats"]["speaking"], 20.0)

    def test_unavailable_without_faster_whisper(self):
        self.use(None)
        speech.TRANSCRIBER.available = lambda: False
        t = self.recorded()
        self.assertEqual(speech.TRANSCRIBER.start(t["id"])["transcript"]["status"], "unavailable")
        self.assertTrue(speech.get_take(t["id"])["file"])  # kept for "Transcribe now" later

    def test_cancel(self):
        import threading
        gate = threading.Event()
        self.use(lambda path, model: (gate.wait(2), {"text": "late", "words": []})[1])
        t = self.recorded()
        speech.TRANSCRIBER.start(t["id"])
        run(api.post_take_cancel(t["id"]))
        gate.set()
        self.assertEqual(wait_status(t["id"]), "cancelled")

    def test_routes_take_audio_poll(self):
        self.use(lambda path, model: {"text": "my answer is yes", "words": words_at("my answer is yes")})
        t = run(api.post_take({"event": "drill", "limit": 60, "duration": 12, "levels": levels("12:loud"), "prompt": "Q?"}))
        self.assertNotIn("file", t)
        out = run(api.post_take_audio(t["id"], {"b64": base64.b64encode(b"webm").decode(), "mime": "audio/webm"}))
        self.assertIn(out["transcript"]["status"], ("waiting", "working", "done"))
        wait_status(t["id"])
        self.assertEqual(run(api.get_take(t["id"]))["transcript"]["text"], "my answer is yes")
        self.assertEqual(base64.b64decode(run(api.get_take_audio(t["id"]))["b64"]), b"webm")
        with self.assertRaises(HTTPException) as e:
            run(api.get_take("missing"))
        self.assertEqual(e.exception.status_code, 400)

    def test_judge_waits_for_the_transcript(self):
        import threading
        gate = threading.Event()
        self.use(lambda path, model: (gate.wait(2), {"text": "x", "words": []})[1])
        t = self.recorded()
        speech.TRANSCRIBER.start(t["id"])
        fake_model()
        with self.assertRaises(HTTPException) as e:
            run(api.post_take_judge(t["id"], {"question": "Should it?"}))
        self.assertIn("still being made", e.exception.detail)
        gate.set()
        wait_status(t["id"])



class TypedWords(unittest.TestCase):
    def test_typed_words_keep_the_real_timing(self):
        reset()
        t = speech.new_take({"event": "drill", "limit": 60, "duration": 31, "levels": levels("1:quiet,30:loud")})
        out = run(api.post_take_text(t["id"], {"text": " ".join(["word"] * 75)}))
        self.assertEqual(out["transcript"]["status"], "typed")
        self.assertEqual(out["stats"]["speaking"], 30.0)
        self.assertEqual(out["stats"]["wpm"], 150)
        with self.assertRaises(HTTPException):
            run(api.post_take_text(t["id"], {"text": "   "}))


if __name__ == "__main__":
    unittest.main()


class ModelCache(unittest.TestCase):
    def test_cached_only_when_model_bin_is_there(self):
        import os
        import tempfile
        from pathlib import Path
        with tempfile.TemporaryDirectory() as d:
            old = os.environ.get("HF_HUB_CACHE")
            os.environ["HF_HUB_CACHE"] = d
            try:
                self.assertFalse(speech.model_cached("base.en"))
                snap = Path(d) / "models--Systran--faster-whisper-base.en" / "snapshots" / "abc"
                snap.mkdir(parents=True)
                self.assertFalse(speech.model_cached("base.en"))
                (snap / "model.bin").write_bytes(b"x")
                self.assertTrue(speech.model_cached("base.en"))
                self.assertFalse(speech.model_cached("tiny"))
                st = speech.transcript_status("nonsense")
                self.assertEqual(st["model"], "base.en")
                self.assertTrue(st["cached"]["base.en"])
                self.assertEqual(set(st["mb"]), set(speech.MODELS))
            finally:
                if old is None:
                    os.environ.pop("HF_HUB_CACHE", None)
                else:
                    os.environ["HF_HUB_CACHE"] = old

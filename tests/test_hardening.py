"""Stage 3 review fixes: model time limits, public Hermes surfaces only, takes that cannot get stuck,
numbers that stay valid JSON, a headline pull that always ends, exports kept out of other apps' folders,
and the opponent's audio kept in our own folder."""
import asyncio
import json
import os
import re
import tempfile
import threading
import time
import unittest
from pathlib import Path
from unittest import mock

from _load import ROOT, Result, api, engine, headlines, library, reset, run, speech


class SlowLlm:
    def __init__(self, delay, raise_timeout=False):
        self.delay, self.raise_timeout, self.calls = delay, raise_timeout, []

    async def acomplete(self, messages, **kw):
        self.calls.append(("text", kw))
        await asyncio.sleep(self.delay)
        return Result("late")

    async def acomplete_structured(self, **kw):
        self.calls.append(("json", kw))
        if self.raise_timeout:
            raise TimeoutError("Request timed out.")
        await asyncio.sleep(self.delay)
        return Result("{}", {})


class ModelTimeLimits(unittest.TestCase):
    def test_every_call_names_its_own_limit(self):
        llm = SlowLlm(0)
        m = engine.Model(llm)
        run(m.text("s", [{"role": "user", "content": "x"}]))
        run(m.json("s", "h", "b"))
        self.assertTrue(all(kw.get("timeout") == engine.CALL_TIMEOUT for _k, kw in llm.calls))
        self.assertGreater(engine.CALL_TIMEOUT, 30)  # Hermes's own default for a call with no limit

    def test_a_hung_model_gets_a_plain_message(self):
        m = engine.Model(SlowLlm(5), timeout=0.05)
        with mock.patch.object(engine, "GUARD_SLACK", 0.05):
            t0 = time.time()
            with self.assertRaises(RuntimeError) as e:
                run(m.text("s", [{"role": "user", "content": "x"}]))
            self.assertLess(time.time() - t0, 2)
        self.assertEqual(str(e.exception), engine.SLOW)

    def test_a_timed_out_structured_call_is_not_tried_twice(self):
        llm = SlowLlm(0, raise_timeout=True)
        with self.assertRaises(RuntimeError) as e:
            run(engine.Model(llm).json("s", "h", "b"))
        self.assertEqual(str(e.exception), engine.SLOW)
        self.assertEqual([k for k, _ in llm.calls], ["json"])


class PublicSurfacesOnly(unittest.TestCase):
    def test_no_private_hermes_modules(self):
        # model_tools is not in hermes_cli/data/plugin_api.json; tools.registry is.
        for path in list(ROOT.glob("*.py")) + [ROOT / "dashboard" / "plugin_api.py"]:
            src = path.read_text(encoding="utf-8")
            self.assertNotRegex(src, r"^\s*(import|from)\s+model_tools\b", path.name)
            self.assertNotRegex(src, r"^\s*from\s+tools\.(?!registry\b)", path.name)

    def test_tool_outside_hermes_reads_as_not_set_up(self):
        out = api._hermes_tool("web_search", {"query": "x"})
        self.assertIn("Unknown tool", out["error"])


class TakesNeverStick(unittest.TestCase):
    def setUp(self):
        reset()
        self.old = speech.TRANSCRIBER._engine

    def tearDown(self):
        speech.TRANSCRIBER._engine = self.old

    def recorded(self):
        t = speech.new_take({"event": "drill", "limit": 60, "duration": 10, "levels": [0.5] * 100})
        return speech.save_audio(t["id"], b"webm", "audio/webm")

    def test_a_take_left_waiting_by_a_restart_is_released(self):
        t = self.recorded()  # status "waiting", but no job in this process
        out = run(api.get_take(t["id"]))
        self.assertEqual(out["transcript"]["status"], "failed")
        self.assertIn("Transcribe now", out["transcript"]["error"])

    def test_typed_words_survive_a_late_transcript(self):
        gate = threading.Event()
        speech.TRANSCRIBER._engine = lambda path, model: (gate.wait(2), {"text": "machine words", "words": []})[1]
        t = self.recorded()
        speech.TRANSCRIBER.start(t["id"])
        run(api.post_take_text(t["id"], {"text": "my own words for this take"}))
        gate.set()
        for _ in range(100):
            if not speech.TRANSCRIBER.busy(t["id"]):
                break
            time.sleep(0.02)
        tr = speech.get_take(t["id"])["transcript"]
        self.assertEqual((tr["status"], tr["text"]), ("typed", "my own words for this take"))

    def test_a_job_that_starts_after_the_student_typed_does_not_run(self):
        # The window the first test hits only sometimes: the job passes its cancel check, then the student's
        # words land before it marks the take "working". It must leave the typed words alone.
        calls = []
        speech.TRANSCRIBER._engine = lambda path, model: (calls.append(1), {"text": "machine words", "words": []})[1]
        t = self.recorded()
        speech.change_take(t["id"], lambda x: x["transcript"].update(status="waiting"))
        speech.set_text(t["id"], "typed before the job began")
        speech.TRANSCRIBER._jobs.add(t["id"])
        speech.TRANSCRIBER._run(t["id"], "base.en")
        tr = speech.get_take(t["id"])["transcript"]
        self.assertEqual((tr["status"], tr["text"], calls), ("typed", "typed before the job began", []))

    def test_a_second_press_does_not_queue_a_second_job(self):
        gate = threading.Event()
        calls = []
        speech.TRANSCRIBER._engine = lambda path, model: (calls.append(1), gate.wait(2), {"text": "x", "words": []})[2]
        t = self.recorded()
        speech.TRANSCRIBER.start(t["id"])
        speech.TRANSCRIBER.start(t["id"])
        gate.set()
        for _ in range(100):
            if not speech.TRANSCRIBER.busy(t["id"]):
                break
            time.sleep(0.02)
        time.sleep(0.05)
        self.assertEqual(len(calls), 1)

    def test_numbers_stay_valid_json(self):
        t = speech.new_take({"event": "drill", "limit": "abc", "duration": float("nan"), "levels": [float("inf"), "x", -1]})
        json.dumps(speech.public(t), allow_nan=False)
        self.assertEqual((t["limit"], t["duration"], t["levels"]), (0, 0.0, [0.0, 0.0, 0.0]))
        t = speech.new_take({"event": "drill", "limit": 1e400, "duration": "1e400"})
        json.dumps(speech.public(t), allow_nan=False)


class HeadlinePullAlwaysEnds(unittest.TestCase):
    def setUp(self):
        reset()

    def test_a_dripping_outlet_fails_alone_in_time(self):
        def getter(url, hosts):
            if "npr.org" in url or "feeds.npr.org" in url:
                time.sleep(3)
            return b"<rss><channel><item><title>Tariff vote set</title><link>https://example.org/a</link></item></channel></rss>"
        t0 = time.time()
        out = headlines.pull("tariff vote", getter=getter, deadline=0.5)
        self.assertLess(time.time() - t0, 2)
        col = {c["id"]: c for c in out["columns"]}
        self.assertFalse(col["npr"]["ok"])
        self.assertIn("in time", col["npr"]["error"])
        self.assertTrue(col["reuters"]["ok"])


class ExportsStayOutOfOtherAppsFolders(unittest.TestCase):
    def test_hidden_folders_and_library_are_refused(self):
        home = Path(tempfile.mkdtemp(prefix="ldw-home-")).resolve()
        for d in (".hermes", "Documents", "Library/Preferences", "Library/Mobile Documents/com~apple~CloudDocs"):
            (home / d).mkdir(parents=True)
        with mock.patch.object(Path, "home", classmethod(lambda cls: home)):
            for bad in (".hermes/auth.json", "Library/Preferences/x.json", "Documents/.secret.json"):
                with self.assertRaises(ValueError, msg=bad):
                    library.export_path(str(home / bad), "json", "b.json")
            self.assertEqual(library.export_path(str(home / "Documents/b.json"), "json", "b.json"), home / "Documents/b.json")
            icloud = home / "Library/Mobile Documents/com~apple~CloudDocs/b.json"
            self.assertEqual(library.export_path(str(icloud), "json", "b.json"), icloud)


class VoiceStaysInOurFolder(unittest.TestCase):
    def setUp(self):
        reset()

    def test_audio_written_elsewhere_is_copied_not_moved(self):
        other = Path(tempfile.mkdtemp(prefix="ldw-tts-")) / "speech.ogg"
        other.write_bytes(b"OggS" + b"0" * 100)

        def synth(text, out_path):
            return json.dumps({"success": True, "file_path": str(other)})
        out = speech.opponent_audio(" ".join(["word"] * 40), synth)
        self.assertEqual(out["parts"][0]["mime"], "audio/ogg")
        self.assertTrue(other.exists())  # the tool's own file is left where the tool put it
        self.assertTrue(list((speech._voice_dir()).glob("*.ogg")))

    def test_too_large_is_refused_before_reading(self):
        other = Path(tempfile.mkdtemp(prefix="ldw-tts-")) / "speech.mp3"
        with open(other, "wb") as f:
            f.truncate(speech.VOICE_MAX_BYTES + 1)
        with self.assertRaises(ValueError) as e:
            speech.opponent_audio(" ".join(["word"] * 40), lambda t, o: {"success": True, "file_path": str(other)})
        self.assertIn("too large", str(e.exception))


if __name__ == "__main__":
    unittest.main()


class DrillCheckboxPinnedToBallot(unittest.TestCase):
    """The Ballots view ticks a drill by list position; once the list is trimmed, the position can point
    at another ballot. The ballot's time pins it."""

    def setUp(self):
        import tempfile, os
        self._old = os.environ.get("LDW_DATA_DIR")
        os.environ["LDW_DATA_DIR"] = tempfile.mkdtemp(prefix="ldw-drill-")
        import ballots
        self.B = ballots
        for n in range(3):
            ballots.add({"event": "ld", "round_no": n + 1, "at": 1000 + n, "drills": [{"name": "d"}]})

    def tearDown(self):
        import os
        if self._old is None:
            os.environ.pop("LDW_DATA_DIR", None)
        else:
            os.environ["LDW_DATA_DIR"] = self._old

    def test_stale_index_finds_the_right_ballot(self):
        self.B.set_drill_done(0, True, at=1002)  # the page thought 1002 was first
        h = self.B.history()
        self.assertEqual([b["drill_done"] for b in h], [False, False, True])

    def test_index_alone_still_works(self):
        self.B.set_drill_done(1, True)
        self.assertTrue(self.B.history()[1]["drill_done"])

    def test_gone_ballot_says_so(self):
        with self.assertRaises(ValueError):
            self.B.set_drill_done(0, True, at=9999)


class DemoSeed(unittest.TestCase):
    """harness/seed_demo.py writes the practice ballots once and never overwrites real ones by itself."""

    def test_seed_then_refuse(self):
        import importlib.util, io, contextlib
        spec = importlib.util.spec_from_file_location("seed_demo", ROOT / "harness" / "seed_demo.py")
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        old = os.environ.get("LDW_DATA_DIR")
        try:
            target = Path(tempfile.mkdtemp(prefix="ldw-seed-")) / "ld-workbench"
            target.mkdir()
            with contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(mod.main([str(target)]), 0)
                self.assertEqual(len(json.loads((target / "ballots.json").read_text())["history"]), 9)
                self.assertEqual(mod.main([str(target)]), 1)  # already has ballots
                self.assertEqual(mod.main([str(target.parent)]), 2)  # not the plugin's folder
                self.assertEqual(mod.main([str(target), "--force"]), 0)
            self.assertTrue(any(p.name.startswith("ballots.json.bak-") for p in target.iterdir()))
        finally:
            if old is None:
                os.environ.pop("LDW_DATA_DIR", None)
            else:
                os.environ["LDW_DATA_DIR"] = old

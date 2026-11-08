"""Hermes's own transcription first, the workbench's faster-whisper second.

Hermes is never started and never imported for real: ``tools.voice_mode`` (the private module with
``transcribe_recording``) and ``hermes_cli.config`` (public, for the profile's ``stt`` settings) are stand-in
modules put in ``sys.modules`` for each test and taken out after."""
import contextvars
import importlib.machinery
import os
import shutil
import sys
import time
import types
import unittest
import wave
from pathlib import Path

from _load import api, reset, run, speech, store

PROFILE = contextvars.ContextVar("ldw_test_profile", default="launch")


def levels(seconds_quiet, seconds_loud):
    return [0.003] * int(seconds_quiet * 10) + [0.6] * int(seconds_loud * 10)


def complete_model(folder):
    folder.mkdir(parents=True, exist_ok=True)
    for name in ("model.bin", "config.json", "tokenizer.json", "vocabulary.txt"):
        (folder / name).write_bytes(b"x")
    return folder


class FakeHermes:
    """Stand-ins for the two Hermes modules the workbench imports, and a record of every call."""

    def __init__(self, stt=None, result=None, raises=None, with_function=True):
        self.stt, self.result, self.raises, self.calls = stt or {}, result, raises, []
        self.with_function = with_function

    def transcribe_recording(self, wav_path, model=None):
        p = Path(wav_path)
        self.calls.append({"path": wav_path, "suffix": p.suffix, "exists": p.exists(), "profile": PROFILE.get()})
        if self.raises:
            raise self.raises
        return self.result if self.result is not None else {"success": True, "transcript": "My answer is yes, through the budget.", "provider": "groq"}

    def install(self):
        self.saved = {k: sys.modules.get(k) for k in ("tools", "tools.voice_mode", "hermes_cli", "hermes_cli.config")}
        tools = types.ModuleType("tools")
        tools.__path__ = []
        vm = types.ModuleType("tools.voice_mode")
        if self.with_function:
            vm.transcribe_recording = self.transcribe_recording
        hc = types.ModuleType("hermes_cli")
        hc.__path__ = []
        cfg = types.ModuleType("hermes_cli.config")
        cfg.load_config_readonly = lambda: {"stt": self.stt}
        sys.modules.update({"tools": tools, "tools.voice_mode": vm, "hermes_cli": hc, "hermes_cli.config": cfg})
        return self

    def remove(self):
        for k, v in self.saved.items():
            if v is None:
                sys.modules.pop(k, None)
            else:
                sys.modules[k] = v


class WithHermes(unittest.TestCase):
    def setUp(self):
        reset()
        self.saved = (speech.TRANSCRIBER, speech.to_wav, speech.DOWNLOAD)
        self.engine_calls = []
        self.downloads = []
        speech.DOWNLOAD = lambda name: (self.downloads.append(name), complete_model(speech.own_model_dir(name)))[1]
        self.hermes = None
        self._fw = sys.modules.get("faster_whisper")

    def tearDown(self):
        speech.TRANSCRIBER = api.speech.TRANSCRIBER = self.saved[0]
        speech.to_wav, speech.DOWNLOAD = self.saved[1], self.saved[2]
        if self.hermes:
            self.hermes.remove()
        if self._fw is None:
            sys.modules.pop("faster_whisper", None)
        else:
            sys.modules["faster_whisper"] = self._fw
        shared = Path(os.environ["XDG_CACHE_HOME"]) / "huggingface"
        if shared.is_symlink():
            shared.unlink()
        shutil.rmtree(shared, ignore_errors=True)

    def use_hermes(self, **kw):
        self.hermes = FakeHermes(**kw).install()
        return self.hermes

    def use_engine(self, engine=True):
        def stand_in(path, model):
            self.engine_calls.append(model)
            return {"text": "workbench words here", "words": [{"word": "workbench", "start": 1.0, "end": 1.4}]}
        speech.TRANSCRIBER = api.speech.TRANSCRIBER = speech.Transcriber(stand_in if engine else None)
        return speech.TRANSCRIBER

    def faster_whisper_installed(self):
        fw = types.ModuleType("faster_whisper")
        fw.__spec__ = importlib.machinery.ModuleSpec("faster_whisper", None)
        sys.modules["faster_whisper"] = fw

    def fake_wav(self):
        made = []

        def to_wav(src, dest):
            with wave.open(str(dest), "wb") as w:
                w.setnchannels(1)
                w.setsampwidth(2)
                w.setframerate(16000)
                w.writeframes(b"\x00\x00" * 1600)
            made.append(Path(dest))
            return dest
        speech.to_wav = to_wav
        return made

    def recorded(self, answer="yes, through the budget"):
        t = speech.new_take({"event": "drill", "limit": 60, "duration": 21, "levels": levels(1, 20), "answer": answer})
        speech.save_audio(t["id"], b"\x1a\x45\xdf\xa3webm-bytes", "audio/webm")
        return t

    def press(self, t, engine=True):
        """The press-first path to a cloud speech-to-text: the recording arrives with no local engine ready,
        the take says where it would go and waits, then the student presses Transcribe now. ``engine``:
        the workbench's own engine is there for the press (a fallback when Hermes fails)."""
        self.use_engine(engine=False)
        speech.TRANSCRIBER.start(t["id"])
        asked = speech.get_take(t["id"])["transcript"]
        self.assertEqual((asked["status"], asked.get("ask")), ("failed", "send"))
        if self.hermes:
            self.assertEqual(self.hermes.calls, [])  # nothing sent before the press
        if engine:
            self.use_engine()
        speech.TRANSCRIBER.start(t["id"], allow_download=True)
        return self.wait(t["id"])

    def wait(self, take_id):
        for _ in range(300):
            if not speech.TRANSCRIBER.busy(take_id):
                break
            time.sleep(0.01)
        return speech.get_take(take_id)


class HermesFirst(WithHermes):
    def test_a_cloud_provider_set_in_hermes_makes_the_transcript(self):
        h = self.use_hermes(stt={"provider": "groq"})
        made = self.fake_wav()
        t = self.recorded()
        got = self.press(t)
        tr = got["transcript"]
        self.assertEqual(tr["status"], "done")
        self.assertNotIn("ask", tr)
        self.assertEqual((tr["engine"], tr["provider"], tr["local"], tr["label"]), ("hermes", "groq", False, "Groq"))
        self.assertEqual(tr["text"], "My answer is yes, through the budget.")
        self.assertEqual(tr["words"], [])  # Hermes gives text only
        self.assertEqual(self.engine_calls, [])  # the workbench's own engine never ran
        self.assertEqual(len(h.calls), 1)
        self.assertEqual(h.calls[0]["suffix"], ".wav")  # converted to the WAV Hermes's recorder makes
        self.assertTrue(h.calls[0]["exists"])
        self.assertFalse(made[0].exists())  # and the WAV is deleted after
        s = got["stats"]
        self.assertEqual(s["speaking"], 20.0)  # timing still from the levels
        self.assertEqual(s["wpm"], 21)
        self.assertIsNone(s["answer_at"])  # no word times, so no answer time is made up

    def test_it_runs_in_the_profile_of_the_request_that_started_it(self):
        """Hermes wraps each plugin request in the requesting profile's scope (contextvars); the job thread
        gets a copy of that context, as asyncio.to_thread gives the core route."""
        h = self.use_hermes(stt={"provider": "openai"})
        self.fake_wav()
        t = self.recorded()
        token = PROFILE.set("profile-b")
        try:
            got = self.press(t, engine=False)
        finally:
            PROFILE.reset(token)
        self.assertEqual(got["transcript"]["status"], "done")
        self.assertEqual(h.calls[0]["profile"], "profile-b")

    def test_nous_is_the_openai_backend(self):
        self.use_hermes(stt={"provider": "nous"})
        self.assertEqual(speech.hermes_plan()["provider"], "openai")

    def test_when_nothing_converts_the_recording_goes_as_it_is(self):
        h = self.use_hermes(stt={"provider": "groq"})
        speech.to_wav = lambda src, dest: None
        t = self.recorded()
        self.assertEqual(self.press(t)["transcript"]["status"], "done")
        self.assertEqual(h.calls[0]["suffix"], ".webm")  # as Hermes's own route passes the desktop's webm

    def test_to_wav_says_none_when_neither_pyav_nor_ffmpeg_can(self):
        old = (speech._wav_with_av, speech._wav_with_ffmpeg)

        def no(src, dest):
            raise FileNotFoundError("not here")
        speech._wav_with_av = speech._wav_with_ffmpeg = no
        try:
            dest = store.data_dir() / "x.wav"
            self.assertIsNone(speech.to_wav(store.data_dir() / "x.webm", dest))
            self.assertFalse(dest.exists())
        finally:
            speech._wav_with_av, speech._wav_with_ffmpeg = old

    def test_silence_or_a_filtered_hallucination_is_said_plainly(self):
        self.use_hermes(stt={"provider": "groq"}, result={"success": True, "transcript": "", "filtered": True})
        self.fake_wav()
        t = self.recorded()
        tr = self.press(t)["transcript"]
        self.assertEqual(tr["status"], "failed")
        self.assertEqual(tr["error"], speech.NO_SPEECH)
        self.assertEqual(self.engine_calls, [])  # not a second try that might hallucinate "Thank you."

    def test_a_hermes_error_falls_back_to_the_workbench(self):
        h = self.use_hermes(stt={"provider": "groq"}, result={"success": False, "error": "STT provider 'groq' configured but GROQ_API_KEY not set"})
        self.fake_wav()
        t = self.recorded()
        tr = self.press(t)["transcript"]
        self.assertEqual(len(h.calls), 1)  # Hermes was tried first, after the press
        self.assertEqual((tr["status"], tr["engine"], tr["local"]), ("done", "workbench", True))
        self.assertEqual(self.engine_calls, ["base.en"])
        self.assertNotIn("GROQ_API_KEY", str(tr))  # Hermes's setup text never reaches the student

    def test_a_hermes_release_that_changed_the_function_degrades(self):
        self.use_hermes(stt={"provider": "groq"}, raises=TypeError("transcribe_recording() got an unexpected keyword"))
        self.fake_wav()
        t = self.recorded()
        self.assertEqual(self.press(t)["transcript"]["engine"], "workbench")

    def test_a_hermes_release_that_moved_the_function_degrades(self):
        self.use_hermes(stt={"provider": "groq"}, with_function=False)  # the module is there, the name is not
        self.assertEqual(speech.hermes_plan()["reason"], "missing")
        self.use_engine()
        t = self.recorded()
        speech.TRANSCRIBER.start(t["id"])
        self.assertEqual(self.wait(t["id"])["transcript"]["engine"], "workbench")

    def test_outside_hermes_the_workbench_engine_runs(self):
        self.assertEqual(speech.hermes_plan()["reason"], "missing")  # no stand-in installed
        self.use_engine()
        t = self.recorded()
        speech.TRANSCRIBER.start(t["id"])
        self.assertEqual(self.wait(t["id"])["transcript"]["engine"], "workbench")

    def test_speech_to_text_turned_off_in_hermes_is_respected(self):
        h = self.use_hermes(stt={"enabled": "false", "provider": "groq"})
        self.assertEqual(speech.hermes_plan()["reason"], "off")
        self.use_engine()
        t = self.recorded()
        speech.TRANSCRIBER.start(t["id"])
        self.assertEqual(self.wait(t["id"])["transcript"]["engine"], "workbench")
        self.assertEqual(h.calls, [])

    def test_hermes_fails_and_there_is_no_faster_whisper(self):
        self.use_hermes(stt={"provider": "groq"}, result={"success": False, "error": "No STT provider available."})
        self.fake_wav()
        t = self.recorded()
        got = self.press(t, engine=False)
        self.assertEqual(got["transcript"]["status"], "unavailable")  # the page shows how to set up speech-to-text
        self.assertEqual(got["stats"]["speaking"], 20.0)
        self.assertTrue(got["file"])  # kept for Transcribe now

    def test_the_temp_wav_is_deleted_even_when_hermes_raises(self):
        self.use_hermes(stt={"provider": "groq"}, raises=RuntimeError("boom"))
        made = self.fake_wav()
        t = self.recorded()
        self.press(t)
        self.assertTrue(made and not made[0].exists())
        self.assertEqual(list((store.data_dir() / "tmp").iterdir()), [])


class HermesLocalModel(WithHermes):
    """Hermes's local faster-whisper downloads its model into the shared cache on a miss. The workbench
    lets it run on its own only when that model is already there."""

    def test_hermes_local_without_its_model_is_not_run_and_nothing_downloads(self):
        h = self.use_hermes(stt={"provider": "local", "local": {"model": "small"}})
        self.faster_whisper_installed()
        plan = speech.hermes_plan()
        self.assertEqual((plan["usable"], plan["reason"], plan["model"], plan["local"]), (False, "model", "small", True))
        speech.TRANSCRIBER = api.speech.TRANSCRIBER = speech.Transcriber()
        t = self.recorded()
        speech.TRANSCRIBER.start(t["id"])
        tr = self.wait(t["id"])["transcript"]
        self.assertEqual(tr["status"], "failed")
        self.assertIn("Press Transcribe now", tr["error"])  # the workbench's own model, with its size
        self.assertEqual((h.calls, self.downloads), ([], []))

    def test_hermes_local_with_its_model_on_this_computer_runs(self):
        h = self.use_hermes(stt={"local": {"model": "small"}}, result={"success": True, "transcript": "words", "provider": "local"})
        self.faster_whisper_installed()
        hub = Path(os.environ["XDG_CACHE_HOME"]) / "huggingface" / "hub"
        complete_model(hub / "models--Systran--faster-whisper-small" / "snapshots" / "rev1")
        plan = speech.hermes_plan()
        self.assertTrue(plan["usable"])
        self.fake_wav()
        self.use_engine()
        t = self.recorded()
        speech.TRANSCRIBER.start(t["id"])
        tr = self.wait(t["id"])["transcript"]
        self.assertEqual((tr["engine"], tr["provider"], tr["local"]), ("hermes", "local", True))
        self.assertEqual(len(h.calls), 1)

    def test_hermes_default_local_model_is_base(self):
        self.use_hermes(stt={})
        self.faster_whisper_installed()
        self.assertEqual(speech.hermes_plan()["model"], "base")

    def test_hermes_local_on_a_dangling_shared_cache_is_not_run(self):
        xdg = Path(os.environ["XDG_CACHE_HOME"])
        (xdg / "huggingface").symlink_to(f"/Volumes/LDW Missing {os.getpid()}/huggingface")
        self.use_hermes(stt={"provider": "local"})
        self.faster_whisper_installed()
        self.assertEqual(speech.hermes_plan()["reason"], "model")

    def test_auto_with_no_local_backend_lets_hermes_decide(self):
        sys.modules.pop("faster_whisper", None)
        self.use_hermes(stt={})
        plan = speech.hermes_plan()
        self.assertTrue(plan["usable"])
        self.assertIsNone(plan["local"])  # Hermes picks a local command or a cloud key at run time


class SettingsSeeTheRoute(WithHermes):
    def test_home_says_which_speech_to_text_makes_transcripts(self):
        self.use_hermes(stt={"provider": "elevenlabs"})
        st = run(api.get_home())["transcripts"]
        self.assertTrue(st["available"])
        self.assertEqual((st["hermes"]["usable"], st["hermes"]["local"], st["hermes"]["label"]), (True, False, "ElevenLabs"))
        self.assertIn("own_folder_writable", st)


class CloudWaitsForThePress(WithHermes):
    """A take goes to a speech-to-text that may be off this computer only after the student presses
    Transcribe now on a take that has said where it goes. Fails closed: no press, no ask, a changed
    provider or a retry all mean nothing is sent."""

    def arrive(self, t):
        """The recording arrives the way the page sends it, through the plugin's own route."""
        import base64
        b64 = base64.b64encode(b"\x1a\x45\xdf\xa3webm-bytes").decode("ascii")
        return run(api.post_take_audio(t["id"], {"b64": b64, "mime": "audio/webm"}))

    def blank(self):
        return speech.new_take({"event": "drill", "limit": 60, "duration": 21, "levels": levels(1, 20)})

    def test_no_cloud_provider_gets_a_take_without_the_press(self):
        for provider, label in (("openai", "OpenAI"), ("nous", "OpenAI"), ("groq", "Groq"), ("mistral", "Mistral"),
                                ("xai", "xAI"), ("elevenlabs", "ElevenLabs"), ("deepinfra", "DeepInfra")):
            with self.subTest(provider=provider):
                h = self.use_hermes(stt={"provider": provider})
                made = self.fake_wav()
                self.use_engine(engine=False)
                out = self.arrive(self.blank())
                self.wait(out["id"])
                tr = run(api.get_take(out["id"]))["transcript"]
                self.assertEqual(h.calls, [])  # Hermes's speech-to-text was never called
                self.assertEqual(made, [])  # the recording was not even converted for sending
                self.assertEqual((tr["status"], tr["ask"], tr["send_label"], tr["send_local"]), ("failed", "send", label, False))
                self.assertIn(f"Press Transcribe now to send it to {label}", tr["error"])
                self.assertIn("still only on this computer", tr["error"])
                h.remove()
                self.hermes = None

    def test_auto_detect_and_plugin_providers_wait_too(self):
        sys.modules.pop("faster_whisper", None)
        for stt, named in (({}, "the speech-to-text set up in Hermes"), ({"provider": "acme"}, "acme, the speech-to-text set up in Hermes")):
            with self.subTest(stt=stt):
                h = self.use_hermes(stt=stt)
                self.use_engine(engine=False)
                out = self.arrive(self.blank())
                tr = speech.get_take(out["id"])["transcript"]
                self.assertEqual(h.calls, [])
                self.assertEqual(tr["ask"], "send")
                self.assertIsNone(tr["send_local"])
                self.assertIn(f"send it to {named}. That may be a service on the internet.", tr["error"])
                h.remove()
                self.hermes = None

    def test_the_press_is_honored(self):
        h = self.use_hermes(stt={"provider": "openai"}, result={"success": True, "transcript": "Yes, through the budget.", "provider": "openai"})
        self.fake_wav()
        self.use_engine(engine=False)
        t = self.arrive(self.blank())
        self.assertEqual(h.calls, [])
        out = run(api.post_take_transcribe(t["id"]))  # the Transcribe now button
        tr = self.wait(out["id"])["transcript"]
        self.assertEqual(len(h.calls), 1)
        self.assertEqual((tr["status"], tr["provider"], tr["local"], tr["label"]), ("done", "openai", False, "OpenAI"))
        self.assertNotIn("ask", tr)

    def test_a_press_the_take_did_not_ask_for_is_not_consent(self):
        """A take stopped mid-way, or one that failed for another reason, has not said where it would go.
        Its press asks first; only the next press sends."""
        h = self.use_hermes(stt={"provider": "groq"})
        self.fake_wav()
        self.use_engine(engine=False)
        t = self.recorded()
        speech.change_take(t["id"], lambda x: x["transcript"].update(status="cancelled"))
        out = run(api.post_take_transcribe(t["id"]))
        self.assertEqual(h.calls, [])
        self.assertEqual(out["transcript"]["ask"], "send")
        run(api.post_take_transcribe(t["id"]))
        self.wait(t["id"])
        self.assertEqual(len(h.calls), 1)

    def test_a_provider_changed_after_the_ask_asks_again(self):
        h = self.use_hermes(stt={"provider": "groq"})
        self.fake_wav()
        self.use_engine(engine=False)
        t = self.arrive(self.blank())
        h.stt["provider"] = "openai"  # the adult changed Hermes Settings, Voice in between
        out = run(api.post_take_transcribe(t["id"]))
        self.assertEqual(h.calls, [])
        self.assertIn("send it to OpenAI", out["transcript"]["error"])
        run(api.post_take_transcribe(t["id"]))
        self.wait(t["id"])
        self.assertEqual(len(h.calls), 1)

    def test_every_take_and_every_retry_asks_again(self):
        h = self.use_hermes(stt={"provider": "groq"}, result={"success": False, "error": "rate limited"})
        self.fake_wav()
        self.use_engine(engine=False)
        t = self.arrive(self.blank())
        run(api.post_take_transcribe(t["id"]))
        self.assertEqual(self.wait(t["id"])["transcript"]["status"], "unavailable")
        self.assertEqual(len(h.calls), 1)
        out = run(api.post_take_transcribe(t["id"]))  # one press sent it once; trying again asks again
        self.assertEqual((out["transcript"]["ask"], len(h.calls)), ("send", 1))
        second = self.arrive(self.blank())  # and a new take asks for itself
        self.assertEqual((speech.get_take(second["id"])["transcript"]["ask"], len(h.calls)), ("send", 1))

    def test_delete_transcripts_clears_the_ask(self):
        h = self.use_hermes(stt={"provider": "groq"})
        self.use_engine(engine=False)
        t = self.arrive(self.blank())
        run(api.post_data_delete())
        self.assertNotIn("ask", speech.get_take(t["id"])["transcript"])
        run(api.post_take_transcribe(t["id"]))  # the take says DELETED, not where it goes: this press asks
        self.assertEqual(h.calls, [])

    def test_the_worker_refuses_a_cloud_plan_without_the_press(self):
        """Defense in depth: even handed a cloud plan directly, the worker does not call Hermes unless the
        plan carries the press."""
        h = self.use_hermes(stt={"provider": "groq"})
        self.fake_wav()
        t = self.recorded()
        plan = speech.hermes_plan()
        path = speech.audio_path(speech.get_take(t["id"]))
        with self.assertRaises(speech.Unavailable):
            speech.Transcriber(None)._transcribe(path, speech.DEFAULT_MODEL, True, plan)
        r = self.use_engine()._transcribe(path, speech.DEFAULT_MODEL, True, plan)
        self.assertEqual((r["engine"], r["local"], h.calls), ("workbench", True, []))
        r = speech.Transcriber(None)._transcribe(path, speech.DEFAULT_MODEL, True, dict(plan, pressed=True))
        self.assertEqual((r["engine"], len(h.calls)), ("hermes", 1))

    def test_the_workbench_model_on_this_computer_needs_no_press_and_sends_nothing(self):
        h = self.use_hermes(stt={"provider": "openai"})
        self.faster_whisper_installed()
        complete_model(speech.own_model_dir(speech.DEFAULT_MODEL))
        speech.TRANSCRIBER = api.speech.TRANSCRIBER = speech.Transcriber()
        self.assertTrue(speech.TRANSCRIBER.own_ready(speech.DEFAULT_MODEL))
        st = run(api.get_home())["transcripts"]
        self.assertEqual((st["own_ready"], st["press_first"]), (True, False))
        self.use_engine()  # the stand-in for that model, so nothing loads for real
        t = self.arrive(self.blank())
        tr = self.wait(t["id"])["transcript"]
        self.assertEqual((tr["status"], tr["engine"], tr["local"]), ("done", "workbench", True))
        self.assertEqual(h.calls, [])

    def test_settings_say_takes_wait_for_the_press(self):
        self.use_hermes(stt={"provider": "groq"})
        st = run(api.get_home())["transcripts"]
        self.assertEqual((st["press_first"], st["own_ready"]), (True, False))
        src = (Path(__file__).resolve().parents[1] / "desktop" / "plugin.js").read_text(encoding="utf-8")
        self.assertIn("only when you press Transcribe now on that take. Every take asks first.", src)
        self.assertIn('"Not sent yet"', src)
        self.assertNotIn("Each recording goes to", src)  # the old always-sends wording is gone

    def test_hermes_local_still_needs_no_press(self):
        h = self.use_hermes(stt={"provider": "local_command"}, result={"success": True, "transcript": "words", "provider": "local_command"})
        sys.modules.pop("faster_whisper", None)
        self.fake_wav()
        self.use_engine(engine=False)
        t = self.arrive(self.blank())
        tr = self.wait(t["id"])["transcript"]
        self.assertEqual((tr["status"], tr["local"], len(h.calls)), ("done", True, 1))


class DeleteTranscriptsAndBallots(WithHermes):
    def test_one_press_deletes_every_transcript_and_ballot_and_keeps_the_rest(self):
        from _load import ballots, library
        self.use_engine()
        t = self.recorded()
        speech.TRANSCRIBER.start(t["id"])
        self.wait(t["id"])
        typed = speech.new_take({"event": "extemp", "limit": 420, "typed": True, "text": "my typed speech about the Fed", "answer": "prices"})
        ballots.add({"event": "drill", "points": 27, "summary": "clear"})
        ballots.add({"event": "ld", "points": 28, "summary": "won"})
        store.write("round.json", {"speeches": [{"text": "the student's 1AC"}]})
        store.write("extemp_round.json", {"phase": "speak", "take": t["id"]})
        library.create("Civil disobedience", "Resolved: civil disobedience is justified.", "aff")
        files_before = sorted(p.name for p in (store.data_dir() / "recordings").iterdir())
        out = run(api.post_data_delete())
        self.assertEqual((out["transcripts"], out["ballots"]), (2, 2))
        self.assertTrue(out["round_ended"])
        for tid in (t["id"], typed["id"]):
            got = speech.get_take(tid)
            self.assertEqual(got["transcript"]["text"], "")
            self.assertEqual(got["transcript"]["words"], [])
            self.assertEqual(got["answer"], "")
            self.assertNotIn("wpm", got["stats"])
        self.assertEqual(speech.get_take(t["id"])["transcript"]["error"], speech.DELETED)  # can be made again from the recording
        self.assertEqual(speech.get_take(t["id"])["stats"]["speaking"], 20.0)  # timing stays
        self.assertEqual(ballots.history(), [])
        self.assertIsNone(store.read("round.json"))
        self.assertIsNone(store.read("extemp_round.json"))
        self.assertEqual(sorted(p.name for p in (store.data_dir() / "recordings").iterdir()), files_before)  # recordings stay
        self.assertEqual(len(library.list_cases()), 1)  # cases stay
        home = run(api.get_home())
        self.assertEqual((home["ballots"], home["transcripts_kept"]), (0, 0))

    def test_a_transcript_in_progress_does_not_come_back(self):
        import threading
        gate = threading.Event()
        speech.TRANSCRIBER = api.speech.TRANSCRIBER = speech.Transcriber(lambda p, m: (gate.wait(2), {"text": "late words", "words": []})[1])
        t = self.recorded()
        speech.TRANSCRIBER.start(t["id"])
        run(api.post_data_delete())
        gate.set()
        got = self.wait(t["id"])
        self.assertEqual(got["transcript"]["text"], "")


if __name__ == "__main__":
    unittest.main()

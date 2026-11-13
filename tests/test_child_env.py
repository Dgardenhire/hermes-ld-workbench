"""The two outside programs the plugin starts (the speech-model download and ffmpeg) get an explicit, minimal
environment, never the whole one: a provider key in this process must not reach them. Nothing here downloads a
model or runs ffmpeg; subprocess.run is replaced."""
import os
import subprocess as sp
import sys
import unittest
from pathlib import Path

from _load import reset, speech


class ChildEnv(unittest.TestCase):
    def setUp(self):
        reset()
        self.tmp = os.environ["LDW_DATA_DIR"]
        self.saved = dict(os.environ)
        # Assembled at run time: no key-shaped text lives in this file.
        self.secret_name = "OPENAI_" + "API_KEY"
        self.other_secret = "ANTHROPIC_" + "API_KEY"
        os.environ[self.secret_name] = "not-a-real-value-1"
        os.environ[self.other_secret] = "not-a-real-value-2"
        os.environ["HF_TOKEN"] = "not-a-real-value-3"
        os.environ["PATH"] = os.environ.get("PATH") or "/usr/bin"
        os.environ["LANG"] = "en_US.UTF-8"
        os.environ["LC_ALL"] = "en_US.UTF-8"
        os.environ["HTTPS_PROXY"] = "http://proxy.example:3128"
        os.environ["SSL_CERT_FILE"] = "/etc/ssl/cert.pem"

    def tearDown(self):
        os.environ.clear()
        os.environ.update(self.saved)

    def _download_env(self):
        seen = {}

        def fake_run(argv, **kw):
            seen.update(argv=argv, **kw)
            return sp.CompletedProcess(argv, 1, "", "stopped by the test")
        old = speech.subprocess.run
        speech.subprocess.run = fake_run
        try:
            with self.assertRaises(speech.DownloadFailed):
                speech.download_model("base.en")
        finally:
            speech.subprocess.run = old
        return seen["env"]

    def _ffmpeg_env(self):
        seen = {}

        def fake_run(argv, **kw):
            seen.update(argv=argv, **kw)
            return sp.CompletedProcess(argv, 0, b"", b"")
        old_run, old_which = speech.subprocess.run, speech.shutil.which
        speech.subprocess.run = fake_run
        speech.shutil.which = lambda name: "/usr/bin/ffmpeg"
        try:
            speech._wav_with_ffmpeg(Path(self.tmp) / "in.webm", Path(self.tmp) / "out.wav")
        finally:
            speech.subprocess.run, speech.shutil.which = old_run, old_which
        return seen["env"]

    def test_the_model_download_does_not_get_provider_keys(self):
        env = self._download_env()
        for name in (self.secret_name, self.other_secret, "HF_TOKEN"):
            self.assertNotIn(name, env)
        self.assertEqual(env["PATH"], os.environ["PATH"])
        self.assertEqual(env["LANG"], "en_US.UTF-8")
        self.assertEqual(env["LC_ALL"], "en_US.UTF-8")
        self.assertEqual(env["HTTPS_PROXY"], "http://proxy.example:3128")
        self.assertEqual(env["SSL_CERT_FILE"], "/etc/ssl/cert.pem")
        self.assertEqual(env["HF_HUB_DISABLE_IMPLICIT_TOKEN"], "1")  # the plugin's own settings still go in

    def test_the_download_environment_holds_only_what_it_needs(self):
        os.environ["SOME_OTHER_SETTING"] = "x"
        env = self._download_env()
        allowed = set(speech._DOWNLOAD_ENV_VARS) | {"HF_HOME", "HF_HUB_CACHE", "HF_XET_CACHE", "HF_HUB_DISABLE_TELEMETRY",
                                                    "HF_HUB_DISABLE_PROGRESS_BARS", "HF_HUB_DISABLE_IMPLICIT_TOKEN"}
        extra = {k for k in env if k not in allowed and not k.startswith("LC_")}
        self.assertEqual(extra, set())

    def test_ffmpeg_does_not_get_provider_keys(self):
        env = self._ffmpeg_env()
        self.assertNotIn(self.secret_name, env)
        self.assertNotIn(self.other_secret, env)
        self.assertEqual(env["PATH"], os.environ["PATH"])
        self.assertEqual(env["LANG"], "en_US.UTF-8")
        self.assertLessEqual({k.upper() for k in env}, {"PATH", "LANG", "SYSTEMROOT"})

    def test_the_download_is_pinned_to_one_commit(self):
        for name in speech.MODELS:
            rev = speech.MODEL_REVISIONS[name]
            self.assertRegex(rev, r"^[0-9a-f]{40}$")
        seen = {}

        def fake_run(argv, **kw):
            seen.update(argv=argv)
            return sp.CompletedProcess(argv, 1, "", "stopped by the test")
        old = speech.subprocess.run
        speech.subprocess.run = fake_run
        try:
            with self.assertRaises(speech.DownloadFailed):
                speech.download_model("small.en")
        finally:
            speech.subprocess.run = old
        self.assertEqual(seen["argv"][6], speech.MODEL_REVISIONS["small.en"])
        self.assertNotEqual(speech.MODEL_REVISIONS["small.en"], speech.MODEL_REVISIONS["base.en"])


if __name__ == "__main__":
    unittest.main()

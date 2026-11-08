"""Hearing the opponent: the user's own Hermes voice reads an AI speech; cached by its words; every failure plain."""
import json
import unittest
from pathlib import Path

from _load import HTTPException, api, reset, room, run, speech, store

NC = ("Their definition also includes gene editing, so an example involving cloning does not automatically "
      "establish the welfare consequences of every approach. I negate.")


def save_round():
    r = room.new_round(side="aff", level="jv", judge="traditional", resolution="Resolved: De-extinction is unethical.",
                       case={}, round_no=1)
    r["transcript"] = [{"id": "AC", "speaker": "student", "side": "aff", "text": "My case. " * 10},
                       {"id": "NC", "speaker": "ai", "side": "neg", "text": NC}]
    store.write("round.json", r)
    return r


class Listen(unittest.TestCase):
    def setUp(self):
        reset()
        self.old = api.SPEAK
        self.calls = []

        def synth(text, out):
            self.calls.append(text)
            Path(out).write_bytes(b"ID3fakeaudio")
            return json.dumps({"success": True, "file_path": out, "file_paths": [out]})
        api.SPEAK = synth

    def tearDown(self):
        api.SPEAK = self.old

    def test_reads_and_caches(self):
        save_round()
        a = run(api.post_round_listen({"speech_id": "NC"}))
        self.assertEqual(a["parts"][0]["mime"], "audio/mpeg")
        self.assertFalse(a["cached"])
        b = run(api.post_round_listen({"speech_id": "NC"}))
        self.assertTrue(b["cached"])
        self.assertEqual(len(self.calls), 1)

    def test_only_the_opponents_speeches(self):
        save_round()
        with self.assertRaises(HTTPException):
            run(api.post_round_listen({"speech_id": "AC"}))
        with self.assertRaises(HTTPException):
            run(api.post_round_listen({"speech_id": "NR"}))

    def test_voice_not_set_up(self):
        save_round()
        api.SPEAK = lambda t, o: {"error": "Unknown tool: text_to_speech"}
        with self.assertRaises(HTTPException) as e:
            run(api.post_round_listen({"speech_id": "NC"}))
        self.assertIn("Hermes Settings, Voice", e.exception.detail)

    def test_failed_and_missing_file(self):
        with self.assertRaises(ValueError):
            speech.parse_tts('{"success": false, "error": "provider exploded"}')
        with self.assertRaises(ValueError):
            speech.parse_tts('{"success": true, "file_path": "/nowhere/x.mp3"}')
        with self.assertRaises(ValueError):
            speech.parse_tts("nonsense")

    def test_keeps_only_the_newest(self):
        for i in range(speech.VOICE_KEEP + 3):
            speech.opponent_audio(f"speech number {i} " + "word " * 30, api.SPEAK)
        self.assertLessEqual(len(list(speech._voice_dir().iterdir())), speech.VOICE_KEEP)


if __name__ == "__main__":
    unittest.main()

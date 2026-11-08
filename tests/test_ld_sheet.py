"""The Lincoln-Douglas ballot sheet: the judge's quoted lines are checked against the speeches."""
import unittest

from _load import engine

ROUND = [
    {"id": "AC", "speaker": "student", "text": "I value morality. Cloning causes serious suffering, as the bucardo shows."},
    {"id": "NC", "speaker": "ai", "text": "Their definition also includes gene editing, so an example of harm is not enough."},
]


class LdLines(unittest.TestCase):
    def check(self, speech, line):
        return engine.check_ld_lines(ROUND, [{"speech": speech, "line": line}])[0]["checked"]

    def test_exact_line_in_named_speech(self):
        self.assertTrue(self.check("AC", "Cloning causes serious suffering"))

    def test_elided_line_checks_each_piece(self):
        self.assertTrue(self.check("NC", "Their definition also includes gene editing, so an example..."))
        self.assertTrue(self.check("nc", "Their definition also includes ... is not enough"))

    def test_invented_line_is_flagged(self):
        self.assertFalse(self.check("AC", "Cloning is always wrong in every case"))

    def test_wrong_speech_named_still_found_in_round(self):
        self.assertTrue(self.check("1AR", "the bucardo shows"))

    def test_too_short_to_check(self):
        self.assertIsNone(self.check("AC", "Yes."))

    def test_empty_round(self):
        self.assertFalse(engine.check_ld_lines([], [{"speech": "AC", "line": "three whole words"}])[0]["checked"])


if __name__ == "__main__":
    unittest.main()

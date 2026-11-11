"""The Round page's count and Last ballot card are Lincoln-Douglas only: Extemp and drill ballots share the history,
and one showed on the Round page as "Decided on undefined" in the Nov 11 live check."""
import pathlib
import sys
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from _load import ROOT, api  # noqa: E402


class RoundHistory(unittest.TestCase):
    def test_only_lincoln_douglas_ballots_count(self):
        ld = {"event": "ld", "decision": "neg", "decisive": [{"speech": "NR", "line": "x"}]}
        old_ld = {"decision": "aff"}  # ballots from before the event field are LD
        drill = {"event": "drill", "decisive": [{"line": "Slow growth is the bigger risk"}]}
        view = api._history_view({"history": [old_ld, ld, drill]})
        self.assertEqual(view["count"], 2)
        self.assertIs(view["last"], ld)
        self.assertEqual(api._history_view({"history": [drill]}), {"rounds_started": 0, "count": 0, "last": None})

    def test_card_never_prints_undefined_for_a_missing_speech(self):
        src = (ROOT / "desktop" / "src" / "plugin.js").read_text()
        self.assertIn("first.speech ? `${first.speech}:", src)


if __name__ == "__main__":
    unittest.main()

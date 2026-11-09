"""The bundled skill, debate-coach. Removable in one commit: delete skills/ and this file."""
import unittest

from _load import ROOT


class Skill(unittest.TestCase):
    def test_short_and_names_the_rule_and_the_tools(self):
        text = (ROOT / "skills" / "debate-coach" / "SKILL.md").read_text()
        self.assertTrue(text.startswith("---\nname: debate-coach\n"))
        self.assertLess(len(text.split()), 700)
        for must in ("tries first", "debate_record", "debate_today", "2AR", "30 minutes", "Settings"):
            self.assertIn(must, text)


if __name__ == "__main__":
    unittest.main()

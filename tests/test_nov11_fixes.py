"""Nov 11, 2026 fixes: the ballot speaks to the student as "you", plain words for debate terms, the direction of
each pattern on the Ballots page, and claims that say exactly what the code does."""
import re
import unittest

from _load import ROOT, ballots, engine, extemp

SRC = {p.name: p.read_text(encoding="utf-8") for p in (ROOT / "desktop" / "src").glob("*.js")}


class SpeaksToYou(unittest.TestCase):
    def test_ld_judge_is_told_to_write_to_you(self):
        self.assertIn('"you"', engine.YOU_RULE)
        self.assertIn("Never call them \"the student\"", engine.YOU_RULE)
        self.assertIn("exact words", engine.YOU_RULE)  # the quoted lines are never rewritten

    def test_extemp_judge_fix_and_openings_say_you(self):
        prompt = extemp.JUDGE_PROMPT.format(tags="x", points=extemp.POINTS_SCALE)
        self.assertIn('Write the whole ballot to the student, as "you"', prompt)
        self.assertIn('Speak to the student as "you"', engine.FIX_NOTES)
        self.assertIn('Speak to the student as "you"', extemp.OPENINGS_PROMPT)

    def test_quote_check_still_reads_the_students_words(self):
        said = "Prices matter more right now because rent and groceries are up for every family I know."
        lines = engine.check_lines(said, [{"line": "rent and groceries are up", "effect": "You tie it to families."},
                                          {"line": "the student says jobs", "effect": "x"}])
        self.assertEqual([d["checked"] for d in lines], [True, False])
        rnd = [{"id": "AC", "speaker": "student", "text": "I value justice because it gives each person their due."}]
        out = engine.check_ld_lines(rnd, [{"speech": "AC", "line": "justice because it gives"}, {"speech": "AC", "line": "my due"}])
        self.assertEqual([d["checked"] for d in out], [True, None])  # a line under three words is left unchecked


class PlainWords(unittest.TestCase):
    def test_every_term_has_one_plain_sentence(self):
        src = SRC["terms.js"]
        for key in ("ac", "nc", "'1ar'", "nr", "'2ar'", "cx", "card", "value", "criterion", "flow", "'circuit judge'", "'saved sources'"):
            self.assertRegex(src, rf"\n  {re.escape(key)}: '[^\n]*\.',?\n", key)

    def test_labels_carry_the_meaning(self):
        self.assertIn("title: termFor(s.code)", SRC["floor.js"])  # every strip: AC 6:00, CX 3:00 ...
        self.assertIn("title: termFor(d.speech)", SRC["floor.js"])  # the speech code on a quoted LD line
        self.assertIn("'Saved sources you named'", SRC["floor.js"])
        self.assertNotIn("Filed sources named", SRC["floor.js"])
        for bit in ("term: 'flow'", "jsx(Term, { term: k", "termFor('card')", "termFor('circuit judge')", "termFor(s.id)"):
            self.assertIn(bit, SRC["plugin.js"], bit)

    def test_term_lookup_reads_codes_with_times(self):
        import shutil, subprocess
        node = shutil.which("node")
        if not node:
            self.skipTest("node is not installed")
        js = ("const src = require('fs').readFileSync(process.argv[1], 'utf8').replace(/^import .*$/m, 'const jsx = () => null')"
              ".replace(/export /g, ''); eval(src + ';globalThis.t = termFor');"
              "console.log(JSON.stringify(['AC 6:00', 'CX2', 'CX 3:00', '2AR 3:00', 'Criterion', 'Prep 30:00'].map(x => !!t(x))))")
        out = subprocess.run([node, "-e", js, str(ROOT / "desktop" / "src" / "terms.js")], capture_output=True, text=True, timeout=30)
        self.assertEqual(out.stdout.strip(), "[true,true,true,true,true,false]", out.stderr)

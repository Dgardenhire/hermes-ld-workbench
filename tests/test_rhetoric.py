"""Rhetoric: Clearing's definitions, real examples, and the device finder's exact-quote check."""
import json
import random
import re
import unittest
from pathlib import Path

from _load import HTTPException, R, api, fake_model, reset, run

CLEARING_PATHS = Path.home() / "Documents/Codex/2026-09-06/https-every-to-guides-compound-writing/outputs/writing-bench/shared/craft-paths.js"


class Data(unittest.TestCase):
    def test_every_example_is_an_exact_line_from_its_speech(self):
        texts = {s["id"]: s["text"] for s in R.speeches()}
        works = {w["id"]: w["text"] for w in R.WORKS}
        for item in R.FIGURES + R.APPEALS + [R.KAIROS]:
            ex = item.get("example")
            if ex:
                self.assertEqual(len({"speech", "work"} & set(ex)), 1, item["id"])
                text = texts[ex["speech"]] if "speech" in ex else works[ex["work"]]
                self.assertIsNotNone(R.find_span(text, ex["quote"]), item["id"])

    def test_books_are_public_domain_and_used_only_where_no_speech_will_do(self):
        for w in R.WORKS:
            self.assertLess(w["year"], 1929, w["id"])
            self.assertIn("Project Gutenberg", w["source"])
        from_books = sorted(f["id"] for f in R.FIGURES if f["example"] and "work" in f["example"])
        self.assertEqual(from_books, ["syllepsis", "zeugma"])
        self.assertEqual({w["id"] for w in R.config()["works"]}, R.WORK_IDS)
        self.assertTrue(all(R.spot_item(__import__("random").Random(n))["speech"]["id"] for n in range(60)))  # Spot never draws a book line

    def test_library_is_public_domain_speeches_only(self):
        for s in R.speeches():
            self.assertTrue(s["year"] < 1929 or s["speaker"] == "Franklin D. Roosevelt", s["id"])
        self.assertFalse(any("King" in s["speaker"] or "Churchill" in s["speaker"] for s in R.speeches()))
        self.assertTrue(R.speech("anthony-vote")["text"].startswith("Friends and fellow citizens:"))

    def test_six_effect_groups_like_the_clearing(self):
        self.assertEqual([e["title"] for e in R.EFFECTS], ["Sound & verbal music", "Repetition & return", "Balance, contrast & threes",
                                                           "Sentence order & syntax", "Image, sense & substitution", "Interruption, scale & force"])
        self.assertTrue(all(f["effect"] in {e["id"] for e in R.EFFECTS} for f in R.FIGURES))
        self.assertEqual(len({f["id"] for f in R.FIGURES}), len(R.FIGURES))

    @unittest.skipUnless(CLEARING_PATHS.exists(), "The Clearing's source is not on this computer")
    def test_clearing_definitions_are_word_for_word(self):
        src = CLEARING_PATHS.read_text(encoding="utf-8").lower()
        for f in R.FIGURES:
            if f["source"] == R.CLEARING:
                gloss = f["definition"].rstrip(".").lower()
                self.assertIn(gloss, src, f["id"])
        effects = re.findall(r"title:'([^']+)'", CLEARING_PATHS.read_text(encoding="utf-8"))
        for e in R.EFFECTS:
            self.assertIn(e["title"], effects)

    @unittest.skipUnless(CLEARING_PATHS.exists(), "The Clearing's source is not on this computer")
    def test_each_gloss_sits_on_the_same_figure_as_in_the_clearing(self):
        """The Clearing lists a focus's figures in its detail line and their glosses, in the same order, in
        its prompt. Where the two lists are the same length, each figure must carry its own gloss, not a
        neighbour's (a substring check over the whole file cannot see a swap)."""
        src = CLEARING_PATHS.read_text(encoding="utf-8")
        by_name = {f["name"].lower(): f for f in R.FIGURES}
        by_name.update({"periodic suspense": by_name["periodic sentence"], "verbless phrasing": by_name["scesis onomaton"],
                        "exact number": by_name["the exact number"]})
        checked = 0
        for detail, prompt in re.findall(r"detail:'(?:Use|Test) ([^']+?)(?: to [^']*)?\.',prompt:`[^:`]*?: ([^`]+?)\. ", src):
            names = [n.strip() for n in re.split(r",\s*(?:or\s+)?|\s+or\s+", detail) if n.strip()]
            glosses = [g.strip() for g in re.split(r",\s*(?:or\s+)?|\s+or\s+", prompt) if g.strip()]
            if len(names) != len(glosses) or not all(n.lower() in by_name for n in names):
                continue
            for n, g in zip(names, glosses):
                f = by_name[n.lower()]
                if f["source"] == R.CLEARING:
                    self.assertEqual(f["definition"].rstrip(".").lower(), g.lower(), n)
                    checked += 1
        self.assertGreaterEqual(checked, 14)  # repetition (7), interruption (8), and more as The Clearing grows

    def test_shared_glosses_are_only_the_known_pairs(self):
        """Two figures with one gloss read as a mistake on the figure list. Zeugma and syllepsis share one in
        The Clearing itself; merism and synecdoche share one because The Clearing gives eight image figures
        only seven glosses. Both pairs are listed in docs/STATUS.md for Damon; nothing else may collide."""
        seen = {}
        for f in R.FIGURES:
            seen.setdefault(f["definition"].lower(), []).append(f["id"])
        shared = sorted(sorted(v) for v in seen.values() if len(v) > 1)
        self.assertEqual(shared, [["merism", "synecdoche"], ["syllepsis", "zeugma"]])

    def test_no_text_from_forsyth(self):
        self.assertEqual(R.FURTHER_READING, "Mark Forsyth, The Elements of Eloquence (2013)")
        for f in R.FIGURES:
            if f["example"]:
                self.assertTrue(f["example"].get("speech") in {s["id"] for s in R.speeches()} or f["example"].get("work") in R.WORK_IDS, f["id"])


class Finder(unittest.TestCase):
    TEXT = "We can not dedicate, we can not consecrate,\n  we can not hallow this ground. It's “ours” now."

    def test_exact_quotes_only(self):
        marks, dropped = R.check_marks(self.TEXT, [
            {"figure": "Anaphora", "quote": "we can not dedicate, we can not consecrate, we can not hallow", "why": "w"},  # case differs
            {"figure": "Tricolon", "quote": "We can not dedicate, we can not consecrate, we can not hallow", "why": "w"},  # spacing differs
            {"figure": "Anaphora", "quote": "we shall fight on the beaches", "why": "invented"},
            {"figure": "Snark", "quote": "this ground", "why": "not a figure"},
            {"figure": "pathos", "quote": "It's \"ours\" now", "why": "curly quotes folded"},
            "garbage",
        ])
        self.assertEqual([m["figure"] for m in marks], ["tricolon", "pathos"])
        self.assertEqual(dropped, 4)
        self.assertEqual(marks[0]["quote"], "We can not dedicate, we can not consecrate,\n  we can not hallow")  # the student's own text
        self.assertEqual(marks[1]["kind"], "appeal")
        self.assertEqual(self.TEXT[marks[0]["start"]:marks[0]["end"]], marks[0]["quote"])

    def test_names_and_aliases(self):
        self.assertEqual(R.resolve_kind("Rhetorical Question"), "rhetorical-question")
        self.assertEqual(R.resolve_kind("simile"), "metaphor")
        self.assertEqual(R.resolve_kind("scesis-onomaton"), "scesis-onomaton")
        self.assertIsNone(R.resolve_kind(""))

    def test_cap_and_duplicates(self):
        text = " ".join(f"line number {i} here." for i in range(60))
        marks, _ = R.check_marks(text, [{"figure": "Anaphora", "quote": f"line number {i} here"} for i in range(60)] * 2)
        self.assertEqual(len(marks), R.MAX_MARKS)

    def test_route_with_a_library_speech(self):
        reset()
        llm = fake_model()
        llm.queue.append(json.dumps({"marks": [{"figure": "Epistrophe", "quote": "of the people, by the people, for the people", "why": "w"},
                                               {"figure": "Anaphora", "quote": "made up words", "why": "x"}]}))
        out = run(api.post_rhetoric_marks({"speech_id": "gettysburg"}))
        self.assertEqual(out["counts"], {"epistrophe": 1})
        self.assertEqual(out["dropped"], 1)
        self.assertIn("Use only these names", llm.calls[-1]["system_prompt"])

    def test_short_paste_refused(self):
        with self.assertRaises(HTTPException):
            run(api.post_rhetoric_marks({"text": "too short"}))


class Drill(unittest.TestCase):
    def test_spot_item_has_one_right_answer_from_another_group(self):
        for seed in range(40):
            item = R.spot_item(random.Random(seed))
            self.assertIn(item["answer"], item["options"])
            self.assertEqual(len(set(item["options"])), 4)
            effects = [next(f for f in R.FIGURES if f["id"] == o)["effect"] for o in item["options"]]
            answer_effect = next(f for f in R.FIGURES if f["id"] == item["answer"])["effect"]
            self.assertEqual(effects.count(answer_effect), 1)

    def test_critique_never_writes_and_checks_the_figure(self):
        llm = fake_model()
        out = run(api.post_rhetoric_critique({"figure": "anaphora", "line": "We will work, we will vote, we will win."}))
        self.assertTrue(out["text"])
        self.assertIn("Never write a new line", llm.calls[-1]["messages"][0]["content"])
        with self.assertRaises(HTTPException):
            run(api.post_rhetoric_critique({"figure": "nope", "line": "We will work, we will vote."}))
        with self.assertRaises(HTTPException):
            run(api.post_rhetoric_critique({"figure": "anaphora", "line": "short"}))


if __name__ == "__main__":
    unittest.main()

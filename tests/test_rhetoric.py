"""Rhetoric: Clearing's definitions, real examples, and the device finder's exact-quote check."""
import json
import random
import re
import unittest
from pathlib import Path

from _load import HTTPException, R, api, fake_model, reset, run

HERMES_CLEARING = Path(__file__).resolve().parents[2] / "hermes-clearing"
CLEARING_AT = "0722112"  # hermes-clearing main when these definitions were copied (additions.json last changed in 3a97a48)


def clearing_file(path):
    """A file from The Clearing's repo, checked out beside this one, as it was at CLEARING_AT (read only)."""
    import subprocess
    return subprocess.run(["git", "-C", str(HERMES_CLEARING), "show", f"{CLEARING_AT}:{path}"],
                          capture_output=True, text=True, check=True).stdout


HAS_CLEARING = (HERMES_CLEARING / ".git").exists()


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
        self.assertEqual(from_books, ["syllepsis"])
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

    @unittest.skipUnless(HAS_CLEARING, "The Clearing's repo is not beside this one")
    def test_the_six_effect_groups_are_the_clearings(self):
        src = clearing_file("library/craft-paths.json")
        effects = {fc["title"] for pth in json.loads(src)["paths"] for fc in pth["focuses"]}
        for e in R.EFFECTS:
            self.assertIn(e["title"], effects)

    def clearing_figures(self):
        return {f[0]: f[1] for g in json.loads(clearing_file("library/additions.json"))["figures"]["groups"] for f in g["figures"]}

    @unittest.skipUnless(HAS_CLEARING, "The Clearing's repo is not beside this one")
    def test_every_shared_figure_matches_the_clearing_word_for_word(self):
        """Every figure the two products share carries The Clearing's definition exactly, as its figure list
        (library/additions.json) has it, and is marked CLEARING; every figure marked CLEARING is one The
        Clearing lists. All of The Clearing's figures are in the workbench."""
        theirs = self.clearing_figures()
        mine = {f["name"].lower(): f for f in R.FIGURES}
        self.assertEqual(len(theirs), 42)
        self.assertEqual(sorted(set(theirs) - set(mine)), [])  # none missing
        for name, definition in theirs.items():
            self.assertEqual(mine[name]["definition"], definition, name)
            self.assertEqual(mine[name]["source"], R.CLEARING, name)
        shared = [f for f in R.FIGURES if f["source"] == R.CLEARING]
        self.assertEqual(sorted(f["name"].lower() for f in shared), sorted(theirs))
        self.assertTrue(all(f["source"] == R.WORKBENCH for f in R.FIGURES if f["name"].lower() not in theirs))

    @unittest.skipUnless(HAS_CLEARING, "The Clearing's repo is not beside this one")
    def test_the_examples_stay_the_workbenchs_own_public_domain_lines(self):
        """The Clearing's examples are its own sentences; the workbench never borrows one."""
        theirs = {f[0]: f[2] for g in json.loads(clearing_file("library/additions.json"))["figures"]["groups"] for f in g["figures"]}
        for f in R.FIGURES:
            if f["example"]:
                self.assertNotEqual(f["example"]["quote"], theirs.get(f["name"].lower()), f["id"])
        quotes = [f["example"]["quote"] for f in R.FIGURES if f["example"]]
        self.assertEqual(len(set(quotes)), len(quotes))  # no two figures share an example
        by = {f["id"]: f for f in R.FIGURES}
        self.assertTrue(all(by[i]["example"] for i in ("merism", "syllepsis", "synecdoche", "zeugma")))

    def test_no_two_figures_share_a_definition(self):
        """Two figures with one gloss read as a mistake on the figure list. Zeugma and syllepsis, and merism
        and synecdoche, used to share one; The Clearing fixed both pairs on Nov 8, 2026."""
        seen = {}
        for f in R.FIGURES:
            seen.setdefault(f["definition"].lower(), []).append(f["id"])
        self.assertEqual(sorted(sorted(v) for v in seen.values() if len(v) > 1), [])

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

    def test_pasted_text_still_goes_to_the_model(self):
        reset()
        llm = fake_model()
        text = "We can not dedicate, we can not consecrate, we can not hallow this ground, and the brave men who struggled here did it."
        llm.queue.append(json.dumps({"marks": [{"figure": "Anaphora", "quote": "We can not dedicate, we can not consecrate", "why": "w"},
                                               {"figure": "Anaphora", "quote": "made up words", "why": "x"}]}))
        out = run(api.post_rhetoric_marks({"text": text}))
        self.assertEqual(out["counts"], {"anaphora": 1})
        self.assertEqual(out["dropped"], 1)
        self.assertIn("Use only these names", llm.calls[-1]["system_prompt"])

    def test_a_bundled_speech_is_marked_from_the_stored_notes_with_no_model(self):
        reset()
        llm = fake_model()
        out = run(api.post_rhetoric_marks({"speech_id": "gettysburg"}))
        self.assertEqual(llm.calls, [])
        self.assertTrue(out["stored"])
        self.assertEqual(out["text"], R.speech("gettysburg")["text"])
        self.assertEqual(out["counts"]["tricolon"], 2)
        for m in out["marks"]:
            self.assertEqual(out["text"][m["start"]:m["end"]], m["quote"])
            self.assertTrue(m["why"])

    def test_short_paste_refused(self):
        with self.assertRaises(HTTPException):
            run(api.post_rhetoric_marks({"text": "too short"}))


class Notes(unittest.TestCase):
    """The written notes: why each marked figure works in its own line (data/figure_notes.json)."""

    def test_every_bundled_speech_has_notes_and_every_note_is_exact(self):
        notes = R.figure_notes()["speeches"]
        self.assertEqual(set(notes), {s["id"] for s in R.speeches()})
        for sid, items in notes.items():
            text = R.speech(sid)["text"]
            self.assertGreaterEqual(len(items), 8, sid)
            for n in items:
                self.assertIn(n["figure"], R.FIGURE_IDS | R.APPEAL_IDS, (sid, n["figure"]))
                self.assertIsNotNone(R.find_span(text, n["quote"]), (sid, n["quote"]))
                # a quote that is found once, so the mark lands on the line the note is about
                norm = R._fold(" ".join(text.split()))
                self.assertEqual(norm.count(R._fold(" ".join(n["quote"].split()))), 1, (sid, n["quote"]))

    def test_each_note_is_one_or_two_plain_sentences_and_unique(self):
        seen = set()
        for sid, items in R.figure_notes()["speeches"].items():
            for n in items:
                sentences = [x for x in re.split(r"(?<=[.!?])\s+", n["why"].strip()) if x]
                self.assertLessEqual(len(sentences), 3, n["why"])  # one or two, a closing quote can add a fragment
                self.assertGreater(len(n["why"].split()), 12, n["why"])
                self.assertLess(len(n["why"]), 400, n["why"])
                self.assertNotIn(n["why"], seen)
                seen.add(n["why"])
                self.assertNotRegex(n["why"], r"[\U0001F300-\U0001FAFF]")

    def test_marks_carry_a_name_and_a_definition_from_the_figure_list(self):
        for f in ("anaphora", "ethos"):
            self.assertTrue(R.kind_info(f)["definition"])
        self.assertIsNone(R.kind_info("snark"))

    def test_scripture_and_play_attributions_are_the_checked_ones(self):
        """No invented attributions: each allusion note names only the sources that were looked up."""
        blob = " ".join(n["why"] for items in R.figure_notes()["speeches"].values() for n in items)
        for ref in re.findall(r"(Genesis|Matthew|Exodus|Psalm)s? (\d+(?::\d+)?)", blob):
            self.assertIn(" ".join(ref), {"Genesis 3:19", "Matthew 7:1", "Matthew 18:7", "Matthew 20:28", "Matthew 21:12", "Exodus 10"}, ref)

    def test_note_for_ties_try_it_to_a_real_marked_line(self):
        ok = R.note_for("gettysburg", "merism", "The brave men, living and dead")
        self.assertEqual(ok["figure"], "merism")
        for bad in (("gettysburg", "merism", "made up line"), ("gettysburg", "anaphora", "The brave men, living and dead"), ("nope", "merism", "x")):
            with self.assertRaises(ValueError):
                R.note_for(*bad)


class Try(unittest.TestCase):
    LINE = "Prices pinch every paycheck, and patience will not pay the rent."

    def test_try_it_asks_the_model_only_for_the_students_own_line_and_never_writes_it(self):
        reset()
        llm = fake_model()
        llm.queue.append('You use it partly: "Prices pinch every paycheck" works. Try "We will not wait for a better economy." What should the listener feel?')
        out = run(api.post_rhetoric_critique({"speech_id": "gettysburg", "figure": "merism", "quote": "The brave men, living and dead", "line": self.LINE}))
        prompt = llm.calls[-1]["messages"][0]["content"]
        self.assertIn("never write, rewrite, complete or suggest wording", prompt)
        self.assertIn("The brave men, living and dead", prompt)  # the speaker's line, with why
        self.assertIn(R.note_for("gettysburg", "merism", "The brave men, living and dead")["why"], prompt)
        self.assertIn("Prices pinch every paycheck", out["text"])        # their own words are kept
        self.assertNotIn("We will not wait", out["text"])               # a line the model invented is dropped
        self.assertTrue(out["text"].endswith("?"))

    def test_the_reply_always_ends_on_a_question(self):
        self.assertTrue(R.socratic_guard("This is a good line.", self.LINE, "x y z w").endswith("?"))
        kept = R.socratic_guard('Good start with "patience will not pay the rent". Which word is heaviest?', self.LINE, "x")
        self.assertIn("patience will not pay the rent", kept)

    def test_try_it_refuses_a_line_that_is_not_marked_and_a_short_line(self):
        reset()
        fake_model()
        with self.assertRaises(HTTPException):
            run(api.post_rhetoric_critique({"speech_id": "gettysburg", "figure": "merism", "quote": "invented", "line": self.LINE}))
        with self.assertRaises(HTTPException):
            run(api.post_rhetoric_critique({"speech_id": "gettysburg", "figure": "merism", "quote": "The brave men, living and dead", "line": "short"}))

    def test_appeals_can_be_tried_too(self):
        reset()
        llm = fake_model()
        run(api.post_rhetoric_critique({"speech_id": "douglass-fourth", "figure": "ethos",
                                        "quote": "He who could address this audience without a quailing sensation, has stronger nerves than I have.", "line": self.LINE}))
        self.assertIn("Trust in the speaker", llm.calls[-1]["messages"][0]["content"])

    def test_the_older_critique_route_is_unchanged(self):
        reset()
        llm = fake_model()
        run(api.post_rhetoric_critique({"figure": "anaphora", "line": self.LINE}))
        self.assertIn("Never write a new line", llm.calls[-1]["messages"][0]["content"])
        self.assertTrue(coach_remembers("anaphora", self.LINE))


def coach_remembers(figure, line):
    return api.coach.was_critiqued(figure, line)


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

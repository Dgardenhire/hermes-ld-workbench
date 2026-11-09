"""Loop 2, the coach loop: the compare's line links checked in code, the notes' two halves, one date per
citation, Hear it, the Take 2 row and its moves, the help label, and the judge's notes held to the words they
quote (no "names a source with a date" on a line with no date)."""
import json
import unittest

from _load import HTTPException, api, ballots, engine, extemp, fake_model, reset, run, speech, store

coach = api.coach
Q = "Should the Federal Reserve care more about prices or about jobs right now?"
FED = "Fed policymakers consider rate hike after strong jobs report"
SAID = ("Um, so the question is whether the Fed should care more about prices or about jobs right now. My answer is prices, for now. "
        "According to Reuters, Fed policymakers are weighing a rate hike after a strong jobs report, which tells you hiring is not the emergency. "
        "So the Fed should lean on prices now.")


def status(coro):
    try:
        run(coro)
    except HTTPException as e:
        return e.status_code, e.detail
    return 200, None


def take(text=SAID, **stats):
    t = speech.new_take({"event": "drill", "limit": 60, "typed": True, "text": text, "prompt": Q})
    if stats:
        speech.change_take(t["id"], lambda x: x.setdefault("stats", {}).update(stats))
        t = speech.get_take(t["id"])
    return t


EXAMPLE = {
    "sentences": [
        {"text": "The Fed should care more about prices right now.", "from": 2},
        {"text": "Reuters reported on November 6 that Fed policymakers are considering a rate hike after a strong jobs report [S1].", "from": 3},
        {"text": "That means hiring is not the emergency, so the risk worth fighting is prices.", "from": 3},
        {"text": "The other side says one good report can be a fluke, and it can, but the Fed meets again soon.", "from": 9},
        {"text": "So the Fed's main job right now is steady prices.", "from": 1},
    ],
    "notes": [{"yours": "You opened by saying the question back.", "this": "This version starts with the answer."},
              {"yours": "You named Reuters [S1] without a date.", "this": "This version says the outlet and the day aloud [S1]."}],
    "kept": "Your answer, prices, and your Reuters point.",
}


class Compare(unittest.TestCase):
    def setUp(self):
        reset()
        self.llm = fake_model()
        extemp.add_item({"title": FED, "outlet": "Reuters", "url": "https://news.google.com/a", "at": 1793998714, "topics": ["federal reserve"]})

    def example(self, raw=EXAMPLE, **stats):
        t = take(**stats)
        self.llm.queue.append(json.dumps(raw))
        return t, run(api.post_coach_extemp_example({"kind": "answer", "take_id": t["id"], "question": Q}))

    def test_lines_are_numbered_and_every_link_is_checked_in_code(self):
        t, out = self.example()
        self.assertEqual(out["lines"][1], "My answer is prices, for now.")
        self.assertEqual([s["line"] for s in out["sentences"]], [2, 3, 3, None, 1])  # line 9 is not one of theirs
        self.assertEqual(out["links"]["links_dropped"], 1)
        self.assertIsNone(coach.link("Steady prices win.", 3, out["lines"]))  # a real line that shares no word: not a link
        self.assertIn("[L2] My answer is prices, for now.", self.llm.calls[-1]["input"][0]["text"])

    def test_one_date_per_citation(self):
        _, out = self.example()
        s = out["sentences"][1]["text"]
        self.assertIn("on November 6", s)
        self.assertNotIn("2026)", s)  # the day is already said aloud: no written stamp after it
        self.assertNotIn("[S1]", s)

    def test_line_ids_never_show_as_brackets(self):
        raw = dict(EXAMPLE, notes=[{"yours": "You named Reuters in [L3] but gave no date.", "this": "This version keeps [L 2] and adds the day."}], kept="Your [L2].")
        _, out = self.example(raw)
        self.assertEqual(out["notes"][0], {"yours": "You named Reuters in line 3 but gave no date.", "this": "This version keeps line 2 and adds the day."})
        self.assertEqual(out["kept"], "Your line 2.")

    def test_a_token_after_the_period_still_sees_the_date_said(self):
        items = extemp.file_items()
        text, _ = coach.check("Reuters reported on November 6 that hiring held up. [S1] So prices come first.", items)
        self.assertEqual(text, "Reuters reported on November 6 that hiring held up. So prices come first.")

    def test_a_stamp_stays_inside_the_sentence_it_cites(self):
        text, _ = coach.check("Fed policymakers weigh a hike. [S1] So prices come first.", extemp.file_items())
        self.assertTrue(text.startswith("Fed policymakers weigh a hike (Reuters, Nov "), text)
        self.assertIn(", 2026). So prices come first.", text)

    def test_coaching_lengths_are_not_evidence(self):
        items = extemp.file_items()
        for t in ("Say it by about the 20-second mark.", "Keep a steady pace of about 130 to 170 words a minute.", "Answer in the first 10 seconds."):
            self.assertNotIn(coach.NOT_FOUND, coach.check(t, items, stamp=False)[0], t)
        self.assertIn(coach.NOT_FOUND, coach.check("Inflation hit 4.2 percent.", items, stamp=False)[0])

    def test_notes_keep_their_two_halves_and_no_stamp(self):
        _, out = self.example()
        self.assertEqual(out["notes"][0], {"yours": "You opened by saying the question back.", "this": "This version starts with the answer."})
        self.assertEqual(out["notes"][1]["yours"], "You named Reuters without a date.")
        self.assertNotIn("2026", json.dumps(out["notes"]))

    def test_moves_are_picked_in_code_from_what_take_1_missed(self):
        _, out = self.example(answer_at=4.8, fillers=1, wpm=123)
        self.assertEqual([m["id"] for m in out["moves"]], ["cite_early", "pace", "answer_early"])
        self.assertIn("An outlet and its month in the first 30 seconds", self.llm.calls[-1]["input"][0]["text"])

    def test_example_is_kept_and_hear_it_reads_it_clean(self):
        _, out = self.example()
        heard = []

        def synth(text, path):
            heard.append(text)
            raise RuntimeError("no voice in tests")
        api.SPEAK = synth
        try:
            self.assertEqual(status(api.post_coach_speak({"example_id": out["id"]}))[0], 502)
        finally:
            api.SPEAK = api._hermes_tts
        self.assertTrue(heard and "Reuters reported on November 6" in heard[0])
        self.assertNotIn("(", heard[0])
        self.assertEqual(status(api.post_coach_speak({"example_id": "nope"}))[0], 400)

    def test_speakable_drops_marks_stamps_and_brackets(self):
        t = coach.speakable("Hiring is up (NPR, Nov 6, 2026). Prices too (Nov 6, 2026) [find a source: the latest number] [[not-found]]")
        self.assertEqual(t, "Hiring is up. Prices too")


class TakeTwo(unittest.TestCase):
    def setUp(self):
        reset()
        self.llm = fake_model()
        extemp.add_item({"title": FED, "outlet": "Reuters", "url": "https://news.google.com/a", "at": 1793998714, "topics": ["federal reserve"]})

    def test_rows_and_moves_met_or_not(self):
        t1 = take(answer_at=8.4, fillers=3, wpm=123)
        t2 = take("My answer is prices. Reuters reported on November 6 that Fed policymakers are weighing a rate hike. So prices come first.",
                  answer_at=1.2, fillers=0, wpm=148)
        self.llm.queue.append(json.dumps(EXAMPLE))
        ex = run(api.post_coach_extemp_example({"kind": "answer", "take_id": t1["id"], "question": Q}))
        out = run(api.post_coach_extemp_take2({"take1": t1["id"], "take2": t2["id"], "example_id": ex["id"]}))
        rows = {r["key"]: r for r in out["rows"]}
        self.assertEqual(rows["answer_at"]["change"], "better")
        self.assertEqual(rows["fillers"]["change"], "better")
        self.assertEqual(rows["points"]["change"], "not measured")
        moves = {m["id"]: m for m in out["moves"]}
        self.assertFalse(moves["cite_early"]["take1"]["met"])
        self.assertTrue(moves["cite_early"]["take2"]["met"])
        self.assertTrue(moves["pace"]["take2"]["met"])

    def test_help_label_on_the_ballot(self):
        t1 = take()
        self.llm.queue.append(json.dumps(EXAMPLE))
        ex = run(api.post_coach_extemp_example({"kind": "answer", "take_id": t1["id"], "question": Q}))
        t2 = take()
        self.llm.queue.append(json.dumps({"answered": "yes", "points": 28, "summary": "Clear.", "decisive": [], "strengths": [], "reason": "r"}))
        b = run(api.post_take_judge(t2["id"], {"question": Q, "after_example": ex["id"]}))
        self.assertEqual(b["help"], "after the coach's example")
        self.llm.queue.append(json.dumps({"answered": "yes", "points": 28, "summary": "Clear.", "decisive": [], "strengths": [], "reason": "r"}))
        self.assertEqual(run(api.post_take_judge(t1["id"], {"question": Q}))["help"], "unaided")
        self.assertIn("Given after the coach's example", ballots.as_text())


class JudgeNotesTruth(unittest.TestCase):
    def setUp(self):
        reset()
        self.llm = fake_model()
        extemp.add_item({"title": FED, "outlet": "Reuters", "url": "https://news.google.com/a", "at": 1793998714, "topics": ["federal reserve"]})

    BALLOT = {"answered": "yes", "points": 27, "summary": "A clear answer.", "reason": "r",
              "decisive": [{"line": "My answer is prices, for now.", "effect": "Answers early and takes a side."},
                           {"line": "According to Reuters, Fed policymakers are weighing a rate hike after a strong jobs report",
                            "effect": "This names a source with a date and uses it well."}],
              "strengths": ["Names Reuters with a date aloud", "Answers early"], "drill": {"name": "d", "how": "h"}}

    def test_the_judge_is_told_the_date_was_not_said(self):
        t = take()
        self.llm.queue += [json.dumps(self.BALLOT), json.dumps({"notes": []})]
        run(api.post_take_judge(t["id"], {"question": Q}))
        body = next(c for c in self.llm.calls if c.get("purpose", "").endswith("drill.judge"))["input"][0]["text"]
        self.assertIn("Reuters (named WITHOUT a date", body)
        self.assertEqual(extemp.cited_sources("Reuters reported on November 6 that hiring is up.", extemp.file_items())[0]["date_said"], True)

    def test_a_note_that_claims_a_date_its_line_lacks_is_rewritten(self):
        t = take()
        fix = {"notes": [{"n": 1, "text": "This names Reuters without a date and uses it well."}, {"n": 2, "text": "Names Reuters aloud"}]}
        self.llm.queue += [json.dumps(self.BALLOT), json.dumps(fix)]
        b = run(api.post_take_judge(t["id"], {"question": Q}))
        self.assertEqual(b["decisive"][1]["effect"], "This names Reuters without a date and uses it well.")
        self.assertEqual(b["strengths"][0], "Names Reuters aloud")
        self.assertEqual((b["notes_fixed"], b["notes_removed"]), (2, 0))
        self.assertIn("Not in those words: date", self.llm.calls[-1]["input"][0]["text"])

    def test_a_note_that_still_claims_it_is_removed(self):
        t = take()
        self.llm.queue += [json.dumps(self.BALLOT), json.dumps({"notes": [{"n": 1, "text": "Names a source with its date."}]})]
        b = run(api.post_take_judge(t["id"], {"question": Q}))
        self.assertEqual(len(b["decisive"]), 1)
        self.assertEqual(b["strengths"], ["Answers early"])
        self.assertEqual(b["notes_removed"], 2)

    def test_claims_and_negations(self):
        line = "According to Reuters, Fed policymakers are weighing a rate hike"
        self.assertEqual(engine.unsupported("This names a source with a date.", line, ["Reuters"]), ["date"])
        self.assertEqual(engine.unsupported("It names Reuters but gives no date.", line, ["Reuters"]), [])
        self.assertEqual(engine.unsupported("A claim with no figure behind it.", line, ["Reuters"]), [])
        self.assertEqual(engine.unsupported("It uses a real number.", line, ["Reuters"]), ["figure"])
        self.assertEqual(engine.unsupported("It names a source.", "Prices hurt workers.", ["Reuters"]), ["source"])
        self.assertEqual(engine.unsupported("It cites NPR with the date.", "NPR reported on November 6 that 165,000 jobs were added.", ["NPR"]), [])
        # a negation reaches across a list, and stops at a turn (both seen in real runs)
        self.assertEqual(engine.unsupported("A sensible point, but it comes with no number, source or date, so it sounds like opinion.", line, ["Reuters"]), [])
        self.assertEqual(engine.unsupported("It names no outlet, but it gives a date.", "Prices rose fast.", ["Reuters"]), ["date"])


if __name__ == "__main__":
    unittest.main()

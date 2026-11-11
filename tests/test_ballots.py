"""Ballot tags from a fixed list, measured tags from numbers, and patterns counted in code."""
import json
import unittest

from _load import api, ballots, reset, run, store


def ld(n, tags, decision="neg", side="aff", **kw):
    return {"event": "ld", "round_no": n, "decision": decision, "side": side, "tags": tags, **kw}


class Tags(unittest.TestCase):
    def test_judge_tags_only_from_the_list(self):
        self.assertEqual(ballots.judge_tags("ld", ["dropped-2ar", "invented", "dropped-2ar", 3]), ["dropped-2ar"])
        self.assertEqual(ballots.judge_tags("extemp", ["dropped-2ar"]), [])

    def test_measured_tags(self):
        self.assertEqual(ballots.measured_tags({"wpm": 182, "speaking": 400}, 420, "extemp"), ["pace-fast"])
        self.assertIn("overtime", ballots.measured_tags({"speaking": 431}, 420, "extemp"))
        self.assertNotIn("overtime", ballots.measured_tags({"speaking": 423}, 420, "extemp"))  # inside the grace
        self.assertIn("undertime", ballots.measured_tags({"speaking": 300}, 420, "extemp"))
        self.assertIn("late-answer", ballots.measured_tags({"answer_at": 108, "speaking": 400}, 420, "extemp"))
        self.assertIn("late-answer", ballots.measured_tags({"answer_at": 25, "speaking": 55}, 60, "drill"))
        self.assertNotIn("late-answer", ballots.measured_tags({"answer_at": 25, "speaking": 55}, 60, "ld"))
        self.assertIn("fillers", ballots.measured_tags({"fillers": 9, "speaking": 60}, 60, "drill"))
        self.assertIn("long-pauses", ballots.measured_tags({"pauses": [1, 2, 3]}, 60, "drill"))
        self.assertEqual(ballots.measured_tags({}, 0, "ld"), [])


class Patterns(unittest.TestCase):
    def test_counts_over_the_last_six(self):
        hist = [ld(1, ["no-voters"])] + [ld(i, ["dropped-2ar"] if i % 3 else [], decision="aff" if i == 4 else "neg") for i in range(2, 8)]
        for i, b in enumerate(hist):
            b["index"] = i
        p = ballots.patterns(hist)["ld"]
        self.assertEqual(p["of"], 6)
        row = p["patterns"][0]
        self.assertEqual((row["tag"], row["count"], row["of"]), ("dropped-2ar", 4, 6))
        self.assertEqual(row["text"], "You drop arguments in the 2AR")
        self.assertEqual([r["label"] for r in row["rounds"]], ["R2", "R3", "R4", "R5", "R6", "R7"])
        self.assertEqual([r["result"] for r in row["rounds"]][2], "W")
        self.assertNotIn("no-voters", [r["tag"] for r in p["patterns"]])  # round 1 is outside the window

    def test_single_hits_are_not_patterns(self):
        self.assertEqual(ballots.patterns([ld(1, ["dropped-2ar"])])["ld"]["patterns"], [])

    def test_a_60_second_answer_is_not_tagged_for_sources_or_three_areas(self):
        self.assertTrue({"two-areas", "no-sources"} <= ballots.allowed_tags("extemp"))
        self.assertFalse({"two-areas", "no-sources"} & ballots.allowed_tags("drill"))
        self.assertEqual(ballots.judge_tags("drill", ["no-sources", "two-areas", "thin-analysis"]), ["thin-analysis"])
        hist = [{"event": "drill", "answered": "yes", "tags": ["no-sources", "two-areas"]},  # saved before 0.2
                {"event": "drill", "answered": "yes", "tags": ["no-sources", "two-areas"]}]
        self.assertEqual(ballots.patterns(hist)["extemp"]["patterns"], [])
        hist = [{"event": "extemp", "answered": "yes", "tags": ["no-sources"]}] * 2
        self.assertEqual(ballots.patterns(hist)["extemp"]["patterns"][0]["tag"], "no-sources")

    def test_extemp_and_drill_count_together_with_measured_tags(self):
        hist = [{"event": "drill", "answered": "yes", "tags": [], "measured_tags": ["late-answer"]},
                {"event": "extemp", "answered": "partly", "tags": ["no-sources"], "measured_tags": ["late-answer"]}]
        row = ballots.patterns(hist)["extemp"]["patterns"][0]
        self.assertEqual((row["tag"], row["count"], row["measured"]), ("late-answer", 2, True))


class Storage(unittest.TestCase):
    def setUp(self):
        reset()

    def test_a_01_data_folder_opens_unchanged(self):
        old = {"rounds_started": 3, "history": [{"decision": "neg", "side": "aff", "round_no": 2, "judge": "Flow judge",
                                                  "drills": [{"name": "Extend", "why": "w", "how": "h"}]}]}
        (store.data_dir() / "ballots.json").write_text(json.dumps(old))
        (store.data_dir() / "workbench.json").write_text(json.dumps({"active": None, "source": None}))
        out = run(api.get_ballots())
        self.assertEqual(out["rounds_started"], 3)
        self.assertEqual(out["history"][0]["event"], "ld")
        self.assertEqual(out["history"][0]["tags"], [])
        home = run(api.get_home())
        self.assertEqual(ballots.next_drill()["name"], "Extend")  # the 0.1 ballot's drill is still read
        self.assertIsNone(home["next_drill"])  # but the extemp floor shows only extemp and 60-second drills
        self.assertEqual(home["settings"]["event"], "extemp")
        self.assertEqual(json.loads((store.data_dir() / "ballots.json").read_text()), old)  # reading never rewrites it

    def test_drill_done(self):
        ballots.add({"event": "drill", "answered": "yes", "drill": {"name": "Lead with the answer", "how": "x"}, "tags": []})
        self.assertEqual(ballots.next_drill()["name"], "Lead with the answer")
        out = run(api.post_ballot_drill(0, {"done": True}))
        self.assertTrue(out["history"][0]["drill_done"])
        self.assertIsNone(ballots.next_drill())
        from _load import HTTPException
        with self.assertRaises(HTTPException):
            run(api.post_ballot_drill(9, {"done": True}))


if __name__ == "__main__":
    unittest.main()

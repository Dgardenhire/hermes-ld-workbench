"""The openings lab: three spoken openings for one question; the coach picks the strongest and never writes one."""
import json
import unittest

from _load import HTTPException, api, extemp, fake_model, reset, run, speech

Q = "Should the Federal Reserve care more about prices or about jobs right now?"
SAID = ["In 1979 a gallon of milk cost a dollar ten. The question tonight is whether the Fed should fight prices or protect jobs.",
        "Ask anyone at a grocery store what worries them. Prices. So should the Fed care more about prices or jobs? Prices, for now.",
        "Jobs matter. Prices matter too. Today I will talk about the Fed and whether it should care about prices or jobs."]


def typed(text, event="opening"):
    return speech.new_take({"event": event, "segment": "o", "limit": 45, "prompt": Q, "typed": True, "text": text})


class Coach(unittest.TestCase):
    def setUp(self):
        reset()
        self.llm = fake_model()

    def test_picks_the_strongest(self):
        ids = [typed(t)["id"] for t in SAID]
        self.llm.queue.append(json.dumps({"best": 2, "why": "It answers by the third sentence.",
                                          "notes": [{"n": 1, "worked": "A real number.", "fix": "Reach the question sooner."},
                                                    {"n": 2, "worked": "Answer first.", "fix": "Name a source."},
                                                    {"n": 3, "worked": "", "fix": "Start with something concrete."},
                                                    {"n": 9, "worked": "x", "fix": "y"}], "next": "Open with a person."}))
        r = run(api.post_openings_coach({"question": Q, "take_ids": ids}))
        self.assertEqual(r["best"], 2)
        self.assertEqual([n["n"] for n in r["notes"]], [1, 2, 3])
        sent = self.llm.calls[-1]
        self.assertIn("OPENING 3", json.dumps(sent))
        self.assertIn("never write", extemp.OPENINGS_PROMPT)

    def test_needs_three_openings_with_words(self):
        ids = [typed(t)["id"] for t in SAID[:2]]
        with self.assertRaises(HTTPException):
            run(api.post_openings_coach({"question": Q, "take_ids": ids}))
        silent = speech.new_take({"event": "opening", "segment": "o", "limit": 45, "prompt": Q, "duration": 40, "levels": [0.2] * 400})
        with self.assertRaises(HTTPException) as e:
            run(api.post_openings_coach({"question": Q, "take_ids": ids + [silent["id"]]}))
        self.assertIn("Opening 3 has no words", e.exception.detail)

    def test_only_openings(self):
        ids = [typed(t)["id"] for t in SAID[:2]] + [typed(SAID[2], event="drill")["id"]]
        with self.assertRaises(HTTPException):
            run(api.post_openings_coach({"question": Q, "take_ids": ids}))

    def test_unreadable_answer(self):
        ids = [typed(t)["id"] for t in SAID]
        self.llm.queue.append("not json at all")
        with self.assertRaises(HTTPException) as e:
            run(api.post_openings_coach({"question": Q, "take_ids": ids}))
        self.assertIn("Try again", e.exception.detail)

    def test_tidy_drops_bad_best(self):
        r = extemp.tidy_openings({"best": 7, "notes": [{"n": 1, "worked": "a", "fix": "b"}]})
        self.assertIsNone(r["best"])


if __name__ == "__main__":
    unittest.main()

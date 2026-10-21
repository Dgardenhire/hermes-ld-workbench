import json
import unittest

from _load import api, engine, M, fake_model, reset, run, HTTPException


class DrillValidation(unittest.TestCase):
    def setUp(self):
        reset()
        self.llm = fake_model()

    def test_every_guide_name_and_none_are_accepted(self):
        for name in [f["name"] for f in M.FALLACIES] + ["None"]:
            out = engine.check_drill({"argument": "An argument.", "answer": name, "explanation": "Why."})
            self.assertEqual(out["answer"], name)

    def test_bad_answers_are_refused(self):
        for bad in ["", "none", "straw man", "Strawman", "Red herring fallacy", None, 3, ["Straw man"]]:
            with self.subTest(answer=bad):
                with self.assertRaises(RuntimeError):
                    engine.check_drill({"argument": "An argument.", "answer": bad, "explanation": "x"})
        with self.assertRaises(RuntimeError):
            engine.check_drill({"argument": "  ", "answer": "None"})
        with self.assertRaises(RuntimeError):
            engine.check_drill("not a dict")

    def test_lengths_are_capped(self):
        out = engine.check_drill({"argument": "a" * 5000, "answer": "None", "explanation": "b" * 5000})
        self.assertEqual((len(out["argument"]), len(out["explanation"])), (800, 600))

    def test_drill_route_uses_method_prompt_with_random_parts(self):
        self.llm.queue.append(json.dumps({"argument": "Arg.", "explanation": "E."}))
        out = run(api.post_drill())
        valid = {f["name"] for f in M.FALLACIES} | {"None"}
        self.assertIn(out["answer"], valid)
        prompt = self.llm.calls[-1]["system_prompt"]
        self.assertTrue(any(t in prompt for t in M.DRILL_TOPICS))
        self.assertTrue(any(v in prompt for v in M.DRILL_VOICES))
        self.assertIn(f"Fallacy to commit: {out['answer']}.", prompt)

    def test_drill_answer_is_the_servers_choice_not_the_models(self):
        self.llm.queue.append(json.dumps({"argument": "Arg.", "answer": "Made-up fallacy", "explanation": "E."}))
        out = run(api.post_drill())
        self.assertNotEqual(out["answer"], "Made-up fallacy")
        self.assertIn(out["answer"], {f["name"] for f in M.FALLACIES} | {"None"})

    def test_drill_route_refuses_an_empty_argument(self):
        self.llm.queue.append(json.dumps({"argument": "", "explanation": "E."}))
        with self.assertRaises(HTTPException) as cm:
            run(api.post_drill())
        self.assertEqual(cm.exception.status_code, 502)

    def test_spot_uses_the_spot_tool_and_an_empty_case(self):
        run(api.get_state())
        run(api.post_spot({"text": "Everyone I know likes it, so it must be good for the whole country and all people."}))
        call = self.llm.calls[-1]
        self.assertEqual(call["messages"][0]["content"], M.COACHING_STANCE + "\n\n" + M.TOOLS["spot"]["prompt"])
        self.assertIn("(The case is empty so far.)", call["messages"][1]["content"])
        self.assertTrue(call["messages"][-1]["content"].startswith("Find the fallacies in this argument:"))
        with self.assertRaises(HTTPException):
            run(api.post_spot({"text": "too short"}))


if __name__ == "__main__":
    unittest.main()

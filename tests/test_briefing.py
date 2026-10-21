import unittest

from _load import api, engine, M, store, fake_model, reset, run, HTTPException

RES = "Resolved: De-extinction is unethical."


class TopicBriefing(unittest.TestCase):
    def setUp(self):
        reset()
        self.llm = fake_model()
        run(api.get_state())

    def briefing_calls(self):
        return [c for c in self.llm.calls if c.get("purpose") == "ld-workbench.briefing"]

    def test_uses_the_method_prompt_and_the_resolution(self):
        out = run(api.post_briefing({"resolution": RES}))
        self.assertFalse(out["cached"])
        call = self.briefing_calls()[-1]
        self.assertEqual(call["messages"][0], {"role": "system", "content": M.COACHING_STANCE + "\n\n" + M.TOPIC_BRIEFING_PROMPT})
        self.assertEqual(call["messages"][1], {"role": "user", "content": f"Resolution: {RES}"})

    def test_topic_source_goes_with_it(self):
        run(api.post_workbench({"source": {"title": "Notes", "text": "word " * 30}}))
        run(api.post_briefing({"resolution": RES}))
        self.assertIn("TOPIC SOURCE the student provided (Notes)", self.briefing_calls()[-1]["messages"][1]["content"])

    def test_refuses_an_empty_or_short_resolution(self):
        for res in ("", "   ", "Resolved: X"):
            with self.subTest(res=res):
                with self.assertRaises(HTTPException) as cm:
                    run(api.post_briefing({"resolution": res}))
                self.assertEqual(cm.exception.status_code, 400)
        self.assertEqual(self.briefing_calls(), [])
        with self.assertRaises(ValueError):
            run(engine.run_briefing(engine.clean({"action": "briefing", "resolution": ""}), api.MODEL))

    def test_cache_hit_makes_no_model_call(self):
        first = run(api.post_briefing({"resolution": RES}))
        n = len(self.briefing_calls())
        again = run(api.post_briefing({"resolution": "  resolved:   DE-EXTINCTION is unethical. "}))
        self.assertTrue(again["cached"])
        self.assertEqual(again["text"], first["text"])
        self.assertEqual(len(self.briefing_calls()), n)

    def test_auto_skips_a_known_topic(self):
        self.assertFalse(run(api.post_briefing({"resolution": RES, "mode": "auto"})).get("skipped"))
        n = len(self.briefing_calls())
        self.assertTrue(run(api.post_briefing({"resolution": RES, "mode": "auto"}))["skipped"])
        self.assertEqual(len(self.briefing_calls()), n)

    def test_redo_bypasses_the_cache(self):
        run(api.post_briefing({"resolution": RES}))
        self.llm.queue.append("A fresh briefing.")
        out = run(api.post_briefing({"resolution": RES, "mode": "redo"}))
        self.assertFalse(out["cached"])
        self.assertEqual(out["text"], "A fresh briefing.")
        self.assertEqual(run(api.post_briefing({"resolution": RES}))["text"], "A fresh briefing.")

    def test_a_new_source_means_a_new_briefing(self):
        run(api.post_briefing({"resolution": RES}))
        run(api.post_workbench({"source": {"title": "Notes", "text": "word " * 30}}))
        self.assertFalse(run(api.post_briefing({"resolution": RES}))["cached"])

    def test_keeps_the_last_twenty(self):
        for i in range(23):
            run(api.post_briefing({"resolution": f"Resolved: topic number {i} matters."}))
        self.assertEqual(len(store.read("briefings.json")["items"]), 20)


class BriefingCheck(unittest.TestCase):
    def test_check_never_calls_the_model(self):
        reset()
        llm = fake_model()
        run(api.get_state())
        self.assertFalse(run(api.post_briefing({"resolution": RES, "mode": "check"}))["known"])
        self.assertEqual(llm.calls, [])
        run(api.post_briefing({"resolution": RES}))
        n = len(llm.calls)
        self.assertTrue(run(api.post_briefing({"resolution": RES, "mode": "check"}))["known"])
        self.assertEqual(len(llm.calls), n)


if __name__ == "__main__":
    unittest.main()

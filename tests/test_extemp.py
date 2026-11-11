"""Extemp: the file, the draw and its model-free fallback, the round, and the extemp ballot."""
import json
import time
import unittest

from _load import HTTPException, api, ballots, extemp, fake_model, reset, run, speech, store

JUDGED = {"answered": "partly", "points": 27.5, "summary": "A clear answer that came late.",
          "decisive": [{"line": "my answer is partly", "effect": "The answer arrived."},
                       {"line": "a line nobody said", "effect": "Invented."}],
          "reason": "You answered.", "strengths": ["Clear areas."], "drill": {"name": "Answer in the first 20 seconds", "how": "Say it first."},
          "tags": ["no-sources", "made-up-tag", "pace-fast"]}


class File(unittest.TestCase):
    def setUp(self):
        reset()

    def test_add_search_edit_remove(self):
        a = extemp.add_item({"title": "Senate weighs tariff repeal", "outlet": "Reuters", "url": "https://news.google.com/a",
                             "at": 1762400000, "topics": ["Trade", ""], "note": "Veto math"})
        extemp.add_item({"title": "Fed holds rates", "outlet": "AP", "url": "https://news.google.com/b", "topics": ["economy"]})
        self.assertEqual(a["topics"], ["trade"])
        self.assertEqual([i["title"] for i in extemp.search("veto")], ["Senate weighs tariff repeal"])
        self.assertEqual(len(extemp.search(topic="economy")), 1)
        with self.assertRaises(ValueError):
            extemp.add_item({"title": "dupe", "url": "https://news.google.com/a"})
        with self.assertRaises(ValueError):
            extemp.add_item({"title": "x", "url": "javascript:alert(1)"})
        extemp.edit_item(a["id"], {"note": "New note"})
        self.assertEqual(extemp.file_items()[1]["note"], "New note")
        extemp.remove_item(a["id"])
        self.assertEqual(len(extemp.file_items()), 1)

    def test_routes(self):
        out = run(api.post_extemp_file({"title": "Fed holds rates", "outlet": "AP", "topics": ["economy"]}))
        listed = run(api.get_extemp_file(q="", topic=""))
        self.assertEqual(listed["count"], 1)
        self.assertEqual(listed["topics"], ["economy"])
        self.assertIsNone(listed["items"][0]["text"])  # the text stays on the backend
        run(api.post_extemp_file_delete(out["id"]))
        self.assertEqual(run(api.get_extemp_file(q="", topic=""))["count"], 0)

    def test_remove_unpicks_the_source_and_says_when_it_is_gone(self):
        a = extemp.add_item({"title": "Fed holds rates", "outlet": "AP"})
        b = extemp.add_item({"title": "Jobs report beats forecasts", "outlet": "Reuters"})
        r = run(api.post_extemp_round_start({"question": "Should the Federal Reserve care more about prices or about jobs right now?", "area": "us"}))
        run(api.post_extemp_round({"outline": dict(r["outline"], sources=[a["id"], b["id"]])}))
        self.assertEqual(run(api.post_extemp_file_delete(a["id"])), {"ok": True})
        self.assertEqual([i["id"] for i in extemp.file_items()], [b["id"]])
        self.assertEqual(store.read("extemp_round.json")["outline"]["sources"], [b["id"]])
        with self.assertRaises(HTTPException) as e:
            run(api.post_extemp_file_delete(a["id"]))  # a second click, or a stale page
        self.assertEqual(e.exception.status_code, 400)
        self.assertIn("no longer in your file", e.exception.detail)

    def test_remove_with_no_round_in_progress(self):
        a = extemp.add_item({"title": "Fed holds rates", "outlet": "AP"})
        extemp.remove_item(a["id"])
        self.assertEqual(extemp.file_items(), [])
        self.assertIsNone(store.read("extemp_round.json"))

    def test_citation_is_outlet_and_date(self):
        t = time.mktime((2026, 11, 5, 12, 0, 0, 0, 0, -1))
        self.assertEqual(extemp.citation({"outlet": "Reuters", "at": int(t)}), "Reuters, Nov 5, 2026")
        self.assertEqual(extemp.citation({"outlet": "", "at": None}), "Saved link, no date")

    def test_sources_cited_aloud(self):
        items = [{"outlet": "Reuters", "at": 1, "title": "a"}, {"outlet": "The Washington Times", "at": 2, "title": "b"},
                 {"outlet": "NPR", "at": 3, "title": "c"}]
        got = extemp.cited_sources("According to Reuters on Thursday, and the Washington Times agrees", items)
        self.assertEqual([g["outlet"] for g in got], ["Reuters", "The Washington Times"])


class Draw(unittest.TestCase):
    def setUp(self):
        reset()
        self.llm = fake_model()
        extemp.add_item({"title": "Senate weighs tariff repeal", "outlet": "Reuters"})

    def test_three_questions(self):
        self.llm.queue.append(json.dumps({"questions": [{"text": "Can the Senate override a tariff veto this year?"},
                                                        {"text": "Will farm relief money change any votes?"},
                                                        {"text": "Should Congress take back tariff power from the President?"}]}))
        out = run(api.post_extemp_draw({"area": "us"}))
        self.assertEqual(len(out["questions"]), 3)
        self.assertFalse(out["fallback"])
        prompt = self.llm.calls[-1]
        self.assertIn("Senate weighs tariff repeal", prompt["input"][0]["text"])
        self.assertIn("ONLY the news below", prompt["system_prompt"])

    def test_bad_answer_falls_back_to_writing_your_own(self):
        self.llm.queue.append(json.dumps({"questions": [{"text": "Too short"}]}))
        out = run(api.post_extemp_draw({"area": "us"}))
        self.assertTrue(out["fallback"])
        self.assertIn("Senate weighs tariff repeal (Reuters, no date)", out["headlines"])

    def test_no_model_falls_back_too(self):
        class Down:
            async def acomplete(self, *a, **k):
                raise RuntimeError("no provider configured")
            acomplete_structured = acomplete
        api.MODEL = api.engine.Model(Down())
        out = run(api.post_extemp_draw({"area": "international"}))
        self.assertTrue(out["fallback"])
        self.assertIn("model set up", out["notice"])

    def test_empty_file_says_what_to_do(self):
        reset()
        with self.assertRaises(HTTPException) as e:
            run(api.post_extemp_draw({"area": "us"}))
        self.assertIn("Pull headlines", e.exception.detail)


class Round(unittest.TestCase):
    def setUp(self):
        reset()

    def test_prep_only_goes_down_and_outline_is_kept(self):
        r = run(api.post_extemp_round_start({"question": "Can Congress change trade policy", "area": "us"}))
        self.assertTrue(r["question"].endswith("?"))
        self.assertEqual(r["prep_left"], 1800)
        run(api.post_extemp_round({"prep_left": 1500, "outline": {"answer": "Partly", "area1": "Veto math", "bogus": "x"}}))
        r = run(api.post_extemp_round({"prep_left": 1700}))
        self.assertEqual(r["prep_left"], 1500)
        self.assertEqual(r["outline"]["answer"], "Partly")
        self.assertNotIn("bogus", r["outline"])
        run(api.post_extemp_round_end())
        self.assertIsNone(run(api.get_extemp_round()))
        with self.assertRaises(HTTPException):
            run(api.post_extemp_round({"phase": "speak"}))


class Ballot(unittest.TestCase):
    def setUp(self):
        reset()
        self.llm = fake_model()

    def typed_take(self, text, event="drill", limit=60):
        return speech.new_take({"event": event, "limit": limit, "typed": True, "text": text, "prompt": "Can Congress change trade policy?"})

    def test_ballot_tags_checked_lines_and_patterns(self):
        t = self.typed_take("Um, my answer is partly, through the budget riders on tariff money.")
        self.llm.queue.append(json.dumps(JUDGED))
        b = run(api.post_take_judge(t["id"], {"outline": {"answer": "Partly"}}))
        self.assertEqual(b["tags"], [])  # off-list tags dropped; "no sources" is not a 60-second answer's tag
        self.assertEqual([d["checked"] for d in b["decisive"]], [True, False])
        self.assertEqual(b["event"], "drill")
        self.assertTrue(b["measured"]["typed"])
        hist = ballots.history()
        self.assertEqual(hist[-1]["question"], "Can Congress change trade policy?")
        self.assertIn("estimate", self.llm.calls[-1]["input"][0]["text"])
        t = self.typed_take("Um, my answer is partly, through the budget riders on tariff money.", event="extemp", limit=420)
        self.llm.queue.append(json.dumps(JUDGED))
        b = run(api.post_take_judge(t["id"], {"outline": {"answer": "Partly"}}))
        self.assertEqual((b["event"], b["tags"]), ("extemp", ["no-sources"]))  # the 7-minute speech keeps it

    def test_judge_without_a_decision_is_a_plain_error(self):
        t = self.typed_take("my answer is yes")
        self.llm.queue.append(json.dumps({"points": 25}))
        with self.assertRaises(HTTPException) as e:
            run(api.post_take_judge(t["id"], {}))
        self.assertIn("Ask for the ballot again", e.exception.detail)

    def test_a_take_is_judged_once(self):
        # Nov 11 live check: reopening Extemp asked again for the last take and filed a second ballot
        t = self.typed_take("Um, my answer is partly, through the budget riders on tariff money.")
        self.llm.queue.append(json.dumps(JUDGED))
        first = run(api.post_take_judge(t["id"], {"outline": {"answer": "Partly"}}))
        calls, filed = len(self.llm.calls), len(ballots.history())
        again = run(api.post_take_judge(t["id"], {"outline": {"answer": "Partly"}}))
        self.assertEqual(again["at"], first["at"])
        self.assertEqual((len(self.llm.calls), len(ballots.history())), (calls, filed))

    def test_only_extemp_takes(self):
        t = speech.new_take({"event": "rhetoric", "typed": True, "text": "x"})
        with self.assertRaises(HTTPException):
            run(api.post_take_judge(t["id"], {"question": "Q?"}))


if __name__ == "__main__":
    unittest.main()

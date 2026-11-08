"""Extemp "internet allowed" prep: the user's own Hermes web search, only in an internet round, every failure plain."""
import json
import time
import unittest

from _load import HTTPException, api, extemp, reset, run

ENVELOPE = {"success": True, "data": {"web": [
    {"title": "House votes on tariff repeal", "url": "https://www.reuters.com/world/us/x", "description": "The House voted...", "position": 1},
    {"title": "Bad link", "url": "javascript:alert(1)", "description": ""},
    {"title": "", "url": "https://apnews.com/article/y", "description": "  spaced   out  "},
]}}


class Parse(unittest.TestCase):
    def test_envelope(self):
        r = extemp.web_results(json.dumps(ENVELOPE))
        self.assertEqual([x["site"] for x in r], ["reuters.com", "apnews.com"])
        self.assertEqual(r[1]["title"], "apnews.com")
        self.assertEqual(r[1]["snippet"], "spaced out")

    def test_not_set_up(self):
        with self.assertRaises(ValueError) as e:
            extemp.web_results('{"error": "Unknown tool: web_search"}')
        self.assertIn("Hermes Settings", str(e.exception))

    def test_other_error_and_junk(self):
        with self.assertRaises(ValueError):
            extemp.web_results('{"error": "Tool execution failed: boom"}')
        with self.assertRaises(ValueError):
            extemp.web_results("<html>")
        self.assertEqual(extemp.web_results({"success": True, "data": {"web": "nope"}}), [])

    def test_query(self):
        self.assertEqual(extemp.web_query("Can Congress act?", "  tariff   veto "), "tariff veto")
        self.assertEqual(extemp.web_query("Can Congress act?", ""), "Can Congress act?")
        with self.assertRaises(ValueError):
            extemp.web_query("", "a")


class Route(unittest.TestCase):
    def setUp(self):
        reset()
        self.old = api.WEB_SEARCH

    def tearDown(self):
        api.WEB_SEARCH = self.old

    def start(self, mode):
        return run(api.post_extemp_round_start({"question": "Can Congress change trade policy?", "area": "us", "mode": mode}))

    def test_files_only_round_refuses(self):
        self.start("files")
        with self.assertRaises(HTTPException) as e:
            run(api.post_extemp_search({"query": "tariffs"}))
        self.assertIn("files only", e.exception.detail)

    def test_no_round(self):
        with self.assertRaises(HTTPException):
            run(api.post_extemp_search({"query": "tariffs"}))

    def test_internet_round_searches(self):
        self.start("internet")
        seen = []
        api.WEB_SEARCH = lambda q: (seen.append(q), json.dumps(ENVELOPE))[1]
        r = run(api.post_extemp_search({"query": "tariff veto"}))
        self.assertEqual(seen, ["tariff veto"])
        self.assertEqual(len(r["results"]), 2)

    def test_outside_hermes_is_not_set_up(self):
        self.start("internet")
        api.WEB_SEARCH = lambda q: {"error": "Unknown tool: web_search"}
        with self.assertRaises(HTTPException) as e:
            run(api.post_extemp_search({}))
        self.assertIn("not set up", e.exception.detail)

    def test_slow_search_gives_up(self):
        self.start("internet")
        orig = api.asyncio.wait_for

        async def fast(aw, timeout):
            return await orig(aw, 0.05)
        api.asyncio.wait_for = fast
        api.WEB_SEARCH = lambda q: time.sleep(0.3) or ENVELOPE
        try:
            with self.assertRaises(HTTPException) as e:
                run(api.post_extemp_search({"query": "tariffs"}))
            self.assertIn("too long", e.exception.detail)
        finally:
            api.asyncio.wait_for = orig


if __name__ == "__main__":
    unittest.main()

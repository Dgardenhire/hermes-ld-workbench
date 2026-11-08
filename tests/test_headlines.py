"""Headlines from both sides: the outlet list, the parser, per-outlet failure, and the cache."""
import unittest

from _load import HTTPException, api, headlines, reset, run, store

RSS = b"""<?xml version="1.0"?><rss version="2.0"><channel><title>x</title>
<item><title>Senate weighs tariff repeal - National Review</title><link>https://news.google.com/rss/articles/a1</link><pubDate>Thu, 05 Nov 2026 14:00:00 GMT</pubDate><source url="https://www.nationalreview.com">National Review</source></item>
<item><title>Farm relief tied to tariff money - National Review</title><link>https://news.google.com/rss/articles/a2</link><pubDate>Fri, 06 Nov 2026 14:00:00 GMT</pubDate></item>
<item><title>No link here</title><link>javascript:alert(1)</link></item>
</channel></rss>"""
ATOM = b"""<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>Tariff vote slips a week</title><link href="https://example.org/a"/><updated>2026-11-04T10:00:00Z</updated></entry>
<entry><title>Unrelated story about baseball</title><link href="https://example.org/b"/><updated>2026-11-04T10:00:00Z</updated></entry></feed>"""


class Parser(unittest.TestCase):
    def test_rss(self):
        items = headlines.parse_feed(RSS)
        self.assertEqual(len(items), 2)  # the javascript: link is dropped
        self.assertEqual(items[0]["source"], "National Review")
        self.assertIsInstance(items[0]["at"], int)

    def test_atom(self):
        items = headlines.parse_feed(ATOM)
        self.assertEqual(items[0]["url"], "https://example.org/a")
        self.assertIsNotNone(items[0]["at"])

    def test_dtd_refused(self):
        bomb = b'<?xml version="1.0"?><!DOCTYPE lolz [<!ENTITY lol "lol">]><rss><channel><item><title>&lol;</title></item></channel></rss>'
        with self.assertRaises(RuntimeError):
            headlines.parse_feed(bomb)

    def test_cut_off_document_keeps_closed_items(self):
        self.assertEqual(len(headlines.parse_feed(RSS[: RSS.index(b"<item><title>No link")] + b"<item><title>half")), 2)

    def test_google_suffix_stripped(self):
        self.assertEqual(headlines.strip_outlet("Senate weighs repeal - National Review", {}), "Senate weighs repeal")
        aei = {"name": "AEI", "domain": "aei.org", "note": "American Enterprise Institute, a think tank"}
        self.assertEqual(headlines.strip_outlet("A Bomb Dropped - American Enterprise Institute - AEI", aei), "A Bomb Dropped")
        self.assertEqual(headlines.strip_outlet("Left - right - Reuters", {"name": "Reuters", "domain": "reuters.com"}), "Left - right")

    def test_index_pages_and_repeats_dropped(self):
        items = [{"title": t} for t in ("Tag: Tariffs", "Mexico Archives", "Repeal the Tariffs", "Repeal the tariffs!")]
        self.assertEqual([i["title"] for i in headlines.tidy(items)], ["Repeal the Tariffs"])

    def test_topic_matches_rank_first(self):
        items = [{"title": "Baseball tonight"}, {"title": "Senate tariff vote"}, {"title": "Tariff relief"}]
        self.assertEqual([i["title"] for _, i in headlines.rank(items, ["tariff"])], ["Senate tariff vote", "Tariff relief", "Baseball tonight"])

    def test_google_url_is_a_site_search(self):
        u = headlines.google_url("tariff repeal", "aei.org")
        self.assertTrue(u.startswith("https://news.google.com/rss/search?"))
        self.assertIn("site%3Aaei.org", u)
        self.assertIn("when%3A30d", u)


class Outlets(unittest.TestCase):
    def setUp(self):
        reset()

    def test_defaults_carry_the_center_right_additions_with_labels(self):
        by = {o["name"]: o for o in headlines.outlets()}
        self.assertEqual(by["National Review"]["lean"], "Lean Right")
        self.assertEqual(by["City Journal"]["lean"], "Right")
        self.assertEqual(by["AEI"]["lean"], "Lean Right")
        self.assertEqual(by["UnHerd"]["lean"], "Center")  # AllSides' own label, not ours
        self.assertIn("Manhattan Institute", by["City Journal"]["note"])

    def test_default_set_is_reported_lopsided(self):
        bal = headlines.balance(headlines.outlets())
        self.assertEqual(bal["counts"], {"left": 2, "center": 3, "right": 5})
        self.assertTrue(bal["lopsided"])

    def test_edit_validates_and_resets(self):
        with self.assertRaises(ValueError):
            headlines.save_outlets([{"name": "Bad", "domain": "not a domain"}])
        with self.assertRaises(ValueError):
            headlines.save_outlets([{"name": "Feed", "domain": "example.org", "feed": "http://example.org/rss"}])
        with self.assertRaises(ValueError):
            headlines.save_outlets([])
        saved = headlines.save_outlets([{"name": "The Atlantic", "domain": "https://www.theatlantic.com/", "side": "left", "lean": "Left"}])
        self.assertEqual(saved[0]["domain"], "theatlantic.com")
        self.assertEqual(headlines.outlets()[0]["name"], "The Atlantic")
        self.assertEqual(len(headlines.reset_outlets()), len(headlines.DEFAULT_OUTLETS))

    def test_fetch_refuses_unlisted_hosts_and_plain_http(self):
        with self.assertRaises(RuntimeError):
            headlines.fetch("https://evil.example/rss", {"news.google.com"})
        with self.assertRaises(RuntimeError):
            headlines.fetch("http://news.google.com/rss", {"news.google.com"})


def getter_for(behaviour):
    def get(url, hosts):
        for key, result in behaviour.items():
            if key in url:
                if isinstance(result, Exception):
                    raise result
                return result
        raise RuntimeError("timeout")
    return get


class Pull(unittest.TestCase):
    def setUp(self):
        reset()
        headlines.save_outlets([
            {"name": "NPR", "domain": "npr.org", "side": "left"},
            {"name": "National Review", "domain": "nationalreview.com", "side": "right", "feed": "https://www.nationalreview.com/feed/"},
            {"name": "Reuters", "domain": "reuters.com", "side": "center"},
        ])

    def test_each_outlet_fails_alone(self):
        get = getter_for({"site%3Anpr.org": RSS, "site%3Areuters.com": RuntimeError("status 503"),
                          "site%3Anationalreview.com": RuntimeError("status 429"), "nationalreview.com/feed": ATOM})
        out = headlines.pull("tariff vote", get)
        cols = {c["id"]: c for c in out["columns"]}
        self.assertTrue(cols["npr-org"]["ok"])
        self.assertEqual(cols["npr-org"]["items"][0]["title"], "Senate weighs tariff repeal")  # Google order kept among topic matches
        self.assertFalse(cols["reuters-com"]["ok"])
        self.assertEqual(cols["reuters-com"]["error"], "Reuters did not answer. Try again.")
        self.assertEqual(cols["nationalreview-com"]["via"], "own feed")
        self.assertEqual([i["title"] for i in cols["nationalreview-com"]["items"]], ["Tariff vote slips a week"])  # filtered by topic
        self.assertEqual(headlines.cached("Tariff Vote")["topic"], "tariff vote")

    def test_route_offline_uses_the_cache_then_says_so(self):
        headlines.pull("tariff vote", getter_for({"site%3A": RSS}))
        real = headlines.pull
        headlines.pull = lambda topic, getter=None: real(topic, getter_for({}))
        try:
            out = run(api.post_headlines_pull({"topic": "tariff vote"}))
            self.assertTrue(out["stale"])
            with self.assertRaises(HTTPException) as e:
                run(api.post_headlines_pull({"topic": "a topic never pulled"}))
            self.assertEqual(e.exception.status_code, 502)
            self.assertIn("No outlet answered", e.exception.detail)
        finally:
            headlines.pull = real

    def test_topic_checks(self):
        for bad in ("", "x", "y" * 121):
            with self.assertRaises(HTTPException):
                run(api.post_headlines_pull({"topic": bad}))

    def test_cache_keeps_twenty_topics(self):
        for i in range(23):
            store.update("headlines.json", lambda h, i=i: (h["topics"].__setitem__(f"t{i}", {"topic": f"t{i}", "at": i, "columns": []}), h)[1])
        headlines.pull("newest topic", getter_for({"site%3A": RSS}))
        self.assertEqual(len(store.read("headlines.json")["topics"]), headlines.TOPIC_CAP)


if __name__ == "__main__":
    unittest.main()

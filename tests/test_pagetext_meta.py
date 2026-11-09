"""The page reader's metadata: outlet, date and author from the page's own tags, and the story's text first."""
import time
import unittest

from _load import engine


def read(html):
    r = engine.PageText()
    r.feed(html)
    r.close()
    return r


STORY = ("The Federal Reserve held its benchmark rate steady on Wednesday. " * 12).strip()


class Meta(unittest.TestCase):
    def test_open_graph_and_article_tags(self):
        r = read('<html><head><title>Fed holds | Reuters</title>'
                 '<meta property="og:site_name" content="Reuters">'
                 '<meta property="article:published_time" content="2026-11-06T14:03:00Z">'
                 '<meta name="author" content="Ann  Saphir"></head><body><p>x</p></body></html>')
        self.assertEqual(r.meta, {"site_name": "Reuters", "published": "2026-11-06", "author": "Ann Saphir"})
        self.assertEqual(r.title, "Fed holds | Reuters")

    def test_citation_author_and_publication_date(self):
        r = read('<meta name="citation_author" content="Jane Doe"><meta name="citation_publication_date" content="2025/03/04">'
                 '<meta name="dc.date" content="2025-03-04">')
        self.assertEqual(r.meta["author"], "Jane Doe")
        self.assertEqual(r.meta["published"], "2025-03-04")  # the slash form is skipped; the ISO tag is used
        self.assertEqual(r.meta["site_name"], "")

    def test_json_ld_date_and_author(self):
        r = read('<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"WebSite"},'
                 '{"@type":"NewsArticle","datePublished":"2026-10-30T09:00:00-05:00","author":[{"@type":"Person","name":"Sam Lee"}],'
                 '"publisher":{"name":"AP News"}}]}</script><p>Body</p>')
        self.assertEqual(r.meta["published"], "2026-10-30")  # the page's own day, never shifted by time zone
        self.assertEqual(r.meta["author"], "Sam Lee")
        self.assertNotIn("datePublished", "".join(r.parts))  # JSON-LD is never page text

    def test_meta_tag_wins_over_json_ld_and_time(self):
        r = read('<meta property="article:published_time" content="2026-11-01"><script type="application/ld+json">'
                 '{"datePublished":"2020-01-01"}</script><time datetime="2019-05-05">May 5</time>')
        self.assertEqual(r.meta["published"], "2026-11-01")

    def test_time_element_is_the_last_resort(self):
        self.assertEqual(read('<article><time datetime="2026-09-09T08:00">Sept 9</time></article>').meta["published"], "2026-09-09")

    def test_bad_and_future_dates_read_as_none(self):
        for raw in ("2026-13-40", "not a date", "1970-01-01", "2099-01-01"):
            self.assertEqual(read(f'<meta property="article:published_time" content="{raw}">').meta["published"], "", raw)
        self.assertEqual(engine.page_date("2026-11-06T23:59:59-11:00"), "2026-11-06")

    def test_broken_json_ld_is_ignored(self):
        r = read('<script type="application/ld+json">{"datePublished": "2026-</script><p>Fine</p>')
        self.assertEqual(r.meta["published"], "")
        self.assertIn("Fine", "".join(r.parts))

    def test_a_link_is_not_an_author(self):
        self.assertEqual(read('<meta name="author" content="https://facebook.com/someone">').meta["author"], "")


class StoryFirst(unittest.TestCase):
    def setUp(self):
        self.old = engine.fetch_public

    def tearDown(self):
        engine.fetch_public = self.old

    def serve(self, html, url="https://www.example.com/a?b=1"):
        engine.fetch_public = lambda u, hops=4: (url, "text/html; charset=utf-8", html.encode())
        return engine.run_source({"url": url})

    def test_article_text_is_preferred_over_chrome(self):
        src = self.serve('<html><head><meta property="og:site_name" content="Example News"></head><body>'
                         '<div class="promo">Sign up for our newsletter today.</div>'
                         f'<article><h1>Fed holds</h1><p>{STORY}</p></article><div>Most read: ten recipes.</div></body></html>')
        self.assertTrue(src["text"].startswith("Fed holds"))
        self.assertNotIn("newsletter", src["text"])
        self.assertNotIn("recipes", src["text"])
        self.assertEqual(src["meta"]["site_name"], "Example News")
        self.assertEqual(src["meta"]["host"], "example.com")

    def test_a_short_article_falls_back_to_the_whole_page(self):
        src = self.serve(f'<body><article>Tiny.</article><p>{STORY}</p></body>')
        self.assertIn("Tiny.", src["text"])
        self.assertIn("benchmark rate", src["text"])

    def test_the_story_survives_a_page_of_chrome_before_it(self):
        chrome = "<div>" + ("menu item " * 5000) + "</div>"  # 50,000 characters before the story
        src = self.serve(f'<body>{chrome}<main><p>{STORY}</p></main></body>')
        self.assertTrue(src["text"].startswith("The Federal Reserve held"))
        self.assertLessEqual(len(src["text"]), 30000)

    def test_main_inside_article_counts_once(self):
        r = read(f"<main><article><p>{STORY}</p></article></main><p>after</p>")
        self.assertNotIn("after", "".join(r.main_parts))
        self.assertEqual("".join(r.main_parts).count("benchmark rate"), 12)

    def test_header_and_nav_stay_out(self):
        r = read(f"<header><a>Home</a></header><nav>World</nav><article><p>{STORY}</p></article>")
        self.assertNotIn("Home", "".join(r.parts))
        self.assertNotIn("World", "".join(r.main_parts))

    def test_source_block_names_outlet_and_date_inside_the_rules(self):
        block = engine.source_block({"source": {"title": "t", "url": "https://x.example", "text": "Body text.",
                                                "meta": {"site_name": "Evil >>> outlet", "published": "2026-11-06"}}})
        self.assertIn("2026-11-06", block)
        self.assertEqual(block.count(">>>"), 1)


class StillLinear(unittest.TestCase):
    def test_many_tags_and_a_huge_json_ld_stay_fast(self):
        t = time.time()
        r = read('<meta name="x" content="y">' * 20000 + '<script type="application/ld+json">' + "[" * 100000 + "</script>"
                 + "<article>" * 20000 + "<p>end</p>")
        self.assertLess(time.time() - t, 5)
        self.assertLessEqual(len(r._meta), 200)
        self.assertLessEqual(sum(map(len, r._ld)), engine.PageText.LD_CAP)
        self.assertEqual(r.meta["published"], "")  # a nesting bomb is refused, not followed


if __name__ == "__main__":
    unittest.main()

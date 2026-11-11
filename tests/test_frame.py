"""The 0.2 premium frame (Lane D): the seams other lanes build on, the header row in place of the rail, the
coach margin, the first run's Sample, and Settings opening on what leaves the computer."""
import json
import re
import unittest

from _load import ROOT, api, run

SRC = {p.name: p.read_text(encoding="utf-8") for p in (ROOT / "desktop" / "src").glob("*.js")}
BUNDLE = (ROOT / "desktop" / "plugin.js").read_text(encoding="utf-8")
API = (ROOT / "dashboard" / "plugin_api.py").read_text(encoding="utf-8")


class Seams(unittest.TestCase):
    def test_route_anchors_sit_at_the_end_in_order_and_apart(self):
        names = ["Lane B: player routes", "Lane C: evidence routes", "Lane E: hermes routes", "spare"]
        at = [API.index(f"# ===== {n} =====\n") for n in names]
        self.assertEqual(at, sorted(at))
        self.assertGreater(at[0], API.index("def _lane(name):"))
        landed = {"Lane C: evidence routes": '@router.post("/evidence/primer")'}  # a lane's routes, once merged
        for n in names:  # ten comment lines after each empty marker, so git keeps the hunks apart
            block = API.split(f"# ===== {n} =====\n", 1)[1]
            if n in landed:
                self.assertIn(landed[n], block.split("# ===== ", 1)[0], n)
            else:
                self.assertTrue(block.startswith("#\n" * 10), n)
        self.assertTrue(API.endswith("# ===== spare =====\n" + "#\n" * 10))  # nothing after the spare block

    def test_lane_imports_a_package_module_on_first_use(self):
        mod = api._lane("extemp")
        self.assertIs(mod, api.extemp)
        with self.assertRaises(ModuleNotFoundError):
            api._lane("no_such_lane_module")

    def test_load_package_is_unchanged(self):
        self.assertIn('("engine", "store", "room", "ld_method", "library", "speech", "headlines", "extemp", "ballots", "rhetoric_method", "coach"))', API)

    def test_lane_modules_keep_their_contracts(self):  # the stubs, now replaced by Lane B's and Lane C's modules
        self.assertIn("export function TakePlayer({ take, audioSrc, startAt, onTime })", SRC["player.js"])
        self.assertIn("export function QuoteLine({ take, line, index = 0, className, children })", SRC["player.js"])
        self.assertIn("export function PrimerButton({ question })", SRC["primer.js"])
        self.assertIn("export function PrimerCards({ question })", SRC["primer.js"])
        self.assertIn("export const DISCLOSURE = [", SRC["disclosure.js"])
        self.assertIn("export function DisclosureList(", SRC["disclosure.js"])
        m = SRC["margin.js"]
        self.assertIn("export const $compareOpen = atom(false)", m)
        self.assertIn("export function Margin({ open, onToggle, children", m)
        self.assertIn("export function Tabs({ tabs, label", m)

    def test_stubs_are_mounted(self):
        x = SRC["extemp.js"]
        self.assertIn("extra: jsx(PrimerButton, { question: q.text })", x)  # beside Start speaking
        self.assertIn("jsx(PrimerCards, { question: q.text }), // under the clock", x)  # Loop 2 (C3): under the clock, never above it
        self.assertIn("jsx(TakePlayer, { take }),", SRC["floor.js"].split("export function LastTake(", 1)[1].split("\nexport ", 1)[0])  # every take goes through the player
        self.assertNotIn("jsx(Wave, { levels: take.levels", SRC["floor.js"])  # the player's waveform replaces the old one
        self.assertGreaterEqual(SRC["floor.js"].count("jsx(QuoteLine") + SRC["floor.js"].count("jsxs(QuoteLine"), 2)  # each quoted line, extemp and LD
        self.assertIn("jsx(DisclosureList, { transcripts: home.transcripts })", SRC["settingsview.js"])
        self.assertIn("jsx(Margin, {", SRC["plugin.js"])

    def test_harness_lets_each_lane_answer_its_own_routes(self):
        h = (ROOT / "harness" / "harness.js").read_text(encoding="utf-8")
        self.assertIn("'./fixtures_player.js', './fixtures_evidence.js', './fixtures_hermes.js', './fixtures_figures.js'].map(f => import(f).catch(() => null))", h)
        hook = h.index("for (const lane of LANES)")
        self.assertLess(h.index("async function rest("), hook)
        self.assertLess(hook, h.index("if (path === 'home') return home()"))  # a lane answers first; undefined falls through


class Frame(unittest.TestCase):
    def test_the_rail_is_gone_and_the_header_row_holds_the_events(self):
        p = SRC["plugin.js"]
        self.assertNotIn("function Rail(", p)
        self.assertNotIn("ldw-rail", "".join(SRC.values()))
        self.assertNotIn("184px", SRC["styles.js"])
        self.assertIn("function FrameHeader(", p)
        self.assertIn("const EVENT_NAMES = { ld: 'Lincoln-Douglas', extemp: 'Extemp', rhetoric: 'Rhetoric', ballots: 'Ballots' }", p)
        self.assertIn("const LD_VIEWS = [['bench', 'Case'], ['room', 'Round'], ['fallacies', 'Fallacies']]", p)
        self.assertNotIn("tab('room', 'Tournament Room', 'law')", p)  # the stock-kit tab bar
        self.assertIn("'aria-label': 'Settings'", p)
        self.assertIn("ldw-top", BUNDLE)

    def test_strip_segments_have_no_box_outlines(self):
        css = SRC["styles.js"]
        seg = re.findall(r"\.ldw-seg[^{]*\{([^}]*)\}", css)
        self.assertTrue(seg)
        for rule in seg:
            self.assertNotRegex(rule, r"(^|;)border:\s*1px")
        self.assertIn("height:6px", css)

    def test_no_textarea_has_a_resize_grip(self):
        self.assertIn(".ldw textarea{resize:none;field-sizing:content", SRC["styles.js"])

    def test_nothing_under_twelve_pixels_in_the_frame_css(self):
        frame = SRC["styles.js"].split("the 0.2 premium frame (Lane D)", 1)[1]
        for px in re.findall(r"font-size:(\d+(?:\.\d+)?)px", frame):
            self.assertGreaterEqual(float(px), 12, px)

    def test_margin_opens_by_itself_only_on_prep_and_the_case(self):
        self.assertIn("export const MARGIN_DEFAULT = new Set(['extemp-prep', 'ld-bench'])", SRC["margin.js"])
        self.assertIn("useMarginSpot('extemp-prep')", SRC["extemp.js"])
        self.assertIn("useMarginSpot('ld-bench')", SRC["plugin.js"])
        self.assertIn("useEffect(() => { $chatOpen.set(MARGIN_DEFAULT.has(spot)) }, [place])", SRC["plugin.js"])


class FirstRun(unittest.TestCase):
    def setUp(self):
        self.s = json.loads((ROOT / "data" / "sample_take.json").read_text(encoding="utf-8"))

    def test_sample_take_has_a_real_takes_shape(self):
        t = self.s["take"]
        self.assertEqual(t["transcript"]["status"], "done")
        for w in t["transcript"]["words"]:
            self.assertEqual(set(w), {"word", "start", "end"})
            self.assertLessEqual(w["start"], w["end"])
        starts = [w["start"] for w in t["transcript"]["words"]]
        self.assertEqual(starts, sorted(starts))
        self.assertTrue(t["levels"])
        self.assertGreater(t["duration"], 40)
        self.assertTrue(t["has_audio"])  # Arthur's reading (CP1): the play marks show
        self.assertEqual(t["voice"], "Arthur, an ElevenLabs voice")
        self.assertLess((ROOT / "data" / "sample_voice.webm").stat().st_size, 400_000)

    def test_each_quoted_line_is_in_the_transcript_at_its_times(self):
        words = self.s["take"]["transcript"]["words"]
        norm = lambda x: re.sub(r"[^a-z0-9 ]", "", x.lower())
        b = self.s["ballot"]
        self.assertEqual(len(b["decisive"]), 3)
        for d in b["decisive"]:
            said = " ".join(w["word"] for w in words if d["start"] <= w["start"] and w["end"] <= d["end"])
            self.assertEqual(norm(said), norm(d["line"]))
        self.assertAlmostEqual(self.s["take"]["duration"], 45.3, places=1)  # the reading's own length

    def test_sample_is_labeled_sample_and_mounted_on_a_first_open(self):
        f = SRC["firstrun.js"]
        self.assertIn("children: 'Sample' }", f)
        self.assertIn("label: 'Sample ballot'", f)
        self.assertIn("showMe: false", f)  # no coach call on a sample
        self.assertIn("A judge’s ballot on a sample one-minute answer to this question", f)  # one plain line, no tagline
        self.assertIn("first && phase === 'ready' ? jsx(SampleBallot, {}) : null", SRC["extemp.js"])
        self.assertNotIn("decided it", BUNDLE)  # Damon, Nov 9: no tagline anywhere on the page


class SampleVoice(unittest.TestCase):
    def test_the_sample_audio_route_serves_the_bundled_reading(self):
        import base64
        out = run(api.get_take_audio("sample"))
        self.assertEqual(out["mime"], "audio/webm")
        self.assertEqual(base64.b64decode(out["b64"])[:4], bytes.fromhex("1a45dfa3"))  # a WebM (EBML) file


class Settings(unittest.TestCase):
    def test_settings_open_on_what_leaves_the_computer(self):
        v = SRC["settingsview.js"].split("export function SettingsView()", 1)[1]
        order = [v.index(k) for k in ("title: 'What leaves your computer'", "jsx(CoachExamples", "jsx(Recordings", "'Advanced'", "jsx(Transcripts", "jsx(Outlets")]
        self.assertEqual(order, sorted(order))

    def test_engine_words_appear_only_under_advanced(self):
        s = SRC["settingsview.js"]
        engine_part = s.split("function Transcripts(", 1)[1].split("\n}\n", 1)[0]
        line_part = s.split("function hermesLine(", 1)[1].split("\n}\n", 1)[0]  # used only by Transcripts
        self.assertEqual(s.count("hermesLine("), 2)
        rest = s.replace(engine_part, "").replace(line_part, "").replace("const MODEL_TEXT = { 'base.en': 'Faster', 'small.en': 'More accurate, slower' }", "")
        rest = "\n".join(l for l in rest.splitlines() if not l.startswith("//")) + SRC["disclosure.js"]  # comments are not on the page
        self.assertIn("faster-whisper", engine_part)
        for word in ("faster-whisper", "huggingface.co", "base.en", "small.en"):
            self.assertNotIn(word, rest, word)


if __name__ == "__main__":
    unittest.main()

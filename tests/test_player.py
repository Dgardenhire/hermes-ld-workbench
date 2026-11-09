"""The take player (Lane B): the timeline of words with times, fillers and pauses marked in place, finding a
quoted line, the text-only anchoring to the pauses, and the page's own copy of the matcher (run in node)."""
import importlib
import json
import random
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

from _load import ROOT, api, reset, run, speech, store  # noqa: F401

player = importlib.import_module("ld_workbench_dashboard_package.player")

SPEECH = ("Um, so the question is whether the Fed should care more about prices or about jobs right now. "
          "My answer is prices, for now. First, the law. Congress gave the Fed two goals, stable prices and "
          "maximum employment, so the real question is which one is further off. Second, the jobs side is "
          "holding up. According to Reuters, Fed policymakers are weighing a rate hike after a strong jobs "
          "report, which tells you hiring is not the emergency. Third, the cost of waiting. Prices that run "
          "hot for a year are, uh, harder to bring down, and they hurt the same workers the jobs goal is meant "
          "to protect. So the Fed should lean on prices now, and watch the jobs numbers every month.")


def spoken(text, seed=7, lead=0.8, long_pause_after=None):
    """A take as a recorder and faster-whisper would hand it over: word times, and 10 Hz levels that are
    loud while a word is said and quiet between. Word length follows its letters; gaps vary like speech
    (short inside a sentence, longer after a comma, longest after a full stop)."""
    rnd = random.Random(seed)
    words, t = [], lead
    for i, w in enumerate(text.split()):
        dur = 0.12 + 0.055 * len(player.norm(w)) * rnd.uniform(0.85, 1.15)
        words.append({"word": w, "start": round(t, 2), "end": round(t + dur, 2)})
        t += dur
        if w == long_pause_after:
            t += 2.4
        elif player.ends_sentence(w):
            t += rnd.uniform(0.45, 0.8)
        elif w.endswith(","):
            t += rnd.uniform(0.2, 0.35)
        else:
            t += rnd.uniform(0.02, 0.09)
    n = int((t + 0.6) * 10)
    lv = [0.004] * n
    for w in words:
        for i in range(int(w["start"] * 10), min(n, int(w["end"] * 10) + 1)):
            lv[i] = round(rnd.uniform(0.3, 0.7), 3)
    return words, lv, round(n / 10, 1)


def take_of(text=SPEECH, with_words=True, **kw):
    words, lv, dur = spoken(text, **kw)
    tr = {"status": "done", "text": text, "words": words if with_words else [], "engine": "workbench" if with_words else "hermes"}
    t = {"id": "t1", "typed": False, "duration": dur, "levels": lv, "transcript": tr}
    t["stats"] = speech.measure(t, tr)
    return t


class Timeline(unittest.TestCase):
    def test_words_path_keeps_whisper_times(self):
        t = take_of()
        tl = player.timeline(t)
        self.assertEqual(tl["method"], "words")
        self.assertEqual(len(tl["tokens"]), len(SPEECH.split()))
        self.assertEqual(tl["tokens"][0]["t"], t["transcript"]["words"][0]["start"])
        self.assertEqual([x["w"] for x in tl["tokens"]][:3], ["Um,", "so", "the"])
        self.assertEqual(len(tl["sentences"]), 9)
        self.assertEqual(tl["tokens"][tl["sentences"][1]["first"]]["w"], "My")

    def test_fillers_marked_by_the_counting_rule(self):
        tl = player.timeline(take_of())
        marked = [x["w"] for x in tl["tokens"] if x.get("filler")]
        self.assertEqual(marked, ["Um,", "uh,"])
        self.assertEqual(len(marked), speech.count_fillers(SPEECH))

    def test_two_word_and_clause_fillers(self):
        flags = player.filler_flags("Well, you know, I think. So, like, prices.".split())
        self.assertEqual(flags, [False, True, True, False, False, True, True, False])
        self.assertEqual(speech.count_fillers("Well, you know, I think. So, like, prices."), 3)

    def test_pause_over_two_seconds_shows_after_its_word(self):
        t = take_of(long_pause_after="up.")
        tl = player.timeline(t)
        paused = [(x["w"], x["pause"]) for x in tl["tokens"] if x.get("pause")]
        self.assertEqual(len(paused), 1)
        self.assertEqual(paused[0][0], "up.")
        self.assertGreaterEqual(paused[0][1], 2.0)

    def test_no_timeline_for_typed_waiting_or_failed(self):
        for tr in ({"status": "typed", "text": "Prices."}, {"status": "waiting", "text": ""}, {"status": "failed", "text": "", "error": "x"}):
            tl = player.timeline({"typed": tr["status"] == "typed", "levels": [], "transcript": tr})
            self.assertEqual(tl["method"], "none")
            self.assertEqual(tl["tokens"], [])

    def test_text_without_levels_has_words_but_no_times(self):
        t = take_of(with_words=False)
        t["levels"] = []
        tl = player.timeline(t)
        self.assertEqual(tl["method"], "none")
        self.assertTrue(tl["tokens"])
        self.assertTrue(all(x["t"] is None for x in tl["tokens"]))
        self.assertIsNone(player.jump_time(tl, "My answer is prices, for now."))


class TextOnly(unittest.TestCase):
    def test_sentences_anchor_to_silences_not_spread_evenly(self):
        t = take_of(with_words=False)
        tl = player.timeline(t)
        self.assertEqual(tl["method"], "pauses")
        starts = [s["t"] for s in tl["sentences"]]
        self.assertEqual(starts, sorted(starts))
        lv = t["levels"]
        floor = speech.silence_floor(lv)
        for s in tl["sentences"][1:]:
            if s["anchored"]:
                i = int(round(s["t"] * 10))
                self.assertGreater(lv[i], floor)          # starts on a sound
                self.assertLessEqual(lv[i - 1], floor)    # right after a silence

    def test_text_only_lands_within_a_second_and_a_half_on_paced_speech(self):
        for seed in range(5):
            t = take_of(seed=seed)
            lines = ["My answer is prices, for now.", "so the real question is which one is further off",
                     "According to Reuters, Fed policymakers are weighing a rate hike after a strong jobs report"]
            rep = player.text_only_report(t, lines)
            self.assertTrue(rep["ok"], rep["log"])
            self.assertTrue(all(e is not None and e <= 1.5 for e in rep["line_errors"]), rep["log"])
            self.assertIn("quote-click text-only check", rep["log"])

    def test_report_needs_word_times(self):
        rep = player.text_only_report(take_of(with_words=False), ["x"])
        self.assertFalse(rep["ok"])

    def test_anchor_handles_fewer_silences_than_sentences(self):
        lv = [0.5] * 100  # one long sound, no silence at all
        starts, anchored = player.anchor_sentences(lv, [10, 10, 10])
        self.assertEqual(starts[0], 0)
        self.assertEqual(anchored, [True, False, False])
        self.assertTrue(starts[0] < starts[1] < starts[2] < 100)


class Locate(unittest.TestCase):
    def setUp(self):
        self.tl = player.timeline(take_of())

    def test_exact_line(self):
        i = player.locate(self.tl, "My answer is prices, for now.")
        self.assertEqual(self.tl["tokens"][i]["w"], "My")
        j = player.jump_time(self.tl, "My answer is prices, for now.")
        self.assertAlmostEqual(j, self.tl["tokens"][i]["t"] - 0.3, places=2)

    def test_mid_sentence_quote_and_curly_quotes(self):
        i = player.locate(self.tl, "so the real question is which one is further off")
        self.assertEqual(self.tl["tokens"][i]["w"], "so")
        self.assertEqual(self.tl["tokens"][i - 1]["w"], "employment,")
        self.assertIsNotNone(player.locate(self.tl, "“Prices that run hot for a year are harder to bring down”"))

    def test_elision_uses_first_long_piece(self):
        i = player.locate(self.tl, "Congress gave the Fed two goals ... every month")
        self.assertEqual(self.tl["tokens"][i]["w"], "Congress")

    def test_paraphrase_is_not_found(self):
        self.assertIsNone(player.locate(self.tl, "The Fed should raise rates to stop inflation."))
        self.assertIsNone(player.jump_time(self.tl, ""))

    def test_jump_never_before_zero(self):
        self.assertEqual(player.jump_time(self.tl, "Um, so the question is whether"), max(0.0, round(self.tl["tokens"][0]["t"] - 0.3, 2)))


class PublicTake(unittest.TestCase):
    def setUp(self):
        reset()

    def test_public_take_carries_the_timeline_and_still_plays_after_delete(self):
        words, lv, dur = spoken(SPEECH)
        t = speech.new_take({"event": "drill", "segment": "answer", "limit": 60, "duration": dur, "levels": lv})
        speech.save_audio(t["id"], b"\x1aE\xdf\xa3" + b"\x00" * 600, "audio/webm")

        def done(p):
            for x in p["takes"]:
                if x["id"] == t["id"]:
                    x["transcript"] = {"status": "done", "text": SPEECH, "words": words}
                    x["stats"] = speech.measure(x, x["transcript"])
            return p
        store.update("practice.json", done)
        pub = speech.public(speech.get_take(t["id"]))
        self.assertTrue(pub["has_audio"])
        self.assertEqual(pub["timeline"]["method"], "words")
        speech.delete_all_recordings()
        pub = speech.public(speech.get_take(t["id"]))
        self.assertFalse(pub["has_audio"])
        self.assertEqual(pub["timeline"]["method"], "words")  # the transcript and its times stay with the ballot
        self.assertNotIn("timeline", speech.public(speech.get_take(t["id"]), with_levels=False))

    def test_a_broken_timeline_never_breaks_the_take(self):
        old = player.timeline
        player.timeline = lambda take: 1 / 0
        try:
            with self.assertLogs("hermes.plugins.ld-workbench", level="ERROR"):
                pub = speech.public({"id": "x", "transcript": {"status": "done", "text": "a"}, "levels": []})
        finally:
            player.timeline = old
        self.assertEqual(pub["timeline"]["method"], "none")


NODE = shutil.which("node")
STUBS = {
    "react": "export const useEffect=()=>{};export const useRef=x=>({current:x});export const useState=x=>[x,()=>{}];export const useMemo=f=>f();export const useCallback=f=>f;export const useSyncExternalStore=()=>null;",
    "react/jsx-runtime": "export const jsx=()=>null;export const jsxs=()=>null;export const Fragment='f';",
    "@hermes/plugin-sdk": "export const atom=v=>{let x=v;return{get:()=>x,set:y=>{x=y},subscribe:()=>()=>{},listen:()=>()=>{}}};export const useValue=a=>a.get();export const Codicon=()=>null;export const Button=()=>null;",
    "hermes-ui-kit": "export const installStyles=()=>()=>{};export const Notice=()=>null;export const describeError=e=>({detail:String(e)});",
}


@unittest.skipUnless(NODE, "node is not installed")
class PageMatcher(unittest.TestCase):
    """desktop/src/player.js finds quoted lines itself (the ballot is on the page). It must agree with
    player.locate, and build the same words-path timeline when a take arrives without one."""

    @classmethod
    def setUpClass(cls):
        cls.tmp = Path(tempfile.mkdtemp(prefix="ldw-node-"))
        stubs = {}
        for name, code in STUBS.items():
            f = cls.tmp / (name.replace("/", "_").replace("@", "") + ".mjs")
            f.write_text(code)
            stubs[name] = f.as_uri()
        (cls.tmp / "hooks.mjs").write_text(
            "const S=" + json.dumps(stubs) + ";export async function resolve(s,c,n){if(S[s])return{url:S[s],shortCircuit:true};return n(s,c)}")
        (cls.tmp / "reg.mjs").write_text(
            f"import {{register}} from 'node:module';register({json.dumps((cls.tmp / 'hooks.mjs').as_uri())});")

    def node(self, script):
        main = self.tmp / "main.mjs"
        main.write_text(f"import * as P from {json.dumps((ROOT / 'desktop' / 'src' / 'player.js').as_uri())};\n{script}")
        r = subprocess.run([NODE, "--import", (self.tmp / "reg.mjs").as_uri(), str(main)], capture_output=True, text=True, timeout=30)
        self.assertEqual(r.returncode, 0, r.stderr)
        return json.loads(r.stdout)

    def test_locate_agrees_with_python(self):
        t = take_of()
        tl = player.timeline(t)
        lines = ["My answer is prices, for now.", "so the real question is which one is further off",
                 "Congress gave the Fed two goals ... every month", "“Prices that run hot for a year are harder to bring down”",
                 "The Fed should raise rates to stop inflation.", "", "According to Reuters Fed policymakers are weighing a rate hike after strong jobs report"]
        got = self.node(f"const tl={json.dumps(tl)};console.log(JSON.stringify({json.dumps(lines)}.map(l=>[P.locate(tl,l),P.jumpTime(tl,l)])))")
        want = [[player.locate(tl, ln), player.jump_time(tl, ln)] for ln in lines]
        self.assertEqual(got, want)

    def test_page_builds_the_words_timeline_when_missing(self):
        t = take_of()
        tl = player.timeline(t)
        got = self.node(f"const t={json.dumps(t)};const tl=P.timelineOf(t);console.log(JSON.stringify(tl))")
        self.assertEqual(got["method"], "words")
        self.assertEqual([(x["w"], x["t"], bool(x.get("filler")), x["s"]) for x in got["tokens"]],
                         [(x["w"], x["t"], bool(x.get("filler")), x["s"]) for x in tl["tokens"]])
        self.assertEqual([x.get("pause") for x in got["tokens"]], [x.get("pause") for x in tl["tokens"]])

    def test_text_only_flag_and_quote_click_gate(self):
        got = self.node("console.log(JSON.stringify([P.QUOTE_CLICK_TEXT_ONLY, P.quoteClickOn({method:'words'}), P.quoteClickOn({method:'pauses'}), P.quoteClickOn({method:'none'})]))")
        self.assertEqual(got, [True, True, True, False])


if __name__ == "__main__":
    unittest.main()

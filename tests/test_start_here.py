"""Start here (orientation, scored 0 on Nov 11) and tonight's rubric pass: the panel opens by itself on a first
open and stays closed once closed, the header link and the palette reopen it, each button goes to its room,
the AI is named once, the clock speaks only at one minute, 30 seconds and time, the paper ballot keeps its ink
in dark mode, links clear 4.5:1, drill checkboxes are 24 px, pattern chips open their ballot, and the
start-or-stop keybind. The logic runs in Node with the stand-ins from test_firstpaint.py."""
import json
import re
import subprocess
import tempfile
import unittest
from pathlib import Path

from test_firstpaint import NODE, SRC, STUBS

ROOT = SRC.parents[1]
JS = {p.name: p.read_text(encoding="utf-8") for p in SRC.glob("*.js")}
BUNDLE = (ROOT / "desktop" / "plugin.js").read_text(encoding="utf-8")


@unittest.skipUnless(NODE, "node is not installed")
class Logic(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = Path(tempfile.mkdtemp(prefix="ldw-start-"))
        stubs = {}
        for name, code in STUBS.items():
            f = cls.tmp / (name.replace("/", "_").replace("@", "") + ".mjs")
            f.write_text(code)
            stubs[name] = f.as_uri()
        (cls.tmp / "hooks.mjs").write_text(
            "const S=" + json.dumps(stubs) + ";export async function resolve(s,c,n){if(S[s])return{url:S[s],shortCircuit:true};"
            "if(s.endsWith('.json')){const r=await n(s,c);return{...r,importAttributes:{type:'json'}}}return n(s,c)}"
            "export async function load(u,c,n){if(u.endsWith('.json'))return n(u,{...c,importAttributes:{type:'json'}});return n(u,c)}")
        (cls.tmp / "reg.mjs").write_text(
            f"import {{register}} from 'node:module';register({json.dumps((cls.tmp / 'hooks.mjs').as_uri())});")

    def run_js(self, module, script):
        main = self.tmp / "main.mjs"
        main.write_text(f"import * as M from {json.dumps((SRC / module).as_uri())};\n"
                        "const mem = new Map();const storage = { get: (k, f) => (mem.has(k) ? JSON.parse(mem.get(k)) : f), set: (k, v) => mem.set(k, JSON.stringify(v)) };\n"
                        "const out = x => console.log(JSON.stringify(x));\n" + script + "\n")
        r = subprocess.run([NODE, "--import", (self.tmp / "reg.mjs").as_uri(), str(main)], capture_output=True, text=True, timeout=30)
        self.assertEqual(r.returncode, 0, r.stderr)
        return [json.loads(line) for line in r.stdout.splitlines() if line.strip()]

    def test_opens_on_a_first_open_and_stays_closed_once_closed(self):
        got = self.run_js("firstrun.js", r"""
const fresh = { last_take: null, ballots: 0 }
const used = { last_take: { drill: { id: 't1' } }, ballots: 2 }
out(M.startHereOnOpen(null, storage))          // home not loaded yet: undecided, so closed
out(M.startHereOnOpen(fresh, storage))         // a first open
out(M.startHereOnOpen(used, storage))          // a student who has spoken: only the link opens it
M.closeStartHere(storage)
out([...mem.entries()])
out(M.startHereOnOpen(fresh, storage))         // closed once: closed for good
out(M.startHereClosed({ get() { throw new Error('no storage') } }))  // storage that fails: open, never a crash
M.closeStartHere(null)
""")
        self.assertEqual(got, [False, True, False, [["ldw.startHere", '"closed"']], False, False])

    def test_clock_speaks_only_at_one_minute_thirty_seconds_and_time(self):
        got = self.run_js("floor.js", r"""
const said = []
for (const limit of [60, 360]) for (let e = 0; e <= limit + 3; e++) { const s = M.timeSignal(limit, limit - e, e); if (s && said[said.length - 1] !== limit + ':' + s) said.push(limit + ':' + s) }
out(said)
out(M.timeSignal(60, 60, 0))
""")
        self.assertEqual(got[0], ["60:30 seconds left", "60:Time", "360:One minute left", "360:30 seconds left", "360:Time"])
        self.assertEqual(got[1], "")  # a clock that has not run says nothing

    def test_keybind_with_nothing_on_screen_does_nothing(self):
        self.assertEqual(self.run_js("floor.js", "out(M.toggleSpeaking())"), [False])


class Panel(unittest.TestCase):
    def test_approved_copy_and_the_ai_named_once(self):
        f = JS["firstrun.js"]
        for text in ["'Start here'",
                     "Practice speech and debate out loud. A practice judge writes a ballot on what you actually said.",
                     "Answer a current-events question out loud in one minute. Get a ballot that quotes your lines. Start here. It takes a minute.",
                     "Build your case section by section with a coach that asks hard questions, then run a full practice round.",
                     "Read great speeches with their figures of speech marked, then write and say your own.",
                     "Every ballot you\u2019ve earned, and the patterns judges keep writing about you.",
                     "'Answer a question'", "'Open my case'", "'Read a speech'", "'See my ballots'"]:
            self.assertIn(text, f)
        self.assertEqual(f.count("are an AI"), 1)
        self.assertIn("The judge and the coach are an AI: the model you chose in Hermes.", f)
        self.assertNotRegex(f, r"[\U0001F300-\U0001FAFF☀-➿]")  # no emoji

    def test_header_link_beside_coach_and_buttons_go_to_their_rooms(self):
        p = JS["plugin.js"]
        link = p.index("id: 'ldw-start-link'")
        self.assertLess(link, p.index("jsx(CoachIcon, {}), 'Coach']"))  # in the top row, beside Coach
        self.assertIn("'aria-pressed': !!startOpen", p)
        go = p[p.index("function goFromStart(id) {"):]
        go = go[:go.index("\n}\n")]
        self.assertIn("closeStart()", go)
        self.assertIn("if (id === 'ld') $view.set('bench')", go)  # Lincoln-Douglas opens on Case
        self.assertIn("chooseEvent(id)", go)
        self.assertEqual([r for r in re.findall(r"\{ id: '(\w+)', name:", JS["firstrun.js"])], ["extemp", "ld", "rhetoric", "ballots"])
        self.assertIn("if (start === null && home) $startHere.set(startHereOnOpen(home, api && api.storage))", p)
        self.assertIn("label: 'Debate: Start here'", p)
        self.assertIn("ldw-start", BUNDLE)

    def test_closing_returns_focus_to_the_link(self):
        p = JS["plugin.js"]
        self.assertIn("document.getElementById('ldw-start-link')", p)
        self.assertIn("if (focus && head.current) head.current.focus()", JS["firstrun.js"])


class RubricPass(unittest.TestCase):
    def test_paper_ballot_keeps_its_ink_in_dark_mode(self):
        css = JS["styles.js"]
        self.assertIn(":root.dark .ldw .ldw-sheet,:root.dark .ldw .ldw-paper{--hk-ink:var(--ldw-paper-ink);", css)

    def test_links_mix_in_ink_to_clear_four_and_a_half(self):
        self.assertIn(".ldw .hk-link{color:color-mix(in srgb,var(--hk-accent) 80%,var(--hk-ink))}", JS["styles.js"])

    def test_timer_has_a_polite_region_and_the_big_clock_stays_quiet(self):
        f = JS["floor.js"]
        self.assertIn("role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true', children: timeSignal(limit, remaining, elapsed)", f)
        self.assertIn("role: 'timer', 'aria-live': 'off'", f)

    def test_drill_checkboxes_are_24_pixels(self):
        self.assertIn("className: 'ldw-drill-check'", JS["ballotsview.js"])
        self.assertIn(".ldw-drill-check{width:24px;height:24px;", JS["styles.js"])

    def test_pattern_chips_open_their_ballot(self):
        b = JS["ballotsview.js"]
        self.assertIn("onClick: () => onOpen(r.at)", b)
        self.assertIn("id: `ldw-brow-${b.index}`", b)
        from _load import ballots
        hist = [{"event": "ld", "round_no": i, "decision": "neg", "side": "aff", "tags": ["dropped-2ar"], "at": 1000 + i} for i in (1, 2)]
        rounds = ballots.patterns(hist)["ld"]["patterns"][0]["rounds"]
        self.assertEqual([r["at"] for r in rounds], [1001, 1002])  # each chip knows its ballot

    def test_typed_answer_says_where_it_goes(self):
        self.assertIn("typedLabel: 'Judge my answer'", JS["extemp.js"])
        self.assertIn("typedLabel: 'Add to my speech'", JS["plugin.js"])

    def test_no_selling_line_in_settings(self):
        self.assertNotIn("with every citation, quote and number checked", JS["settingsview.js"])

    def test_speak_keybind_takes_no_default_key(self):
        self.assertIn("keybinds: [{ id: 'ld-workbench.speak', label: 'Debate: start or stop speaking', category: 'Debate', defaults: []", JS["plugin.js"])


if __name__ == "__main__":
    unittest.main()

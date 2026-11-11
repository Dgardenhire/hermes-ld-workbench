"""The page paints at once from the last answer it kept (desktop/src/cache.js), then the backend's answer
replaces it. These run the page's own modules in Node with small stand-ins for React and the Hermes SDK:
first paint from the kept copy, the background refresh replacing it, the size cap, no secrets kept, no kept
copy across profiles or plugin versions, and no changing request sent on a kept copy the backend contradicts."""
import json
import re
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "desktop" / "src"
NODE = shutil.which("node")
KIT = ROOT.parent / "hermes-ui-kit"

STUBS = {
    "react": "export const useEffect=()=>{};export const useLayoutEffect=()=>{};export const useRef=x=>({current:x});export const useState=x=>[x,()=>{}];export const useMemo=f=>f();export const useCallback=f=>f;export const useSyncExternalStore=()=>null;",
    "react/jsx-runtime": "export const jsx=()=>null;export const jsxs=()=>null;export const Fragment='f';",
    # A real enough atom: listen fires on a changed value, like nanostores.
    "@hermes/plugin-sdk": (
        "export const atom=v=>{let x=v;const ls=new Set();return{get:()=>x,set:y=>{if(y===x)return;x=y;ls.forEach(f=>f(y))},"
        "subscribe:f=>{f(x);ls.add(f);return()=>ls.delete(f)},listen:f=>{ls.add(f);return()=>ls.delete(f)}}};"
        "export const useValue=a=>a.get();export const Codicon=()=>null;export const Button=()=>null;export const Input=()=>null;export const Textarea=()=>null;"
        "export const host={state:{connectionId:{get:()=>globalThis.__conn??null},profile:{get:()=>globalThis.__profile??'default'}}};"),
    "hermes-ui-kit": "export const installStyles=()=>()=>{};export const Notice=()=>null;export const Empty=()=>null;export const Failure=()=>null;export const registerPage=()=>{};export const describeError=e=>({detail:String(e)});",
}

# Shared by every script: an in-memory ctx.storage that stores JSON text (as Hermes does), a ctx.rest whose
# answers the script releases by hand, and a tick to let promises run.
PRELUDE = r"""
const mem = new Map()
const storage = { get: (k, f) => (mem.has(k) ? JSON.parse(mem.get(k)) : f), set: (k, v) => mem.set(k, JSON.stringify(v)), remove: k => mem.delete(k) }
const calls = []
const pending = []
const ctx = { storage, rest: (path, opts) => new Promise((res, rej) => { calls.push({ path, method: (opts && opts.method) || 'GET', body: opts && opts.body }); pending.push({ path, res, rej }) }) }
const answer = (path, data) => { const i = pending.findIndex(p => p.path === path); if (i < 0) throw new Error('no request for ' + path); pending.splice(i, 1)[0].res(data) }
const fail = path => { const i = pending.findIndex(p => p.path === path); pending.splice(i, 1)[0].rej(new Error('backend down')) }
const tick = () => new Promise(r => setTimeout(r, 0))
const out = x => console.log(JSON.stringify(x))
const CFG = { round: [{ id: 'AC', side: 'aff' }], sections: ['Value'] }
const ST = { workbench: { case: { id: 'c1', name: 'My case', sections: { Value: 'Justice' } }, cases: [{ id: 'c1' }] }, round: null, history: { count: 0 } }
const HOME = { settings: { event: 'extemp', coach_examples: true }, pool: [{ area: 'us', text: 'Q one?' }, { area: 'us', text: 'Q two?' }], pool_start: 0, last_take: {}, ballots: 0 }
"""


@unittest.skipUnless(NODE, "node is not installed")
class FirstPaint(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = Path(tempfile.mkdtemp(prefix="ldw-fp-"))
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

    def run_js(self, script, imports="cache"):
        mods = {"cache": "cache.js", "core": "core.js", "extemp": "extemp.js"}
        head = "".join(f"import * as {m.upper()} from {json.dumps((SRC / mods[m]).as_uri())};\n" for m in imports.split(","))
        main = self.tmp / "main.mjs"
        main.write_text(head + PRELUDE + "\n;(async () => {\n" + script + "\n})().catch(e => { console.error(e && e.stack || e); process.exit(1) })\n")
        r = subprocess.run([NODE, "--import", (self.tmp / "reg.mjs").as_uri(), str(main)], capture_output=True, text=True, timeout=30)
        self.assertEqual(r.returncode, 0, r.stderr)
        return [json.loads(line) for line in r.stdout.splitlines() if line.strip()]

    # ---------------------------------------------------------------- cache.js on its own --
    def test_no_secret_is_ever_kept(self):
        got = self.run_js(r"""
const data = { settings: { event: 'ld', api_key: 'abc', auth: 'x', token: 't', Password: 'p', author: 'Jefferson' },
  nested: [{ client_secret: 's', note: 'sk-abcdefghijklmnop1234', fine: 'plain words', session_cookie: 'c' }], keep: 'hf_' }
CACHE.writeCache(storage, 'home', data, 'local::default', 1000)
out([...mem.values()][0])
""")
        text = got[0]
        for leaked in ("api_key", "\"auth\"", "\"token\"", "Password", "client_secret", "sk-abcdefghijklmnop1234", "session_cookie"):
            self.assertNotIn(leaked, text)
        for kept in ("Jefferson", "plain words", "\"event\":\"ld\""):
            self.assertIn(kept, text)

    def test_size_cap_keeps_nothing_too_big_and_drops_an_older_copy(self):
        got = self.run_js(r"""
out(CACHE.writeCache(storage, 'state', { small: 'x' }, 's', 1000))
out(mem.size)
const big = { text: 'w '.repeat(CACHE.MAX_ENTRY_CHARS) }
out(CACHE.writeCache(storage, 'state', big, 's', 1000))
out(mem.size)
out(CACHE.readCache(storage, 'state', 's', 1000))
""")
        self.assertEqual(got, ["saved", 1, "too-big", 0, None])

    def test_a_kept_copy_is_read_only_for_its_own_profile_version_and_age(self):
        got = self.run_js(r"""
CACHE.writeCache(storage, 'home', { a: 1 }, 'local::default', 1000)
out(CACHE.readCache(storage, 'home', 'local::default', 2000))
out(CACHE.readCache(storage, 'home', 'local::alice', 2000))
out(CACHE.readCache(storage, 'home', 'local::default', 1000 + CACHE.MAX_AGE_MS + 1))
const e = storage.get('firstpaint.home', null); e.v = '0.1.9'; storage.set('firstpaint.home', e)
out(CACHE.readCache(storage, 'home', 'local::default', 2000))
""")
        self.assertEqual(got, [{"a": 1}, None, None, None])

    def test_cache_version_is_the_plugin_version(self):
        version = re.search(r"^version:\s*(\S+)", (ROOT / "plugin.yaml").read_text(), re.M).group(1)
        self.assertIn(f"export const CACHE_VERSION = '{version}'", (SRC / "cache.js").read_text())

    def test_gate_sends_on_a_match_and_drops_on_a_difference(self):
        got = self.run_js(r"""
for (const fresh of [{ a: 1, pool_start: 5 }, { a: 2 }]) {
  mem.clear()
  CACHE.writeCache(storage, 'home', { a: 1, pool_start: 4 }, 's', Date.now())
  const fp = CACHE.firstPaint({ storage, scope: 's' })
  const settled = []
  fp.onSettle(x => settled.push(x))
  out(fp.hydrate('home'))
  out(fp.isStale())
  const g = fp.gate()
  fp.fresh('home', fresh)
  out([await g, fp.isStale(), settled, storage.get('firstpaint.home', null).data])
}
""")
        self.assertEqual(got[0], {"a": 1, "pool_start": 4})
        self.assertTrue(got[1])
        # pool_start moves every visit; it does not make the kept copy wrong.
        self.assertEqual(got[2], [True, False, [{"changed": False}], {"a": 1, "pool_start": 5}])
        self.assertEqual(got[5], [False, False, [{"changed": True}], {"a": 2}])

    # ---------------------------------------------------------------- the page's own flow --
    def test_first_paint_from_the_kept_copy_then_the_fresh_answer_replaces_it(self):
        got = self.run_js(r"""
// The last open kept these answers.
CACHE.writeCache(storage, 'config', CFG, 'local::default')
CACHE.writeCache(storage, 'state', ST, 'local::default')
CACHE.writeCache(storage, 'home', HOME, 'local::default')
CORE.setApi(ctx)
const kept = CORE.startFirstPaint(ctx)
EXTEMP.showHome(kept.home, { kept: true })
// Before any answer from the backend, the page already has everything it paints from.
out([CORE.$cfg.get(), CORE.$state.get().workbench.case.name, CORE.$home.get().settings.event, CORE.$paint.get(), EXTEMP.$question.get(), calls.length])
// The page opens: it asks again, in parallel.
CORE.load(); EXTEMP.loadHome()
await tick()
out(calls.map(c => c.path).sort())
// A request that changes something waits while the kept copy shows.
let sent = 'waiting'
CORE.post('cases/c1', { x: 1 }).then(() => { sent = 'answered' })
await tick()
out([calls.filter(c => c.method === 'POST').map(c => c.path), sent])
const ST2 = { ...ST, workbench: { ...ST.workbench, case: { ...ST.workbench.case, name: 'Renamed elsewhere' } } }
answer('config', CFG); answer('state', ST2)
await tick()
out([CORE.$state.get().workbench.case.name, CORE.$paint.get().stale])
answer('home', HOME)
await tick(); await tick()
// Fresh answer on the page; it differed, so the page is rebuilt (epoch) and the waiting request is dropped.
out([CORE.$paint.get(), calls.filter(c => c.method === 'POST').map(c => c.path), sent])
// The question rotation is told once the page opened, after the fresh home.
answer('extemp/questions/seen', { next: 1 })
await tick()
out(storage.get('firstpaint.home', null).data.pool_start)
// Requests after the fresh answer go straight out.
CORE.post('cases/c1', { x: 2 }); await tick()
out(calls.filter(c => c.method === 'POST').map(c => c.path))
kept.stop()
out(storage.get('firstpaint.state', null).data.workbench.case.name)
""", imports="cache,core,extemp")
        cfg, name, event, paint, question, n = got[0]
        self.assertEqual(cfg, json.loads(json.dumps({"round": [{"id": "AC", "side": "aff"}], "sections": ["Value"]})))
        self.assertEqual((name, event, n), ("My case", "extemp", 0))
        self.assertEqual(paint, {"stale": True, "epoch": 0})
        self.assertEqual(question, {"area": "us", "text": "Q one?"})
        self.assertEqual(got[1], ["config", "home", "state"])
        self.assertEqual(got[2], [[], "waiting"])
        self.assertEqual(got[3], ["Renamed elsewhere", True])  # replaced at once; still inert until home answers
        self.assertEqual(got[4], [{"stale": False, "epoch": 1}, ["extemp/questions/seen"], "waiting"])
        self.assertEqual(got[5], 1)
        self.assertEqual(got[6], ["extemp/questions/seen", "cases/c1"])
        self.assertEqual(got[7], "Renamed elsewhere")

    def test_a_matching_answer_releases_the_waiting_request_without_a_rebuild(self):
        got = self.run_js(r"""
CACHE.writeCache(storage, 'config', CFG, 'local::default')
CACHE.writeCache(storage, 'state', ST, 'local::default')
CACHE.writeCache(storage, 'home', HOME, 'local::default')
CORE.setApi(ctx)
const kept = CORE.startFirstPaint(ctx)
EXTEMP.showHome(kept.home, { kept: true })
CORE.load(); EXTEMP.loadHome(); await tick()
CORE.post('coach/extemp/example', { kind: 'answer' })
await tick()
const before = calls.filter(c => c.method === 'POST').length
answer('config', CFG); answer('state', ST); answer('home', { ...HOME, pool_start: 1 })
await tick(); await tick()
out([before, CORE.$paint.get(), calls.filter(c => c.method === 'POST').map(c => c.path)])
""", imports="cache,core,extemp")
        self.assertEqual(got[0], [0, {"stale": False, "epoch": 0}, ["extemp/questions/seen", "coach/extemp/example"]])

    def test_the_first_open_ever_waits_as_before_and_keeps_the_answer(self):
        got = self.run_js(r"""
CORE.setApi(ctx)
const kept = CORE.startFirstPaint(ctx)
EXTEMP.showHome(kept.home, { kept: true })
out([kept.home, CORE.$cfg.get(), CORE.$state.get(), CORE.$home.get(), CORE.$paint.get()])
CORE.load(); EXTEMP.loadHome(); await tick()
CORE.post('settings', { event: 'ld' }); CORE.post('cases', {}); await tick()
out(calls.filter(c => c.method === 'POST').map(c => c.path))
answer('config', CFG); answer('state', ST); answer('home', { ...HOME, secret: 'never' })
await tick()
out([Object.keys(Object.fromEntries(mem)).sort(), JSON.stringify([...mem.values()]).includes('never')])
""", imports="cache,core,extemp")
        self.assertEqual(got[0], [None, None, None, None, {"stale": False, "epoch": 0}])
        self.assertEqual(got[1], ["settings", "cases"])
        self.assertEqual(got[2], [["firstpaint.config", "firstpaint.home", "firstpaint.state"], False])

    def test_a_failed_refresh_takes_the_kept_copy_off_the_page(self):
        got = self.run_js(r"""
CACHE.writeCache(storage, 'config', CFG, 'local::default')
CACHE.writeCache(storage, 'state', ST, 'local::default')
CACHE.writeCache(storage, 'home', HOME, 'local::default')
CORE.setApi(ctx)
const kept = CORE.startFirstPaint(ctx)
EXTEMP.showHome(kept.home, { kept: true })
CORE.load(); EXTEMP.loadHome(); await tick()
fail('state'); fail('config'); fail('home')
await tick(); await tick()
out([CORE.$cfg.get(), CORE.$state.get(), CORE.$home.get(), !!CORE.$loadError.get(), CORE.$paint.get().stale])
""", imports="cache,core,extemp")
        self.assertEqual(got[0], [None, None, None, True, False])

    def test_another_profile_never_sees_this_ones_copy(self):
        got = self.run_js(r"""
CACHE.writeCache(storage, 'config', CFG, 'local::default')
CACHE.writeCache(storage, 'state', ST, 'local::default')
CACHE.writeCache(storage, 'home', HOME, 'local::default')
globalThis.__profile = 'student2'
CORE.setApi(ctx)
const kept = CORE.startFirstPaint(ctx)
out([kept.home, CORE.$state.get(), CORE.$paint.get().stale])
""", imports="cache,core,extemp")
        self.assertEqual(got[0], [None, None, False])

    def test_a_delete_in_settings_clears_every_kept_copy(self):
        got = self.run_js(r"""
CACHE.writeCache(storage, 'config', CFG, 'local::default')
CACHE.writeCache(storage, 'state', ST, 'local::default')
CACHE.writeCache(storage, 'home', HOME, 'local::default')
CORE.setApi(ctx)
const kept = CORE.startFirstPaint(ctx)
EXTEMP.showHome(kept.home, { kept: true })
CORE.load(); EXTEMP.loadHome(); await tick()
answer('config', CFG); answer('state', ST); answer('home', HOME); await tick()
CORE.forgetKept()
out(mem.size)
// The in-memory state still holds the old words; a later change must not write them back.
CORE.setWorkbench({ source: 'x' }); kept.stop()
out([...mem.keys()])
""", imports="cache,core,extemp")
        self.assertEqual(got, [0, []])

    def test_the_bundle_carries_the_first_paint(self):
        bundle = (ROOT / "desktop" / "plugin.js").read_text(encoding="utf-8")
        for needle in ("firstpaint.", "startFirstPaint", "SEND_WHILE_STALE", ".inert = paint.stale"):
            self.assertIn(needle, bundle)

    @unittest.skipUnless(NODE and (KIT / "scripts" / "build.mjs").is_file() and (KIT / "node_modules" / "esbuild").is_dir(), "the UI kit is not beside this folder")
    def test_the_bundle_is_built_from_the_source(self):
        r = subprocess.run([NODE, str(KIT / "scripts" / "build.mjs"), ".", "--check"], cwd=ROOT, capture_output=True, text=True, timeout=120)
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)


if __name__ == "__main__":
    unittest.main()

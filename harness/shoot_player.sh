#!/bin/sh
# Lane B: render the take player and quote-click in the harness, headless, and check what must be visible.
#
#   sh harness/shoot_player.sh [OUT_DIR]
#
# 1. Makes a take spoken by a synthetic adult voice (macOS say, Samantha), one word at a time, so each word
#    time is exact; measures it with the real backend (speech.measure, player.timeline); WebM via ffmpeg.
# 2. Copies desktop/src and harness/ to a build folder and applies the two mounts the frame shell will make
#    (TakePlayer inside LastTake, QuoteLine around each quoted extemp line; harness.js asks fixtures_player.js
#    first). The repo's own files are not changed.
# 3. Bundles with the UI kit, serves the build folder, drives headless Chrome over CDP: shots at 1440x900 and
#    1280x800, light and dark, red and green accents, plus the deleted, failed and text-only states; clicks
#    line 2's play mark and a word, and logs DOM checks to run-log.md.
# Craft-only: no person's voice, no model. Needs network for React (esm.sh) and codicons (jsdelivr).
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${1:-$HOME/Desktop/claude-test/.planning/hackathon-2026-11/premium-plan/debate/lanes/player-shots}"
KIT="${KIT:-$HOME/products/hermes-ui-kit}"
# A port for this run: from the process id, so two lanes shooting at once do not collide (no helper process to find a free port).
PORT="${PORT:-$((20000 + $$ % 20000))}"
DBG="$((PORT + 1))"
VOICE="${TMPDIR:-/private/tmp}/ldw-player-voice"  # the said words, kept between runs
BUILD="$(mktemp -d "${TMPDIR:-/private/tmp}/ldw-player-build.XXXXXX")"
mkdir -p "$OUT"
trap 'kill $SERVER 2>/dev/null; rm -rf "$BUILD"' EXIT

mkdir -p "$BUILD/desktop" "$BUILD/voice" "$VOICE"
cp -R "$ROOT/desktop/src" "$BUILD/desktop/src"
cp -R "$ROOT/harness" "$BUILD/harness"

# ---- 1. the take
node -e "import('$ROOT/harness/fixtures02.js').then(m => console.log(JSON.stringify({ take: m.TAKE, ballot: m.BALLOT })))" > "$BUILD/voice/fixtures.json"
LDW_DATA_DIR="$BUILD/data" /usr/bin/python3 - "$ROOT" "$BUILD" "$VOICE" <<'PY'
import array, base64, json, math, os, subprocess, sys, wave
root, build, voice = sys.argv[1], sys.argv[2], sys.argv[3]
sys.path.insert(0, root)
import speech, player  # loose modules, the backend's own code

fx = json.load(open(f"{build}/voice/fixtures.json"))
text = fx["take"]["transcript"]["text"]
RATE = 22050
cache = {}
def word_wav(w):
    key = player.norm(w) or w
    if key not in cache:
        path = f"{voice}/{key.replace(chr(39), '_')}.wav"
        if not os.path.exists(path):
          subprocess.run(["say", "-v", "Samantha", "-r", "200", "--file-format=WAVE", "--data-format=LEI16@22050", "-o", path, key], check=True)
        with wave.open(path) as f:
            a = array.array("h", f.readframes(f.getnframes()))
        loud = [i for i, v in enumerate(a) if abs(v) > 600]
        cache[key] = a[max(0, loud[0] - 200): loud[-1] + 300] if loud else a
    return cache[key]

out = array.array("h", [0] * int(0.7 * RATE))
words = []
for w in text.split():
    a = word_wav(w)
    start = len(out) / RATE
    out.extend(a)
    words.append({"word": w, "start": round(start, 2), "end": round(len(out) / RATE, 2)})
    gap = 2.4 if w == "up." else 0.55 if player.ends_sentence(w) else 0.24 if w.endswith(",") else 0.035
    out.extend([0] * int(gap * RATE))
out.extend([0] * int(0.6 * RATE))
with wave.open(f"{build}/voice/take.wav", "wb") as f:
    f.setnchannels(1); f.setsampwidth(2); f.setframerate(RATE); f.writeframes(out.tobytes())
# Levels as the recorder keeps them: RMS over 50 ms, times 4, capped at 1, the louder of each two kept.
win = RATE // 20
lv20 = []
for i in range(0, len(out), win):
    seg = out[i:i + win]
    rms = math.sqrt(sum((v / 32768) ** 2 for v in seg) / max(1, len(seg)))
    lv20.append(min(1.0, rms * 4))
levels = [round(max(lv20[i:i + 2]), 3) for i in range(0, len(lv20), 2)]
subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", f"{build}/voice/take.wav", "-c:a", "libopus", "-b:a", "32k", f"{build}/voice/take.webm"], check=True)
audio = base64.b64encode(open(f"{build}/voice/take.webm", "rb").read()).decode()

def make(with_words):
    t = {k: v for k, v in fx["take"].items() if k not in ("levels",)}
    t.update({"duration": round(len(out) / RATE, 1), "levels": levels, "has_audio": True, "mime": "audio/webm", "typed": False})
    tr = {"status": "done", "text": text, "words": words if with_words else [], "model": "base.en" if with_words else None, "error": None,
          "engine": "workbench" if with_words else "hermes", "provider": "faster-whisper" if with_words else "local", "local": True}
    t["transcript"] = tr
    t["stats"] = speech.measure(t, tr, t.get("answer"))
    t["timeline"] = player.timeline(t)
    return t

w, to = make(True), make(False)
ballot = fx["ballot"]
s = w["stats"]
ballot["measured"].update({"speaking": s["speaking"], "wpm": s["wpm"], "fillers": s["fillers"], "answer_at": s["answer_at"],
                           "duration": s["duration"], "pauses": len(s["pauses"])})
rep = player.text_only_report(w, [d["line"] for d in ballot["decisive"]])
json.dump({"words": w, "textonly": to, "ballot": ballot, "audio": {"b64": audio, "mime": "audio/webm"}, "report": rep},
          open(f"{build}/harness/player_gen.json", "w"))
print(rep["log"])
print(f"take: {w['duration']} s, {len(words)} words, pauses {s['pauses']}, fillers {s['fillers']}, jumps",
      [player.jump_time(w["timeline"], d["line"]) for d in ballot["decisive"]])
PY

# ---- 2. the mounts the frame shell will make (in the build folder only)
/usr/bin/python3 - "$BUILD" <<'PY'
import sys
from pathlib import Path
b = Path(sys.argv[1])
f = b / "desktop/src/floor.js"
s = f.read_text()
def sub(old, new):
    global s
    assert old in s, old[:60]
    s = s.replace(old, new)
sub("import { ShowMe } from './coach.js'", "import { ShowMe } from './coach.js'\nimport { QuoteLine, TakePlayer } from './player.js'")
sub("    !take.typed ? jsx(Wave, { levels: take.levels || [], duration: take.duration, pauses: s.pauses || [], answerAt: s.answer_at, startsAt: s.starts_at || 0, limit }) : null,\n    jsx(Stats, { take, limit, fastOk }),",
    "    jsx(Stats, { take, limit, fastOk }),\n    jsx(TakePlayer, { take }),")
sub("    (st === 'done' || st === 'typed') && take.transcript.text ? jsxs('details', { className: 'ldw-said', children: [\n      jsx('summary', { children: `What you said · ${words(take.transcript.text)} words` }), jsx('p', { className: 'ldw-spoken', children: take.transcript.text }),\n    ] }) : null,\n", "")
sub("      ...b.decisive.map((d, i) => jsxs('div', { className: 'ldw-line', children: [",
    "      ...b.decisive.map((d, i) => jsxs(QuoteLine, { take: { id: b.take_id }, line: d, index: i, className: 'ldw-line', children: [")
f.write_text(s)
h = b / "harness/harness.js"
s = h.read_text()
sub("import { COACH } from './fixtures_coach.js'", "import { COACH } from './fixtures_coach.js'\nimport { playerRest } from './fixtures_player.js'")
sub("async function rest(path, options = {}) {", "async function rest(path, options = {}) {\n  const pr = await playerRest(path, options, home)\n  if (pr !== undefined) return pr\n  return baseRest(path, options)\n}\nasync function baseRest(path, options = {}) {")
h.write_text(s)
PY
node "$KIT/scripts/build.mjs" "$BUILD" >/dev/null

# ---- 3. serve and shoot
/usr/bin/python3 -m http.server "$PORT" --bind 127.0.0.1 --directory "$BUILD" >/dev/null 2>&1 &
SERVER=$!
curl --retry 10 --retry-connrefused -s -o /dev/null "http://127.0.0.1:$PORT/harness/index.html"
OUT="$OUT" PORT="$PORT" DBG="$DBG" node --input-type=module <<'JS'
import { spawn } from 'node:child_process'
import { writeFileSync, mkdtempSync } from 'node:fs'
import { join } from 'node:path'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const OUT = process.env.OUT, PORT = process.env.PORT, DBG = Number(process.env.DBG)
const pause = ms => new Promise(r => setTimeout(r, ms))
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', `--remote-debugging-port=${DBG}`, '--autoplay-policy=no-user-gesture-required',
  `--user-data-dir=${mkdtempSync(join(process.env.TMPDIR || '/private/tmp', 'ldw-player-chrome-'))}`, 'about:blank'], { stdio: 'ignore' })
const log = []
try {
  let target
  for (let i = 0; i < 40 && !target; i++) { await pause(250); try { target = (await (await fetch(`http://127.0.0.1:${DBG}/json/list`)).json()).find(t => t.type === 'page') } catch (e) {} }
  const ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise(r => ws.addEventListener('open', r))
  let id = 0
  const waiting = new Map()
  ws.addEventListener('message', ev => { const m = JSON.parse(ev.data); if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id) } })
  const send = (method, params = {}) => new Promise(r => { const n = ++id; waiting.set(n, r); ws.send(JSON.stringify({ id: n, method, params })) })
  const ev = async (expression) => { if (typeof expression !== 'string') return null; const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, userGesture: true }); return r.result && r.result.result ? r.result.result.value : (r.result && r.result.exceptionDetails ? `error: ${r.result.exceptionDetails.text}` : null) }
  await send('Page.enable'); await send('Network.setCacheDisabled', { cacheDisabled: true })
  const open = async (q, w, h) => {
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false })
    await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/harness/?view=extemp&x=ballot&${q}` })
    for (let i = 0; i < 40; i++) { await pause(250); if (await ev(`!!document.querySelector('.ldw-player') && !!document.querySelector('.ldw-sheet')`)) break }
    await pause(900)
  }
  const shot = async name => { const s = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(join(OUT, `${name}.png`), Buffer.from(s.result.data, 'base64')); log.push(`- shot ${name}.png`) }
  const scrollTo = (sel, block = 'start') => ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return false; e.scrollIntoView({ block: '${block}' }); return true })()`)
  const check = async (name, expr) => { const v = await ev(expr); log.push(`- check ${name}: ${JSON.stringify(v)}`); return v }
  const sizes = [['1440x900', 1440, 900], ['1280x800', 1280, 800]]
  for (const [sz, w, h] of sizes) for (const theme of ['dark', 'light']) {
    await open(`player=1&theme=${theme}`, w, h)
    await scrollTo('.ldw-sheet')
    await shot(`06-ballot-${sz}-${theme}`)
    if (sz === '1440x900' && theme === 'dark') {
      await check('quoted lines with a play mark and a time', `[...document.querySelectorAll('.ldw-sheet .ldw-quote-mark:not(.ldw-quote-none)')].map(b => b.textContent.trim())`)
      await check('smallest text in the player (px)', `Math.min(...[...document.querySelectorAll('.ldw-player *, .ldw-quote-mark')].filter(e => e.childNodes.length && [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())).map(e => parseFloat(getComputedStyle(e).fontSize)))`)
      await check('fillers marked', `[...document.querySelectorAll('.ldw-filler')].map(e => e.textContent)`)
      await check('pauses inline', `[...document.querySelectorAll('.ldw-pause')].map(e => e.textContent)`)
      await check('transcript open by default', `document.querySelector('.ldw-ptx').open`)
      await check('no horizontal overflow', `document.documentElement.scrollWidth <= innerWidth`)
    }
    await scrollTo('.ldw-last', 'end')
    await shot(`06-player-${sz}-${theme}`)
  }
  for (const [mode, accent] of [['dark', ''], ['light', ''], ['dark', 'red'], ['dark', 'green']]) {
    await open(`player=1&theme=${mode}${accent ? `&accent=${accent}` : ''}`, 1440, 900)
    const want = await ev(`(() => { const b = document.querySelectorAll('.ldw-sheet .ldw-quote-mark')[1]; b.click(); return b.getAttribute('aria-label') })()`)
    await pause(1500)
    const name = `07-quote-playing-1440x900-${mode}${accent ? `-${accent}-accent` : ''}`
    if (!accent && mode === 'dark') {
      log.push(`- check line 2 mark label: ${JSON.stringify(want)}`)
      await check('line 2 in its playing state', `!!document.querySelector('.ldw-sheet .ldw-qline[data-on] .ldw-quote-mark[data-on]')`)
      await check('audio time 1.5 s after the click (s)', `document.querySelector('.ldw-player audio').currentTime.toFixed(2)`)
      await check('word lit now', `(document.querySelector('.ldw-word-now') || {}).textContent || null`)
    }
    await scrollTo('.ldw-sheet .ldw-qline[data-on]')
    await ev(`window.scrollBy && document.querySelector('.ldw-qline[data-on]').scrollIntoView({ block: 'center' })`)
    await shot(`${name}-line`)
    await scrollTo('.ldw-last', 'end')
    await shot(name)
  }
  // Click a word: the playhead moves there.
  await open('player=1', 1440, 900)
  await check('click the word "Congress": audio time (s) and the word time', `(async () => { const w = [...document.querySelectorAll('.ldw-word')].find(e => e.textContent === 'Congress'); w.click(); await new Promise(r => setTimeout(r, 600)); return [document.querySelector('.ldw-player audio').currentTime.toFixed(2), w.dataset.t] })()`)
  // States.
  for (const mode of ['gone', 'failed', 'textonly']) {
    await open(`player=${mode}`, 1440, 900)
    await scrollTo('.ldw-last', 'end')
    await shot(`14-states-${mode}-1440x900-dark`)
    await check(`${mode}: play marks on the ballot`, `document.querySelectorAll('.ldw-sheet .ldw-quote-mark:not(.ldw-quote-none)').length`)
    await check(`${mode}: player note`, `[...document.querySelectorAll('.ldw-pnote')].map(e => e.textContent)`)
  }
  await open('player=textonly', 1440, 900)
  await ev(`document.querySelectorAll('.ldw-sheet .ldw-quote-mark')[1].click()`)
  await pause(1500)
  await check('textonly: audio time 1.5 s after clicking line 2 (s)', `document.querySelector('.ldw-player audio').currentTime.toFixed(2)`)
  await scrollTo('.ldw-last', 'end')
  await shot('14-states-textonly-playing-1440x900-dark')
  ws.close()
} finally { chrome.kill() }
writeFileSync(join(OUT, 'run-log.md'), `# Lane B player shots\n\nCraft-only: a synthetic adult voice (macOS say, Samantha), one word at a time; no model. Mounts applied in a build copy, as the frame shell will make them.\n\n${log.join('\n')}\n`)
console.log(log.join('\n'))
JS

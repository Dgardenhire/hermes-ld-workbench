// The take player (Lane B): hear yourself. One player under each ballot plays the take; the ballot's
// quoted lines carry a play mark and their time, and a click plays that exact line in the speaker's own
// voice while the words light up.
//
//   TakePlayer({ take, audioSrc, startAt, onTime })  waveform, play control, transcript with the word now said
//   QuoteLine({ take, line, index, children })        the play mark and time at the left of one quoted line
//
// The words and their times come from the backend (player.py, on every take as take.timeline): exact on the
// faster-whisper path ("words"), anchored to the pauses on Hermes's text-only path ("pauses"). The page
// finds each quoted line in those words itself (locate, kept equal to player.locate by tests/test_player.py).
//
// One thing plays at a time: whoever starts sound claims $nowPlaying, and every player pauses when another
// claims it (Lane A's Hear it uses claimPlayback too). A QuoteLine reaches the player for its take through a
// small registry, so the ballot and the player under it share one <audio>.

import { useEffect, useMemo, useRef, useState } from 'react'
import { Fragment, jsx, jsxs } from 'react/jsx-runtime'
import { Codicon, atom, useValue } from '@hermes/plugin-sdk'
import { installStyles } from 'hermes-ui-kit'
import { PLUGIN_ID, errText, mmss, rest } from './core.js'

// Quote-click on Hermes's text-only transcripts (no word times). On until Monday's five-take check says
// a jump there misses by more than 1.5 s; then false, and that path keeps plain playback.
export const QUOTE_CLICK_TEXT_ONLY = true
const LEAD = 0.3   // a line starts playing this long before its first word
const TAIL = 0.35  // and stops this long after its last
export const DELETED = 'This recording was deleted. The ballot and transcript are still here.'

/* ------------------------------------------------------------------ matching (mirrors player.py) -- */

export const norm = w => String(w || '').toLowerCase().replace(/’/g, "'").replace(/[^a-z0-9']/g, '')
const split = t => String(t || '').match(/\S+/g) || []
const endsSentence = w => /[.!?]["'”’)\]]*$/.test(w || '')

function pieces(line) {
  const parts = String(line || '').split(/\.\.\.|…/).map(p => split(p).map(norm).filter(Boolean))
  for (const p of parts) if (p.length >= 3) return p
  return parts.flat()
}
function lcs(a, b) {
  let prev = new Array(b.length + 1).fill(0)
  for (const x of a) {
    const cur = [0]
    for (let j = 0; j < b.length; j++) cur.push(x === b[j] ? prev[j] + 1 : Math.max(prev[j + 1], cur[j]))
    prev = cur
  }
  return prev[prev.length - 1]
}
function match(tl, line) {
  const q = pieces(line)
  const toks = (tl && tl.tokens) || []
  const idx = []
  const seq = []
  toks.forEach((t, i) => { const k = norm(t.w); if (k) { idx.push(i); seq.push(k) } })
  if (!q.length || !seq.length) return null
  const n = q.length
  for (let s = 0; s + n <= seq.length; s++) {
    let ok = true
    for (let k = 0; k < n; k++) if (seq[s + k] !== q[k]) { ok = false; break }
    if (ok) return { first: idx[s], last: idx[s + n - 1] }
  }
  let best = 0
  let at = null
  for (let s = 0; s < seq.length; s++) {
    if (seq[s] !== q[0] && (n < 2 || seq[s] !== q[1])) continue
    const score = lcs(q, seq.slice(s, s + n + 2)) / n
    if (score > best) { best = score; at = s }
  }
  return at !== null && best >= 0.8 ? { first: idx[at], last: idx[Math.min(seq.length - 1, at + n - 1)] } : null
}
// Index of the word where a quoted line starts, or null.
export function locate(tl, line) { const m = match(tl, line); return m ? m.first : null }
const round2 = x => Math.round(x * 100) / 100
// Where a click on the line starts playback, in seconds of the recording, or null.
export function jumpTime(tl, line) {
  const i = locate(tl, line)
  if (i === null) return null
  const t = tl.tokens[i].t
  return t === null || t === undefined ? null : Math.max(0, round2(t - (tl.lead === undefined ? LEAD : tl.lead)))
}
// Start and end of a quoted line, in seconds, or null.
export function lineSpan(tl, line) {
  const m = match(tl, line)
  if (!m) return null
  const a = tl.tokens[m.first]
  const b = tl.tokens[m.last]
  if (a.t === null || a.t === undefined) return null
  return { at: a.t, from: Math.max(0, round2(a.t - LEAD)), to: round2((b.e || b.t || a.t) + TAIL) }
}

/* ------------------------------------------------------------------ the timeline -- */

const FILLER_WORDS = new Set(['um', 'uh', 'erm', 'er', 'ah', 'hmm', 'mm'])
const FILLER_PHRASES = new Set(['you know', 'i mean', 'kind of', 'sort of'])
const PUNCT = ',.;:!?'
const tokensOf = w => String(w || '').toLowerCase().match(/[a-z']+|[,.;:!?]/g) || []
// speech.filler_hits, word for word: which shown words are fillers.
export function fillerFlags(display) {
  const toks = []
  const owner = []
  display.forEach((w, i) => tokensOf(w).forEach(t => { toks.push(t); owner.push(i) }))
  const flags = display.map(() => false)
  toks.forEach((t, i) => {
    const prev = i ? toks[i - 1] : '.'
    const nxt = i + 1 < toks.length ? toks[i + 1] : '.'
    let n = 0
    if (FILLER_WORDS.has(t)) n = 1
    else if (t === 'like' && PUNCT.includes(prev) && nxt === ',') n = 1
    else if (t === 'so' && '.;:!?'.includes(prev) && nxt === ',') n = 1
    else if (i + 1 < toks.length && FILLER_PHRASES.has(`${t} ${nxt}`) && PUNCT.includes(prev)) n = 2
    for (let k = i; k < i + n; k++) flags[owner[k]] = true
  })
  return flags
}

// The take's timeline: the backend's when it sent one, else built here from faster-whisper's word times
// (a sample take written by hand, an older backend). Text alone gets no times here: anchoring to the
// pauses is the backend's job (player.py).
export function timelineOf(take) {
  if (!take) return { method: 'none', tokens: [], sentences: [] }
  if (take.timeline && Array.isArray(take.timeline.tokens)) return take.timeline
  const tr = take.transcript || {}
  const words = (tr.words || []).filter(w => w && String(w.word || '').trim())
  const s = take.stats || {}
  const out = { method: 'none', tokens: [], sentences: [], lead: LEAD, starts_at: s.starts_at || 0 }
  if (take.typed || tr.status !== 'done' || !words.length) return out
  const display = words.map(w => String(w.word).trim())
  const flags = fillerFlags(display)
  const tokens = words.map((w, i) => ({ w: display[i], t: round2(Number(w.start) || 0), e: round2(Number(w.end || w.start) || 0) }))
  let k = 0
  let first = 0
  tokens.forEach((t, i) => {
    t.s = k
    if (flags[i]) t.filler = true
    if (endsSentence(t.w) || i === tokens.length - 1) { out.sentences.push({ t: tokens[first].t, first, anchored: true }); k++; first = i + 1 }
  })
  for (const p of s.pauses || []) {
    const mid = p.at + p.length / 2
    let at = null
    tokens.forEach((t, i) => { if (t.t < mid) at = i })
    if (at !== null && at < tokens.length - 1) tokens[at].pause = Math.round(p.length * 10) / 10
  }
  out.method = 'words'
  out.tokens = tokens
  return out
}

export const quoteClickOn = tl => !!tl && (tl.method === 'words' || (tl.method === 'pauses' && QUOTE_CLICK_TEXT_ONLY))

/* ------------------------------------------------------------------ one thing plays at a time -- */

export const $nowPlaying = atom(null) // the key of whatever is making sound, or null
export function claimPlayback(key) { $nowPlaying.set(key) }
export function releasePlayback(key) { if ($nowPlaying.get() === key) $nowPlaying.set(null) }

// take id -> { playLine(span, key), timeline, startsAt, setMarks }. QuoteLines find their player here.
const players = new Map()
const $players = atom(0)
function register(id, entry) { players.set(id, entry); $players.set($players.get() + 1); return () => { if (players.get(id) === entry) { players.delete(id); $players.set($players.get() + 1) } } }

/* ------------------------------------------------------------------ audio -- */

function blobUrl(b64, mime) {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return URL.createObjectURL(new Blob([bytes], { type: mime || 'audio/webm' }))
}

// The recording for a take: { src, state: idle|loading|ready|gone|error, error }.
function useTakeAudio(take, audioSrc) {
  const [st, setSt] = useState({ src: audioSrc || null, state: audioSrc ? 'ready' : 'idle', error: null })
  const id = take && take.id
  const has = !!(take && take.has_audio)
  useEffect(() => {
    if (audioSrc) { setSt({ src: audioSrc, state: 'ready', error: null }); return undefined }
    if (!id || !has) { setSt({ src: null, state: take && !take.typed ? 'gone' : 'idle', error: null }); return undefined }
    let alive = true
    let url = null
    setSt({ src: null, state: 'loading', error: null })
    rest(`speech/${id}/audio`).then(r => {
      if (!alive) return
      url = blobUrl(r.b64, r.mime)
      setSt({ src: url, state: 'ready', error: null })
    }).catch(e => {
      if (!alive) return
      const msg = errText(e)
      setSt({ src: null, state: /not kept|gone/i.test(msg) ? 'gone' : 'error', error: msg })
    })
    return () => { alive = false; if (url) URL.revokeObjectURL(url) }
  }, [id, has, audioSrc])
  return st
}

const nowIndex = (tokens, t) => {
  let lo = 0
  let hi = tokens.length - 1
  let at = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    const v = tokens[mid].t
    if (v !== null && v !== undefined && v <= t) { at = mid; lo = mid + 1 } else hi = mid - 1
  }
  if (at >= 0) { const tk = tokens[at]; if (tk.e !== null && tk.e !== undefined && t > tk.e + 0.6) return -1 } // between words, over a pause
  return at
}

/* ------------------------------------------------------------------ the waveform -- */

const W = 1000
const H = 72
const BARS = 220

function PlayerWave({ take, tl, view, marks, headRef, playedRef, onSeek }) {
  const levels = take.levels || []
  const s = take.stats || {}
  const x = t => ((t - view.from) / (view.to - view.from)) * W
  const bars = useMemo(() => {
    const out = []
    const per = ((view.to - view.from) * 10) / BARS
    for (let i = 0; i < BARS; i++) {
      const a = Math.floor(view.from * 10 + i * per)
      const b = Math.max(a + 1, Math.floor(view.from * 10 + (i + 1) * per))
      if (a >= levels.length) break
      let m = 0
      for (let k = a; k < b && k < levels.length; k++) m = Math.max(m, levels[k])
      const h = Math.max(2, Math.min(1, m * 1.6) * (H - 10))
      out.push(jsx('rect', { x: (i * W) / BARS + 0.7, y: (H - h) / 2, width: W / BARS - 1.8, height: h }, i))
    }
    return out
  }, [levels, view.from, view.to])
  const drag = useRef(false)
  const seekAt = e => {
    const r = e.currentTarget.getBoundingClientRect()
    const f = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width))
    onSeek(view.from + f * (view.to - view.from), false)
  }
  const step = (s.duration || take.duration || 0) > 120 ? 10 : 5
  const key = e => {
    const d = e.key === 'ArrowRight' ? step : e.key === 'ArrowLeft' ? -step : null
    if (d === null) return
    e.preventDefault()
    onSeek(null, false, d)
  }
  const span = view.to - view.from
  const tickStep = span <= 90 ? 10 : span <= 300 ? 30 : 60
  const ticks = []
  for (let t = 0; t <= view.to - view.zero + 0.01; t += tickStep) ticks.push(t)
  const answer = s.answer_at !== null && s.answer_at !== undefined ? s.answer_at + (s.starts_at || 0) : null
  return jsxs('div', { className: 'ldw-pwave', children: [
    jsxs('div', { className: 'ldw-pwave-track', role: 'slider', tabIndex: 0, 'aria-label': 'Playhead. Arrow keys move it.',
      'aria-valuemin': 0, 'aria-valuemax': Math.round(view.to - view.zero), 'aria-valuenow': 0, 'aria-valuetext': '0:00', ref: headRef.slider,
      onPointerDown: e => { drag.current = true; e.currentTarget.setPointerCapture(e.pointerId); seekAt(e) },
      onPointerMove: e => { if (drag.current) seekAt(e) },
      onPointerUp: () => { drag.current = false },
      onKeyDown: key,
      children: [
        jsxs('svg', { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'none', 'aria-hidden': 'true', children: [
          jsx('defs', { children: jsx('clipPath', { id: `ldw-played-${take.id}`, children: jsx('rect', { ref: playedRef, x: 0, y: 0, width: 0, height: H }) }) }),
          ...(s.pauses || []).map((p, i) => jsx('rect', { className: 'ldw-pwave-pause', x: x(p.at), y: 0, width: Math.max(3, (p.length / span) * W), height: H }, `p${i}`)),
          jsx('g', { className: 'ldw-pwave-bars', children: bars }),
          jsx('g', { className: 'ldw-pwave-bars ldw-pwave-played', clipPath: `url(#ldw-played-${take.id})`, children: bars }),
          answer !== null ? jsx('line', { className: 'ldw-pwave-answer', x1: x(answer), x2: x(answer), y1: 0, y2: H }) : null,
          ...marks.map(m => jsx('line', { className: 'ldw-pwave-q', 'data-on': m.on ? '' : undefined, x1: x(m.at), x2: x(m.at), y1: 0, y2: H }, `q${m.n}`)),
          jsx('line', { className: 'ldw-pwave-head', ref: headRef.line, x1: 0, x2: 0, y1: 0, y2: H }),
        ] }),
        answer !== null ? jsx('span', { className: 'ldw-pwave-tag', 'data-left': x(answer) < 0.06 * W ? '' : undefined, style: { left: `${(x(answer) / W) * 100}%` }, children: `Answer ${mmss(s.answer_at)}` }) : null,
        ...marks.map(m => jsx('span', { className: 'ldw-pwave-qn', 'data-on': m.on ? '' : undefined, style: { left: `${(x(m.at) / W) * 100}%` }, children: m.n }, `n${m.n}`)),
      ] }),
    jsx('div', { className: 'ldw-pwave-ticks', 'aria-hidden': 'true', children: ticks.map(t => jsx('span', { style: { left: `${(x(t + view.zero) / W) * 100}%` }, children: mmss(t) }, t)) }),
  ] })
}

/* ------------------------------------------------------------------ the transcript -- */

function Transcript({ tl, now, onWord, live }) {
  const toks = tl.tokens
  const n = toks.filter(t => norm(t.w)).length
  const kids = []
  toks.forEach((t, i) => {
    const timed = t.t !== null && t.t !== undefined
    kids.push(jsx('span', { className: ['ldw-word', t.filler ? 'ldw-filler' : '', i === now ? 'ldw-word-now' : ''].filter(Boolean).join(' '),
      'data-t': timed ? t.t : undefined, title: t.filler ? 'Filler' : undefined,
      onClick: timed && live ? () => onWord(t.t) : undefined, children: t.w }, i))
    if (t.pause) kids.push(jsx('span', { className: 'ldw-pause', title: `A pause of ${t.pause} seconds`, children: `${t.pause.toFixed(1)} s` }, `p${i}`))
    if (i < toks.length - 1) kids.push(' ')
  })
  return jsxs('details', { className: 'ldw-ptx', open: true, children: [
    jsxs('summary', { children: ['What you said', jsx('span', { children: ` · ${n} words` })] }),
    jsx('p', { className: 'ldw-ptx-words', 'data-live': live ? '' : undefined, children: kids }),
  ] })
}

/* ------------------------------------------------------------------ the player -- */

// take: a take as the backend sends it (speech.public). audioSrc: play this instead of the take's recording
// (the Sample take, Lane A's Hear it). startAt: seconds of the recording to start from. onTime(t): every frame.
export function TakePlayer({ take, audioSrc, startAt, onTime }) {
  useEffect(() => installStyles(null, `${PLUGIN_ID}:player`, PLAYER_CSS), [])
  const tl = useMemo(() => timelineOf(take), [take])
  const audio = useTakeAudio(take, audioSrc)
  const el = useRef(null)
  const head = { line: useRef(null), slider: useRef(null) }
  const played = useRef(null)
  const timeRef = useRef(null)
  const stopAt = useRef(null)
  const pending = useRef(null)
  const [playing, setPlaying] = useState(false)
  const [now, setNow] = useState(-1)
  const [lineOn, setLineOn] = useState(null) // the quoted line playing, by its index on the ballot
  const [marks, setMarks] = useState({})
  const [err, setErr] = useState(null)
  const key = `take:${take && take.id}`
  const nowKey = useValue($nowPlaying)
  const s = (take && take.stats) || {}
  const startsAt = s.starts_at || tl.starts_at || 0
  const dur = Math.max(take ? take.duration || s.duration || 0 : 0, 1)
  const view = { from: Math.max(0, startsAt - 0.4), to: dur, zero: startsAt }

  const paint = t => {
    const f = Math.min(1, Math.max(0, (t - view.from) / (view.to - view.from)))
    if (head.line.current) { head.line.current.setAttribute('x1', f * W); head.line.current.setAttribute('x2', f * W) }
    if (played.current) played.current.setAttribute('width', f * W)
    if (timeRef.current) timeRef.current.textContent = mmss(Math.max(0, t - startsAt))
    if (head.slider.current) { head.slider.current.setAttribute('aria-valuenow', Math.round(Math.max(0, t - startsAt))); head.slider.current.setAttribute('aria-valuetext', mmss(Math.max(0, t - startsAt))) }
    const i = nowIndex(tl.tokens, t)
    setNow(i)
    if (onTime) onTime(t)
  }

  // The frame loop while sound plays: the playhead, the time, the word now said, the end of a quoted line.
  useEffect(() => {
    if (!playing) return undefined
    let raf = 0
    const tick = () => {
      const a = el.current
      if (!a) return
      if (stopAt.current !== null && a.currentTime >= stopAt.current) { a.pause(); stopAt.current = null; setLineOn(null) }
      paint(a.currentTime)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, tl])

  useEffect(() => { if (nowKey !== key && playing && el.current) el.current.pause() }, [nowKey])
  useEffect(() => () => releasePlayback(key), [key])

  // Seek once the recording can be read (a fresh blob has no metadata yet), then play when asked.
  const go = (t, play, until = null, line = null) => {
    const a = el.current
    if (!a || audio.state !== 'ready') { pending.current = { t, play, until, line }; return }
    const run = () => {
      try { a.currentTime = Math.max(0, t) } catch (e) { /* not seekable yet */ }
      paint(Math.max(0, t))
      stopAt.current = until
      setLineOn(line)
      if (play) { claimPlayback(key); a.play().catch(e => setErr(e && e.name === 'NotAllowedError' ? 'Press play to hear it.' : 'This recording could not be played here.')) }
    }
    if (a.readyState >= 1) run()
    else a.addEventListener('loadedmetadata', run, { once: true })
  }
  useEffect(() => {
    if (audio.state !== 'ready') return
    const p = pending.current
    pending.current = null
    if (p) go(p.t, p.play, p.until, p.line)
    else if (startAt !== undefined && startAt !== null) go(startAt, false)
  }, [audio.state, audio.src])

  const toggle = () => {
    const a = el.current
    if (!a) return
    if (playing) { a.pause(); return }
    stopAt.current = null
    setLineOn(null)
    const at = a.currentTime >= dur - 0.2 ? view.from : a.currentTime
    go(at, true)
  }
  const seek = (t, play, delta) => {
    const a = el.current
    const base = a ? a.currentTime : 0
    const to = delta !== undefined ? base + delta : t
    stopAt.current = null
    setLineOn(null)
    go(Math.min(dur, Math.max(0, to)), play === undefined ? playing : play || playing)
  }

  // The registry entry QuoteLines use: play a line, and put its number on the waveform.
  const live = audio.state === 'ready' || audio.state === 'loading'
  useEffect(() => {
    if (!take || !take.id) return undefined
    return register(take.id, {
      timeline: tl, startsAt, live, playing: () => lineOn,
      playLine: (span, index) => go(span.from, true, span.to, index),
      stop: () => { if (el.current) el.current.pause() },
      mark: (index, at) => setMarks(m => (m[index] === at ? m : { ...m, [index]: at })),
    })
  }, [take && take.id, tl, live, audio.state, lineOn])

  // A line's mark shows its playing state: tell the QuoteLines.
  useEffect(() => { $lineOn.set(lineOn === null ? null : `${take && take.id}:${lineOn}`) }, [lineOn])

  if (!take) return null
  if (take.typed) return jsxs('section', { className: 'ldw-player', 'aria-label': 'Your take', children: [
    tl.tokens.length ? jsx(Transcript, { tl, now: -1, live: false }) : null] })
  const gone = audio.state === 'gone'
  const tlMarks = Object.entries(marks).map(([i, at]) => ({ n: Number(i) + 1, at, on: lineOn === Number(i) }))
  const textOnlyOff = tl.method === 'pauses' && !QUOTE_CLICK_TEXT_ONLY
  const st = (take.transcript || {}).status
  return jsxs('section', { className: 'ldw-player', 'data-state': audio.state, 'aria-label': 'Your take, to play back', children: [
    audio.src ? jsx('audio', { ref: el, src: audio.src, preload: 'auto',
      onPlay: () => setPlaying(true), onPause: () => { setPlaying(false); setLineOn(null) },
      onEnded: () => { setPlaying(false); setLineOn(null); releasePlayback(key) },
      onError: () => setErr('This recording could not be played here.') }) : null,
    gone ? jsx('p', { className: 'ldw-pnote', role: 'status', children: DELETED }) : jsxs('div', { className: 'ldw-pbar', children: [
      jsx('button', { type: 'button', className: 'ldw-play', disabled: audio.state !== 'ready', 'aria-label': playing ? 'Pause' : 'Play your take',
        'aria-pressed': playing, onClick: toggle, children: jsx(Codicon, { name: playing ? 'debug-pause' : 'play' }) }),
      jsxs('span', { className: 'ldw-ptime', children: [jsx('b', { ref: timeRef, children: '0:00' }), ` / ${mmss(Math.max(0, dur - startsAt))}`] }),
      audio.state === 'loading' ? jsx('span', { className: 'ldw-pstate', role: 'status', children: 'Loading the recording' }) : null,
      audio.state === 'error' ? jsx('span', { className: 'ldw-pstate', role: 'alert', children: audio.error }) : null,
      err ? jsx('span', { className: 'ldw-pstate', role: 'alert', children: err }) : null,
    ] }),
    !gone ? jsx(PlayerWave, { take, tl, view, marks: tlMarks, headRef: head, playedRef: played, onSeek: seek }) : null,
    tl.tokens.length ? jsx(Transcript, { tl, now, live: !gone && tl.method !== 'none', onWord: t => seek(Math.max(0, t - 0.05)) }) : null,
    ['failed', 'unavailable', 'cancelled'].includes(st) && !gone ? jsx('p', { className: 'ldw-pnote', children: 'The recording still plays. Its words light up once there is a transcript.' }) : null,
    tl.method === 'pauses' && !gone ? jsx('p', { className: 'ldw-pnote', children: textOnlyOff
      ? 'This transcript has no word times, so the quoted lines do not play from the ballot. The recording still plays.'
      : 'On this transcript, each sentence is placed by the pauses in your recording, so a line may start a moment early or late.' }) : null,
  ] })
}

/* ------------------------------------------------------------------ the quoted line -- */

const $lineOn = atom(null) // `${takeId}:${index}` of the quoted line playing

// One quoted line on a ballot. line: the decisive entry ({ line, checked }) or the quote itself. With a
// player for this take on the page and the line found in its words, a play mark and the line's time sit at
// the left; a line not found keeps its place with no mark (the ballot's own "not found" flag stays). With no
// player on the page (an old ballot on the Ballots page), the line renders as it always did.
// className: the line's own class on the sheet (ldw-line).
export function QuoteLine({ take, line, index = 0, className, children }) {
  useValue($players)
  const on = useValue($lineOn)
  const id = take && (take.id || take.take_id)
  const p = id ? players.get(id) : null
  const quote = typeof line === 'string' ? line : line && line.line
  const checked = !(line && typeof line === 'object' && line.checked === false)
  const tl = p ? p.timeline : take && take.transcript ? timelineOf(take) : null
  const span = p && p.live && checked && quoteClickOn(tl) ? lineSpan(tl, quote) : null // no recording, no mark: never a dead button
  useEffect(() => { if (p && span) p.mark(index, span.at) }, [p, span && span.at, index])
  const playing = on === `${id}:${index}`
  if (!p || !p.live) return jsx('div', { className, children }) // no player here, or no recording: the line as it always was
  const mark = span ? jsxs('button', { type: 'button', className: 'ldw-quote-mark', 'data-on': playing ? '' : undefined,
    'aria-label': playing ? `Stop line ${index + 1}` : `Play line ${index + 1}, at ${mmss(Math.max(0, span.at - p.startsAt))}`,
    onClick: () => (playing ? p.stop() : p.playLine(span, index)), children: [
      jsx(Codicon, { name: playing ? 'debug-pause' : 'play' }),
      jsx('span', { children: mmss(Math.max(0, span.at - p.startsAt)) }),
    ] }) : jsx('span', { className: 'ldw-quote-mark ldw-quote-none', 'aria-hidden': 'true' })
  return jsxs('div', { className: ['ldw-qline', className].filter(Boolean).join(' '), 'data-on': playing ? '' : undefined, children: [mark, jsx('div', { className: 'ldw-qline-body', children })] })
}

/* ------------------------------------------------------------------ styles -- */

// Host tokens only (the kit's --hk-* over the app's --ui-*), the host radius, nothing under 12 px. The
// accent is the playhead, the word now said and a line's playing state; warn is the filler mark and the
// pauses, always with the word or the number beside it. Her words are serif.
export const PLAYER_CSS = `
.ldw-player{display:grid;gap:10px;padding:14px 0 4px;border-top:1px solid var(--hk-stroke);min-width:0}
.ldw-pbar{display:flex;align-items:center;gap:12px;min-height:36px}
.ldw-play{all:unset;box-sizing:border-box;width:36px;height:36px;display:grid;place-items:center;border-radius:var(--hk-radius);cursor:pointer;
  background:var(--hk-sunken);color:var(--hk-ink);transition:background 120ms ease,color 120ms ease}
.ldw-play:hover{background:var(--hk-hover);color:var(--hk-accent)}
.ldw-play[aria-pressed=true]{color:var(--hk-accent);background:color-mix(in srgb,var(--hk-accent) 16%,transparent)}
.ldw-play:disabled{cursor:default;color:color-mix(in srgb,var(--hk-ink) 45%,transparent)}
.ldw-play:focus-visible,.ldw-pwave-track:focus-visible,.ldw-quote-mark:focus-visible{outline:2px solid var(--hk-accent);outline-offset:2px}
.ldw-play .codicon{font-size:16px}
.ldw-ptime{font-family:var(--hk-mono);font-size:13px;font-variant-numeric:tabular-nums}
.ldw-ptime b{font-weight:700}
.ldw-pstate{font-size:13px}
.ldw-pwave{position:relative;padding-top:16px}
.ldw-pwave-track{position:relative;height:72px;cursor:pointer;touch-action:none}
.ldw-pwave svg{display:block;width:100%;height:72px}
.ldw-pwave-bars rect{fill:color-mix(in srgb,var(--hk-ink) 42%,transparent)}
.ldw-pwave-played rect{fill:var(--hk-accent)}
.ldw-pwave-pause{fill:color-mix(in srgb,var(--hk-warn-fill) 22%,transparent)}
.ldw-pwave-answer{stroke:var(--hk-ink);stroke-width:1.5;stroke-dasharray:3 3;vector-effect:non-scaling-stroke}
.ldw-pwave-q{stroke:color-mix(in srgb,var(--hk-ink) 55%,transparent);stroke-width:1;vector-effect:non-scaling-stroke}
.ldw-pwave-q[data-on]{stroke:var(--hk-accent);stroke-width:2}
.ldw-pwave-head{stroke:var(--hk-accent);stroke-width:2;vector-effect:non-scaling-stroke}
.ldw-pwave-tag,.ldw-pwave-qn{position:absolute;top:-17px;font-family:var(--hk-mono);font-size:12px;line-height:14px;font-weight:700;white-space:nowrap;pointer-events:none}
.ldw-pwave-tag{text-transform:uppercase;transform:translateX(calc(-100% - 4px))}
.ldw-pwave-tag[data-left]{transform:translateX(4px)}
.ldw-pwave-qn{transform:translateX(-1px);min-width:16px;text-align:center;padding:0 3px;border-radius:var(--hk-radius-sm);background:var(--hk-sunken)}
.ldw-pwave-qn[data-on]{background:var(--hk-accent);color:var(--ui-bg-chrome,var(--hk-bg))}
.ldw-pwave-ticks{position:relative;height:18px;margin-top:4px}
.ldw-pwave-ticks span{position:absolute;transform:translateX(-50%);font-family:var(--hk-mono);font-size:12px}
.ldw-pwave-ticks span:first-child{transform:none}
.ldw-ptx summary{cursor:pointer;font-size:13px;font-weight:600;width:max-content}
.ldw-ptx summary span{font-weight:400}
.ldw-ptx-words{margin:8px 0 0;font-family:var(--ldw-serif,Georgia,serif);font-size:17px;line-height:1.75;max-width:70ch}
.ldw-ptx-words[data-live] .ldw-word{cursor:pointer}
.ldw-word{border-radius:var(--hk-radius-sm);box-shadow:inset 0 -2px 0 transparent;transition:box-shadow 80ms ease-out,background 80ms ease-out}
.ldw-ptx-words[data-live] .ldw-word:hover{background:var(--hk-hover)}
.ldw-word-now{box-shadow:inset 0 -2px 0 var(--hk-accent)}
.ldw-filler{text-decoration:underline dotted var(--hk-warn);text-decoration-thickness:2px;text-underline-offset:5px}
.ldw-pause{display:inline-block;margin:0 2px;padding:0 5px;font-family:var(--hk-mono);font-size:12px;line-height:18px;vertical-align:1px;
  color:var(--hk-warn);border:1px dashed color-mix(in srgb,var(--hk-warn-fill) 60%,transparent);border-radius:var(--hk-radius-sm)}
.ldw-pnote{margin:0;font-size:13px;max-width:70ch}
.ldw-qline{display:grid;grid-template-columns:62px minmax(0,1fr);gap:10px;align-items:start}
.ldw-qline-body{min-width:0;display:grid;gap:2px}
.ldw-quote-mark{all:unset;box-sizing:border-box;display:inline-flex;align-items:center;gap:4px;height:24px;padding:0 6px 0 4px;margin-top:6px;
  border-radius:var(--hk-radius);cursor:pointer;font-family:var(--hk-mono);font-size:12px;font-weight:700;font-variant-numeric:tabular-nums;
  color:inherit;background:color-mix(in srgb,currentColor 9%,transparent);transition:background 120ms ease,color 120ms ease}
.ldw-quote-mark .codicon{font-size:13px}
.ldw-quote-mark:hover{background:color-mix(in srgb,currentColor 16%,transparent)}
.ldw-quote-mark[data-on]{background:var(--hk-accent);color:var(--ui-bg-chrome,#fff)}
.ldw-quote-none{background:transparent;cursor:default}
.ldw-qline[data-on] .ldw-line-said{text-decoration-thickness:3px}
@media (prefers-reduced-motion:reduce){.ldw-word,.ldw-play,.ldw-quote-mark{transition:none}}
@media (max-width:640px){.ldw-qline{grid-template-columns:54px minmax(0,1fr);gap:6px}.ldw-ptx-words{font-size:16px}}
`

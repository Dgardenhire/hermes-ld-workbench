// The floor every event shares: the strip (the event drawn to scale in time), the big clock with the
// timekeeper's cards, the recorder, the last take as a waveform with pause marks, and the ballot sheet.
//
// The recorder is plain web capture (getUserMedia + MediaRecorder), which Hermes Desktop allows in its
// renderer. The microphone is open only between Start speaking and Stop (or cancel, an error, or leaving
// the page). Levels are sampled 20 times a second and kept at 10 a second for timing and pauses.

import { useEffect, useRef, useState } from 'react'
import { Fragment, jsx, jsxs } from 'react/jsx-runtime'
import { Button, Codicon, Textarea } from '@hermes/plugin-sdk'
import { Notice } from 'hermes-ui-kit'
import { Thinking, cls, errText, mmss, post, rest, words } from './core.js'

/* ------------------------------------------------------------------ the strip -- */

// segments: { key, code, sub, minutes (width), state: done|now|later, fill (0..1 for now), onClick }
export function Strip({ segments, label }) {
  return jsx('ol', { className: 'ldw-strip', 'aria-label': label || 'This event, in time', children: segments.map(s => {
    const inner = [jsx('b', { className: 'ldw-seg-code', children: s.code }, 'c'), s.sub ? jsx('span', { className: 'ldw-seg-sub', children: s.sub }, 's') : null]
    const fill = s.state === 'now' && s.fill ? jsx('i', { className: 'ldw-seg-fill', style: { width: `${Math.min(1, s.fill) * 100}%` }, 'aria-hidden': 'true' }, 'f') : null
    const body = s.onClick
      ? jsxs('button', { type: 'button', className: 'ldw-seg-btn', onClick: s.onClick, children: [fill, ...inner] })
      : jsxs(Fragment, { children: [fill, ...inner] })
    return jsx('li', { className: 'ldw-seg', 'data-state': s.state || 'later', 'aria-current': s.state === 'now' ? 'step' : undefined,
      style: { flexGrow: s.minutes || 1, minWidth: s.min || 64 }, children: body }, s.key)
  }) })
}

/* ------------------------------------------------------------------ the clock -- */

// The timekeeper's cards: minutes left, then 30 seconds, then time. The card held up is the one showing.
export function cardsFor(limit) {
  const mins = Math.max(1, Math.ceil(limit / 60))
  const out = []
  for (let m = mins; m >= 1; m--) out.push({ key: String(m), label: String(m), until: (m - 1) * 60 })
  out.push({ key: '30', label: '30', until: 0 })
  out.push({ key: 'time', label: 'Time', until: -Infinity })
  return out
}
export function cardUp(limit, remaining) {
  if (remaining <= 0) return 'time'
  if (remaining <= 30) return '30'
  return String(Math.ceil(remaining / 60))
}

export function Clock({ limit, elapsed = 0, live = false, label }) {
  const remaining = limit - elapsed
  const over = remaining < 0
  const up = cardUp(limit, remaining)
  const cards = cardsFor(limit)
  return jsxs('div', { className: 'ldw-clockface', children: [
    label ? jsx('div', { className: 'ldw-clock-label', children: label }) : null,
    jsxs('div', { className: cls('ldw-bigclock', over && 'ldw-over'), role: 'timer', 'aria-live': 'off',
      'aria-label': over ? `${mmss(-remaining)} over time` : `${mmss(remaining)} left`, children: [
        over ? '+' : '', mmss(Math.abs(remaining)).replace(/^\+/, ''),
        over ? jsx('span', { className: 'ldw-overword', children: 'over' }) : null,
      ] }),
    jsx('div', { className: 'ldw-cards', 'aria-label': 'Time cards', children: cards.map(c => jsx('span', {
      className: cls('ldw-card', c.key === 'time' && 'ldw-card-time'), 'data-up': c.key === up ? '' : undefined,
      'aria-current': c.key === up ? 'true' : undefined, children: c.label }, c.key)) }),
  ] })
}

/* ------------------------------------------------------------------ the recorder -- */

const MIC_ERRORS = {
  denied: 'Hermes is not allowed to use the microphone. On a Mac: System Settings, Privacy & Security, Microphone, then turn on Hermes. On Windows: Settings, Privacy & security, Microphone, then let desktop apps use it.',
  missing: 'No microphone was found. Plug one in, or type your speech instead.',
  busy: "The microphone is busy. If Hermes's wake word is on, turn it off for now, or close other apps that use the mic.",
  unsupported: 'This window cannot record sound. Type your speech instead.',
  broke: 'The recording stopped by itself. What you said so far is kept.',
  noanswer: 'The microphone did not answer. If Hermes is asking for permission, say yes, then press Start speaking again.',
}
export function micError(e) {
  const n = e && e.name
  if (n === 'MicTimeout') return { kind: 'noanswer', text: MIC_ERRORS.noanswer }
  if (n === 'NotAllowedError' || n === 'SecurityError' || n === 'PermissionDeniedError') return { kind: 'denied', text: MIC_ERRORS.denied }
  if (n === 'NotFoundError' || n === 'OverconstrainedError' || n === 'DevicesNotFoundError') return { kind: 'missing', text: MIC_ERRORS.missing }
  if (n === 'NotReadableError' || n === 'AbortError' || n === 'TrackStartError') return { kind: 'busy', text: MIC_ERRORS.busy }
  return { kind: 'unsupported', text: MIC_ERRORS.unsupported }
}
const SOUND = 0.05 // a level this loud starts the clock
const MIMES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4']

// state: idle | asking | armed (mic open, waiting for the first sound) | live | error
export function useRecorder({ limit, onTake }) {
  const [state, setState] = useState('idle')
  const [err, setErr] = useState(null)
  const [elapsed, setElapsed] = useState(0)
  const [level, setLevel] = useState(0)
  const R = useRef({})
  const done = useRef(onTake)
  done.current = onTake

  const cleanup = () => {
    const x = R.current
    clearInterval(x.timer)
    try { x.stream && x.stream.getTracks().forEach(t => t.stop()) } catch (e) { /* already stopped */ }
    try { x.ac && x.ac.state !== 'closed' && x.ac.close() } catch (e) { /* closed */ }
    R.current = { cancelled: x.cancelled }
  }
  useEffect(() => () => { R.current.cancelled = true; R.current.gaveUp = true; try { R.current.rec && R.current.rec.state !== 'inactive' && R.current.rec.stop() } catch (e) { /* gone */ } cleanup() }, [])

  const finish = cancelled => {
    const x = R.current
    if (!x.rec || x.rec.state === 'inactive') { cleanup(); setState('idle'); return }
    x.cancelled = cancelled
    x.rec.stop()
  }

  const start = async () => {
    setErr(null); setElapsed(0); setLevel(0)
    if (!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia) || typeof MediaRecorder === 'undefined') {
      const m = { kind: 'unsupported', text: MIC_ERRORS.unsupported }; setErr(m); setState('error'); return
    }
    setState('asking')
    R.current = { gaveUp: false }
    let stream
    try {
      let late
      const timeout = new Promise((_, no) => { late = setTimeout(() => no(Object.assign(new Error('timeout'), { name: 'MicTimeout' })), 15000) })
      const asking = navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
      asking.then(st => { if (R.current.gaveUp) st.getTracks().forEach(t => t.stop()) }, () => {}) // a late yes never leaves the mic open
      try { stream = await Promise.race([asking, timeout]) } finally { clearTimeout(late) }
    } catch (e) { R.current.gaveUp = true; setErr(micError(e)); setState('error'); return }
    const AC = window.AudioContext || window.webkitAudioContext
    const ac = new AC()
    const an = ac.createAnalyser()
    an.fftSize = 2048
    ac.createMediaStreamSource(stream).connect(an)
    const mime = MIMES.find(m => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(m)) || ''
    let rec
    try { rec = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 32000 } : undefined) } catch (e) { rec = new MediaRecorder(stream) }
    const x = { stream, ac, an, rec, chunks: [], levels: [], half: 0, n: 0, t0: performance.now(), first: null, buf: new Float32Array(an.fftSize), cancelled: false }
    R.current = x
    rec.ondataavailable = e => { if (e.data && e.data.size) x.chunks.push(e.data) }
    rec.onerror = () => { setErr({ kind: 'broke', text: MIC_ERRORS.broke }); finish(false) }
    rec.onstop = () => {
      const duration = (performance.now() - x.t0) / 1000
      const blob = new Blob(x.chunks, { type: (rec.mimeType || mime || 'audio/webm').split(';')[0] })
      const cancelled = x.cancelled
      cleanup()
      setState('idle')
      if (!cancelled && done.current) done.current({ blob, duration, levels: x.levels, mime: blob.type, firstSound: x.first === null ? null : (x.first - x.t0) / 1000 })
    }
    rec.start(1000)
    setState('armed')
    x.timer = setInterval(() => {
      an.getFloatTimeDomainData(x.buf)
      let sum = 0
      for (let i = 0; i < x.buf.length; i++) sum += x.buf[i] * x.buf[i]
      const lv = Math.min(1, Math.sqrt(sum / x.buf.length) * 4)
      x.half = Math.max(x.half, lv)
      if (++x.n % 2 === 0) { x.levels.push(Math.round(x.half * 1000) / 1000); x.half = 0 }
      setLevel(lv)
      const now = performance.now()
      if (x.first === null && lv > SOUND) { x.first = now; setState('live') }
      if (x.first !== null) {
        const el = (now - x.first) / 1000
        setElapsed(el)
        if (el > limit + 60) finish(false) // well past time: the judge has stopped listening
      } else if ((now - x.t0) / 1000 > 120) finish(true) // two minutes of silence: nobody is there
    }, 50)
  }

  const x = R.current
  const firstIdx = x.first ? Math.round((x.first - x.t0) / 100) : null
  return { state, err, elapsed, level, levels: x.levels || [], firstIdx, start, stop: () => finish(false), cancel: () => finish(true), clearErr: () => setErr(null) }
}

// While a take runs: the level as it comes in, drawn on the same timeline the finished take will use, with
// a mark over each silence of 2 seconds or more (and the one still going). It starts at the first sound.
const QUIET = 0.04
export function livePauses(levels, minSeconds = 2) {
  const out = []
  let start = null
  for (let i = 0; i <= levels.length; i++) {
    const quiet = i < levels.length && levels[i] <= QUIET
    if (quiet && start === null) start = i
    else if (!quiet && start !== null) {
      if ((i - start) / 10 >= minSeconds) out.push({ at: start / 10, length: (i - start) / 10, open: i === levels.length })
      start = null
    }
  }
  return out
}
export function LiveWave({ rec, limit }) {
  if (rec.firstIdx === null || rec.firstIdx === undefined) {
    return jsx('div', { className: 'ldw-live ldw-live-wait', children: jsx('span', { children: 'The clock starts when you do.' }) })
  }
  const levels = rec.levels.slice(rec.firstIdx)
  const pauses = livePauses(levels)
  const open = pauses.length && pauses[pauses.length - 1].open
  return jsxs('section', { className: 'ldw-live', 'aria-label': 'Your take so far', children: [
    jsxs('div', { className: 'ldw-last-head', children: [jsx('h3', { className: 'ldw-h3', children: 'Recording' }),
      jsx('span', { className: 'ldw-prov', children: open ? 'Pausing' : `${pauses.length} pause${pauses.length === 1 ? '' : 's'} over 2 seconds` })] }),
    jsx(Wave, { levels, duration: levels.length / 10, pauses, limit }),
  ] })
}

/* ------------------------------------------------------------------ sending a take -- */

function toB64(buf) {
  const bytes = new Uint8Array(buf)
  let bin = ''
  for (let i = 0; i < bytes.length; i += 32768) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 32768))
  return btoa(bin)
}

// meta: { event, segment, limit, prompt, answer, ref }. rec: what useRecorder handed back, or { typed: text }.
export async function sendTake(meta, rec) {
  if (rec.typed !== undefined) return post('speech/take', { ...meta, typed: true, text: rec.typed, duration: 0 })
  const take = await post('speech/take', { ...meta, duration: rec.duration, levels: rec.levels })
  if (!rec.blob || !rec.blob.size) return take
  const bytes = await rec.blob.arrayBuffer()
  const type = rec.blob.type || 'audio/webm'
  try {
    return await rest(`speech/${take.id}/upload`, { method: 'POST', upload: { filename: `${take.id}.webm`, contentType: type, bytes } })
  } catch (e) {
    if (/30 MB|not an audio|empty/i.test(errText(e))) throw e
    return post(`speech/${take.id}/audio`, { b64: toB64(bytes), mime: type }) // older Hermes, or no multipart on the backend
  }
}

const WAITING = new Set(['waiting', 'working'])
export function useTakePoll(take, setTake) {
  useEffect(() => {
    if (!take || !WAITING.has(take.transcript.status)) return undefined
    let alive = true
    const id = setInterval(async () => {
      try { const t = await rest(`speech/${take.id}`); if (alive) setTake(t) } catch (e) { /* keep polling; the take is on disk */ }
    }, 1500)
    return () => { alive = false; clearInterval(id) }
  }, [take && take.id, take && take.transcript.status])
}
export const takeSettled = t => t && !WAITING.has(t.transcript.status)

/* ------------------------------------------------------------------ the last take -- */

// The waveform: one bar per slice of the take, pause marks over the silences, a tick each minute
// (each 10 seconds for a short take), and the moment the answer arrived.
export function Wave({ levels = [], duration = 0, pauses = [], answerAt = null, startsAt = 0, limit = 0 }) {
  const W = 1000
  const H = 64
  const total = Math.max(duration, limit, 1)
  const n = 200
  const per = (total * 10) / n
  const bars = []
  for (let i = 0; i < n; i++) {
    const a = Math.floor(i * per)
    const b = Math.max(a + 1, Math.floor((i + 1) * per))
    let m = 0
    for (let k = a; k < b && k < levels.length; k++) m = Math.max(m, levels[k])
    if (a >= levels.length) break
    const h = Math.max(1.5, Math.min(1, m * 1.6) * (H - 6))
    bars.push(jsx('rect', { x: (i * W) / n + 0.6, y: (H - h) / 2, width: W / n - 1.6, height: h, rx: 0.8, className: 'ldw-wave-bar' }, i))
  }
  const step = total <= 90 ? 10 : 60
  const ticks = []
  for (let t = 0; t <= total + 0.01; t += step) ticks.push(t)
  const x = t => (t / total) * W
  return jsxs('div', { className: 'ldw-wave', children: [
    jsxs('svg', { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'none', role: 'img',
      'aria-label': `Your take: ${mmss(duration)} long, ${pauses.length} pause${pauses.length === 1 ? '' : 's'} over 2 seconds`, children: [
        ...pauses.map((p, i) => jsx('rect', { x: x(p.at), y: 0, width: Math.max(3, x(p.length)), height: H, className: 'ldw-wave-pause' }, `p${i}`)),
        ...bars,
        answerAt !== null && answerAt !== undefined ? jsx('line', { x1: x(answerAt + startsAt), x2: x(answerAt + startsAt), y1: 0, y2: H, className: 'ldw-wave-answer' }, 'a') : null,
      ] }),
    answerAt !== null && answerAt !== undefined ? jsx('span', { className: 'ldw-wave-mark', style: { left: `${(x(answerAt + startsAt) / W) * 100}%` }, children: `Answer ${mmss(answerAt)}` }) : null,
    jsx('div', { className: 'ldw-wave-ticks', 'aria-hidden': 'true', children: ticks.map(t => jsx('span', { style: { left: `${(x(t) / W) * 100}%` }, children: mmss(t) }, t)) }),
  ] })
}

export function Stats({ take, limit }) {
  const s = take.stats || {}
  const items = []
  if (s.estimated) {
    items.push({ v: mmss(s.estimated_seconds), k: `of ${mmss(limit)}, estimated at 140 words a minute`, bad: limit && s.estimated_seconds > limit })
  } else {
    items.push({ v: mmss(s.speaking || 0), k: `of ${mmss(limit)}`, bad: limit && s.speaking > limit + 5 })
    if (s.wpm) items.push({ v: String(s.wpm), k: 'words a minute', bad: s.wpm > 175 || s.wpm < 115 })
    if (s.fillers !== undefined && take.transcript.status === 'done') items.push({ v: String(s.fillers), k: s.fillers === 1 ? 'filler the transcript caught' : 'fillers the transcript caught', bad: s.speaking >= 20 && s.fillers / (s.speaking / 60) > 4 })
    items.push({ v: String((s.pauses || []).length), k: 'pauses over 2 seconds', bad: (s.pauses || []).length >= 3 })
  }
  if (s.answer_at !== undefined && s.answer_at !== null) {
    const aim = limit <= 90 ? 20 : 60
    items.push({ v: mmss(s.answer_at), k: s.answer_at > aim ? `to your answer (aim for ${mmss(aim)})` : 'to your answer', bad: s.answer_at > aim })
  }
  return jsx('dl', { className: 'ldw-stats', children: items.map((it, i) => jsxs('div', { className: 'ldw-stat', 'data-bad': it.bad ? '' : undefined, children: [
    jsx('dt', { className: 'hk-sr', children: it.k }), jsxs('dd', { children: [jsx('b', { children: it.v }), ' ', it.k] }),
  ] }, i)) })
}

export function transcriptLine(t) {
  const st = t.transcript.status
  if (st === 'done') return 'Transcript, on this computer'
  if (st === 'typed') return t.typed ? 'Typed, not recorded' : 'Your words, typed'
  if (st === 'waiting' || st === 'working') return 'Making the transcript on this computer'
  if (st === 'unavailable') return 'Timing only'
  if (st === 'failed') return 'Timing only'
  if (st === 'cancelled') return 'Transcript stopped'
  return ''
}

export const TRANSCRIPTS_OFF = "Transcripts need Hermes's local speech-to-text. In Hermes Settings, Voice, set the speech-to-text provider to local and use voice input once. Then press Transcribe now. Or type what you said."

// The last take: header, waveform, numbers, the transcript state and what to do about it.
export function LastTake({ take, limit, title, onChange, children }) {
  const [typing, setTyping] = useState(false)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const st = take.transcript.status
  const call = async fn => { setBusy(true); setErr(null); try { onChange(await fn()) } catch (e) { setErr(errText(e)) } finally { setBusy(false) } }
  const s = take.stats || {}
  return jsxs('section', { className: 'ldw-last', 'aria-label': title || 'Your last take', children: [
    jsxs('div', { className: 'ldw-last-head', children: [jsx('h3', { className: 'ldw-h3', children: title || 'Your take' }), jsx('span', { className: 'ldw-prov', children: transcriptLine(take) })] }),
    !take.typed ? jsx(Wave, { levels: take.levels || [], duration: take.duration, pauses: s.pauses || [], answerAt: s.answer_at, startsAt: s.starts_at || 0, limit }) : null,
    jsx(Stats, { take, limit }),
    WAITING.has(st) ? jsxs('div', { className: 'hk-row', children: [jsx(Thinking, { label: 'Making the transcript on this computer' }),
      jsx('button', { type: 'button', className: 'hk-link', onClick: () => call(() => post(`speech/${take.id}/cancel`)), children: 'Stop' })] }) : null,
    st === 'unavailable' || st === 'failed' || st === 'cancelled' ? jsx(Notice, { tone: 'warn', children: st === 'failed' ? take.transcript.error : TRANSCRIPTS_OFF,
      action: jsxs('div', { className: 'hk-actions', children: [
        take.has_audio ? jsx(Button, { size: 'sm', variant: 'secondary', loading: busy, onClick: () => call(() => post(`speech/${take.id}/transcribe`)), children: 'Transcribe now' }) : null,
        jsx(Button, { size: 'sm', variant: 'secondary', onClick: () => setTyping(true), children: 'Type what you said' }),
      ] }) }) : null,
    typing ? jsxs('div', { className: 'hk-stack', children: [
      jsx(Textarea, { className: 'ldw-speechbox ldw-short', 'aria-label': 'What you said', value: text, onChange: e => setText(e.target.value) }),
      jsxs('div', { className: 'hk-actions', children: [
        jsx(Button, { size: 'sm', loading: busy, disabled: !words(text), onClick: () => call(() => post(`speech/${take.id}/text`, { text })).then(() => setTyping(false)), children: 'Use these words' }),
        jsx(Button, { size: 'sm', variant: 'secondary', onClick: () => setTyping(false), children: 'Cancel' }),
      ] }),
    ] }) : null,
    (st === 'done' || st === 'typed') && take.transcript.text ? jsxs('details', { className: 'ldw-said', children: [
      jsx('summary', { children: `What you said · ${words(take.transcript.text)} words` }), jsx('p', { className: 'ldw-spoken', children: take.transcript.text }),
    ] }) : null,
    err ? jsx(Notice, { tone: 'bad', children: err }) : null,
    children || null,
  ] })
}

/* ------------------------------------------------------------------ speaking -- */

// The big start button with the recorder's states; "Type instead" when the mic will not do.
export function SpeakControls({ rec, onTyped, startLabel = 'Start speaking', extra }) {
  const [typing, setTyping] = useState(false)
  const [text, setText] = useState('')
  const live = rec.state === 'live' || rec.state === 'armed'
  return jsxs('div', { className: 'ldw-go', children: [
    !live ? jsxs('button', { type: 'button', className: 'ldw-rec', disabled: rec.state === 'asking', onClick: rec.start, children: [
      jsx(Codicon, { name: 'mic' }), rec.state === 'asking' ? 'Opening the microphone' : startLabel] }) : null,
    live ? jsxs('button', { type: 'button', className: 'ldw-rec ldw-rec-stop', onClick: rec.stop, children: [
      jsx('span', { className: 'ldw-level', style: { '--lv': rec.level }, 'aria-hidden': 'true' }), rec.state === 'armed' ? 'Listening. Start when ready' : 'Stop'] }) : null,
    live ? jsx('button', { type: 'button', className: 'hk-link ldw-center', onClick: rec.cancel, children: 'Cancel this take' }) : null,
    !live && !typing ? jsx('button', { type: 'button', className: 'hk-link ldw-center', onClick: () => setTyping(true), children: 'Type instead' }) : null,
    !live && extra ? extra : null,
    rec.err ? jsx(Notice, { tone: rec.err.kind === 'broke' ? 'warn' : 'bad', children: rec.err.text }) : null,
    typing && !live ? jsxs('div', { className: 'hk-stack', children: [
      jsx(Textarea, { className: 'ldw-speechbox ldw-short', 'aria-label': 'Your speech, typed', value: text, onChange: e => setText(e.target.value) }),
      jsx('span', { className: 'ldw-meta', children: `${words(text)} words · about ${mmss(words(text) / 140 * 60)} aloud, estimated at 140 words a minute` }),
      jsxs('div', { className: 'hk-actions', children: [
        jsx(Button, { size: 'sm', disabled: !words(text), onClick: () => { onTyped(text); setTyping(false); setText('') }, children: 'Use this' }),
        jsx(Button, { size: 'sm', variant: 'secondary', onClick: () => setTyping(false), children: 'Cancel' }),
      ] }),
    ] }) : null,
  ] })
}

/* ------------------------------------------------------------------ the ballot sheet -- */

function PointsScale({ points }) {
  const marks = [20, 22, 24, 26, 28, 30]
  const pos = points === null || points === undefined ? null : ((points - 20) / 10) * 100
  return jsxs('div', { className: 'ldw-pts', children: [
    jsxs('div', { className: 'ldw-pts-lbl', children: ['Points ', jsx('b', { children: points === null || points === undefined ? 'none' : points.toFixed(1) })] }),
    jsxs('div', { className: 'ldw-pts-scale', 'aria-hidden': 'true', children: [
      ...marks.map(m => jsx('span', { style: { left: `${((m - 20) / 10) * 100}%` }, children: m }, m)),
      pos !== null ? jsx('i', { className: 'ldw-pts-mark', style: { left: `${pos}%` } }) : null,
    ] }),
  ] })
}

const ANSWERED = { yes: 'Yes', partly: 'Partly', no: 'No' }

// The extemp ballot: read in ten seconds, the full reason folded.
export function ExtempSheet({ b, onDrill, drillLabel = 'Run the drill' }) {
  const [open, setOpen] = useState(false)
  const m = b.measured || {}
  const verdictWord = { yes: 'You answered the question', partly: 'You partly answered the question', no: 'You did not answer the question' }[b.answered]
  return jsxs('article', { className: 'ldw-sheet', 'aria-label': 'Ballot', children: [
    jsxs('div', { className: 'ldw-sheet-head', children: [jsx('b', { children: b.event === 'drill' ? '60-second answer' : 'Extemporaneous speaking' }), jsx('span', { children: 'Practice ballot' })] }),
    jsxs('div', { className: 'ldw-sheet-fields', children: [
      jsxs('div', { children: [jsx('i', { children: 'Judge' }), 'Extemp judge'] }),
      jsxs('div', { children: [jsx('i', { children: 'Time' }), m.typed ? 'typed' : `${mmss(m.speaking || 0)} of ${mmss(m.limit || 0)}`] }),
      jsxs('div', { children: [jsx('i', { children: 'Sources named' }), String((b.sources_cited || []).length)] }),
      jsxs('div', { children: [jsx('i', { children: 'Pace' }), m.wpm ? `${m.wpm} words a minute` : m.typed ? 'typed' : 'no transcript'] }),
    ] }),
    jsx('div', { className: 'ldw-sheet-q', children: b.question }),
    jsxs('div', { className: 'ldw-sheet-dec', children: [
      jsxs('div', { className: 'ldw-boxes', role: 'img', 'aria-label': `Answered the question: ${ANSWERED[b.answered]}`, children: ['yes', 'partly', 'no'].map(k => jsxs('span', { children: [
        jsx('span', { className: 'ldw-box', 'data-x': b.answered === k ? '1' : '0' }), ANSWERED[k]] }, k)) }),
      jsx('div', { className: 'ldw-verdict', children: b.summary || verdictWord }),
      jsx(PointsScale, { points: b.points }),
    ] }),
    b.decisive && b.decisive.length ? jsxs('div', { className: 'ldw-declines', children: [
      jsx('h4', { children: 'The lines that decided it' }),
      ...b.decisive.map((d, i) => jsxs('div', { className: 'ldw-line', children: [
        jsx('span', { className: 'ldw-line-said', children: `"${d.line}"` }),
        jsx('span', { className: 'ldw-line-effect', children: d.effect }),
        d.checked === false ? jsx('span', { className: 'ldw-line-flag', children: 'Not found in your transcript. Check it.' }) : null,
      ] }, i)),
    ] }) : null,
    b.drill ? jsxs('div', { className: 'ldw-drillrow', children: [
      jsx('span', { className: 'ldw-stamp2', children: 'Drill' }),
      jsxs('p', { children: [jsx('strong', { children: b.drill.name }), '. ', b.drill.how] }),
      onDrill ? jsx(Button, { size: 'sm', onClick: onDrill, children: drillLabel }) : null,
    ] }) : null,
    jsxs('button', { type: 'button', className: 'ldw-fold', 'aria-expanded': open, onClick: () => setOpen(v => !v), children: [
      jsx('span', { children: open ? 'Hide the full reason for decision' : 'Read the full reason for decision' }), jsx('span', { children: `${words(b.reason)} words` })] }),
    open ? jsxs('div', { className: 'ldw-sheet-rfd', children: [
      jsx('p', { children: b.reason }),
      b.strengths && b.strengths.length ? jsxs(Fragment, { children: [jsx('h4', { children: 'What worked' }), jsx('ul', { children: b.strengths.map((s, i) => jsx('li', { children: s }, i)) })] }) : null,
    ] }) : null,
  ] })
}

const SIDE = { aff: 'Affirmative', neg: 'Negative' }
const firstSentence = t => { const m = String(t || '').match(/^.{20,170}?[.!?](\s|$)/); return m ? m[0].trim() : clip2(t, 150) }
const clip2 = (t, n) => { t = String(t || ''); return t.length > n ? `${t.slice(0, n - 1).trimEnd()}...` : t }

// The Lincoln-Douglas ballot, read in ten seconds: the decision, your points, the three lines that decided
// it (checked against the speeches), one drill stamped. The full reason, framework and the rest are folded.
export function LdSheet({ b, onLine, onDrill }) {
  const [open, setOpen] = useState(false)
  const pts = b.speaker_points || {}
  const won = b.decision === b.side
  const spoken = b.measured ? Object.keys(b.measured) : []
  const lines = (b.decisive || []).slice(0, 3)
  const more = (b.decisive || []).slice(3)
  const [drill, ...drills] = b.drills || []
  const line = (d, i) => {
    const said = jsxs(Fragment, { children: [jsx('span', { className: 'ldw-line-code', children: d.speech }), jsx('span', { className: 'ldw-line-said', children: `"${d.line}"` })] })
    return jsxs('div', { className: 'ldw-line', children: [
      onLine ? jsx('button', { type: 'button', className: 'ldw-line-btn', onClick: () => onLine(d.speech), title: `Find the ${d.speech} on the flow`, children: said }) : jsx('div', { children: said }),
      jsx('span', { className: 'ldw-line-effect', children: d.effect }),
      d.checked === false ? jsx('span', { className: 'ldw-line-flag', children: `Not found in the ${d.speech || 'round'} as given. Check it on the flow.` }) : null,
    ] }, i)
  }
  return jsxs('article', { className: 'ldw-sheet', 'aria-label': 'Ballot', children: [
    jsxs('div', { className: 'ldw-sheet-head', children: [jsx('b', { children: 'Lincoln-Douglas' }), jsx('span', { children: `Practice ballot${b.round_no ? ` · round ${b.round_no}` : ''}` })] }),
    jsxs('div', { className: 'ldw-sheet-fields', children: [
      jsxs('div', { children: [jsx('i', { children: 'Judge' }), b.judge || 'Judge'] }),
      jsxs('div', { children: [jsx('i', { children: 'You' }), SIDE[b.side] || 'Your side'] }),
      jsxs('div', { children: [jsx('i', { children: 'Speeches' }), spoken.length ? `${spoken.length} spoken, timed` : 'typed'] }),
      jsxs('div', { children: [jsx('i', { children: 'Opponent' }), pts.opponent ? `${pts.opponent.toFixed(1)} points` : 'no points'] }),
    ] }),
    b.resolution ? jsx('div', { className: 'ldw-sheet-q', children: b.resolution }) : null,
    jsxs('div', { className: 'ldw-sheet-dec', children: [
      jsxs('div', { className: 'ldw-boxes', role: 'img', 'aria-label': `Decision: ${SIDE[b.decision] || 'none'}`, children: ['aff', 'neg'].map(k => jsxs('span', { children: [
        jsx('span', { className: 'ldw-box', 'data-x': b.decision === k ? '1' : '0' }), SIDE[k]] }, k)) }),
      jsx('div', { className: 'ldw-verdict ldw-ldverdict', children: won ? 'You won' : 'You lost' }),
      jsx(PointsScale, { points: pts.student }),
    ] }),
    b.reason ? jsx('p', { className: 'ldw-sheet-why', children: firstSentence(b.reason) }) : null,
    lines.length ? jsxs('div', { className: 'ldw-declines', children: [jsx('h4', { children: 'The lines that decided it' }), ...lines.map(line)] }) : null,
    drill ? jsxs('div', { className: 'ldw-drillrow', children: [
      jsx('span', { className: 'ldw-stamp2', children: 'Drill' }),
      jsxs('p', { children: [jsx('strong', { children: drill.name }), '. ', drill.how] }),
      onDrill ? jsx(Button, { size: 'sm', onClick: onDrill, children: 'Redo a speech' }) : null,
    ] }) : null,
    jsxs('button', { type: 'button', className: 'ldw-fold', 'aria-expanded': open, onClick: () => setOpen(v => !v), children: [
      jsx('span', { children: open ? 'Hide the full reason for decision' : 'Read the full reason for decision' }),
      jsx('span', { children: `${words(b.reason)} words${drills.length ? ` · ${drills.length} more drill${drills.length === 1 ? '' : 's'}` : ''}` })] }),
    open ? jsxs('div', { className: 'ldw-sheet-rfd', children: [
      jsx('p', { children: b.reason }),
      b.framework ? jsxs(Fragment, { children: [jsx('h4', { children: 'Framework' }), jsx('p', { children: b.framework })] }) : null,
      b.ownership ? jsxs(Fragment, { children: [jsx('h4', { children: 'Did you own your case?' }), jsx('p', { children: b.ownership })] }) : null,
      more.length ? jsxs(Fragment, { children: [jsx('h4', { children: 'More lines the judge named' }), ...more.map((d, i) => line(d, `m${i}`))] }) : null,
      b.strengths && b.strengths.length ? jsxs(Fragment, { children: [jsx('h4', { children: 'What worked' }), jsx('ul', { children: b.strengths.map((s, i) => jsx('li', { children: s }, i)) })] }) : null,
      drills.length ? jsxs(Fragment, { children: [jsx('h4', { children: 'More drills' }), ...drills.map((d, i) => jsxs('div', { className: 'ldw-drill2', children: [
        jsx('strong', { children: d.name }), jsx('p', { children: d.why }), jsx('p', { children: d.how })] }, i))] }) : null,
    ] }) : null,
  ] })
}

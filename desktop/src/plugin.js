// LD Workbench, desktop half ("Tournament Room"). SOURCE: desktop/plugin.js is built from this file and the
// shared hermes-ui-kit by `node ../../../products/hermes-ui-kit/scripts/build.mjs .` (esbuild). Edit here, then build.
//
// The built file is one ES module that imports only '@hermes/plugin-sdk', 'react' and 'react/jsx-runtime'.
// No JSX: jsx() calls. No innerHTML: the coach's answers are turned into React elements by renderText().
//
// The page only renders and sends the student's words. Everything else lives in the Python backend
// (dashboard/plugin_api.py, reached through ctx.rest): the prompts, every model call (on the user's own
// Hermes model), the case library, the round, the ballots. Nothing real is kept in browser storage.
//
// Three views on one page (plus a print view of a case):
//  - Tournament Room: the posting board of the seven speeches, the clock (speech time and prep), the
//    student's speech or the opponent's, cross-examination, and the last ballot as a paper card.
//  - Case Workbench: My cases, the writing path, the case sections with their helpers, and the coach.
//  - Fallacies: the guide, a practice drill with a session score, and a checker for any pasted argument.
// Colors come only from the app's theme variables (through the kit's --hk-* tokens).

import { useEffect, useRef, useState } from 'react'
import { Fragment, jsx, jsxs } from 'react/jsx-runtime'
import { Button, Codicon, Input, SegmentedControl, Textarea, atom, host, useValue } from '@hermes/plugin-sdk'
import { Empty, Failure, Notice, describeError, installStyles, registerPage } from 'hermes-ui-kit'

export { describeError }

const PLUGIN_ID = 'ld-workbench'
const ROUTE = '/debate'
const WPM = 140
const MODEL_TIMEOUT = 300000

let api = null
const $cfg = atom(null)
const $state = atom(null) // { workbench: { case, cases, source }, round, history }
const $view = atom('room') // room | bench | print
const $loadError = atom(null)

/* ------------------------------------------------------------------ backend -- */

function rest(path, options) {
  if (!api) return Promise.reject(new Error('The workbench is not connected.'))
  return api.rest(path, { timeoutMs: MODEL_TIMEOUT, ...(options || {}) })
}
const post = (path, body) => rest(path, { method: 'POST', body: body || {} })
const errText = e => describeError(e).detail || 'Something went wrong. Try again.'

function setWorkbench(wb) {
  const s = $state.get() || {}
  $state.set({ ...s, workbench: { ...(s.workbench || {}), ...wb } })
}
function setRound(r) {
  const s = $state.get() || {}
  $state.set({ ...s, round: r })
}

async function load() {
  try {
    const [cfg, st] = await Promise.all([$cfg.get() ? $cfg.get() : rest('config'), rest('state')])
    $cfg.set(cfg)
    $state.set(st)
    $loadError.set(null)
  } catch (e) {
    $loadError.set(e)
  }
}
async function refreshState() {
  try { $state.set(await rest('state')) } catch (e) { /* keep what is on screen */ }
}

/* ------------------------------------------------------------------ helpers -- */

const words = s => (s || '').trim().split(/\s+/).filter(Boolean).length
function mmss(sec) {
  const neg = sec < 0
  sec = Math.abs(Math.round(sec))
  return (neg ? '+' : '') + Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0')
}
const sideName = s => (s === 'aff' ? 'affirmative' : 'negative')
const sideShort = s => (s === 'aff' ? 'Aff' : 'Neg')
const clip = (t, n) => { t = String(t || ''); return t.length > n ? t.slice(0, n - 3).replace(/\s+\S*$/, '') + '...' : t }
const cls = (...xs) => xs.filter(Boolean).join(' ')
function when(t) {
  if (!t) return ''
  const d = new Date(t * 1000)
  const days = Math.floor((Date.now() - d.getTime()) / 86400000)
  if (days < 1) return 'Edited today'
  if (days < 2) return 'Edited yesterday'
  return 'Edited ' + d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

// The coach writes light Markdown: paragraphs, - and 1. lists, **bold**, *italic*. Rendered as elements.
function inline(text, key) {
  const out = []
  const re = /\*\*(.+?)\*\*|\*([^*\n]+)\*/g
  let last = 0
  let m
  let i = 0
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index))
    out.push(m[1] ? jsx('strong', { children: m[1] }, `${key}-b${i++}`) : jsx('em', { children: m[2] }, `${key}-i${i++}`))
    last = re.lastIndex
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}
function renderText(text) {
  const blocks = []
  let para = []
  let list = null
  const flush = () => { if (para.length) { blocks.push(jsx('p', { children: inline(para.join(' '), `p${blocks.length}`) }, `p${blocks.length}`)); para = [] } }
  const close = () => { if (list) { const L = list; blocks.push(jsx(L.tag, { start: L.start, children: L.items }, `l${blocks.length}`)); list = null } }
  for (const raw of String(text || '').split('\n')) {
    const l = raw.trim()
    const ul = l.match(/^[-*•]\s+(.*)/)
    const ol = l.match(/^(?:\d+)[.)]\s+(.*)/)
    const num = ol ? parseInt(l, 10) : undefined
    if (ul || ol) {
      flush()
      const tag = ul ? 'ul' : 'ol'
      if (!list || list.tag !== tag) { close(); list = { tag, items: [], start: tag === 'ol' && num > 1 ? num : undefined } }
      list.items.push(jsx('li', { children: inline((ul || ol)[1], `li${blocks.length}-${list.items.length}`) }, list.items.length))
    } else if (!l) { flush(); close() } else { close(); para.push(l.replace(/^#+\s*/, '')) }
  }
  flush(); close()
  return jsx('div', { className: 'ldw-prose', children: blocks })
}

const Thinking = ({ label }) => jsxs('div', { className: 'ldw-thinking', role: 'status', children: [jsx('span', { className: 'hk-spinner' }), label] })
const Label = ({ children, accent }) => jsx('div', { className: cls('ldw-label', accent && 'ldw-accent'), children })

/* ------------------------------------------------------------------ method data shown on the page -- */

const SECTION_HINTS = {
  'Resolution analysis': 'What is the resolution really asking? What would have to be true for your side to win?',
  Definitions: 'Only the terms that matter. Where does each definition come from?',
  Value: 'The highest good at stake in this resolution, and why it matters most here.',
  Criterion: 'How the judge measures who best upholds the value. It must link to the value.',
  'Contention 1': 'Claim, warrant, evidence, impact. Why it proves your side under your criterion.',
  'Contention 2': 'A different reason, not the same one restated.',
  'Contention 3': 'Optional. Only if you can fit it in the time.',
  Blocks: 'Attacks you expect and how you will answer them. These are not read in the constructive.',
  'Other material': 'Anything from a case you brought in that does not fit above: an introduction, citations, notes. Move it where it belongs.',
}
const READ_SECTIONS = ['Resolution analysis', 'Definitions', 'Value', 'Criterion', 'Contention 1', 'Contention 2', 'Contention 3']
const ICONS = { breakdown: 'search', definitions: 'book', values: 'law', criteria: 'law', arguments: 'type-hierarchy', review: 'checklist',
  fallacies: 'warning', coach: 'question', explain: 'book', stress: 'law', attack: 'shield', logic: 'type-hierarchy', sources: 'search', notes: 'edit' }
const SECTION_TOOLS = {
  'Resolution analysis': ['breakdown', 'coach', 'explain'], Definitions: ['definitions', 'sources', 'coach'],
  Value: ['values', 'stress', 'explain', 'coach'], Criterion: ['criteria', 'stress', 'explain', 'coach'],
  'Contention 1': ['arguments', 'logic', 'fallacies', 'attack', 'sources', 'coach'], 'Contention 2': ['arguments', 'logic', 'fallacies', 'attack', 'sources', 'coach'],
  'Contention 3': ['arguments', 'logic', 'fallacies', 'attack', 'sources', 'coach'], Blocks: ['attack', 'coach'], 'Other material': ['coach', 'notes'],
}
const PANEL_TOOLS = ['coach', 'explain', 'stress', 'attack', 'logic', 'sources', 'notes', 'review']
const PATH = [
  { title: 'Understand the resolution', desc: 'What it asks, and what each key word means', sections: ['Resolution analysis', 'Definitions'], tool: 'breakdown' },
  { title: 'Build the framework', desc: 'Your value and the criterion that measures it', sections: ['Value', 'Criterion'], tool: 'values' },
  { title: 'Write contentions', desc: 'Two or three reasons, each with claim, warrant, impact', sections: ['Contention 1', 'Contention 2'], tool: 'arguments' },
  { title: 'Find evidence', desc: 'Where to look, and what will survive a challenge', sections: ['Contention 1', 'Contention 2', 'Contention 3'], tool: 'sources', min: 40 },
  { title: 'Prepare blocks', desc: 'The attacks coming, and your answers', sections: ['Blocks'], tool: 'attack' },
  { title: 'Review and test', desc: 'Full review, then a practice round', sections: [], tool: 'review' },
]

/* ================================================================== Tournament Room == */

function stops() { return ($cfg.get() || {}).round || [] }
const speakerOf = (stop, side) => (stop.side === side ? 'student' : 'ai')
const currentStop = r => (r && r.phase === 'live' ? stops()[r.i] : null)

function Board({ r }) {
  return jsx('ol', { className: 'ldw-board', 'aria-label': 'Speeches in this round', children: stops().map((s, i) => {
    const state = !r ? 'later' : r.phase !== 'live' || i < r.i ? 'done' : i === r.i ? 'now' : 'later'
    const who = !r ? (s.kind === 'cx' ? 'CX' : 'Speech')
      : s.kind === 'cx' ? (speakerOf(s, r.side) === 'student' ? 'You ask' : 'Opp asks') : speakerOf(s, r.side) === 'student' ? 'You' : 'Opp'
    return jsxs('li', { className: 'ldw-slot', 'data-state': state, 'aria-current': state === 'now' ? 'step' : undefined, children: [
      jsx('div', { className: 'ldw-slot-id', children: s.kind === 'cx' ? 'CX' : s.id }),
      jsxs('div', { className: 'ldw-slot-who', children: [who, ' · ', mmss(s.minutes * 60)] }),
      state === 'done' ? jsx(Codicon, { name: 'check', className: 'ldw-slot-check' }) : null,
    ] }, s.id)
  }) })
}

// Prep runs on the page and is saved to the round when it stops (it only ever goes down).
function usePrep(r) {
  const [left, setLeft] = useState(r ? r.prep : 0)
  const [running, setRunning] = useState(false)
  const ref = useRef(left)
  ref.current = left
  useEffect(() => { if (!running && r) setLeft(r.prep) }, [r && r.prep, r && r.round_no])
  useEffect(() => {
    if (!running) return undefined
    const id = setInterval(() => setLeft(v => {
      if (v <= 1) { setRunning(false); return 0 }
      return v - 1
    }), 1000)
    return () => clearInterval(id)
  }, [running])
  useEffect(() => { if (!running && r && left < r.prep) post('round/prep', { left: ref.current }).then(setRound, () => {}) }, [running])
  return { left, running, toggle: () => { if (!running && left <= 0) return; setRunning(v => !v) }, stop: () => setRunning(false) }
}

function useCountdown(seconds, key) {
  const [left, setLeft] = useState(seconds)
  const [running, setRunning] = useState(false)
  useEffect(() => { setLeft(seconds); setRunning(false) }, [key])
  useEffect(() => {
    if (!running) return undefined
    const id = setInterval(() => setLeft(v => v - 1), 1000)
    return () => clearInterval(id)
  }, [running])
  return { left, running, start: () => setRunning(true), pause: () => setRunning(false) }
}

function ClockPanel({ big, label, fraction, rows, actions, over }) {
  return jsxs('section', { className: 'ldw-panel ldw-clock', 'aria-label': 'Clock', children: [
    jsx(Label, { children: 'Clock' }),
    jsxs('div', { className: 'ldw-watch', children: [
      jsx('div', { className: cls('ldw-watch-time', over && 'ldw-over'), role: 'timer', 'aria-live': 'off', children: big }),
      jsx(Label, { accent: true, children: label }),
    ] }),
    jsx('div', { className: 'ldw-bar', children: jsx('span', { style: { width: `${Math.max(0, Math.min(1, fraction || 0)) * 100}%` } }) }),
    jsx('dl', { className: 'ldw-rows', children: rows.map(([k, v]) => jsxs(Fragment, { children: [jsx('dt', { children: k }), jsx('dd', { children: v })] }, k)) }),
    jsx('div', { className: 'ldw-clock-actions', children: actions }),
  ] })
}

const BigButton = ({ primary, icon, children, ...rest }) =>
  jsx(Button, { variant: primary ? 'default' : 'secondary', className: cls('ldw-big', primary && 'ldw-primary'), ...rest,
    children: jsxs(Fragment, { children: [icon ? jsx(Codicon, { name: icon }) : null, children] }) })

function PrepButton({ prep }) {
  return jsx(BigButton, { icon: prep.running ? 'debug-pause' : 'watch', onClick: prep.toggle, disabled: !prep.running && prep.left <= 0,
    children: prep.running ? 'Stop prep' : prep.left > 0 ? 'Use prep' : 'No prep left' })
}

function useDictation(onText) {
  const SR = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition)
  const [on, setOn] = useState(false)
  const [err, setErr] = useState(null)
  const rec = useRef(null)
  useEffect(() => () => { try { rec.current && rec.current.stop() } catch (e) { /* gone */ } }, [])
  if (!SR) return null
  return {
    on, err,
    toggle() {
      if (rec.current) { rec.current.stop(); return }
      setErr(null)
      const r = new SR()
      r.continuous = true; r.interimResults = false; r.lang = 'en-US'
      r.onresult = e => { for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) onText(e.results[i][0].transcript.trim()) }
      r.onend = () => { rec.current = null; setOn(false) }
      r.onerror = () => setErr('Speaking is not available here. Type your speech instead.')
      rec.current = r
      r.start(); setOn(true)
    },
  }
}

function StudentSpeech({ r, stop }) {
  const [text, setText] = useState(r.drafts[stop.id] || '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const clock = useCountdown(stop.minutes * 60, `${r.round_no}-${stop.id}`)
  const prep = usePrep(r)
  const timer = useRef(null)
  const save = v => { clearTimeout(timer.current); timer.current = setTimeout(() => post('round/draft', { speech_id: stop.id, text: v }).catch(() => {}), 700) }
  useEffect(() => () => clearTimeout(timer.current), [])
  const change = v => { setText(v); save(v) }
  const dict = useDictation(t => setText(v => { const n = v + (v && !/\s$/.test(v) ? ' ' : '') + t; save(n); return n }))
  const finish = async () => {
    if (!text.trim()) { setErr('Give your speech first.'); return }
    clearTimeout(timer.current); clock.pause(); prep.stop(); setBusy(true); setErr(null)
    try { setRound(await post('round/speech', { speech_id: stop.id, text })) } catch (e) { setErr(errText(e)) } finally { setBusy(false) }
  }
  const spoken = words(text) / WPM * 60
  const target = stop.minutes * 60
  const pace = !text.trim() ? 'Not started' : spoken > target ? `${mmss(spoken - target)} too long` : spoken < target * 0.6 ? 'Short' : 'On time'
  return jsxs(Fragment, { children: [
    jsx(ClockPanel, {
      big: mmss(clock.left), over: clock.left < 0, label: `${stop.id} · Your speech`, fraction: 1 - clock.left / target,
      rows: [['Prep left', mmss(prep.left)], ['Pace', pace], ['Spoken length', `about ${mmss(spoken)}`]],
      actions: [
        jsx(BigButton, { key: 'f', primary: true, icon: 'arrow-right', onClick: finish, loading: busy, children: 'Finish speech' }),
        clock.running ? jsx(BigButton, { key: 'c', icon: 'debug-pause', onClick: clock.pause, children: 'Pause clock' })
          : jsx(BigButton, { key: 'c', icon: 'play', onClick: clock.start, children: clock.left === target ? 'Start clock' : 'Resume clock' }),
        jsx(PrepButton, { key: 'p', prep }),
        dict ? jsx(BigButton, { key: 'd', icon: dict.on ? 'debug-pause' : 'mic', onClick: dict.toggle, children: dict.on ? 'Stop speaking' : 'Speak instead of type' }) : null,
      ],
    }),
    jsxs('section', { className: 'ldw-panel ldw-stage', 'aria-label': 'Your speech', children: [
      jsx(Label, { children: `Your ${stop.id} · ${stop.name}` }),
      jsx('p', { className: 'ldw-goal', children: ($cfg.get().speech_goals || {})[stop.id] }),
      jsx(Textarea, { className: 'ldw-speechbox', 'aria-label': `Your ${stop.id}`, value: text, onChange: e => change(e.target.value),
        placeholder: "Give your speech here. Signpost as you go: 'Off the top, framework.' 'On their first contention...'" }),
      err ? jsx(Notice, { tone: 'bad', children: err }) : null,
      dict && dict.err ? jsx(Notice, { tone: 'warn', children: dict.err }) : null,
      jsx('div', { className: 'ldw-meta', children: `${words(text)} words · about ${mmss(spoken)} spoken at ${WPM} words a minute` }),
    ] }),
  ] })
}

function OpponentSpeech({ r, stop }) {
  const pending = r.pending_ai && r.pending_ai.id === stop.id ? r.pending_ai.text : null
  const [err, setErr] = useState(null)
  const [busy, setBusy] = useState(false)
  const prep = usePrep(r)
  const ask = () => { setErr(null); post('round/opponent').then(setRound, e => setErr(errText(e))) }
  useEffect(() => { if (!pending) ask() }, [r.round_no, stop.id])
  const next = async () => {
    prep.stop(); setBusy(true)
    try { setRound(await post('round/opponent/done')) } catch (e) { setErr(errText(e)) } finally { setBusy(false) }
  }
  return jsxs(Fragment, { children: [
    jsx(ClockPanel, {
      big: mmss(prep.left), label: `${stop.id} · Opponent · your prep`, fraction: 1 - prep.left / (($cfg.get().prep_minutes || 4) * 60),
      rows: [['Speech time', mmss(stop.minutes * 60)], ['Prep left', mmss(prep.left)]],
      actions: [
        jsx(BigButton, { key: 'n', primary: true, icon: 'arrow-right', disabled: !pending, loading: busy, onClick: next, children: 'Continue' }),
        jsx(PrepButton, { key: 'p', prep }),
      ],
    }),
    jsxs('section', { className: 'ldw-panel ldw-stage', 'aria-label': "Opponent's speech", children: [
      jsx(Label, { children: `Opponent's ${stop.id} · ${stop.name}` }),
      err ? jsx(Failure, { title: 'The opponent could not speak', body: err, onRetry: ask }) : null,
      !pending && !err ? jsx(Thinking, { label: 'Your opponent is writing the speech' }) : null,
      pending ? jsxs(Fragment, { children: [
        jsx('div', { className: 'ldw-speech', children: renderText(pending) }),
        jsx('div', { className: 'ldw-meta', children: `${words(pending)} words · about ${mmss(words(pending) / WPM * 60)} spoken. Flow it as you read.` }),
        jsx(SpotSpeech, { r, id: stop.id }),
      ] }) : null,
    ] }),
  ] })
}

// Fallacies in one of the opponent's speeches. The answer is kept with the round on the backend.
function SpotSpeech({ r, id }) {
  const [text, setText] = useState((r.spots || {})[id] || null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const go = async () => {
    setBusy(true); setErr(null)
    try { setText((await post('spot', { speech_id: id })).text) } catch (e) { setErr(errText(e)) } finally { setBusy(false) }
  }
  return jsxs('div', { className: 'hk-stack', children: [
    !text ? jsx('div', { children: jsx(Button, { variant: 'secondary', loading: busy, onClick: go,
      children: jsxs(Fragment, { children: [jsx(Codicon, { name: 'search' }), 'Spot fallacies'] }) }) }) : null,
    busy ? jsx(Thinking, { label: 'Looking for fallacies' }) : null,
    err ? jsx(Notice, { tone: 'bad', children: err }) : null,
    text ? jsxs('div', { className: 'ldw-helper', children: [jsx(Label, { accent: true, children: 'Fallacies found' }), jsx('div', { className: 'ldw-helper-body', children: renderText(text) })] }) : null,
  ] })
}

function CrossEx({ r, stop }) {
  const studentAsks = speakerOf(stop, r.side) === 'student'
  const log = r.cx[stop.id] || []
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const clock = useCountdown(stop.minutes * 60, `${r.round_no}-${stop.id}`)
  const prep = usePrep(r)
  const box = useRef(null)
  const send = async body => {
    setBusy(true); setErr(null)
    try { setRound(await post('round/cx', body)); clock.start() } catch (e) { setErr(errText(e)) } finally { setBusy(false) }
  }
  useEffect(() => { if (!studentAsks && !log.length) send({}) }, [r.round_no, stop.id])
  useEffect(() => { if (box.current) box.current.scrollTop = box.current.scrollHeight }, [log.length, busy])
  const submit = () => { const t = text.trim(); if (!t || busy) return; setText(''); send({ text: t }) }
  const end = async () => { clock.pause(); prep.stop(); try { setRound(await post('round/cx/end')) } catch (e) { setErr(errText(e)) } }
  return jsxs(Fragment, { children: [
    jsx(ClockPanel, {
      big: mmss(clock.left), over: clock.left < 0, label: `${studentAsks ? 'You ask' : 'Opponent asks'} · cross-ex`, fraction: 1 - clock.left / (stop.minutes * 60),
      rows: [['Prep left', mmss(prep.left)], ['Exchanges', String(log.length)]],
      actions: [jsx(BigButton, { key: 'e', primary: true, icon: 'arrow-right', onClick: end, children: 'End cross-ex' }), jsx(PrepButton, { key: 'p', prep })],
    }),
    jsxs('section', { className: 'ldw-panel ldw-stage', 'aria-label': 'Cross-examination', children: [
      jsx(Label, { children: `Cross-examination · ${studentAsks ? 'you ask the questions' : 'the opponent questions you'}` }),
      jsx('p', { className: 'ldw-goal', children: studentAsks
        ? 'Ask short questions that set up your next speech: pin down a definition, expose a missing warrant, get a concession on framework. Do not argue; ask.'
        : 'Answer honestly and briefly. Do not give a speech. Your answers are binding and the opponent will use them.' }),
      jsxs('div', { className: 'ldw-cx', ref: box, children: [
        ...log.map((t, i) => jsxs('div', { className: 'ldw-cx-turn', 'data-q': t.q ? '1' : '0', 'data-you': t.who === r.side ? '1' : '0', children: [
          jsx(Label, { children: `${t.who === r.side ? 'You' : 'Opponent'} · ${t.q ? 'question' : 'answer'}` }), jsx('p', { children: t.text }),
        ] }, i)),
        busy ? jsx(Thinking, { label: studentAsks ? 'The opponent is answering' : 'The opponent is thinking' }) : null,
      ] }),
      err ? jsx(Notice, { tone: 'bad', children: err }) : null,
      jsxs('div', { className: 'ldw-ask', children: [
        jsx(Textarea, { 'aria-label': studentAsks ? 'Your question' : 'Your answer', value: text, placeholder: studentAsks ? 'Your question' : 'Your answer',
          onChange: e => setText(e.target.value), onKeyDown: e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() } } }),
        jsx(Button, { onClick: submit, disabled: busy || !text.trim(), 'aria-label': 'Send', children: jsx(Codicon, { name: 'send' }) }),
      ] }),
    ] }),
  ] })
}

function PaperBallot({ b, roundNo }) {
  const [open, setOpen] = useState(false)
  if (!b) {
    return jsxs('section', { className: 'ldw-panel ldw-side', 'aria-label': 'Last ballot', children: [
      jsx(Label, { children: 'Last ballot' }),
      jsx(Empty, { icon: 'law', title: 'No ballot yet', body: "Finish a round and the judge's ballot lands here, with the lines that decided it and three drills." }),
    ] })
  }
  const pts = b.speaker_points || {}
  const first = (b.decisive || [])[0]
  const reason = clip(b.reason, 220)
  return jsxs('section', { className: 'ldw-panel ldw-side', 'aria-label': 'Last ballot', children: [
    jsx(Label, { children: `Last ballot · Round ${b.round_no || roundNo || ''}` }),
    jsxs('article', { className: 'ldw-paper', children: [
      jsxs('div', { className: 'ldw-paper-top', children: [jsx('span', { children: 'Lincoln-Douglas ballot' }), jsx('span', { children: b.judge })] }),
      jsxs('div', { className: 'ldw-paper-line', children: [
        jsxs('span', { children: [jsx('span', { className: 'ldw-box', 'data-x': b.decision === 'aff' ? '1' : '0', 'aria-hidden': 'true' }), 'Affirmative'] }),
        jsxs('span', { children: [jsx('span', { className: 'ldw-box', 'data-x': b.decision === 'neg' ? '1' : '0', 'aria-hidden': 'true' }), 'Negative'] }),
        jsx('span', { className: 'hk-sr', children: `Decision: ${sideName(b.decision)}` }),
      ] }),
      jsxs('div', { className: 'ldw-paper-line', children: [jsx('span', { children: `Speaker points · you (${sideShort(b.side)})` }), jsx('b', { children: pts.student ?? '' })] }),
      first ? jsxs('div', { className: 'ldw-paper-line ldw-paper-decided', children: [jsx('span', { children: 'Decided on' }), jsx('b', { children: `${first.speech}: "${clip(first.line, 70)}"` })] }) : null,
      jsx('p', { className: 'ldw-paper-rfd', children: reason }),
      jsx('div', { className: 'ldw-stamp', children: `${(b.drills || []).length} drills` }),
    ] }),
    jsx(BigButton, { icon: open ? 'chevron-up' : 'checklist', onClick: () => setOpen(v => !v), 'aria-expanded': open, children: open ? 'Hide the drills' : 'Run the drills' }),
    open ? jsx('div', { className: 'ldw-drills', children: (b.drills || []).map((d, i) => jsxs('div', { className: 'ldw-drill', children: [
      jsx('h3', { className: 'hk-h3', children: `${i + 1}. ${d.name}` }), jsx('p', { className: 'ldw-why', children: d.why }), jsx('p', { children: d.how }),
    ] }, i)) }) : null,
  ] })
}

function FullBallot({ r, onRedo, onFlowHit }) {
  const b = r.ballots[r.ballots.length - 1]
  const judges = ($cfg.get() || {}).judges || {}
  const [busy, setBusy] = useState(null)
  const [err, setErr] = useState(null)
  const won = b.decision === r.side
  const ask = async key => {
    setBusy(key); setErr(null)
    try { setRound(await post('round/judge', { judge: key })) } catch (e) { setErr(errText(e)) } finally { setBusy(null) }
  }
  const mine = r.transcript.filter(t => t.speaker === 'student').map(t => t.id)
  return jsxs('section', { className: 'ldw-panel ldw-stage ldw-ballot', 'aria-label': 'Ballot', children: [
    jsx(Label, { children: `${b.judge} · ballot ${r.ballots.length} for this round` }),
    jsx('h2', { className: 'ldw-verdict', children: `${won ? 'You won' : 'You lost'}. Decision: ${b.decision === 'aff' ? 'Affirmative' : 'Negative'}` }),
    jsxs('div', { className: 'ldw-ballot-grid', children: [
      jsxs('div', { className: 'hk-stack', children: [
        jsx('h3', { className: 'hk-h3', children: 'Reason for decision' }), renderText(b.reason),
        jsx('h3', { className: 'hk-h3', children: 'Framework' }), jsx('p', { children: b.framework }),
        jsx('h3', { className: 'hk-h3', children: 'The lines that decided it' }),
        jsx('p', { className: 'ldw-meta', children: 'Check these against what was actually said. Click one to find it on the flow.' }),
        ...(b.decisive || []).map((d, i) => jsxs('button', { type: 'button', className: 'ldw-decisive', onClick: () => onFlowHit(d.speech), children: [
          jsx(Label, { accent: true, children: d.speech }), jsx('span', { children: d.line }), jsx('em', { children: d.effect }),
        ] }, i)),
        jsx('h3', { className: 'hk-h3', children: 'Did you own your case?' }), jsx('p', { children: b.ownership }),
      ] }),
      jsxs('div', { className: 'hk-stack', children: [
        jsx('h3', { className: 'hk-h3', children: 'What worked' }),
        jsx('ul', { className: 'ldw-list', children: (b.strengths || []).map((s, i) => jsx('li', { children: s }, i)) }),
        jsx('h3', { className: 'hk-h3', children: 'Your three drills' }),
        ...(b.drills || []).map((d, i) => jsxs('div', { className: 'ldw-drill', children: [jsx('strong', { children: d.name }), jsx('p', { className: 'ldw-why', children: d.why }), jsx('p', { children: d.how })] }, i)),
      ] }),
    ] }),
    err ? jsx(Notice, { tone: 'bad', children: err }) : null,
    jsxs('div', { className: 'hk-actions', children: [
      ...Object.entries(judges).filter(([k]) => k !== b.judge_key).map(([k, j]) => jsx(Button, { key: k, variant: 'secondary', loading: busy === k, disabled: !!busy, onClick: () => ask(k),
        children: jsxs(Fragment, { children: [jsx(Codicon, { name: 'law' }), `Ask the ${j.label.toLowerCase()}`] }) })),
      ...mine.map(id => jsx(Button, { key: `redo-${id}`, variant: 'secondary', disabled: !!busy, onClick: () => onRedo(id),
        children: jsxs(Fragment, { children: [jsx(Codicon, { name: 'refresh' }), `Redo your ${id}`] }) })),
    ] }),
  ] })
}

function Redo({ r, id, onDone }) {
  const t = r.transcript.find(x => x.id === id)
  const stop = stops().find(s => s.id === id)
  const [text, setText] = useState(t ? t.text : '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const clock = useCountdown(stop.minutes * 60, `redo-${id}`)
  const judgeKey = (r.ballots[r.ballots.length - 1] || {}).judge_key || r.judge
  const submit = async () => {
    setBusy(true); setErr(null); clock.pause()
    try {
      await post('round/redo', { speech_id: id, text })
      setRound(await post('round/judge', { judge: judgeKey }))
      onDone()
    } catch (e) { setErr(errText(e)) } finally { setBusy(false) }
  }
  return jsxs(Fragment, { children: [
    jsx(ClockPanel, {
      big: mmss(clock.left), over: clock.left < 0, label: `${id} · Redo`, fraction: 1 - clock.left / (stop.minutes * 60),
      rows: [['Spoken length', `about ${mmss(words(text) / WPM * 60)}`]],
      actions: [
        jsx(BigButton, { key: 's', primary: true, icon: 'arrow-right', loading: busy, onClick: submit, children: 'Submit the redo' }),
        clock.running ? jsx(BigButton, { key: 'c', icon: 'debug-pause', onClick: clock.pause, children: 'Pause clock' })
          : jsx(BigButton, { key: 'c', icon: 'play', onClick: clock.start, children: 'Start clock' }),
        jsx(BigButton, { key: 'x', icon: 'close', disabled: busy, onClick: onDone, children: 'Cancel' }),
      ],
    }),
    jsxs('section', { className: 'ldw-panel ldw-stage', 'aria-label': 'Redo a speech', children: [
      jsx(Label, { children: `Redo · ${stop.name}` }),
      jsx('p', { className: 'ldw-goal', children: 'Same round, same opponent. Fix what the ballot named, then the same judge rules again on the new version.' }),
      jsx(Textarea, { className: 'ldw-speechbox', 'aria-label': `New ${id}`, value: text, onChange: e => setText(e.target.value) }),
      busy ? jsx(Thinking, { label: 'The judge is reading the new version' }) : null,
      err ? jsx(Notice, { tone: 'bad', children: err }) : null,
    ] }),
  ] })
}

function Judging({ r }) {
  const [err, setErr] = useState(null)
  const go = () => { setErr(null); post('round/judge', {}).then(setRound, e => setErr(errText(e))) }
  useEffect(() => { go() }, [r.round_no])
  return jsxs(Fragment, { children: [
    jsx(ClockPanel, { big: '0:00', label: 'Round over', fraction: 1, rows: [['Prep left', mmss(r.prep)]], actions: [] }),
    jsxs('section', { className: 'ldw-panel ldw-stage', 'aria-label': 'Judging', children: [
      jsx(Label, { children: 'The ballot' }),
      err ? jsx(Failure, { title: 'The judge could not finish', body: err, onRetry: go }) : jsx(Thinking, { label: 'The judge is writing the ballot' }),
    ] }),
  ] })
}

function Setup() {
  const st = useValue($state)
  const cfg = $cfg.get()
  const cases = (st.workbench && st.workbench.cases) || []
  const active = st.workbench && st.workbench.case
  const [caseId, setCaseId] = useState(active ? active.id : (cases[0] || {}).id)
  const [level, setLevel] = useState('jv')
  const [judge, setJudge] = useState('traditional')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const chosen = cases.find(c => c.id === caseId)
  const start = async () => {
    setBusy(true); setErr(null)
    try { setRound(await post('round/start', { case_id: caseId, level, judge })); refreshState() } catch (e) { setErr(errText(e)) } finally { setBusy(false) }
  }
  return jsxs(Fragment, { children: [
    jsx(ClockPanel, { big: mmss((cfg.prep_minutes || 4) * 60), label: 'Prep for the whole round', fraction: 0,
      rows: [['Full round', 'about 45 minutes'], ['Speech times', 'NSDA']],
      actions: [jsx(BigButton, { key: 's', primary: true, icon: 'play', loading: busy, disabled: !chosen, onClick: start, children: 'Start the round' })] }),
    jsxs('section', { className: 'ldw-panel ldw-stage', 'aria-label': 'Set up a round', children: [
      jsx(Label, { children: 'New practice round' }),
      jsx('h2', { className: 'hk-h2', children: 'Choose a case, an opponent and a judge' }),
      jsx('p', { className: 'ldw-goal', children: 'You debate the side your case is written for, and it loads into your constructive. The AI debates the other side and cross-examines you. Your answers in cross-examination are binding: the opponent will use them.' }),
      jsx('div', { className: 'ldw-field-label', children: 'Case' }),
      cases.length ? jsx('ul', { className: 'ldw-pick', role: 'listbox', 'aria-label': 'Case for this round', children: cases.map(c => jsx('li', { children: jsxs('button', {
        type: 'button', role: 'option', 'aria-selected': c.id === caseId, className: 'ldw-pick-row', 'data-active': c.id === caseId ? '' : undefined, onClick: () => setCaseId(c.id), children: [
          jsx('span', { className: 'ldw-side-tag', children: sideShort(c.side) }),
          jsxs('span', { className: 'hk-grow', children: [jsx('strong', { children: c.name }), jsx('span', { className: 'ldw-meta', children: ` · ${c.words} words · ${c.resolution || 'no resolution yet'}` })] }),
        ] }) }, c.id)) }) : null,
      jsx('div', { className: 'ldw-field-label', children: 'Opponent' }),
      jsx(SegmentedControl, { value: level, onChange: setLevel, options: [{ id: 'novice', label: 'Novice' }, { id: 'jv', label: 'JV' }, { id: 'varsity', label: 'Varsity' }] }),
      jsx('p', { className: 'ldw-meta', children: 'Start one level below where you compete, then move up.' }),
      jsx('div', { className: 'ldw-field-label', children: 'Judge' }),
      jsx(SegmentedControl, { value: judge, onChange: setJudge, options: Object.entries(cfg.judges).map(([k, j]) => ({ id: k, label: j.label })) }),
      jsx('p', { className: 'ldw-meta', children: cfg.judges[judge].summary }),
      chosen && !words(READ_SECTIONS.map(() => '').join('')) && !chosen.words
        ? jsx(Notice, { tone: 'warn', children: 'This case is empty. You can still debate, but you will write your constructive from scratch.' }) : null,
      err ? jsx(Notice, { tone: 'bad', children: err }) : null,
    ] }),
  ] })
}

function Flow({ r, hit }) {
  const cols = stops().filter(s => s.kind === 'speech')
  return jsxs('section', { className: 'ldw-panel ldw-flow', 'aria-label': 'Flow', children: [
    jsx(Label, { children: 'Flow' }),
    jsx('div', { className: 'ldw-flow-scroll', children: jsxs('table', { children: [
      jsx('thead', { children: jsx('tr', { children: cols.map(s => jsxs('th', { scope: 'col', children: [s.id, jsx('span', { children: `${speakerOf(s, r.side) === 'student' ? 'You' : 'Opponent'} · ${s.side}` })] }, s.id)) }) }),
      jsx('tbody', { children: jsx('tr', { children: cols.map(s => {
        const pts = r.flow[s.id]
        const done = r.transcript.some(t => t.id === s.id)
        return jsx('td', { 'data-hit': hit === s.id ? '1' : undefined, children: pts ? pts.map((p, i) => jsx('div', { children: p }, i)) : done ? jsx('span', { className: 'ldw-meta', children: 'Flowing...' }) : null }, s.id)
      }) }) }),
    ] }) }),
  ] })
}

function Room() {
  const st = useValue($state)
  const r = st.round
  const [showFlow, setShowFlow] = useState(false)
  const [redo, setRedo] = useState(null)
  const [hit, setHit] = useState(null)
  const [confirmNew, setConfirmNew] = useState(false)
  const cfg = $cfg.get()
  // The flow is written in the background; pick it up while any finished speech is still missing.
  const missing = r ? r.transcript.filter(t => !r.flow[t.id]).length : 0
  useEffect(() => {
    if (!missing) return undefined
    const id = setInterval(refreshState, 4000)
    return () => clearInterval(id)
  }, [missing, r && r.round_no])
  const flowHit = id => { setShowFlow(true); setHit(id); setTimeout(() => setHit(null), 2400) }
  const stop = currentStop(r)
  let floor
  if (!r) floor = jsx(Setup, {})
  else if (redo) floor = jsx(Redo, { r, id: redo, onDone: () => setRedo(null) })
  else if (r.phase === 'judging') floor = jsx(Judging, { r })
  else if (r.phase === 'ballot') {
    floor = jsxs(Fragment, { children: [
      jsx(ClockPanel, { big: '0:00', label: 'Round over', fraction: 1, rows: [['Prep left', mmss(r.prep)], ['Ballots', String(r.ballots.length)]],
        actions: [jsx(BigButton, { key: 'n', primary: true, icon: 'add', onClick: () => post('round/new').then(() => setRound(null)), children: 'New round' })] }),
      jsx(FullBallot, { r, onRedo: setRedo, onFlowHit: flowHit }),
    ] })
  } else if (stop.kind === 'cx') floor = jsx(CrossEx, { r, stop }, `${r.round_no}-${stop.id}`)
  else if (speakerOf(stop, r.side) === 'student') floor = jsx(StudentSpeech, { r, stop }, `${r.round_no}-${stop.id}`)
  else floor = jsx(OpponentSpeech, { r, stop }, `${r.round_no}-${stop.id}`)
  const last = r && r.ballots.length ? r.ballots[r.ballots.length - 1] : st.history && st.history.last
  const tools = r ? jsxs('div', { className: 'hk-actions', children: [
    jsx(Button, { variant: 'secondary', size: 'sm', onClick: () => setShowFlow(v => !v), 'aria-pressed': showFlow,
      children: jsxs(Fragment, { children: [jsx(Codicon, { name: 'list-flat' }), showFlow ? 'Hide flow' : 'Show flow'] }) }),
    confirmNew
      ? jsxs(Fragment, { children: [
        jsx('span', { className: 'ldw-meta', children: 'End this round? It will be cleared.' }),
        jsx(Button, { variant: 'secondary', size: 'sm', onClick: () => { setConfirmNew(false); post('round/new').then(() => setRound(null)) }, children: 'End it' }),
        jsx(Button, { variant: 'secondary', size: 'sm', onClick: () => setConfirmNew(false), children: 'Keep going' }),
      ] })
      : r.phase !== 'ballot' ? jsx(Button, { variant: 'secondary', size: 'sm', onClick: () => setConfirmNew(true), children: jsxs(Fragment, { children: [jsx(Codicon, { name: 'close' }), 'End round'] }) }) : null,
  ] }) : null
  return jsxs(Fragment, { children: [
    tools,
    jsx(Board, { r }),
    jsxs('div', { className: 'ldw-floor', children: [floor, jsx(PaperBallot, { b: last, roundNo: st.history && st.history.count })] }),
    r && (showFlow || r.phase === 'ballot') ? jsx(Flow, { r, hit }) : null,
    !r && cfg ? null : null,
  ] })
}

/* ================================================================== Case Workbench == */

// The page's latest words for each case, so a coaching run always reads what the student just typed.
const local = {}
function sectionsOf(c) { return { ...(c.sections || {}), ...(local[c.id] || {}) } }

const saveTimers = {}
function saveSection(caseId, key, text) {
  local[caseId] = { ...(local[caseId] || {}), [key]: text }
  clearTimeout(saveTimers[caseId + key])
  saveTimers[caseId + key] = setTimeout(() => {
    post(`cases/${caseId}`, { section: { key, text } }).then(wb => {
      if (local[caseId] && local[caseId][key] === text) delete local[caseId][key]
      setWorkbench({ cases: wb.cases })
    }, () => {})
  }, 600)
}

const $coach = atom({ busy: null, focus: null, err: null }) // busy: { tool, section } while a tool runs

async function runTool(c, tool, section, message, underSection) {
  if ($coach.get().busy) return
  $coach.set({ ...$coach.get(), busy: { tool, section: underSection ? section : null }, err: null, pendingMessage: message || null })
  try {
    const wb = await post('tool', { case_id: c.id, tool, section: section || null, message: message || '', sections: sectionsOf(c), under_section: !!underSection })
    setWorkbench(wb)
  } catch (e) {
    $coach.set({ ...$coach.get(), err: errText(e) })
  } finally {
    $coach.set({ ...$coach.get(), busy: null, pendingMessage: null })
  }
}

function Library({ wb }) {
  const [confirm, setConfirm] = useState(null)
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)
  const fileRef = useRef(null)
  const act = async (fn, after) => {
    setBusy(true); setMsg(null)
    try { const out = await fn(); if (out) setWorkbench(out); if (after) after(out) } catch (e) { setMsg({ tone: 'bad', text: errText(e) }) } finally { setBusy(false) }
  }
  const saveBackup = async () => {
    let path = null
    if (api.os && typeof api.os.pickSavePath === 'function') {
      path = await api.os.pickSavePath({ title: 'Save a backup of every case', defaultPath: 'ld-workbench-backup.json', filters: [{ name: 'Backup', extensions: ['json'] }] })
      if (path === null) return
    }
    act(() => post('backup/export', { path }).then(out => { setMsg({ tone: 'good', text: `Saved ${out.cases} case${out.cases === 1 ? '' : 's'} to ${out.name}.`, path: out.path }); return null }))
  }
  const loadBackup = e => {
    const f = e.target.files && e.target.files[0]
    e.target.value = ''
    if (!f) return
    f.text().then(text => act(() => post('backup/import', { text }), out => setMsg({ tone: 'good', text: `Added ${out.added} case${out.added === 1 ? '' : 's'} from the backup.` })))
  }
  return jsxs('aside', { className: 'ldw-panel ldw-library', 'aria-label': 'My cases', children: [
    jsxs('div', { className: 'ldw-row-between', children: [jsx(Label, { children: 'My cases' }), jsx('span', { className: 'ldw-meta', children: String(wb.cases.length) })] }),
    jsxs('div', { className: 'ldw-two', children: [
      jsx(Button, { size: 'sm', variant: 'secondary', disabled: busy, onClick: () => act(() => post('cases', { side: 'aff' })), children: jsxs(Fragment, { children: [jsx(Codicon, { name: 'add' }), 'New Aff'] }) }),
      jsx(Button, { size: 'sm', variant: 'secondary', disabled: busy, onClick: () => act(() => post('cases', { side: 'neg' })), children: jsxs(Fragment, { children: [jsx(Codicon, { name: 'add' }), 'New Neg'] }) }),
    ] }),
    jsx('ul', { className: 'ldw-cases', children: wb.cases.map(c => {
      const on = c.id === wb.case.id
      return jsxs('li', { className: 'ldw-case-item', 'data-active': on ? '' : undefined, children: [
        jsxs('button', { type: 'button', className: 'ldw-case-open', 'aria-current': on ? 'true' : undefined, onClick: () => !on && act(() => post(`cases/${c.id}/open`)), children: [
          jsxs('span', { className: 'ldw-case-name', children: [jsx('span', { className: 'ldw-side-tag', children: sideShort(c.side) }), c.name] }),
          jsx('span', { className: 'ldw-meta', children: `${c.words} words · ${when(c.updated)}` }),
        ] }),
        on ? jsx('div', { className: 'ldw-case-acts', children: confirm === c.id
          ? jsxs(Fragment, { children: [
            jsx('span', { className: 'ldw-meta', children: 'Delete this case for good?' }),
            jsx(Button, { size: 'sm', variant: 'secondary', className: 'ldw-danger', onClick: () => { setConfirm(null); act(() => post(`cases/${c.id}/delete`)) }, children: 'Delete' }),
            jsx(Button, { size: 'sm', variant: 'secondary', onClick: () => setConfirm(null), children: 'Keep it' }),
          ] })
          : jsxs(Fragment, { children: [
            jsx(Button, { size: 'sm', variant: 'secondary', disabled: busy, onClick: () => act(() => post(`cases/${c.id}/duplicate`)), children: 'Duplicate' }),
            jsx(Button, { size: 'sm', variant: 'secondary', disabled: busy, onClick: () => setConfirm(c.id), children: 'Delete' }),
          ] }) }) : null,
      ] }, c.id)
    }) }),
    jsx('div', { className: 'ldw-label', children: 'Backup' }),
    jsx('p', { className: 'ldw-meta', children: 'Your cases are saved by Hermes on this computer. A backup file holds every case, to keep safe or move to another computer.' }),
    jsxs('div', { className: 'ldw-two ldw-stack1', children: [
      jsx(Button, { size: 'sm', variant: 'secondary', disabled: busy, onClick: saveBackup, children: 'Save a backup' }),
      jsx(Button, { size: 'sm', variant: 'secondary', disabled: busy, onClick: () => fileRef.current && fileRef.current.click(), children: 'Load a backup' }),
    ] }),
    jsx('input', { ref: fileRef, type: 'file', accept: '.json,application/json', hidden: true, onChange: loadBackup, 'aria-label': 'Backup file' }),
    msg ? jsx(Notice, { tone: msg.tone, children: msg.text, action: msg.path && api.os && api.os.revealPath
      ? jsx(Button, { size: 'sm', variant: 'secondary', onClick: () => api.os.revealPath(msg.path), children: 'Show file' }) : null }) : null,
  ] })
}

function ResolutionBar({ c, source }) {
  const cfg = $cfg.get()
  const [text, setText] = useState(c.resolution || '')
  const [open, setOpen] = useState(false)
  const [paste, setPaste] = useState('')
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const timer = useRef(null)
  useEffect(() => { setText(c.resolution || '') }, [c.id])
  const save = v => { setText(v); clearTimeout(timer.current); timer.current = setTimeout(() => post(`cases/${c.id}`, { resolution: v }).then(wb => setWorkbench({ cases: wb.cases, case: { ...$state.get().workbench.case, resolution: v } }), e => setErr(errText(e))), 600) }
  const call = async fn => { setBusy(true); setErr(null); try { setWorkbench(await fn()) } catch (e) { setErr(errText(e)) } finally { setBusy(false) } }
  return jsxs('section', { className: 'ldw-panel ldw-resbar', 'aria-label': 'Resolution', children: [
    jsxs('div', { className: 'ldw-resrow', children: [
      jsx(Label, { accent: true, children: 'Resolution' }),
      jsx(Input, { className: 'ldw-resinput', 'aria-label': 'Resolution', value: text, placeholder: 'Type the resolution you were given', onChange: e => save(e.target.value) }),
      jsx('span', { className: 'ldw-meta', children: `NSDA LD · ${cfg.resolution.period}` }),
      jsx(Button, { size: 'sm', variant: 'secondary', onClick: () => save(cfg.resolution.text), children: 'Current NSDA topic' }),
      jsx(Button, { size: 'sm', variant: 'secondary', onClick: () => setOpen(v => !v), 'aria-expanded': open,
        children: jsxs(Fragment, { children: [jsx(Codicon, { name: 'book' }), source ? 'Source added' : 'Topic source'] }) }),
    ] }),
    open ? jsxs('div', { className: 'ldw-source', children: [
      jsxs('div', { className: 'hk-stack', children: [
        jsx(Label, { children: 'Paste the text' }),
        jsx('p', { className: 'ldw-meta', children: 'Paste a topic analysis or a handout from your coach. The coaching tools read it as background. The opponent does not.' }),
        jsx(Textarea, { 'aria-label': 'Topic source text', value: paste, onChange: e => setPaste(e.target.value), placeholder: 'Paste the topic analysis or source text' }),
        jsx('div', { children: jsx(Button, { size: 'sm', variant: 'secondary', disabled: busy, onClick: () => call(() => post('workbench', { source: { title: 'Pasted text', text: paste } })), children: 'Use this text' }) }),
      ] }),
      jsxs('div', { className: 'hk-stack', children: [
        jsx(Label, { children: 'Or read a link' }),
        jsx('p', { className: 'ldw-meta', children: 'A public page only, such as the NSDA topics page or your league\'s topic page. PDFs need to be copied and pasted.' }),
        jsxs('div', { className: 'hk-row', children: [
          jsx(Input, { className: 'hk-grow', 'aria-label': 'Topic source link', value: url, onChange: e => setUrl(e.target.value), placeholder: cfg.topics_url }),
          jsx(Button, { size: 'sm', variant: 'secondary', loading: busy, onClick: () => call(() => post('source/read', { url })), children: 'Read link' }),
        ] }),
        source ? jsxs('p', { className: 'ldw-meta', children: [`Reading from ${source.title || 'pasted text'} · ${words(source.text)} words. `,
          jsx('button', { type: 'button', className: 'hk-link', onClick: () => call(() => post('workbench', { source: null })), children: 'Remove' })] })
          : jsx('p', { className: 'ldw-meta', children: 'No source added. The coach works from the resolution alone.' }),
      ] }),
    ] }) : null,
    err ? jsx(Notice, { tone: 'bad', children: err }) : null,
  ] })
}

function ImportPanel({ c, onClose }) {
  const [text, setText] = useState('')
  const [docx, setDocx] = useState(null)
  const [file, setFile] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const fileRef = useRef(null)
  const pick = async e => {
    const f = e.target.files && e.target.files[0]
    e.target.value = ''
    if (!f) return
    if (f.size > 2000000) { setMsg({ tone: 'bad', text: 'That file is over 2 MB. Paste the text instead.' }); return }
    setFile(f.name); setDocx(null)
    if (/\.docx$/i.test(f.name)) {
      const buf = new Uint8Array(await f.arrayBuffer())
      let bin = ''
      for (let i = 0; i < buf.length; i += 32768) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 32768))
      setDocx(btoa(bin)); setText('')
    } else setText(await f.text())
  }
  const go = async () => {
    if (!docx && words(text) < 20) { setMsg({ tone: 'bad', text: 'Paste your whole case first.' }); return }
    setBusy(true); setMsg(null)
    try {
      const out = await post('import', { text, docx })
      const side = out.side === 'aff' || out.side === 'neg' ? out.side : c.side
      const name = file ? file.replace(/\.(docx|txt|md)$/i, '') : `Brought-in ${sideName(side)} case`
      const wb = await post('import/apply', { as_new: true, side, name, sections: out.sections })
      setWorkbench(wb)
      setMsg(out.verbatim_fallback
        ? { tone: 'warn', text: 'Your case is in "Other material," exactly as you wrote it. The workbench could not sort it without changing words, so move each part into its section yourself.' }
        : { tone: 'good', text: `Saved as a new ${sideName(side)} case in My cases, sorted into ${Object.keys(out.sections).length} sections, word for word. The full review is running in the coach panel.` })
      setText(''); setDocx(null); setFile('')
      runTool(wb.case, 'review', null, '', false)
    } catch (e) { setMsg({ tone: 'bad', text: errText(e) }) } finally { setBusy(false) }
  }
  return jsxs('section', { className: 'ldw-panel ldw-import', 'aria-label': 'Bring in your case', children: [
    jsxs('div', { className: 'ldw-row-between', children: [jsx(Label, { accent: true, children: 'Bring in a case you already wrote' }), jsx(Button, { size: 'sm', variant: 'secondary', onClick: onClose, children: 'Close' })] }),
    jsx('p', { className: 'ldw-goal', children: 'Paste your case or upload it as a Word document or text file. It becomes a new case in My cases, sorted into sections without changing a single word. Then the coach reviews it.' }),
    jsx(Textarea, { className: 'ldw-speechbox ldw-short', 'aria-label': 'Case to bring in', value: text, onChange: e => setText(e.target.value), placeholder: docx ? `${file} is ready to sort.` : 'Paste your whole case here' }),
    jsxs('div', { className: 'ldw-row-between', children: [
      jsxs('div', { className: 'hk-row', children: [
        jsx(Button, { size: 'sm', variant: 'secondary', onClick: () => fileRef.current && fileRef.current.click(), children: jsxs(Fragment, { children: [jsx(Codicon, { name: 'cloud-upload' }), 'Upload .docx or .txt'] }) }),
        jsx('span', { className: 'ldw-meta', children: file }),
        jsx('input', { ref: fileRef, type: 'file', accept: '.docx,.txt,.md', hidden: true, onChange: pick, 'aria-label': 'Case file' }),
      ] }),
      jsx(Button, { loading: busy, onClick: go, children: jsxs(Fragment, { children: [jsx(Codicon, { name: 'check' }), 'Sort and review my case'] }) }),
    ] }),
    busy ? jsx(Thinking, { label: 'Sorting your case' }) : null,
    msg ? jsx(Notice, { tone: msg.tone, children: msg.text }) : null,
  ] })
}

function PathBoard({ c }) {
  const coach = useValue($coach)
  const secs = sectionsOf(c)
  const done = st => (!st.sections.length ? Object.values(secs).filter(v => words(v) >= 15).length >= 5 : st.sections.every(k => words(secs[k]) >= (st.min || 15)))
  const start = i => {
    const st = PATH[i]
    if (!st.sections.length) { runTool(c, 'review', null, '', false); return }
    const target = st.sections.find(k => words(secs[k]) < (st.min || 15)) || st.sections[0]
    $coach.set({ ...$coach.get(), focus: target })
    const el = document.getElementById(`ldw-sec-${target.replace(/\W+/g, '-')}`)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    runTool(c, st.tool, target, '', true)
  }
  return jsx('ol', { className: 'ldw-board ldw-path', 'aria-label': 'Writing path', children: PATH.map((st, i) => jsx('li', { children: jsxs('button', {
    type: 'button', className: 'ldw-slot ldw-step', 'data-state': done(st) ? 'done' : 'later', disabled: !!coach.busy, onClick: () => start(i), children: [
      jsxs('div', { className: 'ldw-label ldw-accent', children: [`Step ${i + 1}`, done(st) ? ' · drafted' : ''] }),
      jsx('div', { className: 'ldw-step-title', children: st.title }),
      jsx('div', { className: 'ldw-step-desc', children: st.desc }),
    ] }) }, i)) })
}

function SectionCard({ c, k }) {
  const cfg = $cfg.get()
  const coach = useValue($coach)
  const [text, setText] = useState(sectionsOf(c)[k] || '')
  const helper = (c.helpers || {})[k]
  const pending = coach.busy && coach.busy.section === k
  const focus = coach.focus === k
  const change = v => { setText(v); saveSection(c.id, k, v) }
  const hide = () => post(`cases/${c.id}`, { hide_helper: k }).then(setWorkbench, () => {})
  return jsxs('div', { className: 'ldw-sec', id: `ldw-sec-${k.replace(/\W+/g, '-')}`, 'data-focus': focus ? '' : undefined, children: [
    jsxs('div', { className: 'ldw-row-between', children: [jsx('h3', { className: 'ldw-sec-title', children: k }), jsx('span', { className: 'ldw-meta', children: words(text) ? `${words(text)} words` : '' })] }),
    jsx('p', { className: 'ldw-hint', children: SECTION_HINTS[k] }),
    jsx(Textarea, { className: 'ldw-sec-text', 'aria-label': k, value: text, onChange: e => change(e.target.value), onFocus: () => $coach.set({ ...$coach.get(), focus: k }) }),
    jsx('div', { className: 'ldw-chips', children: (SECTION_TOOLS[k] || []).map((t, i) => jsxs('button', {
      type: 'button', className: 'ldw-chip', 'data-main': i === 0 ? '' : undefined, disabled: !!coach.busy,
      onClick: () => { $coach.set({ ...$coach.get(), focus: k }); runTool(c, t, k, '', true) }, children: [jsx(Codicon, { name: ICONS[t] || 'question' }), cfg.tools[t]],
    }, t)) }),
    pending ? jsx('div', { className: 'ldw-helper', children: jsx(Thinking, { label: cfg.tools[coach.busy.tool] }) }) : helper ? jsxs('div', { className: 'ldw-helper', children: [
      jsxs('div', { className: 'ldw-row-between', children: [jsx(Label, { accent: true, children: helper.label }), jsx('button', { type: 'button', className: 'hk-link', onClick: hide, children: 'Hide' })] }),
      jsx('div', { className: 'ldw-helper-body', children: renderText(helper.text) }),
      jsx('button', { type: 'button', className: 'hk-link', onClick: () => { $coach.set({ ...$coach.get(), focus: k }); const a = document.getElementById('ldw-ask'); if (a) a.focus() }, children: 'Ask the coach a follow-up' }),
    ] }) : null,
  ] })
}

function CoachPanel({ c }) {
  const cfg = $cfg.get()
  const coach = useValue($coach)
  const [text, setText] = useState('')
  const box = useRef(null)
  const thread = c.thread || []
  useEffect(() => { if (box.current) box.current.scrollTop = box.current.scrollHeight }, [thread.length, coach.busy])
  const send = () => { const t = text.trim(); if (!t || coach.busy) return; setText(''); runTool(c, 'coach', coach.focus, t, false) }
  return jsxs('aside', { className: 'ldw-panel ldw-coach', 'aria-label': 'Coach', children: [
    jsxs('div', { className: 'ldw-row-between', children: [jsx(Label, { children: 'Coach' }), jsx('span', { className: 'ldw-focus', children: coach.focus || 'Whole case' })] }),
    jsx('p', { className: 'ldw-meta', children: 'Click into a section to point the coach at it. Every tool reads your case as it stands right now.' }),
    jsx('div', { className: 'ldw-toolgrid', children: PANEL_TOOLS.map(t => jsxs('button', { type: 'button', className: 'ldw-chip ldw-tool', disabled: !!coach.busy,
      onClick: () => runTool(c, t, coach.focus, '', false), children: [jsx(Codicon, { name: ICONS[t] }), cfg.tools[t]] }, t)) }),
    jsxs('div', { className: 'ldw-thread', ref: box, 'aria-live': 'polite', children: [
      !thread.length && !coach.busy ? jsx('p', { className: 'ldw-meta', children: 'Starting from a blank page? Click Step 1 in the writing path and the coach will ask your first question. Already writing? Use the tool buttons under any section. A rough draft gets better coaching than a blank page.' }) : null,
      ...thread.map((m, i) => jsxs('div', { className: 'ldw-msg', 'data-role': m.role, children: [
        jsx(Label, { accent: m.role === 'coach', children: m.role === 'coach' ? m.label || 'Coach' : 'You' }),
        m.role === 'coach' ? (m.section ? jsx('p', { className: 'ldw-meta', children: `Shown under ${m.section}. Ask a follow-up below.` }) : renderText(m.text)) : jsx('p', { children: m.text }),
      ] }, i)),
      coach.busy && coach.pendingMessage ? jsxs('div', { className: 'ldw-msg', 'data-role': 'you', children: [jsx(Label, { children: 'You' }), jsx('p', { children: coach.pendingMessage })] }) : null,
      coach.busy ? jsx(Thinking, { label: 'Reading your case' }) : null,
      coach.err ? jsx(Notice, { tone: 'bad', children: `I could not reach the coach just now. ${coach.err}` }) : null,
    ] }),
    jsxs('div', { className: 'ldw-ask', children: [
      jsx(Textarea, { id: 'ldw-ask', 'aria-label': 'Message to the coach', value: text, placeholder: 'Answer the coach, or ask your own question', onChange: e => setText(e.target.value),
        onKeyDown: e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } } }),
      jsx(Button, { onClick: send, disabled: !!coach.busy || !text.trim(), 'aria-label': 'Send', children: jsx(Codicon, { name: 'send' }) }),
    ] }),
  ] })
}

function TimeBar({ c }) {
  const secs = sectionsOf(c)
  const w = READ_SECTIONS.reduce((n, k) => n + words(secs[k]), 0)
  const sec = w / WPM * 60
  const target = c.side === 'aff' ? 360 : 270 // a neg case leaves time in the 7-minute NC to attack
  return jsxs('div', { className: 'ldw-timebar', children: [
    jsx(Codicon, { name: 'watch' }),
    jsx('span', { children: `${mmss(sec)} of ${mmss(target)} spoken at ${WPM} words a minute${c.side === 'neg' ? ' (leaves 2:30 of your NC to attack)' : ''}` }),
    jsx('div', { className: 'ldw-bar ldw-grow', 'data-over': sec > target ? '1' : undefined, children: jsx('span', { style: { width: `${Math.min(100, sec / target * 100)}%` } }) }),
  ] })
}

function Bench() {
  const st = useValue($state)
  const wb = st.workbench
  const c = wb.case
  const [importOpen, setImportOpen] = useState(false)
  const [name, setName] = useState(c.name)
  const [msg, setMsg] = useState(null)
  const timer = useRef(null)
  useEffect(() => { setName(c.name); setMsg(null) }, [c.id])
  const rename = v => { setName(v); clearTimeout(timer.current); timer.current = setTimeout(() => post(`cases/${c.id}`, { name: v }).then(setWorkbench, e => setMsg({ tone: 'bad', text: errText(e) })), 600) }
  const setSide = side => post(`cases/${c.id}`, { side }).then(setWorkbench, e => setMsg({ tone: 'bad', text: errText(e) }))
  const exportAs = async fmt => {
    let path = null
    if (api.os && typeof api.os.pickSavePath === 'function') {
      path = await api.os.pickSavePath({ title: `Save ${c.name}`, defaultPath: `${(c.name || 'case').replace(/[^\w .-]+/g, '')}.${fmt}`,
        filters: [{ name: fmt === 'docx' ? 'Word document' : 'Text file', extensions: [fmt] }] })
      if (path === null) return
    }
    try {
      await Promise.all(Object.entries(local[c.id] || {}).map(([key, text]) => post(`cases/${c.id}`, { section: { key, text } })))
      const out = await post(`cases/${c.id}/export`, { format: fmt, path })
      setMsg({ tone: 'good', text: `Saved ${out.name}.`, path: out.path })
    } catch (e) { setMsg({ tone: 'bad', text: errText(e) }) }
  }
  return jsxs(Fragment, { children: [
    jsx(ResolutionBar, { c, source: wb.source }, `res-${c.id}`),
    importOpen ? jsx(ImportPanel, { c, onClose: () => setImportOpen(false) }) : null,
    jsxs('div', { className: 'ldw-casehead', children: [
      jsx(Input, { className: 'ldw-casename', 'aria-label': 'Case name', value: name, onChange: e => rename(e.target.value) }),
      jsx(SegmentedControl, { value: c.side, onChange: setSide, options: [{ id: 'aff', label: 'Aff' }, { id: 'neg', label: 'Neg' }] }),
      jsxs('div', { className: 'hk-actions', children: [
        jsx(Button, { size: 'sm', variant: 'secondary', onClick: () => setImportOpen(v => !v), children: jsxs(Fragment, { children: [jsx(Codicon, { name: 'cloud-upload' }), 'Bring in your case'] }) }),
        jsx(Button, { size: 'sm', variant: 'secondary', onClick: () => exportAs('docx'), children: jsxs(Fragment, { children: [jsx(Codicon, { name: 'file' }), 'Save as Word'] }) }),
        jsx(Button, { size: 'sm', variant: 'secondary', onClick: () => exportAs('txt'), children: jsxs(Fragment, { children: [jsx(Codicon, { name: 'file-text' }), 'Save as text'] }) }),
        jsx(Button, { size: 'sm', variant: 'secondary', onClick: () => $view.set('print'), children: jsxs(Fragment, { children: [jsx(Codicon, { name: 'preview' }), 'Print view'] }) }),
      ] }),
    ] }),
    msg ? jsx(Notice, { tone: msg.tone, children: msg.text, action: msg.path && api.os && api.os.revealPath
      ? jsx(Button, { size: 'sm', variant: 'secondary', onClick: () => api.os.revealPath(msg.path), children: 'Show file' }) : null }) : null,
    jsx(PathBoard, { c }),
    jsxs('div', { className: 'ldw-benchgrid', children: [
      jsx(Library, { wb }),
      jsxs('section', { className: 'ldw-panel ldw-case', 'aria-label': `Your ${sideName(c.side)} case`, children: [
        jsx(TimeBar, { c }),
        ...($cfg.get().sections || []).map(k => jsx(SectionCard, { c, k }, `${c.id}-${k}`)),
      ] }),
      jsx(CoachPanel, { c }),
    ] }),
  ] })
}

function PrintView() {
  const st = useValue($state)
  const c = st.workbench.case
  const secs = sectionsOf(c)
  return jsxs(Fragment, { children: [
    jsxs('div', { className: 'hk-actions ldw-noprint', children: [
      jsx(Button, { variant: 'secondary', onClick: () => $view.set('bench'), children: jsxs(Fragment, { children: [jsx(Codicon, { name: 'arrow-left' }), 'Back to the workbench'] }) }),
      jsx(Button, { onClick: () => window.print(), children: jsxs(Fragment, { children: [jsx(Codicon, { name: 'file' }), 'Print'] }) }),
    ] }),
    jsxs('article', { className: 'ldw-print', children: [
      jsx('h1', { children: c.name }),
      jsx('p', { className: 'ldw-print-meta', children: `${c.side === 'aff' ? 'Affirmative' : 'Negative'} case · ${c.resolution || ''}` }),
      ...($cfg.get().sections || []).filter(k => (secs[k] || '').trim()).map(k => jsxs('section', { children: [
        jsx('h2', { children: k }), ...secs[k].trim().split(/\n+/).map((p, i) => jsx('p', { children: p }, i)),
      ] }, k)),
    ] }),
  ] })
}

/* ================================================================== Fallacies == */

const $drill = atom({ n: 0, right: 0, item: null, picked: null, busy: false, err: null }) // the score lasts for this session

async function newDrill() {
  $drill.set({ ...$drill.get(), item: null, picked: null, busy: true, err: null })
  try { $drill.set({ ...$drill.get(), item: await post('drill'), busy: false }) } catch (e) { $drill.set({ ...$drill.get(), busy: false, err: errText(e) }) }
}

function Drill() {
  const d = useValue($drill)
  const guide = ($cfg.get() || {}).fallacies || []
  const opts = [...guide.map(f => f.name), 'None']
  const pick = o => {
    if (!d.item || d.picked) return
    const ok = o === d.item.answer
    $drill.set({ ...d, picked: o, n: d.n + 1, right: d.right + (ok ? 1 : 0) })
  }
  const ok = d.picked && d.picked === d.item.answer
  return jsxs('section', { className: 'ldw-panel', 'aria-label': 'Practice', children: [
    jsx(Label, { accent: true, children: 'Practice' }),
    jsx('h2', { className: 'hk-h2', children: 'Name that fallacy' }),
    jsx('p', { className: 'ldw-goal', children: 'Read the argument. Pick the fallacy it commits, or "No fallacy" if the reasoning holds up.' }),
    !d.item && !d.busy ? jsx('div', { children: jsx(Button, { onClick: newDrill, children: jsxs(Fragment, { children: [jsx(Codicon, { name: 'play' }), d.err ? 'Try again' : 'Give me an argument'] }) }) }) : null,
    d.busy ? jsx(Thinking, { label: 'Writing an argument' }) : null,
    d.err ? jsx(Notice, { tone: 'bad', children: d.err }) : null,
    d.item ? jsxs(Fragment, { children: [
      jsx('blockquote', { className: 'ldw-drill-arg', children: d.item.argument }),
      jsx('div', { className: 'ldw-chips', role: 'group', 'aria-label': 'Your answer', children: opts.map(o => {
        const state = !d.picked ? undefined : o === d.item.answer ? 'right' : o === d.picked ? 'wrong' : undefined
        return jsxs('button', { type: 'button', className: 'ldw-chip ldw-opt', 'data-result': state, 'aria-pressed': d.picked === o, disabled: !!d.picked && !state,
          onClick: () => pick(o), children: [state === 'right' ? jsx(Codicon, { name: 'check' }) : state === 'wrong' ? jsx(Codicon, { name: 'close' }) : null, o === 'None' ? 'No fallacy' : o] }, o)
      }) }),
      d.picked ? jsxs('div', { className: 'hk-stack', children: [
        jsxs('p', { className: 'ldw-goal', children: [jsx('strong', { children: ok ? 'Right. ' : `It was ${d.item.answer === 'None' ? 'no fallacy' : d.item.answer}. ` }), d.item.explanation] }),
        jsx('div', { children: jsx(Button, { onClick: newDrill, children: jsxs(Fragment, { children: [jsx(Codicon, { name: 'arrow-right' }), 'Next argument'] }) }) }),
      ] }) : null,
    ] }) : null,
    d.n ? jsx('div', { className: 'ldw-meta', role: 'status', children: `This session: ${d.right} of ${d.n} right` }) : null,
  ] })
}

function CheckArgument() {
  const [text, setText] = useState('')
  const [out, setOut] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const go = async () => {
    if (words(text) < 12) { setErr('Paste a longer argument first.'); return }
    setBusy(true); setErr(null)
    try { setOut((await post('spot', { text })).text) } catch (e) { setErr(errText(e)) } finally { setBusy(false) }
  }
  return jsxs('section', { className: 'ldw-panel', 'aria-label': 'Check an argument', children: [
    jsx(Label, { accent: true, children: 'Check an argument' }),
    jsx('h2', { className: 'hk-h2', children: 'Find the fallacies in any text' }),
    jsx('p', { className: 'ldw-goal', children: "Paste an opponent's case, a teammate's speech, or a paragraph from an article. To check your own case, use Find fallacies in any contention." }),
    jsx(Textarea, { className: 'ldw-speechbox ldw-short', 'aria-label': 'Argument to check', value: text, onChange: e => setText(e.target.value), placeholder: 'Paste the argument here' }),
    jsx('div', { className: 'ldw-row-end', children: jsx(Button, { loading: busy, onClick: go, children: jsxs(Fragment, { children: [jsx(Codicon, { name: 'search' }), 'Find the fallacies'] }) }) }),
    busy ? jsx(Thinking, { label: 'Looking for fallacies' }) : null,
    err ? jsx(Notice, { tone: 'bad', children: err }) : null,
    out ? jsxs('div', { className: 'ldw-helper', children: [jsx(Label, { accent: true, children: 'Fallacies found' }), jsx('div', { className: 'ldw-helper-body', children: renderText(out) })] }) : null,
  ] })
}

function Fallacies() {
  const guide = ($cfg.get() || {}).fallacies || []
  return jsxs(Fragment, { children: [
    jsx('p', { className: 'ldw-goal', children: 'A fallacy is a mistake in reasoning that can make a weak argument sound strong. Learn the common ones, practice spotting them, and check any argument for them: yours or someone else\'s.' }),
    jsxs('div', { className: 'ldw-fx-grid', children: [jsx(Drill, {}), jsx(CheckArgument, {})] }),
    jsxs('section', { className: 'hk-stack', 'aria-label': 'The guide', children: [
      jsx(Label, { children: `The guide · ${guide.length} fallacies` }),
      jsx('div', { className: 'ldw-fx-cards', children: guide.map(f => jsxs('article', { className: 'ldw-fx-card', children: [
        jsx('h3', { className: 'ldw-sec-title', children: f.name }),
        jsx('p', { children: f.definition }),
        jsx('p', { className: 'ldw-fx-ex', children: `"${f.example}"` }),
        jsxs('p', { className: 'ldw-fx-use', children: [jsx('strong', { children: 'In a round: ' }), f.debate] }),
      ] }, f.name)) }),
    ] }),
  ] })
}

/* ================================================================== page == */

function Header() {
  const view = useValue($view)
  const st = useValue($state)
  const cfg = $cfg.get()
  const r = st && st.round
  const c = st && st.workbench && st.workbench.case
  const eyebrow = view === 'fallacies' ? 'Logical fallacies · guide, practice and checker' : view === 'room'
    ? r ? `Practice round ${r.round_no} · ${sideShort(r.side)} · ${r.level === 'jv' ? 'JV' : r.level} · ${cfg.judges[r.judge].label}` : `${(st.history || {}).count || 0} ${((st.history || {}).count || 0) === 1 ? 'ballot' : 'ballots'} so far · NSDA Lincoln-Douglas`
    : c ? `${c.side === 'aff' ? 'Affirmative' : 'Negative'} case · ${c.name}` : ''
  const res = view === 'fallacies' ? null : view === 'room' ? (r ? r.resolution : c && c.resolution) : c && c.resolution
  const tab = (id, label, icon) => jsxs('button', { type: 'button', role: 'tab', className: 'ldw-tab', 'aria-selected': view === id || (id === 'bench' && view === 'print'),
    onClick: () => $view.set(id), children: [jsx(Codicon, { name: icon }), label] })
  return jsxs('header', { className: 'ldw-head ldw-noprint', children: [
    jsxs('div', { className: 'ldw-head-title', children: [
      jsx('h1', { className: 'ldw-h1', children: view === 'room' ? 'Tournament Room' : view === 'fallacies' ? 'Fallacies' : 'Case Workbench' }),
      jsx('span', { className: 'ldw-label ldw-accent', children: eyebrow }),
      res ? jsx('span', { className: 'ldw-res', children: `"${res.replace(/^Resolved:\s*/i, '')}"` }) : null,
    ] }),
    jsxs('nav', { className: 'ldw-tabs', role: 'tablist', 'aria-label': 'Debate', children: [tab('room', 'Tournament Room', 'law'), tab('bench', 'Case Workbench', 'edit'), tab('fallacies', 'Fallacies', 'warning')] }),
  ] })
}

function DebatePage() {
  const st = useValue($state)
  const cfg = useValue($cfg)
  const err = useValue($loadError)
  const view = useValue($view)
  useEffect(() => { load() }, [])
  let body
  if (err && !st) body = jsx(Failure, { title: 'The workbench could not load', body: `${errText(err)} Check that LD Workbench is turned on in Capabilities, Plugins, then try again.`, error: err, onRetry: load })
  else if (!st || !cfg) body = jsx(Thinking, { label: 'Opening the workbench' })
  else body = jsxs(Fragment, { children: [jsx(Header, {}), view === 'room' ? jsx(Room, {}) : view === 'fallacies' ? jsx(Fallacies, {}) : view === 'print' ? jsx(PrintView, {}) : jsx(Bench, {})] })
  return jsx('div', { className: 'hk hk-page ldw', role: 'region', 'aria-label': 'LD Workbench', children: jsx('div', { className: 'ldw-inner', children: body }) })
}

/* ------------------------------------------------------------------ styles -- */

// Only theme variables (the kit's --hk-* tokens over the app's --ui-* / --dt-*). The paper ballot is mixed
// from the surface and the text color; under the app's dark mode it flips to light paper with dark ink.
const CSS = `
.ldw{--ldw-serif:Georgia,"Source Serif 4","Times New Roman",ui-serif,serif;--ldw-gap:14px}
.ldw-inner{padding:18px 22px 40px;display:grid;gap:var(--ldw-gap);align-content:start;min-width:0}
.ldw-label{font-family:var(--hk-mono);font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--hk-ink)}
.ldw-accent{color:color-mix(in srgb,var(--hk-accent) 82%,var(--hk-ink))}
.ldw-meta{font-size:12px;color:var(--hk-ink)}
.ldw-head{display:flex;align-items:flex-end;justify-content:space-between;gap:14px;flex-wrap:wrap}
.ldw-head-title{display:flex;align-items:baseline;gap:14px;flex-wrap:wrap;min-width:0}
.ldw-h1{margin:0;font-size:22px;font-weight:800;letter-spacing:-.02em}
.ldw-res{font-family:var(--ldw-serif);font-style:italic;font-size:17px}
.ldw-tabs{display:flex;gap:4px;padding:3px;border:1px solid var(--hk-stroke);border-radius:var(--hk-radius);background:var(--hk-surface)}
.ldw-tab{display:inline-flex;gap:6px;align-items:center;border:0;background:transparent;color:var(--hk-ink);font:inherit;font-size:12px;font-weight:600;padding:6px 12px;border-radius:var(--hk-radius-sm);cursor:pointer}
.ldw-tab:hover{background:var(--hk-hover)}
.ldw-tab[aria-selected=true]{background:var(--hk-active);box-shadow:inset 0 -2px 0 var(--hk-accent)}
.ldw-tab:focus-visible,.ldw-chip:focus-visible,.ldw-slot:focus-visible,.ldw-decisive:focus-visible,.ldw-case-open:focus-visible,.ldw-pick-row:focus-visible{outline:2px solid var(--hk-accent);outline-offset:1px}

.ldw-board{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:8px}
.ldw-path{grid-template-columns:repeat(6,minmax(0,1fr))}
.ldw-path li{display:grid}
.ldw-slot{position:relative;background:var(--hk-surface);border:1px solid var(--hk-stroke);border-radius:8px;padding:10px 12px;min-width:0;color:var(--hk-ink);text-align:left;font:inherit;
  transition:border-color var(--hk-dur) var(--hk-ease),background-color var(--hk-dur) var(--hk-ease)}
.ldw-slot-id{font-family:var(--hk-mono);font-weight:800;font-size:18px;line-height:1.2}
.ldw-slot-who{font-size:11px;letter-spacing:.06em;text-transform:uppercase;margin-top:2px}
.ldw-slot-check{position:absolute;right:10px;top:10px;color:var(--hk-good)}
.ldw-slot[data-state=done]{background:var(--hk-sunken)}
.ldw-slot[data-state=done] .ldw-slot-id{color:color-mix(in srgb,var(--hk-ink) 70%,var(--hk-surface))}
.ldw-slot[data-state=now]{border-color:var(--hk-accent);box-shadow:inset 0 0 0 1px var(--hk-accent);background:color-mix(in srgb,var(--hk-accent) 12%,var(--hk-surface))}
.ldw-step{cursor:pointer;display:grid;gap:3px;align-content:start;height:100%}
.ldw-step:hover:not(:disabled){border-color:var(--hk-stroke-strong);background:color-mix(in srgb,var(--hk-hover) 60%,var(--hk-surface))}
.ldw-step:disabled{cursor:default}
.ldw-step[data-state=done]{border-left:3px solid var(--hk-good-fill)}
.ldw-step-title{font-weight:700;font-size:13px;line-height:1.25}
.ldw-step-desc{font-size:12px;line-height:1.35}

.ldw-floor{display:grid;grid-template-columns:260px minmax(0,1fr) 330px;gap:var(--ldw-gap);align-items:start}
.ldw-panel{background:var(--hk-surface);border:1px solid var(--hk-stroke);border-radius:10px;padding:16px;min-width:0;display:grid;gap:10px;align-content:start}
.ldw-panel>*{min-width:0}

.ldw-clock{position:sticky;top:0}
.ldw-watch{text-align:center;padding:14px 0 4px;display:grid;gap:8px}
.ldw-watch-time{font-family:var(--hk-mono);font-weight:800;font-size:68px;letter-spacing:-.02em;line-height:1;font-variant-numeric:tabular-nums}
.ldw-over{color:var(--hk-bad)}
.ldw-bar{height:6px;background:var(--hk-sunken);border-radius:3px;overflow:hidden}
.ldw-bar span{display:block;height:100%;background:var(--hk-accent);border-radius:3px;transition:width 160ms var(--hk-ease)}
.ldw-bar[data-over] span{background:var(--hk-bad-fill)}
.ldw-rows{display:grid;grid-template-columns:1fr auto;gap:6px 10px;margin:0;font-size:13px}
.ldw-rows dt{margin:0}.ldw-rows dd{margin:0;font-family:var(--hk-mono);font-weight:700;text-align:right}
.ldw-clock-actions{display:grid;gap:8px;margin-top:4px}
.ldw-big{width:100%;justify-content:center;padding:9px 12px !important;font-size:13px !important;font-weight:700 !important}
.ldw-stage{min-height:420px}
.ldw-goal{font-size:13px;max-width:72ch}
.ldw-speechbox{width:100%;min-height:360px;resize:vertical;font-family:var(--ldw-serif) !important;font-size:16px !important;line-height:1.6 !important;padding:12px 14px !important}
.ldw-short{min-height:160px}
.ldw-speech,.ldw-prose{font-family:var(--ldw-serif);font-size:16px;line-height:1.6;max-width:74ch}
.ldw-prose p{margin:0 0 10px}.ldw-prose ul,.ldw-prose ol{margin:2px 0 10px;padding-left:20px}.ldw-prose li{margin:2px 0}
.ldw-helper-body .ldw-prose,.ldw-thread .ldw-prose{font-size:14px;line-height:1.55}
.ldw-thinking{display:flex;align-items:center;gap:10px;font-family:var(--hk-mono);font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:color-mix(in srgb,var(--hk-accent) 82%,var(--hk-ink));padding:6px 0}
.ldw-cx{display:grid;gap:8px;max-height:420px;overflow:auto;align-content:start}
.ldw-cx-turn{padding:8px 12px;border-left:2px solid var(--hk-stroke-strong);font-size:14px;display:grid;gap:2px}
.ldw-cx-turn[data-you="1"]{border-left-color:var(--hk-accent);background:color-mix(in srgb,var(--hk-accent) 6%,transparent)}
.ldw-cx-turn[data-q="0"]{margin-left:18px}
.ldw-ask{display:flex;gap:8px;align-items:flex-end}
.ldw-ask textarea{flex:1;min-height:46px;max-height:160px;resize:vertical}
.ldw-field-label{font-size:12px;font-weight:700;margin-top:6px}
.ldw-pick{list-style:none;margin:0;padding:0;display:grid;gap:4px;max-height:220px;overflow:auto}
.ldw-pick-row,.ldw-case-open{display:flex;gap:10px;align-items:center;width:100%;text-align:left;font:inherit;color:inherit;background:transparent;border:1px solid var(--hk-stroke);border-radius:6px;padding:7px 10px;cursor:pointer}
.ldw-pick-row:hover,.ldw-case-open:hover{background:var(--hk-hover)}
.ldw-pick-row[data-active]{border-color:var(--hk-accent);background:var(--hk-active)}
.ldw-side-tag{font-family:var(--hk-mono);font-size:10px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;padding:1px 6px;border-radius:999px;border:1px solid color-mix(in srgb,var(--hk-accent) 45%,transparent);margin-right:6px}

.ldw-side{gap:12px}
.ldw-paper{position:relative;border-radius:6px;padding:16px 18px 18px;font-family:var(--ldw-serif);
  background:color-mix(in srgb,var(--hk-surface) 90%,var(--hk-warn-fill));color:var(--hk-ink);border:1px solid var(--hk-stroke)}
:root.dark .ldw-paper{background:color-mix(in srgb,var(--hk-ink) 90%,var(--hk-warn-fill));color:var(--ui-bg-elevated,var(--hk-bg));border-color:transparent}
.ldw-paper-top{display:flex;justify-content:space-between;gap:4px 10px;flex-wrap:wrap;font-family:var(--hk-mono);font-size:10px;letter-spacing:.14em;font-weight:800;text-transform:uppercase;border-bottom:2px solid currentColor;padding-bottom:8px;margin-bottom:6px}
.ldw-paper-line{display:flex;justify-content:space-between;gap:10px;font-size:14px;padding:7px 0;border-bottom:1px dashed color-mix(in srgb,currentColor 40%,transparent)}
.ldw-paper-decided b{text-align:left;max-width:70%}
.ldw-box{display:inline-block;width:14px;height:14px;border:1.5px solid currentColor;margin-right:7px;vertical-align:-2px;position:relative}
.ldw-box[data-x="1"]::before,.ldw-box[data-x="1"]::after{content:"";position:absolute;left:50%;top:-2px;width:1.5px;height:16px;background:currentColor;transform:rotate(45deg)}
.ldw-box[data-x="1"]::after{transform:rotate(-45deg)}
.ldw-paper-rfd{font-size:14px;line-height:1.45;font-style:italic;margin-top:10px !important;padding-right:6px}
.ldw-stamp{position:absolute;right:14px;bottom:-10px;font-family:var(--hk-mono);font-weight:800;font-size:11px;letter-spacing:.14em;text-transform:uppercase;padding:4px 8px;transform:rotate(-6deg);
  color:color-mix(in srgb,var(--hk-bad-fill) 85%,currentColor);border:2px solid currentColor;background:inherit;border-radius:3px}
:root.dark .ldw-stamp{color:color-mix(in srgb,var(--hk-bad-fill) 80%,var(--ui-bg-elevated,var(--hk-bg)))}
.ldw-drills{display:grid;gap:10px}
.ldw-drill{display:grid;gap:3px;border-top:1px solid var(--hk-stroke);padding-top:8px}
.ldw-drill p{font-size:13px}
.ldw-why{font-style:italic}
.ldw-verdict{margin:0;font-size:20px;font-weight:800}
.ldw-ballot-grid{display:grid;grid-template-columns:1fr;gap:18px}
.ldw-decisive{display:grid;gap:3px;text-align:left;font:inherit;color:inherit;background:var(--hk-sunken);border:1px solid var(--hk-stroke);border-left:3px solid var(--hk-accent);border-radius:6px;padding:8px 10px;cursor:pointer}
.ldw-decisive:hover{border-color:var(--hk-stroke-strong)}
.ldw-decisive em{font-size:12.5px}
.ldw-list{margin:0;padding-left:18px;display:grid;gap:4px}
.ldw-flow-scroll{overflow-x:auto}
.ldw-flow table{border-collapse:collapse;width:100%;min-width:860px}
.ldw-flow th{font-family:var(--hk-mono);font-size:11px;letter-spacing:.12em;text-transform:uppercase;text-align:left;padding:8px 10px;border-bottom:1px solid var(--hk-stroke-strong);border-right:1px solid var(--hk-stroke)}
.ldw-flow th span{display:block;font-size:10px;letter-spacing:.06em;font-weight:400}
.ldw-flow td{vertical-align:top;padding:8px 10px;border-right:1px solid var(--hk-stroke);font-size:12.5px;line-height:1.4}
.ldw-flow td div{padding:3px 0;border-bottom:1px dotted var(--hk-stroke)}
.ldw-flow td[data-hit]{background:color-mix(in srgb,var(--hk-accent) 14%,transparent);outline:1px solid var(--hk-accent)}

.ldw-resbar{gap:12px}
.ldw-resrow{display:flex;gap:12px;align-items:center;flex-wrap:wrap}
.ldw-resinput{flex:1;min-width:260px;font-family:var(--ldw-serif) !important;font-style:italic;font-size:16px !important}
.ldw-source{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.ldw-source textarea{min-height:80px}
.ldw-casehead{display:flex;gap:12px;align-items:center;flex-wrap:wrap}
.ldw-casename{flex:1;min-width:220px;font-size:16px !important;font-weight:700}
.ldw-benchgrid{display:grid;grid-template-columns:232px minmax(0,1fr) 340px;gap:var(--ldw-gap);align-items:start}
.ldw-library{position:sticky;top:0}
.ldw-two{display:grid;grid-template-columns:1fr 1fr;gap:6px}.ldw-two>*{width:100%;min-width:0;justify-content:center}.ldw-stack1{grid-template-columns:1fr}
.ldw-cases{list-style:none;margin:0;padding:0;display:grid;gap:4px;max-height:46vh;overflow:auto}
.ldw-case-open{flex-direction:column;align-items:flex-start;gap:2px;border-color:transparent}
.ldw-case-item[data-active] .ldw-case-open{border-color:var(--hk-accent);background:var(--hk-active)}
.ldw-case-name{font-weight:600;font-size:13px;line-height:1.3;display:flex;align-items:center;overflow-wrap:anywhere}
.ldw-case-acts{display:flex;gap:6px;flex-wrap:wrap;align-items:center;padding:6px 2px 4px}
.ldw-danger{color:var(--hk-bad) !important}
.ldw-row-between{display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap}
.ldw-case{padding:0;gap:0;overflow:hidden}
.ldw-timebar{display:flex;align-items:center;gap:10px;padding:12px 16px;border-bottom:1px solid var(--hk-stroke);background:var(--hk-sunken);font-size:13px;font-weight:600;flex-wrap:wrap}
.ldw-grow{flex:1;min-width:120px}
.ldw-timebar .ldw-bar{background:var(--hk-surface);border:1px solid var(--hk-stroke)}
.ldw-sec{padding:14px 16px;border-bottom:1px solid var(--hk-stroke);border-left:3px solid transparent;display:grid;gap:6px;transition:border-color var(--hk-dur) var(--hk-ease)}
.ldw-sec:last-child{border-bottom:0}
.ldw-sec[data-focus]{border-left-color:var(--hk-accent)}
.ldw-sec-title{margin:0;font-size:14px;font-weight:700}
.ldw-hint{font-size:13px;font-style:italic;font-family:var(--ldw-serif)}
.ldw-sec-text{width:100%;min-height:84px;resize:vertical;font-family:var(--ldw-serif) !important;font-size:15px !important;line-height:1.55 !important}
.ldw-chips{display:flex;gap:6px;flex-wrap:wrap}
.ldw-chip{display:inline-flex;align-items:center;gap:5px;background:transparent;border:1px solid var(--hk-stroke);border-radius:999px;padding:3px 9px;font:inherit;font-size:12px;font-weight:600;color:var(--hk-ink);cursor:pointer;
  transition:border-color var(--hk-dur) var(--hk-ease),background-color var(--hk-dur) var(--hk-ease)}
.ldw-chip .codicon{color:color-mix(in srgb,var(--hk-accent) 82%,var(--hk-ink))}
.ldw-chip:hover:not(:disabled){border-color:var(--hk-accent)}
.ldw-chip[data-main]{border-color:var(--hk-accent);background:color-mix(in srgb,var(--hk-accent) 14%,transparent)}
.ldw-chip:disabled{cursor:default;opacity:.6}
.ldw-helper{border:1px solid var(--hk-stroke);border-left:3px solid var(--hk-accent);border-radius:6px;padding:10px 12px;display:grid;gap:6px;background:var(--hk-sunken)}
.ldw-helper-body{max-height:420px;overflow:auto}
.ldw-coach{position:sticky;top:0;max-height:calc(100vh - 80px);grid-template-rows:auto auto auto minmax(160px,1fr) auto}
.ldw-focus{font-family:var(--hk-mono);font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;border:1px solid var(--hk-accent);border-radius:999px;padding:1px 8px}
.ldw-toolgrid{display:grid;grid-template-columns:1fr 1fr;gap:6px}
.ldw-tool{border-radius:6px;justify-content:flex-start;text-align:left;padding:6px 8px}
.ldw-thread{overflow:auto;display:grid;gap:12px;align-content:start;min-height:160px;padding-right:2px}
.ldw-msg{display:grid;gap:3px;font-size:14px}
.ldw-msg[data-role=coach]{border-left:2px solid var(--hk-accent);padding-left:10px}
.ldw-msg[data-role=you] p{background:var(--hk-sunken);border:1px solid var(--hk-stroke);border-radius:6px;padding:6px 10px}
.ldw-import{gap:10px}
.ldw-print{background:var(--hk-surface);border:1px solid var(--hk-stroke);border-radius:10px;padding:40px 48px;max-width:780px;font-family:var(--ldw-serif);font-size:15px;line-height:1.6}
.ldw-print h1{font-size:24px;margin:0 0 4px;font-family:inherit}
.ldw-print h2{font-size:15px;text-transform:uppercase;letter-spacing:.08em;margin:22px 0 6px;font-family:var(--hk-mono)}
.ldw-print p{margin:0 0 10px}
.ldw-print-meta{font-style:italic}

.ldw-fx-grid{display:grid;grid-template-columns:1fr 1fr;gap:var(--ldw-gap);align-items:start}
.ldw-fx-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,260px),1fr));gap:10px}
.ldw-fx-card{background:var(--hk-surface);border:1px solid var(--hk-stroke);border-radius:8px;padding:12px 14px;display:grid;gap:6px;align-content:start;font-size:13px}
.ldw-fx-ex{font-family:var(--ldw-serif);font-style:italic;font-size:14px}
.ldw-fx-use{border-top:1px solid var(--hk-stroke);padding-top:6px}
.ldw-drill-arg{margin:0;font-family:var(--ldw-serif);font-size:16px;line-height:1.55;border-left:3px solid var(--hk-accent);padding:6px 0 6px 14px}
.ldw-opt:disabled{opacity:1;cursor:default}
.ldw-opt[data-result=right]{border-color:var(--hk-good-fill);background:color-mix(in srgb,var(--hk-good-fill) 18%,transparent)}
.ldw-opt[data-result=right] .codicon{color:var(--hk-good)}
.ldw-opt[data-result=wrong]{border-color:var(--hk-bad-fill);background:color-mix(in srgb,var(--hk-bad-fill) 16%,transparent)}
.ldw-opt[data-result=wrong] .codicon{color:var(--hk-bad)}
.ldw-row-end{display:flex;justify-content:flex-end}
@container (max-width:1060px){.ldw-floor{grid-template-columns:260px minmax(0,1fr)}.ldw-floor>.ldw-side{grid-column:1/-1}.ldw-benchgrid{grid-template-columns:210px minmax(0,1fr)}.ldw-benchgrid>.ldw-coach{grid-column:1/-1;position:static;max-height:none}}
@container (max-width:900px){.ldw-floor,.ldw-benchgrid,.ldw-ballot-grid,.ldw-source,.ldw-fx-grid{grid-template-columns:1fr}.ldw-board{grid-template-columns:repeat(4,minmax(0,1fr))}.ldw-path{grid-template-columns:repeat(3,minmax(0,1fr))}.ldw-clock,.ldw-library{position:static}.ldw-watch-time{font-size:56px}}
@media print{
  body *{visibility:hidden !important}
  .ldw-print,.ldw-print *{visibility:visible !important}
  .ldw-print{position:absolute;left:0;top:0;border:0;padding:0;max-width:none;background:transparent !important;color:CanvasText}
  .ldw-print section{break-inside:avoid-page}.ldw-print h2{break-after:avoid}.ldw-print p{orphans:3;widows:3}
}
`

/* ------------------------------------------------------------------ register -- */

export default {
  id: PLUGIN_ID,
  name: 'LD Workbench',
  register(ctx) {
    api = ctx
    installStyles(ctx, PLUGIN_ID, CSS)
    const open = view => () => { $view.set(view); host.navigate(ROUTE) }
    registerPage(ctx, {
      id: PLUGIN_ID, route: ROUTE, label: 'Debate', codicon: 'law',
      render: () => jsx(DebatePage, {}),
      palette: [
        { id: 'ld-workbench.room', label: 'Debate: open the Tournament Room', keywords: ['lincoln douglas', 'practice round', 'ballot'], run: open('room') },
        { id: 'ld-workbench.fallacies', contributionId: 'fallacies', label: 'Debate: practice logical fallacies', keywords: ['fallacy', 'logic', 'reasoning'], run: open('fallacies') },
        { id: 'ld-workbench.bench', contributionId: 'bench', label: 'Debate: open the Case Workbench', keywords: ['case', 'coach', 'lincoln douglas'], run: open('bench') },
      ],
    })
    ctx.onDispose(() => { api = null })
  },
}

// For the harness: open a view directly.
export function openView(view) { $view.set(view) }

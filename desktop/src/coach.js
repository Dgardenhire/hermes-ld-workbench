// The coach's examples and suggestions, and the coach chat on every floor. The student tries first; then the
// coach can show and suggest. Everything the coach writes sits in its own box, labeled as the coach's, with
// the code's check of every citation, quote and figure under it. A teacher can turn examples off (Settings,
// Coach examples); then no example button shows and the chat only explains and asks.

import { useEffect, useRef, useState } from 'react'
import { Fragment, jsx, jsxs } from 'react/jsx-runtime'
import { Button, Codicon, Input, Textarea, atom, useValue } from '@hermes/plugin-sdk'
import { Notice, installStyles } from 'hermes-ui-kit'
import { PLUGIN_ID, Thinking, cls, errText, inlineChecked, mmss, points as fmtPoints, post, renderChecked } from './core.js'
import { $compareOpen, Tabs } from './margin.js'
import { $nowPlaying, claimPlayback, releasePlayback } from './player.js'

export const $coachOn = atom(true) // settings.coach_examples, set with the home data
export const $coachCtx = atom(null) // what is on screen: { floor, sees, ...ids the backend reads the work by }
export const $chatOpen = atom(false)
const $threads = atom({}) // floor -> [{ role, text, checks }]

export const COACH_FLAG = 'Not in your sources or your words. Check it before you use it.'
const EMPTY = {
  extemp: 'Ask anything about the question, your answer, your file or the ballot.',
  ld: 'Ask anything about your case, the resolution, the round or the ballot.',
  rhetoric: 'Ask anything about a figure, a speech or your line.',
  ballots: 'Ask anything about a ballot, or the patterns across them.',
}

// Views say what is on screen. The backend reads the student's work by these ids; the page never sends a prompt.
export function useCoachContext(ctx, deps) {
  useEffect(() => { $coachCtx.set(ctx) }, deps)
}

// One sentence under every example: what the code checked, and how many marks to look at.
export function checkSummary(c, against = 'your file') {
  if (!c) return null
  const n = c.citations || 0
  const q = c.quotes || 0
  const miss = (c.not_in_file || 0) + (c.quotes_missed || 0) + (c.numbers_missed || 0) + (c.outlets_missed || 0)
  const parts = []
  if (n) parts.push(`${n} citation${n === 1 ? '' : 's'}`)
  if (q) parts.push(`${q} quote${q === 1 ? '' : 's'}`)
  const head = parts.length ? `Checked against ${against}: ${parts.join(' and ')}.` : `Checked against ${against}: no quotes, figures or sources to check.`
  return miss ? `${head} ${miss} marked. Check ${miss === 1 ? 'it' : 'them'} before you use ${miss === 1 ? 'it' : 'them'}.` : head
}

// The box the coach writes in. A label that says whose words these are, then the words, then the check.
export function CoachBox({ label = "Coach's example", sub, checks, against, foot, onClose, children, className }) {
  return jsxs('section', { className: cls('ldw-coachbox', className), 'aria-label': label, children: [
    jsxs('div', { className: 'ldw-coachbox-head', children: [
      jsx('span', { className: 'ldw-coachbox-label', children: label }),
      sub ? jsx('span', { className: 'ldw-coachbox-sub', children: sub }) : null,
      onClose ? jsx('button', { type: 'button', className: 'hk-link ldw-coachbox-close', onClick: onClose, children: 'Hide' }) : null,
    ] }),
    children,
    checks || foot ? jsx('p', { className: 'ldw-coachbox-check', children: [foot, checks ? checkSummary(checks, against) : null].filter(Boolean).join(' ') }) : null,
  ] })
}

// A coach call with its own busy state, error and answer.
export function useCoachCall() {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const [out, setOut] = useState(null)
  const call = async (path, body) => {
    setBusy(true); setErr(null)
    try { const o = await post(path, body); setOut(o); return o } catch (e) { setErr(errText(e)); return null } finally { setBusy(false) }
  }
  const run = async make => { // the same, for a call that may already be on its way (a prepared example)
    setBusy(true); setErr(null)
    try { const o = await make(); setOut(o); return o } catch (e) { setErr(errText(e)); return null } finally { setBusy(false) }
  }
  return { busy, err, out, setOut, call, run, reset: () => { setOut(null); setErr(null) } }
}

// The coach's example is prepared as soon as a 60-second answer's ballot lands (Damon, Nov 9), so it is usually
// ready when the student presses Show me a strong answer. One request per take and question; a failed one is
// forgotten, so the press asks again. An example prepared and never opened is simply dropped.
const prepared = new Map()
const exampleKey = (takeId, question) => `${takeId}|${question}`
export function prepareExample({ takeId, question }) {
  if (!takeId || !$coachOn.get()) return null
  const key = exampleKey(takeId, question)
  if (!prepared.has(key)) {
    const p = post('coach/extemp/example', { kind: 'answer', question, take_id: takeId })
    p.catch(() => { if (prepared.get(key) === p) prepared.delete(key) })
    prepared.set(key, p)
  }
  return prepared.get(key)
}

/* ------------------------------------------------------------------ extemp: a strong one -- */

// The stages a strong answer goes through, said while the student waits: the first within 300 ms, then the
// elapsed seconds, so a 20-second call never looks stuck.
const EXAMPLE_STAGES = [[0, 'Reading your take, line by line'], [3, 'Writing a strong answer on your question'], [13, 'Checking every source, quote and line link']]
export function Stages({ stages = EXAMPLE_STAGES }) {
  const [t, setT] = useState(0)
  useEffect(() => { const t0 = Date.now(); const id = setInterval(() => setT((Date.now() - t0) / 1000), 250); return () => clearInterval(id) }, [])
  const now = stages.filter(([at]) => t >= at).pop() || stages[0]
  return jsxs('div', { className: 'ldw-stages', role: 'status', children: [jsx('span', { className: 'hk-spinner' }), jsx('span', { children: now[1] }),
    jsx('span', { className: 'ldw-stages-t', children: `${Math.floor(t)} s` })] })
}

// Hear it: the kept example in the user's own Hermes voice (POST coach/speak). One thing plays at a time.
export function HearIt({ exampleId, label = 'Hear it' }) {
  const [state, setState] = useState('idle') // idle | loading | ready
  const [playing, setPlaying] = useState(false)
  const [err, setErr] = useState(null)
  const audio = useRef(null)
  const urls = useRef([])
  const part = useRef(0)
  const key = `coach:${exampleId}`
  const now = useValue($nowPlaying)
  useEffect(() => { if (now !== key && playing) { try { audio.current.pause() } catch (e) { /* gone */ } setPlaying(false) } }, [now])
  useEffect(() => () => { releasePlayback(key); urls.current.forEach(u => URL.revokeObjectURL(u)) }, [exampleId])
  const play = () => {
    const a = audio.current
    if (!a) return
    if (!a.src) a.src = urls.current[part.current]
    claimPlayback(key)
    a.play().then(() => { setPlaying(true); setErr(null) }, () => { setPlaying(false); setErr('Press Hear it again to play it.') })
  }
  const load = async () => {
    setState('loading'); setErr(null)
    try {
      const d = await post('coach/speak', { example_id: exampleId })
      urls.current = d.parts.map(p => { const bin = atob(p.b64); const bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i); return URL.createObjectURL(new Blob([bytes], { type: p.mime })) })
      part.current = 0; setState('ready'); setTimeout(play, 0)
    } catch (e) { setErr(errText(e)); setState('idle') }
  }
  const pause = () => { try { audio.current.pause() } catch (e) { /* gone */ } setPlaying(false); releasePlayback(key) }
  const ended = () => { if (part.current < urls.current.length - 1) { part.current += 1; audio.current.src = urls.current[part.current]; play() } else { setPlaying(false); releasePlayback(key) } }
  return jsxs('span', { className: 'ldw-hearit', children: [
    jsx('audio', { ref: audio, preload: 'auto', onEnded: ended }),
    jsx(Button, { variant: 'secondary', loading: state === 'loading', onClick: state !== 'ready' ? load : playing ? pause : play,
      children: jsxs(Fragment, { children: [jsx(Codicon, { name: playing ? 'debug-pause' : 'unmute' }), state === 'loading' ? 'Getting the voice ready' : playing ? 'Pause' : label] }) }),
    err ? jsx('span', { className: 'ldw-why-off', role: 'alert', children: err }) : null,
  ] })
}

// One coach note in two labeled halves, so the student is never credited with the coach's move.
function NoteHalves({ n }) {
  if (typeof n === 'string') return inlineChecked(n, COACH_FLAG)
  return jsxs(Fragment, { children: [
    n.yours ? jsxs('span', { className: 'ldw-half', children: [jsx('b', { children: 'Yours: ' }), inlineChecked(n.yours.replace(/^You\b/, 'You'), COACH_FLAG)] }) : null,
    n.this ? jsxs('span', { className: 'ldw-half', children: [jsx('b', { children: 'This version: ' }), inlineChecked(n.this.replace(/^This version\s*/i, '').replace(/^./, c => c.toUpperCase()), COACH_FLAG)] }) : null,
  ] })
}

// What the code checked, listed: every citation, quote, figure and outlet, and every line link.
function DetailsList({ o }) {
  const c = o.checks || {}
  const l = o.links || {}
  const marked = (c.not_in_file || 0) + (c.quotes_missed || 0) + (c.numbers_missed || 0) + (c.outlets_missed || 0)
  const items = [
    `Citations to your file: ${c.citations || 0}${(o.cited || []).length ? ` (${o.cited.join('; ')})` : ''}.`,
    `Quotes of four words or more: ${c.quotes || 0}, each found in a source or in your own words${c.quotes_missed ? `, except ${c.quotes_missed}` : ''}.`,
    `Figures, dates and outlets not in your file: ${(c.numbers_missed || 0) + (c.outlets_missed || 0) + (c.not_in_file || 0)}${marked ? ', each marked where it is' : ''}.`,
    l.linked !== undefined ? `Line links: ${l.linked} of ${l.linked + l.new} sentences build on a line of yours; ${l.new} ${l.new === 1 ? 'is' : 'are'} new.${l.links_dropped ? ` ${l.links_dropped} link${l.links_dropped === 1 ? '' : 's'} the coach gave did not match your line and ${l.links_dropped === 1 ? 'was' : 'were'} marked new.` : ''}` : null,
    'Each link is kept only when your line exists and shares a word with the sentence. Checked in code, not by the coach.',
  ].filter(Boolean)
  return jsx('ul', { className: 'ldw-cmp-details', children: items.map((t, i) => jsx('li', { children: t }, i)) })
}

// The compare: "Your take" beside "Coach's example", both in serif, each coach sentence marked with the line
// of yours it builds on or "new". Under 760 px of room it becomes two tabs. The margin folds to a tab meanwhile.
function Compare({ o, onAgain, onClose }) {
  const box = useRef(null)
  const [narrow, setNarrow] = useState(false)
  const [lit, setLit] = useState(null)
  const [details, setDetails] = useState(false)
  useEffect(() => { $compareOpen.set(true); return () => $compareOpen.set(false) }, [])
  useEffect(() => {
    const el = box.current
    if (!el || typeof ResizeObserver === 'undefined') return undefined
    const ro = new ResizeObserver(([e]) => setNarrow(e.contentRect.width < 600))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const lines = o.lines || []
  const sentences = o.sentences && o.sentences.length ? o.sentences : [{ text: o.example, line: null }]
  const yours = jsxs('div', { className: 'ldw-cmp-col', children: [
    jsx('h3', { className: 'ldw-cmp-h', children: 'Your take' }),
    jsx('ol', { className: 'ldw-cmp-lines', children: lines.map((t, i) => jsxs('li', { 'data-lit': lit === i + 1 ? '' : undefined, children: [
      jsx('span', { className: 'ldw-cmp-n', children: String(i + 1) }), jsx('span', { className: 'ldw-spoken', children: t })] }, i)) }),
  ] })
  const coach = jsxs('div', { className: 'ldw-cmp-col ldw-cmp-coach', children: [
    jsx('h3', { className: 'ldw-cmp-h', children: "Coach's example" }),
    jsx('div', { className: 'ldw-cmp-said', children: sentences.map((x, i) => jsxs('p', { className: 'ldw-cmp-s', onMouseEnter: () => setLit(x.line), onMouseLeave: () => setLit(null), children: [
      jsx('span', { className: 'ldw-spoken', children: inlineChecked(x.text, COACH_FLAG) }), ' ',
      jsx('span', { className: 'ldw-cmp-from', 'data-new': x.line ? undefined : '', children: x.line ? `from your line ${x.line}` : 'new' })] }, i)) }),
  ] })
  return jsxs('section', { ref: box, className: 'ldw-cmp', 'aria-label': "Your take and the coach's example", children: [
    narrow ? jsx(Tabs, { label: "Your take and the coach's example", initial: 'coach', tabs: [{ id: 'yours', label: 'Yours', content: yours }, { id: 'coach', label: "Coach's", content: coach }] })
      : jsxs('div', { className: 'ldw-cmp-cols', children: [yours, coach] }),
    jsxs('div', { className: 'ldw-cmp-actions', children: [
      o.id ? jsx(HearIt, { exampleId: o.id }) : null,
      onAgain ? jsx(Button, { onClick: onAgain, children: jsxs(Fragment, { children: [jsx(Codicon, { name: 'mic' }), 'Try it again'] }) }) : null,
      jsx('button', { type: 'button', className: 'hk-link', 'aria-expanded': details, onClick: () => setDetails(v => !v), children: details ? 'Hide details' : 'Details' }),
      jsx('button', { type: 'button', className: 'hk-link ldw-cmp-hide', onClick: onClose, children: 'Close the example' }),
    ] }),
    details ? jsx(DetailsList, { o }) : null,
    o.notes && o.notes.length ? jsxs('div', { className: 'ldw-cmp-why', children: [
      jsx('h4', { className: 'ldw-coachbox-h', children: 'Why it works' }),
      jsx('ul', { className: 'ldw-coachbox-notes', children: o.notes.map((n, i) => jsx('li', { children: jsx(NoteHalves, { n }) }, i)) }),
    ] }) : null,
    o.moves && o.moves.length ? jsxs('div', { className: 'ldw-cmp-why', children: [
      jsx('h4', { className: 'ldw-coachbox-h', children: 'Your next take is measured on' }),
      jsx('ul', { className: 'ldw-moves', children: o.moves.map(m => jsxs('li', { children: [jsx('b', { children: m.label }), jsx('span', { children: ` This take: ${m.take1.value}.` })] }, m.id)) }),
    ] }) : null,
    !o.sources ? jsx('p', { className: 'ldw-coachbox-kept', children: 'Your file is empty, so the example names no source. Save headlines in Full round and the coach can cite them.' }) : null,
  ] })
}

// After the student's own answer or openings: the coach's version on the same question, and why it works.
// The answer: one filled button right under the ballot, then the compare. Openings keep the box.
export function StrongExample({ kind, question, takeIds, best, onAgain, onExample }) {
  useEffect(() => installStyles(null, `${PLUGIN_ID}:coach`, COACH_CSS), [])
  const on = useValue($coachOn)
  const c = useCoachCall()
  const key = (takeIds || []).join(',')
  useEffect(() => { c.reset() }, [key, question])
  useEffect(() => { if (onExample) onExample(c.out) }, [c.out])
  if (!on) return null
  const what = kind === 'opening' ? 'opening' : 'answer'
  const ask = () => (kind === 'opening' ? c.call('coach/extemp/example', { kind, question, take_ids: takeIds, best })
    : c.run(() => prepareExample({ takeId: takeIds[0], question }) || post('coach/extemp/example', { kind, question, take_id: takeIds[0] })))
  if (!c.out) {
    return jsxs('div', { className: 'ldw-showme-row ldw-noprint', children: [
      jsx(Button, { className: 'ldw-showme', disabled: c.busy, onClick: ask, children: jsxs(Fragment, { children: [jsx(Codicon, { name: 'lightbulb' }), `Show me a strong ${what}`] }) }),
      c.busy ? jsx(Stages, {}) : null,
      c.err ? jsx(Notice, { tone: 'bad', children: c.err, action: jsx(Button, { size: 'sm', variant: 'secondary', onClick: ask, children: 'Try again' }) }) : null,
    ] })
  }
  const o = c.out
  if (kind === 'answer') return jsx(Compare, { o, onAgain: onAgain ? () => onAgain(o) : null, onClose: c.reset })
  return jsxs(CoachBox, { label: "Coach's example", sub: `A strong ${what} on your question. Learn the moves, then say it your own way.`, checks: o.checks, onClose: c.reset, children: [
    jsx('p', { className: 'ldw-spoken ldw-coachbox-said', children: inlineChecked(o.example, COACH_FLAG) }),
    o.notes && o.notes.length ? jsxs(Fragment, { children: [
      jsx('h4', { className: 'ldw-coachbox-h', children: 'Why it works' }),
      jsx('ul', { className: 'ldw-coachbox-notes', children: o.notes.map((n, i) => jsx('li', { children: jsx(NoteHalves, { n }) }, i)) }),
    ] }) : null,
    o.kept ? jsxs('p', { className: 'ldw-coachbox-kept', children: [jsx('b', { children: 'Kept from yours: ' }), o.kept] }) : null,
    !o.sources ? jsx('p', { className: 'ldw-meta', children: 'Your file is empty, so the example names no source. Save headlines in Full round and the coach can cite them.' }) : null,
    onAgain ? jsx('div', { children: jsx(Button, { size: 'sm', variant: 'secondary', onClick: () => onAgain(o), children: `Now give your own ${what} again` }) }) : null,
  ] })
}

// Take 2 against Take 1, after the coach's example: the numbers, and each move the example showed, met or not
// met, measured in code (POST coach/extemp/take2).
const CHANGE = { better: 'Better', worse: 'Worse', 'the same': 'Same', 'about the same': 'About the same', 'not measured': 'Not measured' }
function cell(key, v) {
  if (v === null || v === undefined) return 'none'
  if (key === 'answer_at') return mmss(v)
  if (key === 'points') return fmtPoints(v)
  return String(v)
}
export function TakeTwo({ take1, take2, exampleId, ready }) {
  useEffect(() => installStyles(null, `${PLUGIN_ID}:coach`, COACH_CSS), [])
  const [out, setOut] = useState(null)
  const [err, setErr] = useState(null)
  useEffect(() => {
    if (!ready || !take1 || !take2) return
    let alive = true
    post('coach/extemp/take2', { take1, take2, example_id: exampleId }).then(o => { if (alive) setOut(o) }, e => { if (alive) setErr(errText(e)) })
    return () => { alive = false }
  }, [take1, take2, exampleId, ready])
  if (err) return jsx(Notice, { tone: 'warn', children: err })
  if (!out) return ready ? jsx(Thinking, { label: 'Measuring Take 2 against Take 1' }) : null
  return jsxs('section', { className: 'ldw-take2', 'aria-label': 'Take 2 against Take 1', children: [
    jsx('h3', { className: 'ldw-take2-h', children: "Take 2, after the coach's example" }),
    jsx('ul', { className: 'ldw-take2-moves', children: out.moves.map(m => jsxs('li', { 'data-met': m.take2.met ? '' : undefined, children: [
      jsx('span', { className: 'ldw-met', children: m.take2.met ? 'Met' : 'Not met' }), jsx('b', { children: m.label }), jsx('span', { children: ` Take 2: ${m.take2.value}. Take 1: ${m.take1.value}.` })] }, m.id)) }),
    jsxs('table', { className: 'ldw-take2-t', children: [
      jsx('thead', { children: jsxs('tr', { children: [jsx('th', { scope: 'col', children: '' }), jsx('th', { scope: 'col', children: 'Take 1' }), jsx('th', { scope: 'col', children: 'Take 2' }), jsx('th', { scope: 'col', children: 'Change' })] }) }),
      jsx('tbody', { children: out.rows.map(r => jsxs('tr', { 'data-change': r.change, children: [
        jsx('th', { scope: 'row', children: r.label }), jsx('td', { children: cell(r.key, r.take1) }), jsx('td', { children: cell(r.key, r.take2) }), jsx('td', { children: CHANGE[r.change] || r.change })] }, r.key)) }),
    ] }),
  ] })
}

export const COACH_CSS = `
.ldw-showme-row{display:flex;align-items:center;gap:10px 16px;flex-wrap:wrap;max-width:760px;margin:14px 0 4px}
.ldw-showme-row .ldw-showme{font-size:15px;font-weight:650;padding:0 18px;min-height:40px}
.ldw-stages{display:inline-flex;align-items:center;gap:8px;font-size:14px}
.ldw-stages-t{font-variant-numeric:tabular-nums}
.ldw-cmp{max-width:1040px;display:grid;gap:12px;margin:14px 0 6px;min-width:0}
.ldw-cmp-cols{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:0;border-top:2px solid currentColor}
.ldw-cmp-col{min-width:0;padding:12px 22px 14px 0}
.ldw-cmp-coach{padding:12px 0 14px 22px;border-left:1px solid var(--hk-stroke)}
.ldw-cmp-cols .ldw-cmp-coach{border-left:1.5px dashed var(--hk-stroke-strong)}
.ldw-tabs2 .ldw-cmp-col,.ldw-tabs2 .ldw-cmp-coach{padding:10px 0;border-left:0}.ldw-tabs2 .ldw-cmp-h{display:none}
.ldw-cmp-h{margin:0 0 8px;font-family:var(--ldw-cond);font-weight:700;font-size:16px;text-transform:uppercase;letter-spacing:.05em}
.ldw-cmp-lines{list-style:none;margin:0;padding:0;display:grid;gap:5px}
.ldw-cmp-lines li{display:grid;grid-template-columns:22px minmax(0,1fr);gap:6px;align-items:baseline;border-radius:var(--ldw-r);transition:background 120ms}
.ldw-cmp-lines li[data-lit]{background:color-mix(in srgb,var(--hk-accent) 14%,transparent)}
.ldw-cmp-n{font-family:var(--hk-mono);font-size:12px;text-align:right}
.ldw-cmp .ldw-spoken{font-family:var(--ldw-serif);font-size:16px;line-height:1.55}
.ldw-cmp-said{display:grid;gap:5px}
.ldw-cmp-s{margin:0}
.ldw-cmp-from{font-family:var(--hk-mono);font-size:12px;white-space:nowrap;border-bottom:1px dotted currentColor}
.ldw-cmp-from[data-new]{border-bottom:0;font-style:italic}
.ldw-cmp-actions{display:flex;align-items:center;gap:10px 18px;flex-wrap:wrap;padding-top:10px;border-top:1px solid var(--hk-stroke)}
.ldw-cmp-hide{margin-left:auto}
.ldw-hearit{display:inline-flex;align-items:center;gap:10px}
.ldw-cmp-details{margin:0;padding-left:18px;font-size:13.5px;line-height:1.5;display:grid;gap:3px}
.ldw-cmp-why{display:grid;gap:4px;max-width:760px}
.ldw-half{display:block}.ldw-half+.ldw-half{margin-top:1px}
.ldw-moves{margin:0;padding-left:18px;display:grid;gap:3px;font-size:14.5px}
.ldw-take2{max-width:760px;display:grid;gap:10px;margin:0 0 14px}
.ldw-take2-h{margin:0;font-size:17px;font-weight:700}
.ldw-take2-t{border-collapse:collapse;width:100%;font-size:14.5px;font-variant-numeric:tabular-nums}
.ldw-take2-t th,.ldw-take2-t td{text-align:left;padding:6px 10px 6px 0;border-bottom:1px solid var(--hk-stroke)}
.ldw-take2-t thead th{font-family:var(--ldw-cond);font-weight:700;text-transform:uppercase;letter-spacing:.05em;font-size:13px;border-bottom:2px solid currentColor}
.ldw-take2-t tr[data-change="better"] td:last-child{color:var(--hk-good,inherit);font-weight:700}
.ldw-take2-moves{list-style:none;margin:0;padding:0;display:grid;gap:5px;font-size:14.5px}
.ldw-met{display:inline-block;min-width:64px;font-family:var(--hk-mono);font-size:12px;font-weight:800;letter-spacing:.06em;text-transform:uppercase}
.ldw-take2-moves li[data-met] .ldw-met{color:var(--hk-good,inherit)}
`

/* ------------------------------------------------------------------ ballots: show me -- */

// Under a ballot's drill: the weakest moment, what went wrong there, and a modeled redo of it.
export function ShowMe({ b }) {
  const on = useValue($coachOn)
  const c = useCoachCall()
  useEffect(() => { c.reset() }, [b && b.at]) // another judge's ballot: a fresh Show me
  if (!on || !b || !b.at) return null
  const o = c.out
  if (!o) {
    return jsxs('div', { className: 'ldw-coachask ldw-coachask-row', children: [
      jsx(Button, { size: 'sm', variant: 'secondary', loading: c.busy, onClick: () => c.call('coach/ballot/show', { at: b.at }),
        children: jsxs(Fragment, { children: [jsx(Codicon, { name: 'lightbulb' }), 'Show me'] }) }),
      jsx('span', { className: 'ldw-meta', children: b.show_me ? 'The coach redid the weakest moment. Open it again.' : 'The coach finds the weakest moment and redoes it.' }),
      c.err ? jsx(Notice, { tone: 'bad', children: c.err }) : null,
    ] })
  }
  return jsxs(CoachBox, { label: "Coach's redo", sub: 'The weakest moment, done again. Practice it, then do it your way.', checks: o.checks,
    against: b.answered ? 'your file' : 'your round', onClose: c.reset, children: [
      jsxs('div', { className: 'ldw-redo-row', children: [jsx('span', { className: 'ldw-redo-k', children: 'You said' }),
        jsxs('div', { children: [jsx('p', { className: 'ldw-spoken', children: `"${o.moment}"` }),
          o.moment_checked === false ? jsx('span', { className: 'ldw-line-flag', children: 'Not found in your words as kept. The coach may have misquoted you.' }) : null] })] }),
      o.why ? jsxs('div', { className: 'ldw-redo-row', children: [jsx('span', { className: 'ldw-redo-k', children: 'Why it cost you' }), jsx('p', { children: inlineChecked(o.why, COACH_FLAG) })] }) : null,
      jsxs('div', { className: 'ldw-redo-row', children: [jsx('span', { className: 'ldw-redo-k', children: 'Done again' }), jsx('p', { className: 'ldw-spoken', children: inlineChecked(o.redo, COACH_FLAG) })] }),
      o.practice ? jsxs('div', { className: 'ldw-redo-row', children: [jsx('span', { className: 'ldw-redo-k', children: 'Practice' }), jsx('p', { children: inlineChecked(o.practice, COACH_FLAG) })] }) : null,
    ] })
}

/* ------------------------------------------------------------------ the chat -- */

function seesLine(ctx) {
  const sees = ((ctx && ctx.sees) || []).filter(Boolean)
  if (!sees.length) return 'The coach sees what is on this screen.'
  return `The coach sees ${sees.length === 1 ? sees[0] : `${sees.slice(0, -1).join(', ')} and ${sees[sees.length - 1]}`}.`
}

// The drawer beside the floor. One thread per floor, kept while Debate is open.
export function CoachChat({ floor }) {
  const open = useValue($chatOpen)
  const raw = useValue($coachCtx)
  const on = useValue($coachOn)
  const threads = useValue($threads)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const box = useRef(null)
  const ctx = raw && raw.floor === floor ? raw : { floor }
  const thread = threads[floor] || []
  useEffect(() => { if (box.current) box.current.scrollTop = box.current.scrollHeight }, [thread.length, busy, open])
  useEffect(() => { const el = open && document.getElementById('ldw-coach-ask'); if (el) el.focus() }, [open, floor])
  if (!open) return null
  const send = async () => {
    const t = text.trim()
    if (!t || busy) return
    setText(''); setErr(null); setBusy(true)
    const before = thread
    $threads.set({ ...$threads.get(), [floor]: [...before, { role: 'you', text: t }] })
    try {
      const { sees, ...ids } = ctx
      const out = await post('coach/chat', { ...ids, floor, message: t, thread: before.map(m => ({ role: m.role, text: m.text })) })
      $threads.set({ ...$threads.get(), [floor]: [...before, { role: 'you', text: t }, { role: 'coach', text: out.text, checks: out.checks }] })
    } catch (e) {
      setErr(errText(e))
      $threads.set({ ...$threads.get(), [floor]: before })
      setText(t)
    } finally { setBusy(false) }
  }
  return jsxs('aside', { className: 'ldw-chat ldw-noprint', 'aria-label': 'Ask the coach', children: [
    jsxs('div', { className: 'ldw-chat-head', children: [
      jsx('h2', { className: 'ldw-h2', children: 'Ask the coach' }),
      jsx('button', { type: 'button', className: 'ldw-iconbtn', 'aria-label': 'Close the coach', onClick: () => $chatOpen.set(false), children: jsx(Codicon, { name: 'close' }) }),
    ] }),
    jsx('p', { className: 'ldw-chat-sees', children: seesLine(ctx) }),
    jsxs('div', { className: 'ldw-chat-thread', ref: box, 'aria-live': 'polite', children: [
      !thread.length && !busy ? jsx('p', { className: 'ldw-meta', children: EMPTY[floor] || 'Ask anything about this screen.' }) : null,
      ...thread.map((m, i) => jsxs('div', { className: 'ldw-msg', 'data-role': m.role, children: [
        jsx('span', { className: 'ldw-who', children: m.role === 'coach' ? 'Coach' : 'You' }),
        m.role === 'coach' ? renderChecked(m.text, COACH_FLAG) : jsx('p', { children: m.text }),
      ] }, i)),
      busy ? jsx(Thinking, { label: 'The coach is reading your screen' }) : null,
      err ? jsx(Notice, { tone: 'bad', children: err }) : null,
    ] }),
    jsxs('div', { className: 'ldw-ask', children: [
      jsx(Textarea, { id: 'ldw-coach-ask', 'aria-label': 'Question for the coach', value: text, placeholder: 'Ask the coach', onChange: e => setText(e.target.value),
        onKeyDown: e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } } }),
      jsx(Button, { onClick: send, disabled: busy || !text.trim(), 'aria-label': 'Send', children: jsx(Codicon, { name: 'send' }) }),
    ] }),
    jsx('p', { className: 'ldw-chat-foot', children: on
      ? "After you try something yourself, the coach can show an example. It is marked as the coach's."
      : 'Coach examples are off in Settings. The coach explains and asks; it writes nothing for you to say.' }),
  ] })
}

// The rail's door to the chat.
export function ChatButton({ onOpen }) {
  const open = useValue($chatOpen)
  return jsxs('button', { type: 'button', className: 'ldw-ev ldw-ev-coach', 'aria-expanded': open, onClick: () => (onOpen ? onOpen() : $chatOpen.set(!open)), children: [
    jsxs('b', { children: [jsx(Codicon, { name: 'comment-discussion' }), 'Coach'] }), jsx('span', { children: 'Ask about this screen' }),
  ] })
}

/* ------------------------------------------------------------------ extemp prep: areas and evidence -- */

const STANCE_WORD = { supports: 'Supports your point', against: 'Cuts against it', context: 'Background' }

// In prep, beside the outline. Areas wait for the student's own answer; evidence comes only from their file.
export function PrepCoach({ outline, file, onUseArea, onPick, picked }) {
  const on = useValue($coachOn)
  const areas = useCoachCall()
  const ev = useCoachCall()
  const [point, setPoint] = useState('')
  if (!on) return null
  const noAnswer = !String(outline.answer || '').trim()
  const noFile = !file.length
  return jsxs('section', { className: 'ldw-prepcoach', 'aria-label': 'The coach in prep', children: [
    jsxs('div', { className: 'ldw-prepcoach-row', children: [
      jsx(Button, { variant: 'secondary', size: 'sm', loading: areas.busy, disabled: noAnswer || noFile, 'aria-describedby': noAnswer || noFile ? 'ldw-areas-why' : undefined,
        onClick: () => areas.call('coach/extemp/areas', { outline }), children: jsxs(Fragment, { children: [jsx(Codicon, { name: 'lightbulb' }), 'Suggest areas'] }) }),
      jsx('span', { id: 'ldw-areas-why', className: noAnswer || noFile ? 'ldw-why-off' : 'ldw-meta', children: noAnswer
        ? 'Write your answer first, in Your answer. The coach suggests three areas that back it.'
        : noFile ? 'Save a few sources to your file first. Each area comes with one of them.'
        : 'Three areas that back your answer, each with a source from your file.' }),
    ] }),
    areas.err ? jsx(Notice, { tone: 'bad', children: areas.err }) : null,
    areas.out ? jsxs(CoachBox, { label: "Coach's suggestion", sub: 'Areas for your outline. Keep, change or throw out each one.', checks: areas.out.checks, onClose: areas.reset,
      foot: areas.out.areas.every(a => a.source) ? 'Every source named is in your file.' : null, children: [
      areas.out.note ? jsx('p', { className: 'ldw-coachbox-kept', children: areas.out.note }) : null,
      jsx('ol', { className: 'ldw-areas', children: areas.out.areas.map((a, i) => jsxs('li', { children: [
        jsx('b', { children: a.title }),
        a.why ? jsx('p', { children: inlineChecked(a.why, COACH_FLAG) }) : null,
        a.source ? jsxs('p', { className: 'ldw-areas-src', children: [jsx('span', { className: 'ldw-areas-cite', children: a.source.citation }), ` "${a.source.title}"`] })
          : jsx('span', { className: 'ldw-line-flag', children: 'No source in your file was cited for this one. Find one before you use it.' }),
        a.use ? jsx('p', { children: inlineChecked(a.use, COACH_FLAG) }) : null,
        jsxs('div', { className: 'hk-actions', children: [
          jsx('button', { type: 'button', className: 'hk-link', onClick: () => onUseArea(i, a.title), children: `Put it in Area ${i + 1}` }),
          a.source && !picked.includes(a.source.id) ? jsx('button', { type: 'button', className: 'hk-link', onClick: () => onPick(a.source.id), children: 'Pick this source' }) : null,
        ] }),
      ] }, i)) }),
    ] }) : null,
    jsxs('div', { className: 'ldw-prepcoach-row', children: [
      jsx(Input, { className: 'ldw-topic', 'aria-label': 'The point you need evidence for', value: point, placeholder: 'A point you need evidence for, like "hiring is still strong"',
        onChange: e => setPoint(e.target.value), onKeyDown: e => { if (e.key === 'Enter' && point.trim() && !noFile) ev.call('coach/extemp/evidence', { point }) } }),
      jsx(Button, { variant: 'secondary', size: 'sm', loading: ev.busy, disabled: !point.trim() || noFile, onClick: () => ev.call('coach/extemp/evidence', { point }),
        children: jsxs(Fragment, { children: [jsx(Codicon, { name: 'search' }), 'Find me evidence'] }) }),
    ] }),
    ev.err ? jsx(Notice, { tone: 'bad', children: ev.err }) : null,
    ev.out ? jsxs(CoachBox, { label: ev.out.fallback ? 'From your file' : "Coach's picks", sub: 'From your saved headlines only.', onClose: ev.reset,
      foot: ev.out.picks.length ? `Every pick is a source in your file${ev.out.dropped ? `; ${ev.out.dropped} that ${ev.out.dropped === 1 ? 'was' : 'were'} not ${ev.out.dropped === 1 ? 'was' : 'were'} left out.` : '.'}` : null,
      checks: ev.out.fallback || !ev.out.checks || !((ev.out.checks.quotes || 0) + (ev.out.checks.not_in_file || 0) + (ev.out.checks.numbers_missed || 0) + (ev.out.checks.outlets_missed || 0)) ? null : ev.out.checks, children: [
      ev.out.notice ? jsx(Notice, { tone: 'warn', children: ev.out.notice }) : null,
      ev.out.picks.length ? jsx('ul', { className: 'ldw-areas ldw-picks', children: ev.out.picks.map(p => jsxs('li', { children: [
        jsxs('p', { className: 'ldw-areas-src', children: [jsx('span', { className: 'ldw-areas-cite', children: p.source.citation }), ` "${p.source.title}"`] }),
        p.stance || p.how ? jsxs('p', { children: [p.stance ? jsx('b', { children: `${STANCE_WORD[p.stance]}. ` }) : null, inlineChecked(p.how, COACH_FLAG)] }) : null,
        picked.includes(p.source.id) ? jsx('span', { className: 'ldw-meta', children: 'Picked for this speech' })
          : jsx('button', { type: 'button', className: 'hk-link', onClick: () => onPick(p.source.id), children: 'Pick this source' }),
      ] }, p.source.id)) }) : jsx('p', { className: 'ldw-meta', children: ev.out.missing || 'Nothing in your file fits that point.' }),
    ] }) : null,
  ] })
}

/* ------------------------------------------------------------------ rhetoric: three versions -- */

export function ThreeVersions({ figure, line, figureName }) {
  const on = useValue($coachOn)
  const c = useCoachCall()
  useEffect(() => { c.reset() }, [figure, line])
  if (!on) return null
  if (!c.out) {
    return jsxs('div', { className: 'ldw-coachask', children: [
      jsx(Button, { variant: 'secondary', loading: c.busy, onClick: () => c.call('coach/rhetoric/versions', { figure, line }),
        children: jsxs(Fragment, { children: [jsx(Codicon, { name: 'lightbulb' }), 'Show me three versions'] }) }),
      jsx('span', { className: 'ldw-meta', children: `Your line, three ways, each using ${figureName.toLowerCase()}. Then write a fourth of your own.` }),
      c.err ? jsx(Notice, { tone: 'bad', children: c.err }) : null,
    ] })
  }
  return jsx(CoachBox, { label: "Coach's versions", sub: `Your line with ${figureName.toLowerCase()}, three ways. Now write your own fourth.`, checks: c.out.checks, against: 'your line', onClose: c.reset,
    children: jsx('ol', { className: 'ldw-versions', children: c.out.versions.map((v, i) => jsxs('li', { children: [
      jsx('p', { className: 'ldw-spoken', children: inlineChecked(v.line, COACH_FLAG) }), v.note ? jsx('p', { className: 'ldw-meta', children: v.note }) : null] }, i)) }) })
}

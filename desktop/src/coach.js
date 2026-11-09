// The coach's examples and suggestions, and the coach chat on every floor. The student tries first; then the
// coach can show and suggest. Everything the coach writes sits in its own box, labeled as the coach's, with
// the code's check of every citation, quote and figure under it. A teacher can turn examples off (Settings,
// Coach examples); then no example button shows and the chat only explains and asks.

import { useEffect, useRef, useState } from 'react'
import { Fragment, jsx, jsxs } from 'react/jsx-runtime'
import { Button, Codicon, Input, Textarea, atom, useValue } from '@hermes/plugin-sdk'
import { Notice } from 'hermes-ui-kit'
import { Thinking, cls, errText, inlineChecked, post, renderChecked } from './core.js'

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
  return { busy, err, out, setOut, call, reset: () => { setOut(null); setErr(null) } }
}

/* ------------------------------------------------------------------ extemp: a strong one -- */

// After the student's own answer or openings: the coach's version on the same question, and why it works.
export function StrongExample({ kind, question, takeIds, best, onAgain }) {
  const on = useValue($coachOn)
  const c = useCoachCall()
  const key = (takeIds || []).join(',')
  useEffect(() => { c.reset() }, [key, question])
  if (!on) return null
  const what = kind === 'opening' ? 'opening' : 'answer'
  const ask = () => c.call('coach/extemp/example', kind === 'opening' ? { kind, question, take_ids: takeIds, best } : { kind, question, take_id: takeIds[0] })
  if (!c.out) {
    return jsxs('div', { className: 'ldw-coachask', children: [
      jsx(Button, { variant: 'secondary', loading: c.busy, onClick: ask, children: jsxs(Fragment, { children: [jsx(Codicon, { name: 'lightbulb' }), `Show me a strong ${what}`] }) }),
      jsx('span', { className: 'ldw-meta', children: `The coach gives a ${kind === 'opening' ? '45-second opening' : '60-second answer'} on your question, built on yours, and says why it works.` }),
      c.busy ? jsx(Thinking, { label: `Writing a strong ${what}` }) : null,
      c.err ? jsx(Notice, { tone: 'bad', children: c.err }) : null,
    ] })
  }
  const o = c.out
  return jsxs(CoachBox, { label: "Coach's example", sub: `A strong ${what} on your question. Learn the moves, then say it your own way.`, checks: o.checks, onClose: c.reset, children: [
    jsx('p', { className: 'ldw-spoken ldw-coachbox-said', children: inlineChecked(o.example, COACH_FLAG) }),
    o.notes && o.notes.length ? jsxs(Fragment, { children: [
      jsx('h4', { className: 'ldw-coachbox-h', children: 'Why it works' }),
      jsx('ul', { className: 'ldw-coachbox-notes', children: o.notes.map((n, i) => jsx('li', { children: inlineChecked(n, COACH_FLAG) }, i)) }),
    ] }) : null,
    o.kept ? jsxs('p', { className: 'ldw-coachbox-kept', children: [jsx('b', { children: 'Kept from yours: ' }), o.kept] }) : null,
    !o.sources ? jsx('p', { className: 'ldw-meta', children: 'Your file is empty, so the example names no source. Save headlines in Full round and the coach can cite them.' }) : null,
    onAgain ? jsx('div', { children: jsx(Button, { size: 'sm', variant: 'secondary', onClick: onAgain, children: `Now give your own ${what} again` }) }) : null,
  ] })
}

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

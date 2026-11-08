// Extemp: the 60-second answer (the floor that opens first) and the full round: headlines from both
// sides, the student's file, the draw, 30 minutes of prep with the outline, the 7-minute speech, the ballot.

import { useEffect, useRef, useState } from 'react'
import { Fragment, jsx, jsxs } from 'react/jsx-runtime'
import { Button, Codicon, Input, SegmentedControl, Textarea, atom, useValue } from '@hermes/plugin-sdk'
import { Notice } from 'hermes-ui-kit'
import { Thinking, api, cls, errText, mmss, post, rest } from './core.js'
import { Clock, ExtempSheet, LastTake, LiveWave, SpeakControls, Strip, sendTake, takeSettled, useRecorder, useTakePoll } from './floor.js'

export const $home = atom(null)
export const $extempMode = atom(null) // drill | round (null: decide from the saved round)
const AREAS = { us: 'United States', international: 'International' }
const DRILL = 60
const PREP = 30 * 60
const SPEECH = 7 * 60

export async function loadHome() {
  try { $home.set(await rest('home')) } catch (e) { /* the frame shows its own load error */ }
}

function dateOf(t) {
  if (!t) return ''
  return new Date(t * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
function openLink(url) {
  if (api && api.os && typeof api.os.openExternal === 'function') api.os.openExternal(url)
}

/* ------------------------------------------------------------------ the take, judged -- */

// Record or type a take, wait for the transcript, then ask for the ballot. Shared by the drill and the round.
function useJudgedTake({ event, limit, question, outline, initial, onBallot }) {
  const [take, setTake] = useState(initial || null)
  const [ballot, setBallot] = useState(null)
  const [busy, setBusy] = useState(null) // sending | judging
  const [err, setErr] = useState(null)
  useTakePoll(take, setTake)
  const judge = async t => {
    setBusy('judging'); setErr(null)
    try {
      const b = await post(`speech/${t.id}/judge`, { question, outline })
      setBallot(b); if (onBallot) onBallot(b, t)
    } catch (e) { setErr(errText(e)) } finally { setBusy(null) }
  }
  const asked = useRef(null)
  useEffect(() => { // the ballot follows the words: a finished transcript or typed words
    if (take && takeSettled(take) && !ballot && asked.current !== take.id && ['done', 'typed'].includes(take.transcript.status) && take.transcript.text) {
      asked.current = take.id; judge(take)
    }
  }, [take && take.id, take && take.transcript.status, take && take.transcript.text])
  const got = async rec => {
    setBusy('sending'); setErr(null); setBallot(null)
    try { setTake(await sendTake({ event, segment: event === 'drill' ? 'answer' : 'speak', limit, prompt: question, answer: (outline || {}).answer || '' }, rec)) } catch (e) { setErr(errText(e)) } finally { setBusy(b => (b === 'sending' ? null : b)) }
  }
  const recorder = useRecorder({ limit, onTake: got })
  return { take, setTake, ballot, setBallot, busy, err, recorder, got, judge, reset: () => { setTake(null); setBallot(null); setErr(null) } }
}

function Floor({ limit, label, jt, startLabel, extra }) {
  const live = jt.recorder.state === 'live' || jt.recorder.state === 'armed'
  return jsxs(Fragment, { children: [
    !jt.ballot ? jsxs('div', { className: 'ldw-stage2', children: [
      jsx(Clock, { limit, elapsed: jt.recorder.elapsed, live, label }),
      jsx(SpeakControls, { rec: jt.recorder, onTyped: text => jt.got({ typed: text }), startLabel, extra }),
    ] }) : null,
    live ? jsx(LiveWave, { rec: jt.recorder, limit }) : null,
    jt.busy === 'sending' ? jsx(Thinking, { label: 'Saving your take' }) : null,
    jt.err ? jsx(Notice, { tone: 'bad', children: jt.err, action: jt.take && !jt.ballot ? jsx(Button, { size: 'sm', variant: 'secondary', onClick: () => jt.judge(jt.take), children: 'Ask for the ballot again' }) : null }) : null,
    jt.take && !live ? jsx(LastTake, { take: jt.take, limit, title: jt.ballot ? 'Your take' : 'Your take, just now', onChange: jt.setTake }) : null,
    jt.busy === 'judging' ? jsx(Thinking, { label: 'The judge is writing the ballot' }) : null,
  ] })
}

/* ------------------------------------------------------------------ the 60-second answer -- */

function Slip({ kicker, question, side, onAnother }) {
  return jsxs('div', { className: 'ldw-slip', children: [
    jsxs('div', { children: [
      jsx('div', { className: 'ldw-kicker', children: kicker }),
      jsx('h2', { className: 'ldw-question', children: question }),
      onAnother ? jsx('button', { type: 'button', className: 'hk-link', onClick: onAnother, children: 'Another question' }) : null,
    ] }),
    side ? jsx('div', { className: 'ldw-outline-side', children: side }) : null,
  ] })
}

function DrillFloor({ home, modeSwitch }) {
  const pool = (home.starter || []).concat()
  const [i, setI] = useState(0)
  const q = pool.length ? pool[i % pool.length] : { area: 'us', text: 'Should your town spend more on roads or on parks?' }
  const last = home.last_take && home.last_take.drill
  const jt = useJudgedTake({ event: 'drill', limit: DRILL, question: q.text, initial: last && last.prompt === q.text ? last : null })
  const live = jt.recorder.state === 'live' || jt.recorder.state === 'armed'
  const another = () => { if (!live) { jt.reset(); setI(n => n + 1) } }
  const phase = jt.ballot ? 'ballot' : live ? 'live' : jt.take ? 'taken' : 'ready'
  return jsxs(Fragment, { children: [
    jsx(Strip, { segments: [
      { key: 'answer', code: 'Answer 1:00', sub: phase === 'live' ? 'Now' : phase === 'ready' ? 'Lead with your answer' : 'Done', minutes: 1, min: 220,
        state: phase === 'ballot' ? 'done' : 'now', fill: live ? jt.recorder.elapsed / DRILL : 0 },
      { key: 'ballot', code: 'Ballot', sub: jt.busy === 'judging' ? 'Writing' : jt.ballot ? `${jt.ballot.points ?? ''} points` : '', minutes: 0.45, min: 120, state: phase === 'ballot' ? 'now' : 'later' },
    ] }),
    jsx(Slip, { kicker: [`60-second answer · ${AREAS[q.area] || 'United States'}`, modeSwitch], question: q.text, onAnother: live ? null : another }),
    jt.ballot ? jsx(ExtempSheet, { b: jt.ballot, drillLabel: 'Try it again', onDrill: () => jt.reset() }) : null,
    jsx(Floor, { limit: DRILL, label: null, jt, startLabel: 'Start speaking' }),
    !jt.take && !live && home.next_drill ? jsxs('div', { className: 'ldw-upnext', children: [
      jsx('span', { className: 'ldw-stamp2 ldw-stamp-sm', children: 'Drill' }),
      jsxs('p', { children: [jsx('strong', { children: home.next_drill.name }), `. ${home.next_drill.how}`] }),
      jsx('span', { className: 'ldw-meta', children: 'From your last ballot' }),
    ] }) : null,
  ] })
}

/* ------------------------------------------------------------------ headlines -- */

const SIDE_TITLES = { left: 'Left and lean left', center: 'Center and wires', right: 'Right and lean right' }

function HeadlineColumns({ pull, saved, onSave }) {
  const outlets = Object.fromEntries((pull.outlets || []).map(o => [o.id, o]))
  return jsxs('section', { className: 'ldw-heads', 'aria-label': `Headlines on ${pull.topic}`, children: [
    pull.notice ? jsx(Notice, { tone: 'warn', children: pull.notice }) : null,
    jsx('div', { className: 'ldw-heads-grid', children: ['left', 'center', 'right'].map(side => jsxs('div', { className: 'ldw-heads-side', children: [
      jsx('h3', { className: 'ldw-heads-title', children: SIDE_TITLES[side] }),
      ...pull.columns.filter(c => (outlets[c.id] || {}).side === side).map(c => {
        const o = outlets[c.id]
        return jsxs('div', { className: 'ldw-outlet', children: [
          jsxs('div', { className: 'ldw-outlet-head', children: [jsx('b', { children: o.name }), jsx('span', { className: 'ldw-lean', title: o.note || undefined, children: o.lean })] }),
          !c.ok ? jsx('p', { className: 'ldw-outlet-err', children: c.error }) : !c.items.length ? jsx('p', { className: 'ldw-meta', children: 'Nothing on this topic in the last 30 days.' }) : null,
          ...c.items.map((h, k) => jsxs('div', { className: 'ldw-head', children: [
            jsx('button', { type: 'button', className: 'ldw-head-link', onClick: () => openLink(h.url), title: 'Open in your browser', children: h.title }),
            jsxs('div', { className: 'ldw-head-meta', children: [jsx('span', { children: dateOf(h.at) }),
              saved.has(h.url) ? jsx('span', { className: 'ldw-saved', children: 'In your file' })
                : jsx('button', { type: 'button', className: 'hk-link', onClick: () => onSave(h, o), children: 'Save to file' })] }),
          ] }, k)),
        ] }, c.id)
      }),
    ] }, side)) }),
    jsx('p', { className: 'ldw-meta', children: `Lean labels: AllSides, checked ${pull.labels_checked}. Headlines and links only; articles open in your browser.` }),
  ] })
}

function OutletEditor({ onClose }) {
  const [data, setData] = useState(null)
  const [rows, setRows] = useState([])
  const [err, setErr] = useState(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => { rest('outlets').then(d => { setData(d); setRows(d.outlets) }, e => setErr(errText(e))) }, [])
  if (!data) return err ? jsx(Notice, { tone: 'bad', children: err }) : jsx(Thinking, { label: 'Loading your outlets' })
  const set = (i, k, v) => setRows(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)))
  const save = async body => { setBusy(true); setErr(null); try { const d = await post('outlets', body); setRows(d.outlets); setData({ ...data, ...d }); onClose(d) } catch (e) { setErr(errText(e)) } finally { setBusy(false) } }
  const counts = { left: 0, center: 0, right: 0 }
  rows.forEach(r => { counts[r.side] = (counts[r.side] || 0) + 1 })
  return jsxs('section', { className: 'ldw-panel', 'aria-label': 'Your outlets', children: [
    jsx('h3', { className: 'ldw-h2', children: 'Your outlets' }),
    jsx('p', { className: 'ldw-meta', children: `${counts.left} left, ${counts.center} center, ${counts.right} right. Lean labels: AllSides, checked ${data.labels_checked}. Change any label you disagree with.` }),
    jsx('table', { className: 'ldw-outlet-table', children: jsx('tbody', { children: rows.map((r, i) => jsxs('tr', { children: [
      jsx('td', { children: jsx(Input, { 'aria-label': 'Outlet name', value: r.name, onChange: e => set(i, 'name', e.target.value) }) }),
      jsx('td', { children: jsx(Input, { 'aria-label': 'Web address', value: r.domain, onChange: e => set(i, 'domain', e.target.value) }) }),
      jsx('td', { children: jsx('select', { className: 'ldw-select', 'aria-label': 'Side', value: r.side, onChange: e => set(i, 'side', e.target.value),
        children: data.sides.map(s => jsx('option', { value: s, children: SIDE_TITLES[s] }, s)) }) }),
      jsx('td', { children: jsx('select', { className: 'ldw-select', 'aria-label': 'Lean label', value: r.lean, onChange: e => set(i, 'lean', e.target.value),
        children: data.leans.map(s => jsx('option', { value: s, children: s }, s)) }) }),
      jsx('td', { children: jsx('button', { type: 'button', className: 'hk-link', 'aria-label': `Remove ${r.name}`, onClick: () => setRows(rows.filter((_, j) => j !== i)), children: 'Remove' }) }),
    ] }, i)) }) }),
    jsxs('div', { className: 'hk-row', children: [
      jsx('span', { className: 'ldw-meta', children: 'Add:' }),
      ...data.suggested.filter(s => !rows.some(r => r.domain === s.domain)).map(s => jsx('button', { type: 'button', className: 'ldw-chip', onClick: () => setRows([...rows, s]), children: `${s.name} (${s.lean})` }, s.domain)),
      jsx('button', { type: 'button', className: 'ldw-chip', onClick: () => setRows([...rows, { name: '', domain: '', side: 'center', lean: 'Center', feed: '' }]), children: 'Another outlet' }),
    ] }),
    err ? jsx(Notice, { tone: 'bad', children: err }) : null,
    jsxs('div', { className: 'hk-actions', children: [
      jsx(Button, { size: 'sm', loading: busy, onClick: () => save({ outlets: rows }), children: 'Save outlets' }),
      jsx(Button, { size: 'sm', variant: 'secondary', onClick: () => save({ reset: true }), children: 'Back to the defaults' }),
      jsx(Button, { size: 'sm', variant: 'secondary', onClick: () => onClose(null), children: 'Cancel' }),
    ] }),
  ] })
}

/* ------------------------------------------------------------------ the full round -- */

function DrawStage({ home, modeSwitch, onStart }) {
  const [topic, setTopic] = useState('')
  const [pull, setPull] = useState(null)
  const [busy, setBusy] = useState(null)
  const [err, setErr] = useState(null)
  const [saved, setSaved] = useState(new Set())
  const [area, setArea] = useState('us')
  const [drawn, setDrawn] = useState(null)
  const [own, setOwn] = useState('')
  const [editing, setEditing] = useState(false)
  const [fileCount, setFileCount] = useState(home.file_count || 0)
  const doPull = async () => {
    setBusy('pull'); setErr(null)
    try { setPull(await post('headlines/pull', { topic })) } catch (e) { setErr(errText(e)) } finally { setBusy(null) }
  }
  const save = async (h, o) => {
    try {
      await post('extemp/file', { title: h.title, url: h.url, at: h.at, outlet: o.name, lean: o.lean, topics: [pull.topic], area })
      setSaved(new Set([...saved, h.url])); setFileCount(n => n + 1)
    } catch (e) { setErr(errText(e)) }
  }
  const draw = async () => {
    setBusy('draw'); setErr(null); setDrawn(null)
    try { setDrawn(await post('extemp/draw', { area, topic: pull ? pull.topic : '' })) } catch (e) { setErr(errText(e)) } finally { setBusy(null) }
  }
  const start = async text => {
    setBusy('start'); setErr(null)
    try { onStart(await post('extemp/round/start', { question: text, area, mode: 'files' })) } catch (e) { setErr(errText(e)); setBusy(null) }
  }
  return jsxs(Fragment, { children: [
    jsx(Strip, { segments: [
      { key: 'draw', code: 'Draw', sub: drawn ? 'Pick one' : '3 questions', minutes: 3, min: 120, state: 'now' },
      { key: 'prep', code: 'Prep 30:00', sub: 'Outline and sources', minutes: 30, state: 'later' },
      { key: 'speak', code: 'Speak 7:00', minutes: 7, state: 'later' },
      { key: 'ballot', code: 'Ballot', minutes: 2.4, min: 90, state: 'later' },
    ] }),
    jsxs('div', { className: 'ldw-slip', children: [jsxs('div', { children: [
      jsx('div', { className: 'ldw-kicker', children: ['Extemp · the draw', modeSwitch] }),
      jsx('h2', { className: 'ldw-question', children: 'What is in the news that you could speak on for seven minutes?' }),
    ] })] }),
    jsxs('div', { className: 'ldw-pullrow', children: [
      jsx(Input, { className: 'ldw-topic', 'aria-label': 'Topic', value: topic, placeholder: 'A topic, like tariffs or the Federal Reserve', onChange: e => setTopic(e.target.value),
        onKeyDown: e => { if (e.key === 'Enter' && topic.trim()) doPull() } }),
      jsx(Button, { loading: busy === 'pull', disabled: !topic.trim(), onClick: doPull, children: jsxs(Fragment, { children: [jsx(Codicon, { name: 'globe' }), 'Pull headlines'] }) }),
      jsx('button', { type: 'button', className: 'hk-link', onClick: () => setEditing(v => !v), children: 'Your outlets' }),
    ] }),
    editing ? jsx(OutletEditor, { onClose: () => setEditing(false) }) : null,
    busy === 'pull' ? jsx(Thinking, { label: 'Asking every outlet at once' }) : null,
    pull ? jsx(HeadlineColumns, { pull, saved, onSave: save }) : null,
    jsxs('div', { className: 'ldw-drawrow', children: [
      jsx('span', { className: 'ldw-meta', children: `${fileCount} saved in your file` }),
      jsx(SegmentedControl, { value: area, onChange: setArea, options: [{ id: 'us', label: 'United States' }, { id: 'international', label: 'International' }] }),
      jsx(Button, { loading: busy === 'draw', disabled: !fileCount && !pull, onClick: draw, children: 'Draw three questions' }),
    ] }),
    err ? jsx(Notice, { tone: 'bad', children: err }) : null,
    drawn && drawn.questions.length ? jsx('ol', { className: 'ldw-drawn', children: drawn.questions.map((q, k) => jsx('li', { children: jsxs('button', { type: 'button', className: 'ldw-drawn-q', disabled: busy === 'start', onClick: () => start(q.text), children: [
      jsx('span', { className: 'ldw-kicker', children: `Question ${k + 1} of 3` }), jsx('span', { className: 'ldw-question-sm', children: q.text })] }) }, k)) }) : null,
    drawn && drawn.fallback ? jsxs('section', { className: 'ldw-panel', children: [
      jsx(Notice, { tone: 'warn', children: `${drawn.notice} Write your own question from these headlines.` }),
      jsx('ul', { className: 'ldw-list', children: drawn.headlines.map((h, k) => jsx('li', { children: h }, k)) }),
      jsxs('div', { className: 'hk-row', children: [
        jsx(Input, { className: 'hk-grow', 'aria-label': 'Your question', value: own, placeholder: 'Your question', onChange: e => setOwn(e.target.value) }),
        jsx(Button, { disabled: own.trim().length < 12, onClick: () => start(own), children: 'Prep this question' }),
      ] }),
    ] }) : null,
  ] })
}

const OUTLINE = [
  ['attention', 'Attention-getter'], ['link', 'Link to the question'], ['answer', 'Your answer'],
  ['area1', 'Area 1'], ['area2', 'Area 2'], ['area3', 'Area 3'], ['conclusion', 'Conclusion'],
]

function usePrepClock(round, onSave) {
  const [left, setLeft] = useState(round.prep_left)
  const [running, setRunning] = useState(round.phase === 'prep')
  const ref = useRef(left)
  ref.current = left
  useEffect(() => {
    if (!running) return undefined
    const id = setInterval(() => setLeft(v => Math.max(0, v - 1)), 1000)
    const save = setInterval(() => onSave(ref.current), 10000)
    return () => { clearInterval(id); clearInterval(save); onSave(ref.current) }
  }, [running])
  return { left, running, toggle: () => setRunning(v => !v) }
}

function PrepStage({ round, setRound, modeSwitch }) {
  const [outline, setOutline] = useState(round.outline)
  const [file, setFile] = useState([])
  const timer = useRef(null)
  const prep = usePrepClock(round, left => post('extemp/round', { prep_left: left }).catch(() => {}))
  useEffect(() => { rest('extemp/file').then(d => setFile(d.items), () => {}) }, [])
  const change = (k, v) => {
    const o = { ...outline, [k]: v }
    setOutline(o)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => post('extemp/round', { outline: o }).catch(() => {}), 700)
  }
  const toggleSource = id => change('sources', outline.sources.includes(id) ? outline.sources.filter(x => x !== id) : [...outline.sources, id])
  const toPodium = async () => {
    clearTimeout(timer.current)
    setRound(await post('extemp/round', { outline, phase: 'speak', prep_left: prep.left }))
  }
  const chosen = file.filter(i => outline.sources.includes(i.id))
  return jsxs(Fragment, { children: [
    jsx(Strip, { segments: [
      { key: 'draw', code: 'Draw', sub: AREAS[round.area], minutes: 3, min: 120, state: 'done' },
      { key: 'prep', code: `Prep ${mmss(prep.left)}`, sub: 'Now', minutes: 30, state: 'now', fill: 1 - prep.left / PREP },
      { key: 'speak', code: 'Speak 7:00', minutes: 7, state: 'later' },
      { key: 'ballot', code: 'Ballot', minutes: 2.4, min: 90, state: 'later' },
    ] }),
    jsx(Slip, { kicker: [`Prep · ${AREAS[round.area]} · files only`, modeSwitch], question: round.question }),
    jsxs('div', { className: 'ldw-prep', children: [
      jsx('div', { className: 'ldw-outline', children: OUTLINE.map(([k, label]) => jsxs('label', { className: 'ldw-ofield', children: [
        jsx('span', { children: label }),
        jsx(Textarea, { value: outline[k], 'aria-label': label, onChange: e => change(k, e.target.value), rows: k.startsWith('area') ? 3 : 2 }),
      ] }, k)) }),
      jsxs('aside', { className: 'ldw-prep-side', children: [
        jsxs('div', { className: 'ldw-prepclock', children: [jsx('span', { className: 'ldw-num', children: mmss(prep.left) }),
          jsx('button', { type: 'button', className: 'hk-link', onClick: prep.toggle, children: prep.running ? 'Pause prep' : 'Resume prep' })] }),
        jsx('h3', { className: 'ldw-h3', children: `Sources from your file · ${chosen.length} picked` }),
        file.length ? jsx('ul', { className: 'ldw-srcs', children: file.slice(0, 40).map(i => jsx('li', { children: jsxs('label', { children: [
          jsx('input', { type: 'checkbox', checked: outline.sources.includes(i.id), onChange: () => toggleSource(i.id) }),
          jsxs('span', { children: [jsx('b', { children: i.outlet || 'Saved link' }), ` · ${dateOf(i.at) || 'no date'} · ${i.title}`] }),
        ] }) }, i.id)) }) : jsx('p', { className: 'ldw-meta', children: 'Your file is empty. Pull headlines and save a few before your next round.' }),
        jsx(Button, { className: 'ldw-big', onClick: toPodium, children: 'Go to the podium' }),
      ] }),
    ] }),
  ] })
}

function SpeakStage({ round, setRound, modeSwitch, home }) {
  const last = home.last_take && home.last_take.extemp
  const jt = useJudgedTake({ event: 'extemp', limit: SPEECH, question: round.question, outline: round.outline,
    initial: last && round.take === last.id ? last : null,
    onBallot: b => setRound({ ...round, ballot: b, phase: 'ballot' }) })
  useEffect(() => { if (jt.take && round.take !== jt.take.id) post('extemp/round', { take: jt.take.id }).then(setRound, () => {}) }, [jt.take && jt.take.id])
  const live = jt.recorder.state === 'live' || jt.recorder.state === 'armed'
  const o = round.outline
  const side = o.answer || o.area1 ? jsxs(Fragment, { children: [
    o.answer ? jsxs('div', { children: ['Answer: ', jsx('b', { children: o.answer })] }) : null,
    ...['area1', 'area2', 'area3'].filter(k => o[k]).map((k, n) => jsx('div', { children: `${n + 1} · ${o[k].split('\n')[0].slice(0, 60)}` }, k)),
  ] }) : null
  return jsxs(Fragment, { children: [
    jsx(Strip, { segments: [
      { key: 'draw', code: 'Draw', sub: AREAS[round.area], minutes: 3, min: 120, state: 'done' },
      { key: 'prep', code: 'Prep 30:00', sub: `${round.outline.sources.length} sources picked`, minutes: 30, state: 'done' },
      { key: 'speak', code: 'Speak 7:00', sub: live ? 'Now' : jt.take ? 'Done' : 'Now', minutes: 7, state: jt.ballot ? 'done' : 'now', fill: live ? jt.recorder.elapsed / SPEECH : 0 },
      { key: 'ballot', code: 'Ballot', minutes: 2.4, min: 90, state: jt.ballot ? 'now' : 'later' },
    ] }),
    jsx(Slip, { kicker: [`Extemp · ${AREAS[round.area]}`, modeSwitch], question: round.question, side }),
    jt.ballot ? jsx(ExtempSheet, { b: jt.ballot, drillLabel: 'Speak it again', onDrill: () => jt.reset() }) : null,
    jsx(Floor, { limit: SPEECH, jt, startLabel: 'Start speaking' }),
  ] })
}

function RoundFloor({ home, modeSwitch }) {
  const [round, setRound] = useState(home.extemp_round)
  const end = async () => { await post('extemp/round/end'); setRound(null) }
  let body
  if (!round) body = jsx(DrawStage, { home, modeSwitch, onStart: setRound })
  else if (round.phase === 'prep') body = jsx(PrepStage, { round, setRound, modeSwitch })
  else body = jsx(SpeakStage, { round, setRound, modeSwitch, home })
  return jsxs(Fragment, { children: [
    body,
    round ? jsx('div', { className: 'ldw-row-end', children: jsx('button', { type: 'button', className: 'hk-link', onClick: end, children: round.phase === 'ballot' ? 'New round' : 'End this round' }) }) : null,
  ] })
}

export function ExtempView() {
  const home = useValue($home)
  const chosen = useValue($extempMode)
  if (!home) return jsx(Thinking, { label: 'Opening extemp' })
  const mode = chosen || (home.extemp_round ? 'round' : 'drill')
  const modeSwitch = jsx(SegmentedControl, { key: 'mode', value: mode, onChange: v => $extempMode.set(v),
    options: [{ id: 'drill', label: '60-second answer' }, { id: 'round', label: 'Full round' }] })
  const sw = jsx('span', { className: 'ldw-modeswitch', children: modeSwitch }, 'sw')
  return mode === 'drill' ? jsx(DrillFloor, { home, modeSwitch: sw }) : jsx(RoundFloor, { home, modeSwitch: sw })
}

// Debate Workbench, desktop half ("Tournament Room"). SOURCE: desktop/plugin.js is built from this file and the
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
import { Button, Codicon, Input, Textarea, atom, host, useValue } from '@hermes/plugin-sdk'
import { Empty, Failure, Notice, describeError, installStyles, registerPage } from 'hermes-ui-kit'
import { Clock, LastTake, LdSheet, LiveWave, SpeakControls, Strip, sendTake, useRecorder, useTakePoll } from './floor.js'
import { $compareOpen, $marginSpot, CoachIcon, MARGIN_DEFAULT, Margin, marginState, useMarginSpot } from './margin.js'
import { $extempMode, $home, ExtempView, loadHome } from './extemp.js'
import { RhetoricView } from './rhetoric.js'
import { BallotsView } from './ballotsview.js'
import { SettingsView } from './settingsview.js'
import { FRAME_CSS } from './styles.js'
import { $chatOpen, $coachCtx, $coachOn, COACH_FLAG, CoachBox, CoachChat } from './coach.js'

export { describeError }
import { $cfg, $loadError, $state, $view, Choices, Label, MODEL_TIMEOUT, Menu, PLUGIN_ID, ROUTE, Thinking, WPM, api, clip, cls, errText, inline, load, mmss, notFoundCount, post, refreshState, renderChecked, renderText, rest, setApi, setRound, setWorkbench, sideName, sideShort, when, words } from './core.js'


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
// The coach's suggestions under each section (coach.py LD_TASKS). The first one is a chip under the section;
// "Strengthen this card" sits in the section's More menu.
const SUGGEST = {
  'Contention 1': ['contentions', 'card'], 'Contention 2': ['contentions', 'card'], 'Contention 3': ['contentions', 'card'],
  Value: ['framework'], Criterion: ['framework'], Blocks: ['block', 'card'], Definitions: ['card'], 'Other material': ['card'],
}
const SUGGEST_LABEL = { contentions: 'Suggest contentions', framework: 'Suggest a value and criterion', block: 'Write a block to an attack', card: 'Strengthen this card' }
const $sectionPush = atom(null) // { caseId, key, text, n }: a draft added to a section from another section's card
const unmark = t => String(t || '').replace(/\s*\[\[not-(?:found|in-file)\]\]/g, ' [check this: not in your case]')

const PATH = [
  { title: 'Understand the resolution', short: 'Resolution', desc: 'What it asks, and what each key word means', sections: ['Resolution analysis', 'Definitions'], tool: 'breakdown' },
  { title: 'Build the framework', short: 'Framework', desc: 'Your value and the criterion that measures it', sections: ['Value', 'Criterion'], tool: 'values' },
  { title: 'Write contentions', short: 'Contentions', desc: 'Two or three reasons, each with claim, warrant, impact', sections: ['Contention 1', 'Contention 2'], tool: 'arguments' },
  { title: 'Find evidence', short: 'Evidence', desc: 'Where to look, and what will survive a challenge', sections: ['Contention 1', 'Contention 2', 'Contention 3'], tool: 'sources', min: 40 },
  { title: 'Prepare blocks', short: 'Blocks', desc: 'The attacks coming, and your answers', sections: ['Blocks'], tool: 'attack' },
  { title: 'Review and test', short: 'Review', desc: 'Full review, then a practice round', sections: [], tool: 'review' },
]


/* ================================================================== Tournament Room == */

function stops() { return ($cfg.get() || {}).round || [] }
const speakerOf = (stop, side) => (stop.side === side ? 'student' : 'ai')
const currentStop = r => (r && r.phase === 'live' ? stops()[r.i] : null)

// The round drawn to scale in time (6-3-7-3-4-6-3, then the ballot). Each part says who speaks.
function Board({ r }) {
  const all = stops()
  const segs = all.map((s, i) => {
    const state = !r ? 'later' : r.phase !== 'live' || i < r.i ? 'done' : i === r.i ? 'now' : 'later'
    const who = !r ? (s.kind === 'cx' ? 'Cross-ex' : sideShort(s.side))
      : s.kind === 'cx' ? (speakerOf(s, r.side) === 'student' ? 'You ask' : 'Opp asks') : speakerOf(s, r.side) === 'student' ? 'You' : 'Opp'
    return { key: s.id, code: `${s.kind === 'cx' ? 'CX' : s.id} ${mmss(s.minutes * 60)}`, sub: who, minutes: s.minutes, state, min: s.kind === 'cx' ? 58 : 68 }
  })
  const ballotState = !r ? 'later' : r.phase === 'ballot' || r.phase === 'judging' ? 'now' : 'later'
  segs.push({ key: 'ballot', code: 'Ballot', sub: r && r.ballots.length ? `${r.ballots.length} written` : 'Judge', minutes: 2.4, state: ballotState, min: 76 })
  return jsx(Strip, { segments: segs, label: 'The round, drawn to scale in time' })
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
  return { left, running, total: seconds, start: () => setRunning(true), pause: () => setRunning(false) }
}

// The clock: the big clock with the timekeeper's cards (or a plain big number when nothing is timed), and
// beside it the column of actions: speak, the one primary action, prep, a few facts.
function ClockPanel({ big, label, rows = [], primary, clock, prep, over, extra, limit, elapsed, go, beside }) {
  const face = limit
    ? jsx(Clock, { limit, elapsed: elapsed || 0, label })
    : jsxs('div', { className: 'ldw-clockface', children: [
        jsx('div', { className: 'ldw-clock-label', children: label }),
        jsx('div', { className: cls('ldw-bigclock', over && 'ldw-over'), role: 'timer', 'aria-live': 'off', children: big }),
      ] })
  return jsxs('section', { className: cls('ldw-clock ldw-stage2', beside && 'ldw-stage3'), 'aria-label': 'Clock', children: [
    jsxs('div', { className: 'ldw-ldface', children: [
      face,
      clock && clock.left !== clock.total ? jsx('button', { type: 'button', className: 'hk-link', onClick: clock.running ? clock.pause : clock.start,
        children: clock.running ? 'Pause the clock' : 'Resume the clock' }) : null,
    ] }),
    beside || null,
    jsxs('div', { className: 'ldw-ldside', children: [
      go || null,
      primary || null,
      prep ? jsxs('div', { className: 'ldw-preprow', children: [
        jsx('span', { children: 'Prep left' }), jsx('b', { className: 'ldw-num', children: mmss(prep.left) }),
        jsx('button', { type: 'button', className: 'hk-link', onClick: prep.toggle, disabled: !prep.running && prep.left <= 0,
          children: prep.running ? 'Stop prep' : prep.left > 0 ? 'Use prep' : 'None left' }),
      ] }) : null,
      rows.length || (clock && clock.left === clock.total) ? jsxs('details', { className: 'ldw-clockmore', children: [jsx('summary', { children: 'Details' }),
        rows.length ? jsx('dl', { className: 'ldw-rows', children: rows.map(([k, v]) => jsxs(Fragment, { children: [jsx('dt', { children: k }), jsx('dd', { children: v })] }, k)) }) : null,
        clock && clock.left === clock.total ? jsx('button', { type: 'button', className: 'hk-link', onClick: clock.start, children: 'Start the clock by hand' }) : null,
      ] }) : null,
      extra || null,
    ] }),
  ] })
}

const BigButton = ({ primary, icon, children, ...rest }) =>
  jsx(Button, { variant: primary ? 'default' : 'secondary', className: cls('ldw-big', primary && 'ldw-primary'), ...rest,
    children: jsxs(Fragment, { children: [icon ? jsx(Codicon, { name: icon }) : null, children] }) })

const StageHead = ({ title, sub }) => jsxs('div', { className: 'ldw-stagehead', children: [
  jsx('h2', { className: 'ldw-h2', children: title }), sub ? jsx('span', { className: 'ldw-meta', children: sub }) : null,
] })

// The student's speech: spoken (recorded, timed for real, transcribed on this computer) or typed.
// A transcript replaces the box's text, with one click to bring the typed draft back.
// During your rebuttals the flow sits beside the clock: every speech given so far, as a flow sheet, so the
// speech you are answering is in view while you speak. "Hide the flow" puts it away for the round.
const fastJudge = r => ['flow', 'circuit'].includes(r && r.judge)
function FlowBeside({ r, onHide }) {
  const cols = stops().filter(s => s.kind === 'speech' && r.transcript.some(t => t.id === s.id))
  return jsxs('section', { className: 'ldw-flowside', 'aria-label': 'The flow so far', children: [
    jsxs('div', { className: 'ldw-flowside-head', children: [jsx('h3', { className: 'ldw-h3', children: 'The flow so far' }),
      jsx('button', { type: 'button', className: 'hk-link', onClick: onHide, children: 'Hide the flow' })] }),
    jsx('div', { className: 'ldw-flowside-cols', style: { gridTemplateColumns: `repeat(${cols.length}, minmax(0, 1fr))` }, children: cols.map(s => jsxs('div', { className: 'ldw-flowside-col', children: [
      jsxs('div', { className: 'ldw-flowside-th', children: [jsx('b', { children: s.id }), jsx('span', { children: speakerOf(s, r.side) === 'student' ? 'You' : 'Opp' })] }),
      ...(r.flow[s.id] || []).map((p, i) => jsx('div', { className: 'ldw-flowside-pt', children: p }, i)),
      !r.flow[s.id] ? jsx('span', { className: 'ldw-meta', children: 'Flowing...' }) : null,
    ] }, s.id)) }),
  ] })
}

function StudentSpeech({ r, stop, flowBeside, onHideFlow, onShowFlow }) {
  const [text, setText] = useState(r.drafts[stop.id] || '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const [take, setTake] = useState(null)
  const [undo, setUndo] = useState(null)
  const target = stop.minutes * 60
  const clock = useCountdown(target, `${r.round_no}-${stop.id}`)
  const prep = usePrep(r)
  const timer = useRef(null)
  const merged = useRef(null)
  const save = v => { clearTimeout(timer.current); timer.current = setTimeout(() => post('round/draft', { speech_id: stop.id, text: v }).catch(() => {}), 700) }
  useEffect(() => () => clearTimeout(timer.current), [])
  const change = v => { setText(v); save(v) }
  useTakePoll(take, setTake)
  const rec = useRecorder({ limit: target, onTake: async got => {
    setErr(null)
    try { setTake(await sendTake({ event: 'ld', segment: stop.id, limit: target, prompt: r.resolution }, got)) } catch (e) { setErr(errText(e)) }
  } })
  const recording = rec.state === 'live' || rec.state === 'armed'
  useEffect(() => {
    if (take && take.transcript.status === 'done' && take.transcript.text && merged.current !== take.id) {
      merged.current = take.id
      setUndo(text.trim() ? text : null)
      change(take.transcript.text)
    }
  }, [take && take.transcript.status])
  const finish = async () => {
    if (!text.trim()) { setErr('Give your speech first.'); return }
    clearTimeout(timer.current); clock.pause(); prep.stop(); setBusy(true); setErr(null)
    try { setRound(await post('round/speech', { speech_id: stop.id, text, take_id: take ? take.id : null })) } catch (e) { setErr(errText(e)) } finally { setBusy(false) }
  }
  const spoken = words(text) / WPM * 60
  const real = take && take.stats && !take.typed ? take.stats.speaking : null
  const shown = recording ? target - rec.elapsed : clock.left
  const length = real !== null ? real : spoken
  const pace = !text.trim() && real === null ? 'Not started' : length > target ? `${mmss(length - target)} too long` : length < target * 0.6 ? 'Short' : 'On time'
  return jsxs(Fragment, { children: [
    jsx(ClockPanel, {
      limit: target, elapsed: target - shown, label: `${stop.id} · your speech`, clock: recording ? null : clock, prep: recording ? null : prep,
      beside: flowBeside && r.transcript.some(t => t.speaker === 'ai') ? jsx(FlowBeside, { r, onHide: onHideFlow }) : null,
      go: jsx(SpeakControls, { rec, startLabel: `Speak your ${stop.id}`, onTyped: t => change(text.trim() ? `${text}\n\n${t}` : t) }),
      rows: recording ? [] : [['Pace', pace], real !== null ? ['Spoken length', `${mmss(real)}, recorded`] : ['Spoken length', `about ${mmss(spoken)}, estimated`]],
      extra: !flowBeside && onShowFlow && r.transcript.some(t => t.speaker === 'ai') ? jsx('button', { type: 'button', className: 'hk-link', onClick: onShowFlow, children: 'Show the flow' }) : null,
      primary: recording ? null : jsx(BigButton, { icon: 'arrow-right', onClick: finish, loading: busy, disabled: take && ['waiting', 'working'].includes(take.transcript.status), children: 'Finish speech' }),
    }),
    jsxs('section', { className: 'ldw-panel ldw-stage', 'aria-label': 'Your speech', children: [
      jsx(StageHead, { title: `Your ${stop.id}`, sub: stop.name }),
      jsx('p', { className: 'ldw-goal', children: ($cfg.get().speech_goals || {})[stop.id] }),
      recording ? jsx(LiveWave, { rec, limit: target }) : null,
      take && !recording ? jsx(LastTake, { take, limit: target, title: `Your ${stop.id}, spoken`, onChange: setTake, fastOk: fastJudge(r) }) : null,
      undo !== null ? jsx(Notice, { tone: 'info', children: 'What you said is in the box. Fix any words the transcript got wrong.',
        action: jsx(Button, { size: 'sm', variant: 'secondary', onClick: () => { change(undo); setUndo(null) }, children: 'Bring back my typed draft' }) }) : null,
      jsx(Textarea, { className: 'ldw-speechbox', 'aria-label': `Your ${stop.id}`, value: text, onChange: e => change(e.target.value),
        placeholder: "Speak it, or type it here. Signpost as you go: 'Off the top, framework.' 'On their first contention...'" }),
      err ? jsx(Notice, { tone: 'bad', children: err }) : null,
      jsx('span', { className: 'ldw-meta', children: `${words(text)} words${real === null ? ` · about ${mmss(spoken)} aloud at ${WPM} words a minute, estimated` : ''}` }),
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
      limit: ($cfg.get().prep_minutes || 4) * 60, elapsed: ($cfg.get().prep_minutes || 4) * 60 - prep.left, label: `Your prep · opponent's ${stop.id}`, prep,
      rows: [['Speech time', mmss(stop.minutes * 60)]],
      primary: jsx(BigButton, { primary: true, icon: 'arrow-right', disabled: !pending, loading: busy, onClick: next, children: 'Continue' }),
    }),
    jsxs('section', { className: 'ldw-panel ldw-stage', 'aria-label': "Opponent's speech", children: [
      jsx(StageHead, { title: `Opponent's ${stop.id}`, sub: stop.name }),
      err ? jsx(Failure, { title: 'The opponent could not speak', body: err, onRetry: ask }) : null,
      !pending && !err ? jsx(Thinking, { label: 'Your opponent is writing the speech' }) : null,
      pending ? jsxs(Fragment, { children: [
        jsx(Listen, { id: stop.id }),
        jsx('div', { className: 'ldw-speech', children: renderText(pending) }),
        jsx('div', { className: 'ldw-meta', children: `${words(pending)} words · about ${mmss(words(pending) / WPM * 60)} spoken. Flow it as you read or listen.` }),
        jsx(SpotSpeech, { r, id: stop.id }),
      ] }) : null,
    ] }),
  ] })
}

// The opponent's speech read aloud by the user's own Hermes voice, so the student flows by ear.
function Listen({ id }) {
  const [state, setState] = useState('idle') // idle | loading | ready
  const [err, setErr] = useState(null)
  const [playing, setPlaying] = useState(false)
  const [rate, setRate] = useState('1')
  const [t, setT] = useState({ at: 0, of: 0 })
  const audio = useRef(null)
  const urls = useRef([])
  const part = useRef(0)
  useEffect(() => () => { try { audio.current && audio.current.pause() } catch (e) { /* gone */ } urls.current.forEach(u => URL.revokeObjectURL(u)) }, [])
  const load = async () => {
    setState('loading'); setErr(null)
    try {
      const d = await post('round/listen', { speech_id: id })
      urls.current = d.parts.map(p => {
        const bin = atob(p.b64)
        const bytes = new Uint8Array(bin.length)
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
        return URL.createObjectURL(new Blob([bytes], { type: p.mime }))
      })
      part.current = 0
      setState('ready')
      setTimeout(() => play(true), 0) // starts by itself when the window allows it; Play otherwise
    } catch (e) { setErr(errText(e)); setState('idle') }
  }
  const play = quiet => {
    const a = audio.current
    if (!a) return
    if (!a.src) a.src = urls.current[part.current]
    a.playbackRate = Number(rate)
    a.play().then(() => { setPlaying(true); setErr(null) }, () => { setPlaying(false); if (quiet !== true) setErr('This window could not play the audio. Read the speech instead.') })
  }
  const pause = () => { try { audio.current.pause() } catch (e) { /* gone */ } setPlaying(false) }
  const ended = () => {
    if (part.current < urls.current.length - 1) { part.current += 1; audio.current.src = urls.current[part.current]; play() } else setPlaying(false)
  }
  const speed = v => { setRate(v); if (audio.current) audio.current.playbackRate = Number(v) }
  return jsxs('div', { className: 'ldw-listen', children: [
    jsx('audio', { ref: audio, preload: 'auto', onEnded: ended, onError: () => { if (state === 'ready') setErr('The audio would not play. Read the speech instead.') },
      onTimeUpdate: e => setT({ at: e.currentTarget.currentTime || 0, of: e.currentTarget.duration || 0 }) }),
    state !== 'ready' ? jsx(Button, { variant: 'secondary', size: 'sm', loading: state === 'loading', onClick: load,
      children: jsxs(Fragment, { children: [jsx(Codicon, { name: 'unmute' }), state === 'loading' ? 'Getting the voice ready' : 'Hear it'] }) }) : null,
    state === 'ready' ? jsx(Button, { variant: 'secondary', size: 'sm', onClick: () => (playing ? pause() : play()),
      children: jsxs(Fragment, { children: [jsx(Codicon, { name: playing ? 'debug-pause' : 'play' }), playing ? 'Pause' : 'Play'] }) }) : null,
    state === 'ready' ? jsx(Choices, { value: rate, onChange: speed, label: 'Speed', options: [{ id: '1', label: '1x' }, { id: '1.25', label: '1.25x' }] }) : null,
    state === 'ready' && t.of && isFinite(t.of) ? jsx('span', { className: 'ldw-num ldw-meta', children: `${mmss(t.at)} / ${mmss(t.of)}` }) : null,
    err ? jsx(Notice, { tone: 'warn', children: err }) : null,
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
    !text ? jsx('div', { children: jsx(Button, { variant: 'secondary', size: 'sm', loading: busy, onClick: go,
      children: jsxs(Fragment, { children: [jsx(Codicon, { name: 'search' }), 'Spot fallacies'] }) }) }) : null,
    busy ? jsx(Thinking, { label: 'Looking for fallacies' }) : null,
    err ? jsx(Notice, { tone: 'bad', children: err }) : null,
    text ? jsx(FallaciesFound, { text, where: 'in the speech' }) : null,
  ] })
}

// The fallacy finder's answer, with every quote checked against what it read (engine.check_quotes).
function FallaciesFound({ text, where }) {
  const missing = notFoundCount(text)
  return jsxs('div', { className: 'ldw-helper', children: [
    jsx('h3', { className: 'ldw-h3', children: 'Fallacies found' }),
    jsx('p', { className: 'ldw-meta', children: missing ? `Every quote was checked against the text. ${missing === 1 ? 'One was' : `${missing} were`} not found ${where}: it is marked. Do not use it until you find the real words.` : `Every quote was checked: each one is ${where}, word for word.` }),
    jsx('div', { className: 'ldw-helper-body', children: renderChecked(text, `Not found ${where}. Check it before you use it.`) }),
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
      limit: stop.minutes * 60, elapsed: stop.minutes * 60 - clock.left, label: `Cross-ex · ${studentAsks ? 'you ask' : 'opponent asks'}`, clock, prep,
      rows: [['Exchanges', String(log.length)]],
      primary: jsx(BigButton, { primary: true, icon: 'arrow-right', onClick: end, children: 'End cross-ex' }),
    }),
    jsxs('section', { className: 'ldw-panel ldw-stage', 'aria-label': 'Cross-examination', children: [
      jsx(StageHead, { title: 'Cross-examination', sub: studentAsks ? 'You ask the questions' : 'The opponent questions you' }),
      jsx('p', { className: 'ldw-goal', children: studentAsks
        ? 'Ask short questions that set up your next speech: pin down a definition, expose a missing warrant, get a concession on framework. Do not argue; ask.'
        : 'Answer honestly and briefly. Do not give a speech. Your answers are binding and the opponent will use them.' }),
      jsxs('div', { className: 'ldw-cx', ref: box, children: [
        ...log.map((t, i) => jsxs('div', { className: 'ldw-cx-turn', 'data-q': t.q ? '1' : '0', 'data-you': t.who === r.side ? '1' : '0', children: [
          jsx('span', { className: 'ldw-who', children: `${t.who === r.side ? 'You' : 'Opponent'}, ${t.q ? 'question' : 'answer'}` }), jsx('p', { children: t.text }),
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
      jsx('h2', { className: 'ldw-h3', children: 'Last ballot' }),
      jsx(Empty, { icon: 'law', title: 'No ballot yet', body: "Finish a round and the judge's ballot shows up here, with the lines the judge quoted and three drills." }),
    ] })
  }
  const pts = b.speaker_points || {}
  const first = (b.decisive || [])[0]
  const reason = clip(b.reason, 220)
  return jsxs('section', { className: 'ldw-panel ldw-side', 'aria-label': 'Last ballot', children: [
    jsx('h2', { className: 'ldw-h3', children: `Last ballot · round ${b.round_no || roundNo || ''}` }),
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
      jsx('h3', { className: 'ldw-h3', children: `${i + 1}. ${d.name}` }), jsx('p', { className: 'ldw-why', children: d.why }), jsx('p', { children: d.how }),
    ] }, i)) }) : null,
  ] })
}

// The ballot for the finished round: the ten-second sheet on the left, what to do next on the right.
function FullBallot({ r, onRedo, onFlowHit, onNew }) {
  const b = r.ballots[r.ballots.length - 1]
  const judges = ($cfg.get() || {}).judges || {}
  const [busy, setBusy] = useState(null)
  const [err, setErr] = useState(null)
  const ask = async key => {
    setBusy(key); setErr(null)
    try { setRound(await post('round/judge', { judge: key })) } catch (e) { setErr(errText(e)) } finally { setBusy(null) }
  }
  const mine = r.transcript.filter(t => t.speaker === 'student').map(t => t.id)
  return jsxs(Fragment, { children: [
    jsxs('section', { className: 'ldw-ldballot', 'aria-label': 'Ballot', children: [
      busy ? jsx(Thinking, { label: `The ${judges[busy].label.toLowerCase()} is writing a ballot` }) : null,
      err ? jsx(Notice, { tone: 'bad', children: err }) : null,
      jsx(LdSheet, { b: { ...b, side: b.side || r.side, resolution: b.resolution || r.resolution }, onLine: onFlowHit }),
    ] }),
    jsxs('aside', { className: 'ldw-ldside ldw-ldactions', 'aria-label': 'After the ballot', children: [
      jsx('div', { className: 'ldw-clock-label', children: `Ballot ${r.ballots.length} for this round` }),
      jsx(Menu, { label: busy ? 'Judging...' : 'Ask another judge', icon: 'law', align: 'end', items: Object.entries(judges).filter(([k]) => k !== b.judge_key)
        .map(([k, j]) => ({ label: `Ask the ${j.label.toLowerCase()}`, meta: j.summary, disabled: !!busy, onSelect: () => ask(k) })) }),
      jsx(Menu, { label: 'Redo a speech', icon: 'refresh', align: 'end', items: mine.map(id => ({ label: `Redo your ${id}`, disabled: !!busy, onSelect: () => onRedo(id) })) }),
      jsx(BigButton, { primary: true, icon: 'add', onClick: onNew, children: 'New round' }),
      jsx('dl', { className: 'ldw-rows', children: [['Prep left', mmss(r.prep)], ['Your points', b.speaker_points && b.speaker_points.student ? b.speaker_points.student.toFixed(1) : 'none']]
        .map(([k, v]) => jsxs(Fragment, { children: [jsx('dt', { children: k }), jsx('dd', { children: v })] }, k)) }),
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
      limit: stop.minutes * 60, elapsed: stop.minutes * 60 - clock.left, label: `${id} · redo`, clock,
      rows: [['Spoken length', `about ${mmss(words(text) / WPM * 60)}`]],
      primary: jsx(BigButton, { primary: true, icon: 'arrow-right', loading: busy, onClick: submit, children: 'Submit the redo' }),
      extra: jsx('button', { type: 'button', className: 'hk-link ldw-center', disabled: busy, onClick: onDone, children: 'Cancel the redo' }),
    }),
    jsxs('section', { className: 'ldw-panel ldw-stage', 'aria-label': 'Redo a speech', children: [
      jsx(StageHead, { title: `Redo your ${id}`, sub: stop.name }),
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
    jsxs('section', { className: 'ldw-panel ldw-stage', 'aria-label': 'Judging', children: [
      jsx(StageHead, { title: 'The ballot' }),
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
    jsx(ClockPanel, { big: mmss((cfg.prep_minutes || 4) * 60), label: 'Prep for the whole round',
      rows: [['Full round', 'about 45 minutes'], ['Speech times', 'NSDA']],
      primary: jsx(BigButton, { primary: true, icon: 'play', loading: busy, disabled: !chosen, onClick: start, children: 'Start the round' }) }),
    jsxs('section', { className: 'ldw-panel ldw-stage', 'aria-label': 'Set up a round', children: [
      jsx(StageHead, { title: 'New practice round', sub: 'Choose a case, an opponent and a judge' }),
      jsx('p', { className: 'ldw-goal', children: 'You debate the side your case is written for, and it loads into your constructive. The AI debates the other side and cross-examines you. Your answers in cross-examination are binding: the opponent will use them.' }),
      jsx('h3', { className: 'ldw-h3', children: 'Case' }),
      cases.length ? jsx('ul', { className: 'ldw-pick', role: 'listbox', 'aria-label': 'Case for this round', children: cases.map(c => jsx('li', { children: jsxs('button', {
        type: 'button', role: 'option', 'aria-selected': c.id === caseId, className: 'ldw-pick-row', 'data-active': c.id === caseId ? '' : undefined, onClick: () => setCaseId(c.id), children: [
          jsx('span', { className: 'ldw-side-tag', children: sideShort(c.side) }),
          jsxs('span', { className: 'hk-grow', children: [jsx('strong', { children: c.name }), jsx('span', { className: 'ldw-meta', children: ` · ${c.words} words · ${c.resolution || 'no resolution yet'}` })] }),
        ] }) }, c.id)) }) : null,
      jsx('h3', { className: 'ldw-h3', children: 'Opponent' }),
      jsx(Choices, { label: 'Opponent', value: level, onChange: setLevel, options: [{ id: 'novice', label: 'Novice' }, { id: 'jv', label: 'JV' }, { id: 'varsity', label: 'Varsity' }] }),
      jsx('p', { className: 'ldw-meta', children: 'Start one level below where you compete, then move up.' }),
      jsx('h3', { className: 'ldw-h3', children: 'Judge' }),
      jsx(Choices, { label: 'Judge', value: judge, onChange: setJudge, options: Object.entries(cfg.judges).map(([k, j]) => ({ id: k, label: j.label })) }),
      jsx('p', { className: 'ldw-meta', children: cfg.judges[judge].summary }),
      chosen && !chosen.words ? jsx(Notice, { tone: 'warn', children: 'This case is empty. You can still debate, but you will write your constructive from scratch.' }) : null,
      err ? jsx(Notice, { tone: 'bad', children: err }) : null,
    ] }),
  ] })
}

function Flow({ r, hit }) {
  const cols = stops().filter(s => s.kind === 'speech')
  return jsxs('section', { className: 'ldw-panel ldw-flow', 'aria-label': 'Flow', children: [
    jsx('h2', { className: 'ldw-h3', children: 'Flow' }),
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
  const [confirmEnd, setConfirmEnd] = useState(false)
  const [flowBeside, setFlowBeside] = useState(false) // the flow waits behind Show the flow while she speaks
  // The flow is written in the background; pick it up while any finished speech is still missing.
  const missing = r ? r.transcript.filter(t => !r.flow[t.id]).length : 0
  useEffect(() => {
    if (!missing) return undefined
    const id = setInterval(refreshState, 4000)
    return () => clearInterval(id)
  }, [missing, r && r.round_no])
  const flowHit = id => { setShowFlow(true); setHit(id); setTimeout(() => setHit(null), 2400) }
  const newRound = () => post('round/new').then(() => setRound(null))
  const stop = currentStop(r)
  let floor
  if (!r) floor = jsx(Setup, {})
  else if (redo) floor = jsx(Redo, { r, id: redo, onDone: () => setRedo(null) })
  else if (r.phase === 'judging') floor = jsx(Judging, { r })
  else if (r.phase === 'ballot') {
    floor = jsx(FullBallot, { r, onRedo: setRedo, onFlowHit: flowHit, onNew: newRound })
  } else if (stop.kind === 'cx') floor = jsx(CrossEx, { r, stop }, `${r.round_no}-${stop.id}`)
  else if (speakerOf(stop, r.side) === 'student') floor = jsx(StudentSpeech, { r, stop, flowBeside: flowBeside && !showFlow, onHideFlow: () => setFlowBeside(false), onShowFlow: () => setFlowBeside(true) }, `${r.round_no}-${stop.id}`)
  else floor = jsx(OpponentSpeech, { r, stop }, `${r.round_no}-${stop.id}`)
  const last = r && r.ballots.length ? r.ballots[r.ballots.length - 1] : st.history && st.history.last
  // One "Round" on the page (the sub-switch): the round's own actions sit behind a quiet "More" menu.
  const roundMenu = r ? jsx(Menu, { label: 'More', icon: 'ellipsis', ariaLabel: 'Round options', title: 'Round options', align: 'end', items: [
    { label: showFlow || r.phase === 'ballot' ? 'Hide the flow' : 'Show the flow', icon: 'list-flat', disabled: r.phase === 'ballot', onSelect: () => setShowFlow(v => !v) },
    !flowBeside && r.phase === 'live' ? { label: 'Flow beside the clock in your speeches', icon: 'layout-sidebar-right', onSelect: () => setFlowBeside(true) } : flowBeside && r.phase === 'live' ? { label: 'Fold the flow while you speak', icon: 'layout-sidebar-right', onSelect: () => setFlowBeside(false) } : null,
    r.phase !== 'ballot' ? { label: 'End this round', icon: 'close', danger: true, onSelect: () => setConfirmEnd(true) } : null,
  ] }) : null
  return jsxs(Fragment, { children: [
    roundMenu ? jsx('div', { className: 'ldw-row-end', children: roundMenu }) : null,
    confirmEnd ? jsx(Notice, { tone: 'warn', children: 'End this round? It will be cleared.', action: jsxs('div', { className: 'hk-actions', children: [
      jsx(Button, { size: 'sm', variant: 'secondary', className: 'ldw-danger', onClick: () => { setConfirmEnd(false); newRound() }, children: 'End it' }),
      jsx(Button, { size: 'sm', variant: 'secondary', onClick: () => setConfirmEnd(false), children: 'Keep going' }),
    ] }) }) : null,
    jsx(Board, { r }),
    jsxs('div', { className: 'ldw-floor', children: [floor, r && (r.phase === 'ballot' && !redo) ? null : jsx(PaperBallot, { b: last, roundNo: st.history && st.history.count })] }),
    r && (showFlow || r.phase === 'ballot') ? jsx(Flow, { r, hit }) : null,
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
const $bench = atom({ msg: null, importOpen: false, sourceOpen: false, renaming: false, confirmDelete: false })
const benchSet = patch => $bench.set({ ...$bench.get(), ...patch })

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

async function flushLocal(c) {
  await Promise.all(Object.entries(local[c.id] || {}).map(([key, text]) => post(`cases/${c.id}`, { section: { key, text } })))
}

async function benchAct(fn, done) {
  benchSet({ msg: null })
  try { const out = await fn(); if (out && out.case) setWorkbench(out); if (done) done(out) } catch (e) { benchSet({ msg: { tone: 'bad', text: errText(e) } }) }
}

async function pickSave(title, name, filter) {
  if (!(api.os && typeof api.os.pickSavePath === 'function')) return { path: null }
  const path = await api.os.pickSavePath({ title, defaultPath: name, filters: [filter] })
  return path === null ? null : { path }
}

function CaseSwitcher({ wb }) {
  const c = wb.case
  const fileRef = useRef(null)
  const bench = useValue($bench)
  const [name, setName] = useState(c.name)
  useEffect(() => { setName(c.name) }, [c.id, c.name])
  const saveBackup = async () => {
    const where = await pickSave('Save a backup of every case', 'ld-workbench-backup.json', { name: 'Backup', extensions: ['json'] })
    if (!where) return
    benchAct(() => post('backup/export', where), out => benchSet({ msg: { tone: 'good', text: `Saved ${out.cases} case${out.cases === 1 ? '' : 's'} to ${out.name}.`, path: out.path } }))
  }
  const loadBackup = e => {
    const f = e.target.files && e.target.files[0]
    e.target.value = ''
    if (!f) return
    f.text().then(text => benchAct(() => post('backup/import', { text }), out => benchSet({ msg: { tone: 'good', text: `Added ${out.added} case${out.added === 1 ? '' : 's'} from the backup.` } })))
  }
  const saveName = () => { benchSet({ renaming: false }); benchAct(() => post(`cases/${c.id}`, { name })) }
  if (bench.renaming) {
    return jsxs('div', { className: 'ldw-rename', children: [
      jsx(Input, { 'aria-label': 'Case name', value: name, autoFocus: true, onChange: e => setName(e.target.value),
        onKeyDown: e => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') benchSet({ renaming: false }) } }),
      jsx(Button, { size: 'sm', onClick: saveName, children: 'Save name' }),
      jsx(Button, { size: 'sm', variant: 'secondary', onClick: () => benchSet({ renaming: false }), children: 'Cancel' }),
    ] })
  }
  const items = [
    { heading: 'My cases' },
    ...wb.cases.map(x => ({ label: x.name, meta: `${sideShort(x.side)} · ${x.words} words · ${when(x.updated)}`, current: x.id === c.id,
      onSelect: () => { if (x.id !== c.id) benchAct(() => post(`cases/${x.id}/open`)) } })),
    { divider: true },
    { label: 'New affirmative case', icon: 'add', onSelect: () => benchAct(() => post('cases', { side: 'aff' })) },
    { label: 'New negative case', icon: 'add', onSelect: () => benchAct(() => post('cases', { side: 'neg' })) },
    { label: 'Rename', icon: 'edit', onSelect: () => benchSet({ renaming: true }) },
    { label: 'Duplicate', icon: 'copy', onSelect: () => benchAct(() => post(`cases/${c.id}/duplicate`)) },
    { label: 'Delete', icon: 'trash', danger: true, onSelect: () => benchSet({ confirmDelete: true }) },
    { divider: true },
    { label: 'Full case review', icon: 'checklist', onSelect: () => runTool(c, 'review', null, '', false) },
    { divider: true },
    { label: 'Save a backup', icon: 'save', meta: 'Every case in one file', onSelect: saveBackup },
    { label: 'Load a backup', icon: 'folder-opened', meta: 'Adds the cases in a backup file', onSelect: () => fileRef.current && fileRef.current.click() },
  ]
  return jsxs(Fragment, { children: [
    jsx(Menu, { items, ariaLabel: `Case: ${c.name}. Switch cases or manage this one`, trigger: p => jsxs('button', { type: 'button', className: 'ldw-switcher', ...p, children: [
      jsx('span', { className: 'ldw-switcher-name', children: c.name }), jsx(Codicon, { name: 'chevron-down' }),
    ] }) }),
    jsx('input', { ref: fileRef, type: 'file', accept: '.json,application/json', hidden: true, onChange: loadBackup, 'aria-label': 'Backup file' }),
  ] })
}

function ResolutionRow({ c, source }) {
  const cfg = $cfg.get()
  const bench = useValue($bench)
  const [text, setText] = useState(c.resolution || '')
  const [paste, setPaste] = useState('')
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const timer = useRef(null)
  useEffect(() => { setText(c.resolution || '') }, [c.id])
  const save = v => { setText(v); clearTimeout(timer.current); timer.current = setTimeout(() => post(`cases/${c.id}`, { resolution: v }).then(wb => setWorkbench({ cases: wb.cases, case: { ...$state.get().workbench.case, resolution: v } }), e => setErr(errText(e))), 600) }
  const call = async fn => { setBusy(true); setErr(null); try { setWorkbench(await fn()); return true } catch (e) { setErr(errText(e)); return false } finally { setBusy(false) } }
  return jsxs('section', { className: 'ldw-resrow-wrap', 'aria-label': 'Resolution', children: [
    jsxs('div', { className: 'ldw-resrow', children: [
      jsx('label', { className: 'ldw-field-label', htmlFor: 'ldw-res', children: 'Resolution' }),
      jsx(Input, { id: 'ldw-res', className: 'ldw-resinput', value: text, placeholder: 'Type the resolution you were given', onChange: e => save(e.target.value),
        onBlur: e => runBriefing('auto', e.target.value), onKeyDown: e => { if (e.key === 'Enter') runBriefing('auto', e.target.value) } }),
      jsx(Button, { size: 'sm', variant: 'secondary', title: 'A map of this topic for both sides', onClick: () => runBriefing('open', text),
        children: jsxs(Fragment, { children: [jsx(Codicon, { name: 'book' }), 'Briefing'] }) }),
      jsx(Menu, { label: 'Topic', icon: 'list-unordered', align: 'end', items: [
        { label: 'Topic briefing', meta: 'A map of this topic for both sides', onSelect: () => runBriefing('open', text) },
        { label: 'Use the current NSDA topic', meta: `${cfg.resolution.period}: ${cfg.resolution.text}`, onSelect: () => { save(cfg.resolution.text); runBriefing('auto', cfg.resolution.text) } },
        { label: bench.sourceOpen ? 'Hide the topic source' : 'Topic source', meta: source ? `Reading from ${source.title || 'pasted text'}` : 'Paste a topic analysis or read a link', onSelect: () => benchSet({ sourceOpen: !bench.sourceOpen }) },
      ] }),
    ] }),
    bench.sourceOpen ? jsxs('div', { className: 'ldw-source', children: [
      jsxs('div', { className: 'hk-stack', children: [
        jsx('h3', { className: 'ldw-h3', children: 'Paste the text' }),
        jsx('p', { className: 'ldw-meta', children: 'Paste a topic analysis or a handout from your coach. The coaching tools read it as background. The opponent does not.' }),
        jsx(Textarea, { 'aria-label': 'Topic source text', value: paste, onChange: e => setPaste(e.target.value), placeholder: 'Paste the topic analysis or source text' }),
        jsx('div', { children: jsx(Button, { size: 'sm', variant: 'secondary', disabled: busy, onClick: () => call(() => post('workbench', { source: { title: 'Pasted text', text: paste } })).then(ok => ok && runBriefing('redo', text)), children: 'Use this text' }) }),
      ] }),
      jsxs('div', { className: 'hk-stack', children: [
        jsx('h3', { className: 'ldw-h3', children: 'Or read a link' }),
        jsx('p', { className: 'ldw-meta', children: 'A public page only, such as the NSDA topics page or your league\'s topic page. PDFs need to be copied and pasted.' }),
        jsxs('div', { className: 'hk-row', children: [
          jsx(Input, { className: 'hk-grow', 'aria-label': 'Topic source link', value: url, onChange: e => setUrl(e.target.value), placeholder: cfg.topics_url }),
          jsx(Button, { size: 'sm', variant: 'secondary', loading: busy, onClick: () => call(() => post('source/read', { url })).then(ok => ok && runBriefing('open', text)), children: 'Read link' }),
        ] }),
        source ? jsxs('p', { className: 'ldw-meta', children: [`Reading from ${source.title || 'pasted text'} · ${words(source.text)} words. `,
          jsx('button', { type: 'button', className: 'hk-link', onClick: () => call(() => post('workbench', { source: null })), children: 'Remove' })] })
          : jsx('p', { className: 'ldw-meta', children: 'No source added. The coach works from the resolution alone.' }),
      ] }),
    ] }) : null,
    err ? jsx(Notice, { tone: 'bad', children: err }) : null,
  ] })
}

function ImportPanel({ c }) {
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
  return jsxs('section', { className: 'ldw-panel ldw-import', 'aria-label': 'Import a case', children: [
    jsxs('div', { className: 'ldw-row-between', children: [jsx('h2', { className: 'ldw-h2', children: 'Import a case you already wrote' }),
      jsx('button', { type: 'button', className: 'hk-link', onClick: () => benchSet({ importOpen: false }), children: 'Close' })] }),
    jsx('p', { className: 'ldw-goal', children: 'Paste your case or upload it as a Word document or text file. It becomes a new case in My cases, sorted into sections without changing a single word. Then the coach reviews it.' }),
    jsx(Textarea, { className: 'ldw-speechbox ldw-short', 'aria-label': 'Case to import', value: text, onChange: e => setText(e.target.value), placeholder: docx ? `${file} is ready to sort.` : 'Paste your whole case here' }),
    jsxs('div', { className: 'ldw-row-between', children: [
      jsxs('div', { className: 'hk-row', children: [
        jsxs('button', { type: 'button', className: 'hk-link', onClick: () => fileRef.current && fileRef.current.click(), children: [jsx(Codicon, { name: 'cloud-upload' }), 'Upload a .docx or .txt file'] }),
        jsx('span', { className: 'ldw-meta', children: file }),
        jsx('input', { ref: fileRef, type: 'file', accept: '.docx,.txt,.md', hidden: true, onChange: pick, 'aria-label': 'Case file' }),
      ] }),
      jsx(Button, { loading: busy, onClick: go, children: jsxs(Fragment, { children: [jsx(Codicon, { name: 'check' }), 'Sort and review my case'] }) }),
    ] }),
    busy ? jsx(Thinking, { label: 'Sorting your case' }) : null,
    msg ? jsx(Notice, { tone: msg.tone, children: msg.text }) : null,
  ] })
}

function PathBar({ c }) {
  const coach = useValue($coach)
  const secs = sectionsOf(c)
  const done = st => (!st.sections.length ? Object.values(secs).filter(v => words(v) >= 15).length >= 5 : st.sections.every(k => words(secs[k]) >= (st.min || 15)))
  const states = PATH.map(done)
  const current = states.indexOf(false) === -1 ? PATH.length - 1 : states.indexOf(false)
  const start = i => {
    const st = PATH[i]
    if (!st.sections.length) { runTool(c, 'review', null, '', false); return }
    const target = st.sections.find(k => words(secs[k]) < (st.min || 15)) || st.sections[0]
    $coach.set({ ...$coach.get(), focus: target })
    const el = document.getElementById(`ldw-sec-${target.replace(/\W+/g, '-')}`)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    runTool(c, st.tool, target, '', true)
  }
  return jsx('nav', { 'aria-label': 'Writing path', children: jsx('ol', { className: 'ldw-path', children: PATH.map((st, i) => jsx('li', { children: jsxs('button', {
    type: 'button', className: 'ldw-pstep', 'data-done': states[i] ? '' : undefined, 'aria-current': i === current ? 'step' : undefined,
    title: `${st.title}: ${st.desc}`, disabled: !!coach.busy, onClick: () => start(i), children: [
      jsx('span', { className: 'ldw-pnum', children: states[i] ? jsx(Codicon, { name: 'check' }) : String(i + 1) }),
      jsx('span', { children: st.short }),
    ] }) }, i)) }) })
}

// A suggestion kept under its section: each draft, its check, and Add, which puts the draft into the case
// marked for rewriting. Nothing reaches the case until the student presses Add.
function SuggestionPanel({ c, k, s }) {
  const hide = () => post(`cases/${c.id}`, { hide_suggestion: k }).then(setWorkbench, () => {})
  const [added, setAdded] = useState({})
  const add = (d, i) => {
    const target = s.kind === 'contentions' ? (['Contention 1', 'Contention 2', 'Contention 3'][i] || k) : (s.target || k)
    const now = sectionsOf(c)[target] || ''
    const piece = `[Coach's suggestion: rewrite it in your own words] ${d.label}\n${unmark(d.text)}`
    const text = now.trim() ? `${now.trimEnd()}\n\n${piece}` : piece
    saveSection(c.id, target, text)
    $sectionPush.set({ caseId: c.id, key: target, text, n: Date.now() })
    setAdded({ ...added, [i]: target })
  }
  return jsxs(CoachBox, { label: "Coach's suggestion", sub: `${s.label || 'A draft'}. Rewrite it in your own words before you read it.`, checks: s.checks, against: 'your case', onClose: hide, children: [
    s.note ? jsx('p', { className: 'ldw-coachbox-kept', children: inline(s.note, `${k}-note`) }) : null,
    jsx('ol', { className: 'ldw-drafts', children: s.drafts.map((d, i) => {
      const target = s.kind === 'contentions' ? (['Contention 1', 'Contention 2', 'Contention 3'][i] || k) : (s.target || k)
      return jsxs('li', { children: [
        jsx('b', { children: d.label }),
        jsx('div', { className: 'ldw-draft-text', children: renderChecked(d.text, COACH_FLAG) }),
        added[i] ? jsx('span', { className: 'ldw-meta', children: `Added to ${added[i]}, marked for you to rewrite.` })
          : jsx('button', { type: 'button', className: 'hk-link', onClick: () => add(d, i), children: `Add to ${target}` }),
      ] }, i)
    }) }),
  ] })
}

function SectionCard({ c, k }) {
  const cfg = $cfg.get()
  const coach = useValue($coach)
  const on = useValue($coachOn)
  const push = useValue($sectionPush)
  const [text, setText] = useState(sectionsOf(c)[k] || '')
  useEffect(() => { if (push && push.caseId === c.id && push.key === k) setText(push.text) }, [push && push.n])
  const [sel, setSel] = useState('')
  const [sug, setSug] = useState({ busy: null, err: null })
  const [attack, setAttack] = useState(null) // null: closed; text while the attack box is open
  const suggestion = (c.suggestions || {})[k]
  const suggest = async kind => {
    if (kind === 'block' && attack === null) { setAttack(''); return }
    setSug({ busy: kind, err: null })
    const card = words(sel) >= 20 ? sel : text
    try {
      const out = await post('coach/ld/suggest', { case_id: c.id, kind, section: k, sections: sectionsOf(c), attack: kind === 'block' ? attack : '', card: kind === 'card' ? card : '' })
      setWorkbench({ case: out.case, cases: out.cases, source: out.source })
      if (kind === 'block') setAttack(null)
      setSug({ busy: null, err: null })
    } catch (e) { setSug({ busy: null, err: errText(e) }) }
  }
  const kinds = on ? SUGGEST[k] || [] : []
  const helper = (c.helpers || {})[k]
  const pending = coach.busy && coach.busy.section === k
  const focus = coach.focus === k
  const change = v => { setText(v); saveSection(c.id, k, v) }
  const hide = () => post(`cases/${c.id}`, { hide_helper: k }).then(setWorkbench, () => {})
  const run = t => { $coach.set({ ...$coach.get(), focus: k }); runTool(c, t, k, '', true) }
  const [main, ...more] = SECTION_TOOLS[k] || []
  return jsxs('div', { className: 'ldw-sec', id: `ldw-sec-${k.replace(/\W+/g, '-')}`, 'data-focus': focus ? '' : undefined, children: [
    jsxs('div', { className: 'ldw-row-between', children: [jsx('h3', { className: 'ldw-sec-title', children: k }), jsx('span', { className: 'ldw-meta', children: words(text) ? `${words(text)} words` : '' })] }),
    jsx('p', { className: 'ldw-hint', children: SECTION_HINTS[k] }),
    jsx(Textarea, { className: 'ldw-sec-text', 'aria-label': k, value: text, onChange: e => change(e.target.value), onFocus: () => $coach.set({ ...$coach.get(), focus: k }),
      onSelect: e => setSel(e.target.value.slice(e.target.selectionStart, e.target.selectionEnd)) }),
    jsxs('div', { className: 'ldw-sec-actions', children: [
      main ? jsxs('button', { type: 'button', className: 'ldw-chip', 'data-main': '', disabled: !!coach.busy, onClick: () => run(main),
        children: [jsx(Codicon, { name: ICONS[main] || 'question' }), cfg.tools[main]] }) : null,
      kinds.length && kinds[0] !== 'card' ? jsxs('button', { type: 'button', className: 'ldw-chip ldw-chip-coach', disabled: !!sug.busy, onClick: () => suggest(kinds[0]),
        children: [jsx(Codicon, { name: 'lightbulb' }), SUGGEST_LABEL[kinds[0]]] }) : null,
      more.length || kinds.length ? jsx(Menu, { items: [...more.map(t => ({ label: cfg.tools[t], icon: ICONS[t], disabled: !!coach.busy, onSelect: () => run(t) })),
        ...(kinds.length ? [{ divider: true }, { heading: "The coach's suggestions" }, ...kinds.map(kind => ({ label: SUGGEST_LABEL[kind], icon: 'lightbulb', disabled: !!sug.busy,
          meta: kind === 'card' ? (words(sel) >= 20 ? 'The card you selected' : 'Select the card first, or the whole section is used') : null, onSelect: () => suggest(kind) }))] : [])],
        trigger: p => jsxs('button', { type: 'button', className: 'ldw-chip', ...p, 'aria-label': `More help with ${k}`, children: ['More', jsx(Codicon, { name: 'chevron-down' })] }) }) : null,
    ] }),
    attack !== null ? jsxs('div', { className: 'ldw-attackbox', children: [
      jsx('label', { className: 'ldw-field-label', htmlFor: `ldw-attack-${k.replace(/\W+/g, '-')}`, children: 'The attack to answer' }),
      jsx(Textarea, { id: `ldw-attack-${k.replace(/\W+/g, '-')}`, className: 'ldw-short', value: attack, placeholder: 'Paste or type the attack: from Attack my case, your opponent, or your coach',
        onChange: e => setAttack(e.target.value) }),
      jsxs('div', { className: 'hk-actions', children: [
        jsx(Button, { size: 'sm', loading: sug.busy === 'block', disabled: words(attack) < 8, onClick: () => suggest('block'), children: 'Write the block' }),
        jsx(Button, { size: 'sm', variant: 'secondary', onClick: () => setAttack(null), children: 'Cancel' }),
      ] }),
    ] }) : null,
    sug.busy && sug.busy !== 'block' ? jsx(Thinking, { label: `${SUGGEST_LABEL[sug.busy]}: the coach is reading your case` }) : null,
    sug.busy === 'block' ? jsx(Thinking, { label: 'Writing a block to that attack' }) : null,
    sug.err ? jsx(Notice, { tone: 'bad', children: sug.err }) : null,
    on && suggestion && !sug.busy ? jsx(SuggestionPanel, { c, k, s: suggestion }) : null,
    pending ? jsx('div', { className: 'ldw-helper', children: jsx(Thinking, { label: cfg.tools[coach.busy.tool] }) }) : helper ? jsxs('div', { className: 'ldw-helper', children: [
      jsxs('div', { className: 'ldw-row-between', children: [jsx('h4', { className: 'ldw-h3', children: helper.label }), jsx('button', { type: 'button', className: 'hk-link', onClick: hide, children: 'Hide' })] }),
      jsx('div', { className: 'ldw-helper-body', children: renderChecked(helper.text, 'Not found in your case. Check it before you use it.') }),
      jsx('button', { type: 'button', className: 'hk-link', onClick: () => { $coach.set({ ...$coach.get(), focus: k }); const a = document.getElementById('ldw-ask'); if (a) a.focus() }, children: 'Ask the coach a follow-up' }),
    ] }) : null,
  ] })
}

function CoachPanel({ c }) {
  const coach = useValue($coach)
  const [text, setText] = useState('')
  const box = useRef(null)
  const thread = c.thread || []
  useEffect(() => { if (box.current) box.current.scrollTop = box.current.scrollHeight }, [thread.length, coach.busy])
  const send = () => { const t = text.trim(); if (!t || coach.busy) return; setText(''); runTool(c, 'coach', coach.focus, t, false) }
  return jsxs('aside', { className: 'ldw-panel ldw-coach', 'aria-label': 'Coach', children: [
    jsxs('div', { className: 'ldw-row-between', children: [jsx('span', { className: 'ldw-eyebrow', children: 'Looking at' }),
      jsx('span', { className: 'ldw-focus', title: 'The section the coach is looking at. Click into a section to change it.', children: coach.focus || 'Whole case' })] }),
    jsxs('div', { className: 'ldw-thread', ref: box, 'aria-live': 'polite', children: [
      !thread.length && !coach.busy ? jsx('p', { className: 'ldw-meta', children: 'Click into a section and use the button under it, or ask the coach anything here. A rough draft gets better coaching than a blank page.' }) : null,
      ...thread.map((m, i) => jsxs('div', { className: 'ldw-msg', 'data-role': m.role, children: [
        jsx('span', { className: 'ldw-who', children: m.role === 'coach' ? m.label || 'Coach' : 'You' }),
        m.role === 'coach' ? (m.section ? jsx('p', { className: 'ldw-meta', children: `Shown under ${m.section}. Ask a follow-up below.` }) : renderText(m.text)) : jsx('p', { children: m.text }),
      ] }, i)),
      coach.busy && coach.pendingMessage ? jsxs('div', { className: 'ldw-msg', 'data-role': 'you', children: [jsx('span', { className: 'ldw-who', children: 'You' }), jsx('p', { children: coach.pendingMessage })] }) : null,
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
    jsx('span', { children: `${mmss(sec)} of ${mmss(target)} spoken at ${WPM} words a minute${c.side === 'neg' ? ' (leaves 2:30 of your NC to attack)' : ''}` }),
    jsx('div', { className: 'ldw-bar ldw-grow', 'data-over': sec > target ? '1' : undefined, children: jsx('span', { style: { width: `${Math.min(100, sec / target * 100)}%` } }) }),
  ] })
}

/* ---------- Topic briefing ---------- */
// One briefing per resolution and topic source, saved by the backend. It opens by itself the first time a
// student meets a resolution; after that it opens instantly from the saved copy.
const $brief = atom({ open: false, busy: false, text: '', err: null, resolution: '' })
const briefAsked = new Set()

async function runBriefing(mode, resolution) {
  const res = String(resolution || '').trim()
  const b = $brief.get()
  if (b.busy) return
  if (res.split(/\s+/).filter(Boolean).length < 3) {
    if (mode !== 'auto') $brief.set({ ...b, open: true, text: '', err: 'Enter the resolution first.', resolution: res })
    return
  }
  if (mode === 'auto') {
    // Only the first time this resolution is met: ask the backend whether a briefing is saved (no model call).
    const key = res.toLowerCase().replace(/\s+/g, ' ')
    if (briefAsked.has(key)) return
    briefAsked.add(key)
    try { if ((await post('briefing', { mode: 'check', resolution: res })).known) return } catch (e) { return }
    mode = 'open'
  }
  $brief.set({ open: true, busy: true, text: '', err: null, resolution: res })
  try {
    const out = await post('briefing', { mode, resolution: res })
    $brief.set({ open: true, busy: false, text: out.text, err: null, resolution: out.resolution })
  } catch (e) {
    $brief.set({ open: true, busy: false, text: '', err: `The briefing could not be made: ${errText(e)}`, resolution: res })
  }
}

function BriefingPanel() {
  const b = useValue($brief)
  if (!b.open) return null
  return jsxs('section', { className: 'ldw-panel ldw-brief', 'aria-label': 'Topic briefing', 'aria-live': 'polite', children: [
    jsxs('div', { className: 'ldw-row-between', children: [
      jsxs('div', { className: 'ldw-stagehead', children: [jsx('span', { className: 'ldw-label ldw-accent', children: 'Topic briefing' }), jsx('h2', { className: 'ldw-h2 ldw-brief-title', children: b.resolution })] }),
      jsxs('div', { className: 'hk-actions', children: [
        jsx(Button, { size: 'sm', variant: 'secondary', disabled: b.busy, onClick: () => runBriefing('redo', b.resolution), children: jsxs(Fragment, { children: [jsx(Codicon, { name: 'refresh' }), 'Redo'] }) }),
        jsx(Button, { size: 'sm', variant: 'secondary', disabled: b.busy || !b.text, onClick: () => $view.set('printbrief'), children: jsxs(Fragment, { children: [jsx(Codicon, { name: 'preview' }), 'Print'] }) }),
        jsx(Button, { size: 'sm', onClick: () => $brief.set({ ...b, open: false }), children: 'Got it' }),
      ] }),
    ] }),
    jsx('p', { className: 'ldw-goal', children: 'Read this before you write. It maps the ground for both sides. Check anything marked "check this" before you use it.' }),
    b.busy ? jsx(Thinking, { label: 'Preparing your briefing on this topic' }) : null,
    b.err ? jsx(Notice, { tone: 'bad', children: b.err }) : null,
    b.text ? jsx('div', { className: 'ldw-brief-body', children: renderText(b.text) }) : null,
  ] })
}

function PrintBriefing() {
  const b = useValue($brief)
  return jsxs(Fragment, { children: [
    jsxs('div', { className: 'hk-actions ldw-noprint', children: [
      jsx(Button, { variant: 'secondary', onClick: () => $view.set('bench'), children: jsxs(Fragment, { children: [jsx(Codicon, { name: 'arrow-left' }), 'Back to the workbench'] }) }),
      jsx(Button, { onClick: () => window.print(), children: jsxs(Fragment, { children: [jsx(Codicon, { name: 'file' }), 'Print'] }) }),
    ] }),
    jsxs('article', { className: 'ldw-print', children: [jsx('h1', { children: 'Topic briefing' }), jsx('p', { className: 'ldw-print-meta', children: b.resolution }), renderText(b.text)] }),
  ] })
}

function Bench() {
  const st = useValue($state)
  const bench = useValue($bench)
  const wb = st.workbench
  const c = wb.case
  const setSide = side => benchAct(() => post(`cases/${c.id}`, { side }))
  const exportAs = async fmt => {
    const where = fmt === 'print' ? null : await pickSave(`Save ${c.name}`, `${(c.name || 'case').replace(/[^\w .-]+/g, '')}.${fmt}`,
      { name: fmt === 'docx' ? 'Word document' : 'Text file', extensions: [fmt] })
    if (fmt === 'print') { $view.set('print'); return }
    if (!where) return
    benchAct(async () => { await flushLocal(c); return post(`cases/${c.id}/export`, { format: fmt, path: where.path }) },
      out => benchSet({ msg: { tone: 'good', text: `Saved ${out.name}.`, path: out.path } }))
  }
  const msg = bench.msg
  useMarginSpot('ld-bench') // the case coach sits in the margin, open by default here
  useEffect(() => { runBriefing('auto', c.resolution) }, [c.id])
  return jsxs(Fragment, { children: [
    jsx(BriefingPanel, {}),
    jsx(ResolutionRow, { c, source: wb.source }, `res-${c.id}`),
    jsxs('div', { className: 'ldw-casehead', children: [
      jsx(CaseSwitcher, { wb }),
      jsx(Choices, { label: 'Side', value: c.side, onChange: setSide, options: [{ id: 'aff', label: 'Aff' }, { id: 'neg', label: 'Neg' }] }),
      jsx('span', { className: 'hk-grow' }),
      jsx(Button, { size: 'sm', variant: 'secondary', 'aria-expanded': bench.importOpen, onClick: () => benchSet({ importOpen: !bench.importOpen }),
        children: jsxs(Fragment, { children: [jsx(Codicon, { name: 'cloud-upload' }), 'Import'] }) }),
      jsx(Menu, { label: 'Export', icon: 'export', align: 'end', items: [
        { label: 'Save as Word', icon: 'file', meta: '.docx', onSelect: () => exportAs('docx') },
        { label: 'Save as text', icon: 'file-text', meta: '.txt', onSelect: () => exportAs('txt') },
        { label: 'Print view', icon: 'preview', onSelect: () => exportAs('print') },
      ] }),
    ] }),
    bench.confirmDelete ? jsx(Notice, { tone: 'warn', children: `Delete "${c.name}" for good? This cannot be undone.`, action: jsxs('div', { className: 'hk-actions', children: [
      jsx(Button, { size: 'sm', variant: 'secondary', className: 'ldw-danger', onClick: () => { benchSet({ confirmDelete: false }); benchAct(() => post(`cases/${c.id}/delete`)) }, children: 'Delete' }),
      jsx(Button, { size: 'sm', variant: 'secondary', onClick: () => benchSet({ confirmDelete: false }), children: 'Keep it' }),
    ] }) }) : null,
    msg ? jsx(Notice, { tone: msg.tone, children: msg.text, action: msg.path && api.os && api.os.revealPath
      ? jsx(Button, { size: 'sm', variant: 'secondary', onClick: () => api.os.revealPath(msg.path), children: 'Show file' }) : null }) : null,
    bench.importOpen ? jsx(ImportPanel, { c }) : null,
    jsx(PathBar, { c }),
    jsx('div', { className: 'ldw-benchgrid', children:
      jsxs('section', { className: 'ldw-case', 'aria-label': `Your ${sideName(c.side)} case`, children: [
        jsx(TimeBar, { c }),
        ...($cfg.get().sections || []).map(k => jsx(SectionCard, { c, k }, `${c.id}-${k}`)),
      ] }) }),
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
    jsx('h2', { className: 'ldw-h2', children: 'Practice: name that fallacy' }),
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
    jsx('h2', { className: 'ldw-h2', children: 'Check an argument' }),
    jsx('p', { className: 'ldw-goal', children: "Paste an opponent's case, a teammate's speech, or a paragraph from an article. To check your own case, use Find fallacies in any contention." }),
    jsx(Textarea, { className: 'ldw-speechbox ldw-short', 'aria-label': 'Argument to check', value: text, onChange: e => setText(e.target.value), placeholder: 'Paste the argument here' }),
    jsx('div', { className: 'ldw-row-end', children: jsx(Button, { loading: busy, onClick: go, children: jsxs(Fragment, { children: [jsx(Codicon, { name: 'search' }), 'Find the fallacies'] }) }) }),
    busy ? jsx(Thinking, { label: 'Looking for fallacies' }) : null,
    err ? jsx(Notice, { tone: 'bad', children: err }) : null,
    out ? jsx(FallaciesFound, { text: out, where: 'in what you pasted' }) : null,
  ] })
}

function Fallacies() {
  const guide = ($cfg.get() || {}).fallacies || []
  return jsxs(Fragment, { children: [
    jsx('p', { className: 'ldw-goal', children: 'A fallacy is a mistake in reasoning that can make a weak argument sound strong. Learn the common ones, practice spotting them, and check any argument for them: yours or someone else\'s.' }),
    jsxs('div', { className: 'ldw-fx-grid', children: [jsx(Drill, {}), jsx(CheckArgument, {})] }),
    jsxs('section', { className: 'hk-stack', 'aria-label': 'The guide', children: [
      jsx('h2', { className: 'ldw-h2', children: `The guide: ${guide.length} common fallacies` }),
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

// Lincoln-Douglas says where the student is (the round, or the case) in one quiet line over its floor. The
// switch between Round, Case and Fallacies lives in the frame's header row, beside the event name.
function LdContext() {
  const view = useValue($view)
  const st = useValue($state)
  const cfg = $cfg.get()
  const r = st && st.round
  const c = st && st.workbench && st.workbench.case
  if (view === 'print' || view === 'printbrief') return null
  const line = view === 'fallacies' ? 'A guide, a practice drill and a checker' : view === 'room'
    ? r ? `Practice round ${r.round_no}, ${sideShort(r.side)}, ${r.level === 'jv' ? 'JV' : r.level}, ${cfg.judges[r.judge].label}` : `${(st.history || {}).count || 0} ${((st.history || {}).count || 0) === 1 ? 'ballot' : 'ballots'} so far in NSDA Lincoln-Douglas`
    : c ? `${c.side === 'aff' ? 'Affirmative' : 'Negative'} case: ${c.name}` : ''
  // The Case Workbench edits its resolution in its own row, so only the round shows it here.
  const res = view === 'room' ? (r ? r.resolution : c && c.resolution) : null
  return jsxs('div', { className: 'ldw-ldctx ldw-noprint', children: [
    line ? jsx('span', { className: 'ldw-eyebrow', children: line }) : null,
    res ? jsx('p', { className: 'ldw-res', children: res.replace(/^Resolved:\s*/i, 'Resolved: ') }) : null,
  ] })
}

/* ================================================================== the frame == */

// One header row over the floor: the four events on the left (the current one in accent ink), and in
// Lincoln-Douglas one sub-switch beside its name; the Coach toggle and Settings on the right. Navigation
// never goes in the strip row under it.
const $event = atom(null) // ld | extemp | rhetoric | ballots | settings (null: the one last chosen)
const EVENT_IDS = ['ld', 'extemp', 'rhetoric', 'ballots']
const EVENT_NAMES = { ld: 'Lincoln-Douglas', extemp: 'Extemp', rhetoric: 'Rhetoric', ballots: 'Ballots' }
const LD_VIEWS = [['room', 'Round'], ['bench', 'Case'], ['fallacies', 'Fallacies']]
const ldViewOf = v => (v === 'print' || v === 'printbrief' ? 'bench' : v)

function chooseEvent(id) {
  $event.set(id)
  if (id !== 'settings') post('settings', { event: id }).catch(() => {})
  if (id === 'ballots' || id === 'extemp' || id === 'settings') loadHome()
}

const GearIcon = () => jsxs('svg', { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5,
  strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true', focusable: 'false', children: [
    jsx('path', { d: 'M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z' }),
    jsx('circle', { cx: 12, cy: 12, r: 3 }),
  ] })

function FrameHeader({ event, coachOpen, coachable }) {
  const view = useValue($view)
  const ev = id => jsx('button', { type: 'button', className: 'ldw-evt', 'aria-current': event === id ? 'page' : undefined,
    onClick: () => chooseEvent(id), children: EVENT_NAMES[id] }, id)
  const subs = event === 'ld' ? jsx('div', { className: 'ldw-subs', role: 'group', 'aria-label': 'Lincoln-Douglas', children: LD_VIEWS.map(([v, label]) =>
    jsx('button', { type: 'button', className: 'ldw-sub', 'aria-current': ldViewOf(view) === v ? 'page' : undefined, onClick: () => $view.set(v), children: label }, v)) }, 'subs') : null
  return jsxs('header', { className: 'ldw-top ldw-noprint', children: [
    jsx('nav', { className: 'ldw-events', 'aria-label': 'Events', children: EVENT_IDS.flatMap(id => id === 'ld' ? [ev(id), subs] : [ev(id)]) }),
    jsxs('div', { className: 'ldw-top-tools', children: [
      coachable ? jsxs('button', { type: 'button', className: 'ldw-toptool', 'aria-pressed': coachOpen, onClick: () => $chatOpen.set(!coachOpen), children: [
        jsx(CoachIcon, {}), 'Coach'] }) : null,
      jsx('button', { type: 'button', className: 'ldw-toptool ldw-gear', 'aria-label': 'Settings', title: 'Settings',
        'aria-current': event === 'settings' ? 'page' : undefined, onClick: () => chooseEvent('settings'), children: jsx(GearIcon, {}) }),
    ] }),
  ] })
}

// Lincoln-Douglas says what is on screen here; the other events say it from their own floors.
function useLdCoachContext(event) {
  const view = useValue($view)
  const st = useValue($state)
  const r = st && st.round
  useEffect(() => {
    if (event !== 'ld') return
    const room = view === 'room'
    $coachCtx.set({ floor: 'ld', view: room ? 'room' : view, sees: room && r
      ? ['the round', (r.ballots || []).length && 'the ballot', 'your open case']
      : ['your case', 'the resolution'] })
  }, [event, view, r && r.round_no, r && (r.ballots || []).length, r && r.i])
}

function DebatePage() {
  const st = useValue($state)
  const cfg = useValue($cfg)
  const err = useValue($loadError)
  const view = useValue($view)
  const home = useValue($home)
  const picked = useValue($event)
  const spot = useValue($marginSpot)
  const chatOpen = useValue($chatOpen)
  const compare = useValue($compareOpen)
  useEffect(() => { load(); loadHome() }, [])
  const event = picked === 'settings' ? 'settings' : picked || (home && home.settings && EVENT_IDS.includes(home.settings.event) ? home.settings.event : 'extemp')
  const ready = !!(st && cfg)
  const coachable = ready && event !== 'settings' && view !== 'print' && view !== 'printbrief'
  // The margin opens by itself only where the coach helps most (extemp prep, the Case Workbench), and
  // starts closed everywhere else; the header's Coach toggle opens or closes it on any floor.
  const place = `${event}/${event === 'ld' ? view : ''}/${spot || ''}`
  useEffect(() => { $chatOpen.set(MARGIN_DEFAULT.has(spot)) }, [place])
  const open = coachable && chatOpen
  const bench = event === 'ld' && ldViewOf(view) === 'bench' && st && st.workbench
  useLdCoachContext(event)
  let body
  if (err && !st) body = jsx(Failure, { title: 'The workbench could not load', body: `${errText(err)} Check that Debate Workbench is turned on in Capabilities, Plugins, then try again.`, error: err, onRetry: () => { load(); loadHome() } })
  else if (!ready) body = jsx(Thinking, { label: 'Opening the workbench' })
  else if (event === 'extemp') body = jsx(ExtempView, {})
  else if (event === 'rhetoric') body = jsx(RhetoricView, {})
  else if (event === 'ballots') body = jsx(BallotsView, {})
  else if (event === 'settings') body = jsx(SettingsView, {})
  else body = jsxs(Fragment, { children: [jsx(LdContext, {}), view === 'room' ? jsx(Room, {}) : view === 'fallacies' ? jsx(Fallacies, {}) : view === 'printbrief' ? jsx(PrintBriefing, {}) : view === 'print' ? jsx(PrintView, {}) : jsx(Bench, {})] })
  return jsx('div', { className: 'hk hk-page ldw', role: 'region', 'aria-label': 'Debate Workbench', children: jsxs('div', { className: 'ldw-frame', 'data-margin': marginState(open, compare), children: [
    jsx(FrameHeader, { event, coachOpen: open, coachable }),
    jsx('main', { className: 'ldw-inner', 'data-event': event, children: body }),
    open ? jsx(Margin, { open, onToggle: () => $chatOpen.set(false), title: 'Coach',
      children: bench ? jsx(CoachPanel, { c: st.workbench.case }) : jsx(CoachChat, { floor: event }) }) : null,
  ] }) })
}

/* ------------------------------------------------------------------ styles -- */

// Only theme variables (the kit's --hk-* tokens over the app's --ui-* / --dt-*). The paper ballot is mixed
// from the surface and the text color; under the app's dark mode it flips to light paper with dark ink.
const CSS = `
.ldw{--ldw-serif:Georgia,"Source Serif 4","Times New Roman",ui-serif,serif;--ldw-gap:22px}
.ldw-inner{padding:18px 22px 40px;display:grid;gap:var(--ldw-gap);align-content:start;min-width:0}
.ldw-label{font-family:var(--hk-mono);font-size:12px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--hk-ink)}
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
.ldw-slot{position:relative;background:var(--hk-surface);border:1px solid var(--hk-stroke);border-radius:var(--ldw-r);padding:10px 12px;min-width:0;color:var(--hk-ink);text-align:left;font:inherit;
  transition:border-color var(--hk-dur) var(--hk-ease),background-color var(--hk-dur) var(--hk-ease)}
.ldw-slot-id{font-family:var(--hk-mono);font-weight:800;font-size:18px;line-height:1.2}
.ldw-slot-who{font-size:12px;letter-spacing:.06em;text-transform:uppercase;margin-top:2px}
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
.ldw-panel{background:var(--hk-surface);border:1px solid var(--hk-stroke);border-radius:var(--ldw-r);padding:16px;min-width:0;display:grid;gap:10px;align-content:start}
.ldw-panel>*{min-width:0}

.ldw-clock{position:sticky;top:0}
.ldw-watch{text-align:center;padding:14px 0 4px;display:grid;gap:8px}
.ldw-watch-time{font-family:var(--hk-mono);font-weight:800;font-size:68px;letter-spacing:-.02em;line-height:1;font-variant-numeric:tabular-nums}
.ldw-over{color:var(--hk-bad)}
.ldw-bar{height:6px;background:var(--hk-sunken);border-radius:var(--ldw-r);overflow:hidden}
.ldw-bar span{display:block;height:100%;background:var(--hk-accent);border-radius:var(--ldw-r);transition:width 160ms var(--hk-ease)}
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
.ldw-pick-row,.ldw-case-open{display:flex;gap:10px;align-items:center;width:100%;text-align:left;font:inherit;color:inherit;background:transparent;border:1px solid var(--hk-stroke);border-radius:var(--ldw-r);padding:7px 10px;cursor:pointer}
.ldw-pick-row:hover,.ldw-case-open:hover{background:var(--hk-hover)}
.ldw-pick-row[data-active]{border-color:var(--hk-accent);background:var(--hk-active)}
.ldw-side-tag{font-family:var(--hk-mono);font-size:12px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;padding:1px 6px;border-radius:var(--ldw-r);border:1px solid color-mix(in srgb,var(--hk-accent) 45%,transparent);margin-right:6px}

.ldw-side{gap:12px}
.ldw-paper{position:relative;border-radius:var(--ldw-r);padding:16px 18px 18px;font-family:var(--ldw-serif);
  background:color-mix(in srgb,var(--hk-surface) 90%,var(--hk-warn-fill));color:var(--hk-ink);border:1px solid var(--hk-stroke)}
:root.dark .ldw-paper{background:color-mix(in srgb,var(--hk-ink) 90%,var(--hk-warn-fill));color:var(--ui-bg-elevated,var(--hk-bg));border-color:transparent}
.ldw-paper-top{display:flex;justify-content:space-between;gap:4px 10px;flex-wrap:wrap;font-family:var(--hk-mono);font-size:12px;letter-spacing:.14em;font-weight:800;text-transform:uppercase;border-bottom:2px solid currentColor;padding-bottom:8px;margin-bottom:6px}
.ldw-paper-line{display:flex;justify-content:space-between;gap:10px;font-size:14px;padding:7px 0;border-bottom:1px dashed color-mix(in srgb,currentColor 40%,transparent)}
.ldw-paper-decided b{text-align:left;max-width:70%}
.ldw-box{display:inline-block;width:14px;height:14px;border:1.5px solid currentColor;margin-right:7px;vertical-align:-2px;position:relative}
.ldw-box[data-x="1"]::before,.ldw-box[data-x="1"]::after{content:"";position:absolute;left:50%;top:-2px;width:1.5px;height:16px;background:currentColor;transform:rotate(45deg)}
.ldw-box[data-x="1"]::after{transform:rotate(-45deg)}
.ldw-paper-rfd{font-size:14px;line-height:1.45;font-style:italic;margin-top:10px !important;padding-right:6px}
.ldw-stamp{position:absolute;right:14px;bottom:-10px;font-family:var(--hk-mono);font-weight:800;font-size:12px;letter-spacing:.14em;text-transform:uppercase;padding:4px 8px;transform:rotate(-6deg);
  color:color-mix(in srgb,var(--hk-bad-fill) 85%,currentColor);border:2px solid currentColor;background:inherit;border-radius:var(--ldw-r)}
:root.dark .ldw-stamp{color:color-mix(in srgb,var(--hk-bad-fill) 80%,var(--ui-bg-elevated,var(--hk-bg)))}
.ldw-drills{display:grid;gap:10px}
.ldw-drill{display:grid;gap:3px;border-top:1px solid var(--hk-stroke);padding-top:8px}
.ldw-drill p{font-size:13px}
.ldw-why{font-style:italic}
.ldw-verdict{margin:0;font-size:20px;font-weight:800}
.ldw-ballot-grid{display:grid;grid-template-columns:1fr;gap:18px}
.ldw-decisive{display:grid;gap:3px;text-align:left;font:inherit;color:inherit;background:var(--hk-sunken);border:1px solid var(--hk-stroke);border-left:3px solid var(--hk-accent);border-radius:var(--ldw-r);padding:8px 10px;cursor:pointer}
.ldw-decisive:hover{border-color:var(--hk-stroke-strong)}
.ldw-decisive em{font-size:12.5px}
.ldw-list{margin:0;padding-left:18px;display:grid;gap:4px}
.ldw-flow-scroll{overflow-x:auto}
.ldw-flow table{border-collapse:collapse;width:100%;min-width:860px}
.ldw-flow th{font-family:var(--hk-mono);font-size:12px;letter-spacing:.12em;text-transform:uppercase;text-align:left;padding:8px 10px;border-bottom:1px solid var(--hk-stroke-strong);border-right:1px solid var(--hk-stroke)}
.ldw-flow th span{display:block;font-size:12px;letter-spacing:.06em;font-weight:400}
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
.ldw-chip{display:inline-flex;align-items:center;gap:5px;background:transparent;border:1px solid var(--hk-stroke);border-radius:var(--ldw-r);padding:3px 9px;font:inherit;font-size:12px;font-weight:600;color:var(--hk-ink);cursor:pointer;
  transition:border-color var(--hk-dur) var(--hk-ease),background-color var(--hk-dur) var(--hk-ease)}
.ldw-chip .codicon{color:color-mix(in srgb,var(--hk-accent) 82%,var(--hk-ink))}
.ldw-chip:hover:not(:disabled){border-color:var(--hk-accent)}
.ldw-chip[data-main]{border-color:var(--hk-accent);background:color-mix(in srgb,var(--hk-accent) 14%,transparent)}
.ldw-chip:disabled{cursor:default;opacity:.6}
.ldw-helper{border:1px solid var(--hk-stroke);border-left:3px solid var(--hk-accent);border-radius:var(--ldw-r);padding:10px 12px;display:grid;gap:6px;background:var(--hk-sunken)}
.ldw-helper-body{max-height:420px;overflow:auto}
.ldw-coach{position:sticky;top:0;max-height:calc(100vh - 80px);grid-template-rows:auto minmax(160px,1fr) auto}
.ldw-focus{font-size:12px;font-weight:600;border:1px solid var(--hk-stroke-strong);border-radius:var(--ldw-r);padding:1px 9px}
.ldw-toolgrid{display:grid;grid-template-columns:1fr 1fr;gap:6px}
.ldw-tool{border-radius:var(--ldw-r);justify-content:flex-start;text-align:left;padding:6px 8px}
.ldw-thread{overflow:auto;display:grid;gap:12px;align-content:start;min-height:160px;padding-right:2px}
.ldw-msg{display:grid;gap:3px;font-size:14px}
.ldw-msg[data-role=coach]{border-left:2px solid var(--hk-accent);padding-left:10px}
.ldw-msg[data-role=you] p{background:var(--hk-sunken);border:1px solid var(--hk-stroke);border-radius:var(--ldw-r);padding:6px 10px}
.ldw-import{gap:10px}
.ldw-print{background:var(--hk-surface);border:1px solid var(--hk-stroke);border-radius:var(--ldw-r);padding:40px 48px;max-width:780px;font-family:var(--ldw-serif);font-size:15px;line-height:1.6}
.ldw-print h1{font-size:24px;margin:0 0 4px;font-family:inherit}
.ldw-print h2{font-size:15px;text-transform:uppercase;letter-spacing:.08em;margin:22px 0 6px;font-family:var(--hk-mono)}
.ldw-print p{margin:0 0 10px}
.ldw-print-meta{font-style:italic}

.ldw-fx-grid{display:grid;grid-template-columns:1fr 1fr;gap:var(--ldw-gap);align-items:start}
.ldw-fx-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,260px),1fr));gap:10px}
.ldw-fx-card{background:var(--hk-surface);border:1px solid var(--hk-stroke);border-radius:var(--ldw-r);padding:12px 14px;display:grid;gap:6px;align-content:start;font-size:13px}
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

/* declutter: sentence-case labels, menus, slim stepper, unboxed case */
.ldw-label{font-family:inherit;font-size:12px;font-weight:600;letter-spacing:0;text-transform:none}
.ldw-mono{font-family:var(--hk-mono);font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase}
.ldw-h2{margin:0;font-size:16px;font-weight:700;line-height:1.3}
.ldw-h3{margin:0;font-size:13px;font-weight:700;line-height:1.35}
.ldw-who{font-size:12px;font-weight:600}
.ldw-stagehead{display:grid;gap:2px}
.ldw-panel{gap:14px;padding:18px}
.ldw-menu-wrap{position:relative;display:inline-flex}
.ldw-caret{font-size:12px !important;margin-left:2px}
.ldw-menu{position:absolute;top:calc(100% + 4px);left:0;z-index:40;min-width:240px;max-width:360px;max-height:min(560px,70vh);overflow:auto;padding:4px;
  background:var(--hk-surface);border:1px solid var(--hk-stroke-strong);border-radius:var(--ldw-r);box-shadow:0 10px 30px color-mix(in srgb,var(--hk-ink) 18%,transparent);display:grid;gap:1px}
.ldw-menu[data-align=end]{left:auto;right:0}
.ldw-menu-item{display:flex;gap:8px;align-items:flex-start;width:100%;text-align:left;background:transparent;border:0;border-radius:var(--ldw-r);padding:6px 8px;font:inherit;font-size:13px;color:var(--hk-ink);cursor:pointer}
.ldw-menu-item:hover:not(:disabled),.ldw-menu-item:focus-visible{background:var(--hk-hover);outline:none;box-shadow:inset 2px 0 0 var(--hk-accent)}
.ldw-menu-item:disabled{cursor:default}
.ldw-menu-item[data-danger]{color:var(--hk-bad)}
.ldw-menu-icon{margin-top:2px;flex:none}
.ldw-menu-item[aria-current] .ldw-menu-icon{color:var(--hk-good)}
.ldw-menu-text{display:grid;gap:1px;min-width:0}
.ldw-menu-meta{font-size:11.5px;overflow-wrap:anywhere}
.ldw-menu-head{font-size:11.5px;font-weight:700;padding:6px 8px 2px}
.ldw-menu-sep{height:1px;background:var(--hk-stroke);margin:4px 2px}
.ldw-watch{padding:8px 0 0;gap:6px}
.ldw-watch-sub{display:flex;align-items:center;justify-content:center;gap:8px}
.ldw-iconbtn{display:inline-grid;place-items:center;width:26px;height:26px;border-radius:50%;border:1px solid var(--hk-stroke-strong);background:transparent;color:var(--hk-ink);cursor:pointer}
.ldw-iconbtn:hover{border-color:var(--hk-accent)}
.ldw-iconbtn:focus-visible,.ldw-switcher:focus-visible,.ldw-pstep:focus-visible{outline:2px solid var(--hk-accent);outline-offset:2px}
.ldw-preprow{display:flex;align-items:center;gap:8px;font-size:13px}
.ldw-preprow .hk-link{margin-left:auto}
.ldw-num{font-family:var(--hk-mono);font-variant-numeric:tabular-nums}
.ldw-center{justify-self:center}
.ldw-path{list-style:none;margin:0;padding:0 0 2px;display:flex;flex-wrap:wrap;gap:4px 22px;border-bottom:1px solid var(--hk-stroke)}
.ldw-path li{display:block}
.ldw-pstep{display:inline-flex;align-items:center;gap:7px;background:transparent;border:0;padding:6px 0 8px;font:inherit;font-size:13px;font-weight:600;color:var(--hk-ink);cursor:pointer;border-bottom:2px solid transparent;margin-bottom:-3px}
.ldw-pstep:hover:not(:disabled){border-bottom-color:var(--hk-stroke-strong)}
.ldw-pstep[aria-current=step]{border-bottom-color:var(--hk-accent)}
.ldw-pstep:disabled{cursor:default}
.ldw-pnum{display:inline-grid;place-items:center;width:20px;height:20px;border-radius:50%;border:1px solid var(--hk-stroke-strong);font-size:12px;font-weight:700}
.ldw-pstep[data-done] .ldw-pnum{border-color:var(--hk-good-fill);color:var(--hk-good)}
.ldw-benchgrid{grid-template-columns:minmax(0,1fr) 360px;gap:28px}
.ldw-case{background:transparent;border:0;padding:0;display:grid;gap:0;overflow:visible}
.ldw-timebar{background:transparent;border:0;padding:0 0 6px;font-weight:500}
.ldw-sec{padding:22px 0 22px 14px;border-bottom:0;border-top:1px solid var(--hk-stroke);gap:8px}
.ldw-sec:first-of-type{border-top:0}
.ldw-sec-actions{display:flex;gap:6px;align-items:center;flex-wrap:wrap}
.ldw-chip[aria-expanded=true]{border-color:var(--hk-stroke-strong);background:var(--hk-hover)}
.ldw-casehead{gap:10px}
.ldw-switcher{display:inline-flex;align-items:center;gap:8px;background:transparent;border:1px solid transparent;border-radius:var(--ldw-r);padding:4px 8px 4px 2px;font:inherit;font-size:18px;font-weight:700;color:var(--hk-ink);cursor:pointer;max-width:520px}
.ldw-switcher:hover,.ldw-switcher[aria-expanded=true]{border-color:var(--hk-stroke);background:var(--hk-hover)}
.ldw-switcher-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ldw-rename{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.ldw-rename input{min-width:260px;font-size:15px !important;font-weight:600}
.ldw-resrow-wrap{display:grid;gap:12px}
.ldw-resrow{gap:10px}
.ldw-thread{gap:16px}
.ldw-brief{gap:12px}
.ldw-brief-title{font-family:var(--ldw-serif);font-style:italic;font-weight:600;font-size:18px}
.ldw-brief-body{max-width:78ch}
.ldw-md-h{margin:20px 0 6px;font-size:16px;font-weight:700;font-family:inherit;line-height:1.3}
.ldw-md-h:first-child{margin-top:2px}
.ldw-md-h4{margin:12px 0 4px;font-family:var(--hk-mono);font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:color-mix(in srgb,var(--hk-accent) 82%,var(--hk-ink))}
.ldw-prose .ldw-md-h{font-family:var(--ldw-serif)}
.ldw-print .ldw-md-h{font-family:var(--hk-mono);font-size:15px;text-transform:uppercase;letter-spacing:.08em;margin:22px 0 6px}
@container (max-width:1060px){.ldw-benchgrid{grid-template-columns:1fr}.ldw-benchgrid>.ldw-coach{position:static;max-height:none}}
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
  name: 'Debate Workbench',
  register(ctx) {
    setApi(ctx)
    installStyles(ctx, PLUGIN_ID, CSS + FRAME_CSS)
    const open = view => () => { $view.set(view); $event.set('ld'); host.navigate(ROUTE) }
    const openEvent = id => () => { chooseEvent(id); host.navigate(ROUTE) }
    registerPage(ctx, {
      id: PLUGIN_ID, route: ROUTE, label: 'Debate', codicon: 'law',
      render: () => jsx(DebatePage, {}),
      palette: [
        { id: 'ld-workbench.room', label: 'Debate: open the Tournament Room', keywords: ['lincoln douglas', 'practice round', 'ballot'], run: open('room') },
        { id: 'ld-workbench.fallacies', contributionId: 'fallacies', label: 'Debate: practice logical fallacies', keywords: ['fallacy', 'logic', 'reasoning'], run: open('fallacies') },
        { id: 'ld-workbench.bench', contributionId: 'bench', label: 'Debate: open the Case Workbench', keywords: ['case', 'coach', 'lincoln douglas'], run: open('bench') },
        { id: 'ld-workbench.extemp', contributionId: 'extemp', label: 'Debate: practice a 60-second answer', keywords: ['extemp', 'speech', 'speaking', 'headlines'], run: openEvent('extemp') },
        { id: 'ld-workbench.rhetoric', contributionId: 'rhetoric', label: 'Debate: rhetoric and figures of speech', keywords: ['rhetoric', 'anaphora', 'speech', 'figures'], run: openEvent('rhetoric') },
        { id: 'ld-workbench.ballots', contributionId: 'ballots', label: 'Debate: my ballots and patterns', keywords: ['ballot', 'judge', 'progress'], run: openEvent('ballots') },
      ],
    })
    ctx.onDispose(() => { setApi(null) })
  },
}

// For the harness: open a view directly ("extemp", "rhetoric", "ballots", or a Lincoln-Douglas view).
export function openView(view) {
  if (EVENT_IDS.includes(view) || view === 'settings') $event.set(view)
  else { $event.set('ld'); $view.set(view) }
}

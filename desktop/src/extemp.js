// Extemp: the 60-second answer (the floor that opens first) and the full round: headlines from both
// sides, the student's file, the draw, 30 minutes of prep with the outline, the 7-minute speech, the ballot.

import { useEffect, useRef, useState } from 'react'
import { Fragment, jsx, jsxs } from 'react/jsx-runtime'
import { Button, Codicon, Input, Textarea, atom, useValue } from '@hermes/plugin-sdk'
import { Notice } from 'hermes-ui-kit'
import { $home, Choices, Thinking, api, cls, errText, fp, mmss, post, rest } from './core.js'
import { Clock, ExtempSheet, FILE_EMPTY_NOTE, LastTake, LiveWave, SpeakControls, Strip, mentionsFile, sendTake, takeSettled, useRecorder, useTakePoll } from './floor.js'
import { $coachOn, PrepCoach, StrongExample, TakeTwo, prepareExample, useCoachContext } from './coach.js'
import { PrimerButton, PrimerCards } from './primer.js'
import { FirstRun, SampleBallot, isFirstRun } from './firstrun.js'
import { useMarginSpot } from './margin.js'

export { $home } // declared in core.js, where the first paint keeps a copy of it
export const $extempMode = atom(null) // drill | openings | round (null: decide from the saved round)
// The question on the floor, shared by the 60-second answer, the openings lab and the full round's
// "your own question", so switching modes never loses it. { area, text, own }
export const $question = atom(null)
const $poolAt = atom(0)
const FALLBACK_Q = { area: 'us', text: 'Should your town spend more on roads or on parks?' }
const AREAS = { us: 'United States', international: 'International' }
const DRILL = 60
const PREP = 30 * 60
const SPEECH = 7 * 60

export async function loadHome() {
  try {
    const home = await rest('home')
    if (seenDue) markSeen()
    showHome(home)
    if (fp) fp.fresh('home', home)
  } catch (e) {
    // The frame shows its own load error. A kept copy the backend did not confirm leaves the page.
    if (fp && fp.isStale('home')) { $home.set(null); fp.failed('home') }
  }
}
// Put a home on the page: the backend's answer, or (kept: true, at register) the copy kept from the last
// answer (cache.js). A kept copy picks this visit's question but tells the backend only once the page opens.
export function showHome(home, { kept = false } = {}) {
  if (!home) return
  if (!$question.get()) startQuestion(home, !kept) // set with the home, so no floor ever renders on a placeholder
  $coachOn.set(!home.settings || home.settings.coach_examples !== false)
  $home.set(home)
}
// The first question this visit: where the rotation stands. The backend moves it one along per visit, so a
// student never opens on the same question twice in a row.
let seenDue = false
function startQuestion(home, tellNow) {
  const pool = home.pool || []
  const at = pool.length ? (home.pool_start || 0) % pool.length : 0
  $poolAt.set(at)
  $question.set(pool.length ? { area: pool[at].area, text: pool[at].text } : FALLBACK_Q)
  if (tellNow) markSeen()
  else seenDue = true
}
// The next visit opens one along; the kept copy of the home learns where, so it never repeats this question.
function markSeen() {
  seenDue = false
  post('extemp/questions/seen').then(r => { if (fp && r && Number.isInteger(r.next)) fp.stick('home', { pool_start: r.next }) }, () => {})
}

function dateOf(t) {
  if (!t) return ''
  return new Date(t * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
// Web links only, and only in the user's own browser.
// When Hermes cannot open a browser (openExternal answers false or is missing), the link is shown to copy.
const $linkMiss = atom(null)
export function openLink(url) {
  if (!/^https?:\/\//i.test(String(url || ''))) return false
  const miss = () => $linkMiss.set(String(url))
  $linkMiss.set(null)
  if (api && api.os && typeof api.os.openExternal === 'function') {
    Promise.resolve(api.os.openExternal(url)).then(ok => { if (ok === false) miss() }, miss)
    return true
  }
  miss()
  return false
}
function LinkMiss() {
  const url = useValue($linkMiss)
  if (!url) return null
  return jsx(Notice, { tone: 'warn', children: jsxs(Fragment, { children: ['Hermes could not open your browser. Copy the link instead: ', jsx('span', { className: 'ldw-linkmiss', children: url })] }),
    action: jsx(Button, { size: 'sm', variant: 'secondary', onClick: () => $linkMiss.set(null), children: 'Close' }) })
}

/* ------------------------------------------------------------------ the take, judged -- */

// Record or type a take, wait for the transcript, then ask for the ballot. Shared by the drill and the round.
function useJudgedTake({ event, limit, question, outline, initial, onBallot, judgeExtra }) {
  const [take, setTake] = useState(initial || null)
  const [ballot, setBallot] = useState(null)
  const [busy, setBusy] = useState(null) // sending | judging
  const [err, setErr] = useState(null)
  useTakePoll(take, setTake)
  const judge = async t => {
    setBusy('judging'); setErr(null)
    try {
      const b = await post(`speech/${t.id}/judge`, { question, outline, ...((judgeExtra && judgeExtra.current) || {}) })
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

function useQuestion() {
  return useValue($question) || FALLBACK_Q
}
function anotherQuestion(home) {
  const pool = (home && home.pool) || []
  if (!pool.length) return
  const cur = ($question.get() || {}).text
  let at = $poolAt.get()
  for (let k = 0; k < pool.length; k++) { at = (at + 1) % pool.length; if (pool[at].text !== cur) break }
  $poolAt.set(at)
  $question.set({ area: pool[at].area, text: pool[at].text })
}

// Under the question: another one, one of your own (a coach's, or from a tournament), or the whole list.
function QuestionTools({ home, disabled }) {
  const [open, setOpen] = useState(null) // own | list
  const [text, setText] = useState('')
  const [area, setArea] = useState('us')
  const [keep, setKeep] = useState(true)
  const [err, setErr] = useState(null)
  const [busy, setBusy] = useState(false)
  const use = async () => {
    const t = text.trim().replace(/\s+/g, ' ')
    if (t.length < 12) { setErr('Write the question out in full.'); return }
    setBusy(true); setErr(null)
    try {
      const q = t.endsWith('?') ? t : `${t}?`
      if (keep) await post('extemp/questions', { text: q, area })
      $question.set({ area, text: q, own: true })
      if (keep) loadHome()
      setText(''); setOpen(null)
    } catch (e) { setErr(errText(e)) } finally { setBusy(false) }
  }
  return jsxs('div', { className: 'ldw-qtools', children: [
    jsxs('div', { className: 'ldw-qlinks', children: [
      jsx('button', { type: 'button', className: 'hk-link', disabled, onClick: () => { setOpen(null); anotherQuestion(home) }, children: 'Another question' }),
      jsx('button', { type: 'button', className: 'hk-link', disabled, 'aria-expanded': open === 'own', onClick: () => setOpen(open === 'own' ? null : 'own'), children: 'Write your own' }),
      jsx('button', { type: 'button', className: 'hk-link', disabled, 'aria-expanded': open === 'list', onClick: () => setOpen(open === 'list' ? null : 'list'), children: 'Question list' }),
    ] }),
    open === 'own' ? jsxs('div', { className: 'ldw-qown', children: [
      jsx(Input, { className: 'ldw-qown-input', 'aria-label': 'Your question', value: text, placeholder: 'A question from your coach or your circuit',
        onChange: e => setText(e.target.value), onKeyDown: e => { if (e.key === 'Enter') use() } }),
      jsxs('div', { className: 'ldw-qown-row', children: [
        jsx(Choices, { label: 'Area', value: area, onChange: setArea, options: [{ id: 'us', label: 'United States' }, { id: 'international', label: 'International' }] }),
        jsxs('label', { className: 'ldw-check', children: [jsx('input', { type: 'checkbox', checked: keep, onChange: e => setKeep(e.target.checked) }), 'Keep it on my question list'] }),
        jsx(Button, { size: 'sm', loading: busy, disabled: text.trim().length < 12, onClick: use, children: 'Use this question' }),
      ] }),
      err ? jsx(Notice, { tone: 'bad', children: err }) : null,
    ] }) : null,
    open === 'list' ? jsx(QuestionList, { onPick: q => { $question.set({ area: q.area, text: q.text, own: q.own }); setOpen(null) } }) : null,
  ] })
}

// The question list: your own questions first (a coach can add this week's three and ask only those), then the
// built-in ones, any of which can be hidden.
function QuestionList({ onPick }) {
  const [data, setData] = useState(null)
  const [err, setErr] = useState(null)
  const [text, setText] = useState('')
  const [area, setArea] = useState('us')
  const act = async fn => { setErr(null); try { setData(await fn()); loadHome() } catch (e) { setErr(errText(e)) } }
  useEffect(() => { rest('extemp/questions').then(setData, e => setErr(errText(e))) }, [])
  if (!data) return err ? jsx(Notice, { tone: 'bad', children: err }) : jsx(Thinking, { label: 'Opening the question list' })
  const own = data.questions.filter(q => q.own)
  const built = data.questions.filter(q => !q.own)
  const hidden = built.filter(q => q.hidden).length
  const row = q => jsxs('li', { className: cls('ldw-qrow', q.hidden && 'ldw-qrow-hidden'), children: [
    jsxs('div', { className: 'ldw-qrow-text', children: [jsx('span', { children: q.text }), jsx('span', { className: 'ldw-meta', children: `${AREAS[q.area] || 'United States'} · ${q.own ? 'yours' : q.topic}${q.hidden ? ' · hidden' : ''}` })] }),
    jsxs('div', { className: 'hk-actions', children: [
      !q.hidden ? jsx('button', { type: 'button', className: 'hk-link', onClick: () => onPick(q), children: 'Ask this one' }) : null,
      !q.hidden ? jsx('button', { type: 'button', className: 'hk-link', 'aria-label': `${q.own ? 'Delete' : 'Hide'}: ${q.text}`, onClick: () => act(() => post(`extemp/questions/${encodeURIComponent(q.id)}/delete`)), children: q.own ? 'Delete' : 'Hide' }) : null,
    ] }),
  ] }, q.id)
  return jsxs('section', { className: 'ldw-qlist', 'aria-label': 'Question list', children: [
    jsx('h3', { className: 'ldw-h3', children: `Your questions · ${own.length}` }),
    own.length ? jsx('ul', { className: 'ldw-qrows', children: own.map(row) }) : jsx('p', { className: 'ldw-meta', children: 'None yet. Add the questions your coach hands out, or ones from your circuit.' }),
    jsxs('div', { className: 'ldw-qown-row', children: [
      jsx(Input, { className: 'ldw-qown-input', 'aria-label': 'A question to add', value: text, placeholder: 'Add a question', onChange: e => setText(e.target.value),
        onKeyDown: e => { if (e.key === 'Enter' && text.trim().length >= 12) act(() => post('extemp/questions', { text, area })).then(() => setText('')) } }),
      jsx(Choices, { label: 'Area of the question to add', value: area, onChange: setArea, options: [{ id: 'us', label: 'United States' }, { id: 'international', label: 'International' }] }),
      jsx(Button, { size: 'sm', disabled: text.trim().length < 12, onClick: () => act(() => post('extemp/questions', { text, area })).then(() => setText('')), children: 'Add' }),
    ] }),
    own.length ? jsxs('label', { className: 'ldw-check', children: [jsx('input', { type: 'checkbox', checked: data.mine_only, onChange: e => act(() => post('extemp/questions', { mine_only: e.target.checked })) }),
      'Ask only my questions'] }) : null,
    err ? jsx(Notice, { tone: 'bad', children: err }) : null,
    jsxs('details', { className: 'ldw-qbuilt', children: [
      jsx('summary', { children: `Built-in questions · ${built.length - hidden} of ${built.length}${data.mine_only ? ', not asked while only yours are' : ''}` }),
      hidden ? jsx('button', { type: 'button', className: 'hk-link', onClick: () => act(() => post('extemp/questions/restore')), children: `Show the ${hidden} hidden again` }) : null,
      jsx('ul', { className: 'ldw-qrows', children: built.map(row) }),
    ] }),
  ] })
}

function Floor({ limit, label, jt, startLabel, extra }) {
  const live = jt.recorder.state === 'live' || jt.recorder.state === 'armed'
  return jsxs(Fragment, { children: [
    !jt.ballot ? jsxs('div', { className: 'ldw-stage2', children: [
      jsx(Clock, { limit, elapsed: jt.recorder.elapsed, live, label }),
      jsx(SpeakControls, { rec: jt.recorder, onTyped: text => jt.got({ typed: text }), startLabel, extra, typedLabel: 'Judge my answer' }),
    ] }) : null,
    live ? jsx(LiveWave, { rec: jt.recorder, limit }) : null,
    jt.busy === 'sending' ? jsx(Thinking, { label: 'Saving your take' }) : null,
    jt.err ? jsx(Notice, { tone: 'bad', children: jt.err, action: jt.take && !jt.ballot ? jsx(Button, { size: 'sm', variant: 'secondary', onClick: () => jt.judge(jt.take), children: 'Ask for the ballot again' }) : null }) : null,
    jt.take && !live ? jsx(LastTake, { take: jt.take, limit, title: jt.ballot ? 'Your take' : 'Your take, just now', onChange: jt.setTake }) : null,
    jt.busy === 'judging' ? jsx(Thinking, { label: 'The judge is writing the ballot' }) : null,
  ] })
}

/* ------------------------------------------------------------------ the 60-second answer -- */

function Slip({ kicker, question, side, tools }) {
  return jsxs('div', { className: 'ldw-slip', children: [
    jsxs('div', { children: [
      jsx('div', { className: 'ldw-kicker', children: kicker }),
      jsx('h2', { className: 'ldw-question', children: question }),
      tools || null,
    ] }),
    side ? jsx('div', { className: 'ldw-outline-side', children: side }) : null,
  ] })
}

function DrillFloor({ home, modeSwitch }) {
  const q = useQuestion()
  const last = home.last_take && home.last_take.drill
  const extra = useRef(null) // { after_example } once the student tries again after the coach's example
  const [prev, setPrev] = useState(null) // Take 1 and the example it got, kept for the Take 2 row
  const [shown2, setShown2] = useState(null) // the coach's example open on this take, if any: either Try it again keeps Take 1 then
  const jt = useJudgedTake({ event: 'drill', limit: DRILL, question: q.text, initial: last && last.prompt === q.text ? last : null, onBallot: () => { loadHome() }, judgeExtra: extra }) // the new drill goes under the floor
  const live = jt.recorder.state === 'live' || jt.recorder.state === 'armed'
  const shown = useRef(q.text)
  useEffect(() => { if (shown.current !== q.text) { shown.current = q.text; jt.reset(); setPrev(null); setShown2(null); extra.current = null } }, [q.text]) // a new question, a clean floor
  const again = example => { // Try it again from the compare: Take 1 and its example stay for the Take 2 row
    setPrev({ take: jt.take, ballot: jt.ballot, example })
    extra.current = { after_example: example.id }
    setShown2(null)
    jt.reset()
  }
  const plain = () => (shown2 ? again(shown2) : (setPrev(null), extra.current = null, jt.reset()))
  // The coach's example is prepared in the background when the ballot lands (said in Settings, What leaves your computer).
  useEffect(() => { if (jt.ballot && jt.take) prepareExample({ takeId: jt.take.id, question: q.text }) }, [jt.ballot && jt.ballot.at])
  const fileEmpty = !home.file_count
  const phase = jt.ballot ? 'ballot' : live ? 'live' : jt.take ? 'taken' : 'ready'
  const first = isFirstRun(home)
  useCoachContext({ floor: 'extemp', question: q.text, take_id: jt.take ? jt.take.id : null, ballot_at: jt.ballot ? jt.ballot.at : null,
    sees: ['the question', jt.take && 'your answer', jt.ballot && 'the ballot', !fileEmpty && 'your file'] }, [q.text, jt.take && jt.take.id, jt.ballot && jt.ballot.at, fileEmpty])
  return jsxs(Fragment, { children: [
    jsx(Strip, { segments: [
      { key: 'answer', code: 'Answer 1:00', sub: phase === 'live' ? 'Now' : phase === 'ready' ? 'Lead with your answer' : 'Done', minutes: 1, min: 220,
        state: phase === 'ballot' ? 'done' : 'now', fill: live ? jt.recorder.elapsed / DRILL : 0 },
      { key: 'ballot', code: 'Ballot', sub: jt.busy === 'judging' ? 'Writing' : jt.ballot ? `${jt.ballot.points ?? ''} points` : '', minutes: 0.45, min: 120, state: phase === 'ballot' ? 'now' : 'later' },
    ] }),
    jsx(Slip, { kicker: [`60-second answer, ${AREAS[q.area] || 'United States'}`, modeSwitch], question: q.text, tools: jsx(QuestionTools, { home, disabled: live }) }),
    prev && jt.take && prev.take ? jsx(TakeTwo, { take1: prev.take.id, take2: jt.take.id, exampleId: prev.example.id, ready: !!jt.ballot }) : null,
    jt.ballot ? jsx(ExtempSheet, { b: jt.ballot, take: jt.take, drillLabel: 'Try it again', drillLink: true, onDrill: plain, fileEmpty, showMe: false }) : null,
    jt.ballot && jt.take ? jsx(StrongExample, { kind: 'answer', question: q.text, takeIds: [jt.take.id], onAgain: again, onExample: setShown2 }) : null,
    jsx(Floor, { limit: DRILL, label: null, jt, startLabel: 'Start speaking', extra: jsx(PrimerButton, { question: q.text }) }),
    jsx(PrimerCards, { question: q.text }), // under the clock (C3): Start speaking stays above the fold while the primer runs
    first && phase === 'ready' ? jsx(FirstRun, {}) : null,
    first && phase === 'ready' ? jsx(SampleBallot, {}) : null,
    !jt.take && !live && home.next_drill ? jsxs('div', { className: 'ldw-upnext', children: [
      jsx('span', { className: 'ldw-stamp2 ldw-stamp-sm', children: 'Drill' }),
      jsxs('p', { children: [jsx('strong', { children: home.next_drill.name }), `. ${home.next_drill.how}`,
        fileEmpty && mentionsFile(home.next_drill) ? jsx('span', { className: 'ldw-drill-note', children: ` ${FILE_EMPTY_NOTE}` }) : null] }),
      jsx('span', { className: 'ldw-meta', children: 'From your last ballot' }),
    ] }) : null,
  ] })
}

/* ------------------------------------------------------------------ the openings lab -- */

const OPENING = 45

// One opening's card: what was said (serif) and how long it took, polled until its transcript is in.
function OpeningCard({ n, take, setTake, best, note, active, onRedo }) {
  useTakePoll(take, setTake)
  const st = take && take.transcript.status
  const s = (take && take.stats) || {}
  const secs = s.estimated ? s.estimated_seconds : s.speaking
  return jsxs('article', { className: cls('ldw-ocard', best && 'ldw-ocard-best'), 'data-active': active ? '' : undefined, 'aria-label': `Opening ${n}`, children: [
    jsxs('div', { className: 'ldw-ocard-head', children: [
      jsx('b', { children: `Opening ${n}` }),
      best ? jsx('span', { className: 'ldw-stamp2 ldw-stamp-sm ldw-stamp-best', children: 'Strongest' }) : null,
      take ? jsx('span', { className: cls('ldw-num', secs > OPENING + 5 && 'ldw-bad'), children: `${mmss(secs || 0)}${s.estimated ? ', estimated' : ''}` }) : jsx('span', { className: 'ldw-meta', children: active ? 'Next' : '' }),
    ] }),
    take && (st === 'done' || st === 'typed') ? jsx('p', { className: 'ldw-spoken ldw-ocard-said', children: take.transcript.text || 'No words were caught.' }) : null,
    take && (st === 'waiting' || st === 'working') ? jsx(Thinking, { label: 'Making the transcript' }) : null,
    take && ['unavailable', 'failed', 'cancelled'].includes(st) ? jsx(LastTake, { take, limit: OPENING, title: 'Timing only', onChange: setTake }) : null,
    note ? jsxs('div', { className: 'ldw-onote', children: [
      note.worked ? jsxs('p', { children: [jsx('b', { children: 'Worked: ' }), note.worked] }) : null,
      note.fix ? jsxs('p', { children: [jsx('b', { children: 'Fix: ' }), note.fix] }) : null,
    ] }) : null,
    take ? jsx('button', { type: 'button', className: 'hk-link', onClick: onRedo, children: 'Give this one again' }) : null,
  ] })
}

// Three attention-getters for one question, 45 seconds each, out loud. The coach picks the strongest
// and says why; then, on the student's press, the coach shows one of its own (coach.js StrongExample).
function OpeningsFloor({ home, modeSwitch }) {
  const q = useQuestion()
  const [takes, setTakes] = useState([null, null, null])
  const [slot, setSlot] = useState(0)
  const [busy, setBusy] = useState(null)
  const [err, setErr] = useState(null)
  const [coach, setCoach] = useState(null)
  const setAt = k => t => setTakes(prev => prev.map((x, j) => (j === k ? t : x)))
  const got = async rec => {
    const k = slot
    setBusy('sending'); setErr(null); setCoach(null)
    try {
      setAt(k)(await sendTake({ event: 'opening', segment: `o${k + 1}`, limit: OPENING, prompt: q.text }, rec))
      const nextFree = [0, 1, 2].find(j => j !== k && !takes[j])
      if (nextFree !== undefined) setSlot(nextFree)
    } catch (e) { setErr(errText(e)) } finally { setBusy(null) }
  }
  const rec = useRecorder({ limit: OPENING, onTake: got })
  const live = rec.state === 'live' || rec.state === 'armed'
  const ready = takes.every(t => t && ['done', 'typed'].includes(t.transcript.status) && t.transcript.text)
  const ask = async () => {
    setBusy('coach'); setErr(null)
    try { setCoach(await post('openings/coach', { question: q.text, take_ids: takes.map(t => t.id) })) } catch (e) { setErr(errText(e)) } finally { setBusy(null) }
  }
  const shown = useRef(q.text)
  useEffect(() => { // a new question: three fresh openings
    if (shown.current === q.text) return
    shown.current = q.text; setTakes([null, null, null]); setSlot(0); setCoach(null); setErr(null)
  }, [q.text])
  const notes = Object.fromEntries(((coach && coach.notes) || []).map(x => [x.n, x]))
  const given = takes.filter(Boolean)
  useCoachContext({ floor: 'extemp', question: q.text, take_ids: given.map(t => t.id),
    sees: ['the question', given.length && `your ${given.length === 1 ? 'opening' : `${given.length} openings`}`] }, [q.text, given.map(t => t.id).join(',')])
  return jsxs(Fragment, { children: [
    jsx(Strip, { segments: [
      ...[0, 1, 2].map(k => ({ key: `o${k}`, code: `Opening ${k + 1} 0:45`, sub: takes[k] ? 'Done' : k === slot ? (live ? 'Now' : 'Next') : '', minutes: 0.75, min: 150,
        state: k === slot && !coach ? 'now' : takes[k] ? 'done' : 'later', fill: live && k === slot ? rec.elapsed / OPENING : 0, onClick: live ? null : () => setSlot(k) })),
      { key: 'coach', code: 'Coach', sub: coach ? `Opening ${coach.best || '?'}` : 'Picks one', minutes: 0.5, min: 110, state: coach ? 'now' : 'later' },
    ] }),
    jsx(Slip, { kicker: [`Openings · ${AREAS[q.area] || 'United States'}`, modeSwitch], question: q.text, tools: jsx(QuestionTools, { home, disabled: live }) }),
    jsxs('div', { className: 'ldw-stage2', children: [
      jsx(Clock, { limit: OPENING, elapsed: rec.elapsed, live, label: `Opening ${slot + 1} of 3` }),
      jsx(SpeakControls, { rec, onTyped: text => got({ typed: text }), startLabel: `Give opening ${slot + 1}${takes[slot] ? ' again' : ''}` }),
    ] }),
    live ? jsx(LiveWave, { rec, limit: OPENING }) : null,
    busy === 'sending' ? jsx(Thinking, { label: 'Saving your opening' }) : null,
    jsx('div', { className: 'ldw-ocards', children: [0, 1, 2].map(k => jsx(OpeningCard, { n: k + 1, take: takes[k], setTake: setAt(k), active: k === slot && !live && !takes[k],
      best: coach && coach.best === k + 1, note: notes[k + 1], onRedo: () => { setSlot(k); setCoach(null) } }, k)) }),
    coach ? jsxs('section', { className: 'ldw-ocoach', 'aria-label': 'The coach', children: [
      jsx('h3', { className: 'ldw-h3', children: coach.best ? `Opening ${coach.best} is the strongest` : 'The coach' }),
      coach.why ? jsx('p', { children: coach.why }) : null,
      coach.next ? jsxs('div', { className: 'ldw-drillrow', children: [jsx('span', { className: 'ldw-stamp2', children: 'Next' }), jsx('p', { children: coach.next })] }) : null,
    ] }) : null,
    coach ? jsx(StrongExample, { kind: 'opening', question: q.text, takeIds: takes.map(t => t.id), best: coach.best }) : null,
    !coach ? jsx('div', { children: jsx(Button, { loading: busy === 'coach', disabled: !ready || live, onClick: ask,
      children: ready ? 'Ask the coach which one is strongest' : `Give all three openings, then ask the coach (${takes.filter(Boolean).length} of 3)` }) }) : null,
    err ? jsx(Notice, { tone: 'bad', children: err }) : null,
  ] })
}

/* ------------------------------------------------------------------ headlines -- */

const SIDE_TITLES = { left: 'Left and lean left', center: 'Center and wires', right: 'Right and lean right' }

function HeadlineColumns({ pull, saved, onSave }) {
  const outlets = Object.fromEntries((pull.outlets || []).map(o => [o.id, o]))
  return jsxs('section', { className: 'ldw-heads', 'aria-label': `Headlines on ${pull.topic}`, children: [
    pull.notice ? jsx(Notice, { tone: 'warn', children: pull.notice }) : null,
    jsx(LinkMiss, {}),
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

export function OutletEditor({ onClose, embedded }) {
  const [data, setData] = useState(null)
  const [rows, setRows] = useState([])
  const [err, setErr] = useState(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => { rest('outlets').then(d => { setData(d); setRows(d.outlets) }, e => setErr(errText(e))) }, [])
  if (!data) return err ? jsx(Notice, { tone: 'bad', children: err }) : jsx(Thinking, { label: 'Loading your outlets' })
  const set = (i, k, v) => setRows(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)))
  const save = async body => { setBusy(true); setErr(null); try { const d = await post('outlets', body); setRows(d.outlets); setData({ ...data, ...d }); onClose(d) } catch (e) { setErr(errText(e)) } finally { setBusy(false) } }
  const counts = { left: 0, center: 0, right: 0 }
  const leans = { left: 0, center: 0, right: 0 }
  const leanSide = l => (/Left/.test(l) ? 'left' : /Right/.test(l) ? 'right' : 'center')
  rows.forEach(r => { counts[r.side] = (counts[r.side] || 0) + 1; leans[leanSide(r.lean)] += 1 })
  const lopsided = (counts.left || counts.right) && (counts.left >= 2 * Math.max(1, counts.right) || counts.right >= 2 * Math.max(1, counts.left))
  return jsxs('section', { className: embedded ? 'hk-stack ldw-outlets-embedded' : 'ldw-panel', 'aria-label': 'Your outlets', children: [
    embedded ? null : jsx('h3', { className: 'ldw-h2', children: 'Your outlets' }),
    jsx('p', { className: 'ldw-meta', children: `By column, ${counts.left} left, ${counts.center} center, ${counts.right} right. By label, ${leans.left} left or lean left, ${leans.center} center, ${leans.right} right or lean right. Lean labels: AllSides, checked ${data.labels_checked}. Change any label you disagree with.` }),
    lopsided ? jsx(Notice, { tone: 'warn', children: `One side has twice the outlets of the other. Add from the ${counts.left < counts.right ? 'left' : 'right'} to read both sides.` }) : null,
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
      embedded ? null : jsx(Button, { size: 'sm', variant: 'secondary', onClick: () => onClose(null), children: 'Cancel' }),
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
  const held = useValue($question)
  const [area, setArea] = useState(held && held.area === 'international' ? 'international' : 'us')
  const [prepMode, setPrepMode] = useState('files')
  const [drawn, setDrawn] = useState(null)
  const [own, setOwn] = useState(held ? held.text : '')
  const [editing, setEditing] = useState(false)
  const [fileCount, setFileCount] = useState(home.file_count || 0)
  useCoachContext({ floor: 'extemp', sees: [fileCount && 'your file', 'the draw'] }, [fileCount])
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
    try { onStart(await post('extemp/round/start', { question: text, area, mode: prepMode })) } catch (e) { setErr(errText(e)); setBusy(null) }
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
      jsx(Choices, { label: 'Area', value: area, onChange: setArea, options: [{ id: 'us', label: 'United States' }, { id: 'international', label: 'International' }] }),
      jsx(Choices, { label: 'Prep rules', value: prepMode, onChange: setPrepMode, options: [{ id: 'files', label: 'Prep: files only' }, { id: 'internet', label: 'Prep: internet allowed' }] }),
      jsx(Button, { loading: busy === 'draw', disabled: !fileCount && !pull, 'aria-describedby': !fileCount && !pull ? 'ldw-draw-why' : undefined, onClick: draw, children: 'Draw three questions' }),
    ] }),
    !fileCount && !pull ? jsx('p', { id: 'ldw-draw-why', className: 'ldw-why-off', children: 'The draw writes three questions from this week\'s news, so it needs some first. Pull headlines on a topic above, or save a source to your file. Or prep a question of your own, below.' }) : null,
    err ? jsx(Notice, { tone: 'bad', children: err }) : null,
    drawn && drawn.questions.length ? jsx('ol', { className: 'ldw-drawn', children: drawn.questions.map((q, k) => jsx('li', { children: jsxs('button', { type: 'button', className: 'ldw-drawn-q', disabled: busy === 'start', onClick: () => start(q.text), children: [
      jsx('span', { className: 'ldw-kicker', children: `Question ${k + 1} of 3` }), jsx('span', { className: 'ldw-question-sm', children: q.text })] }) }, k)) }) : null,
    drawn && drawn.fallback ? jsxs('section', { className: 'ldw-panel', children: [
      jsx(Notice, { tone: 'warn', children: `${drawn.notice} Write your own question from these headlines.` }),
      jsx('ul', { className: 'ldw-list', children: drawn.headlines.map((h, k) => jsx('li', { children: h }, k)) }),
    ] }) : null,
    jsxs('section', { className: 'ldw-ownq', 'aria-label': 'Your own question', children: [
      jsx('h3', { className: 'ldw-h3', children: 'Or prep a question of your own' }),
      jsx('p', { className: 'ldw-meta', children: 'One your coach handed out, one from your circuit, or the one you just practiced. It uses the area and prep rules above.' }),
      jsxs('div', { className: 'ldw-pullrow', children: [
        jsx(Input, { className: 'ldw-topic', 'aria-label': 'Your question', value: own, placeholder: 'Your question', onChange: e => setOwn(e.target.value),
          onKeyDown: e => { if (e.key === 'Enter' && own.trim().length >= 12) start(own) } }),
        jsx(Button, { loading: busy === 'start', disabled: own.trim().length < 12 || busy === 'start', onClick: () => start(own), children: 'Prep this question' }),
      ] }),
    ] }),
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

// "Internet allowed" prep: the student's own Hermes web search. Results are titles and links; saving one
// puts it in the file and picks it as a source for this speech.
function WebSearch({ question, onSaved }) {
  const [q, setQ] = useState('')
  const [res, setRes] = useState(null)
  const [busy, setBusy] = useState(null)
  const [err, setErr] = useState(null)
  const [saved, setSaved] = useState(new Set())
  const go = async () => {
    setBusy('search'); setErr(null)
    try { setRes(await post('extemp/search', { query: q })) } catch (e) { setErr(errText(e)) } finally { setBusy(null) }
  }
  const save = async r => {
    setBusy(r.url); setErr(null)
    try {
      const item = await post('extemp/file', { title: r.title, url: r.url, outlet: r.site, note: r.snippet, at: Math.floor(Date.now() / 1000), topics: [] })
      setSaved(new Set([...saved, r.url])); onSaved(item)
    } catch (e) { setErr(errText(e)) } finally { setBusy(null) }
  }
  return jsxs('section', { className: 'ldw-web', 'aria-label': 'Search the web', children: [
    jsx('h3', { className: 'ldw-h3', children: 'Search the web' }),
    jsxs('div', { className: 'ldw-pullrow', children: [
      jsx(Input, { className: 'ldw-topic', 'aria-label': 'Search words', value: q, placeholder: 'The question, or your own words', onChange: e => setQ(e.target.value), onKeyDown: e => { if (e.key === 'Enter') go() } }),
      jsx(Button, { loading: busy === 'search', onClick: go, children: jsxs(Fragment, { children: [jsx(Codicon, { name: 'search' }), 'Search'] }) }),
    ] }),
    busy === 'search' ? jsx(Thinking, { label: 'Searching with your Hermes web search' }) : null,
    err ? jsx(Notice, { tone: 'bad', children: err }) : null,
    jsx(LinkMiss, {}),
    res && !res.results.length ? jsx('p', { className: 'ldw-meta', children: `Nothing came back for "${res.query}". Try fewer words.` }) : null,
    res && res.results.length ? jsx('ol', { className: 'ldw-webres', children: res.results.map(r => jsxs('li', { children: [
      jsxs('div', { className: 'ldw-webres-text', children: [
        jsx('button', { type: 'button', className: 'ldw-head-link', onClick: () => openLink(r.url), children: r.title }),
        jsxs('span', { className: 'ldw-meta', children: [jsx('b', { children: r.site }), r.snippet ? ` · ${r.snippet}` : ''] }),
      ] }),
      saved.has(r.url) ? jsx('span', { className: 'ldw-meta', children: 'In your file' })
        : jsx(Button, { size: 'sm', variant: 'secondary', loading: busy === r.url, onClick: () => save(r), children: 'Save as a source' }),
    ] }, r.url)) }) : null,
  ] })
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
  useMarginSpot('extemp-prep') // the coach margin opens by itself on prep
  useCoachContext({ floor: 'extemp', round: true, sees: ['the question', 'your outline', file.length && 'your file'] }, [round.id, file.length])
  const useArea = (i, title) => { const k = `area${i + 1}`; change(k, outline[k] && outline[k].trim() ? `${outline[k].trim()}\n${title}` : title) }
  const [removing, setRemoving] = useState(null)
  const [fileErr, setFileErr] = useState(null)
  const remove = async item => {
    setFileErr(null)
    try {
      await post(`extemp/file/${encodeURIComponent(item.id)}/delete`)
      setFile(file.filter(i => i.id !== item.id))
      if (outline.sources.includes(item.id)) change('sources', outline.sources.filter(x => x !== item.id))
    } catch (e) { setFileErr(errText(e)) } finally { setRemoving(null) }
  }
  return jsxs(Fragment, { children: [
    jsx(Strip, { segments: [
      { key: 'draw', code: 'Draw', sub: AREAS[round.area], minutes: 3, min: 120, state: 'done' },
      { key: 'prep', code: `Prep ${mmss(prep.left)}`, sub: 'Now', minutes: 30, state: 'now', fill: 1 - prep.left / PREP },
      { key: 'speak', code: 'Speak 7:00', minutes: 7, state: 'later' },
      { key: 'ballot', code: 'Ballot', minutes: 2.4, min: 90, state: 'later' },
    ] }),
    jsx(Slip, { kicker: [`Prep · ${AREAS[round.area]} · ${round.mode === 'internet' ? 'internet allowed' : 'files only'}`, modeSwitch], question: round.question }),
    jsxs('div', { className: 'ldw-prep', children: [
      jsxs('div', { className: 'ldw-prep-main', children: [
        jsx('div', { className: 'ldw-outline', children: OUTLINE.map(([k, label]) => jsxs('label', { className: 'ldw-ofield', children: [
          jsx('span', { children: label }),
          jsx(Textarea, { value: outline[k], 'aria-label': label, onChange: e => change(k, e.target.value), rows: k.startsWith('area') ? 3 : 2 }),
        ] }, k)) }),
        jsx(PrepCoach, { outline, file, picked: outline.sources, onUseArea: useArea, onPick: id => { if (!outline.sources.includes(id)) toggleSource(id) } }),
      ] }),
      jsxs('aside', { className: 'ldw-prep-side', children: [
        jsxs('div', { className: 'ldw-prepclock', children: [jsx('span', { className: 'ldw-num', children: mmss(prep.left) }),
          jsx('button', { type: 'button', className: 'hk-link', onClick: prep.toggle, children: prep.running ? 'Pause prep' : 'Resume prep' })] }),
        jsx('h3', { className: 'ldw-h3', children: `Sources from your file · ${chosen.length} picked` }),
        fileErr ? jsx(Notice, { tone: 'bad', children: fileErr }) : null,
        file.length ? jsx('ul', { className: 'ldw-srcs', children: file.slice(0, 40).map(i => jsxs('li', { children: [
          jsxs('div', { className: 'ldw-src-row', children: [
            jsxs('label', { children: [
              jsx('input', { type: 'checkbox', checked: outline.sources.includes(i.id), onChange: () => toggleSource(i.id) }),
              jsxs('span', { children: [jsx('b', { children: i.outlet || 'Saved link' }), ` · ${dateOf(i.at) || 'no date'} · ${i.title}`] }),
            ] }),
            removing === i.id ? null : jsx('button', { type: 'button', className: 'hk-link ldw-src-remove', 'aria-label': `Remove ${i.title} from your file`, onClick: () => setRemoving(i.id), children: 'Remove' }),
          ] }),
          removing === i.id ? jsx(Notice, { tone: 'warn', children: 'Remove it from your file for good?', action: jsxs('div', { className: 'hk-actions', children: [
            jsx(Button, { size: 'sm', variant: 'secondary', className: 'ldw-danger', onClick: () => remove(i), children: 'Remove' }),
            jsx(Button, { size: 'sm', variant: 'secondary', onClick: () => setRemoving(null), children: 'Keep it' }),
          ] }) }) : null,
        ] }, i.id)) }) : jsx('p', { className: 'ldw-meta', children: 'Your file is empty. Pull headlines and save a few before your next round.' }),
        round.mode === 'internet' ? jsx(WebSearch, { question: round.question, onSaved: item => { setFile([item, ...file]); change('sources', [...outline.sources, item.id]) } }) : null,
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
  useCoachContext({ floor: 'extemp', round: true, take_id: jt.take ? jt.take.id : null, ballot_at: jt.ballot ? jt.ballot.at : null,
    sees: ['the question', 'your outline', jt.take && 'your speech', jt.ballot && 'the ballot'] }, [round.id, jt.take && jt.take.id, jt.ballot && jt.ballot.at])
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
  const modeSwitch = jsx(Choices, { key: 'mode', label: 'Extemp practice', value: mode, onChange: v => $extempMode.set(v),
    options: [{ id: 'drill', label: '60-second answer' }, { id: 'openings', label: 'Openings' }, { id: 'round', label: 'Full round' }] })
  const sw = jsx('span', { className: 'ldw-modeswitch', children: modeSwitch }, 'sw')
  if (mode === 'openings') return jsx(OpeningsFloor, { home, modeSwitch: sw })
  return mode === 'drill' ? jsx(DrillFloor, { home, modeSwitch: sw }) : jsx(RoundFloor, { home, modeSwitch: sw })
}

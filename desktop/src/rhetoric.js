// Rhetoric: read a great speech with its figures marked (every mark checked against the text), learn the
// figures by the effect they make, spot one in a real line, write your own, then say it out loud.

import { useEffect, useRef, useState } from 'react'
import { Fragment, jsx, jsxs } from 'react/jsx-runtime'
import { Button, Textarea, atom, useValue } from '@hermes/plugin-sdk'
import { Notice } from 'hermes-ui-kit'
import { Thinking, cls, errText, post, renderText, rest, words } from './core.js'
import { Clock, LastTake, SpeakControls, Strip, sendTake, useRecorder, useTakePoll } from './floor.js'
import { $coachCtx, ThreeVersions, useCoachContext } from './coach.js'

const $rh = atom(null) // the figures, effects and library from /rhetoric
const $stage = atom('read') // read | figures | spot | write | say
const $picked = atom(null) // the figure being practiced
const SAY = 30

const STAGES = [['read', 'Read', 'A great speech, marked'], ['figures', 'Figures', 'By the effect they make'], ['spot', 'Spot', 'Name the figure'],
  ['write', 'Write', 'Your own line'], ['say', 'Say it', 'Out loud, 0:30']]

function figureOf(id) {
  const rh = $rh.get() || {}
  return (rh.figures || []).find(f => f.id === id) || (rh.appeals || []).find(a => a.id === id) || { id, name: id }
}

/* ------------------------------------------------------------------ read and mark -- */

// The student's text with marks drawn as underlines; overlapping marks share a span. Every mark is a button:
// click, tap, Enter or Space opens the lesson for it in the side panel.
function Marked({ text, marks, hidden, focus, sel, onPick }) {
  const vis = marks.filter(m => !hidden.has(m.figure))
  const cuts = new Set([0, text.length])
  vis.forEach(m => { cuts.add(m.start); cuts.add(m.end) })
  const pts = [...cuts].sort((a, b) => a - b)
  const out = []
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]
    const b = pts[i + 1]
    const on = vis.filter(m => m.start <= a && m.end >= b)
    const piece = text.slice(a, b)
    if (!on.length) { out.push(piece); continue }
    const names = on.map(m => figureOf(m.figure).name).join(', ')
    const open = e => onPick(on, e.currentTarget)
    out.push(jsx('span', { role: 'button', tabIndex: 0, className: cls('ldw-mk', on.some(m => m.kind === 'appeal') && 'ldw-mk-appeal', focus && on.some(m => m.figure === focus) && 'ldw-mk-focus', sel && on.some(m => m.i === sel.i) && 'ldw-mk-sel'),
      'aria-label': `${names}: ${piece}. Open the lesson`, 'aria-pressed': sel ? on.some(m => m.i === sel.i) : false, 'data-n': on.length > 1 ? on.length : undefined,
      onClick: open, onKeyDown: e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(e) } }, children: piece }, a))
  }
  return jsx('div', { className: 'ldw-marked', children: out })
}

// Beside the text: the figure's name and plain definition, why it works in this line, and a try-it.
function Lesson({ group, active, onActive, onClose, speechId, speech }) {
  const m = active
  const info = figureOf(m.figure)
  const [line, setLine] = useState('')
  const [out, setOut] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const ref = useRef(null)
  useEffect(() => { setLine(''); setOut(null); setErr(null) }, [m.i])
  useEffect(() => { ref.current && ref.current.focus({ preventScroll: true }) }, [group])
  useEffect(() => {
    const el = ref.current
    if (el && getComputedStyle(el.closest('.ldw-counts')).position !== 'sticky') el.scrollIntoView({ block: 'nearest' }) // stacked under the text on a narrow window
  }, [m.i])
  useCoachContext({ floor: 'rhetoric', figure: m.figure, line, critique: out || '', sees: [info.name, `the line: ${m.quote}`, words(line) >= 4 && 'your line', out && "the coach's questions"] }, [m.i, line, out])
  const ask = async () => {
    setBusy(true); setErr(null)
    try { setOut((await post('rhetoric/critique', speechId ? { speech_id: speechId, figure: m.figure, quote: m.quote, line } : { figure: m.figure, quote: m.quote, why: m.why, line })).text) } catch (e) { setErr(errText(e)) } finally { setBusy(false) }
  }
  const kind = m.kind === 'appeal' ? 'Appeal' : 'Figure'
  return jsxs('section', { className: 'ldw-lesson', 'aria-label': `Lesson: ${info.name}`, onKeyDown: e => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }, children: [
    jsxs('div', { className: 'ldw-lesson-head', children: [
      jsxs('div', { children: [jsx('span', { className: 'ldw-lesson-kind', children: kind }), jsx('h3', { className: 'ldw-lesson-name', tabIndex: -1, ref, children: info.name })] }),
      jsx('button', { type: 'button', className: 'hk-link', onClick: onClose, 'aria-label': 'Close the lesson', children: 'Close' }),
    ] }),
    group.length > 1 ? jsx('div', { className: 'ldw-chips', role: 'group', 'aria-label': 'Figures in this line', children: group.map(g => jsx('button', { type: 'button', className: 'ldw-chip', 'aria-pressed': g.i === m.i, onClick: () => onActive(g), children: figureOf(g.figure).name }, g.i)) }) : null,
    jsx('p', { className: 'ldw-lesson-def', children: info.definition }),
    jsx('blockquote', { className: 'ldw-lesson-quote', children: m.quote }),
    jsx('h4', { className: 'ldw-lesson-h', children: 'Why it works in this line' }),
    jsx('p', { className: 'ldw-lesson-why', children: m.why || 'This is a clear case of the figure.' }),
    speech ? jsx('p', { className: 'ldw-meta', children: `${speech.speaker}, ${speech.title}, ${speech.year}` }) : null,
    jsxs('div', { className: 'ldw-tryit', children: [
      jsx('h4', { className: 'ldw-lesson-h', children: 'Try it' }),
      jsx('label', { className: 'ldw-meta', htmlFor: 'ldw-tryit-line', children: `Write your own line using ${info.name.toLowerCase()}, on any topic you debate.` }),
      jsx(Textarea, { id: 'ldw-tryit-line', className: 'ldw-speechbox ldw-short', 'aria-label': `Your line using ${info.name}`, value: line, onChange: e => { setLine(e.target.value); setOut(null) }, placeholder: 'Your line' }),
      jsx('div', { className: 'hk-actions', children: jsx(Button, { size: 'sm', loading: busy, disabled: words(line) < 4, onClick: ask, children: 'Ask the coach' }) }),
      err ? jsx(Notice, { tone: 'bad', children: err }) : null,
      out ? jsxs('div', { className: 'ldw-helper ldw-tryit-out', role: 'status', children: [jsx('span', { className: 'ldw-lesson-kind', children: 'Coach' }), renderText(out)] }) : null,
    ] }),
  ] })
}

function ReadStage() {
  const rh = useValue($rh)
  const [sid, setSid] = useState(rh.speeches[0].id)
  const [paste, setPaste] = useState(null)
  const [doc, setDoc] = useState(null)
  const [found, setFound] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const [hidden, setHidden] = useState(new Set())
  const [focus, setFocus] = useState(null)
  const [sel, setSel] = useState(null) // { group: the marks under the pressed words, i: the one shown }
  const from = useRef(null) // the words that opened the lesson, to give focus back on close
  useEffect(() => { if (paste === null) { setDoc(null); setFound(null); setSel(null); rest(`rhetoric/speech/${sid}`).then(setDoc, e => setErr(errText(e))) } }, [sid, paste === null])
  const mark = async () => {
    setBusy(true); setErr(null)
    try { const f = await post('rhetoric/marks', paste !== null ? { text: paste } : { speech_id: sid }); setFound({ ...f, marks: f.marks.map((m, i) => ({ ...m, i })) }); setHidden(new Set()); setSel(null) } catch (e) { setErr(errText(e)) } finally { setBusy(false) }
  }
  const text = found ? found.text : paste !== null ? paste : doc ? doc.text : ''
  const counts = found ? Object.entries(found.counts).sort((a, b) => b[1] - a[1]) : []
  const figs = counts.filter(([k]) => figureOf(k).effect)
  const appeals = counts.filter(([k]) => !figureOf(k).effect)
  const pick = (group, el) => { from.current = el; setSel({ group, i: group[0].i }) }
  const close = () => { setSel(null); const el = from.current; if (el && el.isConnected) el.focus() }
  const active = sel && found ? found.marks.find(m => m.i === sel.i) : null
  const toggle = k => { const h = new Set(hidden); h.has(k) ? h.delete(k) : h.add(k); setHidden(h) }
  const countRow = ([k, n]) => jsx('li', { children: jsxs('button', { type: 'button', className: 'ldw-count', 'aria-pressed': !hidden.has(k),
    onClick: () => toggle(k), onMouseEnter: () => setFocus(k), onMouseLeave: () => setFocus(null), children: [
      jsx('b', { children: n }), jsx('span', { children: figureOf(k).name })] }) }, k)
  return jsxs('div', { className: 'ldw-read', children: [
    jsxs('nav', { className: 'ldw-library', 'aria-label': 'Speeches', children: [
      jsx('h3', { className: 'ldw-h3', children: 'Speeches' }),
      jsx('ul', { children: rh.speeches.map(s => jsx('li', { children: jsxs('button', { type: 'button', className: 'ldw-lib-item', 'aria-current': paste === null && sid === s.id ? 'true' : undefined,
        onClick: () => { setPaste(null); setSid(s.id) }, children: [jsx('b', { children: s.title }), jsx('span', { children: `${s.speaker}, ${s.year}${s.excerpt ? ' · excerpt' : ''}` })] }) }, s.id)) }),
      jsx('button', { type: 'button', className: cls('ldw-lib-item', paste !== null && 'ldw-lib-on'), onClick: () => { setPaste(''); setFound(null) }, children: jsx('b', { children: 'Paste your own' }) }),
    ] }),
    jsxs('section', { className: 'ldw-readtext', 'aria-label': 'The text', children: [
      paste !== null && !found ? jsx(Textarea, { className: 'ldw-speechbox', 'aria-label': 'Your text', value: paste, onChange: e => setPaste(e.target.value),
        placeholder: 'Paste a speech, an essay or your own case' }) : null,
      paste === null && doc ? jsxs('div', { className: 'ldw-docmeta', children: [jsx('h2', { className: 'ldw-question', children: doc.title }),
        jsx('span', { className: 'ldw-meta', children: `${doc.speaker} · ${doc.where} · ${doc.year}${doc.excerpt ? ' · excerpt' : ''}` })] }) : null,
      (paste === null || found) && text ? jsx(Marked, { text, marks: found ? found.marks : [], hidden, focus, sel: active, onPick: pick }) : null,
      !doc && paste === null && !err ? jsx(Thinking, { label: 'Opening the speech' }) : null,
    ] }),
    jsxs('aside', { className: 'ldw-counts', 'aria-label': 'Figures found', children: [
      !found ? jsxs(Fragment, { children: [
        jsx(Button, { loading: busy, disabled: paste !== null && words(paste) < 12, onClick: mark, children: 'Mark the figures' }),
        busy && paste !== null ? jsx(Thinking, { label: 'Reading for figures' }) : null,
      ] }) : jsxs(Fragment, { children: [
        active ? jsx(Lesson, { group: sel.group, active, onActive: g => setSel({ group: sel.group, i: g.i }), onClose: close, speechId: found.stored && paste === null ? sid : null, speech: found.stored && doc ? doc : null }) : null,
        jsx('h3', { className: 'ldw-h3', children: `${found.marks.length} marks, each checked against the text` }),
        !active ? jsx('p', { className: 'ldw-meta ldw-lesson-hint', children: 'Press any underlined words to see what the figure is and why it works there.' }) : null,
        figs.length ? jsx('ul', { className: 'ldw-countlist', children: figs.map(countRow) }) : jsx('p', { className: 'ldw-meta', children: 'No clear figures found.' }),
        appeals.length ? jsxs(Fragment, { children: [jsx('h3', { className: 'ldw-h3', children: 'Appeals' }), jsx('ul', { className: 'ldw-countlist', children: appeals.map(countRow) })] }) : null,
        jsx('button', { type: 'button', className: 'hk-link', onClick: () => { setFound(null); setSel(null) }, children: paste !== null ? 'Edit the text' : 'Clear the marks' }),
      ] }),
      err ? jsx(Notice, { tone: 'bad', children: err }) : null,
    ] }),
  ] })
}

/* ------------------------------------------------------------------ the figures -- */

function FiguresStage() {
  const rh = useValue($rh)
  const speech = id => rh.speeches.find(s => s.id === id) || {}
  const cite = ex => {
    if (ex.speech) return `${speech(ex.speech).speaker}, ${speech(ex.speech).year}`
    const w = (rh.works || []).find(x => x.id === ex.work) || {}
    return `${w.author}, ${w.title}, ${w.year}`
  }
  const practice = id => { $picked.set(id); $stage.set('write') }
  return jsxs('div', { className: 'ldw-figs', children: [
    ...rh.effects.map(e => jsxs('section', { className: 'ldw-effect', 'aria-label': e.title, children: [
      jsx('h3', { className: 'ldw-effect-title', children: e.title }),
      jsx('p', { className: 'ldw-effect-q', children: e.question }),
      jsx('dl', { className: 'ldw-figlist', children: rh.figures.filter(f => f.effect === e.id).map(f => jsxs('div', { className: 'ldw-fig', children: [
        jsxs('dt', { children: [f.name, jsx('button', { type: 'button', className: 'hk-link', onClick: () => practice(f.id), children: 'Practice' })] }),
        jsx('dd', { children: f.definition }),
        f.example ? jsxs('dd', { className: 'ldw-fig-ex', children: [jsx('q', { children: f.example.quote }), jsx('cite', { children: cite(f.example) })] }) : null,
      ] }, f.id)) }),
    ] }, e.id)),
    jsxs('section', { className: 'ldw-effect', 'aria-label': 'The appeals', children: [
      jsx('h3', { className: 'ldw-effect-title', children: 'The appeals' }),
      jsx('dl', { className: 'ldw-figlist', children: [...rh.appeals, rh.kairos].map(a => jsxs('div', { className: 'ldw-fig', children: [
        jsx('dt', { children: a.name }), jsx('dd', { children: a.definition }),
        jsxs('dd', { className: 'ldw-fig-ex', children: [jsx('q', { children: a.example.quote }), jsx('cite', { children: cite(a.example) })] }),
      ] }, a.id)) }),
    ] }),
    jsxs('section', { className: 'ldw-effect', 'aria-label': 'The five canons', children: [
      jsx('h3', { className: 'ldw-effect-title', children: 'The five canons' }),
      jsx('dl', { className: 'ldw-figlist', children: rh.canons.map(c => jsxs('div', { className: 'ldw-fig', children: [jsx('dt', { children: c.name }), jsx('dd', { children: c.definition })] }, c.name)) }),
    ] }),
    jsx('p', { className: 'ldw-meta', children: `Further reading: ${rh.further_reading}.` }),
  ] })
}

/* ------------------------------------------------------------------ spot, write, say -- */

function SpotStage() {
  const [item, setItem] = useState(null)
  const [pick, setPick] = useState(null)
  const [score, setScore] = useState({ n: 0, right: 0 })
  const [err, setErr] = useState(null)
  const next = () => { setPick(null); setErr(null); post('rhetoric/spot').then(setItem, e => setErr(errText(e))) }
  useEffect(next, [])
  if (err) return jsx(Notice, { tone: 'bad', children: err, action: jsx(Button, { size: 'sm', variant: 'secondary', onClick: next, children: 'Try again' }) })
  if (!item) return jsx(Thinking, { label: 'Finding a line' })
  const choose = id => { if (pick) return; setPick(id); setScore({ n: score.n + 1, right: score.right + (id === item.answer ? 1 : 0) }) }
  const ans = figureOf(item.answer)
  return jsxs('section', { className: 'ldw-spot', 'aria-label': 'Spot the figure', children: [
    jsx('blockquote', { className: 'ldw-spot-q', children: item.quote }),
    jsx('p', { className: 'ldw-meta', children: `${item.speech.speaker}, ${item.speech.title}, ${item.speech.year}` }),
    jsx('div', { className: 'ldw-chips', role: 'group', 'aria-label': 'Which figure is this?', children: item.options.map(o => {
      const state = !pick ? undefined : o === item.answer ? 'right' : o === pick ? 'wrong' : undefined
      return jsx('button', { type: 'button', className: 'ldw-chip ldw-opt', 'data-result': state, 'aria-pressed': pick === o, disabled: !!pick && !state, onClick: () => choose(o), children: figureOf(o).name }, o)
    }) }),
    pick ? jsxs('div', { className: 'hk-stack', children: [
      jsxs('p', { className: 'ldw-goal', children: [jsx('strong', { children: pick === item.answer ? 'Right. ' : `It is ${ans.name}. ` }), `${ans.name}: ${ans.definition}`] }),
      jsxs('div', { className: 'hk-actions', children: [
        jsx(Button, { onClick: next, children: 'Next line' }),
        jsx(Button, { variant: 'secondary', onClick: () => { $picked.set(item.answer); $stage.set('write') }, children: `Write your own ${ans.name.toLowerCase()}` }),
      ] }),
    ] }) : null,
    score.n ? jsx('p', { className: 'ldw-meta', role: 'status', children: `This session: ${score.right} of ${score.n} right` }) : null,
  ] })
}

function FigurePicker() {
  const rh = useValue($rh)
  const picked = useValue($picked) || rh.figures[0].id
  return jsx('select', { className: 'ldw-select', 'aria-label': 'Figure', value: picked, onChange: e => $picked.set(e.target.value),
    children: rh.effects.map(e => jsx('optgroup', { label: e.title, children: rh.figures.filter(f => f.effect === e.id).map(f => jsx('option', { value: f.id, children: f.name }, f.id)) }, e.id)) })
}

function WriteStage() {
  const rh = useValue($rh)
  const picked = useValue($picked) || rh.figures[0].id
  const f = figureOf(picked)
  const [line, setLine] = useState('')
  const [out, setOut] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const go = async () => { setBusy(true); setErr(null); try { setOut((await post('rhetoric/critique', { figure: picked, line })).text) } catch (e) { setErr(errText(e)) } finally { setBusy(false) } }
  useCoachContext({ floor: 'rhetoric', figure: picked, line, critique: out || '', sees: [`${f.name}`, words(line) >= 4 && 'your line', out && "the coach's critique"] }, [picked, line, out])
  return jsxs('section', { className: 'ldw-write', 'aria-label': 'Write your own line', children: [
    jsxs('div', { className: 'hk-row', children: [jsx(FigurePicker, {}), jsx('span', { className: 'ldw-goal', children: f.definition })] }),
    f.example ? jsx('blockquote', { className: 'ldw-spot-q ldw-small', children: f.example.quote }) : null,
    jsx(Textarea, { className: 'ldw-speechbox ldw-short', 'aria-label': `Your line using ${f.name}`, value: line, onChange: e => { setLine(e.target.value); setOut(null) },
      placeholder: `Your own line, on any topic you debate, using ${f.name.toLowerCase()}` }),
    jsxs('div', { className: 'hk-actions', children: [
      jsx(Button, { loading: busy, disabled: words(line) < 4, onClick: go, children: 'Ask the coach' }),
      jsx(Button, { variant: 'secondary', disabled: words(line) < 4, onClick: () => $stage.set('say'), children: 'Say it out loud' }),
    ] }),
    err ? jsx(Notice, { tone: 'bad', children: err }) : null,
    out ? jsx('div', { className: 'ldw-helper', children: renderText(out) }) : null,
    out ? jsx(ThreeVersions, { figure: picked, line, figureName: f.name }) : null,
  ] })
}

function SayStage() {
  const picked = useValue($picked)
  const f = picked ? figureOf(picked) : null
  const [take, setTake] = useState(null)
  const [err, setErr] = useState(null)
  useTakePoll(take, setTake)
  const got = async rec => { setErr(null); try { setTake(await sendTake({ event: 'rhetoric', segment: 'say', limit: SAY, prompt: f ? f.name : 'Delivery' }, rec)) } catch (e) { setErr(errText(e)) } }
  const rec = useRecorder({ limit: SAY, onTake: got })
  const live = rec.state === 'live' || rec.state === 'armed'
  return jsxs(Fragment, { children: [
    jsxs('div', { className: 'ldw-stage2', children: [jsx(Clock, { limit: SAY, elapsed: rec.elapsed, live }), jsx(SpeakControls, { rec, onTyped: t => got({ typed: t }), startLabel: 'Say your line' })] }),
    err ? jsx(Notice, { tone: 'bad', children: err }) : null,
    take && !live ? jsx(LastTake, { take, limit: SAY, title: 'Your line, out loud', onChange: setTake }) : null,
  ] })
}

export function RhetoricView() {
  const rh = useValue($rh)
  const stage = useValue($stage)
  const [err, setErr] = useState(null)
  useEffect(() => { if (!rh) rest('rhetoric').then(d => $rh.set(d), e => setErr(errText(e))) }, [])
  useEffect(() => { if (stage !== 'write') $coachCtx.set({ floor: 'rhetoric', sees: ['the figures and the speeches'] }) }, [stage]) // Write says more
  if (err) return jsx(Notice, { tone: 'bad', children: err })
  if (!rh) return jsx(Thinking, { label: 'Opening rhetoric' })
  const idx = STAGES.findIndex(s => s[0] === stage)
  return jsxs(Fragment, { children: [
    jsx(Strip, { label: 'Rhetoric practice', segments: STAGES.map(([k, code, sub], i) => ({ key: k, code, sub, minutes: 1, min: 110,
      state: k === stage ? 'now' : 'later', onClick: () => $stage.set(k) })) }),
    stage === 'read' ? jsx(ReadStage, {}) : stage === 'figures' ? jsx(FiguresStage, {}) : stage === 'spot' ? jsx(SpotStage, {})
      : stage === 'write' ? jsx(WriteStage, {}) : jsx(SayStage, {}),
  ] })
}

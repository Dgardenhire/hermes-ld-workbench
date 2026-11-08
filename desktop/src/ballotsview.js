// Ballots: every ballot kept, the patterns judges keep writing (counted in code from a fixed tag list),
// and each ballot's drill, checked off when done.

import { useEffect, useState } from 'react'
import { Fragment, jsx, jsxs } from 'react/jsx-runtime'
import { Empty, Notice } from 'hermes-ui-kit'
import { Thinking, cls, errText, mmss, post, rest } from './core.js'

const EVENTS = { ld: 'Lincoln-Douglas', extemp: 'Extemp', drill: '60-second answer', rhetoric: 'Rhetoric' }

function day(t) {
  return t ? new Date(t * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : ''
}

function PatternRows({ group, label }) {
  if (!group || !group.of) return null
  return jsxs('section', { className: 'ldw-patterns', 'aria-label': `${label} patterns`, children: [
    jsx('h3', { className: 'ldw-h2', children: `${label}: across your last ${group.of} ${group.of === 1 ? 'ballot' : 'ballots'}` }),
    group.patterns.length ? jsx('ul', { className: 'ldw-patlist', children: group.patterns.map(p => jsxs('li', { className: 'ldw-pat', children: [
      jsxs('div', { className: 'ldw-pat-text', children: [jsx('b', { children: p.text }), jsx('span', { children: `${p.count} of ${p.of}${p.measured ? ', measured from your recordings' : ''}` })] }),
      jsx('ol', { className: 'ldw-rounds', 'aria-label': 'Rounds', children: p.rounds.map((r, i) => jsxs('li', { className: 'ldw-round', 'data-hit': r.hit ? '' : undefined,
        title: r.hit ? 'Written on this ballot' : 'Not on this ballot', children: [jsx('span', { children: r.label }), r.result ? jsx('b', { children: r.result }) : null] }, i)) }),
    ] }, p.tag)) }) : jsx('p', { className: 'ldw-meta', children: group.of < 2 ? 'Patterns show once you have two ballots.' : 'Nothing has come up twice yet.' }),
  ] })
}

function BallotRow({ b, onDone }) {
  const drill = b.drill || (b.drills || [])[0]
  const result = b.event === 'ld'
    ? `${b.decision === b.side ? 'Won' : 'Lost'} on the ${b.side === 'aff' ? 'affirmative' : 'negative'}`
    : { yes: 'Answered the question', partly: 'Partly answered', no: 'Did not answer' }[b.answered] || ''
  const pts = b.event === 'ld' ? (b.speaker_points || {}).student : b.points
  const m = b.measured && b.event !== 'ld' ? b.measured : null
  return jsxs('li', { className: 'ldw-brow', children: [
    jsxs('div', { className: 'ldw-brow-main', children: [
      jsxs('div', { className: 'ldw-brow-top', children: [jsx('b', { children: EVENTS[b.event] || 'Ballot' }), jsx('span', { children: day(b.at) }),
        b.round_no ? jsx('span', { children: `Round ${b.round_no}` }) : null, b.judge ? jsx('span', { children: b.judge }) : null] }),
      jsx('p', { className: 'ldw-brow-q', children: b.question || b.resolution || '' }),
      jsxs('p', { className: 'ldw-brow-res', children: [jsx('strong', { children: result }), pts !== null && pts !== undefined ? ` · ${pts} points` : '',
        m && !m.typed ? ` · ${mmss(m.speaking || 0)} spoken` : '', m && m.wpm ? ` · ${m.wpm} words a minute` : ''] }),
      (b.tags || []).length || (b.measured_tags || []).length ? jsx('p', { className: 'ldw-meta', children: [...(b.tags || []), ...(b.measured_tags || [])].map(t => b.tag_text && b.tag_text[t] || t).join(' · ') }) : null,
    ] }),
    drill ? jsxs('label', { className: cls('ldw-brow-drill', b.drill_done && 'ldw-done'), children: [
      jsx('input', { type: 'checkbox', 'aria-label': `Drill done: ${drill.name}`, checked: !!b.drill_done, onChange: e => onDone(b.index, e.target.checked, b.at) }),
      jsxs('span', { children: [jsx('span', { className: 'ldw-stamp2 ldw-stamp-sm', children: 'Drill' }), ' ', drill.name] }),
    ] }) : null,
  ] })
}

export function BallotsView() {
  const [data, setData] = useState(null)
  const [err, setErr] = useState(null)
  const load = () => rest('ballots').then(setData, e => setErr(errText(e)))
  useEffect(() => { load() }, [])
  const done = async (index, v, at) => {
    try { const out = await post(`ballots/${index}/drill`, { done: v, at }); setData({ ...data, ...out }) } catch (e) { setErr(errText(e)) }
  }
  if (err && !data) return jsx(Notice, { tone: 'bad', children: err })
  if (!data) return jsx(Thinking, { label: 'Opening your ballots' })
  const hist = [...data.history].reverse().map(b => ({ ...b, tag_text: data.tag_text }))
  if (!hist.length) return jsx(Empty, { icon: 'law', title: 'No ballots yet', body: 'Every ballot lands here: Lincoln-Douglas rounds, extemp speeches and 60-second answers. What judges write twice shows up as a pattern.' })
  return jsxs('div', { className: 'ldw-ballots', children: [
    jsxs('div', { className: 'ldw-patgrid', children: [jsx(PatternRows, { group: data.patterns.ld, label: 'Lincoln-Douglas' }), jsx(PatternRows, { group: data.patterns.extemp, label: 'Extemp' })] }),
    err ? jsx(Notice, { tone: 'bad', children: err }) : null,
    jsx('h3', { className: 'ldw-h2', children: `Every ballot · ${hist.length}` }),
    jsx('ol', { className: 'ldw-blist', children: hist.map(b => jsx(BallotRow, { b, onDone: done }, b.index)) }),
  ] })
}

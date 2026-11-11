// Ballots: every ballot kept, the patterns judges keep writing (counted in code from a fixed tag list),
// and each ballot's drill, checked off when done. Any ballot opens to its full sheet; the whole set prints
// or saves as a text file for a coach.

import { useEffect, useState } from 'react'
import { Fragment, jsx, jsxs } from 'react/jsx-runtime'
import { Button, Codicon } from '@hermes/plugin-sdk'
import { Empty, Notice } from 'hermes-ui-kit'
import { Thinking, api, cls, errText, mmss, post, rest } from './core.js'
import { ExtempSheet, LdSheet } from './floor.js'
import { useCoachContext } from './coach.js'

const EVENTS = { ld: 'Lincoln-Douglas', extemp: 'Extemp', drill: '60-second answer', rhetoric: 'Rhetoric' }

function day(t) {
  return t ? new Date(t * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : ''
}

// onOpen(at): a round chip opens that ballot in the list below (none on paper, where every sheet is open).
function PatternRows({ group, label, onOpen }) {
  if (!group || !group.of) return null
  return jsxs('section', { className: 'ldw-patterns', 'aria-label': `${label} patterns`, children: [
    jsx('h3', { className: 'ldw-h2', children: `${label}: across your last ${group.of} ${group.of === 1 ? 'ballot' : 'ballots'}` }),
    group.patterns.length ? jsx('ul', { className: 'ldw-patlist', children: group.patterns.map(p => jsxs('li', { className: 'ldw-pat', children: [
      jsxs('div', { className: 'ldw-pat-text', children: [jsx('b', { children: p.text }), jsx('span', { children: `${p.count} of ${p.of}${p.measured ? ', measured from your recordings' : ''}` })] }),
      jsx('ol', { className: 'ldw-rounds', 'aria-label': 'Rounds', children: p.rounds.map((r, i) => {
        const inner = [jsx('span', { children: r.label }, 'l'), r.result ? jsx('b', { children: r.result }, 'r') : null,
          jsx('span', { className: 'hk-sr', children: `${r.hit ? ', written on this ballot' : ', not on this ballot'}${onOpen && r.at ? '. Open it' : ''}` }, 's')]
        return jsx('li', { children: onOpen && r.at
          ? jsx('button', { type: 'button', className: 'ldw-round ldw-round-btn', 'data-hit': r.hit ? '' : undefined, title: r.hit ? 'Written on this ballot. Open it' : 'Not on this ballot. Open it', onClick: () => onOpen(r.at), children: inner })
          : jsx('span', { className: 'ldw-round', 'data-hit': r.hit ? '' : undefined, title: r.hit ? 'Written on this ballot' : 'Not on this ballot', children: inner }) }, i)
      }) }),
    ] }, p.tag)) }) : jsx('p', { className: 'ldw-meta', children: group.of < 2 ? 'Patterns show once you have two ballots.' : 'Nothing has come up twice yet.' }),
  ] })
}

// The key to the round chips, said on the page, not only in a tooltip.
function Legend() {
  const chip = (label, result, hit) => jsxs('span', { className: 'ldw-round', 'data-hit': hit ? '' : undefined, 'aria-hidden': 'true', children: [jsx('span', { children: label }), jsx('b', { children: result })] })
  return jsxs('p', { className: 'ldw-legend', children: [
    jsxs('span', { className: 'ldw-legend-item', children: [chip('R1', 'L', true), 'The judge wrote it on that ballot']}),
    jsxs('span', { className: 'ldw-legend-item', children: [chip('R2', 'W', false), 'Not on that ballot']}),
    jsx('span', { children: 'R is a Lincoln-Douglas round and # an extemp speech or 60-second answer; W and L are won and lost.' }),
  ] })
}

function resultOf(b) {
  return b.event === 'ld'
    ? `${b.decision === b.side ? 'Won' : 'Lost'} on the ${b.side === 'aff' ? 'affirmative' : 'negative'}`
    : { yes: 'Answered the question', partly: 'Partly answered', no: 'Did not answer' }[b.answered] || ''
}

// One ballot's full sheet, as it was written (the drill row is not a button here).
export function FullSheet({ b, open }) {
  return b.event === 'ld'
    ? jsx(LdSheet, { b, defaultOpen: open })
    : jsx(ExtempSheet, { b, defaultOpen: open })
}

function BallotRow({ b, onDone, open, onToggle }) {
  const drill = b.drill || (b.drills || [])[0]
  const pts = b.event === 'ld' ? (b.speaker_points || {}).student : b.points
  const m = b.measured && b.event !== 'ld' ? b.measured : null
  return jsxs('li', { id: `ldw-brow-${b.index}`, className: cls('ldw-brow', open && 'ldw-brow-open'), children: [
    jsxs('button', { type: 'button', className: 'ldw-brow-main', 'aria-expanded': open, onClick: onToggle, children: [
      jsxs('span', { className: 'ldw-brow-top', children: [jsx('b', { children: EVENTS[b.event] || 'Ballot' }), jsx('span', { children: day(b.at) }),
        b.round_no ? jsx('span', { children: `Round ${b.round_no}` }) : null, b.judge ? jsx('span', { children: b.judge }) : null,
        jsxs('span', { className: 'ldw-brow-open-lbl', children: [jsx(Codicon, { name: open ? 'chevron-up' : 'chevron-down' }), open ? 'Close the ballot' : 'Open the ballot'] })] }),
      jsx('span', { className: 'ldw-brow-q', children: b.question || b.resolution || '' }),
      jsxs('span', { className: 'ldw-brow-res', children: [jsx('strong', { children: resultOf(b) }), pts !== null && pts !== undefined ? ` · ${pts} points` : '',
        m && !m.typed ? ` · ${mmss(m.speaking || 0)} spoken` : '', m && m.wpm ? ` · ${m.wpm} words a minute` : ''] }),
      (b.tags || []).length || (b.measured_tags || []).length ? jsx('span', { className: 'ldw-meta', children: [...(b.tags || []), ...(b.measured_tags || [])].map(t => b.tag_text && b.tag_text[t] || t).join(' · ') }) : null,
    ] }),
    drill ? jsxs('label', { className: cls('ldw-brow-drill', b.drill_done && 'ldw-done'), children: [
      jsx('input', { type: 'checkbox', className: 'ldw-drill-check', 'aria-label': `Drill done: ${drill.name}`, checked: !!b.drill_done, onChange: e => onDone(b.index, e.target.checked, b.at) }),
      jsxs('span', { children: [jsx('span', { className: 'ldw-stamp2 ldw-stamp-sm', children: 'Drill' }), ' ', drill.name] }),
    ] }) : null,
    open ? jsx('div', { className: 'ldw-brow-sheet', children: jsx(FullSheet, { b, open: true }) }) : null,
  ] })
}

async function saveBallots(setMsg) {
  setMsg(null)
  let path = null
  if (api && api.os && typeof api.os.pickSavePath === 'function') {
    path = await api.os.pickSavePath({ title: 'Save every ballot as a text file', defaultPath: 'debate-ballots.txt', filters: [{ name: 'Text', extensions: ['txt'] }] })
    if (path === null) return
  }
  try {
    const out = await post('ballots/export', { path })
    setMsg({ tone: 'good', text: `Saved ${out.count} ballot${out.count === 1 ? '' : 's'} to ${out.name}. Send that file to your coach.`, path: out.path })
  } catch (e) { setMsg({ tone: 'bad', text: errText(e) }) }
}

// Every ballot on paper: the patterns, then each sheet open with its full reason for decision.
function PrintBallots({ data, hist, onClose }) {
  return jsxs('div', { className: 'ldw-print-ballots', children: [
    jsxs('div', { className: 'hk-actions ldw-noprint', children: [
      jsx(Button, { onClick: () => window.print(), children: jsxs(Fragment, { children: [jsx(Codicon, { name: 'file' }), 'Print'] }) }),
      jsx(Button, { variant: 'secondary', onClick: onClose, children: 'Back to ballots' }),
    ] }),
    jsx('h1', { className: 'ldw-set-h1', children: `Practice ballots · ${hist.length}` }),
    jsxs('div', { className: 'ldw-patgrid', children: [jsx(PatternRows, { group: data.patterns.ld, label: 'Lincoln-Douglas' }), jsx(PatternRows, { group: data.patterns.extemp, label: 'Extemp' })] }),
    jsx(Legend, {}),
    ...hist.map(b => jsxs('section', { className: 'ldw-print-sheet', children: [
      jsx('h2', { className: 'ldw-h3', children: `${EVENTS[b.event] || 'Ballot'} · ${day(b.at)}${b.round_no ? ` · round ${b.round_no}` : ''}` }),
      jsx(FullSheet, { b, open: true }),
    ] }, b.index)),
  ] })
}

export function BallotsView() {
  const [data, setData] = useState(null)
  const [err, setErr] = useState(null)
  const [open, setOpen] = useState(null)
  const [printing, setPrinting] = useState(false)
  const [msg, setMsg] = useState(null)
  const load = () => rest('ballots').then(setData, e => setErr(errText(e)))
  useEffect(() => { load() }, [])
  const opened = data && open !== null ? data.history.find(b => b.index === open) : null
  useCoachContext({ floor: 'ballots', ballot_at: opened ? opened.at : null,
    sees: opened ? ['the ballot you opened', opened.take_id || opened.event === 'ld' ? 'your words behind it' : null] : ['the patterns across your ballots'] }, [opened && opened.at])
  const done = async (index, v, at) => {
    try { const out = await post(`ballots/${index}/drill`, { done: v, at }); setData({ ...data, ...out }) } catch (e) { setErr(errText(e)) }
  }
  const openAt = at => {
    const b = data && data.history.find(x => x.at === at)
    if (!b) return
    setOpen(b.index)
    setTimeout(() => { const row = document.getElementById(`ldw-brow-${b.index}`); if (row) { row.scrollIntoView({ block: 'start' }); const btn = row.querySelector('.ldw-brow-main'); if (btn) btn.focus({ preventScroll: true }) } }, 0)
  }
  if (err && !data) return jsx(Notice, { tone: 'bad', children: err })
  if (!data) return jsx(Thinking, { label: 'Opening your ballots' })
  const hist = [...data.history].reverse().map(b => ({ ...b, tag_text: data.tag_text }))
  if (!hist.length) return jsxs(Fragment, { children: [jsx('h1', { className: 'ldw-set-h1', children: 'Ballots' }),
    jsx(Empty, { icon: 'law', title: 'No ballots yet', body: 'Every ballot lands here: Lincoln-Douglas rounds, extemp speeches and 60-second answers. What judges write twice shows up as a pattern.' })] })
  if (printing) return jsx(PrintBallots, { data, hist, onClose: () => setPrinting(false) })
  return jsxs('div', { className: 'ldw-ballots', children: [
    jsxs('div', { className: 'ldw-ballots-head', children: [
      jsx('h1', { className: 'ldw-set-h1', children: 'Ballots' }),
      jsxs('div', { className: 'hk-actions', children: [
        jsx(Button, { size: 'sm', variant: 'secondary', onClick: () => setPrinting(true), children: jsxs(Fragment, { children: [jsx(Codicon, { name: 'file' }), 'Print ballots'] }) }),
        jsx(Button, { size: 'sm', variant: 'secondary', onClick: () => saveBallots(setMsg), children: jsxs(Fragment, { children: [jsx(Codicon, { name: 'save' }), 'Save as a file for your coach'] }) }),
      ] }),
    ] }),
    msg ? jsx(Notice, { tone: msg.tone, children: msg.text, action: msg.path && api && api.os && typeof api.os.revealPath === 'function'
      ? jsx(Button, { size: 'sm', variant: 'secondary', onClick: () => api.os.revealPath(msg.path), children: 'Show the file' }) : null }) : null,
    jsxs('div', { className: 'ldw-patgrid', children: [jsx(PatternRows, { group: data.patterns.ld, label: 'Lincoln-Douglas', onOpen: openAt }), jsx(PatternRows, { group: data.patterns.extemp, label: 'Extemp', onOpen: openAt })] }),
    jsx(Legend, {}),
    err ? jsx(Notice, { tone: 'bad', children: err }) : null,
    jsx('h3', { className: 'ldw-h2', children: `Every ballot · ${hist.length}` }),
    jsx('ol', { className: 'ldw-blist', children: hist.map(b => jsx(BallotRow, { b, onDone: done, open: open === b.index, onToggle: () => setOpen(open === b.index ? null : b.index) }, b.index)) }),
  ] })
}

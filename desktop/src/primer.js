// Get up to speed (Lane C): before she speaks, one press gives three dated facts on the question.
// Part of desktop/src/; bundled into desktop/plugin.js. The shell mounts PrimerButton beside Start speaking and
// PrimerCards under the question; both read one shared press, so they stay in step.
//
// Each fact is a sentence the backend copied from a real page and picked by number (evidence.py), shown here as
// plain text. The outlet and the date come from the page's own tags, never from the model. Nothing a page says
// is ever rendered as HTML, and nothing is saved without the student's press on Save to my file.

import { useEffect, useState } from 'react'
import { jsx, jsxs } from 'react/jsx-runtime'
import { Button, Codicon, atom, useValue } from '@hermes/plugin-sdk'
import { Notice, installStyles } from 'hermes-ui-kit'
import { PLUGIN_ID, api, errText, post, rest } from './core.js'

export const PRIMER_DISCLOSURE = 'Get up to speed sends your question to your Hermes web search and reads up to 4 public pages.'
const STEPS = [['searching', 'Searching'], ['reading', 'Reading pages'], ['picking', 'Picking sentences'], ['writing', 'Writing']]
const FINAL = new Set(['done', 'no_web', 'failed', 'cancelled'])
const POLL_MS = 400
const CANCEL_AFTER = 10

// One press at a time, for one question: { question, view, at (ms, when pressed), saved: { cardId: 'saving' | 'saved' | error } }
export const $primer = atom(null)

let styled = false
function useStyles() {
  if (!styled && api) { styled = true; installStyles(api, `${PLUGIN_ID}-primer`, PRIMER_CSS) }
}

let timer = null
function stopPolling() { if (timer) { clearTimeout(timer); timer = null } }
function update(fn) { const p = $primer.get(); if (p) $primer.set(fn(p)) }

async function poll(id) {
  timer = null
  const p = $primer.get()
  if (!p || !p.view || p.view.id !== id) return
  try {
    const v = await rest(`evidence/primer/${id}`)
    update(x => (x.view && x.view.id === id ? { ...x, view: v } : x))
    if (!v.final) timer = setTimeout(() => poll(id), POLL_MS)
  } catch (e) {
    update(x => (x.view && x.view.id === id ? { ...x, view: { ...x.view, stage: 'failed', final: true, retry: true, error: errText(e) } } : x))
  }
}

export async function startPrimer(question) {
  stopPolling()
  // The first line shows at once, before the backend answers: never a blank wait.
  $primer.set({ question, at: Date.now(), saved: {}, view: { stage: 'searching', label: 'Searching', final: false, elapsed: 0 } })
  try {
    const v = await post('evidence/primer', { question })
    update(x => (x.question === question ? { ...x, view: v } : x))
    if (!v.final) timer = setTimeout(() => poll(v.id), POLL_MS)
  } catch (e) {
    update(x => (x.question === question ? { ...x, view: { stage: 'failed', final: true, retry: false, error: errText(e) } } : x))
  }
}

async function cancelPrimer() {
  const p = $primer.get()
  stopPolling()
  if (p && p.view && p.view.id) {
    try { const v = await post(`evidence/primer/${p.view.id}/cancel`); update(x => ({ ...x, view: v })); return } catch (e) { /* shown below */ }
  }
  update(x => ({ ...x, view: { ...(x.view || {}), stage: 'cancelled', label: 'Cancelled', final: true } }))
}

async function saveCard(card) {
  update(x => ({ ...x, saved: { ...x.saved, [card.id]: 'saving' } }))
  try {
    await post('evidence/save', { card_id: card.id })
    update(x => ({ ...x, saved: { ...x.saved, [card.id]: 'saved' } }))
  } catch (e) {
    update(x => ({ ...x, saved: { ...x.saved, [card.id]: errText(e) } }))
  }
}

const running = p => p && p.view && !FINAL.has(p.view.stage)
const secondsText = s => (s < 10 ? `${s.toFixed(1)} s` : `${Math.floor(s)} s`)
const setOpen = open => update(x => ({ ...x, closed: !open }))

/* ------------------------------------------------------------------ the button -- */

export function PrimerButton({ question }) {
  useStyles()
  const p = useValue($primer)
  const mine = p && p.question === question
  const busy = mine && running(p)
  return jsx(Button, { variant: 'secondary', className: 'ldw-primer-btn', disabled: busy || !question, title: PRIMER_DISCLOSURE,
    onClick: () => startPrimer(question),
    children: jsxs('span', { className: 'ldw-primer-btn-in', children: [jsx(Codicon, { name: 'search' }), busy ? 'Getting up to speed' : 'Get up to speed'] }) })
}

/* ------------------------------------------------------------------ the cards -- */

function useElapsed(p) {
  const [, tick] = useState(0)
  const live = running(p)
  useEffect(() => {
    if (!live) return undefined
    const id = setInterval(() => tick(n => n + 1), 250)
    return () => clearInterval(id)
  }, [live, p && p.at])
  if (!p) return 0
  return live ? (Date.now() - p.at) / 1000 : Math.max(p.view.elapsed || 0, 0)
}

function Progress({ p }) {
  const v = p.view
  const secs = useElapsed(p)
  const at = Math.max(0, STEPS.findIndex(s => s[0] === v.stage))
  return jsxs('div', { className: 'ldw-primer-progress', role: 'status', 'aria-live': 'polite', children: [
    jsx('ol', { className: 'ldw-primer-steps', children: STEPS.map(([id, label], i) => jsxs('li', { 'data-state': i < at ? 'done' : i === at ? 'now' : 'later', children: [
      i < at ? jsx(Codicon, { name: 'check' }) : jsx('span', { className: 'ldw-primer-dot', 'aria-hidden': 'true' }),
      id === 'reading' && v.pages_total ? `Reading ${v.pages_total} page${v.pages_total === 1 ? '' : 's'}` : label] }, id)) }),
    jsx('span', { className: 'ldw-primer-secs', children: secondsText(secs) }),
    secs >= CANCEL_AFTER ? jsx('button', { type: 'button', className: 'hk-link', onClick: cancelPrimer, children: 'Cancel' }) : null,
  ] })
}

function FactCard({ card, i, state }) {
  const saved = state === 'saved'
  return jsxs('li', { className: 'ldw-fact', style: { '--i': i }, children: [
    jsx('blockquote', { className: 'ldw-fact-said', children: card.sentence }),
    jsxs('div', { className: 'ldw-fact-foot', children: [
      jsxs('span', { className: 'ldw-fact-cite', children: [jsx('strong', { children: card.outlet }), jsx('span', { 'aria-hidden': 'true', children: ' · ' }),
        jsx('span', { 'data-nodate': card.date ? undefined : '', children: card.date_label })] }),
      jsxs('a', { className: 'hk-link ldw-fact-open', href: card.link, target: '_blank', rel: 'noopener noreferrer',
        'aria-label': `Open the page at this sentence, ${card.outlet}`, children: ['Open the page', jsx(Codicon, { name: 'link-external' })] }),
      jsx(Button, { size: 'sm', variant: 'secondary', className: 'ldw-fact-save', disabled: saved || state === 'saving', onClick: () => saveCard(card),
        children: saved ? jsxs('span', { className: 'ldw-primer-btn-in', children: [jsx(Codicon, { name: 'check' }), 'Saved to my file'] })
          : state === 'saving' ? 'Saving' : 'Save to my file' }),
    ] }),
    state && state !== 'saved' && state !== 'saving' ? jsx('p', { className: 'ldw-fact-err', role: 'alert', children: state }) : null,
  ] })
}

function CoachRead({ v }) {
  if (!v.asks && !(v.sides || []).length) return null
  return jsxs('section', { className: 'ldw-primer-read', 'aria-label': "The coach's read", children: [
    jsx('div', { className: 'ldw-primer-tag', children: "The coach's read" }),
    v.asks ? jsxs('div', { className: 'ldw-primer-asks', children: [jsx('h4', { children: 'What this really asks' }), jsx('p', { children: v.asks })] }) : null,
    (v.sides || []).length ? jsxs('div', { className: 'ldw-primer-sides', children: [
      jsx('h4', { children: 'The best answer each way' }),
      jsx('dl', { children: v.sides.map((s, k) => jsxs('div', { className: 'ldw-primer-side', children: [jsx('dt', { children: s.label }), jsx('dd', { children: s.answer })] }, k)) }),
    ] }) : null,
  ] })
}

function FileHelp({ v, retry }) {
  return jsxs('div', { className: 'ldw-primer-files', children: [
    jsx(Notice, { tone: 'warn', title: 'Web search is off', children: v.notice, action: jsx(Button, { size: 'sm', variant: 'secondary', onClick: retry, children: 'Try again' }) }),
    (v.files || []).length ? jsx('div', { className: 'ldw-keysent-label', children: 'From your file' }) : null,
    (v.files || []).length ? jsx('ul', { className: 'ldw-primer-filelist', children: v.files.map(f => jsxs('li', { children: [
      jsx('strong', { children: f.title }), jsx('span', { className: 'ldw-fact-cite', children: f.citation }),
      ...(f.sentences || []).map((s, k) => jsx('blockquote', { className: 'ldw-fact-said ldw-fact-said-sm', children: s }, k)),
    ] }, f.id)) }) : jsx('p', { className: 'ldw-primer-none', children: 'Your file has nothing on this question yet. Save a headline or a link in prep, or turn on web search.' }),
  ] })
}

export function PrimerCards({ question }) {
  useStyles()
  const p = useValue($primer)
  if (!p || p.question !== question) return null
  const v = p.view || {}
  const retry = () => startPrimer(question)
  if (running(p)) return jsx('div', { className: 'ldw-primer', children: jsx(Progress, { p }) })
  if (v.stage === 'no_web') return jsx('div', { className: 'ldw-primer', children: jsx(FileHelp, { v, retry }) })
  if (v.stage === 'cancelled') return jsx('div', { className: 'ldw-primer', children: jsx(Notice, { tone: 'info', children: 'Stopped. Press Get up to speed to try again.' }) })
  if (v.stage === 'failed') return jsx('div', { className: 'ldw-primer', children: jsx(Notice, { tone: 'bad', children: v.error || 'Get up to speed stopped. Try again.',
    action: v.retry ? jsx(Button, { size: 'sm', variant: 'secondary', onClick: retry, children: 'Retry' }) : null }) })
  const cards = v.cards || []
  const title = cards.length === 1 ? 'One fact from the pages' : `${cards.length} facts from the pages`
  if (p.closed) {
    return jsx('div', { className: 'ldw-primer ldw-primer-closed', children: jsxs('div', { className: 'ldw-primer-head', children: [
      jsx('h3', { children: title }),
      jsx('button', { type: 'button', className: 'hk-link', 'aria-expanded': 'false', onClick: () => setOpen(true), children: 'Show' }),
    ] }) })
  }
  return jsxs('section', { className: 'ldw-primer', 'aria-label': 'Get up to speed', children: [
    jsx(CoachRead, { v }),
    v.notice ? jsx(Notice, { tone: 'warn', children: v.notice, action: v.retry ? jsx(Button, { size: 'sm', variant: 'secondary', onClick: retry, children: 'Retry' }) : null }) : null,
    jsxs('div', { className: 'ldw-primer-head', children: [
      jsx('h3', { children: title }),
      jsx('span', { className: 'ldw-primer-secs', children: `in ${secondsText(v.elapsed || 0)}` }),
      jsx('button', { type: 'button', className: 'hk-link', 'aria-expanded': 'true', onClick: () => setOpen(false), children: 'Hide' }),
    ] }),
    jsx('ol', { className: 'ldw-facts', children: cards.map((c, i) => jsx(FactCard, { card: c, i, state: p.saved[c.id] }, c.id)) }),
    jsx('p', { className: 'ldw-primer-foot', children: `Each fact is a sentence copied from the page, ${v.coach === false ? "picked by matching your question's words" : 'picked by the coach'} and never retyped. The outlet and the date come from the page itself. ${PRIMER_DISCLOSURE}` }),
  ] })
}

/* ------------------------------------------------------------------ saved facts on a prep source card -- */

// Only items saved from Get up to speed carry "sentences". Headlines from a pull show the headline only.
export function KeySentences({ item }) {
  useStyles()
  const s = (item && item.sentences) || []
  if (!s.length) return null
  return jsxs('div', { className: 'ldw-keysent', children: [
    jsx('div', { className: 'ldw-keysent-label', children: s.length === 1 ? 'Key sentence' : 'Key sentences' }),
    ...s.map((t, k) => jsx('blockquote', { className: 'ldw-fact-said ldw-fact-said-sm', children: t }, k)),
  ] })
}

/* ------------------------------------------------------------------ styles -- */

// Host tokens only (the kit's --hk-*), the host's radius, nothing under 12 px, no dimmed body text.
// Serif for the pages' own words (read aloud in a speech); sans for the app and the coach's notes.
export const PRIMER_CSS = `
.ldw-primer-btn-in{display:inline-flex;align-items:center;gap:7px}
.ldw-primer{display:grid;gap:14px;max-width:760px;min-width:0;box-sizing:border-box}
.ldw-primer-progress{display:flex;align-items:center;gap:8px 18px;flex-wrap:wrap;padding:10px 0;border-top:1px solid var(--hk-stroke);border-bottom:1px solid var(--hk-stroke);font-size:13.5px}
.ldw-primer-steps{list-style:none;margin:0;padding:0;display:flex;gap:6px 18px;flex-wrap:wrap}
.ldw-primer-steps li{display:inline-flex;align-items:center;gap:7px;color:var(--hk-ink)}
.ldw-primer-steps li[data-state=now]{font-weight:700}
.ldw-primer-steps .codicon{font-size:14px !important;color:var(--hk-good)}
.ldw-primer-dot{width:7px;height:7px;border-radius:50%;border:1.5px solid var(--hk-stroke-strong);box-sizing:border-box}
.ldw-primer-steps li[data-state=now] .ldw-primer-dot{border-color:var(--hk-accent);background:var(--hk-accent)}
@media (prefers-reduced-motion:no-preference){.ldw-primer-steps li[data-state=now] .ldw-primer-dot{animation:ldw-primer-pulse 1.1s ease-in-out infinite}
  @keyframes ldw-primer-pulse{50%{transform:scale(1.5)}}}
.ldw-primer-secs{margin-left:auto;font-family:var(--hk-mono);font-size:12.5px;font-variant-numeric:tabular-nums}
.ldw-primer-read{border:1.5px dashed var(--hk-stroke-strong);border-radius:var(--hk-radius);padding:14px 16px;display:grid;gap:10px}
.ldw-primer-tag,.ldw-keysent-label{font-family:var(--hk-mono);font-size:12px;font-weight:800;letter-spacing:.12em;text-transform:uppercase}
.ldw-primer-read h4{margin:0 0 3px;font-size:13px;font-weight:700}
.ldw-primer-read p{margin:0;font-size:14.5px;line-height:1.5}
.ldw-primer-sides dl{margin:0;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
.ldw-primer-side dt{font-weight:700;font-size:14px}
.ldw-primer-side dd{margin:2px 0 0;font-size:14.5px;line-height:1.5}
.ldw-primer-head{display:flex;align-items:baseline;gap:12px 16px}
.ldw-primer-head h3{margin-right:auto}
.ldw-primer-closed{padding:10px 0;border-top:1px solid var(--hk-stroke);border-bottom:1px solid var(--hk-stroke)}
.ldw-primer-head h3{margin:0;font-size:15px;font-weight:700}
.ldw-facts{list-style:none;margin:0;padding:0;display:grid;gap:0}
.ldw-fact{display:grid;gap:10px;padding:16px 0 16px 18px;border-top:1px solid var(--hk-stroke);position:relative}
.ldw-fact:last-child{border-bottom:1px solid var(--hk-stroke)}
.ldw-fact::before{content:"";position:absolute;left:0;top:18px;bottom:18px;width:2px;background:var(--hk-stroke-strong)}
@media (prefers-reduced-motion:no-preference){.ldw-fact{animation:ldw-fact-in 220ms ease-out both;animation-delay:calc(var(--i) * 60ms)}
  @keyframes ldw-fact-in{from{opacity:0;transform:translateY(6px)}}}
.ldw-fact-said{margin:0;font-family:var(--ldw-serif,"Iowan Old Style","Charter",Georgia,serif);font-size:18px;line-height:1.5;max-width:64ch;overflow-wrap:anywhere}
.ldw-fact-said-sm{font-size:15.5px}
.ldw-fact-foot{display:flex;align-items:center;gap:8px 18px;flex-wrap:wrap;font-size:13.5px}
.ldw-fact-cite{font-size:13.5px}
.ldw-fact-cite strong{font-weight:700}
.ldw-fact-cite [data-nodate]{font-style:italic}
.ldw-fact-open{font-size:13.5px}
.ldw-fact-open .codicon{font-size:13px !important}
.ldw-fact-save{margin-left:auto}
.ldw-fact-err{margin:0;font-size:13px;color:var(--hk-bad)}
.ldw-primer-foot{margin:0;font-size:13px;line-height:1.5;max-width:70ch}
.ldw-primer-files{display:grid;gap:10px}
.ldw-primer-filelist{list-style:none;margin:0;padding:0;display:grid;gap:10px}
.ldw-primer-filelist li{display:grid;gap:4px;padding:10px 0 10px 18px;border-top:1px solid var(--hk-stroke);position:relative}
.ldw-primer-filelist li::before{content:"";position:absolute;left:0;top:12px;bottom:12px;width:2px;background:var(--hk-stroke-strong)}
.ldw-primer-none{margin:0;font-size:14px}
.ldw-keysent{display:grid;gap:6px;margin-top:6px}
@media (max-width:760px){.ldw-primer-sides dl{grid-template-columns:minmax(0,1fr)}.ldw-fact-save{margin-left:0}}
`

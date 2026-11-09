// Shared by every view: the backend door, the stores, small helpers, the light Markdown renderer and the menu.
// Part of desktop/src/; bundled into desktop/plugin.js by the UI kit's build.

import { useEffect, useRef, useState } from 'react'
import { Fragment, jsx, jsxs } from 'react/jsx-runtime'
import { Button, Codicon, atom } from '@hermes/plugin-sdk'
import { describeError } from 'hermes-ui-kit'

export const PLUGIN_ID = 'ld-workbench'
export const ROUTE = '/debate'
export const WPM = 140
export const MODEL_TIMEOUT = 300000

export let api = null
export function setApi(ctx) { api = ctx }
export const $cfg = atom(null)
export const $state = atom(null) // { workbench: { case, cases, source }, round, history }
export const $view = atom('room') // room | bench | print
export const $loadError = atom(null)

/* ------------------------------------------------------------------ backend -- */

export function rest(path, options) {
  if (!api) return Promise.reject(new Error('The workbench is not connected. Close Debate and open it again.'))
  return api.rest(path, { timeoutMs: MODEL_TIMEOUT, ...(options || {}) })
}
export const post = (path, body) => rest(path, { method: 'POST', body: body || {} })
export const errText = e => describeError(e).detail || 'Something went wrong. Try again.'

export function setWorkbench(wb) {
  const s = $state.get() || {}
  $state.set({ ...s, workbench: { ...(s.workbench || {}), ...wb } })
}
export function setRound(r) {
  const s = $state.get() || {}
  $state.set({ ...s, round: r })
}

export async function load() {
  try {
    const [cfg, st] = await Promise.all([$cfg.get() ? $cfg.get() : rest('config'), rest('state')])
    $cfg.set(cfg)
    $state.set(st)
    $loadError.set(null)
  } catch (e) {
    $loadError.set(e)
  }
}
export async function refreshState() {
  try { $state.set(await rest('state')) } catch (e) { /* keep what is on screen */ }
}

/* ------------------------------------------------------------------ helpers -- */

export const words = s => (s || '').trim().split(/\s+/).filter(Boolean).length
export function mmss(sec) {
  const neg = sec < 0
  sec = Math.abs(Math.round(sec))
  return (neg ? '+' : '') + Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0')
}
export const sideName = s => (s === 'aff' ? 'affirmative' : 'negative')
export const sideShort = s => (s === 'aff' ? 'Aff' : 'Neg')
export const clip = (t, n) => { t = String(t || ''); return t.length > n ? t.slice(0, n - 3).replace(/\s+\S*$/, '') + '...' : t }
export const cls = (...xs) => xs.filter(Boolean).join(' ')
export function when(t) {
  if (!t) return ''
  const d = new Date(t * 1000)
  const days = Math.floor((Date.now() - d.getTime()) / 86400000)
  if (days < 1) return 'Edited today'
  if (days < 2) return 'Edited yesterday'
  return 'Edited ' + d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

// The coach writes light Markdown: paragraphs, - and 1. lists, **bold**, *italic*. Rendered as elements.
// The backend marks a quoted line it could not find in the text with [[not-found]] (engine.check_quotes).
export const NOT_FOUND = '[[not-found]]'
// The coach's examples mark a citation or a news outlet that is not in the student's file (coach.check).
export const NOT_IN_FILE = '[[not-in-file]]'
const NOT_IN_FILE_LABEL = 'Not a source in your file. Do not cite it.'
let notFoundLabel = 'Not found in the text. Check it before you use it.'
export function renderChecked(text, label) {
  notFoundLabel = label
  try { return renderText(text) } finally { notFoundLabel = 'Not found in the text. Check it before you use it.' }
}
export const notFoundCount = text => String(text || '').split(NOT_FOUND).length - 1
// One paragraph of the coach's own writing, with its marks, without the Markdown list and heading rules (a model
// answer is a speech: a line that starts with "1." is still a sentence of it).
export function inlineChecked(text, label) {
  notFoundLabel = label
  try { return inline(String(text || ''), 'c') } finally { notFoundLabel = 'Not found in the text. Check it before you use it.' }
}
export function inline(text, key) {
  const out = []
  // "[find a source: what it must show]" (the coach's way of marking a gap) shows as a quiet "Find:" chip, never raw brackets.
  const re = /\*\*(.+?)\*\*|\*([^*\n]+)\*|\[\[not-found\]\]|\[\[not-in-file\]\]|\[find (a source|a card|evidence):\s*([^\]]+)\]/gi
  let last = 0
  let m
  let i = 0
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index))
    out.push(m[4] ? jsx('span', { className: 'ldw-chip-find', children: `${m[3].toLowerCase() === 'a card' ? 'Find a card' : 'Find'}: ${m[4].trim()}` }, `${key}-s${i++}`)
      : m[0] === NOT_FOUND ? jsx('span', { className: 'ldw-line-flag ldw-inline-flag', children: notFoundLabel }, `${key}-n${i++}`)
      : m[0] === NOT_IN_FILE ? jsx('span', { className: 'ldw-line-flag ldw-inline-flag', children: NOT_IN_FILE_LABEL }, `${key}-f${i++}`)
      : m[1] ? jsx('strong', { children: m[1] }, `${key}-b${i++}`) : jsx('em', { children: m[2] }, `${key}-i${i++}`))
    last = re.lastIndex
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}
export function renderText(text) {
  const blocks = []
  let para = []
  let list = null
  const flush = () => { if (para.length) { blocks.push(jsx('p', { children: inline(para.join(' '), `p${blocks.length}`) }, `p${blocks.length}`)); para = [] } }
  const close = () => { if (list) { const L = list; blocks.push(jsx(L.tag, { start: L.start, children: L.items }, `l${blocks.length}`)); list = null } }
  for (const raw of String(text || '').split('\n')) {
    const l = raw.trim()
    const h = l.match(/^(#{2,3})\s+(.*)/)
    if (h) {
      flush(); close()
      blocks.push(h[1].length === 2 ? jsx('h3', { className: 'ldw-md-h', children: inline(h[2], `h${blocks.length}`) }, `h${blocks.length}`)
        : jsx('h4', { className: 'ldw-md-h4', children: inline(h[2], `h${blocks.length}`) }, `h${blocks.length}`))
      continue
    }
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

// A choice of one, drawn so the picked option is plain at a glance (an accent outline, a check and bold text),
// whatever the app's own segmented control looks like. A radio group: arrow keys move the choice.
export function Choices({ value, onChange, options, label, disabled, className }) {
  const pick = (e, i) => {
    const n = options.length
    const k = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? (i + 1) % n : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? (i - 1 + n) % n : null
    if (k === null) return
    e.preventDefault()
    onChange(options[k].id)
    const row = e.currentTarget.parentElement
    const next = row && row.children[k]
    if (next) next.focus()
  }
  return jsx('div', { className: cls('ldw-choices', className), role: 'radiogroup', 'aria-label': label, children: options.map((o, i) => jsxs('button', {
    type: 'button', role: 'radio', 'aria-checked': value === o.id, tabIndex: value === o.id || (i === 0 && !options.some(x => x.id === value)) ? 0 : -1,
    className: 'ldw-choice', disabled, onClick: () => onChange(o.id), onKeyDown: e => pick(e, i), children: [
      jsx(Codicon, { name: 'check', className: 'ldw-choice-check' }), jsx('span', { children: o.label })] }, o.id)) })
}

export const Thinking = ({ label }) => jsxs('div', { className: 'ldw-thinking', role: 'status', children: [jsx('span', { className: 'hk-spinner' }), label] })
export const Label = ({ children, accent }) => jsx('div', { className: cls('ldw-label', accent && 'ldw-accent'), children })

/* ================================================================== menus == */

// A small menu: one trigger button, a list of actions. Arrow keys move, Enter picks, Escape closes and
// returns focus to the trigger, a click outside closes. Colors from theme variables only.
//   items: { label, meta, icon, onSelect, disabled, danger, current } | { divider: true } | { heading }
export function Menu({ label, icon, items, align = 'start', trigger, variant = 'secondary', size = 'sm', ariaLabel, title }) {
  const [open, setOpen] = useState(false)
  const wrap = useRef(null)
  const list = useRef(null)
  const focusTrigger = () => { const b = wrap.current && wrap.current.querySelector('[aria-haspopup="menu"]'); if (b) b.focus() }
  const close = refocus => { setOpen(false); if (refocus) focusTrigger() }
  useEffect(() => {
    if (!open) return undefined
    const away = e => { if (wrap.current && !wrap.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', away)
    const first = list.current && list.current.querySelector('[role=menuitem]:not([disabled])')
    if (first) first.focus()
    return () => document.removeEventListener('mousedown', away)
  }, [open])
  const onKey = e => {
    const all = [...list.current.querySelectorAll('[role=menuitem]:not([disabled])')]
    const i = all.indexOf(document.activeElement)
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(true) }
    else if (e.key === 'ArrowDown') { e.preventDefault(); (all[i + 1] || all[0]).focus() }
    else if (e.key === 'ArrowUp') { e.preventDefault(); (all[i - 1] || all[all.length - 1]).focus() }
    else if (e.key === 'Home') { e.preventDefault(); all[0] && all[0].focus() }
    else if (e.key === 'End') { e.preventDefault(); all[all.length - 1] && all[all.length - 1].focus() }
    else if (e.key === 'Tab') setOpen(false)
  }
  const pick = it => { close(true); it.onSelect && it.onSelect() }
  const triggerProps = { 'aria-haspopup': 'menu', 'aria-expanded': open, 'aria-label': ariaLabel, title, onClick: () => setOpen(v => !v),
    onKeyDown: e => { if (e.key === 'ArrowDown' && !open) { e.preventDefault(); setOpen(true) } } }
  return jsxs('div', { className: 'ldw-menu-wrap', ref: wrap, children: [
    trigger ? trigger(triggerProps) : jsx(Button, { variant, size, ...triggerProps,
      children: jsxs(Fragment, { children: [icon ? jsx(Codicon, { name: icon }) : null, label, jsx(Codicon, { name: 'chevron-down', className: 'ldw-caret' })] }) }),
    open ? jsx('div', { className: 'ldw-menu', 'data-align': align, role: 'menu', ref: list, onKeyDown: onKey, children: items.filter(Boolean).map((it, i) => {
      if (it.divider) return jsx('div', { className: 'ldw-menu-sep', role: 'separator' }, i)
      if (it.heading) return jsx('div', { className: 'ldw-menu-head', children: it.heading }, i)
      return jsxs('button', { type: 'button', role: 'menuitem', className: 'ldw-menu-item', disabled: it.disabled, 'data-danger': it.danger ? '' : undefined,
        'aria-current': it.current ? 'true' : undefined, onClick: () => pick(it), children: [
          jsx(Codicon, { name: it.current ? 'check' : it.icon || 'blank', className: 'ldw-menu-icon' }),
          jsxs('span', { className: 'ldw-menu-text', children: [jsx('span', { children: it.label }), it.meta ? jsx('span', { className: 'ldw-menu-meta', children: it.meta }) : null] }),
        ] }, i)
    }) }) : null,
  ] })
}

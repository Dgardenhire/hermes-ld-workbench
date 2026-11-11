// The coach margin: a column at the right of the floor, the way comments sit beside a document. 280 to 340 px
// when the page pane is 1,040 px or wider; below that, a bottom sheet with a handle. While the compare is open
// (the student's take beside the coach's example) it folds to a 44 px tab, so the two columns get the room.
//
// Open state is the coach's own $chatOpen (coach.js reads it), so the header's Coach toggle, the margin's close
// button and the coach's own controls all agree. It opens by itself only on extemp prep and the Case Workbench
// (useMarginSpot), and everywhere else it starts closed.
//
// Owned by the frame lane. Lane A sets $compareOpen and uses Tabs for the compare under 760 px.

import { useEffect, useState } from 'react'
import { jsx, jsxs } from 'react/jsx-runtime'
import { atom, useValue } from '@hermes/plugin-sdk'
import { cls } from './core.js'

export const $compareOpen = atom(false) // Lane A: true while "Your take" and "Coach's example" are side by side
export const $marginSpot = atom(null) // a screen that wants the margin open by default: 'extemp-prep' | 'ld-bench'
export const MARGIN_DEFAULT = new Set(['extemp-prep', 'ld-bench'])

// A screen says it is one of the margin's default places while it is mounted.
export function useMarginSpot(name) {
  useEffect(() => {
    $marginSpot.set(name)
    return () => { if ($marginSpot.get() === name) $marginSpot.set(null) }
  }, [name])
}

// What the frame's grid needs to know: no column, a full margin, or the folded tab.
export function marginState(open, compare) {
  if (!open) return undefined
  return compare ? 'tab' : 'open'
}

const Stroke = ({ d, size = 18 }) => jsx('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
  strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true', focusable: 'false',
  children: (Array.isArray(d) ? d : [d]).map((p, i) => jsx('path', { d: p }, i)) })
export const CoachIcon = props => jsx(Stroke, { ...props, d: 'M7.9 20A9 9 0 1 0 4 16.1L2 22Z' }) // a speech bubble
export const StartIcon = props => jsx(Stroke, { ...props, d: ['M12 13v8', 'M12 3v3', 'M18 6a2 2 0 0 1 1.387.56l2.307 2.22a1 1 0 0 1 0 1.44l-2.307 2.22A2 2 0 0 1 18 14H6a2 2 0 0 1-1.387-.56l-2.306-2.22a1 1 0 0 1 0-1.44l2.306-2.22A2 2 0 0 1 6 6z'] }) // a signpost
export const CloseIcon = props => jsx(Stroke, { ...props, d: ['M18 6 6 18', 'm6 6 12 12'] })

export function Margin({ open, onToggle, children, title = 'Coach' }) {
  const compare = useValue($compareOpen)
  const [peek, setPeek] = useState(false)
  useEffect(() => { if (!compare) setPeek(false) }, [compare])
  if (!open) return null
  const folded = compare && !peek
  if (folded) {
    return jsx('aside', { className: 'ldw-margin ldw-noprint', 'data-folded': '', 'aria-label': title, children:
      jsxs('button', { type: 'button', className: 'ldw-margin-tab', 'aria-expanded': false, onClick: () => setPeek(true),
        title: `Open the ${title.toLowerCase()} beside the compare`, children: [jsx(CoachIcon, {}), jsx('span', { children: title })] }) })
  }
  return jsxs('aside', { className: cls('ldw-margin ldw-noprint', compare && 'ldw-margin-peek'), 'aria-label': title, children: [
    // Under 1,040 px the margin is a bottom sheet; the handle closes it.
    jsx('button', { type: 'button', className: 'ldw-margin-handle', 'aria-label': `Close the ${title.toLowerCase()}`, onClick: onToggle, children: jsx('span', { 'aria-hidden': 'true' }) }),
    jsxs('div', { className: 'ldw-margin-head', children: [
      jsx('h2', { className: 'ldw-margin-title', children: title }),
      compare ? jsx('button', { type: 'button', className: 'ldw-iconbtn', 'aria-label': 'Fold the coach beside the compare', onClick: () => setPeek(false), children: jsx(Stroke, { d: 'm9 18 6-6-6-6' }) }) : null,
      jsx('button', { type: 'button', className: 'ldw-iconbtn', 'aria-label': `Close the ${title.toLowerCase()}`, onClick: onToggle, children: jsx(CloseIcon, {}) }),
    ] }),
    jsx('div', { className: 'ldw-margin-body', children }),
  ] })
}

// Two panes side by side, or two tabs when the room is under 760 px (the compare: "Yours" and "Coach's").
// tabs: [{ id, label, content }]. The panes are always rendered, so nothing is lost when the width changes.
export function Tabs({ tabs, label, initial }) {
  const [on, setOn] = useState(initial || (tabs[0] && tabs[0].id))
  return jsxs('div', { className: 'ldw-tabs2', children: [
    jsx('div', { className: 'ldw-tabs2-list', role: 'tablist', 'aria-label': label, children: tabs.map(t => jsx('button', {
      type: 'button', role: 'tab', id: `ldw-tab-${t.id}`, 'aria-selected': on === t.id, 'aria-controls': `ldw-pane-${t.id}`,
      className: 'ldw-tabs2-tab', onClick: () => setOn(t.id), children: t.label }, t.id)) }),
    jsx('div', { className: 'ldw-tabs2-panes', style: { '--ldw-panes': tabs.length }, children: tabs.map(t => jsx('div', {
      id: `ldw-pane-${t.id}`, role: 'tabpanel', 'aria-labelledby': `ldw-tab-${t.id}`, className: 'ldw-tabs2-pane',
      'data-on': on === t.id ? '' : undefined, children: t.content }, t.id)) }),
  ] })
}

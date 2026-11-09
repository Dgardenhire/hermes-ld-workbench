// The first open of the 60-second answer: never an empty page. A promise line, the three steps, the level
// row (until the first take), and a Sample ballot under the clock: a real drill ballot's shape, with its three
// quoted lines wrapped in the player's QuoteLine and the sample take given to the player.
//
// The sample (data/sample_take.json) is a written adult answer, timed word by word, bundled with the page: it
// needs no model call and no route. No sample voice is cleared to ship yet, so the take has no audio and the
// player hides its play marks (the brief's Monday 6 PM rule).

import { useState } from 'react'
import { jsx, jsxs } from 'react/jsx-runtime'
import { Choices, api } from './core.js'
import { ExtempSheet } from './floor.js'
import { QuoteLine, TakePlayer } from './player.js'
import SAMPLE from '../../data/sample_take.json'

export const SAMPLE_TAKE = SAMPLE.take
export const SAMPLE_BALLOT = SAMPLE.ballot
// The Sample's one line: plain words for what it is (Damon, Nov 9: no taglines).
export const SAMPLE_LINE = 'A judge’s ballot on a sample one-minute answer to this question'
const LEVELS = [{ id: 'first', label: 'First year' }, { id: 'jv', label: 'JV' }, { id: 'varsity', label: 'Varsity' }]
const LEVEL_KEY = 'ldw.level'

// Is this the student's first time here? No take on this floor and no ballot kept.
export const isFirstRun = home => !!home && !(home.last_take && home.last_take.drill) && !home.ballots

function readLevel() {
  try { return (api && api.storage && api.storage.get(LEVEL_KEY, null)) || 'first' } catch (e) { return 'first' }
}

// Loop 2: the first open shows only the promise and the Sample's three quoted lines, so the hero is on one
// screen at 1280x800. The three-step strip and the level row are gone (the level changed nothing the judge
// read: a dead control). LEVELS stays for the level row's return after the first ballot.
export function FirstRun() {
  return null // the Sample heads itself with one plain line (SampleBallot)
}

function SampleLines() {
  return jsx('div', { className: 'ldw-sample-lines', children: SAMPLE_BALLOT.decisive.map((d, i) => jsxs(QuoteLine, { take: SAMPLE_TAKE, line: d, index: i, className: 'ldw-line', children: [
    jsx('span', { className: 'ldw-line-said', children: `"${d.line}"` }),
    jsx('span', { className: 'ldw-line-effect', children: d.effect }),
  ] }, i)) })
}

// The Sample: labeled as a sample everywhere it shows, so no one mistakes it for their own ballot. On the first
// open it is one plain line and the three lines the judge quoted, each playing in place; the whole sample
// ballot and its player open under them on a press. The player is always mounted (hidden until then), because
// the lines play through it.
export function SampleBallot() {
  const [whole, setWhole] = useState(false)
  return jsxs('section', { className: 'ldw-sample', 'aria-label': 'Sample ballot', children: [
    jsxs('div', { className: 'ldw-sample-head', children: [
      jsx('span', { className: 'ldw-sample-tag', children: 'Sample' }),
      jsx('p', { className: 'ldw-promise', children: SAMPLE_LINE }),
    ] }),
    !whole ? jsx(SampleLines, {}) : null,
    jsx('button', { type: 'button', className: 'hk-link ldw-sample-more', 'aria-expanded': whole, onClick: () => setWhole(v => !v), children: whole ? 'Show only the lines' : 'See the whole sample ballot' }),
    whole ? jsx(ExtempSheet, { b: SAMPLE_BALLOT, take: SAMPLE_TAKE, showMe: false, label: 'Sample ballot' }) : null,
    jsx('div', { hidden: !whole, children: jsx(TakePlayer, { take: SAMPLE_TAKE }) }),
  ] })
}

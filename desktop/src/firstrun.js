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
import { TakePlayer } from './player.js'
import SAMPLE from '../../data/sample_take.json'

export const SAMPLE_TAKE = SAMPLE.take
export const SAMPLE_BALLOT = SAMPLE.ballot
export const PROMISE = 'Speak for a minute. Get a judge’s ballot. Hear the line that decided it.'
const STEPS = [
  ['Speak for a minute', 'Answer the question out loud. The clock and the time cards keep you honest.'],
  ['Get a judge’s ballot', 'A practice judge writes it on what you actually said, quoting your lines.'],
  ['Hear the line that decided it', 'Play the exact sentence back, then hear a coach do it better.'],
]
const LEVELS = [{ id: 'first', label: 'First year' }, { id: 'jv', label: 'JV' }, { id: 'varsity', label: 'Varsity' }]
const LEVEL_KEY = 'ldw.level'

// Is this the student's first time here? No take on this floor and no ballot kept.
export const isFirstRun = home => !!home && !(home.last_take && home.last_take.drill) && !home.ballots

function readLevel() {
  try { return (api && api.storage && api.storage.get(LEVEL_KEY, null)) || 'first' } catch (e) { return 'first' }
}

export function FirstRun({ showLevel = true }) {
  const [level, setLevel] = useState(readLevel)
  const pick = v => { setLevel(v); try { if (api && api.storage) api.storage.set(LEVEL_KEY, v) } catch (e) { /* kept for this visit */ } }
  return jsxs('section', { className: 'ldw-first', 'aria-label': 'How it works', children: [
    jsx('p', { className: 'ldw-promise', children: PROMISE }),
    jsx('ol', { className: 'ldw-steps', children: STEPS.map(([t, d], i) => jsxs('li', { children: [
      jsx('span', { className: 'ldw-step-n', 'aria-hidden': 'true', children: String(i + 1) }),
      jsxs('div', { children: [jsx('b', { children: t }), jsx('span', { children: d })] }),
    ] }, t)) }),
    showLevel ? jsxs('div', { className: 'ldw-levelrow', children: [
      jsx('span', { className: 'ldw-eyebrow', id: 'ldw-level-l', children: 'Your level' }),
      jsx(Choices, { label: 'Your level', value: level, onChange: pick, options: LEVELS }),
    ] }) : null,
  ] })
}

// The Sample: labeled as a sample everywhere it shows, so no one mistakes it for their own ballot.
export function SampleBallot() {
  return jsxs('section', { className: 'ldw-sample', 'aria-label': 'Sample ballot', children: [
    jsxs('div', { className: 'ldw-sample-head', children: [
      jsx('span', { className: 'ldw-sample-tag', children: 'Sample' }),
      jsx('p', { children: 'What you get after one minute: a ballot on the words you said, quoting your own lines. This one judged a sample answer.' }),
    ] }),
    jsx(ExtempSheet, { b: SAMPLE_BALLOT, take: SAMPLE_TAKE, showMe: false, label: 'Sample ballot' }),
    jsx(TakePlayer, { take: SAMPLE_TAKE, limit: 60, title: 'The sample answer', onChange: () => {} }),
  ] })
}

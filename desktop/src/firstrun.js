// The first open of the 60-second answer: never an empty page. A promise line, the three steps, the level
// row (until the first take), and a Sample ballot under the clock: a real drill ballot's shape, with its three
// quoted lines wrapped in the player's QuoteLine and the sample take given to the player.
//
// The sample (data/sample_take.json) is a written adult answer read by Arthur, an ElevenLabs voice Damon picked at
// CP1 (data/sample_voice.webm, served by GET speech/sample/audio), timed word by word by the plugin's own
// speech-to-text. Its words need no model call. The voice is credited wherever the Sample shows.

import { useEffect, useRef, useState } from 'react'
import { jsx, jsxs } from 'react/jsx-runtime'
import { Button } from '@hermes/plugin-sdk'
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

// Start here (Damon, Nov 10-11: orientation scored 0). The four rooms, one line each, and a button into each.
// It opens by itself on a first open (no take and no ballot yet), until it is closed once; the header's Start
// here link opens it again at any time. Closed is kept in the plugin's own Hermes storage (ctx.storage).
export const START_KEY = 'ldw.startHere'
export const START_LINE = 'Practice speech and debate out loud. A practice judge writes a ballot on what you actually said.'
export const START_AI = 'The judge and the coach are an AI: the model you chose in Hermes.'
export const START_ROOMS = [
  { id: 'extemp', name: 'Extemp', button: 'Answer a question', primary: true,
    line: 'Answer a current-events question out loud in one minute. Get a ballot that quotes your lines. Start here. It takes a minute.' },
  { id: 'ld', name: 'Lincoln-Douglas', button: 'Open my case',
    line: 'Build your case section by section with a coach that asks hard questions, then run a full practice round.' },
  { id: 'rhetoric', name: 'Rhetoric', button: 'Read a speech',
    line: 'Read great speeches with their figures of speech marked, then write and say your own.' },
  { id: 'ballots', name: 'Ballots', button: 'See my ballots',
    line: 'Every ballot you’ve earned, and the patterns judges keep writing about you.' },
]

export function startHereClosed(storage) {
  try { return !!(storage && storage.get(START_KEY, null) === 'closed') } catch (e) { return false }
}
export function closeStartHere(storage) {
  try { if (storage) storage.set(START_KEY, 'closed') } catch (e) { /* stays open next time */ }
}
// Should the panel open by itself? Only once home has loaded, only on a first open, and never after a close.
export const startHereOnOpen = (home, storage) => !!home && isFirstRun(home) && !startHereClosed(storage)

const CloseIcon = () => jsxs('svg', { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5,
  strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true', focusable: 'false', children: [
    jsx('path', { d: 'M18 6 6 18' }), jsx('path', { d: 'm6 6 12 12' })] })

// focus: opened from the header link, so focus moves to its heading. onGo(id): open that room (Lincoln-Douglas opens on Case). onClose: hide it and keep it hidden.
export function StartHere({ onGo, onClose, focus }) {
  const head = useRef(null)
  useEffect(() => { if (focus && head.current) head.current.focus() }, []) // opened from the link: the reader lands on it
  return jsxs('section', { className: 'ldw-start ldw-noprint', 'aria-labelledby': 'ldw-start-h', children: [
    jsxs('div', { className: 'ldw-start-head', children: [
      jsx('h2', { id: 'ldw-start-h', className: 'ldw-start-h', tabIndex: -1, ref: head, children: 'Start here' }),
      jsx('button', { type: 'button', className: 'ldw-start-close', 'aria-label': 'Close Start here', title: 'Close', onClick: onClose, children: jsx(CloseIcon, {}) }),
    ] }),
    jsx('p', { className: 'ldw-start-lead', children: START_LINE }),
    jsx('ul', { className: 'ldw-start-rooms', children: START_ROOMS.map(r => jsxs('li', { className: 'ldw-start-room', 'data-primary': r.primary ? '' : undefined, children: [
      jsx('h3', { className: 'ldw-start-name', children: r.name }),
      jsx('p', { className: 'ldw-start-line', children: r.line }),
      jsx(Button, { variant: r.primary ? 'default' : 'secondary', className: 'ldw-start-go', onClick: () => onGo(r.id), children: r.button }),
    ] }, r.id)) }),
    jsx('p', { className: 'ldw-start-ai', children: START_AI }),
  ] })
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
      SAMPLE_TAKE.voice ? jsx('span', { className: 'ldw-sample-credit', children: `Sample voice: ${SAMPLE_TAKE.voice}` }) : null,
    ] }),
    !whole ? jsx(SampleLines, {}) : null,
    jsx('button', { type: 'button', className: 'hk-link ldw-sample-more', 'aria-expanded': whole, onClick: () => setWhole(v => !v), children: whole ? 'Show only the lines' : 'See the whole sample ballot' }),
    whole ? jsx(ExtempSheet, { b: SAMPLE_BALLOT, take: SAMPLE_TAKE, showMe: false, label: 'Sample ballot' }) : null,
    jsx('div', { hidden: !whole, children: jsx(TakePlayer, { take: SAMPLE_TAKE }) }),
  ] })
}

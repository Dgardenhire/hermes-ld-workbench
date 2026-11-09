// Settings, in this order: what leaves your computer (disclosure.js), coach examples, the recordings, transcripts
// and ballots kept (each with a delete), Advanced (folded: how transcripts are made, the speech model and its
// download), then the outlets for the headline pull.

import { useState } from 'react'
import { Fragment, jsx, jsxs } from 'react/jsx-runtime'
import { Button, useValue } from '@hermes/plugin-sdk'
import { Notice } from 'hermes-ui-kit'
import { Choices, Thinking, errText, post } from './core.js'
import { $home, OutletEditor, loadHome } from './extemp.js'
import { TRANSCRIPTS_OFF } from './floor.js'
import { $coachOn } from './coach.js'
import { DisclosureList } from './disclosure.js'

const MODEL_TEXT = { 'base.en': 'Faster', 'small.en': 'More accurate, slower' }
const mb = bytes => `${Math.max(0.1, bytes / 1048576).toFixed(bytes < 10485760 ? 1 : 0)} MB`

function Section({ title, children }) {
  return jsxs('section', { className: 'ldw-set', 'aria-label': title, children: [jsx('h2', { className: 'ldw-set-title', children: title }), jsx('div', { className: 'ldw-set-body', children })] })
}

// Which speech-to-text makes the transcripts, said plainly: Hermes's own (as set in Hermes Settings, Voice),
// or, when Hermes cannot without a download of its own, the workbench's faster-whisper with its model in
// the workbench's own folder. When Hermes would send a take off the computer, the take waits for a press.
const cloudish = h => h.usable && h.local !== true
const sendsTo = h => h.local === false ? h.label : 'the speech-to-text set up in Hermes, which may be a service on the internet'

function hermesLine(h, t) {
  if (h.local === true) return `Made on this computer by ${h.label}, as set in Hermes Settings, Voice. Your recordings stay on it.`
  if (t.own_ready) return 'Made on this computer with faster-whisper. Your recordings stay on it.'
  return `Made by ${sendsTo(h)}, as set in Hermes Settings, Voice. A recording goes there only when you press Transcribe now on that take. Every take asks first.`
}

function Transcripts({ t }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const pick = async m => { setBusy(true); setErr(null); try { await post('settings', { transcript_model: m }); await loadHome() } catch (e) { setErr(errText(e)) } finally { setBusy(false) } }
  const h = t.hermes || {}
  const cached = (t.cached || {})[t.model]
  // The workbench's own model is in play when Hermes cannot run without a download, or when Hermes would
  // send takes away and one of the workbench's models is already here (so the choice can keep them here).
  const own = t.fallback && (!h.usable || (cloudish(h) && Object.values(t.cached || {}).some(Boolean)))
  return jsxs(Section, { title: 'Transcript engine', children: [
    jsx('p', { className: 'ldw-set-status', 'data-ok': t.available ? '' : undefined, children: h.usable ? hermesLine(h, t)
      : own ? 'Made on this computer with faster-whisper. Your recordings stay on it.'
      : 'Not set up yet. Every take still gets real timing and pauses.' }),
    own && h.reason === 'model' ? jsx('p', { className: 'ldw-set-line', children: `Hermes's own speech-to-text would first download its ${h.model} model, so the workbench uses its own copy, kept in its own folder.` }) : null,
    cloudish(h) && t.own_ready ? jsx('p', { className: 'ldw-set-line', children: `Hermes Settings, Voice names ${sendsTo(h)}. The workbench uses its own speech model on this computer instead, so nothing is sent.` }) : null,
    !t.available || (!h.usable && !t.fallback) ? jsx(Notice, { tone: 'info', children: TRANSCRIPTS_OFF }) : null,
    own ? jsx(Choices, { label: 'Transcript model', value: t.model, onChange: pick, disabled: busy, options: (t.models || []).map(m => ({ id: m, label: `${m}: ${MODEL_TEXT[m] || ''}` })) }) : null,
    own ? jsx('p', { className: 'ldw-set-line', children: cached
      ? `${t.model} is already on this computer.`
      : cloudish(h) ? `${t.model} is not on this computer, so each take asks before it goes to ${sendsTo(h)}. Pick a model that is here to keep transcripts on this computer.`
      : `The first transcript asks before it downloads ${t.model} (about ${(t.mb || {})[t.model] || 150} MB) from huggingface.co into the workbench's own folder, once. After that it works offline.` }) : null,
    own && t.own_folder_writable === false && !cached ? jsx(Notice, { tone: 'warn', children: "The workbench's folder for the speech model is not writable, so the model cannot be saved. Timing and pauses still work." }) : null,
    err ? jsx(Notice, { tone: 'bad', children: err }) : null,
  ] })
}

// A delete with a confirm in place: the button, then the question with Delete and Keep.
function DeleteWithConfirm({ label, ask, yes, no, disabled, run }) {
  const [sure, setSure] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const go = async () => {
    setBusy(true); setMsg(null)
    try { setMsg({ tone: 'good', text: await run() }) } catch (e) { setMsg({ tone: 'bad', text: errText(e) }) } finally { setBusy(false); setSure(false) }
  }
  return jsxs(Fragment, { children: [
    !sure ? jsx('div', { children: jsx(Button, { size: 'sm', variant: 'secondary', disabled, onClick: () => { setMsg(null); setSure(true) }, children: label }) }) : null,
    sure ? jsx(Notice, { tone: 'warn', children: ask, action: jsxs('div', { className: 'hk-actions', children: [
      jsx(Button, { size: 'sm', variant: 'secondary', className: 'ldw-danger', loading: busy, onClick: go, children: yes }),
      jsx(Button, { size: 'sm', variant: 'secondary', onClick: () => setSure(false), children: no }),
    ] }) }) : null,
    msg ? jsx(Notice, { tone: msg.tone, children: msg.text }) : null,
  ] })
}

const plural = (n, one) => `${n} ${one}${n === 1 ? '' : 's'}`

function Recordings({ r, kept }) {
  const wipeAudio = async () => {
    const d = await post('recordings/delete'); await loadHome()
    return `Deleted ${plural(d.deleted, 'recording')}. Your ballots, timing and transcripts are kept.`
  }
  const wipeWords = async () => {
    const d = await post('data/delete'); await loadHome()
    return `Deleted ${plural(d.transcripts, 'transcript')} and ${plural(d.ballots, 'ballot')}${d.round_ended ? ', and ended the round in progress' : ''}. Recordings, timing, cases and your extemp file are kept.`
  }
  return jsxs(Section, { title: 'Recordings, transcripts and ballots', children: [
    jsxs('p', { className: 'ldw-set-line', children: [jsx('b', { children: String(r.count) }), ` recording${r.count === 1 ? '' : 's'} on this computer, ${mb(r.bytes || 0)}. The newest ${r.keep} are kept; older ones are deleted as you go.`] }),
    jsx(DeleteWithConfirm, { label: 'Delete all recordings', ask: 'Delete every recording? Ballots, timing and transcripts stay.', yes: 'Delete them', no: 'Keep them', disabled: !r.count, run: wipeAudio }),
    jsxs('p', { className: 'ldw-set-line', children: [jsx('b', { children: String(kept.transcripts) }), ` transcript${kept.transcripts === 1 ? '' : 's'} and `, jsx('b', { children: String(kept.ballots) }), ` ballot${kept.ballots === 1 ? '' : 's'} on this computer.`] }),
    jsx(DeleteWithConfirm, { label: 'Delete transcripts and ballots', ask: 'Delete every transcript and ballot? A round in progress ends. Recordings, timing, cases and your extemp file stay.', yes: 'Delete them', no: 'Keep them', disabled: !kept.transcripts && !kept.ballots, run: wipeWords }),
  ] })
}

// Coach examples: on by default. A teacher turns them off for a room where students write every word.
function CoachExamples({ on }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const pick = async v => {
    setBusy(true); setErr(null)
    try { await post('settings', { coach_examples: v === 'on' }); $coachOn.set(v === 'on'); await loadHome() } catch (e) { setErr(errText(e)) } finally { setBusy(false) }
  }
  return jsxs(Section, { title: 'Coach examples', children: [
    jsx(Choices, { label: 'Coach examples', value: on ? 'on' : 'off', onChange: pick, disabled: busy, options: [{ id: 'on', label: 'On' }, { id: 'off', label: 'Off' }] }),
    jsx('p', { className: 'ldw-set-line', children: on
      ? "After you try something yourself, the coach can show a strong version and make suggestions: a model answer or opening, areas and evidence from your own file, contentions, a value and criterion, a block, a stronger card, three versions of your line, and a redo of the weakest moment on a ballot. Each one is marked as the coach's, and every citation, quote and number in it is checked against your file and your words."
      : 'The coach asks questions, explains and critiques, and writes nothing for you to say. For a room where students write every word. The coach chat still works.' }),
    err ? jsx(Notice, { tone: 'bad', children: err }) : null,
  ] })
}

function Outlets() {
  const [saved, setSaved] = useState(null)
  const [n, setN] = useState(0)
  return jsxs(Section, { title: 'Headline outlets', children: [
    jsx(OutletEditor, { key: n, embedded: true, onClose: d => { setSaved(d ? 'Saved. The next pull uses these outlets.' : null); setN(n + 1) } }),
    saved ? jsx(Notice, { tone: 'good', children: saved }) : null,
  ] })
}

export function SettingsView() {
  const home = useValue($home)
  if (!home) return jsx(Thinking, { label: 'Opening Settings' })
  // Settings open on what leaves the computer; the speech engine's details wait, folded, under Advanced.
  return jsxs('div', { className: 'ldw-settings', children: [
    jsx('h1', { className: 'ldw-set-h1', children: 'Settings' }),
    jsx(Section, { title: 'What leaves your computer', children: jsx(DisclosureList, { transcripts: home.transcripts }) }),
    jsx(CoachExamples, { on: !home.settings || home.settings.coach_examples !== false }),
    jsx(Recordings, { r: home.recordings || { count: 0, bytes: 0, keep: 20 }, kept: { transcripts: home.transcripts_kept || 0, ballots: home.ballots || 0 } }),
    jsxs('details', { className: 'ldw-advanced', children: [
      jsxs('summary', { children: [jsx('span', { className: 'ldw-set-title', children: 'Advanced' }), jsx('span', { className: 'ldw-advanced-sub', children: 'How transcripts are made on this computer' })] }),
      jsx(Transcripts, { t: home.transcripts || {} }),
    ] }),
    jsx(Outlets, {}),
  ] })
}

// Settings: how transcripts are made (Hermes's own speech-to-text, or the workbench's own model and whether
// it is already on this computer), the recordings, transcripts and ballots kept (each with a delete), the
// outlets for the headline pull, and what leaves the computer.

import { useState } from 'react'
import { Fragment, jsx, jsxs } from 'react/jsx-runtime'
import { Button, SegmentedControl, useValue } from '@hermes/plugin-sdk'
import { Notice } from 'hermes-ui-kit'
import { Thinking, errText, post } from './core.js'
import { $home, OutletEditor, loadHome } from './extemp.js'
import { TRANSCRIPTS_OFF } from './floor.js'

const MODEL_TEXT = { 'base.en': 'Faster', 'small.en': 'More accurate, slower' }
const mb = bytes => `${Math.max(0.1, bytes / 1048576).toFixed(bytes < 10485760 ? 1 : 0)} MB`

function Section({ title, children }) {
  return jsxs('section', { className: 'ldw-set', 'aria-label': title, children: [jsx('h2', { className: 'ldw-set-title', children: title }), jsx('div', { className: 'ldw-set-body', children })] })
}

// Which speech-to-text makes the transcripts, said plainly: Hermes's own (as set in Hermes Settings, Voice),
// or, when Hermes cannot without a download of its own, the workbench's faster-whisper with its model in
// the workbench's own folder.
function hermesLine(h) {
  if (h.local === false) return `Made by ${h.label}, the speech-to-text chosen in Hermes Settings, Voice. Each recording goes to ${h.label} to be transcribed.`
  if (h.local === true) return `Made on this computer by ${h.label}, as set in Hermes Settings, Voice. Your recordings stay on it.`
  return 'Made by the speech-to-text set up in Hermes Settings, Voice. If that is a cloud service, each recording goes to it to be transcribed.'
}

function Transcripts({ t }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const pick = async m => { setBusy(true); setErr(null); try { await post('settings', { transcript_model: m }); await loadHome() } catch (e) { setErr(errText(e)) } finally { setBusy(false) } }
  const h = t.hermes || {}
  const own = !h.usable && t.fallback
  const cached = (t.cached || {})[t.model]
  return jsxs(Section, { title: 'Transcripts', children: [
    jsx('p', { className: 'ldw-set-status', 'data-ok': t.available ? '' : undefined, children: h.usable ? hermesLine(h)
      : own ? 'Made on this computer with faster-whisper. Your recordings stay on it.'
      : 'Not set up yet. Every take still gets real timing and pauses.' }),
    own && h.reason === 'model' ? jsx('p', { className: 'ldw-set-line', children: `Hermes's own speech-to-text would first download its ${h.model} model, so the workbench uses its own copy, kept in its own folder.` }) : null,
    !t.available || (!h.usable && !t.fallback) ? jsx(Notice, { tone: 'info', children: TRANSCRIPTS_OFF }) : null,
    own ? jsx(SegmentedControl, { value: t.model, onChange: pick, disabled: busy, options: (t.models || []).map(m => ({ id: m, label: `${m}: ${MODEL_TEXT[m] || ''}` })) }) : null,
    own ? jsx('p', { className: 'ldw-set-line', children: cached
      ? `${t.model} is already on this computer.`
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

function Outlets() {
  const [saved, setSaved] = useState(null)
  const [n, setN] = useState(0)
  return jsxs(Section, { title: 'Headline outlets', children: [
    jsx(OutletEditor, { key: n, embedded: true, onClose: d => { setSaved(d ? 'Saved. The next pull uses these outlets.' : null); setN(n + 1) } }),
    saved ? jsx(Notice, { tone: 'good', children: saved }) : null,
  ] })
}

// The first two lines follow the speech-to-text Hermes uses, so they never promise more than is true.
function voiceLines(t) {
  const h = (t && t.hermes) || {}
  const kept = 'Recorded only while you speak and kept on the computer that runs Hermes.'
  if (h.usable && h.local === false) return [
    ['Your voice', `${kept} Each recording goes to ${h.label}, the speech-to-text chosen in Hermes, to be transcribed. It never goes to a model or a website otherwise.`],
    ['Transcripts', `Made by ${h.label}, through Hermes. Change it in Hermes Settings, Voice; local keeps your voice on this computer.`]]
  if (h.usable && h.local !== true) return [
    ['Your voice', `${kept} If the speech-to-text set up in Hermes is a cloud service, each recording goes to it to be transcribed. Otherwise it never leaves.`],
    ['Transcripts', 'Made by the speech-to-text set up in Hermes Settings, Voice.']]
  return [
    ['Your voice', `${kept} It never goes to a model or a website.`],
    ['Transcripts', h.usable ? "Made on this computer by Hermes's own speech-to-text." : "Made on the computer that runs Hermes. The only download is the workbench's speech model, once, when you ask for it."]]
}

const LEAVES = [
  ['Your words', 'The words of your speeches go to the model you chose in Hermes, for the opponent, the judge and the coach.'],
  ['Headlines', 'A pull asks Google News, or the outlet’s own feed, for headlines on your topic. Only titles, dates and links come back.'],
  ['Hear it', 'When you press it, the opponent’s speech goes to the voice you set up in Hermes to be read aloud.'],
  ['Web search', 'Only in a round you set to internet allowed, when you press Search. Your search words go to the web search you set up in Hermes.'],
  ['Saved links', 'When you save a link to your file or add one as a topic source, the page is read once to keep its text.'],
]

export function SettingsView() {
  const home = useValue($home)
  if (!home) return jsx(Thinking, { label: 'Opening Settings' })
  return jsxs('div', { className: 'ldw-settings', children: [
    jsx('h1', { className: 'ldw-set-h1', children: 'Settings' }),
    jsx(Transcripts, { t: home.transcripts || {} }),
    jsx(Recordings, { r: home.recordings || { count: 0, bytes: 0, keep: 20 }, kept: { transcripts: home.transcripts_kept || 0, ballots: home.ballots || 0 } }),
    jsx(Outlets, {}),
    jsx(Section, { title: 'What leaves your computer', children: jsx('dl', { className: 'ldw-leaves', children: voiceLines(home.transcripts).concat(LEAVES).map(([k, v]) => jsxs(Fragment, { children: [jsx('dt', { children: k }), jsx('dd', { children: v })] }, k)) }) }),
  ] })
}

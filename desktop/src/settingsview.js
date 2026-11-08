// Settings: how transcripts are made (and whether the speech model is already on this computer), the
// recordings kept, the outlets for the headline pull, and what leaves the computer.

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

function Transcripts({ t }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const pick = async m => { setBusy(true); setErr(null); try { await post('settings', { transcript_model: m }); await loadHome() } catch (e) { setErr(errText(e)) } finally { setBusy(false) } }
  const cached = (t.cached || {})[t.model]
  return jsxs(Section, { title: 'Transcripts', children: [
    jsx('p', { className: 'ldw-set-status', 'data-ok': t.available ? '' : undefined, children: t.available
      ? 'Made on this computer with faster-whisper. Your recordings never leave it.'
      : 'Not set up yet. Every take still gets real timing and pauses.' }),
    !t.available ? jsx(Notice, { tone: 'info', children: TRANSCRIPTS_OFF }) : null,
    jsx(SegmentedControl, { value: t.model, onChange: pick, disabled: busy, options: (t.models || []).map(m => ({ id: m, label: `${m}: ${MODEL_TEXT[m] || ''}` })) }),
    t.available ? jsx('p', { className: 'ldw-set-line', children: cached
      ? `${t.model} is already on this computer.`
      : `The first transcript downloads ${t.model} (about ${(t.mb || {})[t.model] || 150} MB) from huggingface.co, once. After that it works offline.` }) : null,
    err ? jsx(Notice, { tone: 'bad', children: err }) : null,
  ] })
}

function Recordings({ r }) {
  const [sure, setSure] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const wipe = async () => {
    setBusy(true); setMsg(null)
    try { const d = await post('recordings/delete'); await loadHome(); setMsg({ tone: 'good', text: `Deleted ${d.deleted} recording${d.deleted === 1 ? '' : 's'}. Your ballots, timing and transcripts are kept.` }) } catch (e) { setMsg({ tone: 'bad', text: errText(e) }) } finally { setBusy(false); setSure(false) }
  }
  return jsxs(Section, { title: 'Recordings', children: [
    jsxs('p', { className: 'ldw-set-line', children: [jsx('b', { children: String(r.count) }), ` recording${r.count === 1 ? '' : 's'} on this computer, ${mb(r.bytes || 0)}. The newest ${r.keep} are kept; older ones are deleted as you go.`] }),
    !sure ? jsx('div', { children: jsx(Button, { size: 'sm', variant: 'secondary', disabled: !r.count, onClick: () => setSure(true), children: 'Delete all recordings' }) }) : null,
    sure ? jsx(Notice, { tone: 'warn', children: 'Delete every recording? Ballots, timing and transcripts stay.', action: jsxs('div', { className: 'hk-actions', children: [
      jsx(Button, { size: 'sm', variant: 'secondary', className: 'ldw-danger', loading: busy, onClick: wipe, children: 'Delete them' }),
      jsx(Button, { size: 'sm', variant: 'secondary', onClick: () => setSure(false), children: 'Keep them' }),
    ] }) }) : null,
    msg ? jsx(Notice, { tone: msg.tone, children: msg.text }) : null,
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

const LEAVES = [
  ['Your voice', 'Recorded in this window only while you speak, kept on this computer, never sent anywhere.'],
  ['Transcripts', 'Made on this computer. The one exception is the first download of the speech model.'],
  ['Your words', 'The words of your speeches go to the model you chose in Hermes, for the opponent, the judge and the coach.'],
  ['Headlines', 'A pull asks Google News, or the outlet’s own feed, for headlines on your topic. Only titles, dates and links come back.'],
  ['Saved links', 'When you save a link to your file, the page is read once to keep its text.'],
]

export function SettingsView() {
  const home = useValue($home)
  if (!home) return jsx(Thinking, { label: 'Opening Settings' })
  return jsxs('div', { className: 'ldw-settings', children: [
    jsx('h1', { className: 'ldw-set-h1', children: 'Settings' }),
    jsx(Transcripts, { t: home.transcripts || {} }),
    jsx(Recordings, { r: home.recordings || { count: 0, bytes: 0, keep: 20 } }),
    jsx(Outlets, {}),
    jsx(Section, { title: 'What leaves your computer', children: jsx('dl', { className: 'ldw-leaves', children: LEAVES.map(([k, v]) => jsxs(Fragment, { children: [jsx('dt', { children: k }), jsx('dd', { children: v })] }, k)) }) }),
  ] })
}

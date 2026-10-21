// Renders desktop/plugin.js inside a Hermes-like window. ctx.rest answers from fixtures.js (real backend answers).
// URL parameters:
//   view   room | bench | print                  (default room)
//   scene  ballot | speech | cx | setup | judging | opp (the opponent's NR with Spot fallacies run) (room only; default ballot)
//   theme  dark | light                          (default dark)
//   drills 1                                     (open the drills under the paper ballot)
//   fx     1                                     (Fallacies: start a drill, pick a wrong answer, check a pasted argument)
import { createRoot } from 'react-dom/client'
import { jsx, jsxs } from 'react/jsx-runtime'
import { CONFIG, DRILL, SPOT, SPOT_INPUT, STATE } from './fixtures.js'

const params = new URLSearchParams(location.search)
const dark = params.get('theme') !== 'light'
document.documentElement.dataset.theme = dark ? 'dark' : 'light'
document.documentElement.classList.toggle('dark', dark) // the app marks dark mode with :root.dark
const pause = ms => new Promise(r => setTimeout(r, ms))
const clone = x => JSON.parse(JSON.stringify(x))

function sceneState() {
  const s = clone(STATE)
  const r = s.round
  const scene = params.get('scene') || 'ballot'
  if (scene === 'setup') s.round = null
  if (scene === 'opp') {
    const nr = r.transcript.find(t => t.id === 'NR')
    r.transcript = r.transcript.filter(t => t.id !== 'NR' && t.id !== '2AR')
    r.phase = 'live'; r.i = 5; r.ballots = []; r.prep = 95
    r.pending_ai = { id: 'NR', text: nr.text }
    r.spots = { NR: SPOT }
  }
  if (scene === 'speech' || scene === 'cx' || scene === 'judging') {
    const upto = scene === 'speech' ? 4 : scene === 'cx' ? 3 : 7
    const keep = new Set(CONFIG.round.slice(0, upto).map(x => x.id))
    const mine = r.transcript.find(t => t.id === '1AR')
    r.transcript = r.transcript.filter(t => keep.has(t.id))
    r.flow = Object.fromEntries(Object.entries(r.flow).filter(([k]) => keep.has(k)))
    if (scene === 'cx') r.cx = { CX1: r.cx.CX1, CX2: r.cx.CX2 }
    r.phase = scene === 'judging' ? 'judging' : 'live'
    r.i = upto
    r.ballots = []
    r.prep = 161
    if (scene === 'speech') r.drafts = { '1AR': mine ? mine.text : '' }
    if (scene === 'judging') r.transcript = clone(STATE.round.transcript)
  }
  return s
}

async function rest(path, options = {}) {
  await pause(30)
  if (path === 'config') return clone(CONFIG)
  if (path === 'state') return sceneState()
  if (path === 'drill') return clone(DRILL)
  if (path === 'spot') return { text: SPOT }
  if (params.get('scene') === 'judging' && path === 'round/judge') return new Promise(() => {})
  throw new Error('400: {"detail":"The harness does not answer this request."}')
}

const contributions = []
const ctx = {
  rest, registerMany(list) { contributions.push(...list) }, register(i) { contributions.push(i) },
  onEvent() { return () => {} }, onDispose() {}, setTimeout, setInterval,
  storage: { get: (k, f) => f, set() {}, remove() {} },
  os: { async revealPath() { return true }, async pickSavePath() { return null } },
}
const mod = await import('../desktop/plugin.js')
mod.default.register(ctx)
mod.openView(params.get('view') || 'room')
const page = contributions.find(c => c.area === 'routes')
const nav = contributions.filter(c => c.area === 'sidebar.nav')
const CORE = [['New session', 'robot'], ['Capabilities', 'extensions'], ['Messaging', 'comment'], ['Kanban', 'layout'], ['Scheduled jobs', 'watch']]

function Shell() {
  return jsxs('div', { className: 'hb-window', children: [
    jsx('div', { className: 'hb-titlebar', children: jsxs('div', { className: 'hb-lights', children: [jsx('span', {}), jsx('span', {}), jsx('span', {})] }) }),
    jsxs('div', { className: 'hb-body', children: [
      jsxs('nav', { className: 'hb-sidebar', children: [
        ...CORE.map(([l, i]) => jsxs('div', { className: 'hb-nav', children: [jsx('i', { className: `codicon codicon-${i}` }), l] }, l)),
        ...nav.map(n => jsxs('div', { className: 'hb-nav hb-nav-active', children: [jsx('i', { className: `codicon codicon-${n.data.codicon}` }), n.data.label] }, n.id)),
      ] }),
      jsx('main', { className: 'hb-main', style: { overflow: 'auto' }, children: page.render() }),
    ] }),
  ] })
}
createRoot(document.getElementById('root')).render(jsx(Shell, {}))
try { await document.fonts.load('16px codicon') } catch (e) { /* icons may be missing */ }
await pause(900)
if (params.get('drills')) {
  const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Run the drills')
  if (b) b.click()
  await pause(300)
}
if (params.get('fx')) {
  const click = t => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === t); if (b) b.click() }
  click('Give me an argument'); await pause(300)
  click('Slippery slope'); await pause(200)
  const ta = document.querySelector('textarea[aria-label="Argument to check"]')
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(ta, SPOT_INPUT)
  ta.dispatchEvent(new Event('input', { bubbles: true })); await pause(200)
  click('Find the fallacies'); await pause(500)
}
document.documentElement.dataset.ready = '1'

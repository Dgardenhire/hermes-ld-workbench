// Renders desktop/plugin.js inside a Hermes-like window. ctx.rest answers from fixtures.js (real backend answers).
// URL parameters:
//   view   extemp | rhetoric | ballots | room | bench | fallacies | print   (default extemp)
//   x      extemp scene: ready | take (judging) | ballot | live (records from Chrome's fake mic) | draw | prep | speak
//   stage  rhetoric stage: read (Lincoln's Second Inaugural, marked) | figures | spot | write
//   accent red | green                           (test the accent against the red and green meanings)
//   scene  ballot | speech | cx | setup | judging | opp (the opponent's NR with Spot fallacies run) (room only; default ballot)
//   theme  dark | light                          (default dark)
//   drills 1                                     (open the drills under the paper ballot)
//   open   switcher | more | export | judges     (open that menu after load)
//   brief  1                                     (the resolution is new: the topic briefing opens by itself)
//   fx     1                                     (Fallacies: start a drill, pick a wrong answer, check a pasted argument)
import { createRoot } from 'react-dom/client'
import { jsx, jsxs } from 'react/jsx-runtime'
import { BRIEFING, CONFIG, DRILL, SPOT, SPOT_INPUT, STATE } from './fixtures.js'
import { BALLOT, BALLOTS, HOME, MARKS, OUTLETS, PULL, RHETORIC, SPEECHES, SPOT as FIGSPOT, TAKE } from './fixtures02.js'

const params = new URLSearchParams(location.search)
const dark = params.get('theme') !== 'light'
document.documentElement.dataset.theme = dark ? 'dark' : 'light'
document.documentElement.classList.toggle('dark', dark) // the app marks dark mode with :root.dark
const accent = { red: dark ? '#f0524c' : '#d1242f', green: dark ? '#2fbf71' : '#1a7f37' }[params.get('accent')]
if (accent) { document.documentElement.style.setProperty('--ui-accent', accent); document.documentElement.style.setProperty('--dt-primary', accent) }
const X = params.get('x') || 'ready'
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
  // The backend checks the judge's quoted lines against the speeches (engine.check_ld_lines); mirror it.
  const norm = t => String(t || '').replace(/[\u201c\u201d]/g, '"').replace(/\s+/g, ' ').toLowerCase()
  for (const b of (s.round && s.round.ballots) || []) {
    const all = norm(s.round.transcript.map(t => t.text).join(' '))
    for (const d of b.decisive || []) d.checked = String(d.line).split(/\.\.\.|\u2026/).map(x => norm(x).trim()).filter(x => x.split(' ').length >= 3).every(x => all.includes(x))
  }
  return s
}

function home() {
  const h = clone(HOME)
  if (['take', 'ballot'].includes(X)) h.last_take = { drill: clone(TAKE) }
  if (X === 'prep' || X === 'speak') {
    h.extemp_round = { id: 'r1', question: 'Can a Democratic Congress change trade policy if the President vetoes every tariff repeal?', area: 'us', mode: 'files',
      phase: X, started: 1762570000, prep_left: X === 'prep' ? 1312 : 0, take: null, ballot: null,
      outline: { attention: 'In 1930 Congress set every tariff itself.', link: 'Today the President does, and the House just changed hands.', answer: 'Partly, through the budget',
        area1: 'Veto math in the Senate', area2: 'Spending riders on tariff money', area3: 'Deals on farm relief', conclusion: '', sources: ['f1', 'f2'] } }
  }
  if (X === 'draw' || X === 'prep' || X === 'speak') h.extemp_round = X === 'draw' ? null : h.extemp_round
  return h
}
const FILE = { items: [
  { id: 'f1', title: 'Top US House Democrat on trade issues committed to reversing tariffs', outlet: 'Reuters', lean: 'Center', at: 1762300000, topics: ['tariffs'], note: '', url: 'https://news.google.com/', has_text: false },
  { id: 'f2', title: 'Repeal the Tariffs', outlet: 'National Review', lean: 'Lean Right', at: 1762200000, topics: ['tariffs'], note: 'Editorial board, from the right', url: 'https://news.google.com/', has_text: false },
  { id: 'f3', title: "Trump's tariffs are costing this Michigan couple", outlet: 'NPR', lean: 'Lean Left', at: 1762100000, topics: ['tariffs'], note: '', url: 'https://news.google.com/', has_text: false },
], topics: ['tariffs'], count: 3 }

async function rest(path, options = {}) {
  await pause(30)
  if (path === 'home') return home()
  if (path === 'settings') return { event: 'extemp' }
  if (path === 'rhetoric') return clone(RHETORIC)
  if (path.startsWith('rhetoric/speech/')) return clone(SPEECHES[path.split('/').pop()])
  if (path === 'rhetoric/marks') return clone(MARKS)
  if (path === 'rhetoric/spot') return clone(FIGSPOT)
  if (path === 'ballots') return clone(BALLOTS)
  if (path === 'outlets') return { ...clone(OUTLETS), suggested: [], labels_checked: 'Nov 7, 2026', leans: ['Left', 'Lean Left', 'Center', 'Lean Right', 'Right'], sides: ['left', 'center', 'right'] }
  if (path === 'headlines/pull') return clone(PULL)
  if (path === 'extemp/file') return clone(FILE)
  if (path === 'extemp/round') return home().extemp_round
  if (/^speech\/[^/]+\/judge$/.test(path)) return X === 'take' ? new Promise(() => {}) : clone(BALLOT)
  if (path === 'speech/take') return { ...clone(TAKE), id: 'live1', levels: options.body.levels || [], duration: options.body.duration, transcript: { status: 'waiting', text: '', words: [] } }
  if (/^speech\/[^/]+\/(upload|audio)$/.test(path)) return { ...clone(TAKE), id: 'live1', transcript: { status: 'working', text: '', words: [] } }
  if (/^speech\/[^/]+$/.test(path)) return clone(TAKE)
  if (path === 'config') return clone(CONFIG)
  if (path === 'state') return sceneState()
  if (path === 'briefing') {
    const body = options.body || {}
    if (body.mode === 'check') return { known: !params.get('brief'), resolution: body.resolution }
    return { text: BRIEFING, cached: false, resolution: body.resolution }
  }
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
mod.openView(params.get('view') || 'extemp')
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
const click = t => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === t); if (b) b.click(); return !!b }
if (params.get('stage')) {
  const names = { read: 'Read', figures: 'Figures', spot: 'Spot', write: 'Write', say: 'Say it' }
  const seg = [...document.querySelectorAll('.ldw-seg-btn')].find(b => b.textContent.startsWith(names[params.get('stage')]))
  if (seg) seg.click()
  await pause(300)
  if (params.get('stage') === 'read') {
    const lib = [...document.querySelectorAll('.ldw-lib-item')].find(b => b.textContent.startsWith('Second Inaugural'))
    if (lib) lib.click()
    await pause(300); click('Mark the figures'); await pause(400)
  }
  if (params.get('stage') === 'spot') { click('Diacope'); await pause(200) }
}
if (X === 'draw') {
  click('Full round'); await pause(300)
  const inp = document.querySelector('input[aria-label="Topic"]')
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(inp, 'tariffs')
  inp.dispatchEvent(new Event('input', { bubbles: true })); await pause(100)
  click('Pull headlines'); await pause(500)
}
if (X === 'live') { click('Start speaking'); await pause(Number(params.get('ms') || 6000)) }
const openWhat = params.get('open')
if (openWhat) {
  const btn = openWhat === 'switcher' ? document.querySelector('.ldw-switcher')
    : openWhat === 'more' ? document.querySelector('[aria-label="More help with Value"]')
    : [...document.querySelectorAll('[aria-haspopup="menu"]')].find(b => b.textContent.trim().startsWith(openWhat === 'export' ? 'Export' : 'Ask another judge'))
  if (btn) { if (openWhat === 'more') btn.scrollIntoView({ block: 'center' }); btn.click() }
  await pause(300)
}
document.documentElement.dataset.ready = '1'

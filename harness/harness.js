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
//   spotmiss 1                                   (room scene opp: one fallacy quote paraphrased, so the not-found mark shows)
//   q      n                                     (extemp: open on question n of the pool; default 0, the Federal Reserve one)
//   own    1                                     (extemp: one question of the student's own on the list)
//   coach  off                                   (Settings, Coach examples off: no example buttons; the chat explains only)
// Hand-written, not captured: the drawn questions (DRAW) and the fallacies under the NR (SPOT_NR); see make_fixtures.py.
// Only the Federal Reserve answer has a ballot here: any other question answers with a harness notice.
import { createRoot } from 'react-dom/client'
import { jsx, jsxs } from 'react/jsx-runtime'
import { BRIEFING, CONFIG, DRILL, SPOT, SPOT_INPUT, STATE } from './fixtures.js'
import { BALLOT, BALLOTS, DRAW, HOME, JUDGES, MARKS, OUTLETS, PULL, RHETORIC, SPEECHES, SPOT as FIGSPOT, SPOT_NR, SPOT_NR_MISS, TAKE } from './fixtures02.js'
import { COACH } from './fixtures_coach.js'

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
    r.spots = { NR: params.get('spotmiss') ? SPOT_NR_MISS : SPOT_NR }
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

const OWN_Q = { id: 'qown1', area: 'us', topic: 'your own', text: 'Should our state require a semester of personal finance to graduate?', own: true, hidden: false }
let questions = null
function questionList() {
  if (!questions) questions = { questions: [...(params.get('own') ? [clone(OWN_Q)] : []), ...clone(HOME.pool)], mine_only: false, next: 0 }
  return questions
}
function home() {
  const h = clone(HOME)
  h.pool = questionList().questions.filter(q => !q.hidden && (q.own || !questions.mine_only))
  h.pool_start = Number(params.get('q') || 0)
  if (['take', 'ballot'].includes(X)) h.last_take = { drill: clone(TAKE) }
  if (X === 'prep' || X === 'speak') {
    h.extemp_round = { id: 'r1', question: 'Should the Federal Reserve raise rates again before the end of the year?', area: 'us', mode: params.get('pm') === 'internet' ? 'internet' : 'files',
      phase: X, started: 1762570000, prep_left: X === 'prep' ? 1312 : 0, take: null, ballot: null,
      outline: { attention: 'The Fed held rates steady in October.', link: 'A strong jobs report since then has put another hike on the table.', answer: 'Yes, one small hike',
        area1: 'Prices are still above the 2% goal', area2: 'The jobs market can take it', area3: 'Waiting costs more later', conclusion: '', sources: ['f1', 'f2'] } }
  }
  if (X === 'draw' || X === 'prep' || X === 'speak') h.extemp_round = X === 'draw' ? null : h.extemp_round
  h.settings = { ...(h.settings || {}), coach_examples: params.get('coach') !== 'off' }
  return h
}
const FILE = { items: [
  // Real headlines from a pull on the Federal Reserve, Nov 7, 2026 (harness/make_fixtures.py's PULL).
  { id: 'f1', title: 'Fed policymakers consider rate hike after strong jobs report', outlet: 'Reuters', lean: 'Center', at: 1793998714, topics: ['federal reserve'], note: '', url: 'https://news.google.com/', has_text: false },
  { id: 'f2', title: 'Does Anyone Know Why the Fed Didn’t Raise Rates?', outlet: 'National Review', lean: 'Lean Right', at: 1793170800, topics: ['federal reserve'], note: '', url: 'https://news.google.com/', has_text: false },
  { id: 'f3', title: 'Hiring jumps: The economy added 165,000 jobs last month', outlet: 'NPR', lean: 'Lean Left', at: 1793972961, topics: ['federal reserve'], note: '', url: 'https://news.google.com/', has_text: false },
], topics: ['federal reserve'], count: 3 }

// What a user's Hermes web search might return for the prep screen (titles and links only). Real pages;
// titles and snippets as the pages read on Nov 7, 2026.
const WEB = [
  { title: 'The Fed - What economic goals does the Federal Reserve seek to achieve through its monetary policy?', url: 'https://www.federalreserve.gov/faqs/what-economic-goals-does-federal-reserve-seek-to-achieve-through-monetary-policy.htm', site: 'federalreserve.gov', snippet: 'Congress has assigned the Fed to conduct the nation\'s monetary policy to support the goals of maximum employment and stable prices.' },
  { title: 'The Fed Explained - Monetary Policy', url: 'https://www.federalreserve.gov/aboutthefed/fedexplained/monetary-policy.htm', site: 'federalreserve.gov', snippet: 'Meeting the Fed\'s "Dual Mandate" in Practice.' },
  { title: 'Federal Reserve Board - Monetary Policy', url: 'https://www.federalreserve.gov/monetarypolicy.htm', site: 'federalreserve.gov', snippet: '' },
]

// A few seconds of silence as a WAV file, standing in for the user's Hermes voice.
function silentWav(seconds) {
  const rate = 8000, n = rate * seconds, buf = new DataView(new ArrayBuffer(44 + n))
  const str = (o, t) => [...t].forEach((c, i) => buf.setUint8(o + i, c.charCodeAt(0)))
  str(0, 'RIFF'); buf.setUint32(4, 36 + n, true); str(8, 'WAVEfmt '); buf.setUint32(16, 16, true); buf.setUint16(20, 1, true); buf.setUint16(22, 1, true)
  buf.setUint32(24, rate, true); buf.setUint32(28, rate, true); buf.setUint16(32, 1, true); buf.setUint16(34, 8, true); str(36, 'data'); buf.setUint32(40, n, true)
  for (let i = 0; i < n; i++) buf.setUint8(44 + i, 128)
  let bin = ''; new Uint8Array(buf.buffer).forEach(b => { bin += String.fromCharCode(b) })
  return btoa(bin)
}

async function rest(path, options = {}) {
  await pause(30)
  if (path === 'home') return home()
  if (path === 'settings') return { event: 'extemp' }
  if (path === 'rhetoric') return clone(RHETORIC)
  if (path.startsWith('rhetoric/speech/')) return clone(SPEECHES[path.split('/').pop()])
  if (path === 'rhetoric/marks') return clone(MARKS)
  if (path === 'rhetoric/spot') return clone(FIGSPOT)
  if (path === 'ballots') return clone(BALLOTS)
  if (path === 'outlets') return { suggested: [], ...clone(OUTLETS), labels_checked: 'Nov 7, 2026', leans: ['Left', 'Lean Left', 'Center', 'Lean Right', 'Right'], sides: ['left', 'center', 'right'] }
  if (path === 'headlines/pull') return clone(PULL)
  if (path === 'extemp/draw') return clone(DRAW)
  if (path === 'extemp/questions/seen') return { next: 1 }
  if (path === 'extemp/questions/restore') { questionList().questions.forEach(q => { q.hidden = false }); return clone(questions) }
  if (/^extemp\/questions\/[^/]+\/delete$/.test(path)) {
    const id = decodeURIComponent(path.split('/')[2]); const L = questionList()
    L.questions = L.questions.filter(q => !(q.own && q.id === id)); L.questions.forEach(q => { if (q.id === id) q.hidden = true }); return clone(L)
  }
  if (path === 'extemp/questions') {
    const L = questionList()
    if (options.method === 'POST' && 'mine_only' in options.body) L.mine_only = !!options.body.mine_only
    else if (options.method === 'POST') { const t = options.body.text.trim(); L.questions.unshift({ id: `qh${L.questions.length}`, area: options.body.area || 'us', topic: 'your own', text: t.endsWith('?') ? t : `${t}?`, own: true, hidden: false }) }
    return clone(L)
  }
  if (path === 'ballots/export') return { path: '/Users/student/Documents/debate-ballots.txt', name: 'debate-ballots.txt', count: BALLOTS.history.length }
  if (/^extemp\/file\/[^/]+\/delete$/.test(path)) return { ok: true }
  if (path === 'extemp/file') return options.method === 'POST' ? { ...options.body, id: `w${Date.now()}`, topics: [] } : clone(FILE)
  if (path === 'round/listen') return { parts: [{ b64: silentWav(5), mime: 'audio/wav' }], cached: false }
  if (path === 'extemp/search') return { query: 'fed dual mandate rate hike', results: WEB }
  if (path === 'extemp/round') return home().extemp_round
  if (/^speech\/[^/]+\/judge$/.test(path)) {
    if (X === 'take') return new Promise(() => {})
    if (options.body && options.body.question && options.body.question !== BALLOT.question) throw new Error('400: {"detail":"The harness only has a ballot for the Federal Reserve answer. Ballots on other questions need a live model."}')
    return clone(BALLOT)
  }
  if (path === 'speech/take' && options.body.typed) {
    const w = options.body.text.trim().split(/\s+/).length
    return { ...clone(TAKE), id: `t${Math.random().toString(16).slice(2, 8)}`, event: options.body.event, typed: true, has_audio: false, levels: [],
      transcript: { status: 'typed', text: options.body.text, words: [] }, stats: { estimated: true, estimated_seconds: Math.round(w / 140 * 60), words: w } }
  }
  if (path === 'openings/coach') return { best: 2, why: 'It reaches the question in the second sentence and answers it right away; the other two take longer to get there.',
    notes: [{ n: 1, worked: 'A real number from 1979 makes people listen.', fix: 'Get from the milk price to the question in one sentence, not two.' },
      { n: 2, worked: 'You answered the question before 15 seconds.', fix: 'Name where the grocery-store worry comes from: a survey or a report, with its date.' },
      { n: 3, worked: 'You said the question clearly.', fix: 'Start with something concrete, a person or a number, instead of "Jobs matter."' }],
    next: 'Open with one person: who they are, what happened to them, and how it ties to the question.' }
  if (path === 'speech/take') return { ...clone(TAKE), id: 'live1', levels: options.body.levels || [], duration: options.body.duration, transcript: { status: 'waiting', text: '', words: [] } }
  if (/^speech\/[^/]+\/(upload|audio)$/.test(path)) return { ...clone(TAKE), id: 'live1', transcript: { status: 'working', text: '', words: [] } }
  if (/^speech\/[^/]+$/.test(path)) return clone(TAKE)
  if (path === 'config') return { ...clone(CONFIG), judges: clone(JUDGES) } // the plugin's judges now, the circuit judge included
  if (path === 'state') return sceneState()
  if (path === 'briefing') {
    const body = options.body || {}
    if (body.mode === 'check') return { known: !params.get('brief'), resolution: body.resolution }
    return { text: BRIEFING, cached: false, resolution: body.resolution }
  }
  if (path === 'drill') return clone(DRILL)
  // The coach (harness/make_coach_fixtures.py: hand-written answers put through the plugin's own checks).
  if (path === 'coach/extemp/example') return clone(options.body.kind === 'opening' ? COACH.opening : COACH.answer)
  if (path === 'coach/extemp/areas') return clone(COACH.areas)
  if (path === 'coach/extemp/evidence') return clone(COACH.evidence)
  if (path === 'coach/rhetoric/versions') return clone(COACH.versions)
  if (path === 'rhetoric/critique') return clone(COACH.critique)
  if (path === 'coach/ballot/show') return clone([1762400000, 1762480000, 1762571000].includes(options.body.at) ? COACH.show_drill : COACH.show_ld)
  if (path === 'coach/ld/suggest') {
    const s = sceneState()
    s.workbench.case.suggestions = { [options.body.section]: clone(COACH.ld_block) }
    return { ...clone(COACH.ld_block), ...s.workbench }
  }
  if (path === 'coach/chat') {
    if (options.body.floor !== 'extemp') throw new Error('400: {"detail":"The harness has a coach answer only on the 60-second answer. Other floors need a live model."}')
    return { ...clone(COACH.chat_extemp), examples: params.get('coach') !== 'off' }
  }
  if (path === 'spot') return { text: options.body && options.body.speech_id ? SPOT_NR : SPOT }
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
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(inp, 'the Federal Reserve')
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

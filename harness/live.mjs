// Drive the recorder for real in headless Chrome with its fake microphone (a steady tone, or SPEECH_WAV), over the
// DevTools protocol, and screenshot the floor while speaking and after Stop. Serve the repo first:
//   /usr/bin/python3 -m http.server 8793 --bind 127.0.0.1 --directory .
//   node harness/live.mjs [outdir]
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const OUT = process.argv[2] || 'docs/shots/v02'
const PORT = 9333
const pause = ms => new Promise(r => setTimeout(r, ms))
mkdirSync(OUT, { recursive: true })
// SPEECH_WAV: a WAV file to use as the fake microphone (shoot.sh makes one with macOS `say`, with a pause in it),
// so the waveform shows a speaking voice and a pause mark instead of a steady tone.
const WAV = process.env.SPEECH_WAV ? [`--use-file-for-fake-audio-capture=${process.env.SPEECH_WAV}`, "--disable-features=AudioServiceOutOfProcess,AudioServiceSandbox"] : []
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--mute-audio', `--remote-debugging-port=${PORT}`, '--use-fake-device-for-media-stream', ...WAV,
  '--use-fake-ui-for-media-stream', '--hide-scrollbars', '--window-size=1440,900', `--user-data-dir=${join(process.env.TMPDIR || '/tmp', 'ldw-live-chrome')}`, 'about:blank'], { stdio: 'ignore' })
let ws
try {
  let target
  for (let i = 0; i < 40 && !target; i++) {
    await pause(250)
    try { target = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find(t => t.type === 'page') } catch (e) { /* not up yet */ }
  }
  ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise(r => ws.addEventListener('open', r))
  let id = 0
  const waiting = new Map()
  const logs = []
  ws.addEventListener('message', ev => {
    const m = JSON.parse(ev.data)
    if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id) }
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') logs.push(m.params.args.map(a => a.value || a.description).join(' '))
    if (m.method === 'Runtime.exceptionThrown') logs.push(m.params.exceptionDetails.text + ' ' + ((m.params.exceptionDetails.exception || {}).description || ''))
  })
  const send = (method, params = {}) => new Promise(r => { const i = ++id; waiting.set(i, r); ws.send(JSON.stringify({ id: i, method, params })) })
  const evalJs = async expr => ((await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result || {}).result?.value
  const shot = async name => { const r = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(join(OUT, `${name}.png`), Buffer.from(r.result.data, 'base64')); console.log(join(OUT, `${name}.png`)) }
  await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable')
  await send('Network.setCacheDisabled', { cacheDisabled: true }) // the profile folder persists; never test a stale bundle
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })
  await send('Page.navigate', { url: `http://127.0.0.1:${process.env.HARNESS_PORT || process.env.PORT_HARNESS || 8793}/harness/?view=extemp${process.env.THEME ? `&theme=${process.env.THEME}` : ''}` })
  for (let i = 0; i < 60 && (await evalJs('document.documentElement.dataset.ready')) !== '1'; i++) await pause(250)
  await evalJs(`[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Start speaking').click()`)
  await pause(Number(process.env.SPEAK_MS || 6500))
  const live = await evalJs(`({ clock: document.querySelector('.ldw-bigclock').textContent, button: document.querySelector('.ldw-rec').textContent, up: (document.querySelector('.ldw-card[data-up]') || {}).textContent })`)
  console.log('while speaking:', JSON.stringify(live))
  await shot(process.env.NAME || 'extemp-speaking-dark')
  await evalJs(`document.querySelector('.ldw-rec-stop').click()`)
  await pause(2500)
  const after = await evalJs(`({ stats: (document.querySelector('.ldw-stats') || {}).textContent, prov: (document.querySelector('.ldw-prov') || {}).textContent })`)
  console.log('after stop:', JSON.stringify(after))
  console.log('page errors:', logs.length ? logs : 'none')
} finally {
  try { ws && ws.close() } catch (e) { /* closed */ }
  chrome.kill()
}

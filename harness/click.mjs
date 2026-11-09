// Open a harness URL in headless Chrome, click buttons by their visible text (in order), then screenshot.
//   node harness/click.mjs "<query>" out.png "Search" ["Read the full reason for decision" ...]
// Env: W, H (window size), PORT (harness server, default 8793).
import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const [query, out, ...labels] = process.argv.slice(2)
const W = Number(process.env.W || 1440), H = Number(process.env.H || 1200), DBG = 9334
const pause = ms => new Promise(r => setTimeout(r, ms))
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', `--remote-debugging-port=${DBG}`, '--hide-scrollbars', `--window-size=${W},${H}`,
  `--user-data-dir=${join(process.env.TMPDIR || '/tmp', 'ldw-click-chrome')}`, 'about:blank'], { stdio: 'ignore' })
try {
  let target
  for (let i = 0; i < 40 && !target; i++) {
    await pause(250)
    try { target = (await (await fetch(`http://127.0.0.1:${DBG}/json/list`)).json()).find(t => t.type === 'page') } catch (e) { /* starting */ }
  }
  const ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise(r => ws.addEventListener('open', r))
  let id = 0
  const waiting = new Map()
  ws.addEventListener('message', ev => { const m = JSON.parse(ev.data); if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id) } })
  const send = (method, params = {}) => new Promise(r => { const n = ++id; waiting.set(n, r); ws.send(JSON.stringify({ id: n, method, params })) })
  await send('Page.enable')
  await send('Network.enable')
  await send('Network.setCacheDisabled', { cacheDisabled: true }) // the profile folder persists; never test a stale bundle
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false })
  await send('Page.navigate', { url: `http://127.0.0.1:${process.env.PORT || 8793}/harness/?${query}` })
  await pause(3500)
  for (const label of labels) {
    if (label.startsWith('type:')) { // focus the last text box on the page and type into it
      await send('Runtime.evaluate', { expression: `(() => { const t = [...document.querySelectorAll('textarea')].pop(); t && t.focus() })()` })
      await send('Input.insertText', { text: label.slice(5) })
      await pause(300)
      continue
    }
    if (label.startsWith('eval:')) { // print the value of an expression (layout checks)
      const v = await send('Runtime.evaluate', { expression: label.slice(5), returnByValue: true })
      console.log(JSON.stringify(v.result.result.value))
      await pause(400) // let a click made by the expression render
      continue
    }
    const r = await send('Runtime.evaluate', { expression: `(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim().startsWith(${JSON.stringify(label)})); if (!b) return false; b.click(); return true })()`, returnByValue: true })
    if (!r.result.result.value) console.error(`no button: ${label}`)
    await pause(900)
  }
  const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  writeFileSync(out, Buffer.from(shot.result.data, 'base64'))
  console.log(out)
  ws.close()
} finally { chrome.kill() }

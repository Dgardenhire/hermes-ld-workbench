// First paint from the last answer. Hermes starts the plugin's backend when the page opens, and the first
// request waits for that start (and the gateway handshake, which can retry), so the page used to sit on
// "Opening the workbench" for 2 to 3 seconds. Now the page keeps the last answer to its three opening reads
// (config, state, home) in the plugin's own Hermes storage (ctx.storage), paints from it at once, and asks
// the backend in the background. While the page shows the kept copy it is inert (nothing can be pressed),
// and any request that changes something waits: if the fresh answer matches the kept copy, the waiting
// requests go out; if not, they are dropped, the page is rebuilt on the fresh answer and asks again.
//
// No imports on purpose: the tests run this file in plain Node (tests/js/firstpaint.test.mjs).
// Rules: never keep a secret (scrub), never keep much (MAX_ENTRY_CHARS each), never keep another Hermes
// profile's or connection's data (scope), never keep it long (MAX_AGE_MS), never across a plugin version.

export const CACHE_VERSION = '0.2.0' // the plugin's version (plugin.yaml); a test keeps them equal
export const NAMES = ['config', 'state', 'home']
export const MAX_ENTRY_CHARS = 200000 // per read, as JSON; a bigger answer is not kept (the next open waits)
export const MAX_AGE_MS = 30 * 86400000
const PREFIX = 'firstpaint.'
// Answers to these may change on every visit without meaning the page is out of date.
const VOLATILE = { home: ['pool_start'] }

// Keys and values that look like a credential are never kept. None of the three reads carries one today;
// this keeps it that way if one ever does.
const SECRET_KEY = /^(?:.*[_-])?(?:token|secret|password|passwd|passphrase|api[_-]?key|apikey|authorization|auth|credentials?|cookie|bearer|private[_-]?key|access[_-]?key)$/i
const SECRET_VALUE = /^(?:sk-[\w-]{8,}|sk_(?:live|test)_\w{8,}|ghp_\w{20,}|gho_\w{20,}|github_pat_\w{20,}|xox[abprs]-[\w-]{8,}|hf_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|AIza[\w-]{30,}|Bearer\s+\S{8,})/

export function scrub(value, depth = 0) {
  if (depth > 40) return null
  if (Array.isArray(value)) return value.map(v => scrub(v, depth + 1))
  if (value && typeof value === 'object') {
    const out = {}
    for (const [k, v] of Object.entries(value)) {
      if (SECRET_KEY.test(k)) continue
      out[k] = scrub(v, depth + 1)
    }
    return out
  }
  if (typeof value === 'string' && SECRET_VALUE.test(value.trim())) return ''
  return value
}

function comparable(name, data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return JSON.stringify(data)
  const skip = VOLATILE[name] || []
  return JSON.stringify(Object.fromEntries(Object.entries(data).filter(([k]) => !skip.includes(k))))
}
export const sameData = (name, a, b) => comparable(name, scrub(a)) === comparable(name, scrub(b))

export function readCache(storage, name, scope, now = Date.now()) {
  try {
    const e = storage && storage.get(PREFIX + name, null)
    if (!e || typeof e !== 'object' || e.v !== CACHE_VERSION || e.scope !== scope) return null
    if (typeof e.at !== 'number' || now - e.at > MAX_AGE_MS || e.at - now > 60000) return null
    if (!e.data || typeof e.data !== 'object') return null
    return e.data
  } catch (err) { return null }
}

// 'saved', 'too-big' (and any older copy removed) or 'error'.
export function writeCache(storage, name, data, scope, now = Date.now()) {
  try {
    if (!storage || !data || typeof data !== 'object') return 'error'
    const clean = scrub(data)
    if (JSON.stringify(clean).length > MAX_ENTRY_CHARS) { removeCache(storage, name); return 'too-big' }
    storage.set(PREFIX + name, { v: CACHE_VERSION, scope, at: now, data: clean })
    return 'saved'
  } catch (err) { return 'error' }
}
export function removeCache(storage, name) {
  try { if (storage && typeof storage.remove === 'function') storage.remove(PREFIX + name); else if (storage) storage.set(PREFIX + name, null) } catch (err) { /* nothing kept */ }
}
export function clearCache(storage) { for (const n of NAMES) removeCache(storage, n) }

// The page's side: which reads are showing a kept copy, and the gate the changing requests wait on.
//   const fp = firstPaint({ storage, scope })   scope: a string, or a function read at each read and write
//   fp.peek('home') -> the kept copy or null, without showing it
//   fp.hydrate('home') -> the kept copy or null (and the read is now "stale")
//   fp.fresh('home', data)   the backend answered: kept, compared, the read is no longer stale
//   fp.failed('home')        the backend did not answer: the kept copy must go from the page
//   fp.save('home', data)    the page's own copy changed (after a request): kept, unless stale or held
//   fp.forget()              a delete in Settings: every kept copy goes, and none is kept again until the
//                            backend answers that read afresh (so deleted words never come back from memory)
//   fp.gate() -> Promise<boolean>: true when the kept copies matched (send), false when not (drop)
//   fp.onSettle(fn)          fn({ changed }) once every stale read has its fresh answer
export function firstPaint({ storage, scope, now = () => Date.now() }) {
  const scopeNow = () => (typeof scope === 'function' ? scope() : scope)
  const shown = {}
  const stale = new Set()
  const held = new Set()
  const sticky = {}
  const lastSaved = {}
  let changed = false
  let showing = false // a kept copy is on the page (until settle)
  let waiting = []
  const listeners = new Set()
  const withSticky = (name, data) => (sticky[name] && data && typeof data === 'object' ? { ...data, ...sticky[name] } : data)
  function save(name, data) {
    if (held.has(name)) return 'held'
    const d = withSticky(name, data)
    const sc = scopeNow()
    let s
    try { s = sc + '\n' + JSON.stringify(d) } catch (e) { return 'error' }
    if (lastSaved[name] === s) return 'saved'
    const r = writeCache(storage, name, d, sc, now())
    lastSaved[name] = r === 'saved' ? s : undefined
    return r
  }
  function settle() {
    if (stale.size || !showing) return
    const ok = !changed
    const w = waiting
    waiting = []
    showing = false
    changed = false
    w.forEach(fn => fn(ok))
    listeners.forEach(fn => fn({ changed: !ok }))
  }
  return {
    hydrate(name) {
      const d = readCache(storage, name, scopeNow(), now())
      if (!d) return null
      shown[name] = d
      stale.add(name)
      showing = true
      return d
    },
    peek: name => readCache(storage, name, scopeNow(), now()),
    isStale: name => (name ? stale.has(name) : stale.size > 0),
    fresh(name, data) {
      held.delete(name)
      save(name, data)
      if (!stale.has(name)) return
      stale.delete(name)
      if (!sameData(name, shown[name], withSticky(name, data))) changed = true
      delete shown[name]
      settle()
    },
    failed(name) {
      if (!stale.has(name)) return
      stale.delete(name)
      delete shown[name]
      changed = true
      settle()
    },
    // A value this page knows is newer than any answer it may still get (the question rotation's next stop).
    stick(name, fields) {
      sticky[name] = { ...(sticky[name] || {}), ...fields }
      const e = readCache(storage, name, scopeNow(), now())
      if (e) save(name, e)
    },
    save: (name, data) => (stale.has(name) ? 'stale' : save(name, data)),
    forget() {
      clearCache(storage)
      for (const n of NAMES) { held.add(n); delete lastSaved[n] }
    },
    gate() { return stale.size ? new Promise(res => waiting.push(res)) : Promise.resolve(true) },
    onSettle(fn) { listeners.add(fn); return () => listeners.delete(fn) },
  }
}

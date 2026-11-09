// The take player's harness answers (Lane B). harness/shoot_player.sh writes player_gen.json next to this
// file: a take spoken by a synthetic adult voice (macOS "say", Samantha), one word at a time, so every word
// time is exact by construction; its 10 Hz levels measured like the recorder does; the stats and timeline
// made by the real backend (speech.measure, player.timeline); and the recording as WebM (Opus) base64.
// Craft-only: no person's voice and no model. The ballot is the harness ballot (fixtures02.js), whose
// three quoted lines are in this take's words.
//
// URL parameter player:
//   words     faster-whisper word times (the default when player is set)
//   textonly  Hermes's text-only transcript: times anchored to the pauses
//   gone      after Delete all recordings
//   failed    the transcript failed: the recording still plays, quote-click is off
// playerRest(path, options) answers what it knows and returns undefined for the rest.

const params = new URLSearchParams(location.search)
export const PLAYER_MODE = params.get('player')
let gen = null
async function load() {
  if (!gen) gen = await (await fetch(new URL('./player_gen.json', import.meta.url))).json()
  return gen
}
const clone = x => JSON.parse(JSON.stringify(x))

export async function playerTake() {
  const g = await load()
  const mode = PLAYER_MODE === '1' ? 'words' : PLAYER_MODE
  const t = clone(mode === 'textonly' ? g.textonly : g.words)
  if (mode === 'gone') { t.has_audio = false; t.file = undefined }
  if (mode === 'failed') {
    t.transcript = { status: 'failed', text: '', words: [], error: 'The transcript could not be made this time. Your timing and pauses are kept. Press Transcribe now to try again, or type what you said.' }
    t.timeline = { method: 'none', tokens: [], sentences: [] }
    delete t.stats.words; delete t.stats.wpm; delete t.stats.fillers; delete t.stats.answer_at
  }
  return t
}

export async function playerRest(path, options = {}, home) {
  if (!PLAYER_MODE) return undefined
  const g = await load()
  if (path === 'home') { const h = await home(); h.last_take = { drill: await playerTake() }; return h }
  if (/^speech\/[^/]+\/audio$/.test(path) && (!options.method || options.method === 'GET')) {
    if (PLAYER_MODE === 'gone') throw new Error('400: {"detail":"The recording for this take was not kept."}')
    return { b64: g.audio.b64, mime: g.audio.mime }
  }
  if (/^speech\/[^/]+\/judge$/.test(path)) {
    return clone(g.ballot)
  }
  if (/^speech\/[^/]+$/.test(path)) return playerTake()
  return undefined
}

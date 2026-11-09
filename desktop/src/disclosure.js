// What leaves your computer (Lane E owns this file after the frame's shell commit).
// DISCLOSURE: the rows that do not depend on Hermes's voice settings. DisclosureList({ transcripts }) adds the
// two that do (your voice, transcripts), first, so they never promise more than is true. Settings renders it first.

import { Fragment, jsx, jsxs } from 'react/jsx-runtime'

const cloudish = h => h.usable && h.local !== true
const sendsTo = h => h.local === false ? h.label : 'the speech-to-text set up in Hermes, which may be a service on the internet'

export function voiceLines(t) {
  const h = (t && t.hermes) || {}
  const kept = 'Recorded only while you speak and kept on the computer that runs Hermes.'
  if (cloudish(h) && t.own_ready) return [
    ['Your voice', `${kept} It never goes to a model or a website.`],
    ['Transcripts', "Made on this computer by the workbench's own speech model."]]
  if (cloudish(h)) return [
    ['Your voice', `${kept} A take goes to ${sendsTo(h)} only when you press Transcribe now on it. Every take asks first and says where it goes. It never goes to a model or a website otherwise.`],
    ['Transcripts', h.local === false
      ? `Made by ${h.label}, through Hermes, after you press. Change it in Hermes Settings, Voice; local keeps your voice on this computer.`
      : 'Made by the speech-to-text set up in Hermes Settings, Voice, after you press.']]
  return [
    ['Your voice', `${kept} It never goes to a model or a website.`],
    ['Transcripts', h.usable ? "Made on this computer by Hermes's own speech-to-text." : "Made on the computer that runs Hermes. The only download is the workbench's speech model, once, when you ask for it."]]
}

export const DISCLOSURE = [
  ['Your words', 'The words of your speeches go to the model you chose in Hermes, for the opponent, the judge and the coach. When you ask the coach, the headlines and notes in your extemp file go with them, so it can cite them.'],
  ['Headlines', 'A pull asks Google News, or the outlet’s own feed, for headlines on your topic. Only titles, dates and links come back.'],
  ['The coach’s example', 'After each 60-second answer is judged, the coach’s example is prepared in the background with the same model, so it is ready when you press Show me a strong answer. If you never open it, it is dropped. Turning Coach examples off in Settings stops it.'],
  ['Hear it', 'When you press it, the text being read, the opponent’s speech or the coach’s example, goes to the voice you set up in Hermes.'],
  ['Get up to speed', 'When you press it, your question goes to your Hermes web search, and up to 4 public pages are read.'],
  ['Web search', 'Only in a round you set to internet allowed, when you press Search. Your search words go to the web search you set up in Hermes.'],
  ['Saved links', 'When you save a link to your file or add one as a topic source, the page is read once to keep its text.'],
  ['Your Hermes chats', '/debate and the two debate tools read counts, tags, dates and question text only, never what you said or what a judge wrote. They write nothing.'],
]

export function DisclosureList({ transcripts }) {
  return jsx('dl', { className: 'ldw-leaves', children: voiceLines(transcripts).concat(DISCLOSURE).map(([k, v]) =>
    jsxs(Fragment, { children: [jsx('dt', { children: k }), jsx('dd', { children: v })] }, k)) })
}

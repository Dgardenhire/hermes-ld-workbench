// Plain words for debate terms: one sentence each, shown as a native title when a student hovers or focuses
// the label (no tooltip library). A new debater meets AC, CX or "criterion" on the first screen.

import { jsx } from 'react/jsx-runtime'

export const TERMS = {
  ac: 'AC: the Affirmative Constructive, the first speech, where the affirmative reads their case.',
  nc: 'NC: the Negative Constructive, where the negative reads their case and then attacks the affirmative case.',
  '1ar': '1AR: the First Affirmative Rebuttal, where the affirmative answers the negative and defends their own case.',
  nr: 'NR: the Negative Rebuttal, the negative side\'s last speech, where they sum up why they win.',
  '2ar': '2AR: the Second Affirmative Rebuttal, the last speech of the round, where the affirmative sums up why they win.',
  cx: 'CX: cross-examination, when one debater asks the other questions and the answers can be used later in the round.',
  card: 'A card is one piece of evidence: a short quote from a source, with who wrote it and when.',
  value: 'The value is the big goal your case says matters most in this resolution, such as justice or safety.',
  criterion: 'The criterion is the test the judge uses to decide which side does more to reach the value.',
  framework: 'The framework is your value and your criterion together: the rule you ask the judge to decide the round by.',
  flow: 'The flow is the notes a debater or judge takes on every argument, speech by speech, to see what was answered and what was dropped.',
  'circuit judge': 'A circuit judge has judged at big national tournaments and is fine with fast talking and technical arguments.',
  'saved sources': 'How many sources from your saved extemp file you named out loud; a source you named that is not in your file is not counted here.',
}

// The plain sentence for a label such as "AC 6:00", "CX2" or "Criterion"; '' when there is none.
export function termFor(label) {
  const t = String(label || '').trim().toLowerCase()
  if (TERMS[t]) return TERMS[t]
  const first = t.split(/\s+/)[0].replace(/^cx\d$/, 'cx')
  return TERMS[first] || ''
}

// A label with its plain meaning on hover and on keyboard focus.
export function Term({ term, children, className }) {
  const title = termFor(term || children)
  if (!title) return children
  return jsx('span', { className: className ? `ldw-term ${className}` : 'ldw-term', title, tabIndex: 0, children })
}

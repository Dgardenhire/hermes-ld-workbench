// The take player (Lane B owns this file after the frame's shell commit).
// Stub: today's last take stands in for the player, and a quoted line renders as it is.
// Contract: TakePlayer({ take, audioSrc?, startAt?, ...LastTake's props }), QuoteLine({ take, line, index, children }).

export { LastTake as TakePlayer } from './floor.js'
export const QuoteLine = ({ children }) => children

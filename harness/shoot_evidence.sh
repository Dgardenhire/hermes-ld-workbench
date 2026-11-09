#!/bin/sh
# Get up to speed (Lane C) shots, from the harness with harness/fixtures_evidence.js (craft-only: hand-written
# pages and coach answer through the real routes). Serve the repo first, with the bundle built from desktop/src:
#   /usr/bin/python3 -m http.server 8793 --bind 127.0.0.1 --directory .
# Needs the frame shell's mount (PrimerButton beside Start speaking, PrimerCards under the question) and its
# harness hook for fixtures_evidence.js. Shots go OUTSIDE the public repo: OUT=<folder> (required).
#   03-primer-progress  under 1 s after the press: a staged line, the seconds, no lone spinner
#   04-primer-cards     the coach's read and three fact cards with outlet, date or "no date", link, Save to my file
#   14-states-*         web search not set up; the model too slow (Retry); offline
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
: "${OUT:?set OUT to a folder outside the repo}"
mkdir -p "$OUT"
P="${PORT:-8793}"
WAIT="eval:0"
SCROLL="eval:document.querySelector('.ldw-primer') && document.querySelector('.ldw-primer').scrollIntoView({block:'start'})"
GO() { w="$1"; h="$2"; q="$3"; n="$4"; shift 4; PORT="$P" W="$w" H="$h" node "$ROOT/harness/click.mjs" "$q" "$OUT/$n.png" "Get up to speed" "$@"; }
for T in light dark; do
  for S in 1440x900 1280x800; do
    W=${S%x*}; H=${S#*x}
    GO "$W" "$H" "view=extemp&theme=$T&primer=progress" "03-primer-progress-$S-$T"
    GO "$W" "$H" "view=extemp&theme=$T&primer=done" "04-primer-cards-$S-$T" "$WAIT" "$WAIT" "$WAIT" "$WAIT" "$SCROLL"
  done
  GO 760 1000 "view=extemp&theme=$T&primer=done" "04-primer-cards-760-$T" "$WAIT" "$WAIT" "$WAIT" "$WAIT" "$SCROLL"
  GO 1024 720 "view=extemp&theme=$T&primer=done" "04-primer-cards-1024x720-$T" "$WAIT" "$WAIT" "$WAIT" "$WAIT" "$SCROLL"
done
for X in noweb late offline; do
  GO 1440 900 "view=extemp&primer=$X" "14-states-primer-$X-1440x900-dark" "$WAIT" "$WAIT" "$WAIT" "$WAIT" "$SCROLL"
done

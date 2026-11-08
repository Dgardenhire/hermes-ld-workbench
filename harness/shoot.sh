#!/bin/sh
# Screenshot the harness with headless Chrome. Serve the repo first:
#   /usr/bin/python3 -m http.server 8793 --bind 127.0.0.1 --directory .
# Needs network for React (esm.sh) and codicons (jsdelivr).
#   docs/shots/v02/    the 0.2 screens (the speaking state is the catalog image)
#   docs/shots/after/  0.1's screens, kept for comparison
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/docs/shots/v02"
mkdir -p "$OUT"
BASE="http://127.0.0.1:${PORT:-8793}/harness/"
shot() { "$CHROME" --headless=new --disable-gpu --hide-scrollbars --window-size="$3" --virtual-time-budget=9000 --screenshot="$OUT/$1.png" "$BASE?$2" 2>/dev/null; echo "$OUT/$1.png"; }
shot extemp-ready-dark "view=extemp" 1440,900
shot extemp-ready-light "view=extemp&theme=light" 1440,900
shot extemp-ready-red-accent "view=extemp&accent=red" 1440,900
shot extemp-ready-narrow-light "view=extemp&theme=light" 760,1000
shot extemp-ready-wide-dark "view=extemp" 1920,1080
shot ld-ballot-narrow-light "view=room&scene=ballot&theme=light" 760,1500
shot extemp-ballot-dark "view=extemp&x=ballot" 1440,1400
shot extemp-ballot-light "view=extemp&x=ballot&theme=light" 1440,1400
shot extemp-ballot-red-accent "view=extemp&x=ballot&accent=red" 1440,1400
shot extemp-ballot-green-accent "view=extemp&x=ballot&accent=green&theme=light" 1440,1400
shot extemp-judging-dark "view=extemp&x=take" 1440,1100
shot extemp-draw-dark "view=extemp&x=draw" 1440,1500
shot ld-speech-1024x720-light "view=room&scene=speech&theme=light" 1024,720
shot extemp-prep-light "view=extemp&x=prep&theme=light" 1440,1100
shot rhetoric-read-dark "view=rhetoric&stage=read" 1440,1300
shot rhetoric-figures-light "view=rhetoric&stage=figures&theme=light" 1440,2400
shot rhetoric-spot-dark "view=rhetoric&stage=spot" 1440,900
shot ballots-light "view=ballots&theme=light" 1440,1300
shot ld-speech-dark "view=room&scene=speech" 1440,1150
shot ld-speech-light "view=room&scene=speech&theme=light" 1440,1150
shot ld-cx-light "view=room&scene=cx&theme=light" 1440,1100
shot ld-ballot-dark "view=room&scene=ballot" 1440,1150
shot ld-ballot-light "view=room&scene=ballot&theme=light" 1440,1150
shot ld-setup-dark "view=room&scene=setup" 1440,1000
shot settings-dark "view=settings" 1440,1400
shot settings-light "view=settings&theme=light" 1440,1400
# Screens behind a click:
PORT="${PORT:-8793}" H=1300 node "$ROOT/harness/click.mjs" "view=extemp&x=prep&pm=internet" "$OUT/extemp-prep-web-dark.png" "Search" "Save as a source"
O1="In 1979 a gallon of milk cost a dollar ten. Tonight the question is whether the Fed should fight prices or protect jobs."
O2="Ask anyone at a grocery store what worries them. Prices. So should the Fed care more about prices or jobs? Prices, for now."
O3="Jobs matter. Prices matter too. Today I will talk about the Fed and whether it should care about prices or about jobs."
PORT="${PORT:-8793}" H=1300 node "$ROOT/harness/click.mjs" "view=extemp&theme=light" "$OUT/extemp-openings-light.png" "Openings" "Type instead" "type:$O1" "Use this" "Type instead" "type:$O2" "Use this" "Type instead" "type:$O3" "Use this" "Ask the coach"
PORT="${PORT:-8793}" H=1100 node "$ROOT/harness/click.mjs" "view=extemp&x=prep" "$OUT/extemp-prep-remove-dark.png" "Remove"
PORT="${PORT:-8793}" H=1100 node "$ROOT/harness/click.mjs" "view=extemp&x=prep&theme=light" "$OUT/extemp-prep-remove-light.png" "Remove"
PORT="${PORT:-8793}" H=1100 node "$ROOT/harness/click.mjs" "view=room&scene=opp" "$OUT/ld-opponent-listen-dark.png" "Hear it"
PORT="${PORT:-8793}" H=1500 node "$ROOT/harness/click.mjs" "view=room&scene=ballot&theme=light" "$OUT/ld-ballot-open-light.png" "Read the full reason for decision"
# 0.2.1, the persona fixes:
PORT="${PORT:-8793}" H=1600 node "$ROOT/harness/click.mjs" "view=extemp&x=draw" "$OUT/extemp-drawn-dark.png" "Draw three questions"
PORT="${PORT:-8793}" H=1000 node "$ROOT/harness/click.mjs" "view=extemp&theme=light" "$OUT/extemp-own-question-light.png" "Write your own"
PORT="${PORT:-8793}" H=1300 node "$ROOT/harness/click.mjs" "view=extemp&own=1" "$OUT/extemp-question-list-dark.png" "Question list" "eval:document.querySelector('.ldw-qbuilt').open = true"
PORT="${PORT:-8793}" H=1100 node "$ROOT/harness/click.mjs" "view=room&scene=setup" "$OUT/ld-setup-circuit-dark.png" "Circuit judge"
PORT="${PORT:-8793}" H=900 node "$ROOT/harness/click.mjs" "view=room&scene=opp&spotmiss=1" "$OUT/ld-spot-not-found-dark.png" "eval:document.querySelector('.ldw-inline-flag').scrollIntoView({block:'center'})"
PORT="${PORT:-8793}" H=900 node "$ROOT/harness/click.mjs" "view=room&scene=opp&theme=light" "$OUT/ld-spot-checked-light.png" "eval:document.querySelector('.ldw-helper').scrollIntoView()"
PORT="${PORT:-8793}" H=1500 node "$ROOT/harness/click.mjs" "view=ballots" "$OUT/ballots-open-dark.png" "eval:document.querySelectorAll('.ldw-brow-main')[3].click()" "eval:document.querySelector('.ldw-brow-sheet').scrollIntoView({block:'center'})"
PORT="${PORT:-8793}" H=1500 node "$ROOT/harness/click.mjs" "view=ballots&theme=light" "$OUT/ballots-print-light.png" "Print ballots"
# The live recorder, from Chrome's fake microphone. On a Mac, `say` makes a spoken answer with a 2.6 s pause
# in it (a machine voice, used only to drive the meter); elsewhere the fake mic is a steady tone.
WAV="${TMPDIR:-/tmp}/ldw-answer.wav"
if command -v say >/dev/null 2>&1; then
  say -o "$WAV" --data-format=LEI16@44100 "[[volm 0.22]] My answer is prices, for now. First, the law. Congress gave the Fed two goals, stable prices and maximum employment. [[slnc 2600]] Second, the jobs side is holding up. According to Reuters, Fed policymakers are weighing a rate hike after a strong jobs report."
  export SPEECH_WAV="$WAV" SPEAK_MS=17000
fi
cd "$ROOT" && HARNESS_PORT="${PORT:-8793}" node harness/live.mjs "$OUT" && HARNESS_PORT="${PORT:-8793}" THEME=light NAME=extemp-speaking-light node harness/live.mjs "$OUT"

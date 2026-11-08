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
shot extemp-ballot-dark "view=extemp&x=ballot" 1440,1400
shot extemp-ballot-light "view=extemp&x=ballot&theme=light" 1440,1400
shot extemp-ballot-red-accent "view=extemp&x=ballot&accent=red" 1440,1400
shot extemp-ballot-green-accent "view=extemp&x=ballot&accent=green&theme=light" 1440,1400
shot extemp-judging-dark "view=extemp&x=take" 1440,1100
shot extemp-draw-dark "view=extemp&x=draw" 1440,1500
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
H=1300 node "$ROOT/harness/click.mjs" "view=extemp&x=prep&pm=internet" "$OUT/extemp-prep-web-dark.png" "Search" "Save as a source"
H=1500 node "$ROOT/harness/click.mjs" "view=room&scene=ballot&theme=light" "$OUT/ld-ballot-open-light.png" "Read the full reason for decision"
# The live recorder, from Chrome's fake microphone (a steady tone):
cd "$ROOT" && node harness/live.mjs "$OUT" && THEME=light NAME=extemp-speaking-light node harness/live.mjs "$OUT"

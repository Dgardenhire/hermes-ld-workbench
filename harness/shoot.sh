#!/bin/sh
# Screenshot the harness with headless Chrome. Serve the repo first:
#   /usr/bin/python3 -m http.server 8793 --bind 127.0.0.1 --directory .
# Needs network for React (esm.sh) and codicons (jsdelivr).
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
OUT="$(cd "$(dirname "$0")/.." && pwd)/docs/shots"
BASE="http://127.0.0.1:${PORT:-8793}/harness/"
shot() { "$CHROME" --headless=new --disable-gpu --hide-scrollbars --window-size="$3" --virtual-time-budget=9000 --screenshot="$OUT/$1.png" "$BASE?$2" 2>/dev/null; echo "$OUT/$1.png"; }
shot room-speech-dark "view=room&scene=speech" 1440,900
shot room-speech-light "view=room&scene=speech&theme=light" 1440,900
shot room-ballot-dark "view=room&scene=ballot&drills=1" 1440,1500
shot room-ballot-light "view=room&scene=ballot&theme=light" 1440,1500
shot room-cx-dark "view=room&scene=cx" 1440,900
shot room-setup-light "view=room&scene=setup&theme=light" 1440,900
shot bench-dark "view=bench" 1440,1800
shot bench-light "view=bench&theme=light" 1440,1800
shot fallacies-dark "view=fallacies&fx=1" 1440,1900
shot fallacies-light "view=fallacies&fx=1&theme=light" 1440,1900
shot room-opponent-spot-dark "view=room&scene=opp" 1440,3600
shot print-light "view=print&theme=light" 1100,1400

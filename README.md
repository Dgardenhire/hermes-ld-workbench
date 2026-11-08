# Debate Workbench for Hermes

Practice speech and debate out loud, inside the Hermes desktop app: Lincoln-Douglas, extemp and rhetoric.

Every speech is recorded and timed with a real clock and the timekeeper's cards. A transcript, words a minute, pauses and fillers are worked out on your own computer. A judge's ballot follows every round, and every ballot is kept, so the things judges keep writing show up as patterns.

**New in 0.2 (in progress).** Extemp: a 60-second answer that opens ready to speak, and the full round: headlines on your topic from outlets on the left, the center and the right, side by side and labeled by lean; your extemp file; three questions drawn from your own news; 30 minutes of prep with an outline; a 7-minute speech; a ballot. Rhetoric: great public-domain speeches with their figures marked (every mark checked against the text), the figures by the effect they make, a spot-the-figure drill, your own line, said out loud. Ballots: every ballot, with patterns counted across rounds. Lincoln-Douglas speeches can now be spoken.

You write your own case. A coach reads it, finds the weak spot, and asks the question that makes it stronger. Then you debate a full practice round against an AI opponent, with real NSDA speech times, and a judge writes you a ballot with the lines that decided the round and three drills to practice.

It uses the AI model you already set up in Hermes. It never writes your case for you.

![A 60-second answer, while speaking](docs/shots/v02/extemp-speaking-dark.png)

## What you can do

**Tournament Room.** A full practice round in NSDA order: your constructive, cross-examination, the opponent's case, rebuttals, and the last speeches. Speech times are 6, 3, 7, 3, 4, 6 and 3 minutes, with 4 minutes of prep. A clock runs each speech and your prep. The opponent comes in three levels: Novice, JV and Varsity. You question the opponent, and the opponent questions you. A flow sheet fills in as you go. At the end, a judge you pick (a parent judge, a traditional coach, or a flow judge) writes the ballot. You can ask another judge to rule on the same round, or redo one of your speeches and have the same judge rule again.

**Case Workbench.** Your case in sections: resolution analysis, definitions, value, criterion, contentions, and blocks. A six-step writing path walks you from a blank page to a finished case. Every section has helpers that lay out your options and ask hard questions, and a coach panel you can talk to.

**Fallacies.** A guide to 15 common mistakes in reasoning, each with a plain definition, an example, and what to do about it in a round. A practice drill gives you a short argument; you pick the fallacy it commits (or "No fallacy"), see whether you were right and why, and keep a score for the session. You can also paste any argument and have it checked. In the Tournament Room, a "Spot fallacies" button sits under every speech the opponent gives.

**Topic briefing.** When you start on a new resolution, a briefing maps the topic for both sides: the background, the words that matter, what each side has to prove, the arguments you'll hear most, common values and criteria, what judges look for, and where to start reading. Facts it is not sure of are marked "check this". It is saved, so it opens instantly the next time.

**My cases.** Keep as many cases as you want. Each one has its own name, resolution, side, sections and coach notes. Make a new one, copy one, or delete one. Save any case as a Word document or a text file, or print it. Save a backup file of every case, and load it on another computer.

**Bring in your case.** Paste a case you already wrote, or upload it as a Word document or text file. The workbench sorts your words into the sections without changing a single word, then the coach reviews it.

## How to install it

You need the Hermes desktop app, version 0.22 or newer, with a model already set up. Debate Workbench uses that model.

1. In Hermes Desktop, click **Capabilities**, then **Plugins**, then **Install from Git**.
2. Paste `https://github.com/Dgardenhire/hermes-ld-workbench` and confirm. Keep both parts selected: the agent plugin and the desktop plugin.
3. In **Capabilities**, then **Plugins**, find **Debate Workbench** and switch it on.
4. Click **Debate** in the left sidebar.

Prefer the terminal? Run `hermes plugins install Dgardenhire/hermes-ld-workbench --enable`, then do steps 3 and 4.

To check that everything is in place, run `hermes plugins doctor ld-workbench`. It should say OK.

The full manual, with pictures: https://linchpin.studio/hermes/ld-workbench/manual/

## Where your work is saved

Your cases, coach notes, rounds, ballots and topic briefings are saved by Hermes on your own computer, in a folder named `plugin-data/ld-workbench` inside your Hermes folder. There are no accounts and no tracking.

## What leaves your computer

- **Your AI model.** When you use the coach, a helper, the briefing, a round, a ballot, the question draw or the figure finder, the text it needs (your case, your speeches, the resolution, your saved headlines) goes to the AI model you chose in Hermes, through Hermes. Debate Workbench has no keys of its own.
- **Your voice stays on your computer.** The microphone is open only between Start speaking and Stop (or Cancel, an error, or leaving the page). Recordings are saved only in `plugin-data/ld-workbench/recordings/` inside your Hermes folder: the newest 20, never more than 100 MB, with a button to delete them all. Transcripts are made on the Hermes backend with faster-whisper, when Hermes's local speech-to-text is installed. The first transcript downloads faster-whisper's speech model from huggingface.co (no audio is sent). If your Hermes app talks to Hermes on another computer, the recording goes to that computer to be transcribed.
- **Headlines, only when you press Pull headlines.** For your topic, a Google News search for each outlet on your list (`news.google.com`), and that outlet's own news feed if Google does not answer. Headlines, dates and links only; no article is downloaded. Https only, public addresses only, 8 seconds and 250 KB per outlet. Links open in your own browser.
- **A link you save or add as a topic source.** Debate Workbench opens that one public web page to read its text. It only opens public addresses, and it keeps the first 30,000 characters.

Nothing else is sent anywhere. Lean labels are from the AllSides Media Bias Ratings, checked Nov 7, 2026, and you can change any of them. Debate Workbench is not made or endorsed by Nous Research, the National Speech & Debate Association, AllSides or any news outlet.

## The coaching rule

The coach helps and pushes. It explains ideas, lays out choices, and points to where evidence lives. It does not write your case, and it never makes up quotes, numbers or sources. If you ask it to write your case, it says the words have to be yours and gives you the next step instead.

## For developers

- The method (every prompt, the round format, the judges) is in `ld_method.py`, copied from the web app at linchpin.studio/debate. Keep the two in sync.
- The backend is `dashboard/plugin_api.py`. All model calls go through Hermes's plugin model access (`PluginLlm`), so they use the user's own model and keys.
- The page is built from `desktop/src/plugin.js` with the shared Hermes UI kit: `node <path-to>/hermes-ui-kit/scripts/build.mjs .`
- Tests: `/usr/bin/python3 -m unittest discover -s tests`
- Screenshots: serve the folder (`/usr/bin/python3 -m http.server 8793 --directory .`) and run `harness/shoot.sh`. `harness/live.mjs` records from Chrome's fake microphone to check the recorder. `harness/make_fixtures.py` rebuilds the 0.2 fixtures from the plugin's own code.
- Status, risks and what is left: `docs/STATUS.md`.

License: MIT. By Damon Gardenhire.

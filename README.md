# Debate Workbench for Hermes

Practice speech and debate out loud, inside the Hermes desktop app: Lincoln-Douglas, extemp and rhetoric.

You speak; a real clock runs and the timekeeper holds up the cards. Your recording is kept on your computer, and timing and pauses are worked out there. The transcript, words a minute and fillers come from the speech-to-text you set up in Hermes. A judge's ballot follows every speech. Every ballot is kept, so the things judges keep writing show up as patterns you can drill.

It uses the AI model you already set up in Hermes. It never writes your speeches for you.

![A 60-second answer, while speaking](docs/shots/v02/extemp-speaking-dark.png)

## What you can do

**Speak, on the clock.** Every event shares one floor. A strip across the top shows the event drawn to scale in time: each part is as wide as its minutes. The big clock starts when you start talking. The time cards flip at each minute, at 30 seconds, and at Time. While you speak, your voice is drawn as it comes in, with a mark over every pause longer than 2 seconds. No microphone? Type your speech and the time is estimated at 140 words a minute, and it says so.

**Extemp.** It opens on a 60-second answer, ready to speak: one question, one minute, a ballot in under a minute. The question changes each visit, from 52 built in (United States and International), or write your own: a coach can add this week's questions and have the floor ask only those. Openings gives you 45 seconds, three times, to open the same question three different ways; the coach says which one is strongest and why, and never writes one for you. The full round works like a tournament. Pull this week's headlines on your topic from outlets on the left, the center and the right, side by side and labeled by lean. Save the ones you want to your extemp file. Draw three questions from your own saved news, pick one, and prep for 30 minutes with an outline: attention-getter, link, answer, three areas, conclusion, and sources from your file. Prep files only, or with the internet allowed, through your own Hermes web search. Then give a 7-minute speech and get an extemp ballot: did you answer the question, your analysis, your organization, how many sources you named and when they were from, delivery and time.

**Lincoln-Douglas.** Write your own case in the Case Workbench, with a coach that finds the weak spot and asks the question that makes it stronger. Then debate a full practice round in NSDA order against an AI opponent (Novice, JV or Varsity): 6, 3, 7, 3, 4, 6 and 3 minutes, with 4 minutes of prep. Speak your speeches or type them. The opponent questions you and you question the opponent, and a flow sheet fills in as you go. A judge you pick (parent judge, traditional coach, flow judge or circuit judge) writes the ballot. In your speeches after the opponent has spoken, the flow sits beside the clock.

**The ballot, read in ten seconds.** The decision, your points on the 20 to 30 scale, the three lines that decided it, and one drill stamped on the sheet. Every quoted line is checked against what was really said; a line that is not there is flagged. The full reason for decision is folded underneath. Ask another judge to rule on the same round, or redo one speech and have the same judge rule again.

**Rhetoric.** Six great public-domain speeches with their figures of speech marked, each mark checked against the text. The figures are grouped by the effect they make, with the same definitions as The Clearing. Paste any speech to have its figures found. Then spot the figure in a real line, write your own line using it (the coach critiques it but never writes it), and say it out loud. Further reading: Mark Forsyth, *The Elements of Eloquence*.

**Ballots.** Every ballot from every event. The patterns judges keep writing are counted in code from a fixed list ("You drop arguments in the 2AR: 4 of your last 6"), not guessed by the model. Pace, time, pauses and a late answer are measured from your recordings. Each ballot's drill can be checked off. Open any ballot to read it in full; print them all, or save them as one text file to send your coach.

**More for Lincoln-Douglas.** A topic briefing for each new resolution. Fallacies: 15 common mistakes in reasoning, a practice drill, and a checker for any argument, plus "Spot fallacies" under every speech the opponent gives. Keep as many cases as you want; bring one in from a Word document or text file without a word changed; save, print or back up.

**Settings.** See which speech-to-text makes your transcripts (and, when the workbench uses its own, pick the model and see whether it is already on your computer), delete your recordings, or delete your transcripts and ballots, edit your news outlets and their lean labels, and read exactly what leaves your computer.

## How to install it

You need the Hermes desktop app, version 0.22 or newer, with a model already set up. Debate Workbench uses that model.

1. In Hermes Desktop, click **Capabilities**, then **Plugins**, then **Install from Git**.
2. Paste `https://github.com/Dgardenhire/hermes-ld-workbench` and confirm. Keep both parts selected: the agent plugin and the desktop plugin.
3. In **Capabilities**, then **Plugins**, find **Debate Workbench** and switch it on.
4. Click **Debate** in the left sidebar.

Prefer the terminal? Run `hermes plugins install Dgardenhire/hermes-ld-workbench --enable`, then do steps 3 and 4.

To check that everything is in place, run `hermes plugins doctor ld-workbench`. It should say OK.

The manual is in [docs/MANUAL.md](docs/MANUAL.md), including what to do when something goes wrong. What changed in 0.2: [CHANGELOG.md](CHANGELOG.md).

## Where your work is saved

Your cases, coach notes, rounds, ballots, topic briefings, recordings, transcripts and extemp file are saved by Hermes on your own computer, in a folder named `plugin-data/ld-workbench` inside your Hermes folder. There are no accounts and no tracking.

## What leaves your computer

- **Your AI model.** When you use the coach, a helper, the briefing, a round, a ballot, the question draw or the figure finder, the text it needs (your case, your speeches, the resolution, your saved headlines) goes to the AI model you chose in Hermes, through Hermes. Debate Workbench has no keys of its own.
- **Your voice is kept on your computer.** The microphone is open only between Start speaking and Stop (or Cancel, an error, or leaving the page). Recordings are saved only in `plugin-data/ld-workbench/recordings/` inside your Hermes folder: the newest 20, never more than 100 MB, with a button to delete them all. If your Hermes app talks to Hermes on another computer, the recording goes to that computer.
- **Transcripts follow your Hermes voice settings.** Each recording is transcribed by Hermes's own speech-to-text, the one Hermes's voice input uses (Hermes Settings, Voice). **If that is a cloud service (OpenAI, Groq, Mistral, xAI, ElevenLabs or DeepInfra), the recording goes to that service to be transcribed, under its privacy terms.** If it is local, the recording stays on the computer. Settings and every take say which one made the transcript. When Hermes cannot make it without first downloading a model of its own, or its speech-to-text is off or fails, the workbench uses its own faster-whisper on the computer instead, with its speech model in `plugin-data/ld-workbench/models/`, never in the shared Hugging Face cache. That model is downloaded from huggingface.co (about 145 MB, once, no audio is sent) only when you press Transcribe now after the take tells you its size; a new recording never starts a download on its own. The download runs as one short separate Python process with fixed arguments and its own Hugging Face settings, so your Hugging Face cache, settings and token are never used.
- **Headlines, only when you press Pull headlines.** For your topic, a Google News search for each outlet on your list (`news.google.com`), and that outlet's own news feed if Google does not answer. Headlines, dates and links only; no article is downloaded. Https only, public addresses only, 8 seconds and 250 KB per outlet. Links open in your own browser.
- **A web search, only in an extemp round you start with the internet allowed.** The words you search for go to the web search you set up in Hermes. Titles, links and short snippets come back. Debate Workbench has no search key or scraper of its own.
- **Hear it, only when you press it.** The opponent's speech (written by the AI, not by you) goes to the voice you set up in Hermes to be read aloud. The audio is kept in `plugin-data/ld-workbench/voice/`, newest 8 only.
- **A link you save or add as a topic source.** Debate Workbench opens that one public web page to read its text. It only opens public addresses, and it keeps the first 30,000 characters.

Nothing else is sent anywhere. Lean labels are from the AllSides Media Bias Ratings, checked Nov 7, 2026, and you can change any of them. Debate Workbench is not made or endorsed by Nous Research, the National Speech & Debate Association, AllSides or any news outlet.

## Students and minors

Debate Workbench is built for students, many of them under 18. It has no accounts, asks for no name, age, school or email, and keeps no tracking. A student's voice stays on the computer that runs Hermes, unless the speech-to-text set up in Hermes is a cloud service: then each recording goes to that service to be transcribed (Settings names it). An adult who wants the voice to stay put chooses local speech-to-text in Hermes Settings, Voice. The other things that leave are the ones listed above, each started by a button: the student's words (their case, their speeches and transcripts, their typed questions) go to the AI model chosen in Hermes; a headline topic goes to Google News; a search typed in an internet-allowed prep goes to the web search set up in Hermes; a link the student saves is opened once. Each of those requests also carries the computer's internet address, as any web request does. Whoever sets up Hermes for a student chooses that model, that search and that voice, and their privacy terms apply.

Settings has two deletes, each with a confirm. Delete all recordings removes every audio file at once. Delete transcripts and ballots removes every transcript, the words kept with each take, every ballot, and any round in progress; recordings, timing, cases and the extemp file stay. Deleting `plugin-data/ld-workbench` (or uninstalling the plugin and removing its data) erases everything Debate Workbench kept.

## Disclosures

- **Microphone.** Hermes may ask once for microphone permission. The microphone is open only while you are speaking a take, never in the background.
- **Recordings of students.** Recordings stay on the computer that runs Hermes; with a cloud speech-to-text set in Hermes, each one is also sent to that service to be transcribed. If a minor uses it, a parent or coach can delete every recording, and every transcript and ballot, in Settings at any time.
- **The opponent, the judge and the coach are an AI model,** the one you chose in Hermes. Their ballots are practice ballots, not the ruling of a real judge. Patterns across ballots are counted in code from a fixed list; quoted lines are checked against what was said and flagged when they are not there.
- **Transcripts are optional.** Debate Workbench installs nothing. It uses Hermes's own speech-to-text, and faster-whisper only when Hermes's local speech-to-text has already installed it. Without either, takes keep real timing and pauses.
- **One private Hermes import.** To use Hermes's own speech-to-text, the backend imports `tools.voice_mode.transcribe_recording`, the function behind Hermes's core `/api/audio/transcribe` route. It is not in Hermes's public plugin API (`hermes_cli/data/plugin_api.json`), so `hermes plugins validate` lists it as a warning. The reason: a desktop page cannot call the core route (plugin pages reach only `/api/plugins/<id>/`), and there is no public transcription call for plugins yet. The import is guarded; if a Hermes release moves the function, transcripts fall back to the workbench's own faster-whisper instead of breaking, and timing-only mode always works. It reads the profile's `stt` settings through the public `hermes_cli.config`.
- **News.** Headlines and links only, from Google News RSS and the outlets' own feeds. Lean labels are from the AllSides Media Bias Ratings, checked Nov 7, 2026, and every label can be changed. Inclusion of an outlet is not an endorsement.
- **Speeches and definitions.** The six speeches in Rhetoric are public domain (texts from Wikisource). The figure definitions are shared with The Clearing, another plugin by the same author. Further reading: Mark Forsyth, *The Elements of Eloquence* (Icon Books, 2013).
- **Not affiliated.** Debate Workbench is an independent community plugin. It is not made or endorsed by Nous Research, the National Speech & Debate Association, AllSides or any news outlet.
- **Nothing runs on its own.** No background jobs, no telemetry, no shell commands, no self-updates. Every network call starts with a button you press, except that a finished take is transcribed by the speech-to-text set up in Hermes, which may be a cloud service. Two helper programs may run, each with fixed arguments: ffmpeg (only when PyAV is missing) to turn a take into the WAV Hermes's speech-to-text expects, and one Python process for the speech-model download you ask for.

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

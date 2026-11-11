# DRAFT, not submitted

Title: `plugin-catalog: bump ld-workbench to 0.2.0 (Debate Workbench)`

Replace `NEWSHA` with the commit to pin (the merge commit of v0.2) before opening, and replace `SHA_PLACEHOLDER` in the entry file the same way. Old pin: `e502204bcf5e975878d1a35bfdc2f939724cf2ca` (0.1.0).

---

## What this changes

SHA bump for `ld-workbench` (Debate Workbench), 0.1.0 to 0.2.0, submitted by the repository owner (rule 5). The entry is already in the catalog; only the pin and the cosmetic fields change. Commit range to review: `e502204bcf5e975878d1a35bfdc2f939724cf2ca...NEWSHA` on https://github.com/Dgardenhire/hermes-ld-workbench. The README at the pinned commit is what the plugin page renders.

0.1 was a Lincoln-Douglas case workbench and practice round. 0.2 keeps all of it and adds two more events and a microphone. In plain words:

- **Speaking on a real clock.** One floor for every event: the event drawn to scale in time, a big clock that starts at the first sound, the timekeeper's cards, and your voice drawn as it comes in with a mark over every pause longer than 2 seconds. The microphone is the page's own recorder (`MediaRecorder`). No microphone: type, and the time is estimated at 140 words a minute.
- **Transcripts.** Each take goes first to Hermes's own speech-to-text, so it follows the user's Hermes voice settings. If that provider is a cloud service, nothing is sent until the student presses Transcribe now on that take. If Hermes cannot make a transcript without downloading a model of its own, the plugin uses faster-whisper with a model in its own data folder. With neither, a take keeps its real timing and pauses. Hermes's speech-to-text returns text without word times, so exact playback of a quoted line and the answer-before-0:10 measure work only with the plugin's own model; the README and manual say so.
- **Extemp.** A 60-second answer, three-openings practice, and a full round: this week's headlines on the student's topic from twelve outlets (five left or lean left, two center, five right or lean right by AllSides label; every outlet and label editable), a draw of three questions from the student's own saved news, 30 minutes of prep, a 7-minute speech and a ballot. **Get up to speed** finds three facts on the question, each an exact sentence from a public page chosen by number, never retyped by the model.
- **The coach.** You try first. After that, the coach can show a strong answer, a strong opening, three versions of a line, a redo of the weakest moment on a ballot, and short case drafts (contentions, value and criterion, a block, a stronger card tag). Everything it writes is labeled as the coach's. Code checks every citation, quoted run of four or more words, figure and date against the student's own file and words, and marks what it cannot find. Case drafts enter a case only when the student presses Add, marked to rewrite. **Try it again** measures a second take against the first on four fixed moves, in code. Settings has a switch that turns all examples off for a room where students write every word. A coach chat opens beside every page.
- **Rhetoric.** Six public-domain speeches with figures of speech marked, and for each mark a name, a definition and why it works in that line, written once ahead of time with every quote tested against the speech. Spot, write and say drills; the coach critiques a student's line and can show three versions.
- **Ballots.** Every ballot kept; patterns counted in code from a fixed tag list over the last six rounds; pace, time and pauses measured from the recordings. A first-open Sample ballot is read aloud by a sample voice.

- **Start here.** The first open shows a panel naming the four rooms in one line each, with a button into each, and says once that the judge and coach are an AI on the model chosen in Hermes. Closed, it stays closed; a Start here link beside Coach reopens it.

### Fixed before submitting (Nov 10 to 11, 2026)

- **Filed sources named.** A live run showed "Sources named 0" for an answer that named the Congressional Budget Office aloud. The count covers only sources in the student's extemp file, so the ballot now says Filed sources named, and the judge is told that a source named aloud but not in the file still counts.
- **Case before Round.** Lincoln-Douglas opens on Case, then Round, then Fallacies: you build the case first.
- **Opens at once.** After the first open, the page shows what it showed last time while Hermes starts the backend, then swaps in the saved work. Nothing can be pressed until then.
- **Start here** (above).
- **Accessibility and polish.** On the dark-theme paper ballot every line takes the paper's ink (one line measured 1.08:1); links clear 4.5:1 in both themes; the speech clock tells a screen reader One minute left, 30 seconds left and Time; drill checkboxes are 24 px; the pattern chips on Ballots open their ballot; a typed answer's button says Judge my answer; the coach no longer opens by itself over a narrow page; and Start or stop speaking can be given a key in Keyboard settings.

Full list: `CHANGELOG.md`. Manual: https://linchpin.studio/hermes/ld-workbench/manual/.

## Entry changes

- `sha`: `e502204bcf5e975878d1a35bfdc2f939724cf2ca` to `NEWSHA`
- `version`: "0.2.0" (matches `plugin.yaml`)
- `description`: rewritten for 0.2 in short plain words, with a `Disclosure:` sentence (the full disclosure is below)
- `known_issues`: added (tested on macOS only; the judge is an AI; no word times from Hermes speech-to-text; the private transcription import; the kept first-paint copy; the speaking keybind has no default key)
- `image`: `docs/catalog/card.jpg` (1200x600)
- `screenshots`: six screens of the 0.2 interface, in `docs/shots/catalog/`
- `docs_url`: https://linchpin.studio/hermes/ld-workbench/manual/
- `capabilities.provides_tools`: now `debate_record` and `debate_today`. The 0.1 entry listed none; `plugin.yaml` has listed these two tools at 0.2.
- `requires_hermes`: `">=0.21.6"`, the verified minimum, same floor in `plugin.yaml`
- `category`: unchanged, `desktop`

## Validator warning

`hermes plugins validate` lists one warning: a private core import, `tools.voice_mode.transcribe_recording`, at `speech.py:630`. It is guarded by a `try`/`except` and falls back to the plugin's own faster-whisper, and timing-only mode works without it.

Why it is there: it is the only way a plugin can use the user's configured speech-to-text. A desktop page cannot call the core `/api/audio/transcribe` route (`ctx.rest` is scoped to `/api/plugins/<id>/`), and `agent.transcription_provider` registers a provider but does not call one. The profile's `stt` settings are read through the public `hermes_cli.config`. A public plugin transcription call would let this import go; we would propose one in a separate issue.

## Disclosure (rule 13)

- **Microphone.** Opened with `getUserMedia` only while the student presses Start speaking; stopped on finish, cancel, error or leaving the page.
- **Recordings.** Saved only in `$HERMES_HOME/plugin-data/ld-workbench/recordings/`; newest 20 and at most 100 MB kept; delete-all in Settings. A second Settings button deletes every transcript and ballot (and a round in progress), with a confirm. With a remote Hermes backend, the recording goes to that backend.
- **Transcription, Hermes's own speech-to-text.** One worker thread in the Hermes backend converts the take to 16 kHz mono WAV (PyAV, or ffmpeg with fixed arguments when PyAV is missing) and calls `tools.voice_mode.transcribe_recording`, the private import above. **If the user's provider is a cloud service (OpenAI, Groq, Mistral, xAI, ElevenLabs or DeepInfra), or Hermes would choose one at run time, a take goes to it only when the student presses Transcribe now on that take, after the take names the provider.** Never on its own; every take asks again. When the plugin's own faster-whisper can run with no download, it makes the transcript locally and nothing is sent. The plugin calls Hermes's function only when Hermes would not first download a model.
- **Transcription, the plugin's own faster-whisper**, when Hermes's local speech-to-text installed it or Hermes cannot transcribe. Its model lives in `$HERMES_HOME/plugin-data/ld-workbench/models/`, never in the shared Hugging Face cache (which is only read). The model (about 145 MB for base.en) is downloaded from huggingface.co only when the student presses Transcribe now after seeing the size; no audio is sent. The download runs in one separate Python process (`sys.executable -I -c <fixed script> <repo> <folder>`, no shell) with its own Hugging Face home and `token=False`, so the user's Hugging Face settings and token are never used. A new recording never starts a download.
- **Network calls of the plugin's own, each started by a button press:**
  1. Pull headlines: a Google News RSS search per outlet on the student's list, then that outlet's own RSS feed if Google does not answer. Https only, listed hosts only, public addresses only, 8-second timeout and 250 KB cap per outlet, 20 seconds for the whole pull. Headlines, dates and links only; no article is downloaded.
  2. Get up to speed: the question goes to the user's own Hermes `web_search` tool. The plugin then opens up to 4 of the returned public pages through its checked reader (public addresses only, every redirect re-checked, 12 seconds per page; Google News redirect links are never opened) and sends 40 numbered sentences from them to the user's model, which returns sentence numbers. Code writes the facts; the model does not.
  3. A link saved to the extemp file or added as a topic source: one public page (http or https), every redirect re-checked, 20-second timeout, first 30,000 characters kept.
- **Hermes tools, each only on a button press, through the public `tools.registry`:** `web_search` (Get up to speed, and extemp prep in a round started with the internet allowed) and `text_to_speech` (Hear it: the opponent's speech or the coach's example). The plugin holds no keys.
- **Model calls.** Through `PluginLlm` to the user's own model, 180-second limit each. One call starts without a button press: with Coach examples on, after a 60-second answer is judged, the coach's example is written in the background from the student's words and extemp file, so it is ready if opened. If it is never opened, it is dropped. Turning Coach examples off stops it. Recordings are never sent to a model.
- **Never.** Credentials, telemetry, shell commands, cron or blueprints, background jobs, self-updates, compiled binaries. Separate processes only as listed above (the model download; ffmpeg when PyAV is missing).
- **Registers.** A Desktop page, a dashboard API, the `/debate` command, two read-only agent tools (`debate_record`, `debate_today`: counts, tags, dates and question text only; both refuse in cron runs), three model rows (Debate judge, Debate opponent, Debate coach, 180-second timeout) and the bundled `debate-coach` skill. No hooks or middleware.
- **Files.** Reads a .docx, .txt or backup file only when the user picks one. Writes an export only to a save-dialog path (never a hidden folder or `~/Library`, except cloud-drive folders there) or to its own exports folder.
- **Students.** Built for students, many under 18: no accounts, no name, age, school or email, no tracking. What can leave the computer is listed in the README under "What leaves your computer" and "Students and minors".
- **Sample voice.** The first-open sample is read by a voice from the ElevenLabs Voice Library, generated for this plugin and credited in the README; it is not covered by the MIT license.
- **Not affiliated** with Nous Research, the National Speech & Debate Association, AllSides or any news outlet.

## Checks run

- `/usr/bin/python3 -m unittest discover -s tests` on Nov 11, 2026, after the fixes below: 494 tests, OK. This includes `build.mjs --check`, so the committed desktop bundle matches its source.

## Screenshots

In `docs/shots/catalog/`:

| | |
|---|---|
| First open: a 60-second question and the Sample ballot | `first-open-sample.jpg` |
| Get up to speed: the coach's read and three facts | `get-up-to-speed.jpg` |
| Take 2 against Take 1, and the ballot | `take-2-and-ballot.jpg` |
| A Lincoln-Douglas round at the 1AR | `ld-round.jpg` |
| Rhetoric: a figure taught in its own line | `rhetoric-lesson.jpg` |
| Ballots and patterns | `ballots-patterns.jpg` |

# Live test in Hermes, Tuesday

Debate Workbench 0.2, branch `v0.2`, in Damon's Hermes Desktop 0.23 on macOS. Ordered by risk: the checks most likely to fail, and most costly if they do, come first. Stop at the first failure in sections 1 to 3 and send the message text and a screenshot back; everything after section 3 can be noted and carried on.

Mark each line **Pass**, **Fail** (with the exact message on screen) or **Skip**.

## 0. Before installing (5 minutes)

- [ ] Back up the plugin's data: copy `~/.hermes/plugin-data/ld-workbench` to the Desktop as `ld-workbench-backup-<date>`. If it does not exist yet, note that.
- [ ] Note the Hermes version (Settings, About). Expect 0.23.x.
- [ ] Install from the local branch the way you planned (Capabilities, Plugins, Install from Git with the repo and branch `v0.2`, or your local path). Keep both parts selected: the agent plugin and the desktop plugin. Switch it on.
- [ ] Optional, for filming only: in a separate Hermes profile, seed practice ballots with `/usr/bin/python3 harness/seed_demo.py <that profile's plugin-data/ld-workbench>`. It refuses a folder that already has ballots.

## 1. It opens (highest risk: nothing else matters if this fails)

- [ ] Click **Debate** in the sidebar. **Pass:** the Extemp floor opens with a 60-second answer loaded: the strip "Answer 1:00 | Ballot", the question in serif, the 1:00 clock, the cards 1, 30, TIME, and **Start speaking**.
- [ ] Rail: Lincoln-Douglas, Extemp, Rhetoric, Ballots at the top, Settings at the foot.
- [ ] Settings, Transcripts: names the route. Expected on Damon's Mac (Hermes `stt.local.model: small`, not on the Mac because `~/.cache/huggingface` points to the Studio Models drive): "Made on this computer with faster-whisper", with the line that Hermes's own speech-to-text would first download its small model. Write down exactly what it says: ______ . (With a cloud provider in Hermes Settings, Voice, it would say "Made by <provider>... A recording goes there only when you press Transcribe now on that take".)

## 2. The microphone (P2, never tested inside Hermes)

- [ ] **First take.** Press **Start speaking**. **Pass:** macOS asks once whether Hermes may use the microphone; after Allow, the clock waits ("The clock starts when you do") and starts at your first word; the waveform draws as you speak; the 1 card is up.
- [ ] Stay quiet for 3 seconds mid-take. **Pass:** "Pausing" shows, then a shaded mark covers that stretch.
- [ ] Press **Stop** before 1:00. **Pass:** the take shows time spoken, pauses, and either "Making the transcript" or a line saying what the transcript needs ("Timing only").
- [ ] **Denied.** System Settings, Privacy & Security, Microphone: turn Hermes off. Press **Start speaking**. **Pass:** "Hermes is not allowed to use the microphone..." with the steps. Turn it back on; press again; it records. (Hermes may need a restart for macOS to apply the change; note whether it did.)
- [ ] **Wake word.** If Hermes's wake word is on, press **Start speaking**. **Pass:** either it records, or "The microphone is busy..." shows. Note which.
- [ ] **Cancel.** Start a take, press **Cancel this take**. **Pass:** the floor returns to ready; the macOS mic indicator turns off.
- [ ] **Leave mid-take.** Start a take, click Ballots in the rail. **Pass:** the mic indicator turns off.

## 3. Transcripts and the long model call (P3; timings never measured)

- [ ] **Transcription follows Hermes's voice settings.** Before the first take, open Hermes Settings, Voice and note the speech-to-text provider and local model: ______ . If you can, switch it once to a cloud provider you already have a key for, record a 60-second take, and check: **Pass:** the take first says "Not sent yet" and names the provider, and nothing is sent; after Transcribe now, words appear with no download; the take's corner says "Transcript by <provider>, through Hermes"; Settings, What leaves your computer, says the recording goes to that provider. Switch it back (local) afterward. If the local model Hermes names is already downloaded, a take with local should say "Transcript, on this computer" with no Transcribe now press. Skip if no cloud key is set up.
- [ ] **Fallback path: the workbench's own model.** With Hermes on local and its model not on the Mac (Damon's case), the take says the base.en speech model (about 145 MB) is not on this computer and nothing downloads. Check the Studio Models drive is NOT mounted for this step. Press Transcribe now. Time it from the press to words on screen: ______ . **Pass:** words appear and the ballot follows; Settings now says base.en is on this computer; the model is in `~/.hermes/plugin-data/ld-workbench/models/base.en/` (check in Finder), and nothing was written to `~/.cache/huggingface`. If it says the folder is not writable or the download failed, note the exact message (timing and pauses must still show).
- [ ] **Second 60-second take.** Time from Stop to words: ______ (expect seconds, not minutes).
- [ ] **The extemp ballot.** **Pass:** decision boxes, points circled, three quoted lines from what you said (none flagged "Not found" unless you really did not say it), one DRILL.
- [ ] **One long model call.** Lincoln-Douglas, Tournament Room: start a Varsity round with any case, give the AC (type or paste is fine). The opponent writes the NC (about 1,000 words). Time it: ______ . **Pass:** the NC arrives. If it takes over 3 minutes: "The model took too long to answer..." shows with a way to try again (that is the designed path; note the model you use).
- [ ] **7-minute transcript** (optional if time is short): give a full extemp speech or a 1AR spoken. Time from Stop to words: ______ .
- [ ] **Delete transcripts and ballots.** At the end of the test day only (it erases the day's ballots; back up first, step 0): Settings, **Delete transcripts and ballots**, confirm. **Pass:** the counts drop to 0, recordings stay, Ballots is empty, a take's corner offers Transcribe now again.
- [ ] **Restart mid-transcript.** Stop a take, quit Hermes while "Making the transcript" shows, reopen Debate. **Pass:** the take says the transcript was interrupted and offers **Transcribe now**; pressing it works.

## 4. Hermes tools from the dashboard (registry path never run inside Hermes)

- [ ] **Web search.** Extemp, Full round, draw with **Prep: internet allowed**. In prep, **Search the web** for a few words. **Pass:** titles, sites and snippets come back; **Save as a source** adds one to the file. If web search is off in Hermes: "Web search is not set up in your Hermes..." (also a pass; then turn it on and retry).
- [ ] **Files-only round** refuses search. **Pass:** no search box, or "This round is files only."
- [ ] **Hear it.** In a Lincoln-Douglas round, on the opponent's speech, press **Hear it**. **Pass:** it plays with your Hermes voice; Pause and 1.25x work. If no voice is set up: "Hermes has no voice output set up..." (a pass).

## 5. Headlines from inside Hermes (P5 passed only from the terminal)

- [ ] Extemp, Full round: type `the Federal Reserve`, press **Pull headlines**. Time to full columns: ______ . **Pass:** twelve outlets fill three columns (on Nov 7 all twelve answered through Google News in about 2 s from this Mac), each with its lean label; any outlet that fails says so in its own column.
- [ ] Click one headline. **Pass:** it opens in your browser. If not: "Hermes could not open your browser. Copy the link instead" with the link shown.
- [ ] Turn Wi-Fi off, pull again. **Pass:** the last pull shows with a notice, or "No outlet answered..." Turn Wi-Fi back on.
- [ ] **Save to file** two headlines, then **Draw three questions**. **Pass:** three questions; pick one; prep starts at 30:00.

## 6. The rest of the floor (built and tested in the harness; confirm once)

- [ ] **Openings:** three 45-second takes (type is fine), **Ask the coach**. **Pass:** a pick and a fix per opening; no opening written for you.
- [ ] **Lincoln-Douglas ballot:** finish a short round (Novice; type short speeches). **Pass:** YOU WON or YOU LOST, points, three lines each tagged with its speech, a drill; **Read the full reason for decision** opens.
- [ ] **Rhetoric:** open Lincoln's Second Inaugural (marks show, counts click on and off); **Paste your own** with any paragraph (marks are exact quotes); **Spot**; **Write** and **Ask the coach** (a critique, no rewrite); **Say it** (0:30 clock).
- [ ] **Ballots:** the list shows every ballot from today; tick a drill, leave Ballots, come back: it stays ticked.
- [ ] **Settings:** change an outlet's label, **Save outlets**, pull again: the new label shows. **Back to the defaults** restores. **Delete all recordings** asks first, then deletes; ballots stay.
- [ ] **Case Workbench:** Save as Word into Documents (works); the old 0.1 cases are all there.

## 7. Look (polish judges will see)

- [ ] Light and dark (Hermes Settings, Appearance): the ballot paper is white in light, a lit page in dark; no gray body text.
- [ ] Accent red, then green (if Hermes offers an accent choice): the judge's pen follows the accent; DRILL stays red and is still readable as a stamp.
- [ ] Narrow the window until the plugin pane is under 900 px: the rail becomes one row of names, nothing is cut off, the floor stacks.
- [ ] Widen to full screen: the floor stops at a comfortable width; nothing stretches across the whole screen.

## 8. After the test

- [ ] Note every Fail with its exact message in `docs/STATUS.md` (or send them back).
- [ ] If the demo profile was seeded, keep it for filming; do not seed your everyday profile.
- [ ] Fill the "Tested live" line in `docs/catalog/PR-DESCRIPTION.md`.

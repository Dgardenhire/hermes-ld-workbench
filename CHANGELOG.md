# Changelog

## 0.2.0 (November 2026)

Debate Workbench now covers three events and listens to you speak.

### New

- **Speaking, on a real clock.** One floor for every event: the event drawn to scale in time across the top, a big clock, and the timekeeper's cards (one card a minute, then 30, then TIME). The clock starts at your first word. Your voice is drawn as it comes in, with a mark over every pause longer than 2 seconds. No microphone? Type, and the time is estimated at 140 words a minute, labeled as estimated.
- **Takes and transcripts.** Recordings stay on the computer that runs Hermes (newest 20, at most 100 MB, delete-all in Settings). When Hermes's local speech-to-text (faster-whisper) is installed, each take gets a transcript, words a minute, fillers and time to your answer. Without it, every take still gets real timing and pauses.
- **Extemp.** A 60-second answer that opens ready to speak. Openings: three 45-second openings for one question, and the coach picks the strongest without writing one. The full round: pull this week's headlines on your topic from outlets on the left, center and right, side by side and labeled by lean (you can edit the list and every label); save them to your extemp file; draw three questions from your own news; 30 minutes of prep with an outline and your sources; a 7-minute speech; an extemp ballot. Prep can be files only or internet allowed, through your own Hermes web search.
- **Default outlets, balanced.** Twelve outlets: NPR, The New York Times, The Atlantic and Washington Monthly on the left; Reuters, AP and UnHerd in the center; the Washington Examiner, The Washington Times, National Review, City Journal (Manhattan Institute) and AEI on the right. By AllSides label that is five leaning left, two center and five leaning right (labels checked Nov 7, 2026; AP sits with the wires but is rated Lean Left). Brookings and The Wall Street Journal are one click away. The outlet editor shows both counts and warns when one side has twice the other.
- **Your extemp file** can be pruned: every source in prep has Remove, with a confirm. A removed source is also unpicked from the round in progress.
- **The ballot, read in ten seconds.** The decision, points on the 20 to 30 scale, the three lines that decided it, and one drill stamped on the sheet. Every quoted line is checked against what was said; a line that is not there is flagged.
- **Ballots.** Every ballot from every event in one list. Patterns judges keep writing are counted in code over your last six rounds ("You drop arguments in the 2AR, 4 of 6"), with R1 to R6 marked W or L. Pace, time, pauses and a late answer are measured from your recordings. Drills can be checked off.
- **Rhetoric.** Six public-domain speeches with their figures of speech marked, each mark checked against the text. Figures are grouped by the effect they make, with the same definitions The Clearing uses. Spot the figure, write your own line (the coach critiques, never writes), and say it out loud. Further reading: Mark Forsyth, *The Elements of Eloquence*.
- **Lincoln-Douglas, spoken.** Speak any of your speeches in the practice round; the transcript replaces the typed draft (you can bring the draft back) and the real time replaces the estimate. Hear it: the opponent's speech read aloud by the voice you set up in Hermes.
- **Settings.** Transcript model and whether it is already downloaded, recordings, the outlet editor, and what leaves your computer.

### Changed

- The case workbench, topic briefing, practice round, judges and fallacies tools from 0.1 now sit inside the new frame. The ballot paper is white in light mode and a lit page in dark mode.
- Every model call has its own 3-minute limit, and a slow model shows "The model took too long to answer" instead of failing at 30 seconds.
- Web search and Hear it go through Hermes's public tool registry.
- The browser dictation button is gone; speaking now uses the recorder.

### Fixed

- A take whose transcript was cut off by a Hermes restart is released with "Press Transcribe now" instead of waiting forever.
- Typed words always win over a late transcript.
- A broken number in a take can no longer stop the page from opening.
- A slow news outlet can no longer hold up the whole headline pull (20-second limit; that outlet fails on its own).
- Exports are refused in hidden folders and ~/Library.
- The drill checkbox finds its ballot by time, so it cannot tick the wrong one after old ballots are trimmed.
- When Hermes cannot open your browser, the link is shown so you can copy it.
- A feed larger than the download cap no longer comes back empty when its items use namespaced tags (The Atlantic's did).
- A bare topic page ("Federal Reserve") is no longer listed as a headline.
- Zeugma and syllepsis, and merism and synecdoche, each have their own definition, the same words as The Clearing, and an example. Zeugma's example is Susan B. Anthony's "which ordains all men sovereigns, all women subjects"; syllepsis's is Pope's "Dost sometimes counsel take—and sometimes tea." (The Rape of the Lock, 1714), since no speech in the library shows one cleanly.
- Alliteration, assonance, anaphora, epistrophe, epanalepsis, the periodic sentence and parataxis now carry The Clearing's reworded definitions word for word (alliteration and assonance were our own until now). Their examples stay real public-domain lines. A test checks every figure the two products share against The Clearing's own text.
- The 60-second answer and the openings lab open on a low-partisan question (the Federal Reserve).

### Compatibility

- Needs Hermes 0.22.0 or newer. A 0.1 data folder opens unchanged.

## 0.1.0 (October 2026)

First release: the Lincoln-Douglas case workbench with a Socratic coach, topic briefing, a full NSDA practice round against an AI opponent, three judges, fallacies guide, drill and checker, Word and text import and export, backup.

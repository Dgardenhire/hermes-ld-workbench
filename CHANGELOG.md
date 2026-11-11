# Changelog

## 0.2.0 (November 2026)

### Start here, and a pass against the release rubric (Nov 11, 2026)

- **Start here.** The first open shows a panel naming the four rooms (Extemp, Lincoln-Douglas, Rhetoric, Ballots) in one line each, with a button into each; Lincoln-Douglas opens on Case. It says once that the judge and the coach are an AI on the model you chose in Hermes. Close it and it stays closed; **Start here** beside Coach, or the palette command Debate: Start here, opens it again.
- **Readable on paper in dark mode.** On the dark-theme paper ballot, "The coach finds the weakest moment and redoes it." was nearly invisible (1.08:1). Every line on the paper now takes the paper's ink, and the DRILL stamps darken to stay readable.
- **Links clear 4.5:1** in both themes (they measured 4.34:1 in light).
- **The clock speaks.** A screen reader hears One minute left, 30 seconds left and Time during a speech, and nothing in between.
- **Ballots.** Drill checkboxes are 24 px. The round chips under each pattern open that ballot.
- **Clearer buttons.** A typed 60-second answer or speech goes to the judge with **Judge my answer**; a typed LD speech goes in with **Add to my speech**.
- **Keyboard.** Debate: start or stop speaking can be given a key in Keyboard settings (no default key).
- **Narrow windows.** When the Debate page is narrower than 1,040 px, the coach waits for the Coach button instead of opening over the Case.
- **Settings** no longer says "with every citation, quote and number checked"; it says what is checked and that anything not found is flagged.
- **Every Case tool in view.** Each section of the Case shows all its tools as buttons, the main one highlighted, then the coach's suggestions. The More menu is gone; Strengthen this card is a button under its section like the rest.
- **The next step on a waiting take.** A recorded take waiting for your OK to send opens with "One step left: send it for a ballot" and the Transcribe now button above the recording. It used to sit small under the waveform, styled like a problem, and read as stuck.
- **Why a take wasn't transcribed.** With Hermes set to Local speech-to-text but its Whisper add-on not installed, a take only said it was unavailable. It now gives the one install command, the cloud choice in Hermes Settings and typing what you said.
- **Round page counts Lincoln-Douglas ballots only.** Extemp and drill ballots share the history, so one showed on the Round page as a Lincoln-Douglas ballot reading "Decided on undefined". The count and the last ballot card now cover Lincoln-Douglas rounds only, and the card no longer prints a missing speech name.
- **Manual** in the top row, beside Coach, opens the manual on linchpin.studio in your browser.

### Case before Round (Nov 10, 2026)

Lincoln-Douglas now opens on Case, then Round, then Fallacies: you build the case first, then run a round with it.

### Filed sources named (Nov 10, 2026)

A live run gave "Sources named 0" to a typed answer that named the Congressional Budget Office aloud. The count covers only sources in your extemp file, so the ballot now says **Filed sources named**, and the judge is told that a source you name that is not in your file still counts.

### Opens at once (Nov 10, 2026)

The page paints from what it showed last time, then replaces it with your saved work as soon as Hermes has started the plugin's backend (which took 2 to 3 seconds before the page showed anything). Until then nothing on the page can be pressed. The first open ever still shows Opening the workbench.

### Rhetoric teaches the figures it marks (Nov 9, 2026)

Press or Tab to any underlined line in a bundled speech and a panel beside the text gives the figure's name, a one-line definition, and why it works in that exact line. The notes are written once and stored (`data/figure_notes.json`, every quote tested against its speech); the model is not used to mark them. Under each, Try it: write your own line and the coach answers with questions, never wording. Pasted text is still marked by the model.

### More coaching built in (Nov 8, 2026)

You still go first. After you try, the coach can now show and suggest, and everything it writes is marked as the coach's.

- **Ask the coach, on every floor.** Coach in the rail opens a chat beside the floor about what is on screen: the question, your answer or speech, your extemp file, the ballot, your line and its figure, your case and the round. The backend reads these from your own saved work.
- **Extemp.** After a 60-second answer, Show me a strong answer: the coach's answer to the same question, built on yours, with why it works. After Openings, Show me a strong opening. In prep, once you write your answer, Suggest areas: three areas, each with a source from your own file. Find me evidence: the saved headlines that bear on a point, and whether each supports it or cuts against it.
- **Lincoln-Douglas.** Suggest contentions, Suggest a value and criterion, Write a block to an attack, and Strengthen this card: short drafts under the section, kept with the case, put into it only when you press Add, marked for you to rewrite. Evidence the coach cannot know is left as [find a card: ...].
- **Rhetoric.** After the critique of your line, Show me three versions.
- **Ballots.** Show me under each drill: the weakest moment, what went wrong there, and a modeled redo, kept with the ballot.
- **Checked in code.** Extemp examples cite only the headlines in your file. Before you see any of it, every citation, quoted run of four or more words, figure and date is checked against your file and your own words, and anything not found is marked on its line. A news outlet you have not saved is marked too.
- **Settings, Coach examples.** On by default. Off, for a room where students write every word: no example buttons, and the chat explains and asks but writes nothing for a student to say.

Debate Workbench now covers three events and listens to you speak.

### New

- **Speaking, on a real clock.** One floor for every event: the event drawn to scale in time across the top, a big clock, and the timekeeper's cards (one card a minute, then 30, then TIME). The clock starts at your first word. Your voice is drawn as it comes in, with a mark over every pause longer than 2 seconds. No microphone? Type, and the time is estimated at 140 words a minute, labeled as estimated.
- **Takes and transcripts.** Recordings stay on the computer that runs Hermes (newest 20, at most 100 MB, delete-all in Settings). Each take is transcribed by Hermes's own speech-to-text, so it follows your Hermes voice settings (local, or the cloud provider you chose there; Settings and the take say which). A take never goes to a cloud speech-to-text on its own: it says where it would go and waits until you press Transcribe now on it, every take. When the workbench's own speech model is already on the computer, it makes the transcript there instead and nothing is sent. When Hermes cannot without downloading a model of its own, the workbench uses faster-whisper with its model in its own data folder, never the shared Hugging Face cache. Each take gets a transcript, words a minute and fillers, and, with the workbench's own model, time to your answer. Without either, every take still gets real timing and pauses.
- **Extemp.** A 60-second answer that opens ready to speak. Openings: three 45-second openings for one question, and the coach picks the strongest. The full round: pull this week's headlines on your topic from outlets on the left, center and right, side by side and labeled by lean (you can edit the list and every label); save them to your extemp file; draw three questions from your own news; 30 minutes of prep with an outline and your sources; a 7-minute speech; an extemp ballot. Prep can be files only or internet allowed, through your own Hermes web search.
- **Default outlets, balanced.** Twelve outlets: NPR, The New York Times, The Atlantic and Washington Monthly on the left; Reuters, AP and UnHerd in the center; the Washington Examiner, The Washington Times, National Review, City Journal (Manhattan Institute) and AEI on the right. By AllSides label that is five leaning left, two center and five leaning right (labels checked Nov 7, 2026; AP sits with the wires but is rated Lean Left). Brookings and The Wall Street Journal are one click away. The outlet editor shows both counts and warns when one side has twice the other.
- **Your extemp file** can be pruned: every source in prep has Remove, with a confirm. A removed source is also unpicked from the round in progress.
- **The ballot.** The decision, points on the 20 to 30 scale, three of the student's lines the judge quoted with why each mattered, and one drill stamped on the sheet. Every quoted line is checked against what was said; a line that is not there is flagged.
- **Ballots.** Every ballot from every event in one list. Patterns judges keep writing are counted in code over your last six rounds ("You drop arguments in the 2AR, 4 of 6"), with R1 to R6 marked W or L. Pace, time, pauses and a late answer are measured from your recordings. Drills can be checked off.
- **Rhetoric.** Six public-domain speeches with their figures of speech marked, each mark checked against the text. Figures are grouped by the effect they make, with the same definitions The Clearing uses. Spot the figure, write your own line (the coach critiques it, then can show three versions), and say it out loud. Further reading: Mark Forsyth, *The Elements of Eloquence*.
- **Lincoln-Douglas, spoken.** Speak any of your speeches in the practice round; the transcript replaces the typed draft (you can bring the draft back) and the real time replaces the estimate. Hear it: the opponent's speech read aloud by the voice you set up in Hermes.
- **Settings.** Which speech-to-text makes your transcripts (and the workbench's own model, when it is used), Delete all recordings, Delete transcripts and ballots (each with a confirm), the outlet editor, and what leaves your computer, worded for the speech-to-text Hermes uses.

### Security (audit, Nov 8, 2026; see docs/SECURITY-AUDIT.md)

- A new recording never downloads the speech model. When the model is not on the computer yet, the take says how big it is and waits; Transcribe now is the only thing that downloads it.
- Feeds and Word files with a DTD are refused wherever the DTD sits and in any encoding, so no entity can expand.
- Web pages and headlines sent to the model can no longer close the block they are quoted in.

### After the audit (Nov 8, 2026)

- **Hermes's own transcription first.** The backend calls Hermes's `tools.voice_mode.transcribe_recording` (the function behind Hermes's voice input) with the take converted to 16 kHz mono WAV, in the requesting profile's scope, with Hermes's hallucination filter. It is a private Hermes import, guarded and disclosed; if a release moves it, transcripts fall back instead of breaking.
- **Speech model location (must-fix before release).** The workbench's own model is found and saved in `plugin-data/ld-workbench/models/`, downloaded in a separate Python with its own Hugging Face home, so a shared cache that links to an unmounted drive no longer breaks the first transcript. The shared cache is only read. An unwritable folder or a failed download is said plainly; timing and pauses stay.
- **Delete transcripts and ballots** in Settings (audit F-6), with a confirm.
- **Figure definitions.** All 42 figures the workbench shares with The Clearing now carry The Clearing's definitions word for word (its figure list at main 0722112), including rhyme, versification, antithesis, paradox and personification. The examples stay the workbench's own public-domain lines.

### After the persona test (Nov 8, 2026)

Three personas (a first-year extemper, a volunteer coach, a varsity Lincoln-Douglas debater) used 0.2 and ranked 14 fixes. These are built:

- **Write your own question, everywhere.** The 60-second answer and Openings have **Write your own** and a **Question list** under the question; the full round always offers **Or prep a question of your own**, not only when the draw fails. A coach can add this week's questions and turn on **Ask only my questions**.
- **A bigger question pool that rotates.** 52 built-in 60-second questions, United States and International, across the economy, the courts, Congress, elections, foreign policy and every region, worded to be low-partisan. The floor opens on a different question each visit (a fresh profile opens on the Federal Reserve one). Any built-in question can be hidden and brought back. The chosen question stays when you switch between 60-second answer, Openings and the full round.
- **Why the draw is off.** With no saved sources and no pull, **Draw three questions** says why and what to do.
- **Fallacy quotes are checked.** Every "Exact words" quote in Spot fallacies, Check an argument and Find fallacies is checked against the text it came from, the way ballot lines are. A quote that is not there is marked on its line ("Not found in the speech. Check it before you use it."), and the answer says how many were checked and missed.
- **A ballot a first-year can read.** The extemp boxes say what they answer ("Answered the question?"), and under the points a key says what the numbers mean (the same scale the judge is given). Drills never send a student with an empty file to "your file"; the judge is told how many sources are saved, and an older drill that says it gets a note on how to start a file. The 60-second floor shows only extemp drills, never a Lincoln-Douglas one.
- **Ballots a coach can use.** A page heading; any ballot opens to its full sheet with the reason for decision; a key for the outlined round chips on the page; **Print ballots** (every sheet, open) and **Save as a file for your coach** (one text file of every ballot and the patterns).
- **The flow beside the clock.** In your speeches after the opponent has spoken (the 1AR, the 2AR, the NC and the NR), the flow so far sits beside the clock. **Hide the flow** puts it away for the round.
- **Pace by the judge you chose.** Over 175 words a minute is no longer marked as a problem in front of a flow judge or the new **Circuit judge** (fine with speed; evaluates theory, kritiks, plans and counterplans if they are run).
- **On-topic headlines only.** A pull keeps only headlines that name the topic (or a known short name, like "Fed" for the Federal Reserve). The off-topic stories in the Nov 7 capture are gone; an outlet with nothing on the topic says so. Pulls cached before this are filtered the same way.
- **Narrow windows.** At 1024 x 720 the Lincoln-Douglas strip stays on one row, drawn to scale, and **Speak your 1AR** sits beside the clock, above the fold.
- **Choices you can see.** Every pick-one control (opponent, judge, area, prep rules, transcript model, extemp mode, side, speed) shows the picked option with an accent outline, a check and bold text.
- The rail says which extemp mode you are in.

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

# Debate Workbench manual

Version 0.2. For students practicing speech and debate on their own, and for the coaches who assign the practice.

## Before you start

- Hermes Desktop 0.22 or newer, with a model set up. Debate Workbench uses that model for the opponent, the judge and the coach.
- A microphone, if you want to speak. Without one you can type everything.
- For transcripts: Hermes's local speech-to-text. In Hermes Settings, Voice, set the speech-to-text provider to local and use voice input once. The first time, the take says the speech model is not on this computer yet; press Transcribe now to download it (about 145 MB) from huggingface.co, once; after that it works offline. Without it, every take still gets real timing and pauses.

Open it from **Debate** in the Hermes sidebar. The rail on the left holds the events: Lincoln-Douglas, Extemp, Rhetoric, then Ballots and Settings.

## The floor

Every event uses the same floor.

- **The strip** across the top is the event drawn to scale in time. Each part is as wide as its minutes: in Lincoln-Douglas the 7-minute NC is more than twice the 3-minute cross-ex. The part you are on is outlined, and it fills as time passes.
- **The clock** counts down. It starts at your first word, not when you press the button.
- **The time cards** are the ones a timekeeper holds up: one card a minute, then 30, then TIME. Over time, the clock turns red and counts up.
- **Start speaking** opens the microphone. Hermes may ask for permission the first time; say yes. **Stop** ends the take. **Cancel this take** throws it away.
- **Type instead** works everywhere. Typed takes are timed at 140 words a minute and say "estimated".

While you speak, your voice is drawn as it comes in. A shaded mark covers each pause longer than 2 seconds.

After you stop, the take shows how long you spoke, words a minute, fillers the transcript caught, pauses over 2 seconds and how long it took you to answer. Open **What you said** to read the transcript. If the transcript is wrong, fix it there; your words always win.

## Extemp

The Extemp floor opens on a **60-second answer**, ready to speak.

1. Read the question. **Another question** gives you a new one.
2. Press **Start speaking** and answer in one minute.
3. The judge writes the ballot after the transcript is done.

**Openings** gives you three 45-second tries at opening the same question three different ways. The coach picks the strongest, says why, and gives one fix for each. It never writes an opening for you.

**Full round** works like a tournament:

1. **Pull headlines.** Type a topic and press **Pull headlines**. Headlines from each outlet on your list come back in three columns: left and lean left, center and wires, right and lean right. Each outlet carries its lean label. Click a headline to open it in your browser.
2. **Save to file.** Keep the headlines you want. They become your extemp file.
3. **Draw.** Pick **United States** or **International** and **Prep: files only** or **Prep: internet allowed**, then **Draw three questions**. The questions come from your own saved news. Pick one. If the draw fails, write your own question.
4. **Prep, 30 minutes.** Fill the outline: attention-getter, link, your answer, three areas, conclusion. Pick sources from your file. **Remove** takes a source out of your file for good, after you confirm. In an internet-allowed round, **Search the web** uses the web search you set up in Hermes, and **Save as a source** adds a result to your file.
5. **Go to the podium** and give a 7-minute speech.
6. Read the extemp ballot: did you answer the question, how many sources you named and from when, your analysis, organization, delivery and time.

**Your outlets** lets you add, remove and relabel outlets. The default lean labels come from AllSides, checked Nov 7, 2026. Change any label you disagree with. The note above the editor says how many outlets sit in each column and how many lean each way by label, and warns when one side has twice the other.

## Lincoln-Douglas

- **Case Workbench.** Build your case section by section: resolution analysis, definitions, value, criterion, contentions, blocks. Each section has helpers (find definitions, check my logic, attack my case). The coach asks questions and points to evidence. It will not write your case.
- **Topic briefing** opens the first time you meet a new resolution.
- **Tournament Room.** Pick a case, an opponent level (Novice, JV, Varsity) and a judge (parent judge, traditional coach, flow judge). The round runs in NSDA order: AC 6, CX 3, NC 7, CX 3, 1AR 4, NR 6, 2AR 3, with 4 minutes of prep.
  - Speak or type your speeches. A spoken speech's transcript replaces the typed draft; **Bring back my typed draft** undoes that.
  - **Hear it** reads the opponent's speech aloud with the voice you set up in Hermes.
  - Your answers in cross-examination count: the opponent will use them.
- **The ballot.** The decision, your points, the three lines that decided it (each tagged with its speech), and a drill. **Read the full reason for decision** opens the rest. **Ask another judge** gets a second ruling on the same round. **Redo a speech** lets you give one speech again for the same judge.
- **Fallacies.** A guide to 15 common fallacies, a practice drill, and a checker for any argument.

## Rhetoric

1. **Read.** Six public-domain speeches (Lincoln, Douglass, Susan B. Anthony, Theodore Roosevelt, Franklin Roosevelt) with their figures of speech marked. Click a count to show or hide that figure's marks. **Paste your own** finds figures in any speech; every mark is checked against the text.
2. **Figures.** The figures, grouped by the effect they make, with the same definitions The Clearing uses. Further reading: Mark Forsyth, *The Elements of Eloquence* (2013).
3. **Spot.** Name the figure in a real line.
4. **Write.** Write your own line using a figure. The coach critiques it and never rewrites it.
5. **Say it.** Say your line out loud in 30 seconds.

## Ballots

Every ballot from every event. At the top, the patterns judges keep writing over your last six rounds, for example "You drop arguments in the 2AR, 4 of 6", with R1 to R6 marked W or L. These counts are made in code from a fixed list, not guessed by the model. Patterns marked "measured from your recordings" come from the clock and the transcript.

Each ballot's drill has a checkbox. Tick it when you have done the drill.

## Settings

- **Transcripts.** Pick base.en (faster) or small.en (more accurate, slower), and see whether it is already downloaded.
- **Recordings.** How many are kept and how much space they take. **Delete all recordings** asks first. Ballots, timing and transcripts stay.
- **Headline outlets.** The same editor as **Your outlets**.
- **What leaves your computer.** The exact list.

## When something goes wrong

| You see | Do this |
|---|---|
| "Hermes is not allowed to use the microphone." | On a Mac: System Settings, Privacy & Security, Microphone, turn on Hermes. On Windows: Settings, Privacy & security, Microphone, let desktop apps use it. Or press **Type instead**. |
| "The microphone is busy." | Turn off Hermes's wake word for now, or close other apps that use the mic. |
| "Timing only" on a take | Transcripts are not set up. Follow the steps under "Before you start", then press **Transcribe now**. Or type what you said. |
| "Making the transcript on this computer" for a long time | The first Transcribe now downloads the speech model. Later ones are faster. A 7-minute speech takes longer than a 1-minute answer. |
| "The model took too long to answer." | Press the button again, or pick a faster model in Hermes settings. |
| "Hermes does not have a model set up yet." | Choose a model in Hermes settings. |
| An outlet column says it did not answer | That outlet failed on its own; the others still work. Pull again later, or work from your saved file. |
| "No outlet answered." | Check the internet connection, or work from your saved file. |
| "Web search is not set up in your Hermes." | In Hermes Settings, Tools, turn on web search, or switch the round to files only. |
| "Hermes has no voice output set up." | In Hermes Settings, Voice, choose a text-to-speech provider. You can still read the speech. |
| "Hermes could not open your browser." | Copy the link shown and paste it into your browser. |

## Where your work lives

Everything is saved by Hermes in `plugin-data/ld-workbench` inside your Hermes folder: cases, rounds, ballots, briefings, takes, recordings, transcripts, your extemp file and headline pulls. There are no accounts and no tracking. **Save a backup** in the Case Workbench menu writes every case to one file.

## What leaves your computer

See "What leaves your computer" in Settings, or the same list in the README. In short: the words of your speeches go to the model you chose in Hermes; headline pulls ask Google News or the outlet's own feed; a web search (internet-allowed rounds only) goes to your Hermes web search; Hear it sends the opponent's speech to your Hermes voice; a link you save is read once. Your voice recordings stay on the computer that runs Hermes.

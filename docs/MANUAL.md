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

The Extemp floor opens on a **60-second answer**, ready to speak. It opens on a different question each visit.

1. Read the question. Under it:
   - **Another question** gives you the next one on the list.
   - **Write your own** takes any question: one your coach handed out, or one from your circuit. Pick United States or International. **Keep it on my question list** saves it for later.
   - **Question list** shows your own questions first, then the 52 built-in ones. **Ask this one** puts a question on the floor. **Hide** takes a built-in question off the list (**Show the hidden again** brings them back); **Delete** removes one of yours. **Ask only my questions** makes the floor use only yours: a coach can add this week's three and turn it on.
2. Press **Start speaking** and answer in one minute.
3. The judge writes the ballot after the transcript is done.

The question you chose stays when you switch to **Openings** or **Full round**.

**Reading the extemp ballot.** "Answered the question?" is ticked Yes, Partly or No. The points run from 20 to 30: 29 to 30 is excellent, 28 is strong, 27 is a solid speech with one clear problem, 26 has several problems, and 25 or lower means the question was not really answered. The key is printed under the points.

**Openings** gives you three 45-second tries at opening the same question three different ways. The coach picks the strongest, says why, and gives one fix for each. It never writes an opening for you.

**Full round** works like a tournament:

1. **Pull headlines.** Type a topic and press **Pull headlines**. Headlines from each outlet on your list come back in three columns: left and lean left, center and wires, right and lean right. Each outlet carries its lean label. Only headlines that name your topic are kept (or a common short name: "Fed" for the Federal Reserve, "U.N." for the United Nations), so an outlet may say "Nothing on this topic in the last 30 days." Click a headline to open it in your browser.
2. **Save to file.** Keep the headlines you want. They become your extemp file.
3. **Draw.** Pick **United States** or **International** and **Prep: files only** or **Prep: internet allowed**, then **Draw three questions**. The questions come from your own saved news, so the draw needs a pull or a saved source first; until then the button is off and says so. Pick one.
   - **Or prep a question of your own** is always there, under the draw. It starts with the question you had on the 60-second floor; type any other. It uses the area and prep rules above.
4. **Prep, 30 minutes.** Fill the outline: attention-getter, link, your answer, three areas, conclusion. Pick sources from your file. **Remove** takes a source out of your file for good, after you confirm. In an internet-allowed round, **Search the web** uses the web search you set up in Hermes, and **Save as a source** adds a result to your file.
5. **Go to the podium** and give a 7-minute speech.
6. Read the extemp ballot: did you answer the question, how many sources you named and from when, your analysis, organization, delivery and time.

**Your outlets** lets you add, remove and relabel outlets. The default lean labels come from AllSides, checked Nov 7, 2026. Change any label you disagree with. The note above the editor says how many outlets sit in each column and how many lean each way by label, and warns when one side has twice the other.

## Lincoln-Douglas

- **Case Workbench.** Build your case section by section: resolution analysis, definitions, value, criterion, contentions, blocks. Each section has helpers (find definitions, check my logic, attack my case). The coach asks questions and points to evidence. It will not write your case.
- **Topic briefing** opens the first time you meet a new resolution.
- **Tournament Room.** Pick a case, an opponent level (Novice, JV, Varsity) and a judge (parent judge, traditional coach, flow judge, or circuit judge, who is fine with speed and evaluates theory, kritiks, plans and counterplans if they are run; the opponent itself debates traditional LD). The round runs in NSDA order: AC 6, CX 3, NC 7, CX 3, 1AR 4, NR 6, 2AR 3, with 4 minutes of prep.
  - Speak or type your speeches. A spoken speech's transcript replaces the typed draft; **Bring back my typed draft** undoes that.
  - In every speech after the opponent has spoken (the 1AR and 2AR, or the NC and NR), **the flow so far** sits beside the clock, so you can see what you are answering. **Hide the flow** puts it away for the round; **Round**, **Flow beside the clock in your speeches** brings it back.
  - Speaking faster than 175 words a minute counts against you only in front of a parent judge or a traditional coach.
  - **Spot fallacies** under the opponent's speech finds fallacies in it. Every "Exact words" quote is checked against the speech; a quote that is not there is marked "Not found in the speech. Check it before you use it."
  - **Hear it** reads the opponent's speech aloud with the voice you set up in Hermes.
  - Your answers in cross-examination count: the opponent will use them.
- **The ballot.** The decision, your points, the three lines that decided it (each tagged with its speech), and a drill. **Read the full reason for decision** opens the rest. **Ask another judge** gets a second ruling on the same round. **Redo a speech** lets you give one speech again for the same judge.
- **Fallacies.** A guide to 15 common fallacies, a practice drill, and a checker for any argument. The checker's quotes are checked against what you pasted, the same way.
- **The points on the LD ballot** run 20 to 30; most rounds land between 26 and 30. 28.0 is a typical good round, 29.0 and up is excellent, and below 27.0 means serious problems.

## Rhetoric

1. **Read.** Six public-domain speeches (Lincoln, Douglass, Susan B. Anthony, Theodore Roosevelt, Franklin Roosevelt) with their figures of speech marked. Click a count to show or hide that figure's marks. **Paste your own** finds figures in any speech; every mark is checked against the text.
2. **Figures.** The figures, grouped by the effect they make, with the same definitions The Clearing uses. Further reading: Mark Forsyth, *The Elements of Eloquence* (2013).
3. **Spot.** Name the figure in a real line.
4. **Write.** Write your own line using a figure. The coach critiques it and never rewrites it.
5. **Say it.** Say your line out loud in 30 seconds.

## Ballots

Every ballot from every event. At the top, the patterns judges keep writing over your last six rounds, for example "You drop arguments in the 2AR, 4 of 6", with R1 to R6 marked W or L. An outlined chip means the judge wrote that on that ballot; a plain one means not (the key is on the page). R is a Lincoln-Douglas round and # an extemp speech or 60-second answer. These counts are made in code from a fixed list, not guessed by the model. Patterns marked "measured from your recordings" come from the clock and the transcript.

- Click any ballot to open its full sheet: the decision, the points, the lines that decided it, the reason for decision and the drill.
- Each ballot's drill has a checkbox. Tick it when you have done the drill.
- **Print ballots** shows every sheet open, ready to print or save as a PDF.
- **Save as a file for your coach** writes one text file with every ballot (newest first) and the patterns. Send it to your coach.

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
| **Draw three questions** is off | The draw writes questions from your news. Pull headlines on a topic, or save a source to your file. Or prep a question of your own, below it. |
| "Not found in the speech. Check it before you use it." | The fallacy finder quoted words that are not in the text. Find the real words before you use that fallacy in cross-examination. |
| "Your file is empty for now" under a drill | The drill mentions your extemp file. In Full round, pull headlines and save a few, or use sources you can name with an outlet and a date. |

## Where your work lives

Everything is saved by Hermes in `plugin-data/ld-workbench` inside your Hermes folder: cases, rounds, ballots, briefings, takes, recordings, transcripts, your extemp file and headline pulls. There are no accounts and no tracking. **Save a backup** in the Case Workbench menu writes every case to one file.

## What leaves your computer

See "What leaves your computer" in Settings, or the same list in the README. In short: the words of your speeches go to the model you chose in Hermes; headline pulls ask Google News or the outlet's own feed; a web search (internet-allowed rounds only) goes to your Hermes web search; Hear it sends the opponent's speech to your Hermes voice; a link you save is read once. Your voice recordings stay on the computer that runs Hermes.

# Demo notes: the moments worth filming

For the Debate Workbench film (under 90 seconds; the film plan targets about 60 to 72). Everything below is real: a real take in Damon's voice, the real transcript, the real ballot. Film after `docs/LIVE-TEST.md` sections 1 to 3 pass.

The film's structure is the round's own clock (from the film critique): speaking, the card, Stop, the numbers, the ballot, the drill. The event strip is the timeline.

## Set up once (15 minutes, the day before)

1. **A separate Hermes profile for filming**, dark theme, window 1440x900, the default blue accent.
2. **Seed the practice history** so Ballots has patterns to show:
   `/usr/bin/python3 harness/seed_demo.py <the demo profile's Hermes home>/plugin-data/ld-workbench`
   It writes nine practice ballots (six Lincoln-Douglas rounds on a carbon tax, three extemp answers) and refuses a folder that already has ballots. If Ballots appears in the film, the frame says so ("Six earlier practice rounds, seeded").
3. **Download the transcript model first.** Do one throwaway 60-second take and wait for its transcript (the first one downloads base.en, about 145 MB). Settings, Transcripts should then say "base.en is already on this computer". Delete that take's recording in Settings if you like.
4. **Pick the question.** The floor opens on "Can Congress change trade policy when the President controls tariffs?". For a low-partisan film, press **Another question** once for "Should the Federal Reserve care more about prices or about jobs right now?", or three times for "Is a four-day school week good for rural districts?". Damon's call (film plan decision D2).
5. Turn off notifications and Hermes's wake word.

## The moments, in film order

### 1. Speaking on the clock (the opening frame)

- **Steps:** Extemp, 60-second answer, the chosen question. Press **Start speaking** and answer for real, about 55 seconds.
- **What happens on screen:**
  - The clock waits ("The clock starts when you do"), then starts at the first word, not at the click.
  - The 190 px clock counts down; the **1** card is up; at 0:30 the **30** card flips up.
  - The voice is drawn as it comes in. Pause on purpose once for 3 seconds between your second and third point: "Pausing" shows, then a shaded mark covers it and the count reads "1 pause over 2 seconds".
  - The strip's "Answer 1:00" part fills as time passes.
- **Hold:** at least 7 seconds unbroken on the clock and waveform while you speak.
- **Crop for 4:5:** clock, cards and waveform (x 444 to 1412 at 1440 wide). The strip and question sit above.

### 2. Stop, and the numbers from your voice

- **Steps:** press **Stop** at about 0:05 left.
- **What happens:** "Making the transcript on this computer", then the take: seconds spoken of 1:00, words a minute, fillers the transcript caught, pauses over 2 seconds, time to your answer, and the line "Transcript, on this computer". Open **What you said** to show your own words.
- **Timing:** a 60-second transcript should take seconds once base.en is downloaded (measure it in the live test). Cut the wait if it runs long.

### 3. The ballot slides in

- **What happens:** "The judge is writing the ballot", then the ballot: Yes, Partly or No ticked in the judge's pen, points circled on the 20 to 30 scale, the one-line verdict, **The lines that decided it** (three of your own lines, underlined, each checked against the transcript), and a red **DRILL** stamped with its name and steps.
- **Hold** on the three lines and the stamp. These are the proof that it heard you.
- **Then:** press **Try it again**. The same question reloads with the drill shown under the floor ("From your last ballot"). That is the loop: speak, judged, drill, redo.

### 4. Ballots: what judges keep writing (5 seconds at most, optional)

- **Steps:** rail, **Ballots**.
- **What happens:** "Lincoln-Douglas: across your last 6 ballots" with "You drop arguments in the 2AR, 4 of 6" and R1 to R6 chips marked W or L; the extemp patterns beside it, some "measured from your recordings". Below, every ballot with its drill and checkbox.
- **Honesty:** the six rounds are the seeded practice history. Say so in the frame.

### 5. Rhetoric (5 seconds at most, optional)

- **Steps:** rail, **Rhetoric**, **Read**, **Second Inaugural Address**.
- **What happens:** the closing paragraph with 13 marks, each an exact quote; click **Anaphora** in the counts to show only "With malice toward none; with charity for all; with firmness in the right".

### 6. Stills for the post, not the film

- The Lincoln-Douglas strip drawn to scale, 6-3-7-3-4-6-3 then Ballot (Lincoln-Douglas, Tournament Room, during any speech).
- The headline pull in three columns (Extemp, Full round, Pull headlines on a topic). If it appears in the film at all, keep it under a second, as texture, with no readable lean labels (film critique, D2).
- The Lincoln-Douglas ballot: YOU WON or YOU LOST with the three lines tagged by speech.

## Do not film

- A partisan question in Damon's own voice on his own account (D2).
- Readable outlet names with lean labels side by side for longer than a second.
- Anything typed instead of spoken in the speaking beat; the point is that it heard you.
- The macOS microphone prompt (do the first take before filming).

## The end card

"Debate Workbench. Uses your Hermes model. Your voice stays on the computer that runs Hermes." (Accurate as written: recordings and transcripts stay there; the words of your speech go to your model for the ballot.)

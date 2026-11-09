// Written by harness/make_coach_fixtures.py: hand-written model answers put through the plugin's own coach checks.
export const COACH = {
 "answer": {
  "example": "Prices, for now. Congress gave the Fed two jobs, stable prices and maximum employment, and right now prices are the one further from the goal. The jobs side is holding: Reuters reported on November 6 that Fed policymakers are weighing a rate hike after a strong jobs report (Nov 6, 2026). NPR put a number on it that week: the economy added 165,000 jobs last month (Nov 6, 2026). When hiring is that steady, the bigger risk is prices that stay high and eat into every paycheck. The other side says a hike could cost jobs, and that risk is real. But prices that run hot for a year are harder to bring down later, and they hurt the same workers. So the Fed should care more about prices now, and keep reading the jobs report every month.",
  "notes": [
   "It answers in the first three words. Yours restated the question first, so the answer came about five seconds in.",
   "It names two sources out loud, outlet and date. Yours named Reuters without a date.",
   "It answers the other side in two sentences before the close, so the judge hears that you weighed it."
  ],
  "kept": "Your answer, prices for now, and your point about the law: two goals, and which one is further off.",
  "checks": {
   "citations": 2,
   "not_in_file": 0,
   "quotes": 0,
   "quotes_missed": 0,
   "numbers_missed": 0,
   "outlets_missed": 0
  },
  "kind": "answer",
  "sources": 3
 },
 "opening": {
  "example": "This week the jobs news looked like good news. NPR reported that the economy added 165,000 jobs last month (Nov 6, 2026). Then Reuters reported that Fed policymakers are weighing a rate hike (Nov 6, 2026). Why raise rates when hiring is strong? Because strong hiring is exactly when the Fed can afford to fight prices. So tonight's question: Should the Federal Reserve care more about prices or about jobs right now? My answer is prices, for now. I will look at the Fed's two goals, why the job market can take a hike, and the cost of waiting.",
  "notes": [
   "It opens on a real number from your file, like your milk price, but one that is about this question and this week.",
   "It gets from the number to the question in three short sentences, the fix the coach gave your first opening.",
   "It answers right after the question and previews three areas, as your second opening did."
  ],
  "kept": "Your second opening's best move: the answer comes right after the question.",
  "checks": {
   "citations": 2,
   "not_in_file": 0,
   "quotes": 0,
   "quotes_missed": 0,
   "numbers_missed": 0,
   "outlets_missed": 0
  },
  "kind": "opening",
  "sources": 3
 },
 "areas": {
  "areas": [
   {
    "title": "Hiring is strong enough to take a small hike",
    "why": "If the job market is adding workers, one small hike is unlikely to cost many jobs. That is why the answer can be yes.",
    "use": "Say the number: \"The economy added 165,000 jobs last month.\"",
    "source": {
     "id": "f3",
     "citation": "NPR, Nov 6, 2026",
     "title": "Hiring jumps: The economy added 165,000 jobs last month",
     "url": "https://news.google.com/"
    }
   },
   {
    "title": "The Fed itself is weighing it",
    "why": "A hike is a live choice inside the Fed, not an outside demand, so the question is when, not whether.",
    "use": "Reuters says policymakers are considering a hike after the jobs report.",
    "source": {
     "id": "f1",
     "citation": "Reuters, Nov 6, 2026",
     "title": "Fed policymakers consider rate hike after strong jobs report",
     "url": "https://news.google.com/"
    }
   },
   {
    "title": "Waiting has a cost too",
    "why": "Holding steady in October left prices where they were. The longer they run high, the bigger the hike needed later.",
    "use": "National Review asks why the Fed did not raise rates: use it to name the other side and answer it.",
    "source": {
     "id": "f2",
     "citation": "National Review, Oct 28, 2026",
     "title": "Does Anyone Know Why the Fed Didn’t Raise Rates?",
     "url": "https://news.google.com/"
    }
   }
  ],
  "note": "",
  "checks": {
   "citations": 0,
   "not_in_file": 0,
   "quotes": 1,
   "quotes_missed": 0,
   "numbers_missed": 0,
   "outlets_missed": 0
  },
  "sources": 3
 },
 "evidence": {
  "picks": [
   {
    "source": {
     "id": "f3",
     "citation": "NPR, Nov 6, 2026",
     "title": "Hiring jumps: The economy added 165,000 jobs last month",
     "url": "https://news.google.com/",
     "lean": "Lean Left"
    },
    "how": "The clearest number in your file: 165,000 jobs added last month.",
    "stance": "supports"
   },
   {
    "source": {
     "id": "f1",
     "citation": "Reuters, Nov 6, 2026",
     "title": "Fed policymakers consider rate hike after strong jobs report",
     "url": "https://news.google.com/",
     "lean": "Center"
    },
    "how": "It calls the jobs report strong, and says the Fed is reacting to it.",
    "stance": "supports"
   },
   {
    "source": {
     "id": "f2",
     "citation": "National Review, Oct 28, 2026",
     "title": "Does Anyone Know Why the Fed Didn’t Raise Rates?",
     "url": "https://news.google.com/",
     "lean": "Lean Right"
    },
    "how": "It is about why the Fed waited, not about jobs. Use it for the other side.",
    "stance": "context"
   }
  ],
  "fallback": false,
  "missing": "",
  "checks": {
   "citations": 0,
   "not_in_file": 0,
   "quotes": 0,
   "quotes_missed": 0,
   "numbers_missed": 0,
   "outlets_missed": 0
  },
  "dropped": 0
 },
 "ld_block": {
  "kind": "block",
  "drafts": [
   {
    "label": "A/T: Conservation already risks suffering",
    "text": "1. The comparison breaks down. Captive breeding risks suffering to save a species that is still alive; de-extinction creates suffering to bring back one that is gone.\n2. Their example proves my criterion. We accept those risks only when the harm prevented is larger, and they have not shown that for de-extinction. [find a card: how many attempts end in early death]\n3. Turn: if any risk is acceptable, their standard cannot tell the judge when to stop. Only minimizing suffering gives the round a clear test."
   }
  ],
  "note": "Read answer 1 first under time pressure: it is the shortest, and it breaks their comparison.",
  "target": "Blocks",
  "checks": {
   "citations": 0,
   "not_in_file": 0,
   "quotes": 0,
   "quotes_missed": 0,
   "numbers_missed": 0,
   "outlets_missed": 0
  },
  "label": "Suggested block",
  "section": "Blocks"
 },
 "critique": {
  "text": "Partly. \"Prices pinch every paycheck\" is strong alliteration: three p words in a row that you can hear. The second half drops the sound after \"patience\", so the line loses its drive. Try ending on a p word too."
 },
 "versions": {
  "figure": "alliteration",
  "versions": [
   {
    "line": "Prices pinch every paycheck, and patience pays no one's rent.",
    "note": "Keeps your words and puts a p word at the end, so the sound carries through."
   },
   {
    "line": "Every paycheck feels the pinch when prices keep climbing.",
    "note": "Pulls the p words closer together and ends on the picture."
   },
   {
    "line": "Prices pinch, paychecks shrink, and patience is a promise the rent cannot wait for.",
    "note": "Three short beats on p, then a longer close that lands the point."
   }
  ],
  "checks": {
   "citations": 0,
   "not_in_file": 0,
   "quotes": 0,
   "quotes_missed": 0,
   "numbers_missed": 0,
   "outlets_missed": 0
  }
 },
 "line": "Prices pinch every paycheck, and patience will not cover the rent.",
 "show_drill": {
  "moment": "According to Reuters, Fed policymakers are weighing a rate hike after a strong jobs report",
  "moment_checked": true,
  "why": "You named Reuters but not the date, so the judge could not tell how current the news was. That is this ballot's drill.",
  "redo": "Reuters reported on November 6 that Fed policymakers are weighing a rate hike after a strong jobs report (Nov 6, 2026). That tells you hiring is holding up, so the Fed can afford to lean on prices.",
  "practice": "Say the outlet, the date and the headline in one breath, five times, then put the line back into your answer.",
  "checks": {
   "citations": 1,
   "not_in_file": 0,
   "quotes": 0,
   "quotes_missed": 0,
   "numbers_missed": 0,
   "outlets_missed": 0
  },
  "at": 1762571000
 },
 "show_ld": {
  "moment": "Second, the welfare contention was dropped in the NR.",
  "moment_checked": true,
  "why": "The NR answered welfare twice, so calling it dropped cost you with this judge, who says the flow does not support it.",
  "redo": "Second, welfare. The NR says suffering only proves we should be careful. But under minimizing suffering, certain harm to animals outweighs benefits no one has shown, and the NR gave no example of a revived species that lived without that harm. Extend the bucardo: it lived only minutes. That is where every attempt starts, so vote affirmative.",
  "practice": "Give this voting issue out loud three times in 45 seconds, answering the NR before you extend.",
  "checks": {
   "citations": 0,
   "not_in_file": 0,
   "quotes": 0,
   "quotes_missed": 0,
   "numbers_missed": 0,
   "outlets_missed": 0
  },
  "at": 1762418400
 },
 "chat_extemp": {
  "text": "Mostly. Your answer, prices for now, came in your second sentence, after you restated the question, so a judge hears it about five seconds in. Your three reasons were clear and in order: the law, the jobs side, the cost of waiting. You named Reuters (Nov 6, 2026) but not the date; say \"on November 6\". Try it again and start with your answer.",
  "checks": {
   "citations": 1,
   "not_in_file": 0,
   "quotes": 0,
   "quotes_missed": 0,
   "numbers_missed": 0,
   "outlets_missed": 0
  },
  "examples": true
 },
 "chat_question": "Was my answer clear?"
}

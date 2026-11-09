"""Write harness/fixtures_coach.js: the coach's answers on the harness screens, put through the plugin's own
code (coach.py, the coach/ routes) so every citation, quote and figure on screen is checked the way the
backend checks it. Run: /usr/bin/python3 harness/make_coach_fixtures.py

Hand-written, not captured from a model: each model answer below (RAW) is written for the harness, on the
harness's own extemp file (the three real headlines from the Nov 7, 2026 pull in harness.js FILE), its take
and its Lincoln-Douglas round. A live model writes its own; these show the shape and the checks. A fake model
hands each answer to the real route, in a temporary data folder. Nothing here is client material."""
import json
import os
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
os.environ["LDW_DATA_DIR"] = tempfile.mkdtemp(prefix="ldw-coach-fixtures-")
sys.path.insert(0, str(ROOT / "tests"))
from _load import api, ballots, extemp, fake_model, library, run, speech, store  # noqa: E402

sys.path.insert(0, str(ROOT / "harness"))
from make_fixtures import Q, SAID  # noqa: E402  the harness's 60-second answer

coach = api.coach
llm = fake_model()

# harness.js FILE: real headlines from a pull on the Federal Reserve, Nov 7, 2026.
FILE = [
    {"id": "f1", "title": "Fed policymakers consider rate hike after strong jobs report", "outlet": "Reuters", "lean": "Center", "at": 1793998714},
    {"id": "f2", "title": "Does Anyone Know Why the Fed Didn’t Raise Rates?", "outlet": "National Review", "lean": "Lean Right", "at": 1793170800},
    {"id": "f3", "title": "Hiring jumps: The economy added 165,000 jobs last month", "outlet": "NPR", "lean": "Lean Left", "at": 1793972961},
]
store.write("extemp_file.json", {"items": [dict(i, url="https://news.google.com/", note="", text="", topics=["federal reserve"], area="us", saved=i["at"]) for i in FILE]})


def n_of(outlet, about):
    """The [S#] the model would see for an outlet, for this question (coach.numbered ranks the file)."""
    return next(k for k, i in enumerate(coach.numbered(about), 1) if i["outlet"] == outlet)


def S(outlet, about):
    return f"[S{n_of(outlet, about)}]"


out = {}

# ---------- the 60-second answer: a strong one ----------
take = speech.new_take({"event": "drill", "limit": 60, "typed": True, "text": SAID, "prompt": Q})
llm.queue.append(json.dumps({
    "example": (f"Prices, for now. Congress gave the Fed two jobs, stable prices and maximum employment, and right now prices are the one "
                f"further from the goal. The jobs side is holding: Reuters reported on November 6 that Fed policymakers are weighing a rate hike "
                f"after a strong jobs report {S('Reuters', Q)}. NPR put a number on it that week: the economy added 165,000 jobs last month "
                f"{S('NPR', Q)}. When hiring is that steady, the bigger risk is prices that stay high and eat into every paycheck. The other side "
                f"says a hike could cost jobs, and that risk is real. But prices that run hot for a year are harder to bring down later, and they "
                f"hurt the same workers. So the Fed should care more about prices now, and keep reading the jobs report every month."),
    "notes": ["It answers in the first three words. Yours restated the question first, so the answer came about five seconds in.",
              "It names two sources out loud, outlet and date. Yours named Reuters without a date.",
              "It answers the other side in two sentences before the close, so the judge hears that you weighed it."],
    "kept": "Your answer, prices for now, and your point about the law: two goals, and which one is further off."}))
out["answer"] = run(api.post_coach_extemp_example({"kind": "answer", "take_id": take["id"], "question": Q}))

# ---------- openings: a strong one (the shoot script types these three) ----------
O = ["In 1979 a gallon of milk cost a dollar ten. Tonight the question is whether the Fed should fight prices or protect jobs.",
     "Ask anyone at a grocery store what worries them. Prices. So should the Fed care more about prices or jobs? Prices, for now.",
     "Jobs matter. Prices matter too. Today I will talk about the Fed and whether it should care about prices or about jobs."]
opens = [speech.new_take({"event": "opening", "limit": 45, "typed": True, "text": t, "prompt": Q}) for t in O]
llm.queue.append(json.dumps({
    "example": (f"This week the jobs news looked like good news. NPR reported that the economy added 165,000 jobs last month {S('NPR', Q)}. "
                f"Then Reuters reported that Fed policymakers are weighing a rate hike {S('Reuters', Q)}. Why raise rates when hiring is strong? "
                f"Because strong hiring is exactly when the Fed can afford to fight prices. So tonight's question: Should the Federal Reserve care "
                f"more about prices or about jobs right now? My answer is prices, for now. I will look at the Fed's two goals, why the job market "
                f"can take a hike, and the cost of waiting."),
    "notes": ["It opens on a real number from your file, like your milk price, but one that is about this question and this week.",
              "It gets from the number to the question in three short sentences, the fix the coach gave your first opening.",
              "It answers right after the question and previews three areas, as your second opening did."],
    "kept": "Your second opening's best move: the answer comes right after the question."}))
out["opening"] = run(api.post_coach_extemp_example({"kind": "opening", "take_ids": [t["id"] for t in opens], "best": 2, "question": Q}))

# ---------- prep: areas and evidence (harness.js home(): the prep round and its outline) ----------
PQ = "Should the Federal Reserve raise rates again before the end of the year?"
outline = {"attention": "The Fed held rates steady in October.", "link": "A strong jobs report since then has put another hike on the table.",
           "answer": "Yes, one small hike", "area1": "", "area2": "", "area3": "", "conclusion": "", "sources": ["f1"]}
r = extemp.new_round(PQ, "us")
store.write("extemp_round.json", dict(r, outline=outline))
about = PQ + " " + outline["answer"]
llm.queue.append(json.dumps({"areas": [
    {"title": "Hiring is strong enough to take a small hike", "why": "If the job market is adding workers, one small hike is unlikely to cost many jobs. That is why the answer can be yes.",
     "source": n_of("NPR", about), "use": "Say the number: \"The economy added 165,000 jobs last month.\""},
    {"title": "The Fed itself is weighing it", "why": "A hike is a live choice inside the Fed, not an outside demand, so the question is when, not whether.",
     "source": n_of("Reuters", about), "use": "Reuters says policymakers are considering a hike after the jobs report."},
    {"title": "Waiting has a cost too", "why": "Holding steady in October left prices where they were. The longer they run high, the bigger the hike needed later.",
     "source": n_of("National Review", about), "use": "National Review asks why the Fed did not raise rates: use it to name the other side and answer it."}],
    "note": ""}))
out["areas"] = run(api.post_coach_extemp_areas({"outline": outline}))
point = "hiring is still strong"
llm.queue.append(json.dumps({"picks": [
    {"source": n_of("NPR", point + " " + PQ), "how": "The clearest number in your file: 165,000 jobs added last month.", "stance": "supports"},
    {"source": n_of("Reuters", point + " " + PQ), "how": "It calls the jobs report strong, and says the Fed is reacting to it.", "stance": "supports"},
    {"source": n_of("National Review", point + " " + PQ), "how": "It is about why the Fed waited, not about jobs. Use it for the other side.", "stance": "context"}],
    "missing": ""}))
out["evidence"] = run(api.post_coach_extemp_evidence({"point": point}))

# ---------- Lincoln-Douglas: a block under Blocks (fixtures.js STATE: the de-extinction case) ----------
cid = run(api.get_state())["workbench"]["case"]["id"]
for k, v in {"Value": "Value\nMy value is morality, because the resolution asks whether an action is ethical.",
             "Criterion": "Criterion\nMy criterion is minimizing suffering. Suffering is the clearest measure of moral harm to living beings, and it lets the judge weigh real outcomes."}.items():
    run(api.post_case_edit(cid, {"section": {"key": k, "text": v}}))
run(api.post_case_edit(cid, {"resolution": "Resolved: De-extinction is unethical."}))
ATTACK = "Minimizing suffering cannot mean rejecting anything that risks causing suffering. Conservation involves risks already: captive breeding and moving animals cause suffering too."
llm.queue.append(json.dumps({"drafts": [{"label": "A/T: Conservation already risks suffering", "text": (
    "1. The comparison breaks down. Captive breeding risks suffering to save a species that is still alive; de-extinction creates suffering to bring back one that is gone.\n"
    "2. Their example proves my criterion. We accept those risks only when the harm prevented is larger, and they have not shown that for de-extinction. [find a card: how many attempts end in early death]\n"
    "3. Turn: if any risk is acceptable, their standard cannot tell the judge when to stop. Only minimizing suffering gives the round a clear test.")}],
    "note": "Read answer 1 first under time pressure: it is the shortest, and it breaks their comparison."}))
ld = run(api.post_coach_ld_suggest({"case_id": cid, "kind": "block", "section": "Blocks", "attack": ATTACK}))
out["ld_block"] = {k: ld[k] for k in ("kind", "drafts", "note", "target", "checks", "label", "section")}

# ---------- rhetoric: the critique, then three versions (the first figure on the list) ----------
LINE = "Prices pinch every paycheck, and patience will not cover the rent."
fig = api.R.FIGURES[0]["id"]
llm.queue.append("Partly. \"Prices pinch every paycheck\" is strong alliteration: three p words in a row that you can hear. "
                 "The second half drops the sound after \"patience\", so the line loses its drive. Try ending on a p word too.")
out["critique"] = run(api.post_rhetoric_critique({"figure": fig, "line": LINE}))
llm.queue.append(json.dumps({"versions": [
    {"line": "Prices pinch every paycheck, and patience pays no one's rent.", "note": "Keeps your words and puts a p word at the end, so the sound carries through."},
    {"line": "Every paycheck feels the pinch when prices keep climbing.", "note": "Pulls the p words closer together and ends on the picture."},
    {"line": "Prices pinch, paychecks shrink, and patience is a promise the rent cannot wait for.", "note": "Three short beats on p, then a longer close that lands the point."}]}))
out["versions"] = run(api.post_coach_rhetoric_versions({"figure": fig, "line": LINE}))
out["line"] = LINE

# ---------- ballots: show me (the 60-second ballot on the Fed question, and the LD round's ballot) ----------
ballots.add({"event": "drill", "answered": "partly", "points": 27.5, "question": Q, "take_id": take["id"], "at": 1762571000,
             "decisive": [{"line": "According to Reuters, Fed policymakers are weighing a rate hike after a strong jobs report", "effect": "One source named aloud, but with no date."}],
             "reason": "You named Reuters but gave no date.", "drill": {"name": "Source and date in one breath", "how": "Say five sources aloud as outlet, month and day."}})
llm.queue.append(json.dumps({"moment": "According to Reuters, Fed policymakers are weighing a rate hike after a strong jobs report",
                             "why": "You named Reuters but not the date, so the judge could not tell how current the news was. That is this ballot's drill.",
                             "redo": (f"Reuters reported on November 6 that Fed policymakers are weighing a rate hike after a strong jobs report {S('Reuters', Q)}. "
                                      f"That tells you hiring is holding up, so the Fed can afford to lean on prices."),
                             "practice": "Say the outlet, the date and the headline in one breath, five times, then put the line back into your answer."}))
out["show_drill"] = run(api.post_coach_ballot_show({"at": 1762571000}))

TWO_AR = "Two voting issues. First, framework: minimizing suffering. Second, the welfare contention was dropped in the NR. Vote affirmative."
store.write("round.json", {"round_no": 1, "phase": "ballot", "side": "aff", "level": "jv", "judge": "traditional", "resolution": "Resolved: De-extinction is unethical.",
                           "i": 7, "prep": 0, "transcript": [{"id": "2AR", "speaker": "student", "side": "aff", "text": TWO_AR}], "cx": {}, "flow": {}, "drafts": {},
                           "pending_ai": None, "ballots": []})
ballots.add({"event": "ld", "decision": "neg", "side": "aff", "round_no": 1, "at": 1762418400, "judge": "Traditional coach", "resolution": "Resolved: De-extinction is unethical.",
             "reason": "Your 2AR claim that welfare was dropped is not supported by the flow.",
             "decisive": [{"speech": "2AR", "line": "the welfare contention was dropped in the NR", "effect": "The NR answered it twice."}],
             "drills": [{"name": "Extend with the answer", "why": "w", "how": "Answer the NR's response before you extend."}]})
llm.queue.append(json.dumps({"moment": "Second, the welfare contention was dropped in the NR.",
                             "why": "The NR answered welfare twice, so calling it dropped cost you with this judge, who says the flow does not support it.",
                             "redo": ("Second, welfare. The NR says suffering only proves we should be careful. But under minimizing suffering, certain harm to animals "
                                      "outweighs benefits no one has shown, and the NR gave no example of a revived species that lived without that harm. Extend the "
                                      "bucardo: it lived only minutes. That is where every attempt starts, so vote affirmative."),
                             "practice": "Give this voting issue out loud three times in 45 seconds, answering the NR before you extend."}))
out["show_ld"] = run(api.post_coach_ballot_show({"at": 1762418400}))

# ---------- the chat ----------
llm.queue.append("Mostly. Your answer, prices for now, came in your second sentence, after you restated the question, so a judge hears it about "
                 f"five seconds in. Your three reasons were clear and in order: the law, the jobs side, the cost of waiting. You named Reuters {S('Reuters', Q)} "
                 "but not the date; say \"on November 6\". Try it again and start with your answer.")
out["chat_extemp"] = run(api.post_coach_chat({"floor": "extemp", "question": Q, "take_id": take["id"], "message": "Was my answer clear?"}))
out["chat_question"] = "Was my answer clear?"

dest = ROOT / "harness" / "fixtures_coach.js"
dest.write_text("// Written by harness/make_coach_fixtures.py: hand-written model answers put through the plugin's own coach checks.\n"
                f"export const COACH = {json.dumps(out, ensure_ascii=False, indent=1)}\n", encoding="utf-8")
print(dest)
for k, v in out.items():
    if isinstance(v, dict) and "checks" in v:
        print(k, v["checks"])

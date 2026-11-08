"""Write harness/fixtures02.js: the 0.2 screens' answers, built from the plugin's own code so the
numbers on screen are computed, not typed. Run: /usr/bin/python3 harness/make_fixtures.py [pull.json]

The headline pull is a real one captured through headlines.pull() (pass its JSON file); the take,
ballots and marks are practice data written for the harness. Nothing here is client material."""
import json
import math
import os
import random
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
os.environ["LDW_DATA_DIR"] = tempfile.mkdtemp(prefix="ldw-fixtures-")
sys.path.insert(0, str(ROOT))
import ballots as B  # noqa: E402
import extemp as E  # noqa: E402
import rhetoric_method as R  # noqa: E402
import speech as S  # noqa: E402

rng = random.Random(7)
# A low-partisan question for anything seeded or filmed (Damon, Nov 7, 2026). The Reuters line is a real
# headline from a pull on Nov 7, 2026 ("Fed policymakers consider rate hike after strong jobs report", Nov 6).
Q = "Should the Federal Reserve care more about prices or about jobs right now?"
SAID = ("Um, so the question is whether the Fed should care more about prices or about jobs right now. "
        "My answer is prices, for now. First, the law. Congress gave the Fed two goals, stable prices and maximum employment, "
        "so the real question is which one is further off. Second, the jobs side is holding up. According to Reuters, Fed policymakers "
        "are weighing a rate hike after a strong jobs report, which tells you hiring is not the emergency. Third, the cost of waiting. "
        "Prices that run hot for a year are, uh, harder to bring down, and they hurt the same workers the jobs goal is meant to protect. "
        "So the Fed should lean on prices now, and watch the jobs numbers every month.")


def levels_for(seconds, pauses):
    out = []
    for i in range(int(seconds * 10)):
        t = i / 10
        if t < 0.6 or any(a <= t < a + n for a, n in pauses):
            out.append(round(0.004 + rng.random() * 0.006, 3))
        else:
            out.append(round(min(1, 0.22 + 0.18 * math.sin(t * 2.3) ** 2 + rng.random() * 0.35), 3))
    return out


def words_for(text, start, end, pauses):
    toks = text.split()
    span = end - start - sum(n for _, n in pauses)
    step = span / len(toks)
    t, out = start, []
    for w in toks:
        for a, n in pauses:
            if a <= t < a + n:
                t = a + n
        out.append({"word": w, "start": round(t, 2), "end": round(t + step * 0.8, 2)})
        t += step
    return out


def drill_take():
    pauses = [(21.4, 2.6), (37.0, 2.2)]
    lv = levels_for(59.2, pauses) + [0.004] * 6
    words = words_for(SAID, 0.7, 58.6, pauses)
    take = {"id": "a1b2c3d4e5f6", "event": "drill", "segment": "answer", "limit": 60, "prompt": Q, "answer": "Prices, for now",
            "ref": "", "at": 1762570800, "duration": 59.8, "levels": lv, "typed": False, "file": "x.webm", "bytes": 240000, "mime": "audio/webm",
            "transcript": {"status": "done", "text": SAID, "words": words, "model": "base.en", "error": None}}
    take["stats"] = S.measure(take, take["transcript"], take["answer"])
    return S.public(take)


def extemp_ballot(take):
    b = B.tidy_extemp({"answered": "yes", "points": 27.5, "summary": "A clear answer with three areas, in time",
                       "decisive": [{"line": "My answer is prices, for now.", "effect": "The answer came in the first ten seconds, then every area returned to it."},
                                    {"line": "so the real question is which one is further off", "effect": "The strongest area: it turns a yes-or-no into a comparison a judge can weigh."},
                                    {"line": "According to Reuters, Fed policymakers are weighing a rate hike after a strong jobs report", "effect": "One source named aloud, but with no date."}],
                       "reason": ("You answered the question early and kept coming back to it, which is what a judge listens for in a one-minute answer. "
                                  "Your three areas were in a sensible order: what the law asks of the Fed, where the jobs side stands, and what waiting would cost. "
                                  "The first area was the best analysis, because it turned the question into a comparison you could win. The jobs area needed one more step: "
                                  "say what number would change your answer. You named Reuters but gave no date, so the judge cannot tell how current it is. "
                                  "Delivery was steady. Two long pauses came at the turns between areas, which reads as searching for the next point."),
                       "strengths": ["Answer in the first ten seconds", "Three areas, each a different reason"],
                       "drill": {"name": "Source and date in one breath", "how": "Say five sources from your file aloud as 'Outlet, month and day' until each takes under two seconds. Then answer again."},
                       "tags": ["undated-sources"]}, "drill")
    b["decisive"] = [dict(d, checked=R.find_span(SAID, d["line"]) is not None) for d in b["decisive"]]
    b["measured_tags"] = B.measured_tags(take["stats"], 60, "drill")
    b["measured"] = {k: take["stats"].get(k) for k in ("speaking", "wpm", "fillers", "answer_at", "duration")} | {
        "pauses": len(take["stats"]["pauses"]), "limit": 60, "typed": False, "transcript": True}
    b["sources_cited"] = [{"outlet": "Reuters", "at": None, "title": "Fed policymakers consider rate hike after strong jobs report"}]
    b.update({"question": Q, "take_id": take["id"], "at": 1762571000})
    return b


def history(latest):
    res = "Resolved: Civil disobedience in a democracy is morally justified."
    ld_rows = [(1, ["dropped-2ar", "no-voters"], "neg", 27.0), (2, ["framework-unweighed"], "aff", 28.0), (3, ["dropped-2ar", "framework-unweighed"], "neg", 27.5),
               (4, ["dropped-2ar"], "aff", 28.5), (5, ["no-clash", "dropped-2ar"], "neg", 27.0), (6, ["framework-unweighed"], "neg", 27.5)]
    out = []
    for n, tags, dec, pts in ld_rows:
        out.append({"event": "ld", "round_no": n, "decision": dec, "side": "aff", "judge": "Flow judge", "judge_key": "flow", "resolution": res,
                    "speaker_points": {"student": pts, "opponent": 28.0}, "tags": tags, "at": 1761900000 + n * 86400,
                    "measured_tags": ["pace-fast"] if n in (3, 5, 6) else [],
                    "drills": [{"name": "Answer-or-drop audit", "why": "The 2AR skipped the NR's turn.", "how": "Mark every NR answer on your flow, then redo the 2AR."}],
                    "drill_done": n < 4, "reason": "", "decisive": []})
    out.append({**latest, "event": "drill", "at": 1762400000, "tags": ["no-sources"], "measured_tags": ["late-answer"], "answered": "partly", "points": 26.5,
                "question": "Is a four-day school week good for rural districts?", "drill_done": False,
                "measured": {**latest["measured"], "answer_at": 31.0}})
    out.append({**latest, "event": "extemp", "at": 1762480000, "tags": ["undated-sources"], "measured_tags": ["late-answer"], "answered": "yes", "points": 27.0,
                "question": "Is the United Nations Security Council still able to stop a war?", "drill_done": False, "measured": {**latest["measured"], "limit": 420, "speaking": 401, "wpm": 158, "answer_at": 95.0}})
    out.append(latest)
    for i, b in enumerate(out):
        b["index"] = i
    return out


def marks():
    text = R.speech("lincoln-second-inaugural")["text"]
    found = [("Antithesis", "one of them would make war rather than let the nation survive; and the other would accept war rather than let it perish", "Two sides set against each other in matching words."),
             ("Parataxis", "And the war came.", "A short, flat clause after a long sentence lands like a door closing."),
             ("Isocolon", "Both read the same Bible, and pray to the same God", "Two clauses of the same build show the sides are alike."),
             ("Allusion", "let us judge not, that we be not judged", "A line from the Bible the audience knew by heart."),
             ("Hyperbaton", "Fondly do we hope—fervently do we pray", "The adverbs come first, which slows the line and stresses the feeling."),
             ("Alliteration", "Fondly do we hope—fervently do we pray", "Two f sounds tie the hope and the prayer together."),
             ("Exact number", "the bondman's two hundred and fifty years of unrequited toil", "A precise count makes the debt feel real."),
             ("Metonymy", "every drop of blood drawn with the lash shall be paid by another drawn with the sword", "The lash stands for slavery and the sword for war."),
             ("Anaphora", "With malice toward none; with charity for all; with firmness in the right", "Each phrase opens with the same word."),
             ("Tricolon", "With malice toward none; with charity for all; with firmness in the right", "Three phrases build to the call to finish the work."),
             ("Pathos", "to care for him who shall have borne the battle, and for his widow, and his orphan", "The soldier, the widow and the orphan make the cost personal."),
             ("Logos", "All knew that this interest was, somehow, the cause of the war.", "He states the cause plainly before drawing a conclusion."),
             ("Polysyndeton", "for his widow, and his orphan", "The extra joining word slows the list.")]
    kept, _ = R.check_marks(text, [{"figure": f, "quote": q, "why": w} for f, q, w in found])
    return {"marks": kept, "counts": R.counts(kept), "checked": True, "dropped": 0, "text": text}


def main():
    pull = json.load(open(sys.argv[1])) if len(sys.argv) > 1 else None
    take = drill_take()
    ballot = extemp_ballot(take)
    hist = history(ballot)
    for b in hist:
        b.setdefault("tags", [])
    home = {"settings": {"transcript_model": "base.en", "event": "extemp"}, "next_drill": B.next_drill(hist), "starter": E.STARTER,
            "transcripts": {"available": True, "model": "base.en", "models": list(S.MODELS), "cached": {m: False for m in S.MODELS}, "mb": dict(S.MODEL_MB)}, "recordings": {"count": 9, "bytes": 2100000, "keep": 20},
            "last_take": {}, "extemp_round": None, "ld_round": False, "ballots": len(hist), "patterns": B.patterns(hist), "file_count": 6}
    starter_take = dict(take, prompt=E.STARTER[0]["text"])
    data = {"HOME": home, "TAKE": starter_take, "BALLOT": dict(ballot, question=E.STARTER[0]["text"]), "PULL": pull,
            "RHETORIC": R.config(), "SPEECHES": {s["id"]: s for s in R.speeches()}, "MARKS": marks(),
            "BALLOTS": {"rounds_started": 6, "history": hist, "patterns": B.patterns(hist),
                        "tag_text": {**{k: v for g in B.JUDGE_TAGS.values() for k, v in g.items()}, **B.MEASURED_TAGS}},
            "SPOT": {"quote": "the only thing we have to fear is fear itself", "speech": {"id": "fdr-first-inaugural", "title": "First Inaugural Address", "speaker": "Franklin D. Roosevelt", "year": 1933},
                     "options": ["merism", "diacope", "isocolon", "hyperbole"], "answer": "diacope"},
            "OUTLETS": {"outlets": [dict(o, note=o.get("note", "")) for o in __import__("headlines").DEFAULT_OUTLETS]}}
    out = ROOT / "harness" / "fixtures02.js"
    out.write_text("// Generated by harness/make_fixtures.py from the plugin's own code. Do not edit by hand.\n"
                   + "".join(f"export const {k} = {json.dumps(v, ensure_ascii=False)}\n" for k, v in data.items()), encoding="utf-8")
    print(out, out.stat().st_size, "bytes; take stats:", {k: take["stats"].get(k) for k in ("speaking", "wpm", "fillers", "answer_at")}, "pauses", len(take["stats"]["pauses"]))


if __name__ == "__main__":
    main()

"""Every ballot kept, the fixed list of ballot tags, and the patterns counted across rounds.

A judge may only tag a ballot from the fixed list below, and the measured tags (pace, time, the late
answer, fillers, long pauses) are computed here from the recording's numbers, never by a model. So
"You drop arguments in the 2AR: 4 of 6 rounds" is a count in code, not a model's memory.

``ballots.json`` keeps 0.1's shape and adds to it: ``event`` (ld, extemp, drill, rhetoric), ``tags``,
``measured`` and ``drill_done``. A 0.1 ballot reads as event "ld" with no tags.
"""

from __future__ import annotations

import time

try:
    from . import store
except ImportError:  # loose module (tests)
    import store  # type: ignore

WINDOW = 6

# Tags a judge may write. The text is how the pattern reads to the student.
JUDGE_TAGS = {
    "ld": {
        "dropped-2ar": "You drop arguments in the 2AR",
        "dropped-1ar": "You drop arguments in the 1AR",
        "framework-unweighed": "You name your criterion but never weigh it",
        "no-voters": "You end without clear voting issues",
        "no-impacts": "Your arguments stop before the impact",
        "no-clash": "You defend your case but do not answer theirs",
        "cx-concession": "You give away too much in cross-examination",
        "thin-evidence": "Your evidence is thin or unsourced",
    },
    "extemp": {
        "no-answer": "You never give a clear answer",
        "thin-analysis": "Your analysis says what, not why",
        "two-areas": "You have fewer than three areas of analysis",
        "no-sources": "You name no sources aloud",
        "undated-sources": "You name sources without dates",
        "weak-intro": "Your introduction does not lead to the question",
        "no-conclusion": "You stop without a conclusion",
    },
}
JUDGE_TAGS["drill"] = JUDGE_TAGS["extemp"]
MEASURED_TAGS = {
    "pace-fast": "You speak faster than 175 words a minute",
    "pace-slow": "You speak slower than 115 words a minute",
    "overtime": "You go over time",
    "undertime": "You use less than three quarters of your time",
    "late-answer": "Your answer comes late",
    "fillers": "You use more than 4 fillers a minute",
    "long-pauses": "You pause for more than 2 seconds three or more times",
}
EVENT_NAMES = {"ld": "Lincoln-Douglas", "extemp": "Extemp", "drill": "60-second answer", "rhetoric": "Rhetoric"}


def allowed_tags(event):
    return set(JUDGE_TAGS.get(event, {}))


def tag_text(tag):
    for group in JUDGE_TAGS.values():
        if tag in group:
            return group[tag]
    return MEASURED_TAGS.get(tag, tag)


def judge_tags(event, tags):
    """Keep only tags on the fixed list for this event, in list order, once each."""
    ok = allowed_tags(event)
    out = []
    for t in tags if isinstance(tags, list) else []:
        if isinstance(t, str) and t in ok and t not in out:
            out.append(t)
    return out


def measured_tags(stats, limit, event):
    """Tags from the numbers alone. ``limit`` is the speech time in seconds (0 = untimed)."""
    s = stats or {}
    out = []
    wpm = s.get("wpm")
    if isinstance(wpm, (int, float)):
        if wpm > 175:
            out.append("pace-fast")
        elif wpm < 115:
            out.append("pace-slow")
    speaking = s.get("speaking") or 0
    if limit and speaking > limit + 5:
        out.append("overtime")
    elif limit >= 120 and speaking and speaking < limit * 0.75:
        out.append("undertime")
    ans = s.get("answer_at")
    if event in ("extemp", "drill") and isinstance(ans, (int, float)):
        late = 20 if limit and limit <= 90 else 60
        if ans > late:
            out.append("late-answer")
    fillers = s.get("fillers")
    if isinstance(fillers, int) and speaking >= 20 and fillers / (speaking / 60) > 4:
        out.append("fillers")
    if len(s.get("pauses") or []) >= 3:
        out.append("long-pauses")
    return out


def history():
    b = store.read("ballots.json")
    out = []
    for i, x in enumerate(b.get("history") or []):
        x = dict(x)
        x.setdefault("event", "ld")
        x.setdefault("tags", [])
        x.setdefault("measured", None)
        x.setdefault("drill_done", False)
        x["index"] = i
        out.append(x)
    return out


def add(ballot):
    ballot = dict(ballot)
    ballot.setdefault("at", int(time.time()))
    ballot.setdefault("drill_done", False)

    def archive(x):
        x["history"].append(ballot)
        del x["history"][:-store.HISTORY_CAP]
        return x
    store.update("ballots.json", archive)
    return ballot


def delete_all():
    """Every ballot, gone (Settings, Delete transcripts and ballots). The count of rounds started stays."""
    gone = []

    def clear(x):
        gone.extend(x.get("history") or [])
        x["history"] = []
        return x
    store.update("ballots.json", clear)
    return len(gone)


def set_drill_done(index, done, at=None):
    """Tick a ballot's drill. ``at`` (the ballot's time) pins the ballot: the list is trimmed to the newest
    40, so a page left open can hold an index that now points at a different ballot."""
    def edit(x):
        h = x.get("history") or []
        i = index
        if at is not None:
            if not (isinstance(i, int) and 0 <= i < len(h) and h[i].get("at") == at):
                i = next((k for k, b in enumerate(h) if b.get("at") == at), None)
        if not isinstance(i, int) or not 0 <= i < len(h):
            raise ValueError("That ballot is no longer kept.")
        h[i]["drill_done"] = bool(done)
        return x
    store.update("ballots.json", edit)
    return history()


def result_word(b):
    if b.get("event") == "ld":
        return "W" if b.get("decision") == b.get("side") else "L"
    return {"yes": "Answered", "partly": "Partly", "no": "Missed"}.get(b.get("answered"), "")


def patterns(items=None, window=WINDOW):
    """For each event, the tags written on two or more of the last ``window`` ballots.

    Each pattern: {tag, text, count, of, rounds: [{label, hit, result}]}, most frequent first.
    Extemp and the 60-second drill are counted together: the same skills."""
    items = history() if items is None else items
    groups = {"ld": [b for b in items if b.get("event", "ld") == "ld"],
              "extemp": [b for b in items if b.get("event") in ("extemp", "drill")]}
    out = {}
    for event, bs in groups.items():
        last = bs[-window:]
        counts = {}
        for b in last:
            for t in set((b.get("tags") or []) + (b.get("measured_tags") or [])):
                counts[t] = counts.get(t, 0) + 1
        rows = []
        for t, n in sorted(counts.items(), key=lambda kv: (-kv[1], kv[0])):
            if n < 2:
                continue
            rows.append({"tag": t, "text": tag_text(t), "count": n, "of": len(last), "measured": t in MEASURED_TAGS,
                         "rounds": [{"label": f"R{b.get('round_no') or i + 1}" if event == "ld" else f"#{i + 1}",
                                     "hit": t in (b.get("tags") or []) + (b.get("measured_tags") or []),
                                     "result": result_word(b)} for i, b in enumerate(last)]})
        out[event] = {"of": len(last), "patterns": rows}
    return out


def next_drill(items=None):
    """The drill to load on the floor first: the newest ballot whose drill is not done."""
    items = history() if items is None else items
    for b in reversed(items):
        if b.get("drill_done"):
            continue
        d = b.get("drill") or ((b.get("drills") or [None])[0])
        if isinstance(d, dict) and d.get("name"):
            return {"index": b["index"], "event": b.get("event", "ld"), "name": d["name"], "how": d.get("how", ""),
                    "segment": b.get("drill_segment")}
    return None


def tidy_extemp(b, event):
    """An extemp or drill ballot as the page may show it."""
    def s(v, n=2000):
        return str(v)[:n] if v is not None else ""
    try:
        pts = round(min(30.0, max(20.0, float(b.get("points")))), 1)
    except (TypeError, ValueError):
        pts = None
    answered = b.get("answered") if b.get("answered") in ("yes", "partly", "no") else None
    if answered is None:
        raise RuntimeError("The judge did not say whether you answered the question. Ask for the ballot again.")
    d = b.get("drill") if isinstance(b.get("drill"), dict) else {}
    return {
        "event": event, "answered": answered, "points": pts, "summary": s(b.get("summary"), 200),
        "decisive": [{"line": s(x.get("line"), 400), "effect": s(x.get("effect"), 400)}
                     for x in (b.get("decisive") or []) if isinstance(x, dict) and x.get("line")][:3],
        "reason": s(b.get("reason"), 4000),
        "strengths": [s(x, 400) for x in (b.get("strengths") or []) if x][:4] if isinstance(b.get("strengths"), list) else [],
        "drill": {"name": s(d.get("name"), 120), "how": s(d.get("how"), 600)} if d.get("name") else None,
        "tags": judge_tags(event, b.get("tags")),
    }

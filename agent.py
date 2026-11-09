"""The workbench inside the student's Hermes chats: ``/debate`` and two read-only agent tools.

- ``/debate`` (any chat): today's question, the one the Extemp floor would open on, and the top pattern
  counted across the last ballots ("You drop arguments in the 2AR: 4 of 6 rounds").
- ``debate_record`` (agent tool): how practice is going, as counts, tags, dates and question text.
- ``debate_today`` (agent tool): today's question and the name of the next drill.

What the agent may read, and why it is this little. A student's transcripts and a judge's written reasons are
a minor's own words and a model's prose about them. A Hermes chat can be a group chat on a messaging gateway,
and anything a tool returns can be quoted there. So nothing here returns text a student said or a judge
wrote: no transcript, no reason for decision, no quoted lines, no summary, no strengths, no drill steps.
Only numbers, the fixed tag list (``ballots.JUDGE_TAGS`` and ``ballots.MEASURED_TAGS``; a tag not on it is
dropped), dates, the fixed result words, the question or resolution text, and a drill's short name.

Nothing here writes. Every function reads ``ballots.json`` and ``questions.json`` only: never
``practice.json`` (takes and transcripts), ``round.json``, cases or the extemp file.

Unattended runs: both tools refuse inside a cron run (``ctx.current_cron_execution()``). Whether a call
comes from a group chat on a gateway is not something this plugin can tell (not verified against Hermes);
the counts-only output above is the real protection, and it holds in every kind of session.
"""

from __future__ import annotations

import json
import logging
import time

try:
    from . import ballots, extemp
except ImportError:  # loose modules (tests)
    import ballots  # type: ignore
    import extemp  # type: ignore

_log = logging.getLogger("hermes.plugins.ld-workbench")

TOOLSET = "debate"
QUESTION_CAP = 300
RECENT_CAP = 20
EVENT_KEYS = ("ld", "extemp", "drill", "rhetoric")
CRON_REFUSAL = ("Debate Workbench does not share a student's practice record in scheduled runs. "
                "Ask in a chat instead.")

TODAY_SCHEMA = {
    "name": "debate_today",
    "description": ("Debate Workbench: today's practice question (the one the Extemp floor opens on) and the name "
                    "of the next drill the student has not done. Read-only. Use it when the student asks what to "
                    "practice today."),
    "parameters": {"type": "object", "properties": {}, "additionalProperties": False},
}
RECORD_SCHEMA = {
    "name": "debate_record",
    "description": ("Debate Workbench: how the student's speech and debate practice is going. Read-only. Returns "
                    "counts (ballots per event, wins and losses, answered or not), the patterns counted across the "
                    "last 6 ballots of each event, and recent ballots as date, event, question, result, points and "
                    "tags. It never returns what the student said or what a judge wrote. Use it when the student "
                    "asks how they are doing in debate, what to work on, or whether they are improving."),
    "parameters": {
        "type": "object",
        "properties": {
            "event": {"type": "string", "enum": ["all", "ld", "extemp", "rhetoric"],
                      "description": "Which event to count. extemp includes 60-second answers. Default all."},
            "recent": {"type": "integer", "minimum": 0, "maximum": RECENT_CAP,
                       "description": "How many recent ballots to list, newest first. Default 8."},
        },
        "additionalProperties": False,
    },
}


# ---------- the safe fields ----------
def _known_tag(t):
    return isinstance(t, str) and (t in ballots.MEASURED_TAGS or any(t in g for g in ballots.JUDGE_TAGS.values()))


def _tags(b):
    out = []
    for t in list(b.get("tags") or []) + list(b.get("measured_tags") or []):
        if _known_tag(t) and t not in out:
            out.append(t)
    return out


def _day(t):
    try:
        lt = time.localtime(int(t))
    except (TypeError, ValueError, OverflowError, OSError):
        return None
    return time.strftime("%Y-%m-%d", lt)


def _question(b):
    q = b.get("question") or b.get("resolution") or ""
    q = " ".join(str(q).split())
    return q[:QUESTION_CAP] or None


def _points(b):
    raw = (b.get("speaker_points") or {}).get("student") if b.get("event", "ld") == "ld" else b.get("points")
    try:
        return round(min(30.0, max(20.0, float(raw))), 1)
    except (TypeError, ValueError):
        return None


def _result(b):
    """A fixed word, never prose: Won or Lost for Lincoln-Douglas, Answered, Partly or Missed for extemp."""
    if b.get("event", "ld") == "ld":
        if b.get("decision") not in ("aff", "neg"):
            return None
        return "Won" if b.get("decision") == b.get("side") else "Lost"
    return {"yes": "Answered", "partly": "Partly", "no": "Missed"}.get(b.get("answered"))


def _event(b):
    e = b.get("event", "ld")
    return e if e in EVENT_KEYS else None


def _safe_ballot(b):
    e = _event(b)
    return {
        "date": _day(b.get("at")),
        "event": ballots.EVENT_NAMES.get(e, e),
        "question": _question(b),
        "result": _result(b),
        "points": _points(b),
        "tags": [ballots.tag_text(t) for t in _tags(b)],
        "drill_done": bool(b.get("drill_done")),
    }


def _drill_name(d):
    name = " ".join(str((d or {}).get("name") or "").split())
    return name[:80] or None


# ---------- what the tools and the command return ----------
def today_question():
    """The question the Extemp floor opens on next visit. Reading it does not move the rotation."""
    qs = extemp.pool()
    if not qs:
        return None
    return " ".join(str(qs[extemp.pool_start() % len(qs)].get("text") or "").split())[:QUESTION_CAP] or None


def top_pattern(items=None):
    """The pattern counted on the most of its event's last ballots. None until a mark repeats."""
    pats = ballots.patterns(items)
    best = None
    for key, label in (("ld", "Lincoln-Douglas"), ("extemp", "Extemp")):
        for p in (pats.get(key) or {}).get("patterns") or []:
            if not _known_tag(p.get("tag")):
                continue
            rank = (p["count"], p["count"] / max(1, p["of"]))
            if best is None or rank > best[0]:
                best = (rank, {"event": label, "tag": p["tag"], "text": p["text"], "count": p["count"], "of": p["of"]})
    return best[1] if best else None


def today():
    hist = ballots.history()
    drill = ballots.next_drill(hist)
    return {
        "question": today_question(),
        "next_drill": {"name": _drill_name(drill), "event": ballots.EVENT_NAMES.get(drill["event"], drill["event"])}
        if drill and _drill_name(drill) else None,
    }


def record(event="all", recent=8):
    """Counts, tags, dates and question text. See the module note for what is left out and why."""
    if event not in ("all", "ld", "extemp", "rhetoric"):
        event = "all"
    try:
        recent = max(0, min(RECENT_CAP, int(recent)))
    except (TypeError, ValueError):
        recent = 8
    hist = ballots.history()
    want = {"all": set(EVENT_KEYS), "ld": {"ld"}, "extemp": {"extemp", "drill"}, "rhetoric": {"rhetoric"}}[event]
    mine = [b for b in hist if _event(b) in want]
    counts = {}
    for b in mine:
        name = ballots.EVENT_NAMES.get(_event(b))
        c = counts.setdefault(name, {"ballots": 0})
        c["ballots"] += 1
        r = _result(b)
        if r:
            c[r] = c.get(r, 0) + 1
    pats = ballots.patterns(hist)
    patterns = []
    for key, label in (("ld", "Lincoln-Douglas"), ("extemp", "Extemp and 60-second answers")):
        if key == "ld" and "ld" not in want or key == "extemp" and "extemp" not in want:
            continue
        g = pats.get(key) or {}
        for p in g.get("patterns") or []:
            if _known_tag(p.get("tag")):
                patterns.append({"event": label, "pattern": p["text"], "count": p["count"], "of": p["of"]})
    dates = [d for d in (_day(b.get("at")) for b in mine) if d]
    return {
        "about": ("Counted in code from the student's kept ballots. Counts, tags, dates and questions only: "
                  "the student's words and the judges' written reasons stay in the Debate page."),
        "ballots": len(mine),
        "first": min(dates) if dates else None,
        "last": max(dates) if dates else None,
        "by_event": counts,
        "patterns": patterns,
        "recent": [_safe_ballot(b) for b in reversed(mine)][:recent],
        "drills_done": sum(1 for b in mine if b.get("drill_done")),
    }


def slash(raw_args=""):
    """``/debate``: plain text, short enough for any chat."""
    q = today_question()
    p = top_pattern()
    lines = ["Debate Workbench", f"Today's question: {q}" if q else "Today's question: none yet. Add one on the Extemp floor."]
    if p:
        lines.append(f"Top pattern ({p['event']}): {p['text']}, {p['count']} of your last {p['of']} ballots.")
    else:
        lines.append("No pattern yet. One shows when the same mark lands on 2 of your last 6 ballots.")
    lines.append("Open the Debate page to answer it out loud.")
    return "\n".join(lines)


# ---------- the handlers Hermes calls ----------
def _in_cron(ctx):
    try:
        return ctx is not None and ctx.current_cron_execution() is not None
    except Exception:  # an older Hermes without the call: not a cron run we can see
        return False


def _reply(payload):
    return json.dumps(payload, ensure_ascii=False)


def make_handlers(ctx):
    """The two tool handlers, bound to the plugin context so each call can check for a cron run."""
    def debate_today(args=None, **_kw):
        if _in_cron(ctx):
            return _reply({"error": CRON_REFUSAL})
        try:
            return _reply(today())
        except Exception as e:
            _log.warning("ld-workbench: debate_today failed: %r", e)
            return _reply({"error": "Debate Workbench could not read today's question. Open the Debate page."})

    def debate_record(args=None, **_kw):
        if _in_cron(ctx):
            return _reply({"error": CRON_REFUSAL})
        args = args if isinstance(args, dict) else {}
        try:
            return _reply(record(args.get("event") or "all", args.get("recent", 8)))
        except Exception as e:
            _log.warning("ld-workbench: debate_record failed: %r", e)
            return _reply({"error": "Debate Workbench could not read the practice record. Open the Debate page."})

    return {"debate_today": debate_today, "debate_record": debate_record}


def slash_handler(raw_args=""):
    try:
        return slash(raw_args)
    except Exception as e:
        _log.warning("ld-workbench: /debate failed: %r", e)
        return "Debate Workbench could not read today's question. Open the Debate page."

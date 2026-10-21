"""The practice round as data: NSDA speech order, whose turn it is, prep time, and the moves allowed.

Pure functions over a plain dict, so the order rules are tested without a model or a server. The
backend refuses any move that is out of turn (a speech that is not the current one, ending a
cross-examination during a speech, redoing the opponent's speech).

Round dict: round_no, phase ("live", "judging", "ballot"), side (the student's), level, judge,
resolution, i (index of the current stop in ld_method.ROUND), prep (seconds left), transcript, cx
(stop id -> exchanges), flow (speech id -> points), drafts (speech id -> unfinished text),
pending_ai ({id, text} of an opponent speech written but not yet read), ballots.
"""

from __future__ import annotations

import time

try:
    from . import ld_method as M
except ImportError:  # loaded as a loose module
    import ld_method as M  # type: ignore

READ_SECTIONS = ["Resolution analysis", "Definitions", "Value", "Criterion", "Contention 1", "Contention 2", "Contention 3"]
SPEECH_LIMIT = 12000
CX_TURN_LIMIT = 1500
CX_TURNS = 40


def stops():
    return M.ROUND


def other(side):
    return "neg" if side == "aff" else "aff"


def speaker_of(stop, side):
    """Who speaks at this stop. For a cross-examination, stop['side'] is the side asking."""
    return "student" if stop["side"] == side else "ai"


def current(r):
    if not r or r.get("phase") != "live" or r["i"] >= len(stops()):
        return None
    return stops()[r["i"]]


def case_speech(case):
    """The constructive the student reads: the case sections in order, Blocks and Other material left out."""
    return "\n\n".join(case[k].strip() for k in READ_SECTIONS if (case.get(k) or "").strip())


def new_round(*, side, level, judge, resolution, case, round_no):
    if side not in ("aff", "neg"):
        raise ValueError("Unknown side.")
    if level not in M.LEVELS:
        raise ValueError("Unknown level.")
    if judge not in M.JUDGES:
        raise ValueError("Unknown judge.")
    if not (resolution or "").strip():
        raise ValueError("Enter the resolution first.")
    drafts = {}
    text = case_speech(case or {})
    if text:
        drafts["AC" if side == "aff" else "NC"] = text[:SPEECH_LIMIT]
    return {"round_no": round_no, "phase": "live", "side": side, "level": level, "judge": judge,
            "resolution": resolution.strip()[:400], "i": 0, "prep": M.PREP_MINUTES * 60, "transcript": [], "cx": {},
            "flow": {}, "drafts": drafts, "pending_ai": None, "ballots": [], "started_at": int(time.time())}


def _need(r, kind, speaker=None):
    stop = current(r)
    if stop is None:
        raise ValueError("The round is not waiting for that.")
    if stop["kind"] != kind or (speaker and speaker_of(stop, r["side"]) != speaker):
        raise ValueError("It is not that turn in the round.")
    return stop


def finish_speech(r, speech_id, speaker, text):
    stop = _need(r, "speech", speaker)
    if stop["id"] != speech_id:
        raise ValueError("That is not the current speech.")
    text = (text or "").strip()
    if not text:
        raise ValueError("Give your speech first." if speaker == "student" else "The opponent's speech is empty.")
    if len(text) > SPEECH_LIMIT:
        raise ValueError("That speech is too long.")
    r["transcript"].append({"id": stop["id"], "speaker": speaker, "side": stop["side"], "text": text})
    r["drafts"].pop(stop["id"], None)
    r["pending_ai"] = None
    r["i"] += 1
    if r["i"] >= len(stops()):
        r["phase"] = "judging"
    return r


def save_draft(r, speech_id, text):
    stop = current(r)
    if not stop or stop["id"] != speech_id or stop["kind"] != "speech" or speaker_of(stop, r["side"]) != "student":
        raise ValueError("That is not your current speech.")
    if len(text or "") > SPEECH_LIMIT:
        raise ValueError("That speech is too long.")
    r["drafts"][speech_id] = text or ""
    return r


def cx_add(r, who, question, text):
    stop = _need(r, "cx")
    text = (text or "").strip()
    if not text:
        raise ValueError("Type something first.")
    if len(text) > CX_TURN_LIMIT:
        raise ValueError("Keep it shorter. Cross-examination is one question or one answer at a time.")
    log = r["cx"].setdefault(stop["id"], [])
    if len(log) >= CX_TURNS:
        raise ValueError("This cross-examination is full. End it and move on.")
    log.append({"q": bool(question), "who": who, "text": text})
    return r


def end_cx(r):
    _need(r, "cx")
    r["i"] += 1
    return r


def cx_log(r):
    """The cross-examinations as the web app sent them to the model."""
    out = []
    for s in stops():
        turns = r.get("cx", {}).get(s["id"]) if s["kind"] == "cx" else None
        if turns:
            out.append(f"--- {s['id']} ({s['side'].upper()} asks) ---\n"
                       + "\n".join(f"{'Q' if t['q'] else 'A'} ({t['who'].upper()}): {t['text']}" for t in turns))
    return "\n\n".join(out)


def set_prep(r, seconds_left):
    """Prep only goes down."""
    if not isinstance(seconds_left, (int, float)):
        raise ValueError("Bad prep time.")
    r["prep"] = max(0, min(int(r["prep"]), int(seconds_left)))
    return r


def redo(r, speech_id, text):
    if r.get("phase") != "ballot":
        raise ValueError("Redo a speech after the ballot.")
    t = next((x for x in r["transcript"] if x["id"] == speech_id and x["speaker"] == "student"), None)
    if t is None:
        raise ValueError("You can only redo one of your own speeches.")
    text = (text or "").strip()
    if not text or len(text) > SPEECH_LIMIT:
        raise ValueError("Give the new version of your speech." if not text else "That speech is too long.")
    t["text"] = text
    r["flow"].pop(speech_id, None)
    return r


def add_ballot(r, ballot):
    r["ballots"].append(ballot)
    r["phase"] = "ballot"
    return r

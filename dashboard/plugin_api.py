"""Backend routes for Debate Workbench. Mounted by Hermes at /api/plugins/ld-workbench/.

The page (desktop/plugin.js) reaches these through ctx.rest. Every model call runs here, through
Hermes's plugin LLM facade (``PluginLlm(plugin_id="ld-workbench")``), so it uses the user's own model
and keys. The prompts never leave the backend: the page sends only the student's words and choices,
and every payload passes the web app's ``clean()`` before a model sees it.

Hermes wraps each request to this router in the requesting profile's settings scope
(web_server_dashboard._plugin_route_secret_scope), so the facade resolves that profile's model.
"""

from __future__ import annotations

import asyncio
import importlib.util
import json
import logging
import sys
import time
from pathlib import Path

from fastapi import APIRouter, HTTPException


def _load_package():
    """Load the parent plugin as a package; dashboard APIs are imported as loose files."""
    package_name = "ld_workbench_dashboard_package"
    if package_name not in sys.modules:
        root = Path(__file__).resolve().parents[1]
        spec = importlib.util.spec_from_file_location(package_name, root / "__init__.py",
                                                      submodule_search_locations=[str(root)])
        if spec is None or spec.loader is None:
            raise RuntimeError("Could not load the Debate Workbench package")
        package = importlib.util.module_from_spec(spec)
        sys.modules[package_name] = package
        spec.loader.exec_module(package)
    from importlib import import_module
    return tuple(import_module(f"{package_name}.{m}") for m in
                 ("engine", "store", "room", "ld_method", "library", "speech", "headlines", "extemp", "ballots", "rhetoric_method"))


engine, store, room, M, library, speech, headlines, extemp, ballots, R = _load_package()
_log = logging.getLogger("hermes.plugins.ld-workbench")

MODEL = engine.Model()  # PluginLlm is created on first use, inside Hermes
router = APIRouter()

SECTIONS = list(M.IMPORT_SECTIONS)  # the workbench's sections, in order
SIDES = ("aff", "neg")
_tasks: set = set()
_inflight: dict = {}


def _fail(e):
    if isinstance(e, HTTPException):
        raise e
    if isinstance(e, ValueError):
        raise HTTPException(status_code=400, detail=str(e) or "Bad request.")
    if isinstance(e, RuntimeError):  # our own plain-English failures
        raise HTTPException(status_code=502, detail=str(e))
    _log.exception("ld-workbench: unexpected error")
    raise HTTPException(status_code=500, detail="Something went wrong on our end. Try again.")


def _body(body):
    if not isinstance(body, dict):
        raise ValueError("Bad request.")
    return body


# ---------- reading ----------
def _active():
    """The open case. The library always has at least one case; a fresh install gets a blank one."""
    w = store.read("workbench.json")
    cid = w.get("active")
    try:
        if cid:
            return library.get(cid)
    except (ValueError, RuntimeError):
        pass
    cases = library.list_cases()
    c = library.get(cases[0]["id"]) if cases else library.create(resolution=M.CURRENT_RESOLUTION["text"], side="aff")
    store.update("workbench.json", lambda x: (x.__setitem__("active", c["id"]), x)[1])
    return c


def _workbench():
    c = _active()
    return {"case": c, "cases": library.list_cases(), "source": store.read("workbench.json").get("source")}


def _history_view(b):
    hist = b.get("history") or []
    return {"rounds_started": b.get("rounds_started", 0), "count": len(hist), "last": hist[-1] if hist else None}


@router.get("/config")
async def get_config():
    return engine.config() | {"sections": SECTIONS}


@router.get("/state")
async def get_state():
    try:
        return {"workbench": _workbench(), "round": store.read("round.json"), "history": _history_view(store.read("ballots.json"))}
    except Exception as e:
        _fail(e)


@router.get("/ballots")
async def get_ballots():
    """Every ballot kept (0.1's keys, plus event, tags and measured numbers) and the patterns across them."""
    try:
        b = store.read("ballots.json")
        return {"rounds_started": b.get("rounds_started", 0), "history": ballots.history(), "patterns": ballots.patterns(),
                "tag_text": {**{k: v for g in ballots.JUDGE_TAGS.values() for k, v in g.items()}, **ballots.MEASURED_TAGS}}
    except Exception as e:
        _fail(e)


# ---------- the case library ----------
def _open(case_id):
    library.get(case_id)  # must exist
    store.update("workbench.json", lambda w: (w.__setitem__("active", case_id), w)[1])


@router.post("/cases")
async def post_case_create(body: dict):
    """A new blank case, opened. It starts with the open case's resolution unless one is given."""
    try:
        b = _body(body)
        res = b.get("resolution")
        if res is None:
            res = _active().get("resolution") or M.CURRENT_RESOLUTION["text"]
        c = library.create(name=b.get("name") or "", resolution=res, side=engine._pick(b.get("side"), SIDES, "side", "aff"))
        _open(c["id"])
        return _workbench()
    except Exception as e:
        _fail(e)


@router.post("/cases/{case_id}/open")
async def post_case_open(case_id: str):
    try:
        _open(case_id)
        return _workbench()
    except Exception as e:
        _fail(e)


@router.post("/cases/{case_id}/duplicate")
async def post_case_duplicate(case_id: str):
    try:
        c = library.duplicate(case_id)
        _open(c["id"])
        return _workbench()
    except Exception as e:
        _fail(e)


@router.post("/cases/{case_id}/delete")
async def post_case_delete(case_id: str):
    """Delete a case for good. The page asks the student to confirm first."""
    try:
        library.delete(case_id)
        if store.read("workbench.json").get("active") == case_id:
            store.update("workbench.json", lambda w: (w.__setitem__("active", None), w)[1])
        return _workbench()
    except Exception as e:
        _fail(e)


@router.post("/cases/{case_id}")
async def post_case_edit(case_id: str, body: dict):
    """Small edits to one case: name, resolution, side, one section, hiding a helper, clearing the thread."""
    try:
        b = _body(body)

        def edit(c):
            if "name" in b:
                c["name"] = library._name(b["name"], c["name"])
            if "resolution" in b:
                c["resolution"] = library._resolution(b["resolution"])
            if "side" in b:
                c["side"] = engine._pick(b["side"], SIDES, "side")
            if "section" in b:
                sec = b["section"] if isinstance(b["section"], dict) else {}
                c["sections"][engine._pick(sec.get("key"), SECTIONS, "section")] = engine._s(sec.get("text"), 12000, "A case section")
            if "hide_helper" in b:
                c["helpers"].pop(engine._pick(b["hide_helper"], SECTIONS, "section"), None)
            if b.get("clear_thread"):
                c["thread"] = []
        library.change(case_id, edit)
        return _workbench()
    except Exception as e:
        _fail(e)


@router.post("/cases/{case_id}/export")
async def post_case_export(case_id: str, body: dict):
    """Write the case as .docx or .txt where the student chose (or into the plugin's exports folder)."""
    try:
        b = _body(body)
        path = library.export(case_id, b.get("format"), b.get("path") or None)
        return {"path": str(path), "name": path.name}
    except Exception as e:
        _fail(e)


@router.post("/backup/export")
async def post_backup_export(body: dict):
    try:
        path = library.export_backup(_body(body).get("path") or None)
        return {"path": str(path), "name": path.name, "cases": len(library.list_cases())}
    except Exception as e:
        _fail(e)


@router.post("/backup/import")
async def post_backup_import(body: dict):
    """Add every case from a backup file's contents (sent as text by the page). Nothing is overwritten."""
    try:
        text = engine._s(_body(body).get("text"), 20_000_000, "Backup")
        try:
            data = json.loads(text)
        except ValueError:
            raise ValueError("That file is not a Debate Workbench backup.")
        added = library.import_backup(data)
        return {"added": added} | _workbench()
    except Exception as e:
        _fail(e)


# ---------- coaching, import, topic source ----------
@router.post("/workbench")
async def post_workbench(body: dict):
    """The topic source: pasted text, or null to remove it."""
    try:
        b = _body(body)

        def change(w):
            src = b.get("source")
            if src is None:
                w["source"] = None
            else:
                if not isinstance(src, dict):
                    raise ValueError("Bad source.")
                text = engine._s(src.get("text"), 30000, "Source text").strip()
                if len(text.split()) < 20:
                    raise ValueError("Paste a bit more text than that.")
                w["source"] = {"title": engine._s(src.get("title"), 200, "Source title") or "Pasted text", "url": "", "text": text}
            return w
        store.update("workbench.json", change)
        return _workbench()
    except Exception as e:
        _fail(e)


@router.post("/tool")
async def post_tool(body: dict):
    """Run one coaching tool on a case as it stands. The answer joins that case's coach thread and, for a
    section helper, shows under that section."""
    try:
        b = _body(body)
        case_id = b.get("case_id")
        tool = engine._pick(b.get("tool"), M.TOOLS, "tool")
        key = b.get("section") or None
        if key is not None:
            engine._pick(key, SECTIONS, "section")
        under = bool(b.get("under_section")) and key is not None
        message = engine._s(b.get("message"), 4000, "Message").strip()
        if isinstance(b.get("sections"), dict):  # the page's latest words win, then the run reads them back
            secs = library._sections(b["sections"])
            library.change(case_id, lambda c: c.__setitem__("sections", secs))
        c = library.get(case_id)
        thread = [{"role": t.get("role"), "text": (t.get("text") or "")[:4000]} for t in c["thread"]]
        p = engine.clean({"tool": tool, "side": c["side"], "section": key or "", "message": message, "case": c["sections"],
                          "thread": thread, "source": store.read("workbench.json").get("source"), "resolution": c["resolution"]})
        result = await engine.run_tool(p, MODEL)
        label = M.TOOLS[tool]["label"]

        def record(c):
            th = c["thread"]
            if message:
                th.append({"role": "you", "text": message})
            th.append({"role": "coach", "label": label + (f" · {key}" if under else ""), "text": result["text"],
                       "section": key if under else None, "tool": tool})
            del th[:-store.THREAD_CAP]
            if under:
                c["helpers"][key] = {"label": label, "tool": tool, "text": result["text"]}
        library.change(case_id, record)
        return {"text": result["text"]} | _workbench()
    except Exception as e:
        _fail(e)


@router.post("/import")
async def post_import(body: dict):
    """Sort a pasted or uploaded case into sections without changing a word. Nothing is saved until /import/apply."""
    try:
        b = _body(body)
        p = engine.clean({"action": "import", "text": b.get("text"), "docx": b.get("docx")})
        return await engine.run_import(p, MODEL)
    except Exception as e:
        _fail(e)


@router.post("/import/apply")
async def post_import_apply(body: dict):
    """Put a sorted case into the open case (keeping the old words to bring back) or into a new case."""
    try:
        b = _body(body)
        side = engine._pick(b.get("side"), SIDES, "side")
        sections = library._sections(b.get("sections") or {})
        if not sections:
            raise ValueError("Bad case.")
        if b.get("as_new"):
            c = library.create(name=b.get("name") or "", resolution=_active().get("resolution") or "", side=side, sections=sections)
            _open(c["id"])
            return _workbench()

        def apply(c):
            if any((v or "").strip() for v in c["sections"].values()):
                c["backup"] = dict(c["sections"])
            c["sections"] = sections
            c["helpers"] = {}
            c["side"] = side
        library.change(b.get("case_id"), apply)
        return _workbench()
    except Exception as e:
        _fail(e)


@router.post("/import/restore")
async def post_import_restore(body: dict):
    try:
        def restore(c):
            if not c.get("backup"):
                raise ValueError("There is no earlier version to bring back.")
            c["sections"], c["backup"], c["helpers"] = c["backup"], None, {}
        library.change(_body(body).get("case_id"), restore)
        return _workbench()
    except Exception as e:
        _fail(e)


@router.post("/source/read")
async def post_source_read(body: dict):
    """Read a public web page as the topic source (the web app's pinned-IP, public-only reader)."""
    try:
        p = engine.clean({"action": "source", "url": _body(body).get("url")})
        src = await engine.run_source_async(p)
        store.update("workbench.json", lambda w: (w.__setitem__("source", src), w)[1])
        return _workbench()
    except Exception as e:
        _fail(e)


# ---------- topic briefing ----------
@router.post("/briefing")
async def post_briefing(body: dict):
    """The topic briefing for a resolution (and the topic source, if any).

    mode "open" (default): a saved briefing if there is one, otherwise a new one.
    mode "auto": only when this resolution has no briefing yet; otherwise {"skipped": true}.
    mode "check": no model call; {"known": true|false} says whether a briefing is saved.
    mode "redo": always a new one."""
    try:
        b = _body(body)
        mode = engine._pick(b.get("mode"), ("open", "auto", "check", "redo"), "mode", "open")
        res = b.get("resolution")
        if res is None:
            res = _active().get("resolution") or ""
        source = store.read("workbench.json").get("source")
        p = engine.clean({"action": "briefing", "resolution": res, "source": source})
        if len(p["resolution"].split()) < 3:
            raise ValueError("Enter the resolution first.")
        key = engine.briefing_key(p["resolution"], p.get("source"))
        saved = store.read("briefings.json")["items"].get(key)
        if mode == "check":
            return {"known": bool(saved), "resolution": p["resolution"]}
        if saved and mode != "redo":
            return {"skipped": True, "resolution": p["resolution"]} if mode == "auto" else \
                {"text": saved["text"], "cached": True, "resolution": p["resolution"]}
        out = await _once(("briefing", key), lambda: engine.run_briefing(p, MODEL))

        def keep(x):
            x["items"][key] = {"text": out["text"], "at": time.time(), "resolution": p["resolution"]}
            for old in sorted(x["items"], key=lambda k: x["items"][k].get("at", 0))[:-store.BRIEFING_CAP]:
                del x["items"][old]
            return x
        store.update("briefings.json", keep)
        return {"text": out["text"], "cached": False, "resolution": p["resolution"]}
    except Exception as e:
        _fail(e)


# ---------- fallacies ----------
@router.post("/drill")
async def post_drill():
    """One practice item: an argument and its answer (a fallacy from the guide, or "None")."""
    try:
        return await engine.run_drill(engine.clean({"action": "drill"}), MODEL)
    except Exception as e:
        _fail(e)


@router.post("/spot")
async def post_spot(body: dict):
    """Find the fallacies in pasted text, or in one of the opponent's speeches in the current round
    (the answer is kept with the round so it is still there after a reload)."""
    try:
        b = _body(body)
        sid = b.get("speech_id")
        if sid is not None:
            sid = engine._pick(sid, engine.SPEECH_IDS, "speech")
            r = _round_or_fail()
            t = next((x for x in r["transcript"] if x["id"] == sid and x["speaker"] == "ai"), None)
            pend = r.get("pending_ai") or {}
            text = t["text"] if t else pend.get("text") if pend.get("id") == sid else None
            if not text:
                raise ValueError("That is not one of the opponent's speeches.")
            out = await engine.run_spot(text, r["resolution"], MODEL)
            _save_round(lambda x: (x.setdefault("spots", {}).__setitem__(sid, out["text"]), x)[1])
            return {"text": out["text"], "speech_id": sid}
        text = engine._s(b.get("text"), engine.SPOT_LIMIT, "Text")
        return await engine.run_spot(text, _active().get("resolution") or "", MODEL)
    except Exception as e:
        _fail(e)


# ---------- the practice round ----------
def _round_or_fail():
    r = store.read("round.json")
    if not r:
        raise ValueError("Start a round first.")
    return r


def _payload(r, **extra):
    """The round as the web app sent it to the model, through clean()."""
    return engine.clean({"resolution": r["resolution"], "student_side": r["side"], "level": r["level"],
                         "transcript": r["transcript"], "cx_log": room.cx_log(r), **extra})


def _save_round(fn):
    def change(r):
        if not r:
            raise ValueError("Start a round first.")
        return fn(r)
    return store.update("round.json", change)


def _flow_later(round_no, speech_id, text):
    """Flow a speech in the background; the page picks the points up on its next read."""
    async def job():
        try:
            p = engine.clean({"action": "flow", "speech_id": speech_id, "text": text})
            pts = (await engine.run_flow(p, MODEL))["points"]

            def put(r):
                if r and r.get("round_no") == round_no:
                    r["flow"][speech_id] = pts
                return r
            store.update("round.json", put)
        except Exception as e:  # the flow is a convenience; a miss never breaks the round
            _log.info("ld-workbench: flow for %s failed: %r", speech_id, e)
    task = asyncio.get_running_loop().create_task(job())
    _tasks.add(task)
    task.add_done_callback(_tasks.discard)


async def _once(key, make):
    """Share one model call between double clicks."""
    fut = _inflight.get(key)
    if fut is None:
        fut = asyncio.ensure_future(make())
        _inflight[key] = fut
        fut.add_done_callback(lambda _f: _inflight.pop(key, None))
    return await asyncio.shield(fut)


@router.post("/round/start")
async def post_round_start(body: dict):
    """Start a round with a case from the library: its side, its resolution, its words as the constructive."""
    try:
        b = _body(body)
        c = library.get(b.get("case_id") or _active()["id"])
        level = engine._pick(b.get("level"), M.LEVELS, "level", "jv")
        judge = engine._pick(b.get("judge"), M.JUDGES, "judge", "traditional")
        if not (c.get("resolution") or "").strip():
            raise ValueError("Give this case a resolution first.")
        books = store.update("ballots.json", lambda x: (x.__setitem__("rounds_started", int(x.get("rounds_started", 0)) + 1), x)[1])
        r = room.new_round(side=c["side"], level=level, judge=judge, resolution=c["resolution"], case=c["sections"],
                           round_no=books["rounds_started"])
        r["case_id"], r["case_name"] = c["id"], c["name"]
        store.write("round.json", r)
        return r
    except Exception as e:
        _fail(e)


@router.post("/round/new")
async def post_round_new():
    store.write("round.json", None)
    return None


@router.post("/round/draft")
async def post_round_draft(body: dict):
    try:
        b = _body(body)
        return _save_round(lambda r: room.save_draft(r, engine._pick(b.get("speech_id"), engine.SPEECH_IDS, "speech"),
                                                     engine._s(b.get("text"), room.SPEECH_LIMIT, "Speech")))
    except Exception as e:
        _fail(e)


@router.post("/round/prep")
async def post_round_prep(body: dict):
    try:
        left = _body(body).get("left")
        return _save_round(lambda r: room.set_prep(r, left))
    except Exception as e:
        _fail(e)


@router.post("/round/speech")
async def post_round_speech(body: dict):
    """The student finishes their speech."""
    try:
        b = _body(body)
        sid = engine._pick(b.get("speech_id"), engine.SPEECH_IDS, "speech")
        text = engine._s(b.get("text"), room.SPEECH_LIMIT, "Speech")
        take_id = b.get("take_id")
        stats = speech.get_take(take_id).get("stats") if isinstance(take_id, str) and take_id else None

        def finish(r):
            r = room.finish_speech(r, sid, "student", text)
            if stats:
                r.setdefault("spoken", {})[sid] = {k: stats.get(k) for k in ("speaking", "wpm", "fillers", "pauses", "duration")} | {"take": take_id}
            return r
        r = _save_round(finish)
        _flow_later(r["round_no"], sid, r["transcript"][-1]["text"])
        return r
    except Exception as e:
        _fail(e)


@router.post("/round/opponent")
async def post_round_opponent():
    """Write the opponent's current speech, once; a second call returns the same speech."""
    try:
        r = _round_or_fail()
        stop = room.current(r)
        if not stop or stop["kind"] != "speech" or room.speaker_of(stop, r["side"]) != "ai":
            raise ValueError("It is not the opponent's speech.")
        if r.get("pending_ai") and r["pending_ai"].get("id") == stop["id"]:
            return r

        async def make():
            return (await engine.run_speech(_payload(r, action="speech", speech_id=stop["id"]), MODEL))["text"]
        text = await _once((r["round_no"], stop["id"]), make)

        def keep(x):
            if room.current(x) and room.current(x)["id"] == stop["id"]:
                x["pending_ai"] = {"id": stop["id"], "text": text[:room.SPEECH_LIMIT]}
            return x
        return _save_round(keep)
    except Exception as e:
        _fail(e)


@router.post("/round/opponent/done")
async def post_round_opponent_done():
    """The student has read the opponent's speech; move on."""
    try:
        r = _round_or_fail()
        pend = r.get("pending_ai") or {}
        stop = room.current(r)
        if not stop or pend.get("id") != stop["id"]:
            raise ValueError("The opponent has not given that speech yet.")
        r = _save_round(lambda x: room.finish_speech(x, stop["id"], "ai", pend["text"]))
        _flow_later(r["round_no"], stop["id"], pend["text"])
        return r
    except Exception as e:
        _fail(e)


@router.post("/round/cx")
async def post_round_cx(body: dict):
    """One cross-examination exchange. When the student asks, the opponent answers. When the opponent
    asks, the student's answer (if any) is recorded, then the opponent asks the next question."""
    try:
        b = _body(body)
        r = _round_or_fail()
        stop = room.current(r)
        if not stop or stop["kind"] != "cx":
            raise ValueError("It is not cross-examination.")
        opp = room.other(r["side"])
        text = engine._s(b.get("text"), room.CX_TURN_LIMIT, "Your words").strip()
        student_asks = room.speaker_of(stop, r["side"]) == "student"
        if student_asks:
            r = _save_round(lambda x: room.cx_add(x, x["side"], True, text))
            ans = await engine.run_cx(_payload(r, action="cx", mode="answer", question=text), MODEL)
            return _save_round(lambda x: room.cx_add(x, opp, False, ans["text"][:room.CX_TURN_LIMIT]))
        if text:
            r = _save_round(lambda x: room.cx_add(x, x["side"], False, text))
        q = await engine.run_cx(_payload(r, action="cx", mode="ask"), MODEL)
        return _save_round(lambda x: room.cx_add(x, opp, True, q["text"][:room.CX_TURN_LIMIT]))
    except Exception as e:
        _fail(e)


@router.post("/round/cx/end")
async def post_round_cx_end():
    try:
        return _save_round(room.end_cx)
    except Exception as e:
        _fail(e)


@router.post("/round/judge")
async def post_round_judge(body: dict):
    """Write a ballot for the finished round: the round's judge, or another one the student asks for."""
    try:
        b = _body(body or {})
        r = _round_or_fail()
        if r.get("phase") not in ("judging", "ballot"):
            raise ValueError("Finish the round first.")
        judge = engine._pick(b.get("judge"), M.JUDGES, "judge", r["judge"])
        ballot = engine.tidy_ballot(await engine.run_judge(_payload(r, action="judge", judge=judge), MODEL))
        ballot["at"] = int(time.time())
        ballot["round_no"] = r["round_no"]
        ballot["side"] = r["side"]
        ballot["resolution"] = r["resolution"]
        spoken = {k: v for k, v in (r.get("spoken") or {}).items() if isinstance(v, dict)}
        if spoken:  # measured tags from every speech the student recorded in this round
            tags = set()
            for sid, st in spoken.items():
                stop = next((s for s in room.stops() if s["id"] == sid), None)
                tags.update(ballots.measured_tags(st, (stop or {}).get("minutes", 0) * 60, "ld"))
            ballot["measured_tags"] = sorted(tags)
            ballot["measured"] = spoken
        r = _save_round(lambda x: room.add_ballot(x, ballot))
        ballots.add(ballot)
        return r
    except Exception as e:
        _fail(e)


@router.post("/round/redo")
async def post_round_redo(body: dict):
    """Replace one of the student's speeches; the page then asks the same judge again."""
    try:
        b = _body(body)
        sid = engine._pick(b.get("speech_id"), engine.SPEECH_IDS, "speech")
        r = _save_round(lambda x: room.redo(x, sid, engine._s(b.get("text"), room.SPEECH_LIMIT, "Speech")))
        _flow_later(r["round_no"], sid, next(t["text"] for t in r["transcript"] if t["id"] == sid))
        return r
    except Exception as e:
        _fail(e)


# ================================================================== 0.2 ==
# The floor, spoken takes, headlines, the extemp file and round, rhetoric, and the Ballots view.

def _q(v, n=200):
    return " ".join(str(v or "").split())[:n]


@router.get("/home")
async def get_home():
    """What the floor needs on open: the event last chosen, the next drill, the starter question,
    whether transcripts can be made, and the round in progress for each event."""
    try:
        st = store.read("settings.json")
        takes = store.read("practice.json")["takes"]
        last = {}
        for t in reversed(takes):
            last.setdefault(t["event"], speech.public(t))
        hist = ballots.history()
        return {"settings": st, "next_drill": ballots.next_drill(hist), "starter": extemp.STARTER,
                "transcripts": {"available": speech.TRANSCRIBER.available(), "model": st.get("transcript_model") or speech.DEFAULT_MODEL,
                                "models": list(speech.MODELS)},
                "recordings": speech.recordings_summary(), "last_take": last, "extemp_round": store.read("extemp_round.json"),
                "ld_round": store.read("round.json") is not None, "ballots": len(hist),
                "patterns": ballots.patterns(hist), "file_count": len(extemp.file_items())}
    except Exception as e:
        _fail(e)


@router.post("/settings")
async def post_settings(body: dict):
    try:
        b = _body(body)

        def change(st):
            if "event" in b:
                st["event"] = engine._pick(b["event"], ("ld", "extemp", "rhetoric", "ballots"), "event")
            if "transcript_model" in b:
                st["transcript_model"] = engine._pick(b["transcript_model"], speech.MODELS, "model")
            return st
        return store.update("settings.json", change)
    except Exception as e:
        _fail(e)


# ---------- spoken takes ----------
@router.post("/speech/take")
async def post_take(body: dict):
    """A take's facts (event, time limit, real duration, levels at 10 Hz) before its audio arrives.
    A typed take (no microphone) carries its text and is timed as an estimate."""
    try:
        return speech.public(speech.new_take(_body(body)))
    except Exception as e:
        _fail(e)


def _model_name():
    return store.read("settings.json").get("transcript_model") or speech.DEFAULT_MODEL


@router.post("/speech/{take_id}/audio")
async def post_take_audio(take_id: str, body: dict):
    """The recording as base64 in JSON (works on every Hermes); transcription starts at once."""
    try:
        b = _body(body)
        speech.save_audio_b64(take_id, b.get("b64"), b.get("mime"))
        return speech.public(speech.TRANSCRIBER.start(take_id, _model_name()))
    except Exception as e:
        _fail(e)


def _multipart_ok():
    try:
        return importlib.util.find_spec("python_multipart") is not None or importlib.util.find_spec("multipart") is not None
    except (ImportError, ValueError):
        return False


try:
    from fastapi import File, UploadFile  # noqa: E402
except ImportError:  # the test stand-in
    File = UploadFile = None

if File is not None and _multipart_ok():
    @router.post("/speech/{take_id}/upload")
    async def post_take_upload(take_id: str, file: UploadFile = File(...)):
        """The recording through ctx.rest's single-file upload. Capped at 30 MB by the plugin itself."""
        try:
            data = await file.read(speech.UPLOAD_CAP + 1)
            speech.save_audio(take_id, data, file.content_type or "audio/webm")
            return speech.public(speech.TRANSCRIBER.start(take_id, _model_name()))
        except Exception as e:
            _fail(e)
        finally:
            await file.close()


@router.get("/speech/{take_id}")
async def get_take(take_id: str):
    try:
        return speech.public(speech.get_take(take_id))
    except Exception as e:
        _fail(e)


@router.get("/speech/{take_id}/audio")
async def get_take_audio(take_id: str):
    """The recording as base64, for playback on the page (ctx.rest answers JSON only)."""
    try:
        t = speech.get_take(take_id)
        p = speech.audio_path(t)
        if not p:
            raise ValueError("The recording for this take was not kept.")
        import base64
        return {"b64": base64.b64encode(p.read_bytes()).decode("ascii"), "mime": t.get("mime") or "audio/webm"}
    except Exception as e:
        _fail(e)


@router.post("/speech/{take_id}/transcribe")
async def post_take_transcribe(take_id: str):
    try:
        return speech.public(speech.TRANSCRIBER.start(take_id, _model_name()))
    except Exception as e:
        _fail(e)


@router.post("/speech/{take_id}/cancel")
async def post_take_cancel(take_id: str):
    try:
        speech.TRANSCRIBER.cancel(take_id)
        t = speech.get_take(take_id)
        if t["transcript"]["status"] in ("waiting", "working"):
            t = speech.change_take(take_id, lambda x: x["transcript"].update(status="cancelled"))
        return speech.public(t)
    except Exception as e:
        _fail(e)


@router.post("/recordings/delete")
async def post_recordings_delete():
    try:
        return {"deleted": speech.delete_all_recordings()} | speech.recordings_summary()
    except Exception as e:
        _fail(e)


@router.post("/speech/{take_id}/judge")
async def post_take_judge(take_id: str, body: dict):
    """The ballot for an extemp speech or a 60-second answer. Kept with every other ballot."""
    try:
        b = _body(body)
        take = speech.get_take(take_id)
        event = take["event"] if take["event"] in ("extemp", "drill") else None
        if not event:
            raise ValueError("Only extemp takes are judged here.")
        if take["transcript"]["status"] in ("waiting", "working"):
            raise ValueError("The transcript is still being made. The ballot follows it.")
        question = extemp.clean_question(b.get("question") or take.get("prompt") or "")
        outline = extemp.clean_outline(b.get("outline"))
        cited = extemp.cited_sources(take["transcript"].get("text") or "", extemp.file_items())
        ballot = await _once(("judge", take_id), lambda: engine.run_extemp_judge(take, question, outline, cited, MODEL, event))
        ballot.update({"at": int(time.time()), "question": question, "take_id": take_id,
                       "drill_segment": "answer" if event == "drill" else "speak"})
        ballots.add(ballot)
        r = store.read("extemp_round.json")
        if r and r.get("take") == take_id:
            store.update("extemp_round.json", lambda x: (x.update(ballot=ballot, phase="ballot"), x)[1])
        return ballot
    except Exception as e:
        _fail(e)


# ---------- headlines ----------
@router.get("/outlets")
async def get_outlets():
    items = headlines.outlets()
    return {"outlets": items, "balance": headlines.balance(items), "suggested": headlines.SUGGESTED,
            "labels_checked": headlines.LABELS_CHECKED, "leans": list(headlines.LEANS), "sides": list(headlines.SIDES)}


@router.post("/outlets")
async def post_outlets(body: dict):
    try:
        b = _body(body)
        items = headlines.reset_outlets() if b.get("reset") else headlines.save_outlets(b.get("outlets"))
        return {"outlets": items, "balance": headlines.balance(items)}
    except Exception as e:
        _fail(e)


@router.get("/headlines")
async def get_headlines(topic: str = ""):
    """The cached pull for a topic (no network), and the recent topics."""
    return {"cached": headlines.cached(topic) if topic else None, "recent": headlines.recent_topics()}


@router.post("/headlines/pull")
async def post_headlines_pull(body: dict):
    """Every outlet in parallel; each column fails on its own. Falls back to the cached pull offline."""
    try:
        topic = headlines.clean_topic(_body(body).get("topic"))
        result = await asyncio.to_thread(headlines.pull, topic)
        if not any(c["ok"] for c in result["columns"]):
            old = headlines.cached(topic)
            if old:
                return old | {"stale": True, "notice": "No outlet answered. These are from your last pull."}
            raise RuntimeError("No outlet answered. Check the internet connection, or work from your saved file.")
        return result
    except Exception as e:
        _fail(e)


# ---------- the extemp file ----------
@router.get("/extemp/file")
async def get_extemp_file(q: str = "", topic: str = ""):
    items = extemp.search(_q(q), _q(topic, 40) or None)
    topics = sorted({t for i in extemp.file_items() for t in i["topics"]})
    return {"items": [dict(i, text=None, has_text=bool(i.get("text"))) for i in items], "topics": topics, "count": len(extemp.file_items())}


@router.post("/extemp/file")
async def post_extemp_file(body: dict):
    try:
        return extemp.add_item(_body(body))
    except Exception as e:
        _fail(e)


@router.post("/extemp/file/link")
async def post_extemp_file_link(body: dict):
    """Save any public page through 0.1's checked reader: its title and first 30,000 characters."""
    try:
        b = _body(body)
        p = engine.clean({"action": "source", "url": b.get("url")})
        src = await engine.run_source_async(p)
        host = (engine.urllib.parse.urlparse(src["url"]).hostname or "").removeprefix("www.")
        return extemp.add_item({"title": src["title"], "url": src["url"], "text": src["text"], "outlet": b.get("outlet") or host,
                                "topics": b.get("topics") or [], "note": b.get("note") or "", "at": int(time.time())})
    except Exception as e:
        _fail(e)


@router.post("/extemp/file/{item_id}")
async def post_extemp_file_edit(item_id: str, body: dict):
    try:
        extemp.edit_item(item_id, _body(body))
        return {"ok": True}
    except Exception as e:
        _fail(e)


@router.post("/extemp/file/{item_id}/delete")
async def post_extemp_file_delete(item_id: str):
    try:
        extemp.remove_item(item_id)
        return {"ok": True}
    except Exception as e:
        _fail(e)


# ---------- the extemp round ----------
@router.post("/extemp/draw")
async def post_extemp_draw(body: dict):
    """Three questions from the student's file and this pull. With no model, or a bad answer, the page
    gets the headlines to write a question from instead (no model needed)."""
    try:
        b = _body(body)
        area = engine._pick(b.get("area"), extemp.AREAS, "area", "us")
        topic = _q(b.get("topic"), 120)
        pulled = headlines.cached(topic) if topic else None
        lines = extemp.material(pulled)
        if not lines:
            raise ValueError("Pull headlines on a topic, or save a few to your file, then draw.")
        try:
            return {"questions": await engine.run_draw(area, lines, MODEL), "fallback": False, "area": area}
        except RuntimeError as e:
            return {"questions": [], "fallback": True, "notice": str(e), "area": area,
                    "headlines": [ln[2:] for ln in lines[:12]]}
    except Exception as e:
        _fail(e)


@router.get("/extemp/round")
async def get_extemp_round():
    return store.read("extemp_round.json")


@router.post("/extemp/round/start")
async def post_extemp_round_start(body: dict):
    try:
        b = _body(body)
        r = extemp.new_round(b.get("question"), b.get("area"), b.get("mode") or "files")
        store.write("extemp_round.json", r)
        return r
    except Exception as e:
        _fail(e)


@router.post("/extemp/round")
async def post_extemp_round(body: dict):
    """Save the outline, the prep clock (it only goes down), the phase, or the take that was spoken."""
    try:
        b = _body(body)

        def change(r):
            if not r:
                raise ValueError("Draw a question first.")
            if "outline" in b:
                r["outline"] = extemp.clean_outline(b["outline"])
            if "prep_left" in b:
                left = b["prep_left"]
                if not isinstance(left, (int, float)):
                    raise ValueError("Bad prep time.")
                r["prep_left"] = max(0, min(int(r["prep_left"]), int(left)))
            if "phase" in b:
                r["phase"] = engine._pick(b["phase"], ("prep", "speak", "ballot"), "phase")
            if "take" in b:
                speech.get_take(b["take"])
                r["take"] = b["take"]
            return r
        return store.update("extemp_round.json", change)
    except Exception as e:
        _fail(e)


@router.post("/extemp/round/end")
async def post_extemp_round_end():
    store.write("extemp_round.json", None)
    return None


# ---------- rhetoric ----------
@router.get("/rhetoric")
async def get_rhetoric():
    return R.config()


@router.get("/rhetoric/speech/{speech_id}")
async def get_rhetoric_speech(speech_id: str):
    try:
        return R.speech(speech_id)
    except Exception as e:
        _fail(e)


@router.post("/rhetoric/marks")
async def post_rhetoric_marks(body: dict):
    """Figures and appeals marked on a pasted passage or a library speech. Every quote is checked as an
    exact substring of the text before it is shown."""
    try:
        b = _body(body)
        text = R.speech(b["speech_id"])["text"] if b.get("speech_id") else engine._s(b.get("text"), R.FINDER_LIMIT, "Text")
        out = await _once(("marks", hash(text)), lambda: engine.run_marks(text, MODEL))
        return out | {"text": text}
    except Exception as e:
        _fail(e)


@router.post("/rhetoric/spot")
async def post_rhetoric_spot():
    """A spot-the-figure item from the library. No model: the answer is known."""
    import random
    try:
        return R.spot_item(random.SystemRandom())
    except Exception as e:
        _fail(e)


@router.post("/rhetoric/critique")
async def post_rhetoric_critique(body: dict):
    try:
        b = _body(body)
        return await engine.run_critique(engine._pick(b.get("figure"), R.FIGURE_IDS, "figure"), b.get("line"), MODEL)
    except Exception as e:
        _fail(e)


# ---------- the Ballots view ----------
@router.post("/ballots/{index}/drill")
async def post_ballot_drill(index: int, body: dict):
    try:
        ballots.set_drill_done(int(index), bool(_body(body).get("done")))
        return {"history": ballots.history(), "patterns": ballots.patterns()}
    except Exception as e:
        _fail(e)


@router.post("/speech/{take_id}/text")
async def post_take_text(take_id: str, body: dict):
    """The student's own words for a take (typed when no transcript could be made, or corrected)."""
    try:
        t = speech.get_take(take_id)
        if t["transcript"]["status"] in ("waiting", "working"):
            speech.TRANSCRIBER.cancel(take_id)
        return speech.public(speech.set_text(take_id, _body(body).get("text")))
    except Exception as e:
        _fail(e)

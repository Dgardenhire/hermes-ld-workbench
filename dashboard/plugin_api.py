"""Backend routes for LD Workbench. Mounted by Hermes at /api/plugins/ld-workbench/.

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
            raise RuntimeError("Could not load the LD Workbench package")
        package = importlib.util.module_from_spec(spec)
        sys.modules[package_name] = package
        spec.loader.exec_module(package)
    from importlib import import_module
    return tuple(import_module(f"{package_name}.{m}") for m in ("engine", "store", "room", "ld_method", "library"))


engine, store, room, M, library = _load_package()
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
    return store.read("ballots.json")


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
            raise ValueError("That file is not an LD Workbench backup.")
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
        r = _save_round(lambda r: room.finish_speech(r, sid, "student", text))
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
        r = _save_round(lambda x: room.add_ballot(x, ballot))

        def archive(x):
            x["history"].append(ballot)
            del x["history"][:-store.HISTORY_CAP]
            return x
        store.update("ballots.json", archive)
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

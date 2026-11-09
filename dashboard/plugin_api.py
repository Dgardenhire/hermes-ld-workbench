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
                 ("engine", "store", "room", "ld_method", "library", "speech", "headlines", "extemp", "ballots", "rhetoric_method", "coach"))


engine, store, room, M, library, speech, headlines, extemp, ballots, R, coach = _load_package()
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
        raise HTTPException(status_code=400, detail=str(e) or "That request could not be read.")
    if isinstance(e, RuntimeError):  # our own plain-English failures
        raise HTTPException(status_code=502, detail=str(e))
    _log.exception("ld-workbench: unexpected error")
    raise HTTPException(status_code=500, detail="Something went wrong. Try again. If it keeps happening, restart Hermes.")


def _body(body):
    if not isinstance(body, dict):
        raise ValueError("That request could not be read.")
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
            if "hide_suggestion" in b:
                (c.get("suggestions") or {}).pop(engine._pick(b["hide_suggestion"], SECTIONS, "section"), None)
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
                    raise ValueError("That source could not be read.")
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
            raise ValueError("That case could not be read.")
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
            return {"text": out["text"], "quotes": out.get("quotes", []), "speech_id": sid}
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
        judge = engine._pick(b.get("judge"), room.JUDGES, "judge", "traditional")
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
        judge = engine._pick(b.get("judge"), room.JUDGES, "judge", r["judge"])
        ballot = engine.tidy_ballot(await engine.run_judge(_payload(r, action="judge", judge=judge), MODEL))
        ballot["at"] = int(time.time())
        ballot["round_no"] = r["round_no"]
        ballot["side"] = r["side"]
        ballot["resolution"] = r["resolution"]
        engine.check_ld_lines(r.get("transcript"), ballot["decisive"])
        spoken = {k: v for k, v in (r.get("spoken") or {}).items() if isinstance(v, dict)}
        if spoken:  # measured tags from every speech the student recorded in this round
            tags = set()
            for sid, st in spoken.items():
                stop = next((s for s in room.stops() if s["id"] == sid), None)
                tags.update(ballots.measured_tags(st, (stop or {}).get("minutes", 0) * 60, "ld", judge))
            ballot["measured_tags"] = sorted(tags)
            ballot["measured"] = spoken
        r = _save_round(lambda x: room.add_ballot(x, ballot))
        ballots.add(ballot)
        return r
    except Exception as e:
        _fail(e)


def _hermes_tool(name, args):
    """One of the user's own Hermes tools, through the public tool registry (``tools.registry``, the
    same ``registry.dispatch`` that ``ctx.dispatch_tool`` calls). When the dashboard process has not
    loaded the built-in tools yet, ``discover_builtin_tools`` (public) loads them. Outside Hermes, or when
    the tool is not there, the answer is "Unknown tool", which the page shows as "not set up"."""
    try:
        from tools.registry import registry
        if registry.get_entry(name) is None:
            from tools.registry import discover_builtin_tools
            discover_builtin_tools()
    except Exception:
        return {"error": f"Unknown tool: {name}"}
    return registry.dispatch(name, args)


def _hermes_tts(text, out_path):
    """The user's own text_to_speech tool (their configured voice provider)."""
    return _hermes_tool("text_to_speech", {"text": text, "output_path": out_path})


SPEAK = _hermes_tts  # tests replace this


@router.post("/round/listen")
async def post_round_listen(body: dict):
    """One of the opponent's speeches, read aloud by the user's Hermes voice, so the student flows by ear."""
    try:
        b = _body(body)
        sid = engine._pick(b.get("speech_id"), engine.SPEECH_IDS, "speech")
        r = _round_or_fail()
        p = r.get("pending_ai") or {}
        text = p.get("text") if p.get("id") == sid else None
        if not text:
            t = next((x for x in r.get("transcript", []) if x.get("id") == sid and x.get("speaker") == "ai"), None)
            text = t and t.get("text")
        if not text:
            raise ValueError("That speech is not the opponent's, or it has not been given yet.")
        try:
            return await asyncio.wait_for(asyncio.to_thread(speech.opponent_audio, text, SPEAK), timeout=120)
        except asyncio.TimeoutError:
            raise ValueError("The voice took too long. Read the speech, or try again.")
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
    """What the floor needs on open: the event last chosen, the next extemp drill, the question pool and where
    this visit opens in it,
    whether transcripts can be made, and the round in progress for each event."""
    try:
        st = store.read("settings.json")
        takes = store.read("practice.json")["takes"]
        last = {}
        for t in reversed(takes):
            if t["event"] not in last:
                last[t["event"]] = speech.public(speech.settle(t))
        hist = ballots.history()
        return {"settings": st, "next_drill": ballots.next_drill(hist, ("drill", "extemp")), "pool": extemp.pool(), "pool_start": extemp.pool_start(),
                "transcripts": speech.transcript_status(st.get("transcript_model")),
                "recordings": speech.recordings_summary(), "transcripts_kept": speech.transcripts_summary(), "last_take": last, "extemp_round": store.read("extemp_round.json"),
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
            if coach.SETTING in b:
                if not isinstance(b[coach.SETTING], bool):
                    raise ValueError("Coach examples are on or off.")
                st[coach.SETTING] = b[coach.SETTING]
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
        return speech.public(speech.settle(speech.get_take(take_id)))
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
    """Transcribe now, pressed by the student: the one place the speech model may be downloaded."""
    try:
        return speech.public(speech.TRANSCRIBER.start(take_id, _model_name(), allow_download=True))
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


@router.post("/data/delete")
async def post_data_delete():
    """Delete transcripts and ballots, pressed in Settings after a confirm: every transcript and the
    student's words kept with a take, every ballot, and the rounds in progress (their speeches are
    transcripts too). Recordings, timing, cases and the extemp file stay."""
    try:
        transcripts = speech.delete_transcripts()
        gone = ballots.delete_all()
        ended = store.read("round.json") is not None or store.read("extemp_round.json") is not None
        store.write("round.json", None)
        store.write("extemp_round.json", None)
        return {"transcripts": transcripts, "ballots": gone, "round_ended": ended,
                "transcripts_kept": speech.transcripts_summary(), "ballots_kept": len(ballots.history())}
    except Exception as e:
        _fail(e)


@router.post("/speech/{take_id}/judge")
async def post_take_judge(take_id: str, body: dict):
    """The ballot for an extemp speech or a 60-second answer. Kept with every other ballot."""
    try:
        b = _body(body)
        take = speech.settle(speech.get_take(take_id))
        event = take["event"] if take["event"] in ("extemp", "drill") else None
        if not event:
            raise ValueError("Only extemp takes are judged here.")
        if take["transcript"]["status"] in ("waiting", "working"):
            raise ValueError("The transcript is still being made. The ballot follows it.")
        question = extemp.clean_question(b.get("question") or take.get("prompt") or "")
        outline = extemp.clean_outline(b.get("outline"))
        items = extemp.file_items()
        cited = extemp.cited_sources(take["transcript"].get("text") or "", items)
        ballot = await _once(("judge", take_id), lambda: engine.run_extemp_judge(take, question, outline, cited, MODEL, event, len(items)))
        ballot.update({"at": int(time.time()), "question": question, "take_id": take_id,
                       "drill_segment": "answer" if event == "drill" else "speak",
                       # Help labels: a take given after the coach showed an example says so, on the ballot and in the export.
                       "help": "after the coach's example" if coach.kept_example(b.get("after_example")) else "unaided"})
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


def _hermes_web_search(query):
    """The user's own web_search tool, through Hermes's tool registry (what ctx.dispatch_tool calls). The
    plugin holds no key and no scraper of its own. Outside Hermes the registry is missing: "not set up"."""
    return _hermes_tool("web_search", {"query": query, "limit": 8})


WEB_SEARCH = _hermes_web_search  # tests replace this


@router.post("/extemp/search")
async def post_extemp_search(body: dict):
    """Search the web during prep, only in a round started with "internet allowed"."""
    try:
        b = _body(body)
        r = store.read("extemp_round.json")
        if not r or r.get("phase") != "prep":
            raise ValueError("Web search is for prep. Start a round first.")
        if r.get("mode") != "internet":
            raise ValueError("This round is files only. Prep from your file.")
        q = extemp.web_query(r.get("question"), b.get("query"))
        try:
            raw = await asyncio.wait_for(asyncio.to_thread(WEB_SEARCH, q), timeout=25)
        except asyncio.TimeoutError:
            raise ValueError("Web search took too long. Try again, or prep from your file.")
        return {"query": q, "results": extemp.web_results(raw)}
    except Exception as e:
        _fail(e)


@router.post("/openings/coach")
async def post_openings_coach(body: dict):
    """The coach's read on three openings for one question. It picks the strongest and never writes one."""
    try:
        b = _body(body)
        ids = b.get("take_ids")
        if not isinstance(ids, list) or len(ids) != 3:
            raise ValueError("Give all three openings first.")
        if len({str(i) for i in ids}) != 3:
            raise ValueError("Give three different openings.")
        takes = [speech.settle(speech.get_take(str(i))) for i in ids]
        for k, t in enumerate(takes, 1):
            if t.get("event") != "opening":
                raise ValueError("Those are not openings.")
            if t["transcript"]["status"] in ("waiting", "working"):
                raise ValueError(f"Opening {k} is still being transcribed. The coach reads it when it is done.")
            if not (t["transcript"].get("text") or "").strip():
                raise ValueError(f"Opening {k} has no words yet. Use Type what you said under it.")
        question = extemp.clean_question(b.get("question") or takes[0].get("prompt") or "")
        raw = await _once(("openings",) + tuple(ids), lambda: MODEL.json(extemp.OPENINGS_PROMPT, "", extemp.openings_body(question, takes),
                                                                          max_tokens=3000, purpose="ld-workbench.openings.coach"))
        return extemp.tidy_openings(raw)
    except Exception as e:
        _fail(e)


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
                    raise ValueError("That prep time could not be read.")
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
        figure = engine._pick(b.get("figure"), R.FIGURE_IDS, "figure")
        out = await engine.run_critique(figure, b.get("line"), MODEL)
        coach.remember_critique(figure, b.get("line"))  # three versions follow only a critique
        return out
    except Exception as e:
        _fail(e)


# ---------- the 60-second questions: built in, added by a student or coach, and the rotation ----------
@router.get("/extemp/questions")
async def get_extemp_questions():
    try:
        return extemp.questions_view()
    except Exception as e:
        _fail(e)


@router.post("/extemp/questions")
async def post_extemp_questions(body: dict):
    """Add a question to the list ({text, area}), or turn "only my questions" on or off ({mine_only})."""
    try:
        b = _body(body)
        if "mine_only" in b:
            return extemp.set_mine_only(bool(b.get("mine_only")))
        item = extemp.add_question(b.get("text"), b.get("area"))
        return extemp.questions_view() | {"added": item}
    except Exception as e:
        _fail(e)


@router.post("/extemp/questions/restore")
async def post_extemp_questions_restore():
    try:
        return extemp.restore_questions()
    except Exception as e:
        _fail(e)


@router.post("/extemp/questions/seen")
async def post_extemp_questions_seen():
    """The floor opened on this visit's question: the next visit opens on the one after it."""
    try:
        return {"next": extemp.seen()}
    except Exception as e:
        _fail(e)


@router.post("/extemp/questions/{qid}/delete")
async def post_extemp_question_delete(qid: str):
    """Delete one of the student's own questions, or hide a built-in one (Restore brings those back)."""
    try:
        return extemp.remove_question(_q(qid, 40))
    except Exception as e:
        _fail(e)


# ---------- the Ballots view ----------
@router.post("/ballots/export")
async def post_ballots_export(body: dict):
    """Every ballot as a text file, where the student chose (or into the plugin's exports folder), to send a coach."""
    try:
        b = _body(body)
        text = ballots.as_text(student=_q(b.get("name"), 60))
        path = library.write_bytes(library.export_path(b.get("path") or None, "txt", time.strftime("debate-ballots-%Y-%m-%d.txt")), text.encode("utf-8"))
        return {"path": str(path), "name": path.name, "count": len(ballots.history())}
    except Exception as e:
        _fail(e)



@router.post("/ballots/{index}/drill")
async def post_ballot_drill(index: int, body: dict):
    try:
        b = _body(body)
        at = b.get("at")
        at = at if isinstance(at, (int, float)) and not isinstance(at, bool) else None
        ballots.set_drill_done(int(index), bool(b.get("done")), at)
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


# ================================================================== the coach ==
# Examples and suggestions after the student's own attempt, and the chat on every floor (coach.py). Every
# route here reads the student's work from the backend; the page sends only ids, choices and its own words.

def _said(take):
    return ((take or {}).get("transcript") or {}).get("text") or ""


def _ballot_at(at):
    if not isinstance(at, (int, float)) or isinstance(at, bool):
        raise ValueError("That ballot could not be found.")
    b = next((x for x in reversed(ballots.history()) if x.get("at") == at), None)
    if b is None:
        raise ValueError("That ballot is no longer kept.")
    return b


def _ballot_said(b):
    """The student's own words behind a ballot: the take's transcript, or their speeches in the round while it is
    still the one kept. Empty when neither is kept (the round was replaced, or transcripts were deleted)."""
    if b.get("take_id"):
        try:
            return _said(speech.get_take(b["take_id"]))
        except ValueError:
            return ""
    if b.get("event", "ld") == "ld":
        r = store.read("round.json")
        if r and r.get("round_no") == b.get("round_no"):
            return "\n\n".join(f"{t['id']}: {t['text']}" for t in r.get("transcript") or [] if t.get("speaker") == "student")
    return ""


ATTEMPT_LABEL = {"drill": "THE STUDENT'S 60-SECOND ANSWER", "extemp": "THE STUDENT'S 7-MINUTE SPEECH", "opening": "THE STUDENT'S OPENING"}


def _screen(floor, b):
    """What is on the student's screen, read here from their own saved work (never a prompt from the page)."""
    s = {}
    if floor in ("extemp", "ballots"):
        ids = b.get("take_ids") if isinstance(b.get("take_ids"), list) else [b.get("take_id")] if b.get("take_id") else []
        attempts = []
        for k, tid in enumerate(ids[:3], 1):
            try:
                t = speech.get_take(str(tid))
            except ValueError:
                continue
            if t.get("event") in ATTEMPT_LABEL and _said(t).strip():
                attempts.append((ATTEMPT_LABEL[t["event"]] + (f" {k}" if t["event"] == "opening" else ""), _said(t)))
        s["attempts"] = attempts
        s["question"] = _q(b.get("question"), 240)
    if floor == "extemp":
        r = store.read("extemp_round.json")
        if r and b.get("round"):
            s["question"] = r.get("question") or s["question"]
            s["outline"] = "\n".join(f"{k}: {v}" for k, v in (r.get("outline") or {}).items() if k != "sources" and v)
        if b.get("ballot_at") is not None:
            s["ballot"] = coach.ballot_text(_ballot_at(b.get("ballot_at")))
        s["items"] = coach.numbered(s["question"])
    elif floor == "ballots":
        if b.get("ballot_at") is not None:
            bb = _ballot_at(b.get("ballot_at"))
            s["ballot"] = coach.ballot_text(bb)
            s["question"] = bb.get("question") or ""
            said = _ballot_said(bb)
            if said:
                s["attempts"] = [("WHAT THE STUDENT SAID", said)]
            if bb.get("event") in ("extemp", "drill"):
                s["items"] = coach.numbered(s["question"])
        else:
            pats = ballots.patterns()
            s["ballot"] = "PATTERNS ACROSS THE LAST BALLOTS:\n" + "\n".join(
                f"{ballots.EVENT_NAMES.get(ev, ev)}: {p['text']}, {p['count']} of {p['of']}" for ev, g in pats.items() for p in g["patterns"]) \
                if any(g["patterns"] for g in pats.values()) else "No pattern has come up twice yet."
    elif floor == "ld":
        c = _active()
        s.update(resolution=c.get("resolution"), side=c.get("side"), case=engine.case_text(c.get("sections")))
        r = store.read("round.json")
        if r and b.get("view") == "room":
            s.update(resolution=r["resolution"], side=r["side"])
            s["round"] = engine.transcript_text(r.get("transcript")) + ("\n\nCROSS-EXAMINATION:\n" + room.cx_log(r) if room.cx_log(r) else "")
            if r.get("ballots"):
                s["ballot"] = coach.ballot_text(dict(r["ballots"][-1], side=r["side"], resolution=r["resolution"]))
    elif floor == "rhetoric":
        f = next((x for x in R.FIGURES if x["id"] == b.get("figure")), None)
        if f:
            s["figure"] = f"{f['name']}. {f['definition']}"
        s["line"] = _q(b.get("line"), 600)
        s["critique"] = engine._s(b.get("critique"), 1500, "Critique")
    return s


@router.post("/coach/chat")
async def post_coach_chat(body: dict):
    """Ask the coach anything about what is on screen. With coach examples off, it explains and asks, never writes."""
    try:
        b = _body(body)
        floor = engine._pick(b.get("floor"), coach.FLOORS, "floor")
        raw = b.get("thread") if isinstance(b.get("thread"), list) else []
        thread = [{"role": t.get("role"), "text": engine._s(t.get("text"), 4000, "A message")}
                  for t in raw[-12:] if isinstance(t, dict) and t.get("role") in ("you", "coach")]
        message = engine._s(b.get("message"), 2000, "Message")
        return await coach.chat(floor, _screen(floor, b), thread, message, MODEL)
    except Exception as e:
        _fail(e)


@router.post("/coach/extemp/example")
async def post_coach_extemp_example(body: dict):
    """After a 60-second answer or the openings: a strong one on the same question, with why it works."""
    try:
        b = _body(body)
        kind = engine._pick(b.get("kind"), ("answer", "opening"), "example")
        ids = b.get("take_ids") if kind == "opening" else [b.get("take_id")]
        if not isinstance(ids, list) or not ids or len(ids) > 3 or not all(isinstance(i, str) and i for i in ids):
            raise ValueError("Give your answer first. Then the coach shows a strong one.")
        want = "drill" if kind == "answer" else "opening"
        takes = []
        for t in (speech.settle(speech.get_take(i)) for i in ids):
            if t.get("event") != want:
                raise ValueError("That take is not from this floor.")
            if t["transcript"]["status"] in ("waiting", "working"):
                raise ValueError("Your take is still being transcribed. The coach reads it when it is done.")
            takes.append(t)
        best = b.get("best") if isinstance(b.get("best"), int) and not isinstance(b.get("best"), bool) else None
        question = b.get("question") or takes[0].get("prompt") or ""
        return await _once(("coach-example", kind, best) + tuple(ids),
                           lambda: coach.extemp_example(kind, question, takes, best, MODEL))
    except Exception as e:
        _fail(e)


@router.post("/coach/speak")
async def post_coach_speak(body: dict):
    """Hear it: the coach's kept example read aloud by the user's own Hermes voice (text_to_speech), at most
    1,500 characters, with the marks and the written date stamps left out."""
    try:
        coach.require_on()
        ex = coach.kept_example(_body(body).get("example_id"))
        if not ex:
            raise ValueError("That example is not kept any more. Ask for a strong answer again.")
        text = coach.speakable(ex["text"])
        try:
            return await asyncio.wait_for(asyncio.to_thread(speech.opponent_audio, text, SPEAK), timeout=120)
        except asyncio.TimeoutError:
            raise ValueError("The voice took too long. Read the example, or try again.")
    except Exception as e:
        _fail(e)


@router.post("/coach/extemp/take2")
async def post_coach_extemp_take2(body: dict):
    """Take 1 against Take 2: the numbers and each of the example's moves, met or not met, measured in code."""
    try:
        b = _body(body)
        t1, t2 = (speech.settle(speech.get_take(str(b.get(k) or ""))) for k in ("take1", "take2"))
        if t1.get("event") != "drill" or t2.get("event") != "drill":
            raise ValueError("Take 2 is measured on the 60-second answer.")
        out = coach.take2(t1, t2, coach.kept_example(b.get("example_id")))
        pts = {x.get("take_id"): x.get("points") for x in ballots.history() if x.get("take_id") in (t1["id"], t2["id"])}
        out["rows"].append({"key": "points", "label": "Points", "take1": pts.get(t1["id"]), "take2": pts.get(t2["id"]),
                            "change": "not measured" if pts.get(t1["id"]) is None or pts.get(t2["id"]) is None else
                            "the same" if pts[t1["id"]] == pts[t2["id"]] else "better" if pts[t2["id"]] > pts[t1["id"]] else "worse"})
        return out
    except Exception as e:
        _fail(e)


@router.post("/coach/extemp/areas")
async def post_coach_extemp_areas(body: dict):
    """During prep, after the student writes their answer: three areas, each with a source from their file."""
    try:
        b = _body(body)
        r = store.read("extemp_round.json")
        if not r or r.get("phase") != "prep":
            raise ValueError("Suggest areas is for prep. Draw a question first.")
        if isinstance(b.get("outline"), dict):  # the page's latest words win, and are kept
            outline = extemp.clean_outline(b["outline"])
            store.update("extemp_round.json", lambda x: (x.__setitem__("outline", outline), x)[1] if x else x)
        else:
            outline = r.get("outline") or {}
        return await coach.suggest_areas(r["question"], outline, MODEL)
    except Exception as e:
        _fail(e)


@router.post("/coach/extemp/evidence")
async def post_coach_extemp_evidence(body: dict):
    """Which saved sources bear on one point: picked from the student's own file, never from anywhere else."""
    try:
        b = _body(body)
        r = store.read("extemp_round.json")
        question = (r or {}).get("question") or _q(b.get("question"), 240)
        return await coach.find_evidence(question, engine._s(b.get("point"), 400, "Point"), MODEL)
    except Exception as e:
        _fail(e)


SUGGESTION_LABEL = {"contentions": "Suggested contentions", "framework": "Suggested value and criterion", "block": "Suggested block",
                    "card": "A stronger card"}


@router.post("/coach/ld/suggest")
async def post_coach_ld_suggest(body: dict):
    """A draft for the student to edit: contentions, a value and criterion pair, a block to an attack, or a
    stronger card. Kept under its section and in the coach thread, marked as the coach's suggestion."""
    try:
        b = _body(body)
        kind = engine._pick(b.get("kind"), coach.LD_KINDS, "suggestion")
        section = b.get("section")
        if section is not None:
            engine._pick(section, SECTIONS, "section")
        case_id = b.get("case_id") or _active()["id"]
        if isinstance(b.get("sections"), dict):  # the page's latest words win, then the run reads them back
            secs = library._sections(b["sections"])
            library.change(case_id, lambda c: c.__setitem__("sections", secs))
        c = library.get(case_id)
        if kind == "card" and not section:
            raise ValueError("Select a card in one of your sections first.")
        out = await coach.ld_suggest(kind, c["sections"], c["side"], c["resolution"], store.read("workbench.json").get("source"), MODEL,
                                     attack=engine._s(b.get("attack"), 3000, "Attack"), card=engine._s(b.get("card"), 4000, "Card"), section=section)
        where = section or out["target"]
        label = SUGGESTION_LABEL[kind]

        def record(c):
            c.setdefault("suggestions", {})[where] = out | {"label": label}
            th = c["thread"]
            th.append({"role": "coach", "label": f"{label} · {where}", "section": where, "tool": "suggest",
                       "text": "\n\n".join(f"**{d['label']}**\n{d['text']}" for d in out["drafts"])})
            del th[:-store.THREAD_CAP]
        library.change(case_id, record)
        return out | {"label": label, "section": where} | _workbench()
    except Exception as e:
        _fail(e)


@router.post("/coach/rhetoric/versions")
async def post_coach_rhetoric_versions(body: dict):
    """After the coach's critique of the student's line: three versions of that line using the figure."""
    try:
        b = _body(body)
        return await coach.three_versions(engine._pick(b.get("figure"), R.FIGURE_IDS, "figure"), engine._s(b.get("line"), 600, "Line"), MODEL)
    except Exception as e:
        _fail(e)


@router.post("/coach/ballot/show")
async def post_coach_ballot_show(body: dict):
    """Show me: a modeled redo of the weakest moment on one ballot. Kept with the ballot once written."""
    try:
        b = _body(body)
        coach.require_on()
        ballot = _ballot_at(b.get("at"))
        if ballot.get("show_me") and not b.get("again"):
            return ballot["show_me"]
        out = await _once(("show-me", ballot["at"]), lambda: coach.show_me(ballot, _ballot_said(ballot), MODEL))
        ballots.set_show_me(ballot["at"], out)
        return out
    except Exception as e:
        _fail(e)


def _lane(name):
    """A lane's own module in this package, imported on first use."""
    from importlib import import_module
    _load_package()  # the package is in sys.modules after the first load; this only makes sure
    return import_module(f"ld_workbench_dashboard_package.{name}")


# ===== Lane B: player routes =====
#
#
#
#
#
#
#
#
#
#

# ===== Lane C: evidence routes =====
# Get up to speed (evidence.py): one press, three dated facts, each an exact page sentence picked by number.
def _evidence():
    return _lane("evidence")


def _files_only():
    """True while an extemp round is in prep with "files only": Get up to speed stays off."""
    r = store.read("extemp_round.json")
    return bool(r) and r.get("phase") == "prep" and r.get("mode") != "internet"


@router.post("/evidence/primer")
async def post_evidence_primer(body: dict):
    """Start Get up to speed on a question; answers at once with the first stage, then the page polls."""
    try:
        return _evidence().start(_body(body).get("question"), lambda q: WEB_SEARCH(q), MODEL, files_only=_files_only())
    except Exception as e:
        _fail(e)


@router.get("/evidence/primer/{job_id}")
async def get_evidence_primer(job_id: str):
    try:
        return _evidence().poll(job_id)
    except Exception as e:
        _fail(e)


@router.post("/evidence/primer/{job_id}/cancel")
async def post_evidence_primer_cancel(job_id: str):
    try:
        return _evidence().cancel(job_id)
    except Exception as e:
        _fail(e)


@router.post("/evidence/save")
async def post_evidence_save(body: dict):
    """Save to my file: one fact card's page and its sentence, on the student's press only."""
    try:
        return _evidence().save(_body(body).get("card_id"))
    except Exception as e:
        _fail(e)



# ===== Lane E: hermes routes =====
#
#
#
#
#
#
#
#
#
#

# ===== spare =====
#
#
#
#
#
#
#
#
#
#

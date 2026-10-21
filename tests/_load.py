"""Load the plugin for tests: a temporary data folder, the package loaded the way Hermes's dashboard does,
a stand-in for fastapi when it is not installed (system Python), and a fake model that records prompts."""
import asyncio
import json
import os
import sys
import tempfile
import types
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
os.environ["LDW_DATA_DIR"] = tempfile.mkdtemp(prefix="ldw-test-")

try:
    import fastapi  # noqa: F401
except ImportError:
    fa = types.ModuleType("fastapi")

    class HTTPException(Exception):
        def __init__(self, status_code, detail=None):
            super().__init__(detail)
            self.status_code, self.detail = status_code, detail

    class APIRouter:
        def __init__(self):
            self.routes = []

        def _add(self, method, path):
            def deco(fn):
                self.routes.append((method, path, fn))
                return fn
            return deco

        def get(self, path):
            return self._add("GET", path)

        def post(self, path):
            return self._add("POST", path)

    fa.APIRouter, fa.HTTPException = APIRouter, HTTPException
    sys.modules["fastapi"] = fa

import importlib.util  # noqa: E402

spec = importlib.util.spec_from_file_location("plugin_api_under_test", ROOT / "dashboard" / "plugin_api.py")
api = importlib.util.module_from_spec(spec)
spec.loader.exec_module(api)
engine, store, room, M, library = api.engine, api.store, api.room, api.M, api.library
HTTPException = sys.modules["fastapi"].HTTPException


class Result:
    def __init__(self, text, parsed=None):
        self.text, self.parsed = text, parsed


class FakeLlm:
    """Stands in for PluginLlm. Records every call; answers from a queue or a default per purpose."""

    def __init__(self):
        self.calls = []
        self.queue = []

    def _answer(self, purpose):
        if self.queue:
            return self.queue.pop(0)
        if purpose.endswith("judge"):
            return json.dumps({"decision": "neg", "reason": "You dropped the NR turn.", "framework": "Neg won framework.",
                               "speaker_points": {"student": 27.4, "opponent": 28.1}, "strengths": ["Clear signposting."],
                               "drills": [{"name": "Extend", "why": "w", "how": "h"}] * 3,
                               "decisive": [{"speech": "NR", "line": "tools save living species", "effect": "dropped"}],
                               "ownership": "Yes."})
        if purpose.endswith("flow"):
            return json.dumps({"points": ["FW: justice", "C1: harm"]})
        if purpose.endswith("import"):
            return json.dumps({"assign": {}})
        return f"answer for {purpose}"

    async def acomplete(self, messages, **kw):
        self.calls.append({"kind": "text", "messages": messages, **kw})
        return Result(self._answer(kw.get("purpose", "")))

    async def acomplete_structured(self, **kw):
        self.calls.append({"kind": "json", **kw})
        text = self._answer(kw.get("purpose", ""))
        try:
            parsed = json.loads(text)
        except ValueError:
            parsed = None
        return Result(text, parsed)


def fake_model():
    llm = FakeLlm()
    api.MODEL = engine.Model(llm)
    return llm


def run(coro):
    return asyncio.run(coro)


def reset():
    import shutil
    d = Path(os.environ["LDW_DATA_DIR"])
    shutil.rmtree(d, ignore_errors=True)
    d.mkdir(parents=True)

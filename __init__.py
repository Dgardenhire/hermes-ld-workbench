"""Debate Workbench for Hermes (``ld-workbench``).

Practice speech and debate out loud: Lincoln-Douglas, extemp and rhetoric, each timed for real and
judged on a ballot. The modules:

- ``ld_method``: the Lincoln-Douglas method core, mirrored unchanged from ld-debate-coach/method/ld_method.py
- ``engine``: input checks, every model call (through Hermes's plugin LLM facade), the checked link reader
- ``store``: the student's work as JSON files in the plugin's data folder, written atomically
- ``speech``: recording, timing, pauses, fillers, and the on-computer transcript (faster-whisper when present)
- ``headlines``: extemp headlines from outlets on both sides, labeled by lean
- ``extemp``: the extemp file, the question draw, the round and the extemp ballot prompt
- ``ballots``: every ballot kept, the fixed tag list, and patterns counted across rounds
- ``rhetoric_method``: the figures (The Clearing's definitions), the public-domain speech library, the
  device finder's exact-quote check
- ``agent``: ``/debate`` and the two read-only agent tools (counts, tags, dates and question text only)

The routes live in ``dashboard/plugin_api.py`` and the page in ``desktop/plugin.js`` (built from
``desktop/src/``). ``register(ctx)`` wires the workbench into the student's Hermes chats, matching
``plugin.yaml``: the ``/debate`` command, two read-only tools (``debate_record``, ``debate_today``), three
model rows (Debate judge, Debate opponent, Debate coach) and the bundled ``debate-coach`` skill. No hooks,
no middleware, no scheduled jobs, nothing that writes. The logic lives in ``agent.py``; this file only wires it.
"""

from __future__ import annotations

import logging
from pathlib import Path

PLUGIN_ID = "ld-workbench"
TOOLS: tuple[str, ...] = ("debate_record", "debate_today")
HOOKS: tuple[str, ...] = ()
COMMAND = "debate"
SKILL = "debate-coach"
AUX_TIMEOUT = 180  # a registered row otherwise gets Hermes's default of 60 s, short for a Lincoln-Douglas ballot

_log = logging.getLogger("hermes.plugins.ld-workbench")
_HERE = Path(__file__).resolve().parent


def register(ctx) -> None:
    """The command, the two read-only tools, the three model rows and the skill. Each optional part is
    skipped, with a log line, on a Hermes that lacks it, so the Debate page still loads."""
    from . import agent, engine

    handlers = agent.make_handlers(ctx)
    for schema in (agent.RECORD_SCHEMA, agent.TODAY_SCHEMA):
        ctx.register_tool(name=schema["name"], toolset=agent.TOOLSET, schema=schema, handler=handlers[schema["name"]],
                          description=schema["description"])
    ctx.register_command(COMMAND, agent.slash_handler,
                         description="Today's debate question and your top counted pattern")
    for key, (name, about) in engine.TASKS.items():
        try:
            ctx.register_auxiliary_task(key, display_name=name, description=about, defaults={"timeout": AUX_TIMEOUT})
        except Exception as e:  # an older Hermes: calls run on the main model (engine.Model falls back)
            _log.info("ld-workbench: model row %s not registered: %r", key, e)
    skill = _HERE / "skills" / SKILL / "SKILL.md"
    register_skill = getattr(ctx, "register_skill", None)
    if register_skill is not None and skill.is_file():
        try:
            register_skill(SKILL, skill, description="Coaching rules for Debate Workbench: NSDA formats and "
                           "times, the student tries first, and when to read the practice record.")
        except Exception as e:
            _log.info("ld-workbench: skill not registered: %r", e)
    _log.info("ld-workbench: /debate, debate_record and debate_today registered; the Debate page is in the desktop app")

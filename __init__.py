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

The routes live in ``dashboard/plugin_api.py`` and the page in ``desktop/plugin.js`` (built from
``desktop/src/``). ``register(ctx)`` adds no tools and no hooks, matching ``plugin.yaml``.
"""

from __future__ import annotations

import logging

PLUGIN_ID = "ld-workbench"
TOOLS: tuple[str, ...] = ()
HOOKS: tuple[str, ...] = ()

_log = logging.getLogger("hermes.plugins.ld-workbench")


def register(ctx) -> None:
    """Nothing runs in the agent. The workbench lives behind the dashboard routes and the Debate page."""
    _log.info("ld-workbench: the Debate page is available in the desktop app")

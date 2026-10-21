"""Debate Workbench for Hermes (``ld-workbench``).

The Hermes version of the Lincoln-Douglas Workbench web app. The modules:

- ``ld_method``: the method core (coaching stance, tool prompts, round format, judges), mirrored
  unchanged from ld-debate-coach/method/ld_method.py
- ``engine``: input checks (``clean``), the model calls, the case import with its word-coverage check,
  and the optional public-only link reader, ported from the web app's server.py
- ``store``: the student's work as JSON files in the plugin's data folder, written atomically

The routes live in ``dashboard/plugin_api.py`` and the page in ``desktop/plugin.js``. Every model call
goes through Hermes's plugin LLM facade, so it runs on the user's own model and keys.
``register(ctx)`` adds no tools and no hooks, matching ``plugin.yaml``.
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

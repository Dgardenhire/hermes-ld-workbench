"""The student's work on disk: JSON files in the plugin's data folder, written atomically.

Folder: Hermes's per-plugin data folder, ``<hermes home>/plugin-data/ld-workbench/`` (from
``plugins.plugin_storage.plugin_data_dir``, which follows the active profile). Tests and the harness
set ``LDW_DATA_DIR`` to a temporary folder so they can never touch a real profile.

Files:
- ``workbench.json``  which case is open, and the topic source
- ``cases/<id>.json`` one file per case in the library (see library.py): its name, resolution, side,
                      sections, coach thread, helper results, and the copy kept before an import
- ``round.json``      the practice round in progress (null when none)
- ``ballots.json``    how many rounds were started, and every ballot written, newest last
- ``briefings.json``  topic briefings, keyed by resolution and topic source, the 20 most recent

Every write goes to a temporary file in the same folder, is flushed to disk, then renamed over the old
file, so a crash mid-write leaves the previous version intact. One lock serializes read-modify-write.
"""

from __future__ import annotations

import copy
import json
import os
import tempfile
import threading
from pathlib import Path

PLUGIN_ID = "ld-workbench"
_lock = threading.RLock()

DEFAULTS = {
    "workbench.json": {"active": None, "source": None},
    "round.json": None,
    "ballots.json": {"rounds_started": 0, "history": []},
    "briefings.json": {"items": {}},
}
BRIEFING_CAP = 20
HISTORY_CAP = 40
THREAD_CAP = 80


def data_dir() -> Path:
    override = os.environ.get("LDW_DATA_DIR")
    if override:
        path = Path(override)
        path.mkdir(parents=True, exist_ok=True)
        return path
    from plugins.plugin_storage import plugin_data_dir  # inside Hermes
    return plugin_data_dir(PLUGIN_ID)


def _path(name: str) -> Path:
    if name not in DEFAULTS:
        raise ValueError(f"unknown store file {name!r}")
    return data_dir() / name


def read(name: str):
    with _lock:
        path = _path(name)
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except FileNotFoundError:
            return copy.deepcopy(DEFAULTS[name])
        except (OSError, json.JSONDecodeError):
            # A damaged file is kept aside, never overwritten silently.
            try:
                path.replace(path.with_suffix(".damaged.json"))
            except OSError:
                pass
            return copy.deepcopy(DEFAULTS[name])
        if isinstance(DEFAULTS[name], dict) and isinstance(data, dict):
            merged = copy.deepcopy(DEFAULTS[name])
            merged.update(data)
            return merged
        return data


def write(name: str, data) -> None:
    write_path(_path(name), data)


def write_path(path: Path, data) -> None:
    """Atomic JSON write to any file inside the data folder."""
    with _lock:
        path.parent.mkdir(parents=True, exist_ok=True)
        fd, tmp = tempfile.mkstemp(prefix=f".{path.name}.", suffix=".tmp", dir=str(path.parent))
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=1)
                f.flush()
                os.fsync(f.fileno())
            os.replace(tmp, path)
        except BaseException:
            try:
                os.unlink(tmp)
            except OSError:
                pass
            raise


def update(name: str, fn):
    """Read, change with ``fn(data) -> data``, write; all under the lock. Returns the new data."""
    with _lock:
        data = fn(read(name))
        write(name, data)
        return data

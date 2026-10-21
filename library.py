"""The case library: any number of cases, each its own JSON file in ``<data dir>/cases/<id>.json``.

A case: id, name, resolution, side ("aff" or "neg"), sections (section name -> the student's words),
thread (the coach conversation), helpers (section -> the last helper answer shown under it), backup
(the sections as they were before a case was brought in, or null), created, updated (unix seconds).

Also here: export of one case as .docx (an Office Open XML zip built with the standard library) or
.txt, and a single-file .json backup of every case, with its import. Importing a backup never
overwrites a case: every imported case gets a new id.
"""

from __future__ import annotations

import io
import json
import os
import re
import secrets
import tempfile
import time
import zipfile
from pathlib import Path
from xml.sax.saxutils import escape

try:
    from . import ld_method as M
    from . import store
except ImportError:  # loaded as loose modules
    import ld_method as M  # type: ignore
    import store  # type: ignore

SECTIONS = list(M.IMPORT_SECTIONS)  # reading order
SIDES = ("aff", "neg")
ID_RE = re.compile(r"^[a-f0-9]{12}$")
NAME_LIMIT = 80
CASE_LIMIT = 500
BACKUP_FORMAT = "ld-workbench-backup"


def _dir() -> Path:
    d = store.data_dir() / "cases"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _file(case_id) -> Path:
    if not isinstance(case_id, str) or not ID_RE.match(case_id):
        raise ValueError("Unknown case.")
    return _dir() / f"{case_id}.json"


def _name(name, fallback):
    name = re.sub(r"\s+", " ", str(name or "")).strip()
    if len(name) > NAME_LIMIT:
        raise ValueError("That name is too long.")
    return name or fallback


def _side(side):
    if side not in SIDES:
        raise ValueError("Unknown side.")
    return side


def _resolution(text):
    text = str(text or "").strip()
    if len(text) > 400:
        raise ValueError("The resolution is too long.")
    return text


def _sections(secs):
    if not isinstance(secs, dict):
        raise ValueError("Bad case.")
    out = {}
    for k, v in secs.items():
        if k not in SECTIONS:
            raise ValueError("Unknown section.")
        if not isinstance(v, str) or len(v) > 12000:
            raise ValueError("A case section is too long.")
        out[k] = v
    return out


def blank(name, resolution, side):
    now = round(time.time(), 3)
    return {"id": secrets.token_hex(6), "name": _name(name, f"Untitled {'affirmative' if side == 'aff' else 'negative'} case"),
            "resolution": _resolution(resolution), "side": _side(side), "sections": {}, "thread": [], "helpers": {},
            "backup": None, "created": now, "updated": now}


def get(case_id):
    try:
        data = json.loads(_file(case_id).read_text(encoding="utf-8"))
    except FileNotFoundError:
        raise ValueError("That case is not in your library any more.")
    except json.JSONDecodeError:
        raise RuntimeError("That case file is damaged.")
    return data


def save(case, touch=True):
    if touch:
        case["updated"] = round(time.time(), 3)
    store.write_path(_file(case["id"]), case)
    return case


def summary(c):
    words = sum(len((v or "").split()) for v in (c.get("sections") or {}).values())
    return {k: c.get(k) for k in ("id", "name", "resolution", "side", "created", "updated")} | {"words": words}


def list_cases():
    """Every case, newest edit first."""
    out = []
    for f in _dir().glob("*.json"):
        if not ID_RE.match(f.stem):
            continue
        try:
            out.append(summary(json.loads(f.read_text(encoding="utf-8"))))
        except (OSError, json.JSONDecodeError):
            continue
    return sorted(out, key=lambda c: (c.get("updated") or 0, c.get("created") or 0), reverse=True)


def create(name="", resolution="", side="aff", sections=None):
    with store._lock:
        if len(list(_dir().glob("*.json"))) >= CASE_LIMIT:
            raise ValueError("Your library is full. Delete a case you no longer need.")
        c = blank(name, resolution, side)
        if sections:
            c["sections"] = _sections(sections)
        return save(c)


def change(case_id, fn):
    with store._lock:
        c = get(case_id)
        fn(c)
        return save(c)


def rename(case_id, name):
    return change(case_id, lambda c: c.__setitem__("name", _name(name, c["name"])))


def duplicate(case_id):
    with store._lock:
        src = get(case_id)
        c = blank(_name(f"{src['name']} (copy)"[:NAME_LIMIT], src["name"]), src.get("resolution", ""), src.get("side", "aff"))
        c["sections"] = dict(src.get("sections") or {})
        return save(c)


def delete(case_id):
    with store._lock:
        f = _file(case_id)
        if not f.exists():
            raise ValueError("That case is not in your library any more.")
        f.unlink()


# ---------- export ----------
def _filename(c, ext):
    base = re.sub(r"[^A-Za-z0-9 ._-]+", "", c.get("name") or "case").strip() or "case"
    return f"{base[:60]}.{ext}"


def as_text(c):
    side = "Affirmative" if c.get("side") == "aff" else "Negative"
    lines = [c.get("name") or "Case", f"{side} case", f"Resolution: {c.get('resolution') or ''}", ""]
    for k in SECTIONS:
        text = ((c.get("sections") or {}).get(k) or "").strip()
        if text:
            lines += [k.upper(), text, ""]
    return "\n".join(lines).rstrip() + "\n"


_W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'


def _para(text, style=None):
    ppr = f'<w:pPr><w:pStyle w:val="{style}"/></w:pPr>' if style else ""
    return f'<w:p>{ppr}<w:r><w:t xml:space="preserve">{escape(text)}</w:t></w:r></w:p>'


def as_docx(c):
    """The case as a Word document: title, side and resolution, then each section with a heading, in reading order."""
    side = "Affirmative" if c.get("side") == "aff" else "Negative"
    body = [_para(c.get("name") or "Case", "Title"), _para(f"{side} case"), _para(f"Resolution: {c.get('resolution') or ''}")]
    for k in SECTIONS:
        text = ((c.get("sections") or {}).get(k) or "").strip()
        if text:
            body.append(_para(k, "Heading1"))
            body += [_para(line) for line in text.split("\n")]
    document = (f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document {_W}><w:body>{"".join(body)}'
                '<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" '
                'w:header="720" w:footer="720" w:gutter="0"/></w:sectPr></w:body></w:document>')
    styles = (f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles {_W}>'
              '<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Georgia" w:hAnsi="Georgia"/><w:sz w:val="24"/></w:rPr></w:rPrDefault>'
              '<w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>'
              '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>'
              '<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/>'
              '<w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:b/><w:sz w:val="40"/></w:rPr></w:style>'
              '<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/>'
              '<w:pPr><w:keepNext/><w:spacing w:before="320" w:after="120"/><w:outlineLvl w:val="0"/></w:pPr>'
              '<w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:b/><w:sz w:val="28"/></w:rPr></w:style></w:styles>')
    types = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
             '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
             '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
             '<Default Extension="xml" ContentType="application/xml"/>'
             '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
             '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>'
             '</Types>')
    rels = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'
            '</Relationships>')
    doc_rels = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
                '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
                '</Relationships>')
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", types)
        z.writestr("_rels/.rels", rels)
        z.writestr("word/_rels/document.xml.rels", doc_rels)
        z.writestr("word/document.xml", document)
        z.writestr("word/styles.xml", styles)
    return buf.getvalue()


def backup():
    cases = []
    for s in list_cases():
        try:
            cases.append(get(s["id"]))
        except (ValueError, RuntimeError):
            continue
    return {"format": BACKUP_FORMAT, "version": 1, "exported": int(time.time()), "cases": cases}


def import_backup(data):
    """Add every case in a backup as a new case. Returns the number added."""
    if not isinstance(data, dict) or data.get("format") != BACKUP_FORMAT or not isinstance(data.get("cases"), list):
        raise ValueError("That file is not a Debate Workbench backup.")
    added = 0
    for item in data["cases"][:CASE_LIMIT]:
        if not isinstance(item, dict):
            continue
        c = blank(_name(item.get("name"), "Imported case"), _resolution(item.get("resolution")),
                  item.get("side") if item.get("side") in SIDES else "aff")
        c["sections"] = _sections(item.get("sections") or {})
        thread = item.get("thread") if isinstance(item.get("thread"), list) else []
        c["thread"] = [{"role": t.get("role"), "label": str(t.get("label") or "")[:120], "text": str(t.get("text") or "")[:12000],
                        "section": t.get("section") if t.get("section") in SECTIONS else None}
                       for t in thread[-80:] if isinstance(t, dict) and t.get("role") in ("coach", "you")]
        helpers = item.get("helpers") if isinstance(item.get("helpers"), dict) else {}
        c["helpers"] = {k: {"label": str(v.get("label") or "")[:120], "text": str(v.get("text") or "")[:12000]}
                        for k, v in helpers.items() if k in SECTIONS and isinstance(v, dict)}
        with store._lock:
            if len(list(_dir().glob("*.json"))) >= CASE_LIMIT:
                break
            save(c)
        added += 1
    return added


# ---------- writing an export where the student chose ----------
EXPORT_TYPES = {"docx": "docx", "txt": "txt", "json": "json"}


def export_path(chosen, ext, default_name):
    """Where to write an export. A path from the save dialog must be absolute, inside the home folder, end in
    the right extension, and sit in a folder that exists. With no path, it goes to <data dir>/exports/."""
    if not chosen:
        d = store.data_dir() / "exports"
        d.mkdir(parents=True, exist_ok=True)
        return d / default_name
    p = Path(str(chosen)).expanduser()
    if not p.is_absolute() or ".." in p.parts:
        raise ValueError("Choose a place to save the file.")
    if p.suffix.lower() != f".{ext}":
        p = p.with_suffix(f".{ext}")
    home = Path.home().resolve()
    parent = p.parent.resolve()
    if parent != home and home not in parent.parents:
        raise ValueError("Save the file somewhere in your home folder.")
    if not parent.is_dir():
        raise ValueError("That folder does not exist.")
    return parent / p.name


def write_bytes(path: Path, data: bytes):
    fd, tmp = tempfile.mkstemp(prefix=f".{path.name}.", suffix=".tmp", dir=str(path.parent))
    try:
        with os.fdopen(fd, "wb") as f:
            f.write(data)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, path)
    except BaseException:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise
    return path


def export(case_id, fmt, chosen=None):
    if fmt not in ("docx", "txt"):
        raise ValueError("Unknown file type.")
    c = get(case_id)
    data = as_docx(c) if fmt == "docx" else as_text(c).encode("utf-8")
    return write_bytes(export_path(chosen, fmt, _filename(c, fmt)), data)


def export_backup(chosen=None):
    data = json.dumps(backup(), ensure_ascii=False, indent=1).encode("utf-8")
    return write_bytes(export_path(chosen, "json", time.strftime("ld-workbench-backup-%Y-%m-%d.json")), data)

"""Extemp headlines from both sides: the outlet list, the fetch, the parser and the cache.

For a topic, every outlet on the student's list is searched in parallel through Google News's RSS
search (``site:<domain>``), the one route that reaches AP and Reuters. When that fails, the outlet's
own RSS feed is read and filtered by the topic's words. Only headlines, dates and links are kept; no
article text is fetched. Each outlet succeeds or fails on its own, and the last pull for a topic is
cached so prep never waits on the network.

Lean labels are from the AllSides Media Bias Ratings, checked Nov 7, 2026. The student can edit
every label and the whole list. The page groups outlets by ``side``: left, center (wires and
centrist outlets) and right.
"""

from __future__ import annotations

import email.utils
import http.client
import re
import socket
import ssl
import time
import urllib.parse
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor, wait

try:
    from . import engine, store
except ImportError:  # loose modules (tests)
    import engine  # type: ignore
    import store  # type: ignore

LABELS_CHECKED = "Nov 7, 2026"
SIDES = ("left", "center", "right")
LEANS = ("Left", "Lean Left", "Center", "Lean Right", "Right")
TIMEOUT = 8
DEADLINE = 20  # seconds for the whole pull
BYTES_CAP = 250_000
PER_OUTLET = 5
TOPIC_CAP = 20
MAX_OUTLETS = 16
GOOGLE = "news.google.com"

# name, domain, side, AllSides label, own feed (https) or "", a note shown with the label
DEFAULT_OUTLETS = [
    {"id": "npr", "name": "NPR", "domain": "npr.org", "side": "left", "lean": "Lean Left", "feed": "https://feeds.npr.org/1001/rss.xml"},
    {"id": "nyt", "name": "The New York Times", "domain": "nytimes.com", "side": "left", "lean": "Lean Left",
     "feed": "https://rss.nytimes.com/services/xml/rss/nyt/Politics.xml", "note": "News pages"},
    {"id": "atlantic", "name": "The Atlantic", "domain": "theatlantic.com", "side": "left", "lean": "Left",
     "feed": "https://www.theatlantic.com/feed/all/", "note": "A magazine, opposite National Review"},
    {"id": "wamonthly", "name": "Washington Monthly", "domain": "washingtonmonthly.com", "side": "left", "lean": "Lean Left",
     "feed": "https://washingtonmonthly.com/feed/", "note": "A magazine, opposite City Journal"},
    {"id": "reuters", "name": "Reuters", "domain": "reuters.com", "side": "center", "lean": "Center", "feed": "", "note": "Wire"},
    {"id": "ap", "name": "Associated Press", "domain": "apnews.com", "side": "center", "lean": "Lean Left", "feed": "",
     "note": "Wire. AllSides has moved it between Center and Lean Left"},
    {"id": "unherd", "name": "UnHerd", "domain": "unherd.com", "side": "center", "lean": "Center", "feed": "https://unherd.com/feed/",
     "note": "AllSides moved it from Lean Right to Center in 2023; low confidence"},
    {"id": "examiner", "name": "Washington Examiner", "domain": "washingtonexaminer.com", "side": "right", "lean": "Lean Right",
     "feed": "https://www.washingtonexaminer.com/feed/"},
    {"id": "wtimes", "name": "The Washington Times", "domain": "washingtontimes.com", "side": "right", "lean": "Lean Right",
     "feed": "https://www.washingtontimes.com/rss/headlines/news/politics/"},
    {"id": "nr", "name": "National Review", "domain": "nationalreview.com", "side": "right", "lean": "Lean Right",
     "feed": "https://www.nationalreview.com/feed/", "note": "News pages; AllSides rates its opinion pages Right"},
    {"id": "cityjournal", "name": "City Journal", "domain": "city-journal.org", "side": "right", "lean": "Right", "feed": "",
     "note": "Manhattan Institute; low confidence"},
    {"id": "aei", "name": "AEI", "domain": "aei.org", "side": "right", "lean": "Lean Right", "feed": "https://www.aei.org/feed/",
     "note": "American Enterprise Institute, a think tank; low confidence"},
]
# Offered under "Add an outlet", with labels checked the same day.
# Brookings has no feed of its own (its /feed/ address redirects to the home page); Google News reaches it.
SUGGESTED = [
    {"name": "Brookings", "domain": "brookings.edu", "side": "center", "lean": "Center", "feed": "", "note": "A think tank, opposite AEI"},
    {"name": "The Wall Street Journal", "domain": "wsj.com", "side": "center", "lean": "Center", "feed": "https://feeds.a.dj.com/rss/RSSWorldNews.xml", "note": "News pages"},
]

DOMAIN_RE = re.compile(r"^(?=.{4,80}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$")


def clean_outlet(o, i=0):
    if not isinstance(o, dict):
        raise ValueError("That outlet could not be read.")
    name = " ".join(str(o.get("name") or "").split())[:60]
    domain = str(o.get("domain") or "").strip().lower().removeprefix("https://").removeprefix("http://").removeprefix("www.").rstrip("/")
    if not name:
        raise ValueError("Give the outlet a name.")
    if not DOMAIN_RE.match(domain):
        raise ValueError(f"{name}: give its web address, like npr.org.")
    side = o.get("side") if o.get("side") in SIDES else "center"
    lean = o.get("lean") if o.get("lean") in LEANS else {"left": "Lean Left", "right": "Lean Right"}.get(side, "Center")
    feed = str(o.get("feed") or "").strip()
    if feed and not feed.startswith("https://"):
        raise ValueError(f"{name}: its feed must start with https://.")
    oid = re.sub(r"[^a-z0-9]+", "-", str(o.get("id") or domain).lower()).strip("-")[:40] or f"outlet-{i}"
    return {"id": oid, "name": name, "domain": domain, "side": side, "lean": lean, "feed": feed[:300],
            "note": " ".join(str(o.get("note") or "").split())[:160]}


def outlets():
    saved = store.read("outlets.json").get("outlets")
    return saved if isinstance(saved, list) and saved else [dict(o, note=o.get("note", "")) for o in DEFAULT_OUTLETS]


def save_outlets(items):
    if not isinstance(items, list) or not items:
        raise ValueError("Keep at least one outlet.")
    if len(items) > MAX_OUTLETS:
        raise ValueError(f"Keep {MAX_OUTLETS} outlets or fewer.")
    cleaned, seen = [], set()
    for i, o in enumerate(items):
        c = clean_outlet(o, i)
        while c["id"] in seen:
            c["id"] += "-2"
        seen.add(c["id"])
        cleaned.append(c)
    store.write("outlets.json", {"outlets": cleaned, "edited": int(time.time())})
    return cleaned


def reset_outlets():
    store.write("outlets.json", {"outlets": None})
    return outlets()


LEAN_GROUP = {"Left": "left", "Lean Left": "left", "Center": "center", "Lean Right": "right", "Right": "right"}


def balance(items):
    """How many outlets sit in each column, and how many lean each way by AllSides label (a wire can sit in
    the center column with a Lean Left label). The page warns when one side has twice the other."""
    n = {s: 0 for s in SIDES}
    by_label = {s: 0 for s in SIDES}
    for o in items:
        n[o["side"]] = n.get(o["side"], 0) + 1
        by_label[LEAN_GROUP.get(o.get("lean"), "center")] += 1
    lopsided = bool(n["left"] or n["right"]) and (n["left"] >= 2 * max(1, n["right"]) or n["right"] >= 2 * max(1, n["left"]))
    return {"counts": n, "by_label": by_label, "lopsided": lopsided}


# ---------- fetching ----------
def google_url(topic, domain):
    q = f"{topic} site:{domain} when:30d"
    return "https://news.google.com/rss/search?" + urllib.parse.urlencode({"q": q, "hl": "en-US", "gl": "US", "ceid": "US:en"})


def allowed_hosts(items):
    hosts = {GOOGLE}
    for o in items:
        if o.get("feed"):
            hosts.add(urllib.parse.urlparse(o["feed"]).hostname or "")
    return hosts


def fetch(url, hosts, timeout=TIMEOUT, cap=BYTES_CAP, hops=3):
    """GET an https URL on a listed host, connecting only to an address that passed the public check."""
    for _ in range(hops + 1):
        u = urllib.parse.urlparse(url)
        if u.scheme != "https" or (u.hostname or "") not in hosts:
            raise RuntimeError("not a listed host")
        ip = engine.checked_ip(u.hostname)
        if not ip:
            raise RuntimeError("not a public address")
        conn = http.client.HTTPSConnection(u.hostname, u.port or 443, timeout=timeout, context=ssl.create_default_context())
        raw = socket.create_connection((ip, u.port or 443), timeout=timeout)
        conn.sock = conn._context.wrap_socket(raw, server_hostname=u.hostname)
        try:
            conn.request("GET", (u.path or "/") + (f"?{u.query}" if u.query else ""),
                         headers={"Host": u.netloc, "User-Agent": "Mozilla/5.0 (Debate Workbench headline reader)",
                                  "Accept": "application/rss+xml, application/xml, text/xml"})
            r = conn.getresponse()
            if r.status in (301, 302, 303, 307, 308) and r.getheader("Location"):
                url = urllib.parse.urljoin(url, r.getheader("Location"))
                continue
            if r.status != 200:
                raise RuntimeError(f"status {r.status}")
            return r.read(cap)
        finally:
            conn.close()
    raise RuntimeError("too many redirects")


def _date(s):
    try:
        d = email.utils.parsedate_to_datetime(s)
        return int(d.timestamp())
    except (TypeError, ValueError, IndexError):
        pass
    m = re.match(r"(\d{4})-(\d{2})-(\d{2})", s or "")
    if m:
        try:
            return int(time.mktime(time.strptime(m.group(0), "%Y-%m-%d")))
        except ValueError:
            return None
    return None


def _unprefix(chunk):
    """A lone <item> cut from a feed loses the root's namespace declarations, so <media:content> or
    xml:lang no longer parse. Drop the prefixes: the parser only reads plain names (title, link, pubDate)."""
    chunk = re.sub(r"(</?)[A-Za-z_][\w.-]*:(?=[A-Za-z_])", r"\1", chunk)
    return re.sub(r"(\s)[A-Za-z_][\w.-]*:([A-Za-z_][\w.-]*\s*=)", r"\1\2", chunk)


def parse_feed(raw):
    """Items from RSS or Atom: [{title, url, at, source}]. Refuses a document with a DTD, so no
    entity can expand. A cut-off document (the byte cap) keeps the items that closed before the cut."""
    text = raw.decode("utf-8", errors="replace") if isinstance(raw, bytes) else str(raw)
    if re.search(r"<!DOCTYPE|<!ENTITY", text[:4000], re.I):
        raise RuntimeError("feed has a DTD")
    try:
        root = ET.fromstring(text)
        nodes = root.iter()
    except ET.ParseError:
        nodes = []
        for chunk in re.findall(r"<item\b.*?</item>|<entry\b.*?</entry>", text, re.S):
            try:
                nodes.append(ET.fromstring(_unprefix(chunk)))
            except ET.ParseError:
                continue
        nodes = [n for c in nodes for n in c.iter()]
    items = []
    for el in nodes:
        tag = el.tag.split("}")[-1]
        if tag not in ("item", "entry"):
            continue
        get = {c.tag.split("}")[-1]: c for c in el}
        title = " ".join((get["title"].text or "").split()) if "title" in get and get["title"].text else ""
        link = ""
        if "link" in get:
            link = (get["link"].text or get["link"].get("href") or "").strip()
        when = ""
        for k in ("pubDate", "published", "updated", "date"):
            if k in get and get[k].text:
                when = get[k].text.strip()
                break
        source = (get["source"].text or "").strip() if "source" in get and get["source"].text else ""
        if title and link.startswith("https://"):
            items.append({"title": title[:300], "url": link[:1000], "at": _date(when), "source": source[:80]})
    return items


def strip_outlet(title, outlet):
    """Google News ends titles with " - Outlet name", sometimes twice ("- American Enterprise Institute - AEI")."""
    parts = title.rsplit(" - ", 1)
    if len(parts) == 2 and len(parts[1]) <= 60:
        title = parts[0].strip()
        known = " ".join([outlet.get("name", ""), outlet.get("domain", "").split(".")[0], re.split(r"[,;]", outlet.get("note", ""))[0]])
        names = {w for w in re.findall(r"[a-z]+", known.lower()) if len(w) >= 3}
        again = title.rsplit(" - ", 1)
        if len(again) == 2 and len(again[1]) <= 40 and names & set(re.findall(r"[a-z]+", again[1].lower())):
            title = again[0].strip()
    return title


INDEX_PAGE = re.compile(r"^(tags?|topics?|category|author|archives?)\s*[:|]|\barchives?$|^page \d+", re.I)


def tidy(items, topic=""):
    """Drop index pages ("Tag: Tariffs", "Mexico Archives", a bare "Federal Reserve" for that topic) and repeated titles."""
    out, seen = [], set()
    bare = set(topic_words(topic)) if topic else set()
    for i in items:
        key = re.sub(r"\W+", " ", i["title"].lower()).strip()
        if bare and set(topic_words(i["title"])) == bare and len(key.split()) <= len(bare) + 1:
            continue
        if not key or key in seen or INDEX_PAGE.search(i["title"].strip()):
            continue
        seen.add(key)
        out.append(i)
    return out


def rank(items, words):
    """Titles that name the topic first, otherwise Google's own order (its relevance), newest first among ties."""
    return sorted(enumerate(items), key=lambda p: (not matches(p[1]["title"], words), p[0]))


def topic_words(topic):
    return [w for w in re.findall(r"[a-z0-9']+", topic.lower()) if len(w) > 2 and w not in ("the", "and", "for", "with", "new", "its")]


def matches(title, words):
    t = title.lower()
    return not words or sum(1 for w in words if w in t) >= max(1, (len(words) + 1) // 2)


def pull_outlet(o, topic, hosts, getter=fetch):
    """One column: {id, ok, items, via, error}. Google News first, then the outlet's own feed."""
    errors = []
    try:
        raw = getter(google_url(topic, o["domain"]), hosts)
        items = tidy([dict(i, title=strip_outlet(i["title"], o)) for i in parse_feed(raw)], topic)
        if items:
            items = [i for _, i in rank(items, topic_words(topic))]
            return {"id": o["id"], "ok": True, "items": items[:PER_OUTLET], "via": "Google News", "error": None}
        errors.append("no matches")
    except Exception as e:
        errors.append(str(e))
    if o.get("feed"):
        try:
            words = topic_words(topic)
            items = [i for i in tidy(parse_feed(getter(o["feed"], hosts)), topic) if matches(i["title"], words)]
            items.sort(key=lambda i: i["at"] or 0, reverse=True)
            return {"id": o["id"], "ok": True, "items": items[:PER_OUTLET], "via": "own feed", "error": None}
        except Exception as e:
            errors.append(str(e))
    if errors == ["no matches"]:
        return {"id": o["id"], "ok": True, "items": [], "via": "Google News", "error": None}
    return {"id": o["id"], "ok": False, "items": [], "via": None, "error": f"{o['name']} did not answer. Try again."}


def clean_topic(topic):
    t = " ".join(str(topic or "").split())
    if len(t) < 3:
        raise ValueError("Type a topic first, like \"tariffs\" or \"the Federal Reserve\".")
    if len(t) > 120:
        raise ValueError("Keep the topic under 120 characters.")
    return t


def pull(topic, getter=fetch, deadline=None):
    """Every outlet at once, each with its own timeout; the result is cached for the topic."""
    topic = clean_topic(topic)
    deadline = DEADLINE if deadline is None else deadline
    items = outlets()
    hosts = allowed_hosts(items)
    # The socket timeout bounds each read, not a whole fetch: a server that drips a byte every few seconds
    # could hold a column for minutes. The pull as a whole stops at DEADLINE; a late column fails alone.
    ex = ThreadPoolExecutor(max_workers=min(MAX_OUTLETS, len(items)), thread_name_prefix="ldw-headlines")  # one per column, so none waits in a queue
    futures = [ex.submit(pull_outlet, o, topic, hosts, getter) for o in items]
    wait(futures, timeout=deadline)
    columns = []
    for o, f in zip(items, futures):
        if f.done() and not f.cancelled() and f.exception() is None:
            columns.append(f.result())
        else:
            columns.append({"id": o["id"], "ok": False, "items": [], "via": None, "error": f"{o['name']} did not answer in time. Try again."})
    ex.shutdown(wait=False, cancel_futures=True)
    result = {"topic": topic, "at": int(time.time()), "columns": columns, "outlets": items, "labels_checked": LABELS_CHECKED}
    key = topic.lower()

    def keep(h):
        h["topics"][key] = result
        for old in sorted(h["topics"], key=lambda k: h["topics"][k].get("at", 0))[:-TOPIC_CAP]:
            del h["topics"][old]
        return h
    if any(c["ok"] and c["items"] for c in columns):
        store.update("headlines.json", keep)
    return result


def cached(topic):
    try:
        topic = clean_topic(topic)
    except ValueError:
        return None
    return store.read("headlines.json")["topics"].get(topic.lower())


def recent_topics():
    t = store.read("headlines.json")["topics"]
    return [{"topic": v["topic"], "at": v["at"]} for v in sorted(t.values(), key=lambda v: v.get("at", 0), reverse=True)]

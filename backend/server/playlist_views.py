"""Playlist-related HTTP views for Beatify."""

from __future__ import annotations

import asyncio
import json
import logging
import re
import unicodedata
from datetime import datetime, timezone
from pathlib import Path

import aiohttp
from aiohttp import web, ClientTimeout

from game.playlist import validate_playlist
from server.base import RateLimitMixin, _json_error, get_app_data

_LOGGER = logging.getLogger(__name__)

_DECLINED_LABELS = frozenset({"declined", "wont-fix", "wontfix", "duplicate", "invalid"})
_VERSION_LABEL_RE = re.compile(r"^v?(\d+\.\d+\.\d+\S*)$")

GITHUB_ISSUES_API = "https://api.github.com/repos/mholzi/beatify/issues"
POLL_INTERVAL_SECONDS = 3600
POLL_TIMEOUT_SECONDS = 12
MAX_REQUESTS = 100
MAX_FIELD_LENGTH = 500
RATE_LIMIT_REQUESTS = 10
RATE_LIMIT_WINDOW = 60

_rate_limits: dict[str, list[float]] = {}
_rate_limit_last_sweep: float = 0.0


def _check_rate_limit(ip: str) -> bool:
    import time
    now = time.time()
    cutoff = now - RATE_LIMIT_WINDOW
    global _rate_limit_last_sweep
    if now - _rate_limit_last_sweep > 300:
        for k in list(_rate_limits.keys()):
            _rate_limits[k] = [t for t in _rate_limits[k] if t > cutoff]
            if not _rate_limits[k]:
                del _rate_limits[k]
        _rate_limit_last_sweep = now
    times = [t for t in _rate_limits.get(ip, []) if t > cutoff]
    _rate_limits[ip] = times
    if len(times) >= RATE_LIMIT_REQUESTS:
        return False
    times.append(now)
    return True


def _issue_to_status(state: str, state_reason: str, labels: list[str]) -> tuple[str, str | None]:
    if state != "closed":
        return "pending", None
    if state_reason == "not_planned" or any(label.lower() in _DECLINED_LABELS for label in labels):
        return "declined", None
    version: str | None = None
    for label in labels:
        match = _VERSION_LABEL_RE.match(label.strip())
        if match:
            version = match.group(1)
            break
    return "ready", version


def _sanitize_item(item: object) -> dict | None:
    if not isinstance(item, dict):
        return None
    sanitized = {}
    for key, value in item.items():
        if not isinstance(key, str) or len(key) > 50:
            continue
        if isinstance(value, str):
            sanitized[key] = value[:MAX_FIELD_LENGTH]
        elif isinstance(value, (int, float, bool)):
            sanitized[key] = value
    return sanitized if sanitized else None


def _load_requests(storage_path: Path) -> dict:
    if storage_path.exists():
        try:
            return json.loads(storage_path.read_text(encoding="utf-8"))
        except Exception as e:  # noqa: BLE001
            _LOGGER.error("Failed to load playlist requests: %s", e)
    return {"requests": [], "last_poll": None}


def _save_requests(storage_path: Path, data: dict) -> bool:
    try:
        storage_path.parent.mkdir(parents=True, exist_ok=True)
        storage_path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
        return True
    except Exception as e:  # noqa: BLE001
        _LOGGER.error("Failed to save playlist requests: %s", e)
        return False


def _poll_due(data: dict) -> bool:
    last_poll = data.get("last_poll")
    if not last_poll:
        return True
    try:
        last = datetime.fromisoformat(str(last_poll).replace("Z", "+00:00"))
    except ValueError:
        return True
    if last.tzinfo is None:
        last = last.replace(tzinfo=timezone.utc)
    return (datetime.now(timezone.utc) - last).total_seconds() >= POLL_INTERVAL_SECONDS


async def _fetch_issue(session: aiohttp.ClientSession, issue_number: object) -> tuple[str, str, list[str]] | None:
    try:
        async with session.get(
            f"{GITHUB_ISSUES_API}/{issue_number}",
            headers={"Accept": "application/vnd.github+json"},
            timeout=ClientTimeout(total=POLL_TIMEOUT_SECONDS),
        ) as resp:
            if resp.status != 200:
                return None
            issue = await resp.json()
        labels = [label.get("name", "") for label in issue.get("labels", []) if isinstance(label, dict)]
        return issue.get("state", ""), issue.get("state_reason") or "", labels
    except Exception as err:  # noqa: BLE001
        _LOGGER.debug("Playlist-request poll: issue %s failed: %s", issue_number, err)
        return None


async def _poll_statuses(data: dict) -> dict:
    now = datetime.now(timezone.utc).isoformat()
    data["last_poll"] = now

    requests = data.get("requests", [])
    pending = [
        r for r in requests
        if isinstance(r, dict) and r.get("issue_number") and r.get("status") in (None, "", "pending", "ready")
    ]
    if not pending:
        return data

    async with aiohttp.ClientSession() as session:
        try:
            results = await asyncio.wait_for(
                asyncio.gather(*(_fetch_issue(session, r["issue_number"]) for r in pending)),
                timeout=POLL_TIMEOUT_SECONDS,
            )
        except Exception as err:  # noqa: BLE001
            _LOGGER.debug("Playlist-request poll aborted: %s", err)
            return data

    for req, result in zip(pending, results):
        if result is None:
            continue
        state, state_reason, labels = result
        status, version = _issue_to_status(state, state_reason, labels)
        req["status"] = status
        req["last_checked"] = now
        if version:
            req["release_version"] = version
    return data


async def playlist_requests_get(request: web.Request) -> web.Response:
    """GET /beatify/api/playlist-requests"""
    app_data = get_app_data(request)
    storage_path = Path(app_data.get("data_dir", ".")) / "playlist_requests.json"
    data = _load_requests(storage_path)
    if _poll_due(data):
        try:
            data = await _poll_statuses(data)
            _save_requests(storage_path, data)
        except Exception as err:  # noqa: BLE001
            _LOGGER.debug("Playlist-request status poll failed: %s", err)
    return web.json_response(data)


async def playlist_requests_post(request: web.Request) -> web.Response:
    """POST /beatify/api/playlist-requests"""
    client_ip = request.remote or "unknown"
    if not _check_rate_limit(client_ip):
        return _json_error("Too many requests", 429, code="RATE_LIMITED")

    try:
        body = await request.json()
    except Exception:  # noqa: BLE001
        return _json_error("Invalid JSON", 400, code="INVALID_REQUEST")

    if not isinstance(body.get("requests"), list):
        return _json_error("Missing or invalid requests array", 400, code="INVALID_REQUEST")

    raw_requests = body["requests"][:MAX_REQUESTS]
    sanitized = [clean for item in raw_requests if (clean := _sanitize_item(item)) is not None]
    data = {"requests": sanitized, "last_poll": body.get("last_poll")}

    app_data = get_app_data(request)
    storage_path = Path(app_data.get("data_dir", ".")) / "playlist_requests.json"
    if not _save_requests(storage_path, data):
        return _json_error("Failed to save request", 500, code="SAVE_FAILED")

    return web.json_response({"success": True, "requests": data["requests"]})


# ---------------------------------------------------------------------------
# Save-locally endpoint for the Playlist Generator
# ---------------------------------------------------------------------------

_SLUG_INVALID_RE = re.compile(r"[^a-z0-9]+")

_save_rate_limits: dict[str, list[float]] = {}
_save_rate_limit_last_sweep: float = 0.0
SAVE_RATE_LIMIT_REQUESTS = 5
SAVE_RATE_LIMIT_WINDOW = 60
MAX_SONGS = 1000


def _check_save_rate_limit(ip: str) -> bool:
    import time
    now = time.time()
    cutoff = now - SAVE_RATE_LIMIT_WINDOW
    global _save_rate_limit_last_sweep
    if now - _save_rate_limit_last_sweep > 300:
        for k in list(_save_rate_limits.keys()):
            _save_rate_limits[k] = [t for t in _save_rate_limits[k] if t > cutoff]
            if not _save_rate_limits[k]:
                del _save_rate_limits[k]
        _save_rate_limit_last_sweep = now
    times = [t for t in _save_rate_limits.get(ip, []) if t > cutoff]
    _save_rate_limits[ip] = times
    if len(times) >= SAVE_RATE_LIMIT_REQUESTS:
        return False
    times.append(now)
    return True


def _slugify_playlist_name(name: str) -> str:
    s = (name or "").lower().strip()
    s = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = _SLUG_INVALID_RE.sub("-", s).strip("-")
    return s[:60] or "untitled-playlist"


async def save_playlist(request: web.Request) -> web.Response:
    """POST /beatify/api/playlists/save"""
    client_ip = request.remote or "unknown"
    if not _check_save_rate_limit(client_ip):
        return _json_error("Too many requests", 429, code="RATE_LIMITED")

    try:
        body = await request.json()
    except Exception:  # noqa: BLE001
        return _json_error("Invalid JSON", 400, code="INVALID_REQUEST")

    if not isinstance(body, dict):
        return _json_error("Invalid request body", 400, code="INVALID_REQUEST")

    playlist = body.get("playlist")
    if not isinstance(playlist, dict):
        return _json_error("Missing 'playlist' object", 400, code="INVALID_REQUEST")

    songs = playlist.get("songs")
    if isinstance(songs, list) and len(songs) > MAX_SONGS:
        return _json_error(f"Too many songs (max {MAX_SONGS})", 400, code="TOO_LARGE")

    is_valid, errors = validate_playlist(playlist)
    if not is_valid:
        return _json_error(
            "Playlist validation failed: " + "; ".join(errors[:5]),
            400,
            code="INVALID_PLAYLIST",
        )

    app_data = get_app_data(request)
    playlist_dir = Path(app_data.get("playlist_dir", "."))
    slug = _slugify_playlist_name(playlist.get("name", ""))
    user_dir = playlist_dir / "user"

    try:
        user_dir.mkdir(parents=True, exist_ok=True)
        target = user_dir / f"{slug}.json"
        final = target
        counter = 2
        while final.exists():
            final = user_dir / f"{slug}-{counter}.json"
            counter += 1
        final.write_text(json.dumps(playlist, indent=2, ensure_ascii=False), encoding="utf-8")
    except Exception as err:  # noqa: BLE001
        _LOGGER.error("Failed to save user playlist: %s", err)
        return _json_error("Failed to save playlist", 500, code="SAVE_FAILED")

    return web.json_response({"success": True, "path": str(final), "filename": final.name})

"""Analytics, stats, and dashboard HTTP views for Beatify."""

from __future__ import annotations

import logging
import time
from pathlib import Path

from aiohttp import web

from server.base import RateLimitMixin, _get_html, _json_error, get_app_data

_LOGGER = logging.getLogger(__name__)

_FRONTEND_DIR = Path(__file__).parent.parent.parent / "frontend"


async def dashboard_page(request: web.Request) -> web.Response:
    html_path = _FRONTEND_DIR / "dashboard.html"
    content = _get_html(html_path)
    if content is None:
        return web.Response(text="Dashboard page not found", status=404)
    return web.Response(text=content, content_type="text/html")


async def analytics_page(request: web.Request) -> web.Response:
    html_path = _FRONTEND_DIR / "analytics.html"
    content = _get_html(html_path)
    if content is None:
        return web.Response(text="Analytics page not found", status=404)
    return web.Response(text=content, content_type="text/html")


async def stats_api(request: web.Request) -> web.Response:
    app_data = get_app_data(request)
    stats_service = app_data.get("stats")

    if not stats_service:
        return web.json_response(
            {"summary": {"games_played": 0, "highest_avg_score": 0.0, "all_time_avg": 0.0}, "history": []}
        )

    summary = await stats_service.get_summary()
    history = await stats_service.get_history(limit=10)
    return web.json_response({"summary": summary, "history": history})


_analytics_cache: dict | None = None
_analytics_cache_time: float = 0
_analytics_cache_period: str | None = None
_ANALYTICS_CACHE_TTL = 60.0


async def analytics_api(request: web.Request) -> web.Response:
    global _analytics_cache, _analytics_cache_time, _analytics_cache_period

    app_data = get_app_data(request)
    period = request.query.get("period", "30d")
    if period not in ("7d", "30d", "90d", "all"):
        period = "30d"

    analytics = app_data.get("analytics")
    if not analytics:
        return web.json_response(
            {"period": period, "total_games": 0, "avg_players_per_game": 0,
             "avg_score": 0, "error_rate": 0, "trends": {}, "generated_at": int(time.time())}
        )

    now = time.time()
    if (_analytics_cache and _analytics_cache_period == period
            and (now - _analytics_cache_time) < _ANALYTICS_CACHE_TTL):
        return web.json_response(_analytics_cache)

    data = analytics.compute_metrics(period)
    _analytics_cache = data
    _analytics_cache_time = now
    _analytics_cache_period = period
    return web.json_response(data)


_song_stats_cache: dict | None = None
_song_stats_cache_time: float = 0
_song_stats_cache_playlist: str | None = None
_SONG_STATS_TTL = 60.0


async def song_stats_api(request: web.Request) -> web.Response:
    global _song_stats_cache, _song_stats_cache_time, _song_stats_cache_playlist

    app_data = get_app_data(request)
    playlist_filter = request.query.get("playlist")
    stats_service = app_data.get("stats")

    if not stats_service:
        return web.json_response({"most_played": None, "hardest": None, "easiest": None, "by_playlist": []})

    now = time.time()
    if (_song_stats_cache and _song_stats_cache_playlist == playlist_filter
            and (now - _song_stats_cache_time) < _SONG_STATS_TTL):
        return web.json_response(_song_stats_cache)

    data = stats_service.compute_song_stats(playlist_filter)
    _song_stats_cache = data
    _song_stats_cache_time = now
    _song_stats_cache_playlist = playlist_filter
    return web.json_response(data)


_usage_cache: dict[str, tuple[float, list]] = {}
_USAGE_CACHE_TTL = 30.0


async def usage_api(request: web.Request) -> web.Response:
    app_data = get_app_data(request)
    kind = request.query.get("kind", "top")
    if kind not in ("top", "recent"):
        return _json_error("kind must be 'top' or 'recent'", 400, code="BAD_REQUEST")

    try:
        limit = int(request.query.get("limit", "8" if kind == "top" else "12"))
    except (TypeError, ValueError):
        return _json_error("limit must be an integer", 400, code="BAD_REQUEST")
    limit = max(1, min(limit, 50))

    analytics = app_data.get("analytics")
    if not analytics:
        return web.json_response({"kind": kind, "limit": limit, "items": []})

    cache_key = f"{kind}:{limit}"
    now = time.time()
    cached = _usage_cache.get(cache_key)
    if cached and (now - cached[0]) < _USAGE_CACHE_TTL:
        return web.json_response({"kind": kind, "limit": limit, "items": cached[1]})

    items = analytics.get_top_playlists(limit=limit) if kind == "top" else analytics.get_recent_playlists(limit=limit)
    _usage_cache[cache_key] = (now, items)
    return web.json_response({"kind": kind, "limit": limit, "items": items})

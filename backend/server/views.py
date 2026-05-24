"""Core HTTP views for Beatify standalone (admin, player, status)."""

from __future__ import annotations

import asyncio
import logging
from pathlib import Path

import aiohttp
from aiohttp import ClientTimeout, web

from config import VERSION, PLAYLISTS_DIR
from game.playlist import discover_playlists
from server.base import _get_html, _json_error, get_app_data
from server.serializers import build_status_response

_LOGGER = logging.getLogger(__name__)

_FRONTEND_DIR = Path(__file__).parent.parent.parent / "frontend"

_NO_CACHE_HEADERS = {
    "Cache-Control": "no-cache, no-store, must-revalidate",
    "Pragma": "no-cache",
    "Expires": "0",
}


def _html_response(text: str) -> web.Response:
    return web.Response(text=text, content_type="text/html", headers=_NO_CACHE_HEADERS)


async def admin_page(request: web.Request) -> web.Response:
    html_path = _FRONTEND_DIR / "admin.html"
    content = _get_html(html_path)
    if content is None:
        return web.Response(text="Admin page not found", status=500)
    return _html_response(content)


async def player_page(request: web.Request) -> web.Response:
    html_path = _FRONTEND_DIR / "player.html"
    content = _get_html(html_path)
    if content is None:
        return web.Response(text="Player page not found", status=500)
    return _html_response(content)


async def sw_js(request: web.Request) -> web.Response:
    sw_path = _FRONTEND_DIR / "sw.js"
    if not sw_path.exists():
        return web.Response(text="Service worker not found", status=500)
    content = sw_path.read_text(encoding="utf-8")
    return web.Response(text=content, content_type="application/javascript", headers=_NO_CACHE_HEADERS)


async def status_api(request: web.Request) -> web.Response:
    app_data = get_app_data(request)
    playlists = discover_playlists(PLAYLISTS_DIR)
    app_data["playlists"] = playlists

    spotify_token = app_data.get("spotify_access_token")
    status = build_status_response(
        app_data,
        version=VERSION,
        playlists=playlists,
        spotify_connected=bool(spotify_token),
    )
    return web.json_response(status)


async def albumart_proxy(request: web.Request) -> web.Response:
    """Same-origin proxy for album art URLs."""
    raw_url = request.query.get("url", "")
    if not raw_url.startswith(("http://", "https://")):
        return web.Response(status=400, text="invalid url")

    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(raw_url, timeout=ClientTimeout(total=10)) as resp:
                if resp.status != 200:
                    return web.Response(status=resp.status)
                body = await resp.read()
                content_type = resp.headers.get("Content-Type", "image/jpeg")
    except (aiohttp.ClientError, asyncio.TimeoutError):
        return web.Response(status=502, text="upstream fetch failed")

    return web.Response(
        body=body,
        content_type=content_type,
        headers={"Cache-Control": "public, max-age=86400"},
    )

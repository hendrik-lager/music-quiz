"""aiohttp application factory for Beatify standalone."""

from __future__ import annotations

import logging
from pathlib import Path

from aiohttp import web

from analytics import AnalyticsStorage
from config import DATA_DIR, FRONTEND_DIR, PLAYLISTS_DIR, SECRET_KEY
from game.state import GameState
from game.service import GameService
from server.base import APP_KEY
from server.websocket import BeatifyWebSocketHandler
from services.stats import StatsService
from spotify.player import SpotifyPlayerService

_LOGGER = logging.getLogger(__name__)


async def _websocket_route(request: web.Request) -> web.WebSocketResponse:
    handler: BeatifyWebSocketHandler = request.app[APP_KEY]["ws_handler"]
    return await handler.handle(request)


def create_app() -> web.Application:
    """Create and configure the aiohttp Application."""
    app = web.Application()

    # --- App state ---
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    analytics = AnalyticsStorage(DATA_DIR)
    stats = StatsService(DATA_DIR)
    stats.set_analytics(analytics)

    spotify_service = SpotifyPlayerService()

    game_state = GameState()
    game_service = GameService(game_state, stats_service=stats)

    app_data: dict = {
        "game": game_state,
        "game_service": game_service,
        "stats": stats,
        "analytics": analytics,
        "spotify_service": spotify_service,
        "playlist_dir": PLAYLISTS_DIR,
        "data_dir": DATA_DIR,
        "secret_key": SECRET_KEY,
        "spotify_access_token": None,
        "spotify_refresh_token": None,
        "spotify_expires_at": 0,
    }
    app[APP_KEY] = app_data

    ws_handler = BeatifyWebSocketHandler(app_data)
    app_data["ws_handler"] = ws_handler

    # --- Routes ---
    _register_routes(app)

    # --- Static files ---
    if FRONTEND_DIR.exists():
        app.router.add_static("/beatify/static/", path=FRONTEND_DIR, name="static")

    # --- Startup/cleanup ---
    app.on_startup.append(_on_startup)
    app.on_cleanup.append(_on_cleanup)

    return app


def _register_routes(app: web.Application) -> None:
    from server.views import (
        admin_page,
        player_page,
        sw_js,
        status_api,
        capabilities_api,
        albumart_proxy,
    )
    from server.game_views import (
        start_game,
        end_game,
        force_reset,
        rematch_game,
        start_gameplay,
        game_status,
    )
    from server.stats_views import (
        dashboard_page,
        analytics_page,
        stats_api,
        analytics_api,
        song_stats_api,
        usage_api,
    )
    from server.playlist_views import (
        playlist_requests_get,
        playlist_requests_post,
        save_playlist,
    )
    from spotify.auth import (
        spotify_login,
        spotify_callback,
        spotify_refresh_endpoint,
        spotify_token_endpoint,
    )

    r = app.router

    # HTML pages
    r.add_get("/beatify/admin", admin_page)
    r.add_get("/beatify/player", player_page)
    r.add_get("/beatify/dashboard", dashboard_page)
    r.add_get("/beatify/analytics", analytics_page)
    r.add_get("/beatify/sw.js", sw_js)

    # WebSocket
    r.add_get("/beatify/ws", _websocket_route)

    # Status / core API
    r.add_get("/beatify/api/status", status_api)
    r.add_get("/beatify/api/capabilities", capabilities_api)
    r.add_get("/beatify/api/game/status", game_status)
    r.add_get("/beatify/api/albumart", albumart_proxy)

    # Game control (URLs match original Beatify frontend)
    r.add_post("/beatify/api/start-game", start_game)
    r.add_post("/beatify/api/end-game", end_game)
    r.add_post("/beatify/api/force-reset", force_reset)
    r.add_post("/beatify/api/rematch-game", rematch_game)
    r.add_post("/beatify/api/start-gameplay", start_gameplay)
    r.add_get("/beatify/api/game/status", game_status)

    # Stats & analytics (URLs match original Beatify frontend)
    r.add_get("/beatify/api/stats", stats_api)
    r.add_get("/beatify/api/analytics", analytics_api)
    r.add_get("/beatify/api/analytics/songs", song_stats_api)
    r.add_get("/beatify/api/usage", usage_api)
    r.add_get("/beatify/api/game-status", game_status)

    # Playlist requests
    r.add_get("/beatify/api/playlist-requests", playlist_requests_get)
    r.add_post("/beatify/api/playlist-requests", playlist_requests_post)
    r.add_post("/beatify/api/playlists/save", save_playlist)

    # Spotify OAuth
    r.add_get("/auth/spotify/login", spotify_login)
    r.add_get("/auth/spotify/callback", spotify_callback)
    r.add_post("/auth/spotify/refresh", spotify_refresh_endpoint)
    r.add_get("/auth/spotify/token", spotify_token_endpoint)

    # Root redirect
    r.add_get("/", lambda r: web.HTTPFound("/beatify/admin"))
    r.add_get("/beatify", lambda r: web.HTTPFound("/beatify/admin"))


async def _on_startup(app: web.Application) -> None:
    app_data = app[APP_KEY]
    stats: StatsService = app_data["stats"]
    analytics: AnalyticsStorage = app_data["analytics"]
    await analytics.load()
    await stats.load()
    _LOGGER.info("Beatify standalone started")


async def _on_cleanup(app: web.Application) -> None:
    app_data = app[APP_KEY]
    ws_handler: BeatifyWebSocketHandler = app_data["ws_handler"]
    await ws_handler.close_all()
    _LOGGER.info("Beatify standalone stopped")

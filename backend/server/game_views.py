"""Game-action HTTP views for Beatify (start, end, pause, rematch, gameplay)."""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

from aiohttp import web

from const import (
    DIFFICULTY_DEFAULT,
    DIFFICULTY_EASY,
    DIFFICULTY_HARD,
    DIFFICULTY_NORMAL,
    PROVIDER_DEFAULT,
    PROVIDER_SPOTIFY,
    ROUND_DURATION_MAX,
    ROUND_DURATION_MIN,
)
from game.state import GamePhase, GameState
from server.base import RateLimitMixin, _json_error, get_app_data
from server.serializers import build_game_status_response, build_state_message

_LOGGER = logging.getLogger(__name__)


def _validate_provider(provider: str) -> str:
    if provider in (PROVIDER_SPOTIFY,):
        return provider
    return PROVIDER_DEFAULT


async def start_game(request: web.Request) -> web.Response:
    """Start a new game."""
    app_data = get_app_data(request)
    game_state: GameState | None = app_data.get("game")

    # Check for existing game
    if game_state and game_state.game_id:
        if game_state.phase == GamePhase.END:
            await game_state.end_game()
        elif game_state.phase == GamePhase.LOBBY:
            return _json_error(
                "A game is already in the lobby — start gameplay instead",
                409,
                code="GAME_IN_LOBBY",
            )
        else:
            return _json_error("End current game first", 409, code="GAME_ALREADY_STARTED")

    try:
        body = await request.json()
    except Exception:
        return _json_error("Invalid JSON", 400, code="INVALID_REQUEST")

    playlist_paths = body.get("playlists", [])
    language = body.get("language", "en")
    round_duration = body.get("round_duration")
    difficulty = body.get("difficulty", DIFFICULTY_DEFAULT)
    artist_challenge_enabled = body.get("artist_challenge_enabled", True)
    movie_quiz_enabled = body.get("movie_quiz_enabled", True)
    intro_mode_enabled = body.get("intro_mode_enabled", False)
    closest_wins_mode = body.get("closest_wins_mode", False)
    reveal_auto_advance = body.get("reveal_auto_advance", 0)

    try:
        reveal_auto_advance = int(reveal_auto_advance)
    except (ValueError, TypeError):
        reveal_auto_advance = 0
    if reveal_auto_advance not in (0, 30, 60, 90):
        reveal_auto_advance = 0

    valid_difficulties = (DIFFICULTY_EASY, DIFFICULTY_NORMAL, DIFFICULTY_HARD)
    if difficulty not in valid_difficulties:
        difficulty = DIFFICULTY_DEFAULT

    if round_duration is not None:
        try:
            round_duration = int(round_duration)
            if not (ROUND_DURATION_MIN <= round_duration <= ROUND_DURATION_MAX):
                return _json_error(
                    f"Round duration must be between {ROUND_DURATION_MIN} and {ROUND_DURATION_MAX} seconds",
                    400,
                    code="INVALID_REQUEST",
                )
        except (ValueError, TypeError):
            return _json_error("Invalid round duration value", 400, code="INVALID_REQUEST")

    if not playlist_paths:
        return _json_error("No playlists selected", 400, code="INVALID_REQUEST")

    # Load and validate playlists
    songs: list[dict[str, Any]] = []
    warnings: list[str] = []
    playlist_dir = Path(app_data["playlist_dir"])

    for playlist_path in playlist_paths:
        try:
            full_path = (playlist_dir / playlist_path).resolve()
            if not full_path.is_relative_to(playlist_dir.resolve()):
                warnings.append(f"Invalid playlist path: {playlist_path}")
                continue
            if not full_path.exists():
                warnings.append(f"Playlist not found: {playlist_path}")
                continue

            playlist_data = json.loads(full_path.read_text(encoding="utf-8"))
            for song in playlist_data.get("songs", []):
                has_uri = any(
                    song.get(k)
                    for k in ("uri", "uri_spotify", "uri_youtube_music", "uri_tidal", "uri_deezer", "uri_apple_music")
                )
                if "year" in song and has_uri:
                    tagged = dict(song)
                    tagged["_playlist_source"] = playlist_path
                    songs.append(tagged)

        except Exception as err:
            warnings.append(f"Failed to load {playlist_path}: {err}")

    if not songs:
        return _json_error("No valid songs found in selected playlists", 400, code="INVALID_REQUEST")

    # Build base_url from request
    url = request.url
    base_url = f"{url.scheme}://{url.host}:{url.port}" if url.port else f"{url.scheme}://{url.host}"

    # Create or reuse GameState
    if not game_state:
        game_state = GameState()
        app_data["game"] = game_state
        stats_service = app_data.get("stats")
        if stats_service:
            game_state.set_stats_service(stats_service)

    # Inject Spotify service if available
    spotify_service = app_data.get("spotify_service")
    if spotify_service:
        game_state.set_media_player_service(spotify_service)

    # Create the game (media_player is always "spotify" for standalone)
    create_kwargs: dict[str, Any] = {
        "playlists": playlist_paths,
        "songs": songs,
        "media_player": "spotify",
        "base_url": base_url,
        "difficulty": difficulty,
        "provider": PROVIDER_SPOTIFY,
        "platform": "spotify",
        "artist_challenge_enabled": artist_challenge_enabled,
        "movie_quiz_enabled": movie_quiz_enabled,
        "intro_mode_enabled": intro_mode_enabled,
        "closest_wins_mode": closest_wins_mode,
        "reveal_auto_advance": reveal_auto_advance,
    }
    if round_duration is not None:
        create_kwargs["round_duration"] = round_duration

    result = game_state.create_game(**create_kwargs)
    result["warnings"] = warnings
    result["admin_token"] = game_state.admin_token

    stats_service = app_data.get("stats")
    if stats_service and hasattr(stats_service, "record_game_start"):
        stats_service.record_game_start()

    if language in ("en", "de", "es", "fr", "nl"):
        game_state.language = language

    ws_handler = app_data.get("ws_handler")
    if ws_handler:
        state_msg = build_state_message(game_state)
        if state_msg:
            await ws_handler.broadcast(state_msg)

    return web.json_response(result)


async def end_game(request: web.Request) -> web.Response:
    """End the current game."""
    app_data = get_app_data(request)
    game_state: GameState | None = app_data.get("game")

    if not game_state or not game_state.game_id:
        return _json_error("No active game", 404, code="GAME_NOT_STARTED")

    await game_state.end_game()

    ws_handler = app_data.get("ws_handler")
    if ws_handler:
        await ws_handler.broadcast({"type": "game_ended"})
        await ws_handler.broadcast_state()

    return web.json_response({"success": True})


async def force_reset(request: web.Request) -> web.Response:
    """Force-end any active game."""
    app_data = get_app_data(request)
    game_state: GameState | None = app_data.get("game")
    ended_game_id = None

    if game_state and game_state.game_id:
        ended_game_id = game_state.game_id
        try:
            await game_state.end_game()
        except Exception:
            _LOGGER.exception("force-reset: end_game raised; continuing anyway")

        ws_handler = app_data.get("ws_handler")
        if ws_handler:
            try:
                await ws_handler.broadcast({"type": "game_ended"})
                await ws_handler.broadcast_state()
            except Exception:
                _LOGGER.exception("force-reset: WS broadcast raised")

    return web.json_response({"success": True, "ended_game_id": ended_game_id})


async def rematch_game(request: web.Request) -> web.Response:
    """Start a rematch with current players."""
    app_data = get_app_data(request)
    game_state: GameState | None = app_data.get("game")

    if not game_state or not game_state.game_id:
        return _json_error("No active game", 404, code="GAME_NOT_FOUND")

    if game_state.phase != GamePhase.END:
        return _json_error("Can only rematch from END phase", 400, code="INVALID_PHASE")

    player_count = len(game_state.players)
    game_state.rematch_game()

    ws_handler = app_data.get("ws_handler")
    if ws_handler:
        await ws_handler.broadcast({"type": "rematch_started"})
        await ws_handler.broadcast_state()

    return web.json_response({"success": True, "player_count": player_count, "new_game_id": game_state.game_id})


async def start_gameplay(request: web.Request) -> web.Response:
    """Transition LOBBY -> PLAYING."""
    app_data = get_app_data(request)
    game_state: GameState | None = app_data.get("game")

    if not game_state or not game_state.game_id:
        return _json_error("No active game", 404, code="GAME_NOT_STARTED")

    if game_state.phase != GamePhase.LOBBY:
        return _json_error("Game already started", 409, code="INVALID_PHASE")

    ws_handler = app_data.get("ws_handler")
    if ws_handler:
        game_state.set_round_end_callback(ws_handler.broadcast_state)
        game_state.set_metadata_update_callback(ws_handler.broadcast_metadata_update)

    success = await game_state.start_round()
    if not success:
        return _json_error("Failed to start - no songs", 500, code="START_FAILED")

    if ws_handler:
        await ws_handler.broadcast_state()

    return web.json_response({"success": True, "phase": game_state.phase.value})


async def game_status(request: web.Request) -> web.Response:
    """Check game status for player page."""
    app_data = get_app_data(request)
    game_id = request.query.get("game")
    game_state: GameState | None = app_data.get("game")
    return web.json_response(build_game_status_response(game_state, game_id))

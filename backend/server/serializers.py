"""Shared state serialization helpers for views and WebSocket handler."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from const import MEDIA_PLAYER_DOCS_URL, PLAYLIST_DOCS_URL

if TYPE_CHECKING:
    from game.service import GameService
    from game.state import GameState


def get_game_state(app_data: dict) -> "GameState | None":
    return app_data.get("game")


def get_game_service(app_data: dict) -> "GameService | None":
    return app_data.get("game_service")


def build_state_message(game_state: "GameState") -> dict[str, Any] | None:
    state = game_state.get_state()
    if state is None:
        return None
    return {"type": "state", **state}


def build_status_response(
    app_data: dict,
    *,
    version: str,
    playlists: list[dict[str, Any]],
    spotify_connected: bool = False,
) -> dict[str, Any]:
    game_state: GameState | None = app_data.get("game")

    active_game = None
    if game_state and game_state.game_id:
        active_game = game_state.get_state()

    return {
        "version": version,
        "media_players": [
            {
                "entity_id": "spotify",
                "friendly_name": "Spotify Connect",
                "platform": "spotify",
                "state": "idle",
                "supports_spotify": True,
                "supports_apple_music": False,
                "supports_youtube_music": False,
                "supports_tidal": False,
                "supports_deezer": False,
            }
        ],
        "playlists": playlists,
        "playlist_dir": str(app_data.get("playlist_dir", "")),
        "playlist_docs_url": PLAYLIST_DOCS_URL,
        "media_player_docs_url": MEDIA_PLAYER_DOCS_URL,
        "active_game": active_game,
        "has_music_assistant": False,
        "spotify_connected": spotify_connected,
    }


def build_game_status_response(
    game_state: "GameState | None",
    game_id: str | None,
) -> dict[str, Any]:
    if not game_id or not game_state or game_state.game_id != game_id:
        return {"exists": False, "phase": None, "can_join": False}

    phase = game_state.phase.value
    can_join = phase in ("LOBBY", "PLAYING", "REVEAL")

    return {"exists": True, "phase": phase, "can_join": can_join}

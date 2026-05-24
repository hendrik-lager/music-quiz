"""WebSocket handler for Beatify game connections."""

from __future__ import annotations

import asyncio
import logging
import time
from typing import TYPE_CHECKING

from aiohttp import WSMsgType, web

from const import ERR_GAME_NOT_STARTED, LOBBY_DISCONNECT_GRACE_PERIOD
from server.base import APP_KEY
from server.serializers import build_state_message, get_game_state
from server.ws_handlers import (
    handle_admin,
    handle_admin_connect,
    handle_artist_guess,
    handle_get_state,
    handle_get_steal_targets,
    handle_join,
    handle_leave,
    handle_movie_guess,
    handle_ping,
    handle_player_onboarded,
    handle_reaction,
    handle_reconnect,
    handle_report_data,
    handle_round_timeout,
    handle_steal,
    handle_submit,
)

if TYPE_CHECKING:
    from analytics import AnalyticsStorage

_LOGGER = logging.getLogger(__name__)


class BeatifyWebSocketHandler:
    """Handle WebSocket connections for Beatify."""

    HEARTBEAT_INTERVAL = 30
    RATE_LIMIT_CONNECTIONS = 10
    RATE_LIMIT_WINDOW = 60

    def __init__(self, app_data: dict) -> None:
        self._app_data = app_data
        self.connections: set[web.WebSocketResponse] = set()
        self._pending_removals: dict[str, asyncio.Task] = {}
        self._admin_disconnect_task: asyncio.Task | None = None
        self._analytics: AnalyticsStorage | None = None
        self._broadcast_debounce_task: asyncio.Task | None = None
        self._broadcast_debounce_delay = 0.05
        self._connection_rate_limits: dict[str, list[float]] = {}
        self._last_rate_sweep: float = 0.0
        self._message_handlers = {
            "join": handle_join,
            "submit": handle_submit,
            "admin": handle_admin,
            "admin_connect": handle_admin_connect,
            "reconnect": handle_reconnect,
            "leave": handle_leave,
            "get_state": handle_get_state,
            "get_steal_targets": handle_get_steal_targets,
            "steal": handle_steal,
            "reaction": handle_reaction,
            "artist_guess": handle_artist_guess,
            "movie_guess": handle_movie_guess,
            "player_onboarded": handle_player_onboarded,
            "report_data": handle_report_data,
            "round_timeout": handle_round_timeout,
        }

    def set_analytics(self, analytics: "AnalyticsStorage") -> None:
        self._analytics = analytics

    def _record_error(self, error_type: str, message: str) -> None:
        if self._analytics:
            self._analytics.record_error(error_type, message)

    def _check_connection_rate_limit(self, ip: str) -> bool:
        now = time.time()
        cutoff = now - self.RATE_LIMIT_WINDOW
        if now - self._last_rate_sweep > 300:
            self._connection_rate_limits = {
                k: [t for t in v if t > cutoff]
                for k, v in self._connection_rate_limits.items()
                if any(t > cutoff for t in v)
            }
            self._last_rate_sweep = now
        times = [t for t in self._connection_rate_limits.get(ip, []) if t > cutoff]
        self._connection_rate_limits[ip] = times
        if len(times) >= self.RATE_LIMIT_CONNECTIONS:
            return False
        times.append(now)
        return True

    async def handle(self, request: web.Request) -> web.StreamResponse:
        client_ip = request.remote or "unknown"
        if not self._check_connection_rate_limit(client_ip):
            return web.Response(status=429, text="Too many connections")

        ws = web.WebSocketResponse(heartbeat=self.HEARTBEAT_INTERVAL)
        await ws.prepare(request)
        self.connections.add(ws)
        _LOGGER.debug("WebSocket connected, total: %d", len(self.connections))

        try:
            async for msg in ws:
                if msg.type == WSMsgType.TEXT:
                    try:
                        await self._handle_message(ws, msg.json())
                    except Exception as err:
                        _LOGGER.warning("Failed to parse WebSocket message: %s", err)
                elif msg.type == WSMsgType.ERROR:
                    err_msg = str(ws.exception())
                    _LOGGER.error("WebSocket error: %s", err_msg)
        finally:
            self.connections.discard(ws)
            await self._handle_disconnect(ws)
            _LOGGER.debug("WebSocket disconnected, total: %d", len(self.connections))

        return ws

    async def _handle_message(self, ws: web.WebSocketResponse, data: dict) -> None:
        msg_type = data.get("type")
        game_state = get_game_state(self._app_data)

        if msg_type == "ping":
            await handle_ping(self, ws, data, game_state)
            return

        # Handle register_device for Spotify Web Playback SDK
        if msg_type == "register_device":
            device_id = data.get("device_id")
            if device_id:
                self._app_data["spotify_device_id"] = device_id
                spotify_service = self._app_data.get("spotify_service")
                if spotify_service:
                    spotify_service.set_device_id(device_id)
                _LOGGER.info("Spotify device registered: %s", device_id)
                await ws.send_json({"type": "device_registered", "device_id": device_id})
            return

        if not game_state or not game_state.game_id:
            await ws.send_json({"type": "error", "code": ERR_GAME_NOT_STARTED, "message": "No active game"})
            return

        handler = self._message_handlers.get(msg_type)
        if handler:
            await handler(self, ws, data, game_state)
        else:
            _LOGGER.warning("Unknown message type: %s", msg_type)

    async def broadcast(self, message: dict) -> None:
        targets = set(self.connections)
        game_state = get_game_state(self._app_data)
        if game_state and game_state._admin_ws is not None:
            targets.add(game_state._admin_ws)

        if not targets:
            return

        tasks = [self._safe_send(ws, message) for ws in list(targets) if not ws.closed]
        if tasks:
            await asyncio.gather(*tasks)

    async def _safe_send(self, ws: web.WebSocketResponse, message: dict) -> None:
        try:
            await ws.send_json(message)
        except Exception as err:
            _LOGGER.warning("Failed to send to WebSocket: %s", err)

    async def debounced_broadcast_state(self) -> None:
        if self._broadcast_debounce_task and not self._broadcast_debounce_task.done():
            self._broadcast_debounce_task.cancel()

        async def delayed_broadcast() -> None:
            await asyncio.sleep(self._broadcast_debounce_delay)
            await self.broadcast_state()

        self._broadcast_debounce_task = asyncio.create_task(delayed_broadcast())

    async def broadcast_state(self) -> None:
        game_state = get_game_state(self._app_data)
        if not game_state:
            return

        state_msg = build_state_message(game_state)
        if state_msg:
            await self.broadcast(state_msg)

    async def broadcast_metadata_update(self, metadata: dict) -> None:
        await self.broadcast({"type": "metadata_update", "song": metadata})

    async def _handle_disconnect(self, ws: web.WebSocketResponse) -> None:
        game_state = get_game_state(self._app_data)
        if not game_state:
            return

        player_name = None
        player = None
        for name, p in list(game_state.players.items()):
            if p.ws == ws:
                player_name = name
                player = p
                player.connected = False
                break

        if game_state._admin_ws is ws:
            game_state._admin_ws = None

        if not player_name or not player:
            return

        _LOGGER.info("Player disconnected: %s (is_admin: %s)", player_name, player.is_admin)
        await self.broadcast_state()

        try:
            await game_state.trigger_early_reveal_if_complete()
        except Exception:
            _LOGGER.warning("Early-reveal check after disconnect failed")

        if player.is_admin:
            async def pause_after_timeout() -> None:
                await asyncio.sleep(LOBBY_DISCONNECT_GRACE_PERIOD)
                if player_name in game_state.players:
                    admin = game_state.players[player_name]
                    if not admin.connected:
                        if await game_state.pause_game("admin_disconnected"):
                            await self.broadcast_state()

            self._admin_disconnect_task = asyncio.create_task(pause_after_timeout())

    async def cleanup_game_tasks(self) -> None:
        for task in list(self._pending_removals.values()):
            if not task.done():
                task.cancel()
        self._pending_removals.clear()

        if self._admin_disconnect_task and not self._admin_disconnect_task.done():
            self._admin_disconnect_task.cancel()
        self._admin_disconnect_task = None

    def cancel_pending_removal(self, player_name: str) -> None:
        if player_name in self._pending_removals:
            self._pending_removals[player_name].cancel()
            del self._pending_removals[player_name]

    async def close_all(self) -> None:
        """Close all open WebSocket connections on shutdown."""
        await self.cleanup_game_tasks()
        for ws in list(self.connections):
            if not ws.closed:
                await ws.close()

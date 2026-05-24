"""Spotify Web API player service — implements MediaPlayerProtocol."""

from __future__ import annotations

import asyncio
import logging
from typing import Any

import aiohttp
from aiohttp import ClientTimeout

_LOGGER = logging.getLogger(__name__)

SPOTIFY_API = "https://api.spotify.com/v1"


class SpotifyPlayerService:
    """Controls Spotify playback via the Web API.

    Implements MediaPlayerProtocol so it can be injected into GameState
    as a drop-in replacement for the HA MediaPlayerService.

    Playback happens on the browser device created by the Spotify Web
    Playback SDK.  The admin browser sends its device_id via WebSocket
    (register_device) and it is stored here via set_device_id().
    """

    def __init__(self) -> None:
        self._access_token: str | None = None
        self._device_id: str | None = None
        self._analytics: Any = None
        self.last_failure_reason: str | None = None

    def set_access_token(self, token: str) -> None:
        self._access_token = token

    def set_device_id(self, device_id: str) -> None:
        self._device_id = device_id
        _LOGGER.info("Spotify device ID set: %s", device_id)

    def set_analytics(self, analytics: Any) -> None:
        self._analytics = analytics

    def is_available(self) -> bool:
        return bool(self._access_token and self._device_id)

    async def verify_responsive(self) -> tuple[bool, str]:
        if not self._access_token:
            return False, "No Spotify access token"
        if not self._device_id:
            return False, "No Spotify device registered (open admin in browser first)"
        return True, ""

    def get_volume(self) -> float:
        return 0.5  # Volume is controlled on the device directly

    async def set_volume(self, level: float) -> bool:
        if not self.is_available():
            return False
        pct = max(0, min(100, int(level * 100)))
        ok = await self._api_put(
            f"/me/player/volume?volume_percent={pct}&device_id={self._device_id}", {}
        )
        return ok

    async def play_song(self, song: dict[str, Any]) -> bool:
        """Start playback of a song on the Spotify device."""
        if not self.is_available():
            _LOGGER.warning("Spotify not available (token=%s, device=%s)",
                            bool(self._access_token), bool(self._device_id))
            return False

        uri = song.get("_resolved_uri") or song.get("uri_spotify") or song.get("uri")
        if not uri:
            _LOGGER.error("No Spotify URI found in song: %s", song.get("title"))
            return False

        body = {"uris": [uri], "position_ms": 0}
        ok = await self._api_put(
            f"/me/player/play?device_id={self._device_id}", body
        )
        if not ok:
            self.last_failure_reason = "error"
        return ok

    async def stop(self) -> bool:
        if not self.is_available():
            return False
        return await self._api_put(
            f"/me/player/pause?device_id={self._device_id}", {}
        )

    async def play(self) -> bool:
        if not self.is_available():
            return False
        return await self._api_put(
            f"/me/player/play?device_id={self._device_id}", {}
        )

    async def seek(self, position_ms: int) -> bool:
        if not self.is_available():
            return False
        return await self._api_put(
            f"/me/player/seek?position_ms={position_ms}&device_id={self._device_id}",
            {},
        )

    def get_playback_state(self) -> str:
        """Return a playback state string compatible with MediaPlayerProtocol."""
        # The SDK's onPlayerStateChanged handles this on the frontend;
        # return 'playing' as optimistic default since we can't poll
        # synchronously here.
        return "playing"

    async def wait_for_metadata_update(self, uri: str) -> dict[str, Any]:
        """Fetch track metadata from Spotify API for album art."""
        if not self._access_token:
            return {}

        # Extract track ID from URI (spotify:track:XXXXXXXXXXXXXXXXXXXXXXXXXX)
        track_id = uri.split(":")[-1] if ":" in uri else uri

        async with aiohttp.ClientSession() as session:
            async with session.get(
                f"{SPOTIFY_API}/tracks/{track_id}",
                headers={"Authorization": f"Bearer {self._access_token}"},
                timeout=ClientTimeout(total=10),
            ) as resp:
                if resp.status != 200:
                    return {}
                data = await resp.json()
                images = data.get("album", {}).get("images", [])
                album_art = images[0]["url"] if images else ""
                return {"album_art": album_art}

    async def _api_put(self, path: str, body: dict) -> bool:
        """PUT request to Spotify Web API."""
        if not self._access_token:
            return False
        try:
            async with aiohttp.ClientSession() as session:
                async with session.put(
                    f"{SPOTIFY_API}{path}",
                    json=body,
                    headers={
                        "Authorization": f"Bearer {self._access_token}",
                        "Content-Type": "application/json",
                    },
                    timeout=ClientTimeout(total=10),
                ) as resp:
                    if resp.status in (200, 204):
                        return True
                    text = await resp.text()
                    _LOGGER.warning("Spotify API PUT %s failed (%d): %s", path, resp.status, text[:100])
                    return False
        except (aiohttp.ClientError, asyncio.TimeoutError) as err:
            _LOGGER.error("Spotify API error: %s", err)
            return False

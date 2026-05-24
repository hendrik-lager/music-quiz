"""Spotify OAuth2 Authorization Code Flow for Beatify standalone."""

from __future__ import annotations

import asyncio
import logging
import secrets
import time
from typing import Any
from urllib.parse import urlencode

import aiohttp
from aiohttp import ClientTimeout, web

from config import SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, SPOTIFY_REDIRECT_URI, SPOTIFY_SCOPES
from server.base import APP_KEY

_LOGGER = logging.getLogger(__name__)

SPOTIFY_AUTH_URL = "https://accounts.spotify.com/authorize"
SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token"


def get_login_url(state: str) -> str:
    params = {
        "client_id": SPOTIFY_CLIENT_ID,
        "response_type": "code",
        "redirect_uri": SPOTIFY_REDIRECT_URI,
        "scope": SPOTIFY_SCOPES,
        "state": state,
        "show_dialog": "false",
    }
    return f"{SPOTIFY_AUTH_URL}?{urlencode(params)}"


async def exchange_code(code: str) -> dict[str, Any] | None:
    """Exchange an authorization code for tokens."""
    data = {
        "grant_type": "authorization_code",
        "code": code,
        "redirect_uri": SPOTIFY_REDIRECT_URI,
        "client_id": SPOTIFY_CLIENT_ID,
        "client_secret": SPOTIFY_CLIENT_SECRET,
    }
    async with aiohttp.ClientSession() as session:
        async with session.post(
            SPOTIFY_TOKEN_URL,
            data=data,
            timeout=ClientTimeout(total=10),
        ) as resp:
            if resp.status != 200:
                text = await resp.text()
                _LOGGER.error("Token exchange failed (%d): %s", resp.status, text[:200])
                return None
            return await resp.json()


async def refresh_token(refresh_tok: str) -> dict[str, Any] | None:
    """Refresh an access token using a refresh token."""
    data = {
        "grant_type": "refresh_token",
        "refresh_token": refresh_tok,
        "client_id": SPOTIFY_CLIENT_ID,
        "client_secret": SPOTIFY_CLIENT_SECRET,
    }
    async with aiohttp.ClientSession() as session:
        async with session.post(
            SPOTIFY_TOKEN_URL,
            data=data,
            timeout=ClientTimeout(total=10),
        ) as resp:
            if resp.status != 200:
                text = await resp.text()
                _LOGGER.error("Token refresh failed (%d): %s", resp.status, text[:200])
                return None
            return await resp.json()


# ---------------------------------------------------------------------------
# Route handlers
# ---------------------------------------------------------------------------

_oauth_states: dict[str, float] = {}  # state -> expiry timestamp


async def spotify_login(request: web.Request) -> web.Response:
    """Redirect the admin to Spotify's OAuth consent page."""
    if not SPOTIFY_CLIENT_ID:
        return web.Response(
            text="Spotify not configured — set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET in .env",
            status=503,
        )
    state = secrets.token_urlsafe(16)
    _oauth_states[state] = time.time() + 600  # 10-minute expiry
    raise web.HTTPFound(get_login_url(state))


async def spotify_callback(request: web.Request) -> web.Response:
    """Handle the OAuth redirect from Spotify."""
    code = request.query.get("code")
    state = request.query.get("state", "")
    error = request.query.get("error")

    if error:
        _LOGGER.warning("Spotify OAuth error: %s", error)
        raise web.HTTPFound("/beatify/admin?spotify_error=" + error)

    if not code:
        raise web.HTTPFound("/beatify/admin?spotify_error=missing_code")

    # Validate state to prevent CSRF
    expiry = _oauth_states.pop(state, None)
    if not expiry or time.time() > expiry:
        raise web.HTTPFound("/beatify/admin?spotify_error=invalid_state")

    tokens = await exchange_code(code)
    if not tokens or not tokens.get("access_token"):
        raise web.HTTPFound("/beatify/admin?spotify_error=exchange_failed")

    app_data = request.app[APP_KEY]
    app_data["spotify_access_token"] = tokens["access_token"]
    app_data["spotify_refresh_token"] = tokens.get("refresh_token")
    app_data["spotify_expires_at"] = int(time.time()) + tokens.get("expires_in", 3600) - 60

    # Inject token into Spotify player service
    spotify_service = app_data.get("spotify_service")
    if spotify_service:
        spotify_service.set_access_token(tokens["access_token"])

    _LOGGER.info("Spotify authentication successful")
    raise web.HTTPFound("/beatify/admin?spotify_ok=1")


async def spotify_refresh_endpoint(request: web.Request) -> web.Response:
    """Refresh Spotify access token."""
    app_data = request.app[APP_KEY]
    refresh_tok = app_data.get("spotify_refresh_token")

    if not refresh_tok:
        return web.json_response({"error": "no_refresh_token"}, status=401)

    tokens = await refresh_token(refresh_tok)
    if not tokens or not tokens.get("access_token"):
        return web.json_response({"error": "refresh_failed"}, status=401)

    app_data["spotify_access_token"] = tokens["access_token"]
    app_data["spotify_expires_at"] = int(time.time()) + tokens.get("expires_in", 3600) - 60

    spotify_service = app_data.get("spotify_service")
    if spotify_service:
        spotify_service.set_access_token(tokens["access_token"])

    return web.json_response({
        "access_token": tokens["access_token"],
        "expires_in": tokens.get("expires_in", 3600),
    })


async def spotify_token_endpoint(request: web.Request) -> web.Response:
    """Return current access token for the frontend SDK."""
    app_data = request.app[APP_KEY]
    access_token = app_data.get("spotify_access_token")
    expires_at = app_data.get("spotify_expires_at", 0)

    if not access_token:
        return web.json_response({"error": "not_authenticated"}, status=401)

    # Auto-refresh if token expires within 5 minutes
    if int(time.time()) >= expires_at - 300:
        refresh_tok = app_data.get("spotify_refresh_token")
        if refresh_tok:
            tokens = await refresh_token(refresh_tok)
            if tokens and tokens.get("access_token"):
                access_token = tokens["access_token"]
                app_data["spotify_access_token"] = access_token
                app_data["spotify_expires_at"] = int(time.time()) + tokens.get("expires_in", 3600) - 60
                spotify_service = app_data.get("spotify_service")
                if spotify_service:
                    spotify_service.set_access_token(access_token)

    return web.json_response({
        "access_token": access_token,
        "expires_at": app_data.get("spotify_expires_at", 0),
    })

"""Application configuration loaded from environment variables."""

from __future__ import annotations

import os
import secrets
from pathlib import Path

VERSION = "1.0.0"

# Spotify OAuth
SPOTIFY_CLIENT_ID: str = os.environ.get("SPOTIFY_CLIENT_ID", "")
SPOTIFY_CLIENT_SECRET: str = os.environ.get("SPOTIFY_CLIENT_SECRET", "")
SPOTIFY_REDIRECT_URI: str = os.environ.get(
    "SPOTIFY_REDIRECT_URI", "http://localhost:8080/auth/spotify/callback"
)
SPOTIFY_SCOPES = "streaming user-read-email user-read-private user-modify-playback-state"

# Server
PORT: int = int(os.environ.get("PORT", "8080"))
HOST: str = os.environ.get("HOST", "0.0.0.0")
SECRET_KEY: str = os.environ.get("SECRET_KEY", secrets.token_urlsafe(32))

# Paths
BASE_DIR = Path(__file__).parent.parent
FRONTEND_DIR = BASE_DIR / "frontend"
PLAYLISTS_DIR = BASE_DIR / "playlists"
DATA_DIR = BASE_DIR / "data"

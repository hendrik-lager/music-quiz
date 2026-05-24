"""Shared base class and helpers for Beatify HTTP views."""

from __future__ import annotations

import logging
import time
from pathlib import Path

from aiohttp import web

_LOGGER = logging.getLogger(__name__)


APP_KEY = "beatify"


def get_app_data(request: web.Request) -> dict:
    return request.app[APP_KEY]


def _json_error(message: str, status: int, *, code: str = "ERROR") -> web.Response:
    return web.json_response(
        {"code": code, "error": code, "message": message}, status=status
    )


_html_cache: dict[str, str] = {}


def _get_html(path: Path) -> str | None:
    """Read HTML file with in-memory caching."""
    key = str(path)
    if key in _html_cache:
        return _html_cache[key]
    if not path.exists():
        return None
    content = path.read_text(encoding="utf-8")
    _html_cache[key] = content
    return content


class RateLimitMixin:
    """Mixin providing IP-based rate limiting for views."""

    RATE_LIMIT_REQUESTS: int = 5
    RATE_LIMIT_WINDOW: int = 60

    def _init_rate_limits(self) -> None:
        self._rate_limits: dict[str, list[float]] = {}
        self._last_sweep: float = 0.0

    def _check_rate_limit(self, ip: str) -> bool:
        now = time.time()
        cutoff = now - self.RATE_LIMIT_WINDOW
        if now - self._last_sweep > 300:
            self._rate_limits = {
                k: [t for t in v if t > cutoff]
                for k, v in self._rate_limits.items()
                if any(t > cutoff for t in v)
            }
            self._last_sweep = now
        times = [t for t in self._rate_limits.get(ip, []) if t > cutoff]
        self._rate_limits[ip] = times
        if len(times) >= self.RATE_LIMIT_REQUESTS:
            return False
        times.append(now)
        return True

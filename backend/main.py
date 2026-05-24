"""Entry point for Beatify standalone."""

from __future__ import annotations

import logging
import sys
from pathlib import Path

# Add backend/ to sys.path so all imports resolve correctly
sys.path.insert(0, str(Path(__file__).parent))

from aiohttp import web

from config import HOST, PORT
from server.app import create_app

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s — %(message)s",
    datefmt="%H:%M:%S",
)

_LOGGER = logging.getLogger(__name__)


def main() -> None:
    app = create_app()
    _LOGGER.info("Starting Beatify on http://%s:%d", HOST, PORT)
    web.run_app(app, host=HOST, port=PORT, access_log=None)


if __name__ == "__main__":
    main()

from __future__ import annotations

import logging
from typing import Any

import structlog


def configure_logging(debug: bool = False) -> None:
    """Configure structured logging for the application."""

    timestamper = structlog.processors.TimeStamper(fmt="iso")

    logging.basicConfig(
        format="%(message)s",
        level=logging.DEBUG if debug else logging.INFO,
    )

    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            timestamper,
            structlog.processors.add_log_level,
            structlog.dev.ConsoleRenderer()
            if debug
            else structlog.processors.JSONRenderer(),
        ],
        wrapper_class=structlog.make_filtering_bound_logger(
            logging.DEBUG if debug else logging.INFO
        ),
        cache_logger_on_first_use=True,
    )


def get_logger(*args: Any, **kwargs: Any) -> structlog.BoundLogger:
    return structlog.get_logger(*args, **kwargs)

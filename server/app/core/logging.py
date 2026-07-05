"""Logging setup — human-readable in dev (CLAUDE.md §7.9/§15).

Full structured/JSON logging and correlation IDs are deferred for this build;
this keeps a single ``configure_logging`` entry point so that upgrade is a
localized change rather than a scattered one.
"""

import logging


def configure_logging() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)-8s %(name)s | %(message)s",
    )

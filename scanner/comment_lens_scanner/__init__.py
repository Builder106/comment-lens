"""Local, non-executing source comment inventory scanner."""

__version__ = "0.1.0"

from .core import scan_repository

__all__ = ["scan_repository", "__version__"]

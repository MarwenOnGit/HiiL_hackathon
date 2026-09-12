"""Configuration loading. Figures live in YAML, never in prompts.

CLAUDE.md is explicit that the court duration and cost figures go in config
rather than hardcoded in a prompt, so they can be corrected without touching
agent code. This module is the only place that reads them.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import yaml

CONFIG_DIR = Path(__file__).resolve().parent
PROFILES_DIR = CONFIG_DIR / "profiles"


def load_profile(name: str) -> dict[str, Any]:
    path = PROFILES_DIR / f"{name}.yaml"
    if not path.is_file():
        raise FileNotFoundError(f"no contract profile {name!r} at {path}")
    return yaml.safe_load(path.read_text(encoding="utf-8"))


def load_batna_reference() -> dict[str, Any]:
    return yaml.safe_load((CONFIG_DIR / "batna.yaml").read_text(encoding="utf-8"))

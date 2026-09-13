"""Configuration loading. Figures live in YAML, never in prompts.

CLAUDE.md is explicit that the court duration and cost figures go in config
rather than hardcoded in a prompt, so they can be corrected without touching
agent code. This module is the only place that reads them.
"""

from __future__ import annotations

import os
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


def _env_flag(name: str, default: bool = True) -> bool:
    raw = os.environ.get(name)
    if raw is None or raw.strip() == "":
        return default
    return raw.strip().lower() not in ("0", "false", "no", "off")


def load_env_file(path: Path | None = None) -> None:
    """Read agent/.env into the environment, without overriding real env vars.

    The key belongs in a gitignored file rather than a shell everyone has to
    remember to source. python-dotenv is already in the venv; if it ever is
    not, a four-line parser is a better outcome than the service failing to
    import over a config convenience.
    """
    target = path or (CONFIG_DIR.parent / ".env")
    if not target.is_file():
        return
    try:
        from dotenv import load_dotenv
        load_dotenv(target, override=False)
        return
    except ImportError:
        pass
    for line in target.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        os.environ.setdefault(key.strip(), value.strip().strip("'\""))


def load_llm_settings() -> dict[str, Any]:
    """The model backend's configuration, with environment overrides.

    `api_key` is resolved here and nowhere else, so exactly one module knows
    how the secret is spelled. `enabled` is the honest summary the rest of the
    system branches on: a deployment with no key is a supported deployment.
    """
    load_env_file()
    config = yaml.safe_load((CONFIG_DIR / "llm.yaml").read_text(encoding="utf-8")) or {}

    config["model"] = os.environ.get("OPENROUTER_MODEL") or config.get("model")
    config["base_url"] = (
        os.environ.get("OPENROUTER_BASE_URL") or config.get("base_url")
    )
    api_key = os.environ.get(config.get("api_key_env") or "OPENROUTER_API_KEY") or ""
    config["api_key"] = api_key.strip()
    config["enabled"] = bool(config["api_key"]) and _env_flag("AGENT_LLM_ENABLED", True)
    return config

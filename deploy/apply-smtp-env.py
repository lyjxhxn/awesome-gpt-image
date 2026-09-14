#!/usr/bin/env python3
"""Validate and merge a restricted SMTP file into server environment files."""

from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SMTP_ENV = ROOT / "deploy" / "smtp.env"
SMTP_KEYS = ("SMTP_HOST", "SMTP_PORT", "SMTP_SECURE", "SMTP_USER", "SMTP_PASS", "SMTP_FROM")
REQUIRED = set(SMTP_KEYS)


def read_env(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    for raw_line in path.read_text(encoding="utf-8-sig").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            raise SystemExit(f"Invalid environment line in {path}")
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip()
        if key in REQUIRED:
            values[key] = value
    missing = sorted(key for key in REQUIRED if not values.get(key))
    if missing:
        raise SystemExit(f"Missing SMTP settings: {', '.join(missing)}")
    if not values["SMTP_PORT"].isdigit() or not 1 <= int(values["SMTP_PORT"]) <= 65535:
        raise SystemExit("SMTP_PORT is invalid")
    if values["SMTP_SECURE"].lower() not in {"true", "false"}:
        raise SystemExit("SMTP_SECURE must be true or false")
    if "@" not in values["SMTP_FROM"]:
        raise SystemExit("SMTP_FROM is invalid")
    return values


def merge(path: Path, values: dict[str, str]) -> None:
    lines = path.read_text(encoding="utf-8").splitlines()
    found: set[str] = set()
    output: list[str] = []
    for line in lines:
        key = line.split("=", 1)[0] if "=" in line else ""
        if key in values:
            output.append(f"{key}={values[key]}")
            found.add(key)
        else:
            output.append(line)
    missing = set(values) - found
    if missing:
        raise SystemExit(f"Target {path} lacks settings: {', '.join(sorted(missing))}")
    path.write_text("\n".join(output) + "\n", encoding="utf-8")
    path.chmod(0o600)


smtp = read_env(SMTP_ENV)
SMTP_ENV.write_text("".join(f"{key}={smtp[key]}\n" for key in SMTP_KEYS), encoding="utf-8")
SMTP_ENV.chmod(0o600)
merge(ROOT / "deploy" / "core" / ".env", {key: value for key, value in smtp.items() if key != "SMTP_SECURE"})
merge(ROOT / "deploy" / "app" / ".env", smtp)
print("SMTP settings validated and applied to Auth and Node environments.")

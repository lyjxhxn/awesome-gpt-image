#!/usr/bin/env python3
"""Point the existing server environment at the app's HTTPS origin."""

from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
APP_URL = "https://image.nasmy.dpdns.org"


def replace(path: Path, values: dict[str, str]) -> None:
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
        raise SystemExit(f"Missing expected settings in {path}: {', '.join(sorted(missing))}")
    path.write_text("\n".join(output) + "\n", encoding="utf-8")
    path.chmod(0o600)


replace(
    ROOT / "deploy" / "core" / ".env",
    {
        "SITE_URL": APP_URL,
        "APP_PUBLIC_HOST": "image.nasmy.dpdns.org",
        "SUPABASE_PUBLIC_HOST": "image.nasmy.dpdns.org",
        "SUPABASE_PUBLIC_URL": APP_URL,
        "API_EXTERNAL_URL": f"{APP_URL}/auth/v1",
    },
)
replace(
    ROOT / "deploy" / "app" / ".env",
    {"VITE_SUPABASE_URL": APP_URL, "APP_URL": APP_URL},
)
print("Switched application and Supabase to one HTTPS origin.")

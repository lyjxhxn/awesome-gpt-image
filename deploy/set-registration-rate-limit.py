#!/usr/bin/env python3
"""Enable or disable the custom registration rate limiter in the Node service."""

import sys
from pathlib import Path


if len(sys.argv) != 2 or sys.argv[1] not in {"enabled", "disabled"}:
    raise SystemExit("Usage: set-registration-rate-limit.py enabled|disabled")

path = Path(__file__).resolve().parent / "app" / ".env"
value = "true" if sys.argv[1] == "disabled" else "false"
lines = path.read_text(encoding="utf-8").splitlines()
output: list[str] = []
found = False
for line in lines:
    if line.startswith("AUTH_RATE_LIMIT_DISABLED="):
        output.append(f"AUTH_RATE_LIMIT_DISABLED={value}")
        found = True
    else:
        output.append(line)
if not found:
    output.append(f"AUTH_RATE_LIMIT_DISABLED={value}")
path.write_text("\n".join(output) + "\n", encoding="utf-8")
path.chmod(0o600)
print(f"Registration rate limiting is {sys.argv[1]}.")

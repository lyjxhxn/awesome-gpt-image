#!/usr/bin/env python3
"""Remove one or more emails from the Node service's super-admin allowlist."""

import re
import sys
from pathlib import Path


if len(sys.argv) < 2:
    raise SystemExit("Usage: remove-super-admin.py email@example.com [email@example.com ...]")

emails = {value.strip().lower() for value in sys.argv[1:]}
if any(len(email) > 254 or not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", email) for email in emails):
    raise SystemExit("Invalid email address")

path = Path(__file__).resolve().parent / "app" / ".env"
lines = path.read_text(encoding="utf-8").splitlines()
output: list[str] = []
found = False
remaining: list[str] = []
for line in lines:
    if line.startswith("SUPER_ADMIN_EMAILS="):
        current = [item.strip().lower() for item in line.split("=", 1)[1].split(",") if item.strip()]
        remaining = [email for email in current if email not in emails]
        output.append(f"SUPER_ADMIN_EMAILS={','.join(remaining)}")
        found = True
    else:
        output.append(line)
if not found:
    raise SystemExit("SUPER_ADMIN_EMAILS is missing")
if not remaining:
    raise SystemExit("Refusing to remove every super-admin email")
path.write_text("\n".join(output) + "\n", encoding="utf-8")
path.chmod(0o600)
print("Super-admin allowlist updated.")

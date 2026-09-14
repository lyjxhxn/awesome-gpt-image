#!/usr/bin/env python3
"""Add an email to the Node service's super-admin allowlist."""

import re
import sys
from pathlib import Path


if len(sys.argv) != 2:
    raise SystemExit("Usage: add-super-admin.py email@example.com")

email = sys.argv[1].strip().lower()
if len(email) > 254 or not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", email):
    raise SystemExit("Invalid email address")

path = Path(__file__).resolve().parent / "app" / ".env"
lines = path.read_text(encoding="utf-8").splitlines()
output: list[str] = []
found = False
for line in lines:
    if line.startswith("SUPER_ADMIN_EMAILS="):
        current = [item.strip().lower() for item in line.split("=", 1)[1].split(",") if item.strip()]
        if email not in current:
            current.append(email)
        output.append(f"SUPER_ADMIN_EMAILS={','.join(current)}")
        found = True
    else:
        output.append(line)
if not found:
    output.append(f"SUPER_ADMIN_EMAILS={email}")
path.write_text("\n".join(output) + "\n", encoding="utf-8")
path.chmod(0o600)
print("Super-admin allowlist updated.")

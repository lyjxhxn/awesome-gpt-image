#!/usr/bin/env python3
"""Create production environment files without printing secret values."""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import secrets
import time
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CORE_ENV = ROOT / "deploy" / "core" / ".env"
APP_ENV = ROOT / "deploy" / "app" / ".env"


def b64url(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode("ascii")


def jwt(secret: str, role: str) -> str:
    now = int(time.time())
    header = b64url(json.dumps({"alg": "HS256", "typ": "JWT"}, separators=(",", ":")).encode())
    payload = b64url(
        json.dumps(
            {"role": role, "iss": "supabase", "iat": now, "exp": now + 10 * 365 * 24 * 3600},
            separators=(",", ":"),
        ).encode()
    )
    body = f"{header}.{payload}"
    signature = b64url(hmac.new(secret.encode(), body.encode(), hashlib.sha256).digest())
    return f"{body}.{signature}"


def write_new(path: Path, content: str) -> None:
    if path.exists():
        raise SystemExit(f"Refusing to overwrite existing {path}")
    path.write_text(content, encoding="utf-8")
    os.chmod(path, 0o600)


def main() -> None:
    postgres_password = secrets.token_urlsafe(36)
    jwt_secret = secrets.token_urlsafe(48)
    registration_secret = secrets.token_urlsafe(48)
    anon_key = jwt(jwt_secret, "anon")
    service_key = jwt(jwt_secret, "service_role")

    app_url = "https://image.nasmy.dpdns.org"
    auth_url = app_url
    admin_emails = "lyjxhxn@qq.com"

    core = f"""POSTGRES_PASSWORD={postgres_password}
JWT_SECRET={jwt_secret}
JWT_EXPIRY=3600
ANON_KEY={anon_key}
SERVICE_ROLE_KEY={service_key}
SITE_URL={app_url}
ADDITIONAL_REDIRECT_URLS={app_url}/**,http://127.0.0.1:5173/**
APP_PUBLIC_HOST=image.nasmy.dpdns.org
SUPABASE_PUBLIC_HOST=image.nasmy.dpdns.org
SUPABASE_PUBLIC_URL={auth_url}
API_EXTERNAL_URL={auth_url}/auth/v1
CADDYFILE=./Caddyfile.internal
SUPABASE_LOOPBACK_PORT=18000
SMTP_HOST=
SMTP_PORT=465
SMTP_USER=
SMTP_PASS=
SMTP_FROM=
SMTP_SENDER_NAME=GPT Image Gallery
MAILER_TEMPLATES_RECOVERY=http://awesome-gpt-image:8787/auth-templates/recovery.html
MAILER_SUBJECTS_RECOVERY=GPT Image 密码找回验证码
POSTGRES_IMAGE=supabase/postgres:17.6.1.136
GOTRUE_IMAGE=supabase/gotrue:v2.196.0
POSTGREST_IMAGE=postgrest/postgrest:v14.17
"""
    app = f"""VITE_SUPABASE_URL={auth_url}
VITE_SUPABASE_ANON_KEY={anon_key}
SUPABASE_SERVICE_ROLE_KEY={service_key}
SUPER_ADMIN_EMAILS={admin_emails}
AUTH_REGISTRATION_HASH_SECRET={registration_secret}
AUTH_RATE_LIMIT_DISABLED=false
SMTP_HOST=
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=
SMTP_PASS=
SMTP_FROM=
APP_URL={app_url}
STRIPE_PAYMENT_ENABLED=false
ALIPAY_PAYMENT_ENABLED=false
"""
    write_new(CORE_ENV, core)
    write_new(APP_ENV, app)
    print("Created restricted core and app environment files.")


if __name__ == "__main__":
    main()

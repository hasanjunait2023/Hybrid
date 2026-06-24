"""Credential crypto — AES-256-GCM, byte-compatible with packages/db/src/crypto.ts.

The web app seals gateway/courier credential maps into a versioned JSON envelope
(`SealedSecret`) before they touch the DB; this opens them server-side for a job.

Envelope (jsonb): {v:1, alg:"A256GCM", iv:b64(12), ct:b64, tag:b64(16)}.
Node's GCM exposes ciphertext and the 16-byte auth tag separately; Python's
AESGCM expects them concatenated (ct || tag) — that is the only translation.
"""
import base64
import json
import os
from typing import Any

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from .config import get_settings

KEY_BYTES = 32
IV_BYTES = 12
TAG_BYTES = 16


def _key() -> bytes:
    raw = get_settings().app_encryption_key
    try:
        key = base64.b64decode(raw, validate=True)
    except Exception as exc:  # noqa: BLE001 - re-raised with a clear message
        raise ValueError("APP_ENCRYPTION_KEY must be base64-encoded") from exc
    if len(key) != KEY_BYTES:
        raise ValueError(
            f"APP_ENCRYPTION_KEY must decode to {KEY_BYTES} bytes (got {len(key)}); "
            "generate with: openssl rand -base64 32"
        )
    return key


def is_sealed(value: Any) -> bool:
    """Type guard: does this (e.g. a jsonb column read) look like a SealedSecret?"""
    if not isinstance(value, dict):
        return False
    return (
        value.get("v") == 1
        and value.get("alg") == "A256GCM"
        and all(isinstance(value.get(k), str) for k in ("iv", "ct", "tag"))
    )


def open_credentials(sealed: dict[str, Any]) -> dict[str, str]:
    """Open a SealedSecret back to its plaintext map. A tampered ct/tag or the
    wrong key raises (GCM authentication) — never returns silently-corrupt data."""
    if not is_sealed(sealed):
        raise ValueError("open_credentials: value is not a SealedSecret envelope")

    iv = base64.b64decode(sealed["iv"])
    tag = base64.b64decode(sealed["tag"])
    ct = base64.b64decode(sealed["ct"])
    if len(iv) != IV_BYTES:
        raise ValueError("SealedSecret.iv has invalid length")
    if len(tag) != TAG_BYTES:
        raise ValueError("SealedSecret.tag has invalid length")

    plaintext = AESGCM(_key()).decrypt(iv, ct + tag, None)
    return json.loads(plaintext.decode("utf-8"))


def seal_credentials(plain: dict[str, str]) -> dict[str, Any]:
    """Seal a plaintext credential map (fresh 12-byte IV per call). Emitted
    envelope is openable by openCredentials() in crypto.ts."""
    iv = os.urandom(IV_BYTES)
    # Compact separators so the JSON matches JSON.stringify's default spacing.
    blob = AESGCM(_key()).encrypt(
        iv, json.dumps(plain, separators=(",", ":")).encode("utf-8"), None
    )
    ct, tag = blob[:-TAG_BYTES], blob[-TAG_BYTES:]
    return {
        "v": 1,
        "alg": "A256GCM",
        "iv": base64.b64encode(iv).decode("ascii"),
        "ct": base64.b64encode(ct).decode("ascii"),
        "tag": base64.b64encode(tag).decode("ascii"),
    }

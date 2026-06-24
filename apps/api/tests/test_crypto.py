"""Crypto round-trip / tamper / envelope-guard. (Cross-language compatibility with
crypto.ts is by shared format — validate against a real DB-sealed value in staging.)"""
import base64

import pytest

from app.crypto import is_sealed, open_credentials, seal_credentials


def test_seal_open_round_trip():
    plain = {"apiKey": "ak_123", "secretKey": "sk_456"}
    sealed = seal_credentials(plain)
    assert is_sealed(sealed)
    assert sealed["v"] == 1 and sealed["alg"] == "A256GCM"
    assert open_credentials(sealed) == plain


def test_unique_iv_per_call():
    s1 = seal_credentials({"a": "b"})
    s2 = seal_credentials({"a": "b"})
    assert s1["iv"] != s2["iv"]
    assert s1["ct"] != s2["ct"]


def test_tamper_is_detected():
    sealed = seal_credentials({"apiKey": "x", "secretKey": "y"})
    ct = bytearray(base64.b64decode(sealed["ct"]))
    ct[0] ^= 0x01  # flip one ciphertext bit
    sealed["ct"] = base64.b64encode(bytes(ct)).decode()
    with pytest.raises(Exception):  # GCM auth failure
        open_credentials(sealed)


def test_rejects_non_envelope():
    assert not is_sealed({"foo": "bar"})
    with pytest.raises(ValueError):
        open_credentials({"foo": "bar"})

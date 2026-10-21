#!/usr/bin/env python3
"""Genera identidades locales sin imprimir secretos ni reemplazar firmas existentes."""
import os
from pathlib import Path
import secrets
import subprocess
import sys

root = Path(__file__).resolve().parents[1]
private = root / ".private"
config = root / "signing.properties"

if config.exists() or any((private / f"{kind}.p12").exists() for kind in ("development", "production")):
    sys.exit("Ya hay configuración o claves de firma. Se conservan; no se sobrescriben.")

private.mkdir(mode=0o700, exist_ok=True)
os.chmod(private, 0o700)
with open(config, "x", opener=lambda path, flags: os.open(path, flags, 0o600)):
    pass
for kind in ("development", "production"):
    password = secrets.token_hex(32)
    with config.open("a") as output:
        output.write(f"{kind}.storePassword={password}\n")
        output.flush()
        os.fsync(output.fileno())
    result = subprocess.run([
        "keytool", "-genkeypair", "-noprompt", "-storetype", "PKCS12",
        "-keystore", str(private / f"{kind}.p12"), "-alias", f"afp-{kind}",
        "-keyalg", "RSA", "-keysize", "3072", "-validity", "10000",
        "-dname", f"CN=AFP {kind}, O=AFP, C=MX", "-storepass:env", "AFP_SIGNING_PASSWORD",
        "-keypass:env", "AFP_SIGNING_PASSWORD",
    ], env={**os.environ, "AFP_SIGNING_PASSWORD": password}, capture_output=True)
    if result.returncode:
        sys.exit("No se pudo generar la firma. Revisa keytool; los archivos existentes se conservaron.")
    os.chmod(private / f"{kind}.p12", 0o600)
print("Firmas creadas. Respalda .private/ y signing.properties fuera de Git antes de distribuir una APK.")

#!/usr/bin/env python3
"""Lee identidad técnica, paquetes declarados y estado de AFP; nunca lee avisos."""
import argparse
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import xml.etree.ElementTree as ET

parser = argparse.ArgumentParser()
parser.add_argument("--adb", default=shutil.which("adb") or str(Path(os.environ.get("ANDROID_HOME", "")) / "platform-tools/adb"))
parser.add_argument("--serial", help="Selecciona un dispositivo si hay varios. Nunca se incluye en el informe.")
parser.add_argument("--application-id", choices=("com.garatachia.afp", "com.garatachia.afp.dev"),
                    default="com.garatachia.afp")
args = parser.parse_args()

def adb(*command):
    return subprocess.run([args.adb, *command], capture_output=True, text=True, check=True, timeout=15).stdout.strip()

try:
    rows = [line.split() for line in adb("devices").splitlines()[1:] if line.strip()]
    available = [row[0] for row in rows if len(row) > 1 and row[1] == "device"]
    if args.serial:
        if args.serial not in available:
            sys.exit("El dispositivo seleccionado no está autorizado o conectado.")
        serial = args.serial
    elif len(available) == 1:
        serial = available[0]
    else:
        sys.exit("Conecta y autoriza un único teléfono, o selecciona uno mediante --serial. No se leyeron notificaciones.")

    def shell(*command):
        return adb("-s", serial, "shell", *command)

    result = {"kind": "device-package-check", "notificationFormatsVerified": False}
    for name, prop in (("manufacturer", "ro.product.manufacturer"), ("model", "ro.product.model"),
                       ("androidRelease", "ro.build.version.release"), ("apiLevel", "ro.build.version.sdk"),
                       ("oneUiBuild", "ro.build.version.oneui")):
        result[name] = shell("getprop", prop)
    result["sources"] = []
    # El manifest limita también la visibilidad de paquetes de la APK. No mantener otra lista aquí.
    manifest = ET.parse(Path(__file__).resolve().parents[1] / "app/src/main/AndroidManifest.xml")
    packages = [item.attrib["{http://schemas.android.com/apk/res/android}name"]
                for item in manifest.findall("queries/package")]
    for package in packages:
        installed = f"package:{package}" in shell("pm", "list", "packages", "--user", "current", package).splitlines()
        details = shell("dumpsys", "package", package) if installed else ""
        version = re.search(r"\bversionName=([^\s]+)", details)
        result["sources"].append({"packageName": package, "installed": installed,
                                  "versionName": version.group(1) if version else None})
    app_id = args.application_id
    app_installed = f"package:{app_id}" in shell("pm", "list", "packages", "--user", "current", app_id).splitlines()
    if app_installed:
        details = shell("dumpsys", "package", app_id)
        version = re.search(r"\bversionName=([^\s]+)", details)
        whitelist = shell("cmd", "deviceidle", "whitelist").splitlines()
        listeners = shell("settings", "get", "secure", "enabled_notification_listeners").split(":")
        result["afp"] = {
            "applicationId": app_id,
            "versionName": version.group(1) if version else None,
            "notificationAccessGranted": f"{app_id}/com.garatachia.afp.CaptureNotificationListener" in listeners,
            "batteryOptimizationExempt": any(line.rsplit(",", 2)[-2:-1] == [app_id] for line in whitelist),
            "standbyBucket": shell("am", "get-standby-bucket", app_id),
            "runAnyInBackground": shell("cmd", "appops", "get", app_id, "RUN_ANY_IN_BACKGROUND"),
            "samsungSleepListsCheck": "requires-manual-settings-inspection",
        }
    print(json.dumps(result, ensure_ascii=False, indent=2))
except (FileNotFoundError, subprocess.CalledProcessError, subprocess.TimeoutExpired):
    sys.exit("No se pudo consultar ADB. Revisa su instalación, el cable y la autorización del teléfono.")

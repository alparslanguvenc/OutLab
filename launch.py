#!/usr/bin/env python3
"""Portable local launcher. All files and caches stay inside the application folder."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import sys
import time
import urllib.request
import webbrowser

ROOT = Path(__file__).resolve().parent
URL = "http://127.0.0.1:8765"


def health() -> bool:
    try:
        with urllib.request.urlopen(URL + "/api/health", timeout=2) as response:
            data = json.load(response)
            return data.get("app") == "outlab" and data.get("status") == "ok"
    except (OSError, ValueError):
        return False


def run(command: list[str], env: dict[str, str]) -> None:
    subprocess.run(command, cwd=ROOT, env=env, check=True)


def main() -> int:
    parser = argparse.ArgumentParser(description="OutLab yerel başlatıcı")
    parser.add_argument("--no-browser", action="store_true", help="Tarayıcı açmadan başlat")
    parser.add_argument("--check", action="store_true", help="Çalışan sunucuyu kontrol et")
    args = parser.parse_args()
    if args.check:
        print("OutLab çalışıyor: " + URL if health() else "OutLab henüz çalışmıyor.")
        return 0 if health() else 1
    if health():
        print("OutLab zaten açık: " + URL)
        if not args.no_browser:
            webbrowser.open(URL)
        return 0
    with socket.socket() as probe:
        if probe.connect_ex(("127.0.0.1", 8765)) == 0:
            print("8765 bağlantı noktasını başka bir uygulama (ör. eski RotaLab sürümü) kullanıyor. O uygulamayı kapatıp yeniden deneyin.")
            return 1
    if sys.version_info < (3, 11):
        print("Python 3.11 veya üzeri gerekli. https://www.python.org/downloads/ adresinden kurun.")
        return 1
    env = dict(os.environ)
    env["MPLCONFIGDIR"] = str(ROOT / "private" / "matplotlib")
    env["PIP_CACHE_DIR"] = str(ROOT / "private" / "pip-cache")
    env["npm_config_cache"] = str(ROOT / "private" / "npm-cache")
    for path in ("private/matplotlib", "private/pip-cache", "private/npm-cache"):
        (ROOT / path).mkdir(parents=True, exist_ok=True)
    python = ROOT / ".venv" / ("Scripts/python.exe" if os.name == "nt" else "bin/python")
    if not python.exists():
        print("Bir defalık Python ortamı hazırlanıyor…")
        run([sys.executable, "-m", "venv", str(ROOT / ".venv")], env)
    lock = ROOT / "requirements.lock.txt"
    digest = hashlib.sha256(lock.read_bytes()).hexdigest()
    # Stamp name predates the OutLab rename; kept so existing installs are not redone.
    stamp = ROOT / ".venv" / ".rotalab-dependencies"
    if not stamp.exists() or stamp.read_text() != digest:
        print("Ücretsiz açık kaynak analiz paketleri kontrol ediliyor (ilk kurulumda internet gerekir)…")
        run([str(python), "-m", "pip", "install", "-r", str(lock)], env)
        stamp.write_text(digest)
    index = ROOT / "dist" / "index.html"
    source_paths = [*ROOT.glob("src/**/*"), ROOT / "package-lock.json", ROOT / "index.html", ROOT / "vite.config.ts"]
    rebuild = not index.exists() or any(p.is_file() and p.stat().st_mtime > index.stat().st_mtime for p in source_paths)
    if rebuild:
        npm = shutil.which("npm")
        if npm is None:
            print("Arayüzü ilk kez hazırlamak için Node.js 22 LTS gerekli: https://nodejs.org/")
            return 1
        print("Arayüz hazırlanıyor…")
        run([npm, "ci", "--no-fund"], env)
        run([npm, "run", "build"], env)
    print("OutLab başlatılıyor. Veriler yalnızca bu bilgisayarda işlenir.")
    server = subprocess.Popen([str(python), "-m", "uvicorn", "backend.main:app", "--host", "127.0.0.1", "--port", "8765", "--no-access-log"], cwd=ROOT, env=env)
    try:
        deadline = time.monotonic() + 45
        while time.monotonic() < deadline:
            if server.poll() is not None:
                return server.returncode or 1
            if health():
                print("\nHazır: " + URL + "\nBu terminal penceresi açık kalsın. Kapatmak için Control+C.")
                if not args.no_browser:
                    webbrowser.open(URL)
                return server.wait()
            time.sleep(.25)
        print("Sunucu hazır olamadı. Terminaldeki hata mesajını kontrol edin.")
        return 1
    except KeyboardInterrupt:
        print("\nOutLab kapatılıyor.")
        return 0
    finally:
        if server.poll() is None:
            server.terminate()
            try:
                server.wait(timeout=8)
            except subprocess.TimeoutExpired:
                server.kill()
                server.wait()


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (subprocess.CalledProcessError, OSError) as exc:
        print(f"\nKurulum/başlatma tamamlanamadı: {exc}\nKullanım kılavuzundaki Sorun çözme bölümüne bakın.")
        raise SystemExit(1)

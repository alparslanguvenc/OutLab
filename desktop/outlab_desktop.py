"""OutLab desktop launcher (used for the packaged macOS and Windows apps).

Starts the local analysis engine on 127.0.0.1:8765, opens the app in the
default browser and shows a small control window to reopen or quit.
Nothing is sent anywhere: the server only listens on the local machine.

`--self-test` starts the server headless, checks the API and the bundled
interface, runs a small analysis and exits (used by the release builds).
"""
from __future__ import annotations

import json
import os
import socket
import sys
import threading
import time
import urllib.request
import webbrowser
from pathlib import Path

HOST, PORT = "127.0.0.1", 8765
URL = f"http://{HOST}:{PORT}"
APP_VERSION = "1.4.1"


def data_dir() -> Path:
    """Writable per-user folder for caches (never inside the signed app bundle)."""
    if sys.platform == "darwin":
        base = Path.home() / "Library" / "Application Support"
    elif os.name == "nt":
        base = Path(os.environ.get("LOCALAPPDATA", Path.home() / "AppData" / "Local"))
    else:
        base = Path(os.environ.get("XDG_DATA_HOME", Path.home() / ".local" / "share"))
    path = base / "OutLab"
    path.mkdir(parents=True, exist_ok=True)
    return path


def health() -> dict | None:
    try:
        with urllib.request.urlopen(URL + "/api/health", timeout=1.5) as response:
            data = json.load(response)
            return data if data.get("app") == "outlab" else None
    except (OSError, ValueError):
        return None


def port_busy() -> bool:
    with socket.socket() as probe:
        return probe.connect_ex((HOST, PORT)) == 0


def start_server() -> threading.Thread:
    # PyInstaller's matplotlib hook points MPLCONFIGDIR at a throw-away temp folder;
    # a persistent per-user cache keeps later launches fast.
    os.environ["MPLCONFIGDIR"] = str(data_dir() / "matplotlib")
    import uvicorn

    from backend.main import app

    # log_config=None: a windowed app has no console, so uvicorn must not set up stream logging.
    config = uvicorn.Config(app, host=HOST, port=PORT, log_level="warning", access_log=False, log_config=None)
    server = uvicorn.Server(config)
    thread = threading.Thread(target=server.run, name="outlab-server", daemon=True)
    thread.start()
    deadline = time.monotonic() + 60
    while time.monotonic() < deadline:
        if health():
            return thread
        if not thread.is_alive():
            break
        time.sleep(0.2)
    raise RuntimeError("The OutLab engine did not start.")


def self_test() -> int:
    """Headless check used in CI: API, bundled UI and one real analysis."""
    start_server()
    with urllib.request.urlopen(URL + "/", timeout=5) as response:
        page = response.read().decode("utf-8")
        assert "<div id=\"root\">" in page, "bundled interface missing"
    times = [i / 15 for i in range(15 * 90)]
    import math

    values = [2 + 0.01 * math.sin(t) + 0.5 * math.exp(-((t - 60) / 1.6) ** 2) for t in times]
    text = "Time,EA\n" + "\n".join(f"{t:.6f},{v:.6f}" for t, v in zip(times, values))
    imported = post("/api/import", {"sources": [{"name": "EA.csv", "text": text}]})
    config = {"baselineStart": 10, "baselineEnd": 35, "zThreshold": 3, "minDistance": 10, "motionThreshold": 3}
    result = post("/api/analyze", {"dataset": imported, "config": config, "options": {"quality": {"enabled": True}}})
    assert any(abs(event["t"] - 60) < 2 for event in result["events"]), "analysis did not find the test response"
    assert "quality" in result["extras"], "optional methods unavailable"
    print(f"OutLab {APP_VERSION} self-test passed: {len(result['events'])} candidate(s), NeuroKit2 {result['version']}")
    return 0


def post(path: str, body: dict) -> dict:
    request = urllib.request.Request(URL + path, data=json.dumps(body).encode("utf-8"), headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(request, timeout=60) as response:
        return json.load(response)


def control_window(already_running: bool) -> None:
    import tkinter as tk

    root = tk.Tk()
    root.title("OutLab")
    root.resizable(False, False)
    root.configure(bg="#1f5fa8", padx=22, pady=18)
    tk.Label(root, text="OutLab", fg="white", bg="#1f5fa8", font=("Helvetica", 20, "bold")).pack(anchor="w")
    status = "is already running" if already_running else "is running"
    tk.Label(root, text=f"OutLab {status} at {URL}\nOutLab {URL} adresinde çalışıyor.", fg="white", bg="#1f5fa8", justify="left", font=("Helvetica", 11)).pack(anchor="w", pady=(6, 14))
    row = tk.Frame(root, bg="#1f5fa8")
    row.pack(anchor="w")
    tk.Button(row, text="Open / Aç", width=14, command=lambda: webbrowser.open(URL)).pack(side="left", padx=(0, 8))
    tk.Button(row, text="Quit / Kapat", width=14, command=root.destroy).pack(side="left")
    tk.Label(root, text="Data stays on this computer. Closing this window stops OutLab.\nVeriler bu bilgisayarda kalır. Pencereyi kapatmak OutLab'ı durdurur.", fg="#dbe7f5", bg="#1f5fa8", justify="left", font=("Helvetica", 9)).pack(anchor="w", pady=(14, 0))
    root.protocol("WM_DELETE_WINDOW", root.destroy)
    root.mainloop()


def show_error(message: str) -> None:
    try:
        import tkinter as tk
        from tkinter import messagebox

        root = tk.Tk()
        root.withdraw()
        messagebox.showerror("OutLab", message)
        root.destroy()
    except Exception:
        print(message, file=sys.stderr)


def main() -> int:
    # Windowed builds have no stdout/stderr; keep messages in a log file instead of crashing.
    if sys.stdout is None or sys.stderr is None:
        log = open(data_dir() / "outlab.log", "a", encoding="utf-8")
        sys.stdout = sys.stdout or log
        sys.stderr = sys.stderr or log
    if "--self-test" in sys.argv:
        return self_test()
    if health():
        webbrowser.open(URL)
        try:
            control_window(already_running=True)
        except Exception:
            pass
        return 0
    if port_busy():
        show_error(f"Port {PORT} is used by another program. Close it and start OutLab again.\n\n{PORT} portunu başka bir program kullanıyor. O programı kapatıp OutLab'ı yeniden başlatın.")
        return 1
    try:
        server = start_server()
    except Exception as exc:  # show the reason instead of failing silently in a windowed app
        show_error(f"OutLab could not start: {exc}\n\nOutLab başlatılamadı: {exc}")
        return 1
    webbrowser.open(URL)
    try:
        control_window(already_running=False)
    except Exception as exc:  # no Tk available: keep serving so the browser app still works
        print(f"Control window unavailable ({exc}). OutLab keeps running at {URL}; stop it with Ctrl+C.")
        try:
            server.join()
        except KeyboardInterrupt:
            pass
    return 0


if __name__ == "__main__":
    # Make the bundled `backend` package importable when frozen and when run from the repo.
    root = Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parents[1]))
    sys.path.insert(0, str(root))
    raise SystemExit(main())

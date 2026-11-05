"""Regenerate THIRD_PARTY_NOTICES.md and THIRD_PARTY_LICENSES.txt.

Run from the repository root inside a virtual environment created from
requirements.lock.txt plus `pip-licenses` and the PyInstaller version used by
the desktop workflow, after `npm ci`:

    python desktop/generate_third_party_notices.py

The desktop apps bundle both files next to OutLab's own LICENSE.
"""
from __future__ import annotations

import json
import subprocess
import sys
import sysconfig
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
# Development/test-only packages that are not shipped in the desktop apps.
NOT_SHIPPED = {"pytest", "pluggy", "iniconfig", "httpx", "httpcore", "pygments"}
NPM = ["react", "react-dom", "scheduler", "three", "lucide-react", "@fontsource-variable/overpass"]


def python_packages() -> list[dict]:
    names = [line.split("==")[0] for line in (ROOT / "requirements.lock.txt").read_text().splitlines() if "==" in line]
    names = [n for n in names if n.lower() not in NOT_SHIPPED] + ["pyinstaller"]
    out = subprocess.run(
        [sys.executable, "-m", "piplicenses", "--format=json", "--with-urls", "--with-license-file", "--no-license-path", "--packages", *names],
        check=True, capture_output=True, text=True,
    ).stdout
    return sorted(json.loads(out), key=lambda p: p["Name"].lower())


def npm_packages() -> list[dict]:
    result = []
    for name in NPM:
        folder = ROOT / "node_modules" / name
        meta = json.loads((folder / "package.json").read_text())
        text = next((f.read_text(errors="replace") for f in sorted(folder.iterdir()) if f.name.upper().startswith(("LICENSE", "LICENCE", "COPYING"))), "")
        url = meta.get("homepage") or (meta.get("repository") or {}).get("url", "") if isinstance(meta.get("repository"), dict) else meta.get("homepage", "")
        result.append({"Name": meta["name"], "Version": meta["version"], "License": meta.get("license", ""), "URL": url or "", "LicenseText": text})
    return result


def python_runtime_license() -> str:
    for candidate in (Path(sysconfig.get_paths()["stdlib"]) / "LICENSE.txt", Path(sys.base_prefix) / "LICENSE.txt"):
        if candidate.exists():
            return candidate.read_text(errors="replace")
    return "See https://docs.python.org/3/license.html"


def main() -> None:
    py, js = python_packages(), npm_packages()
    rows = ["| Component | Version | License | Where it is used |", "|---|---|---|---|"]
    rows.append(f"| CPython runtime | {sys.version.split()[0]} | PSF-2.0 | Desktop apps (embedded interpreter) |")
    rows.append("| Tcl/Tk | 8.6 | Tcl/Tk license (BSD-style) | Desktop apps (control window) |")
    for p in py:
        if p["Name"].lower() == "pyinstaller":
            # The bootloader exception lets apps built with PyInstaller use any license.
            rows.append(f"| {p['Name']} | {p['Version']} | GPL-2.0 with bootloader exception (built apps may use any license) | Desktop app packaging (bootloader) |")
            continue
        rows.append(f"| {p['Name']} | {p['Version']} | {p['License']} | Analysis engine |")
    for p in js:
        where = "Bundled typeface" if "overpass" in p["Name"] else "Web interface"
        rows.append(f"| {p['Name']} | {p['Version']} | {p['License']} | {where} |")
    (ROOT / "THIRD_PARTY_NOTICES.md").write_text(
        "# Third-party notices\n\n"
        "OutLab is released under the MIT License (see `LICENSE`). It is built on the open-source components below, "
        "which keep their own licenses. All of them permit free use and redistribution, including in the desktop apps. "
        "No component requires payment, an account or an API key. The full license texts are in `THIRD_PARTY_LICENSES.txt`.\n\n"
        "The optional `cvxopt` package (GPL-3.0) is **not** distributed with OutLab. Users may install it themselves when running from source.\n\n"
        + "\n".join(rows)
        + "\n\nNative libraries shipped inside the NumPy and SciPy wheels (for example OpenBLAS, and the GCC runtime libraries "
        "under the GCC Runtime Library Exception) are covered by the license files of those packages, reproduced in full in "
        "`THIRD_PARTY_LICENSES.txt`.\n\n"
        "## Trademarks\n\nEmotiBit, Insta360, Ledalab, LinkedIn, GitHub and X are trademarks of their respective owners. "
        "They are named only to describe compatible devices, file formats or links. OutLab is an independent project and is not "
        "affiliated with, sponsored by or endorsed by any of them.\n",
        encoding="utf-8",
    )
    parts = ["OutLab third-party licenses\n" + "=" * 27 + "\n\nFull license texts of the components listed in THIRD_PARTY_NOTICES.md.\n"]
    parts.append(f"\n{'-' * 78}\nCPython {sys.version.split()[0]} (PSF-2.0)\n{'-' * 78}\n{python_runtime_license()}")
    parts.append(f"\n{'-' * 78}\nTcl/Tk 8.6 (Tcl/Tk license)\n{'-' * 78}\nhttps://www.tcl-lang.org/software/tcltk/license.html\n")
    for p in py + js:
        text = p.get("LicenseText") or p.get("LicenseText", "")
        parts.append(f"\n{'-' * 78}\n{p['Name']} {p['Version']} ({p['License']})\n{p.get('URL', '')}\n{'-' * 78}\n{text.strip() or 'License text not shipped by the package; see the URL above.'}\n")
    (ROOT / "THIRD_PARTY_LICENSES.txt").write_text("".join(parts), encoding="utf-8")
    print(f"{len(py)} Python packages, {len(js)} npm packages")


if __name__ == "__main__":
    main()

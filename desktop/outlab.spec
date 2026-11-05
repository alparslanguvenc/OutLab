# PyInstaller build recipe for the OutLab desktop app.
# Run from the repository root after `npm run build`:
#   pyinstaller desktop/outlab.spec --distpath build-desktop/dist --workpath build-desktop/work
# (Never use the default ./dist: that folder holds the built web interface.)
import os
import sys

from PyInstaller.utils.hooks import collect_data_files, collect_submodules, copy_metadata

ROOT = os.path.abspath(os.path.join(SPECPATH, ".."))
VERSION = "1.4.0"

if not os.path.isfile(os.path.join(ROOT, "dist", "index.html")):
    raise SystemExit("Build the interface first: npm ci && npm run build")

datas = [(os.path.join(ROOT, "dist"), "dist")]
datas += collect_data_files("neurokit2")
# analysis.py records library versions through importlib.metadata
for package in ("neurokit2", "numpy", "scipy", "fastapi", "pydantic", "starlette", "uvicorn"):
    datas += copy_metadata(package)

hiddenimports = collect_submodules("uvicorn") + collect_submodules("backend")

a = Analysis(
    [os.path.join(SPECPATH, "outlab_desktop.py")],
    pathex=[ROOT],
    datas=datas,
    hiddenimports=hiddenimports,
    # cvxopt (GPL-3.0) is deliberately not bundled; cvxEDA is skipped and the app says so.
    excludes=["cvxopt", "pytest", "IPython", "notebook", "jupyter", "tests"],
    noarchive=False,
)
pyz = PYZ(a.pure)

icon = os.path.join(SPECPATH, "icons", "outlab.icns" if sys.platform == "darwin" else "outlab.ico")
exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="OutLab",
    console=False,
    icon=icon,
    disable_windowed_traceback=False,
)
coll = COLLECT(exe, a.binaries, a.datas, name="OutLab")

if sys.platform == "darwin":
    app = BUNDLE(
        coll,
        name="OutLab.app",
        icon=icon,
        bundle_identifier="io.github.alparslanguvenc.outlab",
        version=VERSION,
        info_plist={
            "CFBundleName": "OutLab",
            "CFBundleDisplayName": "OutLab",
            "CFBundleShortVersionString": VERSION,
            "CFBundleVersion": VERSION,
            "NSHighResolutionCapable": True,
            "LSMinimumSystemVersion": "12.0",
            "NSHumanReadableCopyright": "© 2026 Alparslan Güvenç. MIT License.",
        },
    )

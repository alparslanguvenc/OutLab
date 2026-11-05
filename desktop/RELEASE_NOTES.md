Download the file for your computer from **Assets** below. Python and Node.js are not needed.

| Computer | File |
|---|---|
| Mac with Apple Silicon (M1–M4) | `OutLab-macOS-AppleSilicon.dmg` |
| Mac with an Intel processor | `OutLab-macOS-Intel.dmg` |
| Windows 10/11 (64-bit) | `OutLab-Windows-Setup.exe` |

**macOS:** Open the `.dmg` and drag **OutLab** into **Applications**. The app is not yet signed with an Apple Developer ID, so the first launch is blocked. Go to **System Settings → Privacy & Security** and click **Open Anyway** next to the OutLab message. You only need to do this once.

**Windows:** Run `OutLab-Windows-Setup.exe`. It installs for your user only, so no administrator rights are needed. If SmartScreen shows "Windows protected your PC", click **More info → Run anyway**. The installer is not code-signed yet.

When OutLab starts, a small control window appears and the app opens in your browser at http://127.0.0.1:8765. Closing the control window stops OutLab. All data stays on your computer.

Notes:
- The optional cvxEDA decomposition is not included in these packages, and the robustness analysis says so when it runs. Every other method is available.
- Each package passed an automatic self-test before release: it starts the engine, serves the interface and runs a real analysis.
- `SHA256SUMS.txt` lists checksums for the downloads.

OutLab does not diagnose emotion or stress; see the README for research boundaries.

"""Optional artifact-screening and robustness methods, applied in addition to the core analysis.

Nothing here changes raw data or the core candidate list unless the researcher
explicitly chooses the "exclude" action for physiologically invalid EDA.
Every rule is transparent: each flagged sample or window carries reason codes.
"""
from __future__ import annotations

import math
import warnings as python_warnings
from typing import Any

import numpy as np

from .i18n import msg

ROBUST_SCALE = 0.6744897501960817
DECOMPOSITIONS = ("highpass", "smoothmedian", "cvxEDA")
PEAK_METHODS = ("neurokit", "kim2004", "gamboa2008", "nabian2018", "vanhalem2020")
# vanhalem2020 applies its own smoothing and expects the (cleaned) skin conductance level,
# so it runs once per segment on the cleaned signal rather than on each phasic component.
LEVEL_PEAK_METHODS = {"vanhalem2020"}


def cvxeda_available() -> bool:
    try:
        import cvxopt  # noqa: F401
    except ImportError:
        return False
    return True


def _runs(mask: np.ndarray) -> list[tuple[int, int]]:
    """Index ranges [start, end] (inclusive) of consecutive True values."""
    runs: list[tuple[int, int]] = []
    start = None
    for i, value in enumerate(mask):
        if value and start is None:
            start = i
        elif not value and start is not None:
            runs.append((start, i - 1))
            start = None
    if start is not None:
        runs.append((start, len(mask) - 1))
    return runs


# --------------------------------------------------------------------------- 1. quality rules


def quality_rules(times: np.ndarray, raw: np.ndarray, temperature: tuple[np.ndarray, str] | None, opts: dict[str, Any], gap: float) -> dict[str, Any]:
    """Rule-based EDA quality screen (range, rate of change, skin temperature, flat line).

    Range, slope, temperature and the transition margin follow the published
    ambulatory EDA quality procedure of Kleckner et al. (2018); the flat-line
    rule is an additional OutLab heuristic for lost electrode contact.
    """
    n = len(times)
    reasons: dict[str, np.ndarray] = {}
    reasons["range"] = (raw < opts["minUs"]) | (raw > opts["maxUs"])
    slope = np.zeros(n, dtype=bool)
    if n > 1:
        dt = np.diff(times)
        rate = np.abs(np.diff(raw) / dt)
        steep = (rate > opts["maxSlope"]) & (dt <= gap)
        slope[1:] |= steep
        slope[:-1] |= steep
    reasons["slope"] = slope
    notices: list[str] = []
    if temperature is not None:
        temp_values, tag = temperature
        unknown = ~np.isfinite(temp_values)
        reasons["temperature"] = np.isfinite(temp_values) & ((temp_values < opts["tempMin"]) | (temp_values > opts["tempMax"]))
        if unknown.any():
            notices.append(msg(f"{int(unknown.sum())} EDA örneğinde eşzamanlı {tag} sıcaklık verisi yok; bu örneklerde sıcaklık kuralı uygulanamadı.", f"{int(unknown.sum())} EDA samples have no simultaneous {tag} temperature value; the temperature rule could not be applied there."))
    else:
        notices.append(msg("Sıcaklık kuralı uygulanmadı: °C birimli bir sıcaklık kanalı seçilmedi veya bulunamadı.", "Temperature rule not applied: no temperature channel in °C was selected or found."))
    flat = np.zeros(n, dtype=bool)
    if opts["flatSeconds"] > 0 and n > 1:
        # A run of samples whose spread stays below flatRangeUs for at least flatSeconds.
        # Single pass with a running min/max, so long flat stretches stay linear in time.
        start, low, high = 0, raw[0], raw[0]
        for end in range(1, n + 1):
            if end < n:
                low_next, high_next = min(low, raw[end]), max(high, raw[end])
            boundary = end == n or (times[end] - times[end - 1] > gap) or (high_next - low_next > opts["flatRangeUs"])
            if boundary:
                if times[end - 1] - times[start] >= opts["flatSeconds"]:
                    flat[start:end] = True
                start = end
                if end < n:
                    low = high = raw[end]
            else:
                low, high = low_next, high_next
    reasons["flat"] = flat
    core = np.zeros(n, dtype=bool)
    for mask in reasons.values():
        core |= mask
    transition = np.zeros(n, dtype=bool)
    if opts["transitionSeconds"] > 0 and core.any():
        for a, b in _runs(core):
            lo = np.searchsorted(times, times[a] - opts["transitionSeconds"], side="left")
            hi = np.searchsorted(times, times[b] + opts["transitionSeconds"], side="right")
            transition[lo:hi] = True
        transition &= ~core
    reasons["transition"] = transition
    invalid = core | transition
    windows = []
    window = opts["windowSeconds"]
    if n:
        edges = np.arange(times[0], times[-1] + window, window)
        for left in edges:
            inside = (times >= left) & (times < left + window)
            if not inside.any():
                continue
            codes = [code for code, mask in reasons.items() if mask[inside].any()]
            share = float(invalid[inside].mean())
            windows.append(dict(start=float(left), end=float(min(left + window, times[-1])), invalidShare=share, valid=share == 0, reasons=codes))
    counts = {code: int(mask.sum()) for code, mask in reasons.items()}
    usable = float((~invalid).mean() * 100) if n else 0.0
    notices.insert(0, msg(f"Kalite kuralları: örneklerin %{usable:.1f}'i kullanılabilir. Kurallar şeffaf eşiklerdir; geçersiz işaretli veri silinmedi.", f"Quality rules: {usable:.1f}% of samples are usable. The rules are transparent thresholds; data marked invalid were not deleted."))
    return dict(invalid=invalid, reasons=reasons, summary=dict(usablePercent=usable, invalidSamples=int(invalid.sum()), reasonCounts=counts, windows=windows, temperatureTag=temperature[1] if temperature else None), notices=notices)


# --------------------------------------------------------------------------- 3. window-based motion


def _speed_kmh(track: list[dict[str, Any]], offset: float, centres: np.ndarray) -> np.ndarray:
    """GPS speed at window centres from consecutive fixes (haversine), only inside coverage."""
    speeds = np.full(len(centres), np.nan)
    pts = [p for p in track if all(isinstance(p.get(k), (int, float)) for k in ("t", "lat", "lon"))]
    if len(pts) < 2:
        return speeds
    t = np.asarray([p["t"] + offset for p in pts], dtype=float)
    lat = np.radians([p["lat"] for p in pts])
    lon = np.radians([p["lon"] for p in pts])
    seg = np.asarray([p.get("segment", 0) for p in pts])
    d_lat, d_lon = np.diff(lat), np.diff(lon)
    a = np.sin(d_lat / 2) ** 2 + np.cos(lat[:-1]) * np.cos(lat[1:]) * np.sin(d_lon / 2) ** 2
    dist = 2 * 6371008.8 * np.arcsin(np.sqrt(np.clip(a, 0, 1)))
    dt = np.diff(t)
    ok = (dt > 0) & (dt <= 30) & (seg[1:] == seg[:-1])
    mid = (t[:-1] + t[1:]) / 2
    v = np.where(ok, dist / np.where(dt > 0, dt, 1) * 3.6, np.nan)
    for i, c in enumerate(centres):
        j = int(np.argmin(np.abs(mid - c)))
        if ok[j] and abs(mid[j] - c) <= max(dt[j], 5):
            speeds[i] = v[j]
    return speeds


def _magnitude(channels: list[dict[str, Any]], tags: tuple[str, str, str], units: dict[str, float], arrays, interpolate) -> tuple[np.ndarray, np.ndarray] | str:
    axes = [[c for c in channels if c.get("tag") == tag] for tag in tags]
    if not all(len(a) == 1 for a in axes):
        return msg(f"{'/'.join(tags)} kanallarının her birinden tek kayıt gerekli.", f"Exactly one recording each of {'/'.join(tags)} is required.")
    scaled = []
    for (channel,) in axes:
        unit = str(channel.get("unit", "")).strip().lower().replace(" ", "")
        if unit not in units:
            return msg(f"{channel['tag']} birimi '{channel.get('unit')}' tanınmıyor.", f"{channel['tag']}: unit '{channel.get('unit')}' is not recognized.")
        t, v = arrays(channel)
        scaled.append((t, v * units[unit]))
    (t0, x), (t1, y), (t2, z) = scaled
    if min(len(t0), len(t1), len(t2)) < 2:
        return msg(f"{'/'.join(tags)} kanallarında yeterli örnek yok.", f"The {'/'.join(tags)} channels do not have enough samples.")
    return t0, np.sqrt(x**2 + interpolate(t1, y, t0) ** 2 + interpolate(t2, z, t0) ** 2)


def _robust_threshold(values: np.ndarray, k: float) -> float | None:
    finite = values[np.isfinite(values)]
    if len(finite) < 5:
        return None
    median = float(np.median(finite))
    mad = float(np.median(np.abs(finite - median)))
    if mad <= 1e-12:
        return None
    return median + k * mad / ROBUST_SCALE


def motion_windows(channels: list[dict[str, Any]], times: np.ndarray, track: list[dict[str, Any]], opts: dict[str, Any], arrays, interpolate) -> dict[str, Any]:
    """Windowed motion intensity with participant-relative (adaptive) thresholds.

    Features per window: standard deviation of acceleration magnitude (g) and,
    optionally, mean gyroscope magnitude (°/s). A window is flagged when a
    feature exceeds median + k·MAD/0.6745 of the same session's windows, so the
    threshold adapts to each ride's own vibration level. GPS speed is context only.
    """
    notices: list[str] = []
    acc = _magnitude(channels, ("AX", "AY", "AZ"), {"g": 1.0, "gravity": 1.0, "m/s²": 1 / 9.80665, "m/s^2": 1 / 9.80665, "m/s2": 1 / 9.80665}, arrays, interpolate)
    if isinstance(acc, str):
        return dict(flags=np.zeros(len(times), dtype=bool), summary=None, notices=[msg("Pencere tabanlı hareket hesaplanamadı: ", "Window-based motion could not be computed: ") + acc])
    gyro = None
    if opts["useGyro"]:
        gyro = _magnitude(channels, ("GX", "GY", "GZ"), {"°/s": 1.0, "deg/s": 1.0, "dps": 1.0, "degrees/second": 1.0}, arrays, interpolate)
        if isinstance(gyro, str):
            notices.append(msg("Jiroskop kullanılmadı: ", "Gyroscope not used: ") + gyro)
            gyro = None
    acc_t, acc_m = acc
    window = opts["windowSeconds"]
    start, stop = max(times[0], acc_t[0]), min(times[-1], acc_t[-1])
    if stop - start < window:
        return dict(flags=np.zeros(len(times), dtype=bool), summary=None, notices=[msg("Pencere tabanlı hareket hesaplanamadı: EDA ve ivme kayıtları yeterince örtüşmüyor.", "Window-based motion could not be computed: EDA and acceleration recordings do not overlap enough.")])
    lefts = np.arange(start, stop - window / 2, window)
    acc_sd = np.full(len(lefts), np.nan)
    gyro_mean = np.full(len(lefts), np.nan)
    min_samples = 3
    for i, left in enumerate(lefts):
        inside = (acc_t >= left) & (acc_t < left + window) & np.isfinite(acc_m)
        if inside.sum() >= min_samples:
            acc_sd[i] = float(np.std(acc_m[inside]))
        if gyro is not None:
            g_t, g_m = gyro
            g_in = (g_t >= left) & (g_t < left + window) & np.isfinite(g_m)
            if g_in.sum() >= min_samples:
                gyro_mean[i] = float(np.mean(g_m[g_in]))
    acc_limit = _robust_threshold(acc_sd, opts["k"])
    gyro_limit = _robust_threshold(gyro_mean, opts["k"]) if gyro is not None else None
    centres = lefts + window / 2
    speed = _speed_kmh(track, opts["gpsOffset"], centres) if opts["useSpeed"] and track else np.full(len(lefts), np.nan)
    windows = []
    flags = np.zeros(len(times), dtype=bool)
    for i, left in enumerate(lefts):
        codes = []
        if acc_limit is not None and np.isfinite(acc_sd[i]) and acc_sd[i] > acc_limit:
            codes.append("acceleration")
        if gyro_limit is not None and np.isfinite(gyro_mean[i]) and gyro_mean[i] > gyro_limit:
            codes.append("gyroscope")
        context = None
        if np.isfinite(speed[i]):
            context = "stationary" if speed[i] < 1.5 else "riding"
        windows.append(dict(start=float(left), end=float(left + window), accSd=None if not np.isfinite(acc_sd[i]) else float(acc_sd[i]), gyroMean=None if not np.isfinite(gyro_mean[i]) else float(gyro_mean[i]), speedKmh=None if not np.isfinite(speed[i]) else float(speed[i]), context=context, flagged=bool(codes), reasons=codes))
        if codes:
            flags |= (times >= left) & (times < left + window)
    if acc_limit is None:
        notices.append(msg("İvme değişkenliği sabit veya pencere sayısı yetersiz; uyarlanır eşik hesaplanamadı.", "Acceleration variability is constant or there are too few windows; no adaptive threshold could be computed."))
    flagged_share = float(np.mean([w["flagged"] for w in windows]) * 100) if windows else 0.0
    notices.insert(0, msg(f"Pencere tabanlı hareket: {window:g} s pencerelerin %{flagged_share:.1f}'i bu sürüşün kendi dağılımına göre yüksek hareketli. Bu bir inceleme işaretidir, artefakt kanıtı değildir.", f"Window-based motion: {flagged_share:.1f}% of the {window:g} s windows show high motion relative to this ride's own distribution. This is a review flag, not proof of an artifact."))
    stationary = sum(1 for w in windows if w["context"] == "stationary")
    riding = sum(1 for w in windows if w["context"] == "riding")
    return dict(flags=flags, summary=dict(windows=windows, accThreshold=acc_limit, gyroThreshold=gyro_limit, flaggedPercent=flagged_share, gyroUsed=gyro is not None, contextWindows=dict(stationary=stationary, riding=riding)), notices=notices)


# --------------------------------------------------------------------------- 4. multi-method robustness


def robustness(grids: list[dict[str, Any]], events: list[dict[str, Any]], opts: dict[str, Any]) -> dict[str, Any]:
    """Re-run decomposition × SCR peak detection and count how many configurations support each candidate."""
    import neurokit2 as nk

    notices: list[str] = []
    decompositions = [d for d in opts["decompositions"] if d in DECOMPOSITIONS]
    if "cvxEDA" in decompositions and not cvxeda_available():
        decompositions.remove("cvxEDA")
        notices.append(msg("cvxEDA atlandı: cvxopt paketi kurulu değil (pip install cvxopt).", "cvxEDA skipped: the cvxopt package is not installed (pip install cvxopt)."))
    peak_methods = [m for m in opts["peakMethods"] if m in PEAK_METHODS]
    configs: list[dict[str, Any]] = []
    for method in peak_methods:
        if method in LEVEL_PEAK_METHODS:
            configs.append(dict(id=f"level+{method}", decomposition=None, peakMethod=method, peaks=[]))
        else:
            configs.extend(dict(id=f"{d}+{method}", decomposition=d, peakMethod=method, peaks=[]) for d in decompositions)
    if not configs:
        return dict(summary=None, notices=notices + [msg("Sağlamlık analizi için en az bir ayrıştırma ve bir tepe yöntemi seçin.", "Select at least one decomposition and one peak method for the robustness analysis.")])
    failures: dict[str, str] = {}
    for grid in grids:
        uniform_t, cleaned, fs = grid["t"], grid["cleaned"], grid["fs"]
        phasic_by_method: dict[str, np.ndarray] = {}
        for config in configs:
            decomposition = config["decomposition"]
            try:
                with python_warnings.catch_warnings():
                    python_warnings.simplefilter("ignore")
                    if decomposition is None:
                        signal = cleaned
                    else:
                        if decomposition not in phasic_by_method:
                            phasic_by_method[decomposition] = nk.eda_phasic(cleaned, sampling_rate=fs, method=decomposition)["EDA_Phasic"].to_numpy()
                        signal = phasic_by_method[decomposition]
                    _, info = nk.eda_peaks(signal, sampling_rate=fs, method=config["peakMethod"])
            except Exception as exc:  # a method can fail on short or flat segments
                failures[config["id"]] = str(exc)
                continue
            for k, peak in enumerate(info.get("SCR_Peaks", [])):
                if peak is None or not np.isfinite(peak):
                    continue
                peak = int(peak)
                if peak < 0 or peak >= len(uniform_t):
                    continue
                t_peak = float(uniform_t[peak])
                if t_peak < uniform_t[0] + grid["edge"] or t_peak > uniform_t[-1] - grid["edge"]:
                    continue
                amplitude = info.get("SCR_Amplitude", [np.nan] * (k + 1))[k]
                amplitude = float(amplitude) if amplitude is not None and np.isfinite(amplitude) else None
                if amplitude is None or amplitude < opts["minAmplitudeUs"]:
                    continue
                rise = info.get("SCR_RiseTime", [np.nan] * (k + 1))[k]
                config["peaks"].append(dict(t=t_peak, amplitude=amplitude, riseTime=float(rise) if rise is not None and np.isfinite(rise) else None))
    for config_id, error in failures.items():
        notices.append(msg(f"{config_id} bazı kesitlerde çalışmadı: {error}", f"{config_id} failed on some segments: {error}"))
    tolerance = opts["toleranceSeconds"]
    support = {}
    for event in events:
        supporting = [c["id"] for c in configs if any(abs(p["t"] - event["t"]) <= tolerance for p in c["peaks"])]
        support[event["id"]] = dict(count=len(supporting), total=len(configs), configs=supporting)
    weak = sum(1 for s in support.values() if s["total"] and s["count"] / s["total"] < 0.5)
    notices.insert(0, msg(f"Sağlamlık: {len(configs)} yöntem birleşimi çalıştırıldı (±{tolerance:g} s tolerans, en az {opts['minAmplitudeUs']:g} µS SCR genliği). Adayların {weak}'i birleşimlerin yarısından azında destekleniyor.", f"Robustness: {len(configs)} method combinations were run (±{tolerance:g} s tolerance, minimum SCR amplitude {opts['minAmplitudeUs']:g} µS). {weak} candidates are supported by fewer than half of the combinations."))
    return dict(summary=dict(configs=[dict(id=c["id"], decomposition=c["decomposition"], peakMethod=c["peakMethod"], scrCount=len(c["peaks"]), peaks=c["peaks"]) for c in configs], support=support, toleranceSeconds=tolerance, minAmplitudeUs=opts["minAmplitudeUs"], cvxEDAAvailable=cvxeda_available()), notices=notices)


def finite_or_none(value: float) -> float | None:
    return float(value) if value is not None and math.isfinite(value) else None

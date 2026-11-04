"""Exploratory EDA processing with explicit methods and quality boundaries."""
from __future__ import annotations

import math
import os
from pathlib import Path
import warnings as python_warnings
from importlib.metadata import version
from typing import Any

# NeuroKit imports Matplotlib. Keep its generated cache beside private local data.
_cache = Path(__file__).resolve().parents[1] / "private" / "matplotlib"
os.environ.setdefault("MPLCONFIGDIR", str(_cache))
Path(os.environ["MPLCONFIGDIR"]).mkdir(parents=True, exist_ok=True)

import neurokit2 as nk
import numpy as np
from scipy.signal import find_peaks

from .i18n import msg
from .ingestion import DataError

MIN_SEGMENT_SECONDS = 10.0
MIN_BASELINE_SECONDS = 10.0
MIN_BASELINE_SAMPLES = 50
EDGE_SECONDS = 3.0
MAD_FLOOR = 1e-9
ROBUST_SCALE = 0.6744897501960817
MAX_POINTS = 1_500_000


def _arrays(channel: dict[str, Any]) -> tuple[np.ndarray, np.ndarray]:
    points = channel.get("points", [])
    if not points:
        return np.array([], dtype=float), np.array([], dtype=float)
    try:
        times = np.asarray([point["t"] for point in points], dtype=float)
        values = np.asarray([point["v"] for point in points], dtype=float)
    except (TypeError, KeyError, ValueError) as exc:
        raise DataError(msg("Kanal noktaları geçerli t ve v sayıları içermeli.", "Channel points must contain valid numeric t and v values.")) from exc
    if times.ndim != 1 or values.ndim != 1:
        raise DataError(msg("Kanal noktalarının t ve v alanları tek bir sayı olmalı.", "The t and v fields of each channel point must be a single number."))
    if len(times) > MAX_POINTS:
        raise DataError(msg("Analiz örnek sınırı aşıldı; oturumu bölün.", "Analysis sample limit exceeded; split the session."))
    if not np.all(np.isfinite(times)) or not np.all(np.isfinite(values)):
        raise DataError(msg("Kanalda geçersiz/sonsuz değer var; kaynak dosyasını yeniden içe aktarın.", "The channel contains invalid or infinite values; import the source file again."))
    if np.any(times < 0) or np.any(np.diff(times) <= 0):
        raise DataError(msg("Kanal zamanları artan ve benzersiz olmalı; kaynağı yeniden içe aktarın.", "Channel times must be increasing and unique; import the source again."))
    return times, values


def gap_limit(times: np.ndarray) -> float:
    if len(times) < 2:
        return 0.25
    return max(3 * float(np.median(np.diff(times))), 0.25)


def safe_interpolate(source_t: np.ndarray, source_v: np.ndarray, target_t: np.ndarray) -> np.ndarray:
    """Interpolate only inside coverage and never over a source recording gap."""
    result = np.full(len(target_t), np.nan)
    if len(source_t) < 2:
        return result
    result[:] = np.interp(target_t, source_t, source_v)
    result[(target_t < source_t[0]) | (target_t > source_t[-1])] = np.nan
    indices = np.searchsorted(source_t, target_t, side="right")
    left = np.clip(indices - 1, 0, len(source_t) - 1)
    right = np.clip(indices, 0, len(source_t) - 1)
    interior = (target_t != source_t[left]) & (target_t != source_t[right])
    result[interior & ((source_t[right] - source_t[left]) > gap_limit(source_t))] = np.nan
    return result


def _motion(channels: list[dict[str, Any]], times: np.ndarray) -> tuple[np.ndarray, list[str]]:
    axes = [[channel for channel in channels if channel.get("tag") == tag] for tag in ("AX", "AY", "AZ")]
    if not all(len(axis) == 1 for axis in axes):
        return np.full(len(times), np.nan), [msg("AX, AY ve AZ kanallarının her birinden tek kayıt gerekli; hareket bayrağı hesaplanamadı. Bu durum verinin artefaktsız olduğunu göstermez.", "Exactly one recording each of AX, AY and AZ is required, so no motion flag could be computed. This does not mean the data are artifact-free.")]
    scaled = []
    unit_notices: list[str] = []
    for axis in axes:
        channel = axis[0]
        unit = str(channel.get("unit", "g")).strip().lower().replace(" ", "")
        axis_t, axis_v = _arrays(channel)
        if unit in {"g", "gravity"}:
            scaled.append((axis_t, axis_v))
        elif unit in {"m/s²", "m/s^2", "m/s2", "meters/second^2", "metres/second^2"}:
            scaled.append((axis_t, axis_v / 9.80665))
            unit_notices.append(msg(f"{channel['tag']} hareket hesabında m/s² → g dönüşümü 9,80665 m/s² sabitiyle uygulandı; ham kanal değişmedi.", f"{channel['tag']}: converted from m/s² to g for the motion calculation using the constant 9.80665 m/s²; the raw channel is unchanged."))
        else:
            return np.full(len(times), np.nan), [msg(f"{channel['tag']} ivme birimi '{channel.get('unit')}' tanınmıyor; hareket bayrağı hesaplanmadı. Bilgi JSON birimini kontrol edin.", f"{channel['tag']}: acceleration unit '{channel.get('unit')}' is not recognized, so no motion flag was computed. Check the unit in the info JSON.")]
    (ax_t, ax), (ay_t, ay), (az_t, az) = scaled
    if min(len(ax_t), len(ay_t), len(az_t)) < 2:
        return np.full(len(times), np.nan), [msg("Hareket kanallarında yeterli örnek yok; hareket bayrağı hesaplanamadı.", "The motion channels do not have enough samples, so no motion flag could be computed.")]
    aligned_ay = safe_interpolate(ay_t, ay, ax_t)
    aligned_az = safe_interpolate(az_t, az, ax_t)
    magnitude = np.sqrt(ax**2 + aligned_ay**2 + aligned_az**2)
    derivative = np.full(len(ax_t), np.nan)
    dt = np.diff(ax_t)
    derivative[1:] = np.abs(np.diff(magnitude) / dt)
    derivative[1:][dt > gap_limit(ax_t)] = np.nan
    # Invalid values deliberately stay present, preventing interpolation across missing axes.
    motion = safe_interpolate(ax_t, derivative, times)
    missing = int(np.sum(~np.isfinite(motion)))
    notices = unit_notices + [msg("Hareket göstergesi |d√(AX²+AY²+AZ²)/dt| (g/s); eşik bir tarama sezgisidir, artefakt kanıtı değildir. Kaynak ivme birimini ve varsa g dönüşümünü bilgi dosyasından doğrulayın.", "Motion indicator: |d√(AX²+AY²+AZ²)/dt| (g/s). The threshold is a screening heuristic, not evidence of an artifact. Verify the source acceleration unit, and any conversion to g, against the info file.")]
    if missing:
        notices.append(msg(f"{missing} EDA örneğinde eşzamanlı üç eksenli hareket verisi yok; bu noktalarda hareket durumu bilinmiyor.", f"{missing} EDA samples have no simultaneous three-axis motion data; motion status at these points is unknown."))
    return motion, notices


def _segments(times: np.ndarray, values: np.ndarray) -> list[np.ndarray]:
    groups: list[list[int]] = []
    current: list[int] = []
    limit = gap_limit(times)
    for index in range(len(times)):
        if values[index] < 0:
            if current:
                groups.append(current)
                current = []
            continue
        if current and times[index] - times[current[-1]] > limit:
            groups.append(current)
            current = []
        current.append(index)
    if current:
        groups.append(current)
    return [np.asarray(group, dtype=int) for group in groups]


def analyze_dataset(dataset: dict[str, Any], config: dict[str, float]) -> dict[str, Any]:
    expected = {"baselineStart", "baselineEnd", "zThreshold", "minDistance", "motionThreshold"}
    if set(config) != expected or any(not isinstance(v, (int, float)) or not math.isfinite(v) for v in config.values()):
        raise DataError(msg("Analiz ayarları sonlu sayılar olarak eksiksiz verilmelidir.", "All analysis settings must be provided as finite numbers."))
    if config["baselineStart"] < 0 or config["baselineEnd"] - config["baselineStart"] < MIN_BASELINE_SECONDS:
        raise DataError(msg("Karşılaştırma aralığı en az 10 saniye olmalı ve 0'dan önce başlayamaz. Otomatik olarak dinlenme/bazal durum kabul edilmez.", "The comparison window must be at least 10 seconds long and cannot start before 0. It is not automatically treated as a resting or baseline state."))
    if not 0.5 <= config["zThreshold"] <= 50 or not 0.1 <= config["minDistance"] <= 3600 or not 0 < config["motionThreshold"] <= 1000:
        raise DataError(msg("Eşik/aralık ayarları geçersiz: z 0,5–50; aday arası 0,1–3600 sn; hareket 0–1000 g/s olmalı.", "Invalid threshold or spacing settings: z must be 0.5–50, candidate spacing 0.1–3600 s and motion 0–1000 g/s."))
    channels = dataset.get("channels", [])
    if sum(len(channel.get("points", [])) for channel in channels) > MAX_POINTS:
        raise DataError(msg("Analizde toplam 1.500.000 sensör örneği sınırı aşıldı; oturumu bölün.", "The analysis limit of 1,500,000 sensor samples in total was exceeded; split the session."))
    eda_channels = [channel for channel in channels if channel.get("tag") == "EA"]
    if len(eda_channels) != 1:
        raise DataError(msg("Analiz için tek EA (ham EDA) kanalı gerekli. Birden fazla EA varsa ilgili oturumun tek kaydını yükleyin.", "Analysis needs exactly one EA (raw EDA) channel. If there are several, upload the single recording for this session."))
    eda_unit = str(eda_channels[0].get("unit", "µS")).lower().replace(" ", "")
    if eda_unit not in {"µs", "μs", "us", "microsiemens", "micro-siemens"}:
        raise DataError(msg(f"EDA analizi kalibre edilmiş µS (microsiemens) birimi gerektirir; kaynak birimi '{eda_channels[0].get('unit')}'. Bilgi dosyası ve EmotiBit kalibrasyonunu doğrulayın; birim otomatik dönüştürülmedi.", f"EDA analysis requires calibrated µS (microsiemens); the source unit is '{eda_channels[0].get('unit')}'. Check the info file and the EmotiBit calibration; the unit was not converted automatically."))
    times, raw = _arrays(eda_channels[0])
    if len(times) < MIN_BASELINE_SAMPLES:
        raise DataError(msg("EDA analizi için en az 50 geçerli örnek gerekli.", "EDA analysis needs at least 50 valid samples."))
    fs = 1 / float(np.median(np.diff(times)))
    if not 7 <= fs <= 2000:
        raise DataError(msg(f"EDA örnekleme hızı {fs:.3g} Hz; 3 Hz temizleme filtresi için en az 7 Hz ve en fazla 2000 Hz desteklenir. Zaman birimini kontrol edin.", f"The EDA sampling rate is {fs:.3g} Hz; the 3 Hz cleaning filter supports 7 Hz to 2000 Hz. Check the time unit."))
    if config["baselineEnd"] > times[-1] + 1e-6 or config["baselineStart"] < times[0] - 1e-6:
        raise DataError(msg("Karşılaştırma aralığı EDA kaydının kapsadığı zamanın dışında. Sensör grafiğine göre aralığı düzeltin.", "The comparison window lies outside the time covered by the EDA recording. Adjust it using the sensor chart."))
    clean = np.full(len(times), np.nan)
    tonic = np.full(len(times), np.nan)
    phasic = np.full(len(times), np.nan)
    allowed_candidate = np.zeros(len(times), dtype=bool)
    notices = [
        msg("EDA sempatik uyarılmayla ilişkilidir; duygu türü, olumlu/olumsuz duygu veya olayın nedenini tek başına göstermez. Adaylar katılımcı anlatımıyla yorumlanır.", "EDA is associated with sympathetic arousal; on its own it does not show the type of emotion, whether it is positive or negative, or what caused an event. Interpret candidates together with the participant's account."),
        msg("Adaylar phasic düzeyde robust-z eşiğini aşan yerel tepelerdir; doğrulanmış SCR sayısı veya onset-to-peak SCR genliği değildir.", "Candidates are local peaks in the phasic component that exceed the robust-z threshold; they are not a validated SCR count or onset-to-peak SCR amplitude."),
        msg("Karşılaştırma aralığı araştırmacının seçtiği kayıt bölümüdür; dinlenme bazali varsayılmadı. Eşikler doğrulanmış klinik sınırlar değildir.", "The comparison window is a section of the recording chosen by the researcher; it is not assumed to be a resting baseline. The thresholds are not validated clinical cut-offs."),
    ]
    groups = _segments(times, raw)
    skipped = 0
    processed_segments = 0
    for indices in groups:
        segment_t, segment_v = times[indices], raw[indices]
        if len(indices) < 50 or segment_t[-1] - segment_t[0] < MIN_SEGMENT_SECONDS:
            skipped += len(indices)
            continue
        segment_fs = 1 / float(np.median(np.diff(segment_t)))
        if not 7 <= segment_fs <= 2000:
            skipped += len(indices)
            continue
        # The final grid sample is bounded by the observed segment; no extrapolation.
        count = int(math.floor((segment_t[-1] - segment_t[0]) * segment_fs)) + 1
        if count > MAX_POINTS:
            raise DataError(msg("Yeniden örnekleme sınırı aşıldı; zaman sütununu ve kayıt boşluklarını kontrol edin.", "Resampling limit exceeded; check the time column and recording gaps."))
        uniform_t = segment_t[0] + np.arange(count) / segment_fs
        uniform_v = np.interp(uniform_t, segment_t, segment_v)
        try:
            with python_warnings.catch_warnings(record=True) as captured:
                python_warnings.simplefilter("always")
                cleaned = nk.eda_clean(uniform_v, sampling_rate=segment_fs, method="neurokit")
                decomposed = nk.eda_phasic(cleaned, sampling_rate=segment_fs, method="highpass", cutoff=0.05)
            for warning in captured:
                message = msg(f"NeuroKit2 uyarısı: {warning.message}", f"NeuroKit2 warning: {warning.message}")
                if message not in notices:
                    notices.append(message)
        except (ValueError, IndexError, TypeError, ZeroDivisionError) as exc:
            raise DataError(msg(f"EDA kesiti filtrelenemedi ({exc}). Kesit uzunluğu, örnekleme hızı ve sensör verisini kontrol edin.", f"An EDA segment could not be filtered ({exc}). Check the segment length, sampling rate and sensor data.")) from exc
        within = segment_t <= uniform_t[-1] + 1e-9
        target_indices = indices[within]
        target_t = segment_t[within]
        clean[target_indices] = np.interp(target_t, uniform_t, np.asarray(cleaned))
        tonic[target_indices] = np.interp(target_t, uniform_t, decomposed["EDA_Tonic"].to_numpy())
        phasic[target_indices] = np.interp(target_t, uniform_t, decomposed["EDA_Phasic"].to_numpy())
        allowed_candidate[target_indices] = (target_t >= uniform_t[0] + EDGE_SECONDS) & (target_t <= uniform_t[-1] - EDGE_SECONDS)
        processed_segments += 1
    if skipped:
        notices.append(msg(f"{skipped} örnek 10 saniyeden/50 örnekten kısa veya örnekleme hızı uygun olmayan kesitlerde; ham değerler korundu, türetilmiş değerler boş bırakıldı.", f"{skipped} samples lie in segments shorter than 10 seconds or 50 samples, or with an unsuitable sampling rate; raw values were kept and derived values left empty."))
    if np.any(raw < 0):
        notices.append(msg(f"{int(np.sum(raw < 0))} negatif EDA ölçümü ham olarak korundu ve filtreleme dışında bırakıldı; kalibrasyonu kontrol edin.", f"{int(np.sum(raw < 0))} negative EDA measurements were kept as raw values and excluded from filtering; check the calibration."))
    if len(groups) > 1:
        notices.append(msg(f"EDA {len(groups)} bağımsız kesitte işlendi; kayıt boşlukları ve negatif ölçümler üzerinden filtre uygulanmadı.", f"EDA was processed in {len(groups)} independent segments; no filter was applied across recording gaps or negative measurements."))
    notices.append(msg("0,05 Hz ayrıştırmada kısa kesitler ve filtre uçları kararsız olabilir; 3 saniyelik dışlama tüm uç etkilerini giderme garantisi değildir. Kısa kesit adayları ham kayıtla doğrulanmalıdır.", "In the 0.05 Hz decomposition, short segments and filter edges can be unstable; the 3-second exclusion does not guarantee that all edge effects are removed. Verify candidates from short segments against the raw recording."))
    notices.append(msg("Filtreleme için her kesit kendi medyan örnek aralığıyla düzenli ızgaraya doğrusal yeniden örneklendi. Ham ölçümler değiştirilmedi; kesit uçlarında 3 saniye aday aramasına kapalı.", "For filtering, each segment was linearly resampled onto a regular grid at its own median sample interval. Raw measurements were not changed; the first and last 3 seconds of each segment are excluded from the candidate search."))
    baseline_mask = (times >= config["baselineStart"]) & (times <= config["baselineEnd"]) & np.isfinite(phasic) & allowed_candidate
    baseline_times = times[baseline_mask]
    baseline_values = phasic[baseline_mask]
    if len(baseline_values) < MIN_BASELINE_SAMPLES or baseline_times[-1] - baseline_times[0] < MIN_BASELINE_SECONDS:
        raise DataError(msg("Karşılaştırma aralığında filtre uçları ve kayıt boşlukları dışında en az 10 saniye ve 50 geçerli phasic örnek gerekli. Aralığı uzatın veya başka bir kesit seçin.", "Excluding filter edges and recording gaps, the comparison window needs at least 10 seconds and 50 valid phasic samples. Extend the window or choose another segment."))
    # At least 80% coverage prevents sparse, interrupted windows masquerading as a baseline.
    expected_baseline_samples = max(1.0, (config["baselineEnd"] - config["baselineStart"]) * fs)
    if len(baseline_values) / expected_baseline_samples < 0.8:
        raise DataError(msg("Karşılaştırma aralığında geçerli phasic veri kapsamı %80'in altında. Boşluk içermeyen daha uygun bir aralık seçin.", "Valid phasic data cover less than 80% of the comparison window. Choose a better window without gaps."))
    median = float(np.median(baseline_values))
    mad = float(np.median(np.abs(baseline_values - median)))
    if mad <= MAD_FLOOR:
        raise DataError(msg("Karşılaştırma aralığı sabit veya değişkenliği çok düşük (MAD ≤ 10⁻⁹ µS). Güvenilir robust-z skoru üretilemez; sensör temasını/sütununu kontrol edin veya başka aralık seçin.", "The comparison window is constant or has very low variability (MAD ≤ 10⁻⁹ µS), so no reliable robust-z score can be produced. Check sensor contact and the selected column, or choose another window."))
    scores = ROBUST_SCALE * (phasic - median) / mad
    motion, movement_notices = _motion(channels, times)
    notices.extend(movement_notices)
    flagged = np.isfinite(motion) & (motion > config["motionThreshold"])
    provisional: list[int] = []
    for indices in groups:
        valid = indices[np.isfinite(phasic[indices]) & allowed_candidate[indices]]
        if len(valid) < 3:
            continue
        peaks, _ = find_peaks(scores[valid], height=config["zThreshold"])
        provisional.extend(int(valid[peak]) for peak in peaks if phasic[valid[peak]] > 0)
    # Resolve distance on seconds, not sample indices, even when sampling is uneven.
    selected: list[int] = []
    for index in sorted(provisional, key=lambda i: float(scores[i]), reverse=True):
        if all(abs(times[index] - times[other]) >= config["minDistance"] for other in selected):
            selected.append(index)
    selected.sort(key=lambda i: times[i])
    events = []
    for number, index in enumerate(selected, 1):
        reason = msg(f"Pozitif phasic yerel tepe; robust z={scores[index]:.2f} ≥ {config['zThreshold']:g}. Yükseklik SCR onset-to-peak genliği değildir.", f"Positive local peak in the phasic component; robust z={scores[index]:.2f} ≥ {config['zThreshold']:g}. The height is not an onset-to-peak SCR amplitude.")
        if flagged[index]:
            reason += msg(" Aynı anda hareket eşiği aşıldı; görüntü ve ham veriyle inceleyin.", " The motion threshold was exceeded at the same time; check it against the video and raw data.")
        events.append(dict(id=f"candidate-{number}-{times[index]:.3f}", t=float(times[index]), amplitude=float(phasic[index]), score=float(scores[index]), reason=reason, flagged=bool(flagged[index])))
    def optional(value: float) -> float | None:
        return float(value) if np.isfinite(value) else None
    points = [dict(t=float(times[i]), raw=float(raw[i]), clean=optional(clean[i]), tonic=optional(tonic[i]), phasic=optional(phasic[i]), motion=optional(motion[i]), flagged=bool(flagged[i])) for i in range(len(times))]
    parameters = dict(config)
    parameters.update(
        cleaning="neurokit", cleaningLowpassHz=3, cleaningFilter="Butterworth", cleaningOrder=4,
        decomposition="highpass", decompositionCutoffHz=0.05, decompositionOrder=2,
        candidateVariable="EDA_Phasic positive local peak height (µS), not SCR amplitude",
        robustZFormula="0.6744897501960817 * (phasic - comparisonMedian) / comparisonMAD",
        motionFormula="abs(diff(sqrt(AX^2 + AY^2 + AZ^2)) / diff(time))", motionUnit="g/s",
        resampling="linear within each segment, no gap bridging or extrapolation",
        gapThresholdSeconds=gap_limit(times), minSegmentSeconds=MIN_SEGMENT_SECONDS,
        edgeExclusionSeconds=EDGE_SECONDS, baselineMinSeconds=MIN_BASELINE_SECONDS,
        baselineMinSamples=MIN_BASELINE_SAMPLES, baselineMinCoverage=0.8, baselineMadFloor=MAD_FLOOR,
        processedSegments=processed_segments, comparisonValidSamples=len(baseline_values),
        motionValidSamples=int(np.sum(np.isfinite(motion))), motionCoveragePercent=float(np.mean(np.isfinite(motion)) * 100),
        flaggedPercentDenominator="all EDA samples; missing motion is unknown, not artifact-free",
        libraries={"neurokit2": version("neurokit2"), "numpy": version("numpy"), "scipy": version("scipy")},
        sourceHashes=[{"name": item.get("name"), "sha256": item.get("sha256")} for item in dataset.get("sources", [])],
    )
    return dict(method=msg("NeuroKit2 eda_clean(neurokit) + eda_phasic(highpass); keşif amaçlı robust-z adayları", "NeuroKit2 eda_clean(neurokit) + eda_phasic(highpass); exploratory robust-z candidates"), version=version("neurokit2"), parameters=parameters, points=points, events=events, warnings=notices, metrics=dict(sampleRate=fs, edaSamples=len(times), flaggedPercent=float(np.mean(flagged) * 100), baselineMedian=median, baselineMad=mad))

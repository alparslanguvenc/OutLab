"""Behavioral checks for import fidelity, clock alignment, gap safety and API isolation."""
from __future__ import annotations

import hashlib
import json
import math

import numpy as np
import pytest
from fastapi.testclient import TestClient

from backend.analysis import analyze_dataset, safe_interpolate
from backend.ingestion import DataError, import_sources, inspect_sources, parse_time
from backend.main import app


@pytest.fixture
def client():
    return TestClient(app, base_url="http://127.0.0.1:8765")


def source(name, text):
    return {"name": name, "text": text}


def csv_source(tag="EA", values=None, start=0, fs=15, column="Time", unit_scale=1):
    values = values if values is not None else [1.0, 1.1, 1.2]
    text = f"{column},{tag}\n" + "\n".join(f"{(start + index / fs) * unit_scale:.9f},{value:.12g}" for index, value in enumerate(values))
    return source(f"ride_{tag}.csv", text)


def config(**kwargs):
    defaults = dict(baselineStart=10, baselineEnd=35, zThreshold=3, minDistance=10, motionThreshold=3)
    defaults.update(kwargs)
    return defaults


def synthetic_dataset(gap=False, motion=True):
    times = np.arange(0, 100, 1 / 15)
    values = 2 + 0.012 * np.sin(2 * np.pi * 0.2 * times) + 0.004 * np.sin(2 * np.pi * 0.43 * times)
    values += 0.5 * np.exp(-((times - 60) / 1.6) ** 2)
    keep = (times < 45) | (times > 50) if gap else np.ones(len(times), dtype=bool)
    text = "Time,EA\n" + "\n".join(f"{t:.9f},{v:.12g}" for t, v in zip(times[keep], values[keep]))
    inputs = [source("EA.csv", text)]
    if motion:
        imu_times = np.arange(0, 100, 1 / 25)
        ax = 0.02 * np.sin(imu_times)
        az = np.ones(len(imu_times)) + 0.6 * np.exp(-((imu_times - 60) / 0.08) ** 2)
        inputs.extend([csv_source("AX", ax, fs=25), csv_source("AY", np.zeros(len(imu_times)), fs=25), csv_source("AZ", az, fs=25)])
    return import_sources(inputs)


def test_auto_inspect_ignores_hardware_counters():
    text = "LocalTimestamp,EmotiBitTimestamp,PacketNumber,DataLength,TypeTag,Data\n1757335200.0,120000,4,1,EA,1.2\n1757335200.0667,120067,5,1,EA,1.3\n"
    result = inspect_sources([source("EA.csv", text)])["files"][0]
    assert result["timeColumn"] == "LocalTimestamp"
    assert result["valueColumn"] == "Data"
    assert result["tag"] == "EA"
    assert len(result["preview"]) == 2


def test_semicolon_decimal_comma_and_audit_rows():
    text = "Time;EA\n0,0;1,25\n0,1;1,30\n0,2;eksik\n0,3;1,40;fazla\n0,4;1,55\n"
    dataset = import_sources([source("EA.csv", text)])
    channel = dataset["channels"][0]
    assert [point["v"] for point in channel["points"]] == [1.25, 1.3, 1.55]
    assert channel["quality"]["totalRows"] == 5
    assert channel["quality"]["invalidRows"] == 2
    assert channel["quality"]["validRows"] == 3
    assert channel["quality"]["warnings"]
    assert dataset["sources"][0]["sha256"] == hashlib.sha256(text.encode()).hexdigest()


@pytest.mark.parametrize("value,unit,column,expected,domain", [
    ("1757335200", "auto", "LocalTimestamp", 1757335200, "absolute"),
    ("1757335200000", "auto", "LocalTimestamp", 1757335200, "absolute"),
    ("1757335200000000", "auto", "LocalTimestamp", 1757335200, "absolute"),
    ("317823", "auto", "EmotiBitTimestamp", 317.823, "relative"),
    ("12.5", "s", "Time", 12.5, "relative"),
    ("12500", "ms", "Time", 12.5, "relative"),
    ("2025-09-08T17:00:00+03:00", "iso", "Time", 1757340000, "absolute"),
])
def test_timestamp_units(value, unit, column, expected, domain):
    result, actual_domain = parse_time(value, unit, column)
    assert result == pytest.approx(expected)
    assert actual_domain == domain


def test_relative_boot_time_never_promoted_to_epoch():
    stamp, domain = parse_time("2147483647", "auto", "EmotiBitTimestamp")
    assert domain == "relative"
    assert stamp == pytest.approx(2147483.647)


def test_common_sensor_origin_preserves_late_cross_frequency_channels():
    dataset = import_sources([csv_source("EA", start=100, fs=15), csv_source("AX", start=103, fs=25)])
    assert dataset["sensorOriginEpoch"] is None
    assert dataset["channels"][0]["points"][0]["t"] == 0
    assert dataset["channels"][1]["points"][0]["t"] == 3
    assert dataset["channels"][0]["sampleRate"] == pytest.approx(15, rel=1e-6)
    assert dataset["channels"][1]["sampleRate"] == pytest.approx(25, rel=1e-6)


def test_epoch_origin_preserves_difference_not_independent_zero():
    dataset = import_sources([csv_source("EA", start=1757335200, column="LocalTimestamp"), csv_source("AX", start=1757335202, column="LocalTimestamp")])
    assert dataset["sensorOriginEpoch"] == 1757335200
    assert dataset["channels"][1]["points"][0]["t"] == 2


def test_mixed_clock_domains_are_rejected():
    with pytest.raises(DataError, match="mutlak"):
        import_sources([csv_source("EA", start=1757335200, column="LocalTimestamp"), csv_source("AX", start=12)])


def test_invalid_timestamp_rejected_with_row_number():
    with pytest.raises(DataError, match="satır 3"):
        import_sources([source("EA.csv", "Time,EA\n0,1\nbozuk,2\n1,3")])
    with pytest.raises(ValueError, match="Saat dilimi"):
        parse_time("2025-09-08T17:00:00", "iso", "Time")


def test_duplicate_and_gap_quality_visible():
    channel = import_sources([source("EA.csv", "Time,EA\n0,1\n0.1,2\n0.1,99\n0.2,3\n2,4")])["channels"][0]
    assert channel["quality"]["duplicates"] == 1
    assert channel["quality"]["gaps"] == 1
    assert channel["points"][1]["v"] == 2
    assert any("ilk ölçüm" in warning for warning in channel["quality"]["warnings"])


def test_headerless_packets_refused_with_parser_guidance():
    packet = source("record.csv", "317823,50266,1,RB,1,100,example\n317824,50267,1,EA,1,100,1.25")
    assert inspect_sources([packet])["files"][0]["kind"] == "raw"
    with pytest.raises(DataError, match="DataParser"):
        import_sources([packet])


def test_duplicate_filenames_refused():
    with pytest.raises(DataError, match="Aynı ada"):
        import_sources([csv_source(), csv_source()])


def test_wide_csv_imports_all_tags_and_explicit_mapping_narrows():
    item = source("wide.csv", "Time,EA,AX,HR,PacketNumber\n0,1,0.1,80,100\n1,2,0.2,82,101")
    assert [channel["tag"] for channel in import_sources([item])["channels"]] == ["EA", "AX", "HR"]
    mapping = dict(name="wide.csv", tag="AX", timeColumn="Time", valueColumn="AX", timeUnit="s")
    assert [channel["tag"] for channel in import_sources([item], [mapping])["channels"]] == ["AX"]
    mapping["valueColumn"] = "*"
    assert len(import_sources([item], [mapping])["channels"]) == 3
    assert inspect_sources([item])["files"][0]["valueColumn"] == "*"
    mapping["valueColumn"] = "PacketNumber"
    with pytest.raises(DataError, match="sayacı"):
        import_sources([item], [mapping])


def gpx_xml(times=True):
    stamps = ["2025-09-08T14:00:00Z", "2025-09-08T14:00:01Z", "2025-09-08T14:00:50Z"]
    points = [f'<trkpt lat="40.{i}" lon="26.{i}"><ele>{i}</ele>' + (f'<time>{stamp}</time>' if times else '') + '</trkpt>' for i, stamp in enumerate(stamps)]
    return '<gpx xmlns="http://www.topografix.com/GPX/1/1"><trk><trkseg>' + ''.join(points[:2]) + '</trkseg><trkseg>' + points[2] + '</trkseg></trk></gpx>'


def test_gpx_namespace_segments_epoch_and_elevation():
    dataset = import_sources([source("ride.gpx", gpx_xml())])
    assert [point["t"] for point in dataset["track"]] == [0, 1, 50]
    assert [point["segment"] for point in dataset["track"]] == [0, 0, 1]
    assert dataset["track"][-1]["ele"] == 2
    assert dataset["gpxOriginEpoch"] == 1757340000
    assert dataset["sensorOriginEpoch"] is None


def test_gpx_without_times_and_xml_entities_rejected():
    with pytest.raises(DataError, match="zaman etiketi yok"):
        import_sources([source("ride.gpx", gpx_xml(times=False))])
    malicious = '<!DOCTYPE gpx [<!ENTITY secret SYSTEM "file:///etc/passwd">]><gpx>&secret;</gpx>'
    with pytest.raises(DataError, match="güvenli olmayan"):
        import_sources([source("attack.gpx", malicious)])


def test_interpolation_never_extrapolates_or_bridges_gaps():
    times = np.array([0, 0.1, 0.2, 5, 5.1])
    result = safe_interpolate(times, np.array([1, 2, 3, 4, 5]), np.array([-1, 0, 0.15, 2, 5, 6]))
    assert np.isnan(result[0]) and np.isnan(result[3]) and np.isnan(result[-1])
    assert result[1] == 1 and result[2] == pytest.approx(2.5) and result[4] == 4


def test_analysis_preserves_raw_and_applies_exact_config():
    dataset = synthetic_dataset()
    requested = config()
    result = analyze_dataset(dataset, requested)
    assert all(result["parameters"][key] == value for key, value in requested.items())
    assert result["version"]
    assert result["parameters"]["libraries"]["neurokit2"] == result["version"]
    assert result["metrics"]["sampleRate"] == pytest.approx(15, rel=1e-6)
    assert result["metrics"]["baselineMad"] > 0
    assert result["metrics"]["flaggedPercent"] > 0
    assert [point["raw"] for point in result["points"]] == [point["v"] for point in dataset["channels"][0]["points"]]
    assert any(abs(event["t"] - 60) < 2 for event in result["events"])
    assert all(result["events"][i + 1]["t"] - result["events"][i]["t"] >= 10 for i in range(len(result["events"]) - 1))
    json.dumps(result, allow_nan=False)


def test_no_imu_does_not_fabricate_motion_measurements():
    result = analyze_dataset(synthetic_dataset(motion=False), config())
    assert all(point["motion"] is None for point in result["points"])
    assert any("artefaktsız" in warning for warning in result["warnings"])


def test_flat_comparison_refuses_invented_scores():
    dataset = import_sources([csv_source("EA", np.full(1500, 2.0))])
    assert dataset["channels"][0]["quality"]["flat"]
    with pytest.raises(DataError, match="MAD"):
        analyze_dataset(dataset, config())


def test_insufficient_baseline_fails_clearly():
    with pytest.raises(DataError, match="en az 10 saniye"):
        analyze_dataset(synthetic_dataset(), config(baselineEnd=15))


def test_gap_segments_filtered_independently():
    dataset = synthetic_dataset(gap=True, motion=False)
    result = analyze_dataset(dataset, config())
    assert result["parameters"]["processedSegments"] == 2
    assert any("boşlukları" in warning for warning in result["warnings"])
    assert all(not 45 <= point["t"] <= 50 for point in result["points"])
    assert all(not 42 < event["t"] < 53 for event in result["events"])
    # Altering a later segment cannot change an earlier segment's cleaned values.
    altered = json.loads(json.dumps(dataset))
    for point in altered["channels"][0]["points"]:
        if point["t"] > 50:
            point["v"] += 100
    second = analyze_dataset(altered, config())
    first_clean = [point["clean"] for point in result["points"] if point["t"] < 45]
    second_clean = [point["clean"] for point in second["points"] if point["t"] < 45]
    assert first_clean == second_clean


def test_api_health_validation_and_local_boundaries(client):
    assert client.get("/api/health").json()["status"] == "ok"
    assert client.get("/api/health").headers["cache-control"] == "no-store"
    assert client.get("/api/health", headers={"Host": "evil.example"}).status_code == 400
    assert client.get("/api/health", headers={"Origin": "https://evil.example"}).status_code == 403
    assert client.get("/api/health", headers={"Origin": "null"}).status_code == 403
    assert client.post("/api/inspect", json={}).status_code == 422
    assert client.post("/api/import", json={"sources": [csv_source()]}).status_code == 200
    oversized = client.post("/api/inspect", content="{}", headers={"Content-Length": str(129 * 1024 * 1024)})
    assert oversized.status_code == 413
    assert client.get("/api/not-real").status_code == 404
    assert client.get("/%2e%2e/requirements.txt").status_code == 404


def test_api_rejects_invalid_project_shape_with_turkish_detail(client):
    response = client.post("/api/analyze", json={"dataset": {"channels": "invalid"}, "config": config()})
    assert response.status_code == 400
    assert "geçersiz" in response.json()["detail"]


def test_request_stream_limit_without_declared_length(client, monkeypatch):
    import backend.main as main
    monkeypatch.setattr(main, "MAX_BODY_BYTES", 16)
    response = client.post("/api/inspect", content=iter([b'{"sources":', b'[]}' + b' ' * 20]), headers={"Content-Type": "application/json"})
    assert response.status_code == 413


def test_eda_scalar_points_required(client):
    malformed = {"channels": [{"tag": "EA", "points": [{"t": [i], "v": [1.0]} for i in range(100)]}]}
    response = client.post("/api/analyze", json={"dataset": malformed, "config": config()})
    assert response.status_code == 400
    assert "tek bir sayı" in response.json()["detail"]


@pytest.mark.parametrize("counter", ["PacketNumber", "DataLength", "TypeTag", "ProtocolVersion", "DataReliability"])
def test_hardware_metadata_cannot_be_mapped_as_measurement(counter):
    item = source("EA.csv", f"Time,{counter},EA\n0,1,2\n1,2,3")
    mapping = dict(name="EA.csv", tag="EA", timeColumn="Time", valueColumn=counter, timeUnit="s")
    with pytest.raises(DataError, match="sayacı"):
        import_sources([item], [mapping])


def test_official_info_json_list_supported_and_declared_units_preserved():
    info = source("session_info.json", json.dumps([
        {"info": {"name": "EDA", "typeTags": ["EA"], "units": "microsiemens"}},
        {"info": {"name": "Magnetometer", "typeTags": ["MX"], "units": "microhenries"}},
    ]))
    assert inspect_sources([info])["files"][0]["kind"] == "info"
    dataset = import_sources([csv_source("EA"), csv_source("MX"), info])
    assert dataset["channels"][0]["unit"] == "microsiemens"
    assert dataset["channels"][1]["unit"] == "microhenries"
    assert any("otomatik düzeltilmedi" in warning for warning in dataset["channels"][1]["quality"]["warnings"])


def test_eda_unverified_units_do_not_generate_microsiemens_claims():
    dataset = synthetic_dataset(motion=False)
    dataset["channels"][0]["unit"] = "raw ADC counts"
    with pytest.raises(DataError, match="kalibre edilmiş"):
        analyze_dataset(dataset, config())


def test_motion_unit_conversion_preserves_raw_and_unknown_units_disable_flags():
    original = synthetic_dataset()
    normal = analyze_dataset(original, config())
    converted = json.loads(json.dumps(original))
    for channel in converted["channels"]:
        if channel["tag"] in {"AX", "AY", "AZ"}:
            channel["unit"] = "m/s²"
            for point in channel["points"]:
                point["v"] *= 9.80665
    response = analyze_dataset(converted, config())
    normal_motion = [point["motion"] for point in normal["points"] if point["motion"] is not None]
    converted_motion = [point["motion"] for point in response["points"] if point["motion"] is not None]
    assert np.allclose(normal_motion, converted_motion)
    converted["channels"][1]["unit"] = "unknown"
    unknown = analyze_dataset(converted, config())
    assert all(point["motion"] is None for point in unknown["points"])
    assert any("tanınmıyor" in warning for warning in unknown["warnings"])


@pytest.mark.parametrize("name,payload,kind", [
    ("EA.csv", "Time,EA\r\n0,1.25\r\n0.1,1.3\r\n", "csv"),
    ("session_info.json", '[{"info":{"name":"Ölçüm","typeTags":["EA"],"units":"microsiemens"}}]', "info"),
    ("ride.gpx", gpx_xml(), "gpx"),
])
def test_utf8_bom_sources_parse_and_hash_original_bytes(client, name, payload, kind):
    original_bytes = b"\xef\xbb\xbf" + payload.encode("utf-8")
    preserved_text = original_bytes.decode("utf-8")
    item = source(name, preserved_text)
    inspected = client.post("/api/inspect", json={"sources": [item]})
    assert inspected.status_code == 200
    assert inspected.json()["files"][0]["kind"] == kind
    imported = client.post("/api/import", json={"sources": [item]})
    assert imported.status_code == 200
    actual_hash = imported.json()["sources"][0]["sha256"]
    assert actual_hash == hashlib.sha256(original_bytes).hexdigest()
    assert actual_hash != hashlib.sha256(payload.encode("utf-8")).hexdigest()
    assert item["text"].encode("utf-8") == original_bytes


def test_bom_info_metadata_is_used_without_removing_bom_from_source_hash():
    info_bytes = b'\xef\xbb\xbf[{"info":{"typeTags":["MX"],"units":"microhenries"}}]'
    info = source("session_info.json", info_bytes.decode("utf-8"))
    dataset = import_sources([csv_source("MX"), info])
    assert dataset["channels"][0]["unit"] == "microhenries"
    assert dataset["sources"][1]["sha256"] == hashlib.sha256(info_bytes).hexdigest()


def test_utf8_bom_does_not_hide_raw_packets():
    packet_bytes = b"\xef\xbb\xbf317823,50266,1,RB,1,100,example\r\n317824,50267,1,EA,1,100,1.25"
    packet = source("record.csv", packet_bytes.decode("utf-8"))
    assert inspect_sources([packet])["files"][0]["kind"] == "raw"
    with pytest.raises(DataError, match="DataParser"):
        import_sources([packet])

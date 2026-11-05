"""Strict, auditable import; all times use one shared sensor origin."""
from __future__ import annotations

import csv
import hashlib
import io
import json
import math
import re
from datetime import datetime
from typing import Any

import numpy as np
from defusedxml import ElementTree
from defusedxml.common import DefusedXmlException

from .catalog import normalize, sensor_info, sensor_tag
from .i18n import msg

def raw_guidance() -> str:
    """Parser guidance for headerless packet files, resolved per request language."""
    return msg(
        "Bu dosya başlıksız EmotiBit paket kaydıdır. Paket zamanı her örneğin ölçüm zamanı değildir; "
        "doğrulanmış örnek zamanları olmadan analiz veya senkronizasyon yapılmadı. "
        "EmotiBit Oscilloscope içindeki resmi DataParser ile kaydı ayrıştırın ve üretilen "
        "LocalTimestamp içeren sensör CSV dosyalarını yükleyin. "
        "Bilgi JSON dosyası tek başına bu zamanları oluşturmaz. "
        "Kılavuz: https://github.com/EmotiBit/EmotiBit_Docs/blob/master/EmotiBitDataParser_reference_manual.md",
        "This file is a headerless EmotiBit packet recording. Packet time is not the measurement time of each sample, "
        "so no analysis or synchronization was run without verified sample times. "
        "Parse the recording with the official DataParser in EmotiBit Oscilloscope and upload the sensor CSV files "
        "it produces, which contain LocalTimestamp. "
        "The info JSON file does not create these times on its own. "
        "Guide: https://github.com/EmotiBit/EmotiBit_Docs/blob/master/EmotiBitDataParser_reference_manual.md",
    )


MAX_SOURCES = 100
MAX_TOTAL_ROWS = 1_500_000
METADATA = {
    "PACKETNUMBER", "DATALENGTH", "TYPE", "TYPETAG", "VERSION", "RELIABILITY", "COUNT",
    "INDEX", "PACKET", "PROTOCOLVERSION", "DATARELIABILITY", "TIMESTAMP", "LOCALTIMESTAMP", "EMOTIBITTIMESTAMP", "TIME", "SAMPLE",
}


class DataError(ValueError):
    """Actionable user-facing data validation error."""


def source_checks(sources: list[dict[str, str]]) -> None:
    if not sources:
        raise DataError(msg("En az bir CSV, GPX veya bilgi JSON dosyası seçin.", "Select at least one CSV, GPX or info JSON file."))
    if len(sources) > MAX_SOURCES:
        raise DataError(msg(f"Tek projede en fazla {MAX_SOURCES} kaynak yüklenebilir; oturumları ayırın.", f"A project can hold at most {MAX_SOURCES} sources; split the sessions."))
    names = [s["name"] for s in sources]
    if len(names) != len(set(names)):
        raise DataError(msg("Aynı ada sahip dosyalar var. Kaynak kimlikleri için dosya adlarını farklılaştırın.", "Some files share the same name. Rename them so each source has a unique identifier."))
    for source in sources:
        if not source["name"].strip() or len(source["name"]) > 300:
            raise DataError(msg("Dosya adı boş olamaz ve 300 karakteri aşamaz.", "File names cannot be empty or longer than 300 characters."))
        if "\x00" in source["text"]:
            raise DataError(msg(f'{source["name"]}: ikili dosya metin olarak açılamaz; CSV/GPX seçin.', f'{source["name"]}: binary files cannot be opened as text; select a CSV or GPX file.'))


def _tag_from_name(name: str) -> str | None:
    for token in reversed(re.split(r"[^A-Za-z0-9]+", name.rsplit(".", 1)[0])):
        tag = sensor_tag(token)
        if tag:
            return tag
    return None


def _is_raw(text: str) -> bool:
    text = text.lstrip("\ufeff")
    first = next((line for line in text.splitlines() if line.strip()), "")
    parts = first.strip().split(",")
    return len(parts) >= 6 and all(p.strip().isdigit() for p in parts[:3]) and bool(re.fullmatch(r"[A-Z]{2}", parts[3].strip()))


def read_csv(text: str, name: str) -> tuple[list[str], list[tuple[int, list[str]]], int, list[str]]:
    text = text.lstrip("\ufeff")
    if not text.strip():
        raise DataError(msg(f"{name}: dosya boş.", f"{name}: the file is empty."))
    if _is_raw(text):
        raise DataError(f"{name}: {raw_guidance()}")
    first = next((line for line in text.splitlines() if line.strip()), "")
    delimiter = max((",", ";", "\t"), key=first.count)
    if first.count(delimiter) == 0:
        raise DataError(msg(f"{name}: en az zaman ve ölçüm sütunu içeren CSV gerekli.", f"{name}: a CSV with at least a time column and a measurement column is required."))
    try:
        parsed = list(csv.reader(io.StringIO(text), delimiter=delimiter, strict=True))
    except csv.Error as exc:
        raise DataError(msg(f"{name}: CSV tırnak/ayırıcı yapısı okunamadı ({exc}). Dosyayı düzeltin.", f"{name}: could not read the CSV quoting or delimiter structure ({exc}). Fix the file.")) from exc
    parsed = [(number + 1, row) for number, row in enumerate(parsed) if row and any(x.strip() for x in row)]
    if not parsed:
        raise DataError(msg(f"{name}: dosyada veri yok.", f"{name}: the file contains no data."))
    columns = [c.strip() for c in parsed[0][1]]
    if len(set(columns)) != len(columns) or any(not c for c in columns):
        raise DataError(msg(f"{name}: sütun başlıkları boş veya yinelenmiş. Benzersiz başlıklar sağlayın.", f"{name}: column headers are empty or duplicated. Provide unique headers."))
    if len(columns) > 200:
        raise DataError(msg(f"{name}: en fazla 200 sütun desteklenir.", f"{name}: at most 200 columns are supported."))
    rows = parsed[1:]
    if len(rows) > MAX_TOTAL_ROWS:
        raise DataError(msg(f"{name}: çok fazla satır; kaydı oturumlara bölün.", f"{name}: too many rows; split the recording into sessions."))
    bad = [n for n, row in rows if len(row) != len(columns)]
    warnings = []
    if bad:
        warnings.append(msg(f"{len(bad)} bozuk satır (sütun sayısı farklı) analiz dışında: satır {_row_list(bad)}. Kaynak metin korunur.", f"{len(bad)} malformed rows (wrong column count) excluded from analysis: rows {_row_list(bad)}. The source text is preserved."))
    return columns, [(n, row) for n, row in rows if len(row) == len(columns)], len(rows), warnings


def _row_list(rows: list[int]) -> str:
    return ", ".join(map(str, rows[:12])) + (" …" if len(rows) > 12 else "")


def _guess_time(columns: list[str]) -> str:
    priorities = ("LOCALTIMESTAMP", "EPOCH", "EPOCHSECONDS", "TIMESTAMPUTC", "UTCTIMESTAMP", "TIMESTAMP", "TIME", "TIMESECONDS", "TIMES", "SECONDS", "EMOTIBITTIMESTAMP", "TIMEMS", "TIMESTAMPMS", "DATETIME", "DATE")
    lookup = {normalize(c): c for c in columns}
    for candidate in priorities:
        if candidate in lookup:
            return lookup[candidate]
    return next((c for c in columns if "TIME" in normalize(c)), "")


def _guess_unit(column: str, rows: list[tuple[int, list[str]]], columns: list[str]) -> str:
    key = normalize(column)
    if key == "EMOTIBITTIMESTAMP" or key.endswith("MS") or "MILLISECOND" in key:
        return "ms"
    if key.endswith("US") or "MICROSECOND" in key:
        return "us"
    if column and rows:
        value = rows[0][1][columns.index(column)].strip()
        if re.match(r"\d{4}-\d{2}-\d{2}[T ]", value):
            return "iso"
    return "auto"


def inspect_source(source: dict[str, str]) -> dict[str, Any]:
    name, text = source["name"], source["text"]
    result: dict[str, Any] = dict(name=name, kind="unsupported", columns=[], preview=[], tag="", timeColumn="", valueColumn="", timeUnit="auto", warnings=[])
    suffix = name.lower().rsplit(".", 1)[-1]
    if suffix == "gpx":
        result["kind"] = "gpx"
        track, _, warnings = parse_gpx(text, name)
        result["warnings"] = warnings + [msg(f"{len(track)} zamanlı rota noktası bulundu.", f"Found {len(track)} timestamped route points.")]
        return result
    if suffix == "json":
        result["kind"] = "info"
        try:
            payload = json.loads(text.lstrip("\ufeff"))
        except json.JSONDecodeError as exc:
            raise DataError(msg(f"{name}: bilgi JSON dosyası geçersiz ({exc.msg}).", f"{name}: invalid info JSON file ({exc.msg}).")) from exc
        if not isinstance(payload, (dict, list)) or (isinstance(payload, list) and not all(isinstance(item, dict) for item in payload)):
            raise DataError(msg(f"{name}: bilgi JSON kökü nesne veya nesne listesi olmalı.", f"{name}: the info JSON root must be an object or a list of objects."))
        result["columns"] = list(payload)[:30] if isinstance(payload, dict) else [str(item.get("info", {}).get("name", msg(f"Kayıt {index + 1}", f"Record {index + 1}"))) if isinstance(item.get("info"), dict) else msg(f"Kayıt {index + 1}", f"Record {index + 1}") for index, item in enumerate(payload[:30])]
        result["warnings"] = [msg("Bilgi dosyası kaynak olarak korunur; örnek zamanlarını veya saat eşleştirmesini kendiliğinden oluşturmaz.", "The info file is kept as a source; on its own it does not create sample times or clock alignment.")]
        return result
    if suffix != "csv":
        result["warnings"] = [msg("Bu alanda CSV, GPX ve EmotiBit bilgi JSON dosyaları desteklenir. Videoyu video alanından seçin.", "This field accepts CSV, GPX and EmotiBit info JSON files. Select video in the video field.")]
        return result
    if _is_raw(text):
        result["kind"] = "raw"
        result["warnings"] = [raw_guidance()]
        return result
    columns, rows, _, warnings = read_csv(text, name)
    time_column = _guess_time(columns)
    known = [(c, sensor_tag(c)) for c in columns if sensor_tag(c)]
    tag = known[0][1] if known else _tag_from_name(name)
    lookup = {normalize(c): c for c in columns}
    value_column = ("*" if len(known) > 1 else known[0][0]) if known else next((lookup[v] for v in ("VALUE", "DATA", "Y", "MEASUREMENT") if v in lookup), "")
    if not value_column:
        candidates = [c for c in columns if c != time_column and normalize(c) not in METADATA]
        numeric = []
        for c in candidates:
            try:
                if rows and all(math.isfinite(_number(r[columns.index(c)])) for _, r in rows[:3]):
                    numeric.append(c)
            except ValueError:
                pass
        if len(numeric) == 1:
            value_column = numeric[0]
    if not tag:
        tag_col = next((c for c in columns if normalize(c) in {"TYPETAG", "TYPE"}), None)
        if tag_col and rows:
            tags = {sensor_tag(row[columns.index(tag_col)]) for _, row in rows[:100]}
            if len(tags) == 1:
                tag = tags.pop()
    if not time_column:
        warnings.append(msg("Zaman sütunu bulunamadı; içe aktarmadan önce sütun eşleştirmesini seçin.", "No time column found; choose the column mapping before importing."))
    if not tag or not value_column:
        warnings.append(msg("Sensör türü veya ölçüm sütunu belirsiz; doğrulama alanında seçin.", "The sensor type or measurement column is unclear; choose it in the verification section."))
    result.update(kind="csv", columns=columns, preview=[row for _, row in rows[:2]], tag=tag or "", timeColumn=time_column, valueColumn=value_column, timeUnit=_guess_unit(time_column, rows, columns), warnings=warnings)
    return result


def inspect_sources(sources: list[dict[str, str]]) -> dict[str, Any]:
    source_checks(sources)
    return {"files": [inspect_source(source) for source in sources]}


def _number(value: str) -> float:
    stripped = value.strip()
    if "," in stripped and "." not in stripped:
        stripped = stripped.replace(",", ".")
    number = float(stripped)
    if not math.isfinite(number):
        raise ValueError(msg("Sayı sonlu değil", "Number is not finite"))
    return number


def parse_time(value: str, unit: str, column: str) -> tuple[float, str]:
    if unit == "iso" or re.match(r"^\d{4}-\d{2}-\d{2}[T ]", value.strip()):
        try:
            stamp = datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
        except ValueError as exc:
            raise ValueError(msg("ISO 8601 zaman geçersiz", "Invalid ISO 8601 time")) from exc
        if stamp.tzinfo is None:
            raise ValueError(msg("Saat dilimi eksik; Z veya +03:00 gibi UTC farkı gerekli", "Time zone missing; a UTC offset such as Z or +03:00 is required"))
        return stamp.timestamp(), "absolute"
    number = _number(value)
    key = normalize(column)
    if unit == "auto":
        if key == "EMOTIBITTIMESTAMP" or key.endswith("MS") or "MILLISECOND" in key:
            scale = 1000
        elif key.endswith("US") or "MICROSECOND" in key:
            scale = 1_000_000
        elif abs(number) >= 1e14:
            scale = 1_000_000
        elif abs(number) >= 1e11:
            scale = 1000
        else:
            scale = 1
    elif unit in {"s", "ms", "us"}:
        scale = {"s": 1, "ms": 1000, "us": 1_000_000}[unit]
    else:
        raise ValueError(msg("Zaman birimi auto, s, ms, us veya iso olmalı", "Time unit must be auto, s, ms, us or iso"))
    seconds = number / scale
    if seconds < 0:
        raise ValueError(msg("Negatif zaman desteklenmiyor", "Negative times are not supported"))
    # Device uptime is never treated as wall-clock time, regardless of magnitude.
    domain = "relative" if key == "EMOTIBITTIMESTAMP" else ("absolute" if seconds >= 100_000_000 else "relative")
    if key == "LOCALTIMESTAMP" and domain != "absolute":
        raise ValueError(msg("LocalTimestamp Unix epoch olmalı; birimi kontrol edin veya göreli zaman sütununu seçin", "LocalTimestamp must be a Unix epoch; check the unit or choose a relative time column"))
    if seconds > 32_503_680_000:
        raise ValueError(msg("Zaman çok büyük; saniye/milisaniye/mikrosaniye birimini kontrol edin", "Time value too large; check whether the unit is seconds, milliseconds or microseconds"))
    return seconds, domain


def _quality(times: list[float], total: int, invalid: int, duplicates: int, values: list[float], warnings: list[str]) -> tuple[dict[str, Any], float | None]:
    differences = np.diff(times)
    positive = differences[differences > 0]
    median_dt = float(np.median(positive)) if positive.size else None
    fs = 1 / median_dt if median_dt else None
    gaps = int(np.sum(differences > max(3 * median_dt, 0.25))) if median_dt else 0
    if gaps:
        warnings.append(msg(f"{gaps} zaman boşluğu var; çizim ve analizde bu aralıklar birleştirilmemeli.", f"{gaps} time gaps found; plots and analysis must not join across them."))
    if duplicates:
        warnings.append(msg(f"{duplicates} aynı zaman damgalı tekrar analizden çıkarıldı; ilk ölçüm tutuldu, özgün kaynak korunur.", f"{duplicates} repeated timestamps removed from analysis; the first measurement was kept and the original source is preserved."))
    if invalid:
        warnings.append(msg(f"{invalid}/{total} satır ölçüm/sütun hatası nedeniyle kullanılamadı; kaynak metin korunur.", f"{invalid}/{total} rows unusable because of measurement or column errors; the source text is preserved."))
    flat = len(values) > 1 and float(np.ptp(values)) <= 1e-12
    if flat:
        warnings.append(msg("Sinyal sabit; sensör teması, seçilen ölçüm sütunu ve kayıt kontrol edilmeli.", "The signal is constant; check sensor contact, the selected measurement column and the recording."))
    if median_dt and len(positive) > 2:
        jitter = float(np.median(np.abs(positive - median_dt))) / median_dt
        if jitter > 0.1:
            warnings.append(msg(f"Düzensiz örnekleme: aralık MAD/medyan oranı {jitter:.2f}. Filtreleme yalnızca kısa boşluksuz kesitlerde yapılır.", f"Irregular sampling: interval MAD/median ratio {jitter:.2f}. Filtering runs only within short gap-free segments."))
    return dict(totalRows=total, validRows=len(values), invalidRows=invalid, duplicates=duplicates, gaps=gaps, flat=flat, warnings=warnings), fs


def parse_gpx(text: str, name: str) -> tuple[list[dict[str, Any]], float, list[str]]:
    try:
        root = ElementTree.fromstring(text.lstrip("\ufeff"), forbid_dtd=True, forbid_entities=True, forbid_external=True)
    except (ElementTree.ParseError, DefusedXmlException, ValueError) as exc:
        raise DataError(msg(f"{name}: GPX XML okunamadı veya güvenli olmayan XML içeriği var.", f"{name}: the GPX XML could not be read or contains unsafe XML content.")) from exc
    local_name = lambda element: element.tag.rsplit("}", 1)[-1]
    if local_name(root) != "gpx":
        raise DataError(msg(f"{name}: GPX kök öğesi bulunamadı.", f"{name}: GPX root element not found."))
    segments = [element for element in root.iter() if local_name(element) == "trkseg"]
    if not segments:
        segments = [element for element in root.iter() if local_name(element) == "rte"]
    points: list[dict[str, Any]] = []
    warnings: list[str] = []
    missing = 0
    for segment_id, segment in enumerate(segments):
        previous: float | None = None
        for point in segment:
            if local_name(point) not in {"trkpt", "rtept"}:
                continue
            children = {local_name(child): child.text for child in point}
            if not children.get("time"):
                missing += 1
                continue
            try:
                stamp, domain = parse_time(children["time"] or "", "iso", "time")
                lat, lon = _number(point.attrib["lat"]), _number(point.attrib["lon"])
                if domain != "absolute" or not -90 <= lat <= 90 or not -180 <= lon <= 180:
                    raise ValueError(msg("Koordinat aralığı geçersiz", "Coordinates out of range"))
                record: dict[str, Any] = dict(t=stamp, lat=lat, lon=lon, segment=segment_id)
                if children.get("ele"):
                    record["ele"] = _number(children["ele"] or "")
            except (KeyError, ValueError) as exc:
                raise DataError(msg(f"{name}: GPX noktası geçersiz ({exc}); zaman ve koordinatları kontrol edin.", f"{name}: invalid GPX point ({exc}); check the times and coordinates.")) from exc
            if previous is not None and stamp <= previous:
                raise DataError(msg(f"{name}: GPX kesiti içinde yinelenen veya geriye giden zaman var; kaynağı düzeltin.", f"{name}: a GPX segment contains repeated or backward times; fix the source."))
            previous = stamp
            points.append(record)
            if len(points) > MAX_TOTAL_ROWS:
                raise DataError(msg(f"{name}: GPX nokta sınırı aşıldı.", f"{name}: GPX point limit exceeded."))
    if missing:
        raise DataError(msg(f"{name}: {missing} GPX noktasında zaman etiketi yok; zamansız noktalar video ile eşleştirilemez. Zaman içeren GPX dışa aktarın.", f"{name}: {missing} GPX points have no time tag; untimed points cannot be aligned with video. Export a GPX file that includes times."))
    if not points:
        raise DataError(msg(f"{name}: zaman içeren rota noktası bulunamadı. Strava benzeri kaynaktan zamanlı GPX dışa aktarın.", f"{name}: no timestamped route points found. Export a timed GPX from a service such as Strava."))
    points.sort(key=lambda point: point["t"])
    if any(points[i]["t"] == points[i - 1]["t"] for i in range(1, len(points))):
        raise DataError(msg(f"{name}: GPX kesitleri arasında yinelenen zaman var; oturumları ayırın veya kaynağı düzeltin.", f"{name}: GPX segments share repeated times; separate the sessions or fix the source."))
    origin = points[0]["t"]
    # Start a new segment at a recording gap; never draw/interpolate across it.
    deltas = np.diff([point["t"] for point in points])
    positive = deltas[deltas > 0]
    gap_limit = max(10.0, 5 * float(np.median(positive))) if positive.size else 10.0
    current_segment, previous_original = 0, None
    previous_time = None
    gap_count = 0
    for point in points:
        original_segment = point["segment"]
        if previous_time is not None and (original_segment != previous_original or point["t"] - previous_time > gap_limit):
            current_segment += 1
            if point["t"] - previous_time > gap_limit:
                gap_count += 1
        previous_original, previous_time = original_segment, point["t"]
        point["segment"] = current_segment
        point["t"] -= origin
    if gap_count:
        warnings.append(msg(f"GPX içinde {gap_count} kayıt boşluğu ayrı rota kesiti olarak korundu.", f"{gap_count} recording gaps in the GPX were kept as separate route segments."))
    return points, origin, warnings


def _metadata_units(sources: list[dict[str, str]]) -> dict[str, tuple[str, str]]:
    """Use declared units verbatim; preserve unusual metadata rather than correcting it."""
    units: dict[str, tuple[str, str]] = {}
    for source in sources:
        if not source["name"].lower().endswith(".json"):
            continue
        try:
            payload = json.loads(source["text"].lstrip("\ufeff"))
        except json.JSONDecodeError:
            continue  # inspect_source will return the actionable error.
        records = payload if isinstance(payload, list) else [payload]
        for record in records:
            if not isinstance(record, dict):
                continue
            info = record.get("info", record)
            if not isinstance(info, dict):
                continue
            tags = info.get("typeTags", [])
            declared_unit = info.get("units")
            if not isinstance(tags, list) or not isinstance(declared_unit, str) or not declared_unit.strip():
                continue
            for tag_value in tags:
                tag = sensor_tag(tag_value) if isinstance(tag_value, str) else None
                if tag:
                    unit = declared_unit.strip()[:100]
                    if tag in units and units[tag][0] != unit:
                        raise DataError(msg(f"{tag}: bilgi JSON kaynaklarında çelişen birimler var; ilgili oturumun tek bilgi dosyasını seçin.", f"{tag}: the info JSON sources declare conflicting units; select the single info file for this session."))
                    units[tag] = (unit, source["name"])
    return units


def import_sources(sources: list[dict[str, str]], mappings: list[dict[str, str]] | None = None) -> dict[str, Any]:
    source_checks(sources)
    declared_units = _metadata_units(sources)
    mapping_by_name: dict[str, dict[str, str]] = {}
    for mapping in mappings or []:
        if mapping["name"] in mapping_by_name:
            raise DataError(msg(f'{mapping["name"]}: aynı dosya için birden fazla eşleştirme var.', f'{mapping["name"]}: more than one mapping for the same file.'))
        if mapping["name"] not in {source["name"] for source in sources}:
            raise DataError(msg(f'{mapping["name"]}: eşleştirme için kaynak dosya bulunamadı.', f'{mapping["name"]}: no source file found for this mapping.'))
        mapping_by_name[mapping["name"]] = mapping
    channels: list[dict[str, Any]] = []
    provenance: list[dict[str, Any]] = []
    warnings: list[str] = []
    all_domains: set[str] = set()
    track: list[dict[str, Any]] = []
    gpx_origin: float | None = None
    total_seen = 0
    for source in sources:
        name, text = source["name"], source["text"]
        inspected = inspect_source(source)
        kind = inspected["kind"]
        if kind == "raw":
            raise DataError(f"{name}: {raw_guidance()}")
        if kind == "unsupported":
            raise DataError(msg(f"{name}: desteklenmeyen dosya türü. CSV/GPX/JSON seçin.", f"{name}: unsupported file type. Select a CSV, GPX or JSON file."))
        source_record = dict(name=name, sha256=hashlib.sha256(text.encode("utf-8")).hexdigest(), rows=0, kind=kind, warnings=[])
        if kind == "info":
            source_record["warnings"] = inspected["warnings"]
            provenance.append(source_record)
            continue
        if kind == "gpx":
            if gpx_origin is not None:
                raise DataError(msg("Bir oturumda tek GPX desteklenir; farklı sürüşleri ayrı proje olarak açın.", "Only one GPX file per session is supported; open different rides as separate projects."))
            track, gpx_origin, track_warnings = parse_gpx(text, name)
            source_record.update(rows=len(track), warnings=track_warnings)
            provenance.append(source_record)
            continue
        columns, rows, total, parse_warnings = read_csv(text, name)
        total_seen += total
        if total_seen > MAX_TOTAL_ROWS:
            raise DataError(msg("Toplam 1.500.000 satır sınırı aşıldı; kayıtları oturumlara bölün.", "The total limit of 1,500,000 rows was exceeded; split the recordings into sessions."))
        mapping = mapping_by_name.get(name)
        choice = mapping or inspected
        time_column = choice["timeColumn"]
        time_unit = choice.get("timeUnit", "auto")
        if time_column not in columns:
            raise DataError(msg(f"{name}: zaman sütunu seçilmedi veya bulunamadı.", f"{name}: no time column was selected, or it was not found."))
        if mapping and mapping["valueColumn"] != "*":
            value_columns = [(mapping["valueColumn"], sensor_tag(mapping["tag"]))]
        else:
            value_columns = [(column, sensor_tag(column)) for column in columns if sensor_tag(column)]
            if not value_columns:
                value_columns = [(inspected["valueColumn"], sensor_tag(inspected["tag"]))]
        for column, tag in value_columns:
            if not tag or column not in columns:
                raise DataError(msg(f"{name}: sensör türünü ve ölçüm sütununu doğrulama alanında seçin.", f"{name}: choose the sensor type and measurement column in the verification section."))
            if normalize(column) in METADATA or column == time_column:
                raise DataError(msg(f"{name}: {column} donanım/zaman sayacı; ölçüm sütunu olarak kullanılamaz.", f"{name}: {column} is a hardware or time counter and cannot be used as a measurement column."))
        ti = columns.index(time_column)
        timestamp_rows: list[tuple[int, list[str], float]] = []
        invalid_times: list[int] = []
        time_error = ""
        for row_number, row in rows:
            try:
                stamp, domain = parse_time(row[ti], time_unit, time_column)
                all_domains.add(domain)
                timestamp_rows.append((row_number, row, stamp))
            except ValueError as exc:
                invalid_times.append(row_number)
                time_error = str(exc)
        if invalid_times:
            raise DataError(msg(f"{name}: {len(invalid_times)} geçersiz zaman damgası; satır {_row_list(invalid_times)} ({time_error}). Zaman birimini/sütununu düzeltin; içe aktarma yapılmadı.", f"{name}: {len(invalid_times)} invalid timestamps, rows {_row_list(invalid_times)} ({time_error}). Fix the time unit or column; nothing was imported."))
        source_warnings = parse_warnings.copy()
        if time_unit == "auto":
            source_warnings.append(msg(f"{time_column} zaman birimi sütun adı ve sayı büyüklüğünden çıkarıldı; örnekleri ve eşleştirmeyi doğrulayın.", f"The time unit of {time_column} was inferred from the column name and value magnitude; check the samples and the mapping."))
        if any(timestamp_rows[i][2] < timestamp_rows[i - 1][2] for i in range(1, len(timestamp_rows))):
            source_warnings.append(msg("Kaynak satırları zamana göre sıralı değil; içe aktarmada sıralandı. Cihaz yeniden başlamış olabilir; ortak saat varsayımını kontrol edin.", "Source rows were not in time order and were sorted on import. The device may have restarted; check the shared-clock assumption."))
            if normalize(time_column) == "EMOTIBITTIMESTAMP":
                raise DataError(msg(f"{name}: cihaz saati geriye gidiyor (yeniden başlatma/taşma olabilir). Kaydı ayrı oturumlara bölün veya LocalTimestamp kullanın.", f"{name}: the device clock runs backwards (possibly a restart or overflow). Split the recording into separate sessions or use LocalTimestamp."))
        for column, tag in value_columns:
            vi = columns.index(column)
            values_by_time: dict[float, float] = {}
            invalid = total - len(rows)
            invalid_value_rows: list[int] = []
            duplicates = 0
            for row_number, row, stamp in timestamp_rows:
                try:
                    value = _number(row[vi])
                except ValueError:
                    invalid += 1
                    invalid_value_rows.append(row_number)
                    continue
                if stamp in values_by_time:
                    duplicates += 1
                else:
                    values_by_time[stamp] = value
            if not values_by_time:
                raise DataError(msg(f"{name}/{tag}: kullanılabilir sayısal ölçüm yok.", f"{name}/{tag}: no usable numeric measurements."))
            times = sorted(values_by_time)
            values = [values_by_time[stamp] for stamp in times]
            channel_warnings = source_warnings.copy()
            if invalid_value_rows:
                channel_warnings.append(msg(f"{column} için geçersiz/eksik ölçümler: satır {_row_list(invalid_value_rows)}.", f"Invalid or missing measurements in {column}: rows {_row_list(invalid_value_rows)}."))
            if tag == "EA" and any(value < 0 for value in values):
                channel_warnings.append(msg("Negatif EDA değeri var; kalibrasyon, birim ve kaynak seçimini kontrol edin.", "Negative EDA values present; check the calibration, unit and source selection."))
            quality, fs = _quality(times, total, invalid, duplicates, values, channel_warnings)
            label, unit = sensor_info(tag)
            if tag in declared_units:
                unit, info_name = declared_units[tag]
                quality["warnings"].append(msg(f"Birim {info_name} kaynağından aynen alındı: {unit}. Kaynak metaverisindeki olası hatalar otomatik düzeltilmedi.", f"Unit taken verbatim from {info_name}: {unit}. Possible errors in the source metadata were not corrected automatically."))
            else:
                quality["warnings"].append(msg(f"Birim sensör etiketi sözlüğünden varsayıldı ({unit}); ilgili _info.json ve cihaz sürümüyle doğrulayın.", f"Unit assumed from the sensor tag dictionary ({unit}); verify it against the matching _info.json and the device version."))
            channels.append(dict(id=f"{name}:{tag}:{column}", tag=tag, label=label, unit=unit, points=[dict(t=t, v=v) for t, v in zip(times, values)], sampleRate=fs, sourceId=name, quality=quality))
        source_record.update(rows=total, warnings=source_warnings)
        provenance.append(source_record)
    if len(all_domains) > 1:
        raise DataError(msg("Sensörlerde mutlak UTC/epoch ile cihaza göre göreli zaman birlikte seçilmiş. Tüm sensörlerde LocalTimestamp veya aynı cihazın EmotiBitTimestamp sütununu seçin; her kanalı ayrı sıfırlamak geçerli senkronizasyon değildir.", "The sensors mix absolute UTC/epoch time with device-relative time. Choose LocalTimestamp for every sensor, or the EmotiBitTimestamp column from the same device; zeroing each channel separately is not valid synchronization."))
    sensor_start = min((channel["points"][0]["t"] for channel in channels), default=None)
    sensor_origin = sensor_start if all_domains == {"absolute"} else None
    if sensor_start is not None:
        for channel in channels:
            for point in channel["points"]:
                point["t"] -= sensor_start
    if channels and sensor_origin is None:
        warnings.append(msg("Sensör saati göreli: kanalların ortak ilk zamanı korundu. GPX/video için olay çapasıyla elle eşleştirme gerekir.", "The sensor clock is relative: the channels keep their shared first time. GPX and video must be aligned by hand with an event anchor."))
    if not channels:
        warnings.append(msg("Sensör kanalı yok; EDA analizi için ayrıştırılmış EA CSV ekleyin.", "No sensor channels; add a parsed EA CSV for EDA analysis."))
    for source in provenance:
        warnings.extend(f'{source["name"]}: {warning}' for warning in source["warnings"])
    duration = max([point["t"] for channel in channels for point in channel["points"]] + [point["t"] for point in track] + [0.0])
    return dict(channels=channels, track=track, sources=provenance, sensorOriginEpoch=sensor_origin, gpxOriginEpoch=gpx_origin, duration=duration, warnings=warnings)

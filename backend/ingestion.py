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

from .catalog import SENSORS, normalize, sensor_tag

RAW_GUIDANCE = (
    "Bu dosya başlıksız EmotiBit paket kaydıdır. Paket zamanı her örneğin ölçüm zamanı değildir; "
    "doğrulanmış örnek zamanları olmadan analiz veya senkronizasyon yapılmadı. "
    "EmotiBit Oscilloscope içindeki resmi DataParser ile kaydı ayrıştırın ve üretilen "
    "LocalTimestamp içeren sensör CSV dosyalarını yükleyin. "
    "Bilgi JSON dosyası tek başına bu zamanları oluşturmaz. "
    "Kılavuz: https://github.com/EmotiBit/EmotiBit_Docs/blob/master/EmotiBitDataParser_reference_manual.md"
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
        raise DataError("En az bir CSV, GPX veya bilgi JSON dosyası seçin.")
    if len(sources) > MAX_SOURCES:
        raise DataError(f"Tek projede en fazla {MAX_SOURCES} kaynak yüklenebilir; oturumları ayırın.")
    names = [s["name"] for s in sources]
    if len(names) != len(set(names)):
        raise DataError("Aynı ada sahip dosyalar var. Kaynak kimlikleri için dosya adlarını farklılaştırın.")
    for source in sources:
        if not source["name"].strip() or len(source["name"]) > 300:
            raise DataError("Dosya adı boş olamaz ve 300 karakteri aşamaz.")
        if "\x00" in source["text"]:
            raise DataError(f'{source["name"]}: ikili dosya metin olarak açılamaz; CSV/GPX seçin.')


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
        raise DataError(f"{name}: dosya boş.")
    if _is_raw(text):
        raise DataError(f"{name}: {RAW_GUIDANCE}")
    first = next((line for line in text.splitlines() if line.strip()), "")
    delimiter = max((",", ";", "\t"), key=first.count)
    if first.count(delimiter) == 0:
        raise DataError(f"{name}: en az zaman ve ölçüm sütunu içeren CSV gerekli.")
    try:
        parsed = list(csv.reader(io.StringIO(text), delimiter=delimiter, strict=True))
    except csv.Error as exc:
        raise DataError(f"{name}: CSV tırnak/ayırıcı yapısı okunamadı ({exc}). Dosyayı düzeltin.") from exc
    parsed = [(number + 1, row) for number, row in enumerate(parsed) if row and any(x.strip() for x in row)]
    if not parsed:
        raise DataError(f"{name}: dosyada veri yok.")
    columns = [c.strip() for c in parsed[0][1]]
    if len(set(columns)) != len(columns) or any(not c for c in columns):
        raise DataError(f"{name}: sütun başlıkları boş veya yinelenmiş. Benzersiz başlıklar sağlayın.")
    if len(columns) > 200:
        raise DataError(f"{name}: en fazla 200 sütun desteklenir.")
    rows = parsed[1:]
    if len(rows) > MAX_TOTAL_ROWS:
        raise DataError(f"{name}: çok fazla satır; kaydı oturumlara bölün.")
    bad = [n for n, row in rows if len(row) != len(columns)]
    warnings = []
    if bad:
        warnings.append(f"{len(bad)} bozuk satır (sütun sayısı farklı) analiz dışında: satır {_row_list(bad)}. Kaynak metin korunur.")
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
        result["warnings"] = warnings + [f"{len(track)} zamanlı rota noktası bulundu."]
        return result
    if suffix == "json":
        result["kind"] = "info"
        try:
            payload = json.loads(text.lstrip("\ufeff"))
        except json.JSONDecodeError as exc:
            raise DataError(f"{name}: bilgi JSON dosyası geçersiz ({exc.msg}).") from exc
        if not isinstance(payload, (dict, list)) or (isinstance(payload, list) and not all(isinstance(item, dict) for item in payload)):
            raise DataError(f"{name}: bilgi JSON kökü nesne veya nesne listesi olmalı.")
        result["columns"] = list(payload)[:30] if isinstance(payload, dict) else [str(item.get("info", {}).get("name", f"Kayıt {index + 1}")) if isinstance(item.get("info"), dict) else f"Kayıt {index + 1}" for index, item in enumerate(payload[:30])]
        result["warnings"] = ["Bilgi dosyası kaynak olarak korunur; örnek zamanlarını veya saat eşleştirmesini kendiliğinden oluşturmaz."]
        return result
    if suffix != "csv":
        result["warnings"] = ["Bu alanda CSV, GPX ve EmotiBit bilgi JSON dosyaları desteklenir. Videoyu video alanından seçin."]
        return result
    if _is_raw(text):
        result["kind"] = "raw"
        result["warnings"] = [RAW_GUIDANCE]
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
        warnings.append("Zaman sütunu bulunamadı; içe aktarmadan önce sütun eşleştirmesini seçin.")
    if not tag or not value_column:
        warnings.append("Sensör türü veya ölçüm sütunu belirsiz; doğrulama alanında seçin.")
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
        raise ValueError("Sayı sonlu değil")
    return number


def parse_time(value: str, unit: str, column: str) -> tuple[float, str]:
    if unit == "iso" or re.match(r"^\d{4}-\d{2}-\d{2}[T ]", value.strip()):
        try:
            stamp = datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
        except ValueError as exc:
            raise ValueError("ISO 8601 zaman geçersiz") from exc
        if stamp.tzinfo is None:
            raise ValueError("Saat dilimi eksik; Z veya +03:00 gibi UTC farkı gerekli")
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
        raise ValueError("Zaman birimi auto, s, ms, us veya iso olmalı")
    seconds = number / scale
    if seconds < 0:
        raise ValueError("Negatif zaman desteklenmiyor")
    # Device uptime is never treated as wall-clock time, regardless of magnitude.
    domain = "relative" if key == "EMOTIBITTIMESTAMP" else ("absolute" if seconds >= 100_000_000 else "relative")
    if key == "LOCALTIMESTAMP" and domain != "absolute":
        raise ValueError("LocalTimestamp Unix epoch olmalı; birimi kontrol edin veya göreli zaman sütununu seçin")
    if seconds > 32_503_680_000:
        raise ValueError("Zaman çok büyük; saniye/milisaniye/mikrosaniye birimini kontrol edin")
    return seconds, domain


def _quality(times: list[float], total: int, invalid: int, duplicates: int, values: list[float], warnings: list[str]) -> tuple[dict[str, Any], float | None]:
    differences = np.diff(times)
    positive = differences[differences > 0]
    median_dt = float(np.median(positive)) if positive.size else None
    fs = 1 / median_dt if median_dt else None
    gaps = int(np.sum(differences > max(3 * median_dt, 0.25))) if median_dt else 0
    if gaps:
        warnings.append(f"{gaps} zaman boşluğu var; çizim ve analizde bu aralıklar birleştirilmemeli.")
    if duplicates:
        warnings.append(f"{duplicates} aynı zaman damgalı tekrar analizden çıkarıldı; ilk ölçüm tutuldu, özgün kaynak korunur.")
    if invalid:
        warnings.append(f"{invalid}/{total} satır ölçüm/sütun hatası nedeniyle kullanılamadı; kaynak metin korunur.")
    flat = len(values) > 1 and float(np.ptp(values)) <= 1e-12
    if flat:
        warnings.append("Sinyal sabit; sensör teması, seçilen ölçüm sütunu ve kayıt kontrol edilmeli.")
    if median_dt and len(positive) > 2:
        jitter = float(np.median(np.abs(positive - median_dt))) / median_dt
        if jitter > 0.1:
            warnings.append(f"Düzensiz örnekleme: aralık MAD/medyan oranı {jitter:.2f}. Filtreleme yalnızca kısa boşluksuz kesitlerde yapılır.")
    return dict(totalRows=total, validRows=len(values), invalidRows=invalid, duplicates=duplicates, gaps=gaps, flat=flat, warnings=warnings), fs


def parse_gpx(text: str, name: str) -> tuple[list[dict[str, Any]], float, list[str]]:
    try:
        root = ElementTree.fromstring(text.lstrip("\ufeff"), forbid_dtd=True, forbid_entities=True, forbid_external=True)
    except (ElementTree.ParseError, DefusedXmlException, ValueError) as exc:
        raise DataError(f"{name}: GPX XML okunamadı veya güvenli olmayan XML içeriği var.") from exc
    local_name = lambda element: element.tag.rsplit("}", 1)[-1]
    if local_name(root) != "gpx":
        raise DataError(f"{name}: GPX kök öğesi bulunamadı.")
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
                    raise ValueError("Koordinat aralığı geçersiz")
                record: dict[str, Any] = dict(t=stamp, lat=lat, lon=lon, segment=segment_id)
                if children.get("ele"):
                    record["ele"] = _number(children["ele"] or "")
            except (KeyError, ValueError) as exc:
                raise DataError(f"{name}: GPX noktası geçersiz ({exc}); zaman ve koordinatları kontrol edin.") from exc
            if previous is not None and stamp <= previous:
                raise DataError(f"{name}: GPX kesiti içinde yinelenen veya geriye giden zaman var; kaynağı düzeltin.")
            previous = stamp
            points.append(record)
            if len(points) > MAX_TOTAL_ROWS:
                raise DataError(f"{name}: GPX nokta sınırı aşıldı.")
    if missing:
        raise DataError(f"{name}: {missing} GPX noktasında zaman etiketi yok; zamansız noktalar video ile eşleştirilemez. Zaman içeren GPX dışa aktarın.")
    if not points:
        raise DataError(f"{name}: zaman içeren rota noktası bulunamadı. Strava benzeri kaynaktan zamanlı GPX dışa aktarın.")
    points.sort(key=lambda point: point["t"])
    if any(points[i]["t"] == points[i - 1]["t"] for i in range(1, len(points))):
        raise DataError(f"{name}: GPX kesitleri arasında yinelenen zaman var; oturumları ayırın veya kaynağı düzeltin.")
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
        warnings.append(f"GPX içinde {gap_count} kayıt boşluğu ayrı rota kesiti olarak korundu.")
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
                        raise DataError(f"{tag}: bilgi JSON kaynaklarında çelişen birimler var; ilgili oturumun tek bilgi dosyasını seçin.")
                    units[tag] = (unit, source["name"])
    return units


def import_sources(sources: list[dict[str, str]], mappings: list[dict[str, str]] | None = None) -> dict[str, Any]:
    source_checks(sources)
    declared_units = _metadata_units(sources)
    mapping_by_name: dict[str, dict[str, str]] = {}
    for mapping in mappings or []:
        if mapping["name"] in mapping_by_name:
            raise DataError(f'{mapping["name"]}: aynı dosya için birden fazla eşleştirme var.')
        if mapping["name"] not in {source["name"] for source in sources}:
            raise DataError(f'{mapping["name"]}: eşleştirme için kaynak dosya bulunamadı.')
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
            raise DataError(f"{name}: {RAW_GUIDANCE}")
        if kind == "unsupported":
            raise DataError(f"{name}: desteklenmeyen dosya türü. CSV/GPX/JSON seçin.")
        source_record = dict(name=name, sha256=hashlib.sha256(text.encode("utf-8")).hexdigest(), rows=0, kind=kind, warnings=[])
        if kind == "info":
            source_record["warnings"] = inspected["warnings"]
            provenance.append(source_record)
            continue
        if kind == "gpx":
            if gpx_origin is not None:
                raise DataError("Bir oturumda tek GPX desteklenir; farklı sürüşleri ayrı proje olarak açın.")
            track, gpx_origin, track_warnings = parse_gpx(text, name)
            source_record.update(rows=len(track), warnings=track_warnings)
            provenance.append(source_record)
            continue
        columns, rows, total, parse_warnings = read_csv(text, name)
        total_seen += total
        if total_seen > MAX_TOTAL_ROWS:
            raise DataError("Toplam 1.500.000 satır sınırı aşıldı; kayıtları oturumlara bölün.")
        mapping = mapping_by_name.get(name)
        choice = mapping or inspected
        time_column = choice["timeColumn"]
        time_unit = choice.get("timeUnit", "auto")
        if time_column not in columns:
            raise DataError(f"{name}: zaman sütunu seçilmedi veya bulunamadı.")
        if mapping and mapping["valueColumn"] != "*":
            value_columns = [(mapping["valueColumn"], sensor_tag(mapping["tag"]))]
        else:
            value_columns = [(column, sensor_tag(column)) for column in columns if sensor_tag(column)]
            if not value_columns:
                value_columns = [(inspected["valueColumn"], sensor_tag(inspected["tag"]))]
        for column, tag in value_columns:
            if not tag or column not in columns:
                raise DataError(f"{name}: sensör türünü ve ölçüm sütununu doğrulama alanında seçin.")
            if normalize(column) in METADATA or column == time_column:
                raise DataError(f"{name}: {column} donanım/zaman sayacı; ölçüm sütunu olarak kullanılamaz.")
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
            raise DataError(f"{name}: {len(invalid_times)} geçersiz zaman damgası; satır {_row_list(invalid_times)} ({time_error}). Zaman birimini/sütununu düzeltin; içe aktarma yapılmadı.")
        source_warnings = parse_warnings.copy()
        if time_unit == "auto":
            source_warnings.append(f"{time_column} zaman birimi sütun adı ve sayı büyüklüğünden çıkarıldı; örnekleri ve eşleştirmeyi doğrulayın.")
        if any(timestamp_rows[i][2] < timestamp_rows[i - 1][2] for i in range(1, len(timestamp_rows))):
            source_warnings.append("Kaynak satırları zamana göre sıralı değil; içe aktarmada sıralandı. Cihaz yeniden başlamış olabilir; ortak saat varsayımını kontrol edin.")
            if normalize(time_column) == "EMOTIBITTIMESTAMP":
                raise DataError(f"{name}: cihaz saati geriye gidiyor (yeniden başlatma/taşma olabilir). Kaydı ayrı oturumlara bölün veya LocalTimestamp kullanın.")
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
                raise DataError(f"{name}/{tag}: kullanılabilir sayısal ölçüm yok.")
            times = sorted(values_by_time)
            values = [values_by_time[stamp] for stamp in times]
            channel_warnings = source_warnings.copy()
            if invalid_value_rows:
                channel_warnings.append(f"{column} için geçersiz/eksik ölçümler: satır {_row_list(invalid_value_rows)}.")
            if tag == "EA" and any(value < 0 for value in values):
                channel_warnings.append("Negatif EDA değeri var; kalibrasyon, birim ve kaynak seçimini kontrol edin.")
            quality, fs = _quality(times, total, invalid, duplicates, values, channel_warnings)
            label, unit = SENSORS[tag]
            if tag in declared_units:
                unit, info_name = declared_units[tag]
                quality["warnings"].append(f"Birim {info_name} kaynağından aynen alındı: {unit}. Kaynak metaverisindeki olası hatalar otomatik düzeltilmedi.")
            else:
                quality["warnings"].append(f"Birim sensör etiketi sözlüğünden varsayıldı ({unit}); ilgili _info.json ve cihaz sürümüyle doğrulayın.")
            channels.append(dict(id=f"{name}:{tag}:{column}", tag=tag, label=label, unit=unit, points=[dict(t=t, v=v) for t, v in zip(times, values)], sampleRate=fs, sourceId=name, quality=quality))
        source_record.update(rows=total, warnings=source_warnings)
        provenance.append(source_record)
    if len(all_domains) > 1:
        raise DataError("Sensörlerde mutlak UTC/epoch ile cihaza göre göreli zaman birlikte seçilmiş. Tüm sensörlerde LocalTimestamp veya aynı cihazın EmotiBitTimestamp sütununu seçin; her kanalı ayrı sıfırlamak geçerli senkronizasyon değildir.")
    sensor_start = min((channel["points"][0]["t"] for channel in channels), default=None)
    sensor_origin = sensor_start if all_domains == {"absolute"} else None
    if sensor_start is not None:
        for channel in channels:
            for point in channel["points"]:
                point["t"] -= sensor_start
    if channels and sensor_origin is None:
        warnings.append("Sensör saati göreli: kanalların ortak ilk zamanı korundu. GPX/video için olay çapasıyla elle eşleştirme gerekir.")
    if not channels:
        warnings.append("Sensör kanalı yok; EDA analizi için ayrıştırılmış EA CSV ekleyin.")
    for source in provenance:
        warnings.extend(f'{source["name"]}: {warning}' for warning in source["warnings"])
    duration = max([point["t"] for channel in channels for point in channel["points"]] + [point["t"] for point in track] + [0.0])
    return dict(channels=channels, track=track, sources=provenance, sensorOriginEpoch=sensor_origin, gpxOriginEpoch=gpx_origin, duration=duration, warnings=warnings)

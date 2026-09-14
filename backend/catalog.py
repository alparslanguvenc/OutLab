"""Sensor labels describe recorded signals, never inferred emotions."""
from __future__ import annotations

SENSORS: dict[str, tuple[str, str]] = {
    "EA": ("Elektrodermal aktivite", "µS"),
    "EL": ("EDL ham cihaz kanalı", "cihaz birimi"),
    "ER": ("EDR ham cihaz kanalı", "cihaz birimi"),
    "SA": ("SCR genliği (cihaz)", "µS"),
    "SR": ("SCR yükseliş süresi (cihaz)", "s"),
    "SF": ("SCR sıklığı (cihaz)", "cihaz birimi"),
    "AX": ("İvme X", "g"), "AY": ("İvme Y", "g"), "AZ": ("İvme Z", "g"),
    "GX": ("Açısal hız X", "°/s"), "GY": ("Açısal hız Y", "°/s"), "GZ": ("Açısal hız Z", "°/s"),
    "MX": ("Manyetik alan X", "µT"), "MY": ("Manyetik alan Y", "µT"), "MZ": ("Manyetik alan Z", "µT"),
    "PI": ("PPG kızılötesi", "cihaz sayımı"), "PR": ("PPG kırmızı", "cihaz sayımı"), "PG": ("PPG yeşil", "cihaz sayımı"),
    "HR": ("Kalp hızı (cihaz)", "bpm"), "BI": ("Atımlar arası süre (cihaz)", "ms"),
    "T0": ("Sıcaklık T0", "°C"), "T1": ("Sıcaklık T1", "°C"), "TH": ("TH sıcaklık kanalı (cihaz)", "cihaz birimi"),
    "H0": ("Bağıl nem", "%"),
}
ALIASES = {"EDA": "EA", "PPG": "PI", "HEARTRATE": "HR", "IBI": "BI", "HUMIDITY": "H0"}


def normalize(text: str) -> str:
    return "".join(c for c in text.upper() if c.isalnum())


def sensor_tag(text: str) -> str | None:
    key = normalize(text)
    return key if key in SENSORS else ALIASES.get(key)

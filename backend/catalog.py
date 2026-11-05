"""Sensor labels describe recorded signals, never inferred emotions."""
from __future__ import annotations

from .i18n import msg

# Labels and non-SI units are (Turkish, English) pairs, resolved per request by sensor_info().
_DEVICE_UNITS = ("cihaz birimi", "device units")
_DEVICE_COUNTS = ("cihaz sayımı", "device counts")
SENSORS: dict[str, tuple[tuple[str, str], str | tuple[str, str]]] = {
    "EA": (("Elektrodermal aktivite", "Electrodermal activity"), "µS"),
    "EL": (("EDL ham cihaz kanalı", "EDL raw device channel"), _DEVICE_UNITS),
    "ER": (("EDR ham cihaz kanalı", "EDR raw device channel"), _DEVICE_UNITS),
    "SA": (("SCR genliği (cihaz)", "SCR amplitude (device)"), "µS"),
    "SR": (("SCR yükseliş süresi (cihaz)", "SCR rise time (device)"), "s"),
    "SF": (("SCR sıklığı (cihaz)", "SCR frequency (device)"), _DEVICE_UNITS),
    "AX": (("İvme X", "Acceleration X"), "g"), "AY": (("İvme Y", "Acceleration Y"), "g"), "AZ": (("İvme Z", "Acceleration Z"), "g"),
    "GX": (("Açısal hız X", "Angular velocity X"), "°/s"), "GY": (("Açısal hız Y", "Angular velocity Y"), "°/s"), "GZ": (("Açısal hız Z", "Angular velocity Z"), "°/s"),
    "MX": (("Manyetik alan X", "Magnetic field X"), "µT"), "MY": (("Manyetik alan Y", "Magnetic field Y"), "µT"), "MZ": (("Manyetik alan Z", "Magnetic field Z"), "µT"),
    "PI": (("PPG kızılötesi", "PPG infrared"), _DEVICE_COUNTS), "PR": (("PPG kırmızı", "PPG red"), _DEVICE_COUNTS), "PG": (("PPG yeşil", "PPG green"), _DEVICE_COUNTS),
    "HR": (("Kalp hızı (cihaz)", "Heart rate (device)"), "bpm"), "BI": (("Atımlar arası süre (cihaz)", "Inter-beat interval (device)"), "ms"),
    "T0": (("Sıcaklık T0", "Temperature T0"), "°C"), "T1": (("Sıcaklık T1", "Temperature T1"), "°C"), "TH": (("TH sıcaklık kanalı (cihaz)", "TH temperature channel (device)"), _DEVICE_UNITS),
    "H0": (("Bağıl nem", "Relative humidity"), "%"),
}
ALIASES = {"EDA": "EA", "PPG": "PI", "HEARTRATE": "HR", "IBI": "BI", "HUMIDITY": "H0"}


def sensor_info(tag: str) -> tuple[str, str]:
    """Label and default unit for a sensor tag, in the current request language."""
    (label_tr, label_en), unit = SENSORS[tag]
    return msg(label_tr, label_en), unit if isinstance(unit, str) else msg(*unit)


def normalize(text: str) -> str:
    return "".join(c for c in text.upper() if c.isalnum())


def sensor_tag(text: str) -> str | None:
    key = normalize(text)
    return key if key in SENSORS else ALIASES.get(key)

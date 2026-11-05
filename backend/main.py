"""Local-only OutLab API and production frontend hosting."""
from __future__ import annotations

from pathlib import Path
from typing import Annotated, Any, Literal
from urllib.parse import urlsplit

from fastapi import FastAPI, HTTPException
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, ConfigDict, Field
from starlette.middleware.cors import CORSMiddleware
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from .analysis import analyze_dataset
from .i18n import HEADER, msg, reset_lang, set_lang
from .ingestion import DataError, import_sources, inspect_sources

VERSION = "1.4.0"
MAX_BODY_BYTES = 128 * 1024 * 1024
DIST = Path(__file__).resolve().parents[1] / "dist"
ALLOWED_ORIGINS = {
    f"http://{host}:{port}"
    for host in ("localhost", "127.0.0.1", "[::1]")
    for port in (8765, 5173)
}


class LocalBoundaryMiddleware:
    """Host/origin validation plus actual streaming size limit, without data logging."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        headers = {key.decode("latin-1").lower(): value.decode("latin-1") for key, value in scope.get("headers", [])}
        # Set the request language before any early return; the ContextVar is
        # inherited by the downstream app, exception handlers and threadpool endpoints.
        token = set_lang(headers.get(HEADER))
        try:
            await self._guarded(scope, receive, send, headers)
        finally:
            reset_lang(token)

    async def _guarded(self, scope: Scope, receive: Receive, send: Send, headers: dict[str, str]) -> None:
        host = headers.get("host", "")
        try:
            hostname = urlsplit(f"http://{host}").hostname
        except ValueError:
            hostname = None
        if hostname not in {"localhost", "127.0.0.1", "::1"}:
            await JSONResponse({"detail": msg("Bu uygulama yalnızca localhost üzerinden kullanılabilir.", "This app is only available on localhost.")}, status_code=400)(scope, receive, send)
            return
        origin = headers.get("origin")
        if origin is not None and origin not in ALLOWED_ORIGINS:
            await JSONResponse({"detail": msg("Bu kaynaktan yerel araştırma verisine erişim izinli değil. Uygulamayı localhost:8765 adresinden açın.", "This origin is not allowed to access local research data. Open the app at localhost:8765.")}, status_code=403)(scope, receive, send)
            return
        if headers.get("content-encoding", "identity").lower() != "identity":
            await JSONResponse({"detail": msg("Sıkıştırılmış istek gövdesi desteklenmiyor.", "Compressed request bodies are not supported.")}, status_code=400)(scope, receive, send)
            return
        try:
            length = int(headers.get("content-length", "0"))
        except ValueError:
            length = -1
        if length < 0:
            await JSONResponse({"detail": msg("İstek uzunluğu geçersiz.", "The request length is invalid.")}, status_code=400)(scope, receive, send)
            return
        if length > MAX_BODY_BYTES:
            await JSONResponse({"detail": msg("İstek 128 MB sınırını aşıyor. Kaydı ayrı oturumlara bölün; videoyu CSV alanına yüklemeyin.", "The request exceeds the 128 MB limit. Split the recording into separate sessions, and do not upload video in the CSV field.")}, status_code=413)(scope, receive, send)
            return
        body = bytearray()
        while True:
            message = await receive()
            if message["type"] == "http.disconnect":
                return
            if message["type"] != "http.request":
                continue
            body.extend(message.get("body", b""))
            if len(body) > MAX_BODY_BYTES:
                await JSONResponse({"detail": msg("İstek 128 MB sınırını aşıyor; kaydı oturumlara bölün.", "The request exceeds the 128 MB limit; split the recording into sessions.")}, status_code=413)(scope, receive, send)
                return
            if not message.get("more_body", False):
                break
        delivered = False

        async def replay() -> Message:
            nonlocal delivered
            if not delivered:
                delivered = True
                return {"type": "http.request", "body": bytes(body), "more_body": False}
            return await receive()

        async def private_headers(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers_out = list(message.get("headers", []))
                headers_out.extend([
                    (b"x-content-type-options", b"nosniff"),
                    (b"referrer-policy", b"no-referrer"),
                    (b"cache-control", b"no-store"),
                    (b"x-frame-options", b"DENY"),
                    (b"content-security-policy", b"frame-ancestors 'none'; object-src 'none'; base-uri 'self'"),
                ])
                message["headers"] = headers_out
            await send(message)

        await self.app(scope, replay, private_headers)


class SourceInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: Annotated[str, Field(min_length=1, max_length=300)]
    text: str


class MappingInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str
    tag: str
    timeColumn: str
    valueColumn: str
    timeUnit: str = "auto"


class InspectInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    sources: Annotated[list[SourceInput], Field(min_length=1, max_length=100)]


class ImportInput(InspectInput):
    mappings: list[MappingInput] | None = None


class ConfigInput(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    baselineStart: float
    baselineEnd: float
    zThreshold: float
    minDistance: float
    motionThreshold: float


class QualityOptions(BaseModel):
    """Rule-based EDA quality screen (Kleckner et al. 2018 rules + flat-line heuristic)."""
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    enabled: bool = False
    minUs: float = Field(0.05, ge=0, le=100)
    maxUs: float = Field(60.0, gt=0, le=1000)
    maxSlope: float = Field(10.0, gt=0, le=1000)
    temperatureTag: Literal["T0", "T1", "TH"] | None = None
    tempMin: float = Field(30.0, ge=-50, le=60)
    tempMax: float = Field(40.0, ge=-50, le=60)
    transitionSeconds: float = Field(5.0, ge=0, le=60)
    flatSeconds: float = Field(10.0, ge=0, le=600)
    flatRangeUs: float = Field(0.001, ge=0, le=10)
    windowSeconds: float = Field(5.0, ge=0.5, le=120)
    prefilterSeconds: float = Field(2.0, ge=0, le=30)
    action: Literal["flag", "exclude"] = "flag"


class MotionWindowOptions(BaseModel):
    """Windowed motion intensity with session-relative thresholds."""
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    enabled: bool = False
    windowSeconds: float = Field(2.0, ge=0.5, le=30)
    k: float = Field(3.0, ge=0.5, le=20)
    useGyro: bool = True
    useSpeed: bool = True
    gpsOffset: float = Field(0.0, ge=-86400, le=86400)


class RobustnessOptions(BaseModel):
    """Decomposition × SCR-peak-method agreement per candidate."""
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    enabled: bool = False
    decompositions: list[Literal["highpass", "smoothmedian", "cvxEDA"]] = Field(default_factory=lambda: ["highpass", "smoothmedian", "cvxEDA"], max_length=3)
    peakMethods: list[Literal["neurokit", "kim2004", "gamboa2008", "nabian2018", "vanhalem2020"]] = Field(default_factory=lambda: ["neurokit", "kim2004", "gamboa2008", "nabian2018", "vanhalem2020"], max_length=5)
    minAmplitudeUs: float = Field(0.05, ge=0, le=10)
    toleranceSeconds: float = Field(2.0, gt=0, le=30)


class AnalysisOptions(BaseModel):
    model_config = ConfigDict(extra="forbid")
    quality: QualityOptions | None = None
    motionWindows: MotionWindowOptions | None = None
    robustness: RobustnessOptions | None = None


class AnalyzeInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    dataset: dict[str, Any]
    config: ConfigInput
    options: AnalysisOptions | None = None


app = FastAPI(title="OutLab · Yerel araştırma API", version=VERSION, docs_url="/api/docs", redoc_url=None, openapi_url="/api/openapi.json")
app.add_middleware(CORSMiddleware, allow_origins=sorted(ALLOWED_ORIGINS), allow_credentials=False, allow_methods=["GET", "POST"], allow_headers=["Content-Type", "X-OutLab-Lang"])
app.add_middleware(LocalBoundaryMiddleware)


@app.exception_handler(DataError)
async def data_error(_request: Any, exc: DataError) -> JSONResponse:
    return JSONResponse(status_code=400, content={"detail": str(exc)})


@app.exception_handler(RequestValidationError)
async def validation_error(_request: Any, exc: RequestValidationError) -> JSONResponse:
    fields = ", ".join(".".join(map(str, error["loc"][1:])) or msg("istek", "request") for error in exc.errors()[:5])
    return JSONResponse(status_code=422, content={"detail": msg(f"İstek alanları eksik veya geçersiz: {fields}. Dosya ve analiz ayarlarını kontrol edin.", f"Request fields are missing or invalid: {fields}. Check the files and analysis settings.")})


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok", "version": VERSION, "app": "outlab"}


@app.post("/api/inspect")
def inspect(request: InspectInput) -> dict[str, Any]:
    return inspect_sources([source.model_dump() for source in request.sources])


@app.post("/api/import")
def import_data(request: ImportInput) -> dict[str, Any]:
    return import_sources([source.model_dump() for source in request.sources], [mapping.model_dump() for mapping in request.mappings] if request.mappings is not None else None)


@app.post("/api/analyze")
def analyze(request: AnalyzeInput) -> dict[str, Any]:
    dataset = request.dataset
    channels = dataset.get("channels")
    if not isinstance(channels, list) or not all(isinstance(channel, dict) for channel in channels):
        raise DataError(msg("Proje sensör kanalları geçersiz; kaynak dosyalarını yeniden içe aktarın.", "The project's sensor channels are invalid; import the source files again."))
    for channel in channels:
        points = channel.get("points")
        if not isinstance(points, list) or not all(isinstance(point, dict) for point in points):
            raise DataError(msg("Proje sensör noktaları geçersiz; kaynak dosyalarını yeniden içe aktarın.", "The project's sensor points are invalid; import the source files again."))
    if not isinstance(dataset.get("sources", []), list) or not all(isinstance(item, dict) for item in dataset.get("sources", [])):
        raise DataError(msg("Proje kaynak kayıtları geçersiz.", "The project's source records are invalid."))
    options = request.options.model_dump() if request.options else None
    if options and options.get("quality") and options["quality"]["minUs"] >= options["quality"]["maxUs"]:
        raise DataError(msg("Kalite kuralı: en düşük EDA değeri en yüksek değerden küçük olmalı.", "Quality rule: the minimum EDA value must be below the maximum."))
    if options and options.get("quality") and options["quality"]["tempMin"] >= options["quality"]["tempMax"]:
        raise DataError(msg("Kalite kuralı: en düşük sıcaklık en yüksek sıcaklıktan küçük olmalı.", "Quality rule: the minimum temperature must be below the maximum."))
    return analyze_dataset(dataset, request.config.model_dump(), options)


@app.get("/{path:path}")
def frontend(path: str) -> FileResponse:
    if path == "api" or path.startswith("api/"):
        raise HTTPException(status_code=404, detail=msg("API yolu bulunamadı.", "API route not found."))
    if not DIST.exists():
        raise HTTPException(status_code=404, detail=msg("Arayüz derlemesi bulunamadı. Başlatıcıyı çalıştırın veya npm run build komutunu uygulayın.", "Frontend build not found. Run the launcher or run npm run build."))
    if any(part.startswith(".") for part in Path(path).parts):
        raise HTTPException(status_code=404, detail=msg("Dosya bulunamadı.", "File not found."))
    candidate = (DIST / path).resolve()
    try:
        candidate.relative_to(DIST.resolve())
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=msg("Dosya bulunamadı.", "File not found.")) from exc
    if candidate.is_file():
        return FileResponse(candidate)
    if Path(path).suffix:
        raise HTTPException(status_code=404, detail=msg("Dosya bulunamadı.", "File not found."))
    index = DIST / "index.html"
    if not index.is_file():
        raise HTTPException(status_code=404, detail=msg("Arayüz ana dosyası bulunamadı.", "Frontend index file not found."))
    return FileResponse(index)

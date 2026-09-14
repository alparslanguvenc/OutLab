"""Local-only RotaLab API and production frontend hosting."""
from __future__ import annotations

from pathlib import Path
from typing import Annotated, Any
from urllib.parse import urlsplit

from fastapi import FastAPI, HTTPException
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, ConfigDict, Field
from starlette.middleware.cors import CORSMiddleware
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from .analysis import analyze_dataset
from .ingestion import DataError, import_sources, inspect_sources

VERSION = "1.0.0"
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
        host = headers.get("host", "")
        try:
            hostname = urlsplit(f"http://{host}").hostname
        except ValueError:
            hostname = None
        if hostname not in {"localhost", "127.0.0.1", "::1"}:
            await JSONResponse({"detail": "Bu uygulama yalnızca localhost üzerinden kullanılabilir."}, status_code=400)(scope, receive, send)
            return
        origin = headers.get("origin")
        if origin is not None and origin not in ALLOWED_ORIGINS:
            await JSONResponse({"detail": "Bu kaynaktan yerel araştırma verisine erişim izinli değil. Uygulamayı localhost:8765 adresinden açın."}, status_code=403)(scope, receive, send)
            return
        if headers.get("content-encoding", "identity").lower() != "identity":
            await JSONResponse({"detail": "Sıkıştırılmış istek gövdesi desteklenmiyor."}, status_code=400)(scope, receive, send)
            return
        try:
            length = int(headers.get("content-length", "0"))
        except ValueError:
            length = -1
        if length < 0:
            await JSONResponse({"detail": "İstek uzunluğu geçersiz."}, status_code=400)(scope, receive, send)
            return
        if length > MAX_BODY_BYTES:
            await JSONResponse({"detail": "İstek 128 MB sınırını aşıyor. Kaydı ayrı oturumlara bölün; videoyu CSV alanına yüklemeyin."}, status_code=413)(scope, receive, send)
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
                await JSONResponse({"detail": "İstek 128 MB sınırını aşıyor; kaydı oturumlara bölün."}, status_code=413)(scope, receive, send)
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


class AnalyzeInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    dataset: dict[str, Any]
    config: ConfigInput


app = FastAPI(title="RotaLab · Yerel araştırma API", version=VERSION, docs_url="/api/docs", redoc_url=None, openapi_url="/api/openapi.json")
app.add_middleware(CORSMiddleware, allow_origins=sorted(ALLOWED_ORIGINS), allow_credentials=False, allow_methods=["GET", "POST"], allow_headers=["Content-Type"])
app.add_middleware(LocalBoundaryMiddleware)


@app.exception_handler(DataError)
async def data_error(_request: Any, exc: DataError) -> JSONResponse:
    return JSONResponse(status_code=400, content={"detail": str(exc)})


@app.exception_handler(RequestValidationError)
async def validation_error(_request: Any, exc: RequestValidationError) -> JSONResponse:
    fields = ", ".join(".".join(map(str, error["loc"][1:])) or "istek" for error in exc.errors()[:5])
    return JSONResponse(status_code=422, content={"detail": f"İstek alanları eksik veya geçersiz: {fields}. Dosya ve analiz ayarlarını kontrol edin."})


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok", "version": VERSION, "app": "rotalab"}


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
        raise DataError("Proje sensör kanalları geçersiz; kaynak dosyalarını yeniden içe aktarın.")
    for channel in channels:
        points = channel.get("points")
        if not isinstance(points, list) or not all(isinstance(point, dict) for point in points):
            raise DataError("Proje sensör noktaları geçersiz; kaynak dosyalarını yeniden içe aktarın.")
    if not isinstance(dataset.get("sources", []), list) or not all(isinstance(item, dict) for item in dataset.get("sources", [])):
        raise DataError("Proje kaynak kayıtları geçersiz.")
    return analyze_dataset(dataset, request.config.model_dump())


@app.get("/{path:path}")
def frontend(path: str) -> FileResponse:
    if path == "api" or path.startswith("api/"):
        raise HTTPException(status_code=404, detail="API yolu bulunamadı.")
    if not DIST.exists():
        raise HTTPException(status_code=404, detail="Arayüz derlemesi bulunamadı. Başlatıcıyı çalıştırın veya npm run build komutunu uygulayın.")
    if any(part.startswith(".") for part in Path(path).parts):
        raise HTTPException(status_code=404, detail="Dosya bulunamadı.")
    candidate = (DIST / path).resolve()
    try:
        candidate.relative_to(DIST.resolve())
    except ValueError as exc:
        raise HTTPException(status_code=404, detail="Dosya bulunamadı.") from exc
    if candidate.is_file():
        return FileResponse(candidate)
    if Path(path).suffix:
        raise HTTPException(status_code=404, detail="Dosya bulunamadı.")
    index = DIST / "index.html"
    if not index.is_file():
        raise HTTPException(status_code=404, detail="Arayüz ana dosyası bulunamadı.")
    return FileResponse(index)

"""FastAPI surface for the extractor: /inspect sniffs and previews, /normalize parses."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any, Literal
from urllib.request import urlopen

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from remi_extractor.classify import classify_artifact, decode_text, normalize_extension
from remi_extractor.documents import inspect_eml, inspect_pdf, normalize_eml, normalize_pdf, normalize_text, preview
from remi_extractor.tabular import inspect_xlsx, normalize_csv, normalize_xlsx

app = FastAPI(title="REMI Extractor", version="0.2.0")

NormalizableTarget = Literal["pdf", "eml", "xlsx", "csv", "text"]
FETCH_TIMEOUT_SECONDS = 30


class InspectArtifactRequest(BaseModel):
    artifact_blob_id: str
    content_type: str | None = None
    file_name: str
    immutable_url: str
    sha256: str
    size_bytes: int = Field(ge=0)


class InspectArtifactResponse(BaseModel):
    inspection: dict[str, Any]
    normalized_metadata: dict[str, Any]
    preview_text: str | None = None
    review_required: bool = False


class NormalizeArtifactRequest(BaseModel):
    artifact_blob_id: str
    content_type: str | None = None
    file_name: str
    immutable_url: str
    parser_target: NormalizableTarget


class NormalizeArtifactResponse(BaseModel):
    content_kind: Literal["document", "email", "workbook"]
    normalized_content: dict[str, Any]


def fetch_bytes(url: str) -> bytes:
    try:
        with urlopen(url, timeout=FETCH_TIMEOUT_SECONDS) as response:
            return response.read()
    except Exception as error:
        raise HTTPException(status_code=502, detail=f"Failed to fetch immutable artifact: {error}") from error


def inspect_payload(file_name: str, content_type: str | None, payload: bytes) -> dict[str, Any]:
    """Classify a payload and gather format metadata plus a short preview."""
    classification = classify_artifact(file_name, content_type, payload)
    format_metadata: dict[str, Any] = {}
    preview_text: str | None = None

    match classification.parser_target:
        case "pdf":
            format_metadata, preview_text = inspect_pdf(payload)
            if not format_metadata["nativeTextPresent"]:
                classification.support_tier = "best_effort"
        case "eml":
            format_metadata, preview_text = inspect_eml(payload)
        case "xlsx":
            format_metadata, preview_text = inspect_xlsx(payload)
        case "csv" | "text":
            text = decode_text(payload) or ""
            format_metadata = {"lineCount": len(text.splitlines()), "charCount": len(text)}
            preview_text = preview(text, limit=500)
        case _:
            pass

    return {
        "classification": classification,
        "format_metadata": format_metadata,
        "preview_text": preview_text,
    }


def normalize_payload(parser_target: NormalizableTarget, file_name: str, payload: bytes) -> dict[str, Any]:
    match parser_target:
        case "pdf":
            return normalize_pdf(payload)
        case "eml":
            return normalize_eml(payload)
        case "xlsx":
            return normalize_xlsx(payload, file_name)
        case "csv":
            return normalize_csv(decode_text(payload) or "", file_name)
        case "text":
            return normalize_text(decode_text(payload) or "")


@app.get("/health")
def health() -> dict[str, str]:
    return {"service": "remi-extractor", "status": "ok"}


@app.post("/inspect")
def inspect_artifact(request: InspectArtifactRequest) -> InspectArtifactResponse:
    payload = fetch_bytes(request.immutable_url)
    result = inspect_payload(request.file_name, request.content_type, payload)
    classification = result["classification"]
    extension = normalize_extension(request.file_name)

    inspection = {
        "artifactBlobId": request.artifact_blob_id,
        "detectedMimeType": classification.detected_mime_type,
        "fileClassification": classification.file_classification,
        "inspectionStatus": "completed" if classification.parser_eligible else "unsupported",
        "inspectedAt": datetime.now(UTC).isoformat(),
        "isContainer": classification.is_container,
        "nativeTextPresent": result["format_metadata"].get("nativeTextPresent"),
        "normalizedExtension": extension,
        "ocrNeededLater": result["format_metadata"].get("ocrNeededLater"),
        "parserEligible": classification.parser_eligible,
        "parserTarget": classification.parser_target,
        "sizeBytes": request.size_bytes,
        "sourceContentType": request.content_type,
        "supportTier": classification.support_tier,
        "warnings": classification.warnings,
    }
    normalized_metadata = {
        "artifactBlobId": request.artifact_blob_id,
        "detectedMimeType": classification.detected_mime_type,
        "fileName": request.file_name,
        "formatMetadata": result["format_metadata"],
        "parserTarget": classification.parser_target,
        "sha256": request.sha256,
        "supportTier": classification.support_tier,
    }

    return InspectArtifactResponse(
        inspection=inspection,
        normalized_metadata=normalized_metadata,
        preview_text=result["preview_text"],
        review_required=bool(classification.warnings),
    )


@app.post("/normalize")
def normalize_artifact(request: NormalizeArtifactRequest) -> NormalizeArtifactResponse:
    payload = fetch_bytes(request.immutable_url)
    normalized = normalize_payload(request.parser_target, request.file_name, payload)
    return NormalizeArtifactResponse(content_kind=normalized["kind"], normalized_content=normalized)

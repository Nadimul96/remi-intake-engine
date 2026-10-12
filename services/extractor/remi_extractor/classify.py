"""Content-first type sniffing.

The extension is only a hint: a PDF renamed to .txt is still a PDF, and a plain
text file saved as .docx is still text. Every decision records why it was made
so the inspection report can explain itself.
"""

from __future__ import annotations

import csv
import io
import mimetypes
import zipfile
from dataclasses import dataclass, field
from typing import Literal

ParserTarget = Literal["pdf", "eml", "xlsx", "csv", "text", "archive", "none"]
SupportTier = Literal["supported", "best_effort", "deferred", "unsupported"]

SPREADSHEET_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
TEXT_SAMPLE_BYTES = 64 * 1024
EMAIL_HEADER_NAMES = ("from:", "to:", "subject:", "date:", "message-id:", "mime-version:")


@dataclass
class Classification:
    file_classification: str
    parser_target: ParserTarget
    support_tier: SupportTier
    is_container: bool
    detected_mime_type: str | None
    warnings: list[str] = field(default_factory=list)

    @property
    def parser_eligible(self) -> bool:
        return self.support_tier in {"supported", "best_effort"}


def normalize_extension(file_name: str) -> str | None:
    stem, dot, suffix = file_name.rpartition(".")
    if not dot or not stem:
        return None
    return suffix.lower()


def decode_text(payload: bytes) -> str | None:
    """Return the payload as text if it looks like a text file, otherwise None."""
    sample = payload[:TEXT_SAMPLE_BYTES]
    if b"\x00" in sample:
        return None
    for encoding in ("utf-8-sig", "cp1252"):
        try:
            return payload.decode(encoding)
        except UnicodeDecodeError:
            continue
    return None


def looks_like_email(text: str) -> bool:
    head = [line.strip().lower() for line in text.splitlines()[:20] if line.strip()]
    header_hits = sum(1 for line in head if line.startswith(EMAIL_HEADER_NAMES))
    return header_hits >= 3 and any(line.startswith("mime-version:") or line.startswith("message-id:") for line in head)


def looks_like_csv(text: str) -> bool:
    lines = [line for line in text.splitlines()[:30] if line.strip()]
    if len(lines) < 2:
        return False
    try:
        dialect = csv.Sniffer().sniff("\n".join(lines[:10]), delimiters=",\t")
    except csv.Error:
        return False
    widths = [len(row) for row in csv.reader(io.StringIO("\n".join(lines[:10])), dialect)]
    return widths[0] >= 2 and widths.count(widths[0]) >= max(2, len(widths) // 2)


def is_xlsx_container(payload: bytes) -> bool:
    try:
        with zipfile.ZipFile(io.BytesIO(payload)) as archive:
            return "xl/workbook.xml" in archive.namelist()
    except zipfile.BadZipFile:
        return False


def classify_artifact(file_name: str, provided_mime: str | None, payload: bytes) -> Classification:
    extension = normalize_extension(file_name)
    guessed_mime = provided_mime if provided_mime and provided_mime != "application/octet-stream" else None
    guessed_mime = guessed_mime or mimetypes.guess_type(file_name)[0]

    if payload.startswith(b"%PDF-"):
        return _with_mismatch(
            Classification("pdf", "pdf", "supported", False, "application/pdf"), extension, expected={"pdf"}
        )

    if zipfile.is_zipfile(io.BytesIO(payload)):
        if is_xlsx_container(payload):
            return _with_mismatch(
                Classification("spreadsheet", "xlsx", "supported", True, SPREADSHEET_MIME), extension, {"xlsx"}
            )
        return Classification("archive", "archive", "deferred", True, guessed_mime or "application/zip")

    text = decode_text(payload)
    if text is not None:
        if extension == "eml" or looks_like_email(text):
            return Classification("email", "eml", "supported", False, "message/rfc822")
        if extension in {"csv", "tsv"} or looks_like_csv(text):
            return _with_mismatch(
                Classification("spreadsheet", "csv", "supported", False, "text/csv"), extension, {"csv", "tsv"}
            )
        return _with_mismatch(
            Classification("document", "text", "supported", False, "text/plain"),
            extension,
            expected={"txt", "text", "md", None},
        )

    return Classification("unknown", "none", "unsupported", False, guessed_mime)


def _with_mismatch(result: Classification, extension: str | None, expected: set[str | None]) -> Classification:
    if extension not in expected:
        result.warnings.append(
            f"extension_mismatch: file is named .{extension} but its content is {result.parser_target}"
            if extension
            else f"extension_missing: content sniffed as {result.parser_target}"
        )
    return result

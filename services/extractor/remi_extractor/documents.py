"""PDF, plain-text and RFC 822 email normalization."""

from __future__ import annotations

import base64
import hashlib
import io
from datetime import UTC
from email import policy
from email.message import EmailMessage
from email.parser import BytesParser
from email.utils import getaddresses, parsedate_to_datetime
from typing import Any

from pypdf import PdfReader

PREVIEW_CHARS = 1200
MAX_PAGE_CHARS = 20_000


def preview(text: str | None, limit: int = PREVIEW_CHARS) -> str | None:
    """Collapse whitespace for a one-line preview."""
    if not text:
        return None
    cleaned = " ".join(text.split())
    return cleaned[:limit] or None


def clean_page_text(text: str | None) -> str | None:
    """Keep line structure (it carries table layout) but drop trailing noise."""
    if not text:
        return None
    lines = [line.rstrip() for line in text.replace("\r\n", "\n").replace("\r", "\n").split("\n")]
    cleaned = "\n".join(lines).strip("\n")
    return cleaned[:MAX_PAGE_CHARS] or None


def page_entry(page_number: int, text: str | None, source: str) -> dict[str, Any]:
    page_text = clean_page_text(text)
    return {
        "pageNumber": page_number,
        "textAvailable": bool(page_text),
        "charCount": len(page_text or ""),
        "text": page_text,
        "textPreview": preview(page_text),
        "metadata": {"previewSource": source if page_text else "none"},
    }


def inspect_pdf(payload: bytes) -> tuple[dict[str, Any], str | None]:
    reader = PdfReader(io.BytesIO(payload))
    sample = preview(" ".join(page.extract_text() or "" for page in reader.pages[:3]), limit=500)
    has_text = bool(sample)
    return (
        {
            "pageCount": len(reader.pages),
            "nativeTextPresent": has_text,
            "ocrNeededLater": not has_text,
            "previewSource": "native_text" if has_text else "none",
        },
        sample,
    )


def normalize_pdf(payload: bytes) -> dict[str, Any]:
    reader = PdfReader(io.BytesIO(payload))
    metadata = reader.metadata
    pages = [page_entry(index, page.extract_text(), "native_text") for index, page in enumerate(reader.pages, start=1)]
    return document_payload(
        title=metadata.title if metadata else None,
        pages=pages,
        metadata={
            "source": "pdf",
            "author": metadata.author if metadata else None,
            "producer": metadata.producer if metadata else None,
            "subject": metadata.subject if metadata else None,
        },
    )


def normalize_text(text: str) -> dict[str, Any]:
    """Plain text becomes a document; form feeds, when present, separate pages."""
    chunks = text.split("\f") if "\f" in text else [text]
    pages = [page_entry(index, chunk, "plain_text") for index, chunk in enumerate(chunks, start=1)]
    first_line = next((line.strip() for line in text.splitlines() if line.strip()), None)
    return document_payload(title=first_line[:200] if first_line else None, pages=pages, metadata={"source": "text"})


def document_payload(title: str | None, pages: list[dict[str, Any]], metadata: dict[str, Any]) -> dict[str, Any]:
    return {
        "kind": "document",
        "document": {
            "title": title,
            "pageCount": len(pages),
            "textAvailable": any(page["textAvailable"] for page in pages),
            "textPreview": preview(" ".join(page["text"] or "" for page in pages)),
            "metadata": metadata,
            "pages": pages,
        },
    }


def parse_email(payload: bytes) -> EmailMessage:
    message = BytesParser(policy=policy.default).parsebytes(payload)
    assert isinstance(message, EmailMessage)
    return message


def email_body_preview(message: EmailMessage) -> str | None:
    body = message.get_body(preferencelist=("plain",))
    if body is None:
        return None
    return preview(body.get_content())


def inspect_eml(payload: bytes) -> tuple[dict[str, Any], str | None]:
    message = parse_email(payload)
    attachment_count = sum(1 for part in message.walk() if part.get_content_disposition() == "attachment")
    return (
        {
            "subject": message.get("subject"),
            "from": message.get("from"),
            "to": message.get("to"),
            "cc": message.get("cc"),
            "sentDate": message.get("date"),
            "attachmentCount": attachment_count,
        },
        email_body_preview(message),
    )


def thread_key(message: EmailMessage) -> str:
    for header in ("references", "in-reply-to", "message-id"):
        value = message.get(header)
        if value:
            tokens = [token for token in value.replace(",", " ").split() if token.startswith("<")]
            return tokens[0] if tokens else value.strip()
    subject = preview(message.get("subject"), limit=120) or "untitled"
    return f"subject:{subject.lower()}"


def sent_at(header_value: str | None) -> tuple[str | None, str | None]:
    if not header_value:
        return None, None
    try:
        parsed = parsedate_to_datetime(header_value)
    except (TypeError, ValueError):
        return None, header_value
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=UTC)
    return parsed.astimezone(UTC).isoformat(), header_value


def addresses(header_value: str | None) -> list[str]:
    return [address for _, address in getaddresses([header_value])] if header_value else []


def normalize_eml(payload: bytes) -> dict[str, Any]:
    message = parse_email(payload)
    sent_iso, sent_raw = sent_at(message.get("date"))
    attachments: list[dict[str, Any]] = []

    for part in message.walk():
        filename = part.get_filename()
        disposition = part.get_content_disposition()
        if disposition != "attachment" and not filename:
            continue
        content = part.get_payload(decode=True) or b""
        assert isinstance(content, bytes)
        attachments.append(
            {
                "messagePosition": 0,
                "partIndex": len(attachments),
                "fileName": filename,
                "contentType": part.get_content_type(),
                "sizeBytes": len(content),
                "contentBase64": base64.b64encode(content).decode("ascii"),
                "contentDisposition": disposition,
                "contentId": part.get("content-id"),
                "sha256": hashlib.sha256(content).hexdigest() if content else None,
                "metadata": {"contentTransferEncoding": part.get("content-transfer-encoding")},
            }
        )

    subject = message.get("subject")
    return {
        "kind": "email",
        "email": {
            "thread": {
                "threadKey": thread_key(message),
                "subject": subject,
                "messageCount": 1,
                "metadata": {"hasMultipartBody": message.is_multipart(), "references": message.get("references")},
            },
            "messages": [
                {
                    "position": 0,
                    "messageIdHeader": message.get("message-id"),
                    "subject": subject,
                    "sender": message.get("from"),
                    "to": addresses(message.get("to")),
                    "cc": addresses(message.get("cc")),
                    "sentAt": sent_iso,
                    "sentAtRaw": sent_raw,
                    "bodyPreview": email_body_preview(message),
                    "attachmentCount": len(attachments),
                    "metadata": {"replyTo": message.get("reply-to")},
                }
            ],
            "attachments": attachments,
        },
    }

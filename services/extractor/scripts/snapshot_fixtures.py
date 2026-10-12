"""Normalize the demo fixture set and write one JSON snapshot per file.

The TypeScript extraction tests run against these snapshots, so they exercise the
real extractor output without needing Python at test time. `tests/test_snapshots.py`
fails if the extractor's output drifts from what is committed.

    uv run python scripts/snapshot_fixtures.py
"""

from __future__ import annotations

import hashlib
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from remi_extractor.app import inspect_payload, normalize_payload

REPO_ROOT = Path(__file__).resolve().parents[3]
MANIFEST = REPO_ROOT / "fixtures" / "demo-set.json"
SNAPSHOT_DIR = REPO_ROOT / "packages" / "extraction" / "test" / "snapshots"


def snapshot_name(relative_path: str) -> str:
    return re.sub(r"[^A-Za-z0-9]+", "-", Path(relative_path).name).strip("-").lower() + ".json"


def build_snapshot(path: Path) -> dict:
    payload = path.read_bytes()
    classification = inspect_payload(path.name, None, payload)["classification"]
    return {
        "fileName": path.name,
        "sha256": hashlib.sha256(payload).hexdigest(),
        "parserTarget": classification.parser_target,
        "normalized": normalize_payload(classification.parser_target, path.name, payload),
    }


def render(snapshot: dict) -> str:
    return json.dumps(snapshot, indent=1, ensure_ascii=False, sort_keys=True) + "\n"


def main() -> None:
    manifest = json.loads(MANIFEST.read_text())
    root = REPO_ROOT / manifest["root"]
    SNAPSHOT_DIR.mkdir(parents=True, exist_ok=True)
    for relative in manifest["files"]:
        target = SNAPSHOT_DIR / snapshot_name(relative)
        target.write_text(render(build_snapshot(root / relative)))
        print(f"wrote {target.relative_to(REPO_ROOT)}")


if __name__ == "__main__":
    main()

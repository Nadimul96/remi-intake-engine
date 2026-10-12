"""Contract test: committed snapshots must match what the extractor produces today.

Regenerate with `uv run python scripts/snapshot_fixtures.py` after an intended change.
"""

import importlib.util
import json
from pathlib import Path

import pytest

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "snapshot_fixtures.py"
spec = importlib.util.spec_from_file_location("snapshot_fixtures", SCRIPT)
assert spec and spec.loader
snapshots = importlib.util.module_from_spec(spec)
spec.loader.exec_module(snapshots)

MANIFEST = json.loads(snapshots.MANIFEST.read_text())


@pytest.mark.parametrize("relative_path", MANIFEST["files"])
def test_snapshot_is_current(relative_path):
    committed = (snapshots.SNAPSHOT_DIR / snapshots.snapshot_name(relative_path)).read_text()
    fresh = snapshots.render(snapshots.build_snapshot(snapshots.REPO_ROOT / MANIFEST["root"] / relative_path))
    assert committed == fresh, f"snapshot drifted for {relative_path}; regenerate with scripts/snapshot_fixtures.py"

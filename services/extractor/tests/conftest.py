from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[3]
SYNTHETIC = REPO_ROOT / "fixtures" / "synthetic-capital"
SAMPLES = REPO_ROOT / "tests" / "fixtures" / "normalization"


@pytest.fixture
def synthetic() -> Path:
    return SYNTHETIC


@pytest.fixture
def samples() -> Path:
    return SAMPLES

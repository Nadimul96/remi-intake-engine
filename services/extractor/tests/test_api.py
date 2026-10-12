from fastapi.testclient import TestClient

from remi_extractor.app import app

client = TestClient(app)
T12 = "Fund I - Synthetic Value Fund I/Parkside_at_Meridian/acquisition/T12_Parkside_2015_SellerVersion.csv"


def test_health():
    assert client.get("/health").json() == {"service": "remi-extractor", "status": "ok"}


def test_inspect_then_normalize_over_http(synthetic):
    path = synthetic / T12
    body = {"artifact_blob_id": "blob_1", "file_name": path.name, "immutable_url": path.as_uri()}

    inspection = client.post("/inspect", json={**body, "sha256": "x", "size_bytes": path.stat().st_size}).json()
    assert inspection["inspection"]["parserTarget"] == "csv"
    assert inspection["inspection"]["parserEligible"] is True

    normalized = client.post("/normalize", json={**body, "parser_target": "csv"}).json()
    assert normalized["content_kind"] == "workbook"
    assert normalized["normalized_content"]["workbook"]["worksheets"][0]["rows"][0]["cells"][0]["text"] == "Line Item"


def test_unreachable_source_is_a_bad_gateway():
    body = {"artifact_blob_id": "b", "file_name": "x.csv", "immutable_url": "file:///nonexistent/x.csv"}
    response = client.post("/normalize", json={**body, "parser_target": "csv"})
    assert response.status_code == 502

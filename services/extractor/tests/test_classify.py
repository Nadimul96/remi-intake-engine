import pytest

from remi_extractor.classify import classify_artifact

FUND_I = "Fund I - Synthetic Value Fund I/Parkside_at_Meridian"
FUND_II = "Fund II - Synthetic Value Fund II"


@pytest.mark.parametrize(
    ("relative_path", "target", "tier"),
    [
        (f"{FUND_I}/disposition/BOV_Parkside_Meridian_2020.pdf", "pdf", "supported"),
        (f"{FUND_I}/acquisition/T12_Parkside_2015_SellerVersion.csv", "csv", "supported"),
        (f"{FUND_I}/asset_management/PM_Report_Parkside_Q3_2017.txt", "text", "supported"),
        (f"{FUND_II}/Oakwood_Commons/acquisition/UW_OakwoodCommons_v2_PN_112020.xlsx", "xlsx", "supported"),
    ],
)
def test_classifies_fixture_types(synthetic, relative_path, target, tier):
    path = synthetic / relative_path
    result = classify_artifact(path.name, None, path.read_bytes())
    assert (result.parser_target, result.support_tier) == (target, tier)
    assert result.warnings == []


def test_content_wins_over_a_misleading_extension(synthetic):
    path = synthetic / FUND_II / "Investment_Memo_FINAL.docx"
    result = classify_artifact(path.name, None, path.read_bytes())
    assert result.parser_target == "text"
    assert result.warnings == ["extension_mismatch: file is named .docx but its content is text"]


def test_pdf_bytes_are_detected_even_when_named_txt(synthetic):
    payload = (synthetic / f"{FUND_I}/disposition/PSA_Parkside_Execute_2020.pdf").read_bytes()
    result = classify_artifact("renamed.txt", "text/plain", payload)
    assert result.parser_target == "pdf"
    assert "extension_mismatch" in result.warnings[0]


def test_rfc822_email_is_detected(samples):
    path = samples / "email" / "sample-broker.eml"
    assert classify_artifact(path.name, None, path.read_bytes()).parser_target == "eml"


def test_non_spreadsheet_zip_is_deferred(samples):
    path = samples / "deferred" / "deferred-bundle.zip"
    result = classify_artifact(path.name, None, path.read_bytes())
    assert (result.parser_target, result.support_tier) == ("archive", "deferred")


def test_binary_noise_is_unsupported():
    result = classify_artifact("blob.bin", None, bytes(range(256)) * 4)
    assert (result.parser_target, result.support_tier) == ("none", "unsupported")
    assert not result.parser_eligible

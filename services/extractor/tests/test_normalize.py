from remi_extractor.app import normalize_payload
from remi_extractor.tabular import cell_text

FUND_I = "Fund I - Synthetic Value Fund I/Parkside_at_Meridian"
UW_DIR = "Fund II - Synthetic Value Fund II/Oakwood_Commons/acquisition"


def cells_by_ref(worksheet):
    return {cell["ref"]: cell["text"] for row in worksheet["rows"] for cell in row["cells"]}


def test_csv_rows_keep_spreadsheet_cell_references(synthetic):
    path = synthetic / FUND_I / "acquisition" / "T12_Parkside_2015_REKEYED_Jordan.csv"
    worksheet = normalize_payload("csv", path.name, path.read_bytes())["workbook"]["worksheets"][0]
    cells = cells_by_ref(worksheet)
    assert cells["A20"] == "Landscaping/Grounds"
    assert cells["N20"] == "-$43,200"
    assert worksheet["name"] == "T12_Parkside_2015_REKEYED_Jordan"


def test_xlsx_values_are_read_with_their_cell_address(synthetic):
    path = synthetic / UW_DIR / "UW_OakwoodCommons_v2_PN_112020.xlsx"
    workbook = normalize_payload("xlsx", path.name, path.read_bytes())["workbook"]
    summary = next(sheet for sheet in workbook["worksheets"] if sheet["name"] == "Summary")
    cells = cells_by_ref(summary)
    assert (cells["A6"], cells["B6"]) == ("Purchase Price", "$41,200,000")
    assert (cells["A7"], cells["B7"]) == ("Entry Cap Rate", "5.6%")


def test_formula_workbooks_report_missing_cached_values(synthetic):
    path = synthetic / UW_DIR / "UW_OakwoodCommons_v2_PN_112020_FORMULA.xlsx"
    workbook = normalize_payload("xlsx", path.name, path.read_bytes())["workbook"]
    assert sum(sheet["metadata"]["formulaCellsWithoutCachedValues"] for sheet in workbook["worksheets"]) > 0


def test_text_documents_keep_line_structure(synthetic):
    path = synthetic / FUND_I / "asset_management" / "PM_Report_Parkside_Q3_2017.txt"
    document = normalize_payload("text", path.name, path.read_bytes())["document"]
    lines = document["pages"][0]["text"].split("\n")
    assert document["title"] == "Parkside at Meridian — Property Management Report"
    assert any(line.startswith("Physical Occupancy: 94.1%") for line in lines)


def test_pdf_pages_carry_full_native_text(synthetic):
    path = synthetic / FUND_I / "disposition" / "BOV_Parkside_Meridian_2020.pdf"
    document = normalize_payload("pdf", path.name, path.read_bytes())["document"]
    assert document["pageCount"] >= 1
    assert document["pages"][0]["textAvailable"]
    assert "\n" in document["pages"][0]["text"]


def test_email_attachments_are_hashed(samples):
    path = samples / "email" / "sample-broker-xlsx.eml"
    email = normalize_payload("eml", path.name, path.read_bytes())["email"]
    assert email["messages"][0]["subject"]
    assert email["attachments"][0]["sha256"]


def test_cell_text_renders_numbers_like_a_spreadsheet():
    assert cell_text(41200000.0) == "41200000"
    assert cell_text(0.056) == "0.056"
    assert cell_text("  ") is None
    assert cell_text(True) == "TRUE"


def test_pasted_email_threads_take_their_subject_as_title(synthetic):
    path = synthetic / "emails" / "Thread_03_DSCR_Breach_Alert.txt"
    document = normalize_payload("text", path.name, path.read_bytes())["document"]
    assert document["title"] == "URGENT — Oakwood Commons DSCR Covenant Breach"


def test_csv_notes_below_the_table_stay_whole(synthetic):
    path = synthetic / UW_DIR / "T12_Oakwood_2020_Priya_Normalized.csv"
    worksheet = normalize_payload("csv", path.name, path.read_bytes())["workbook"]["worksheets"][0]
    assert cells_by_ref(worksheet)["A29"] == "NORMALIZED NOI: $597,400"

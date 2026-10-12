# Synthetic Capital Partners — evaluation dataset

A fully synthetic document set for a fictional value-add multifamily investor,
**Synthetic Capital Partners (SCP)**. It exists to exercise the intake engine
end to end: messy file naming, duplicate and misfiled documents, multiple
versions of the same underwriting model, entity-name variants across emails and
reports, and a handful of deliberately planted numeric conflicts with a known
answer key.

Everything here is invented. Firms, people, properties, addresses, lenders and
brokers are fictional; phone numbers use the 555 exchange; email addresses use
`@syntheticcapital.com` and other made-up domains. No real deal data was used.

## Layout

```
fixtures/synthetic-capital/
├── Fund I - Synthetic Value Fund I/        realized fund (2015–2022)
│   ├── LP_Report_FundI_Q3_2020.pdf
│   └── Parkside_at_Meridian/               148 units, San Antonio TX
│       ├── acquisition/                     OM, pre-close rent roll, two T-12s
│       ├── asset_management/                PM report, rent roll, site-visit notes
│       └── disposition/                     BOV, PSA, closing statement (PDF)
├── Fund II - Synthetic Value Fund II/      active fund (2020–)
│   ├── Investment_Memo_FINAL.docx
│   ├── Q3_RentRoll.xlsx                     unlabeled workbook dropped at fund root
│   └── Oakwood_Commons/                    232 units, Houston TX
│       ├── acquisition/                     OM (PDF + txt), rent roll, T-12s,
│       │                                    three UW model versions (+ formula variants)
│       └── asset_management/                quarterly rent rolls, PM reports,
│                                            budget variance, debt summary
├── emails/                                  7 plain-text threads (~34 messages)
├── ground_truth/
│   ├── GroundTruth_MASTER.md                answer key: metrics, people, conflicts
│   └── ModelValidation_MASTER.md            worked arithmetic behind the key
└── market_research/
    └── Zillow_Houston_Rent_Index_Sample.csv 13-row illustrative series
```

73 files, about 750 KB. File types: `.txt`, `.csv`, `.xlsx` (the `_FORMULA` variants carry live
formulas; the others are values-only), `.pdf`, and one mislabeled `.docx`.

## People

| Name | Role | Shows up as |
|------|------|-------------|
| Nadi | Managing Partner | `mp@syntheticcapital.com`, signs IC memos |
| Sarah Chen | Partner / CFO | financial reporting threads |
| Priya Nair | Senior Associate | author of UW v1 and v2 (`_PN_`) |
| Alex Donovan | Senior Associate | author of UW v3 (`_AD_`), aggressive assumptions |
| Jordan Ellis | Analyst | rekeyed T-12 (`_REKEYED_Jordan`), misfiled exports |
| Diane Foster | Asset Manager | site visits (`_DF`), DSCR breach alert |
| Chris Nguyen | Controller | fund accounting |

External organizations: Greenfield (property manager, Oakwood), First Western
Capital (lender, Oakwood), Marcus Realty (listing broker, Oakwood), Westbrook
Capital Markets (listing broker, Parkside).

## Entity-name variants

The same two assets are referred to inconsistently across documents. An entity
reconciliation layer should collapse these onto one canonical record each.

| Canonical asset | Variants found in the corpus |
|-----------------|-----------------------------|
| Parkside at Meridian | `Parkside` (file names, the BOV) |
| Oakwood Commons | `Oakwood Commons at Westchase`, `OC Houston`, `the Houston deal` (all in `Investment_Memo_FINAL.docx`), `Westchase Multifamily` with `Alternate Name: Oakwood Commons` (`Q3_RentRoll.xlsx`), `Oakwood` (file names, email subjects) |

An earlier version of this table also listed `ParkSide Meridian` and `Meridian Park`; those
strings appear only in `ground_truth/GroundTruth_MASTER.md`, not in any source document.

Organizations vary too: the lender is "First Western Capital Partners" in
`DebtSummary_Oakwood_FirstWestern.txt`, "First Western Capital" in the ground
truth, and just "First Western" in the IC memo and email threads.

## Designed conflicts (evaluation rubric)

Seven conflicts were planted on purpose. For each, the rubric is: does the
system surface both values with provenance, and does a reviewer have enough
context to pick the right one?

| ID | Conflict | Where | Ground truth / expected resolution |
|----|----------|-------|------------------------------------|
| C1 | Parkside T-12 rekey error: landscaping `$43,200` vs `$34,200` | `T12_Parkside_2015_REKEYED_Jordan.csv` vs `T12_Parkside_2015_SellerVersion.csv` | `$34,200`. The seller version is the source; Jordan transposed digits. NOI differs by `$9,000`. |
| C2 | Parkside Q3 2017 occupancy `95.3%` vs `94.1%` | `RentRoll_Parkside_Q3_2017.csv` vs `PM_Report_Parkside_Q3_2017.txt` | Two-unit timing difference (141 vs 139 of 148). `SiteVisit_Parkside_2018_DF.txt` mentions unit 214 offline. Either is defensible; the system should flag, not silently pick. |
| C3 | Asset-name variants | emails, IC memos, PM reports | See table above. `OC Houston` and `Oakwood Commons at Westchase` are the same property. |
| C4 | Three Oakwood underwriting versions with different assumptions | `UW_OakwoodCommons_v1_PN_092020.xlsx`, `..._v2_PN_112020.xlsx`, `..._v3_AD_112020.xlsx` (+ renamed duplicates) | **v2 (Priya) is the approved model**: 5.6% entry cap, $41.2M price. `IC_Memo_Oakwood_Commons_FINAL.txt` and `Thread_06_Oakwood_IC_Expense_Debate.txt` explain why. v1 was superseded; v3 became the upside case. |
| C5 | Oakwood NOI: seller T-12 vs normalized | `T12_Oakwood_2020_SellersVersion.csv` vs `T12_Oakwood_2020_Priya_Normalized.csv` | Use the normalized figure (`$597,400` vs the seller's `$580,800`). The emails and IC memo attribute the gap to a one-time `$180K` insurance reimbursement; the normalized CSV's own notes list an `$8,400` reimbursement instead, one more inconsistency for a reviewer. |
| C6 | Q2 2023 budget variance: water/sewer 34% over | `BudgetVariance_Oakwood_Q2_2023.csv` | One-time event (main-line break in Building C, `$12,400` repair + `$4,920` leak spike). Not a run-rate change. |
| C7 | DSCR covenant breach `1.21x` vs `1.25x` minimum | `DebtSummary_Oakwood_FirstWestern.txt`, `Thread_03_DSCR_Breach_Alert.txt` | Real breach: NOI `$1,142K` / debt service `$943.5K`. Flagged Q2 2023, remediation plan submitted. |

Note: the two ground-truth documents disagree on the levered IRR of the three
UW versions (`GroundTruth_MASTER.md` says 16.8 / 17.2 / 14.1%;
`ModelValidation_MASTER.md` says 15.8 / 16.4 / 18.2%). Price and entry cap
agree in both and are what the C4 rubric relies on. Treat the IRR columns as
one more inconsistency to detect rather than as a verified figure.

## Intentional naming chaos

These are not mistakes in the fixture set. They reproduce what a shared drive
looks like after a few years, and are kept so that deduplication and
"which file is current" logic has something to chew on.

| Fixture | What it tests |
|---------|---------------|
| `RentRoll_Oakwood_Q3_ACTUAL (1).csv`, `RentRoll_Oakwood_Q3_ACTUAL - Copy.csv` | byte-identical copies of `RentRoll_Oakwood_Q3_2023.csv` (content-hash dedupe) |
| `UW_Oakwood_v2_PN_USE THIS ONE_FINAL.xlsx`, `emails/UW_HoustonDeal_v2_FINAL_ANALYSIS.xlsx` | byte-identical copies of the approved v2 model under different names and locations |
| `UW_Oakwood_v1_PN_old_DONT_USE.xlsx`, `UW_Oakwood_v3_AD_REAL_FINAL_v2.xlsx` | identical copies of v1 and v3 with misleading names |
| `IC_Memo_Oakwood_APPROVED - FINAL - USE THIS.txt` | identical to `IC_Memo_Oakwood_Commons_FINAL.txt` |
| `RentRoll_Oakwood_Q1_2020_BACKUP.csv` | identical to `RentRoll_Oakwood_Q1_2021.csv` but named with the wrong year |
| `Fund I/.../acquisition/RentRoll_Oakwood_Preclose_Jan2021.csv` | Oakwood file misfiled under Parkside |
| `Fund II/.../asset_management/T12_Parkside_2015_SellerVersion.csv` | Parkside file misfiled under Oakwood |
| `UW_OakwoodCommons_v1_BROKEN_CircularRef.xlsx` | workbook whose name says "broken"; it is a values-only export with no formulas, so the "circular reference" cannot be confirmed from the file itself |
| `Budget_2023_BROKEN_Mismatched.xlsx` | single-sheet budget workbook whose name claims a mismatch; nothing in the file says what is mismatched |
| `Investment_Memo_FINAL.docx` | plain ASCII text saved with a `.docx` extension (content sniffing vs. extension) |
| `UW_Oakwood_v2_LEGACY_XLS_EXPORT.txt` | text export of a legacy `.xls` with formulas lost |
| `PM_Report_Oakwood_SCANNED_OCR_TEST.pdf` | PDF labeled as a scan; it actually carries a short text layer (about 250 characters) and no images |
| `Q3_RentRoll.xlsx`, `emails/Analysis_092020.xlsx` | unlabeled workbooks with no fund/property in the name |
| `*_FORMULA.xlsx` variants | same model saved with live formulas vs. values only |
| Missing Q2 2022 and Q4 2022 Oakwood rent rolls | gap detection in a quarterly series |

## Provenance and sanitization

Generated for this project. Before publishing, the listing broker on the
Parkside offering memorandum and BOV was renamed to the fictional "Westbrook
Capital Markets", the managing partner's address was changed to
`mp@syntheticcapital.com`, an internal path in `Thread_04_Where_Is_File.txt`
was replaced with a fictional file-server path, and an `OLD/` scratch folder
plus a generation status report were removed.

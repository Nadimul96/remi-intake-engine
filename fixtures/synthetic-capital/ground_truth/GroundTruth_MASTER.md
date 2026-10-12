# Synthetic Capital Partners — Ground Truth Master

## Firm Overview
**Name:** Synthetic Capital Partners (SCP)
**Managing Partner:** Nadi (mp@syntheticcapital.com)
**Strategy:** Value-add multifamily, Sun Belt focus
**HQ:** Dallas, TX

## Fund I — Synthetic Value Fund I (Wisdom Fund)
**Vintage:** 2015
**Status:** Fully realized (2015-2022)
**Equity:** $28M

### Parkside at Meridian (San Antonio, TX)
**Type:** Multifamily
**Units:** 148
**Acquired:** Jan 2016
**Sold:** Aug 2020
**Acq. Price:** $10.2M ($68,919/unit)
**Sale Price:** $15.8M ($106,757/unit)

**Key Metrics (Ground Truth):**
- Entry Cap Rate: 6.0% (actual approved)
- Exit Cap Rate: 5.4%
- Hold Period: 4.5 years
- Levered IRR: 18.9%
- Equity Multiple: 2.1x
- NOI at Acquisition: $612,000
- NOI at Sale: $853,200

**Designed Conflicts:**
1. C1: T12 rekey error - landscaping $43,200 vs $34,200 (Jordan typo)
2. C2: Occupancy discrepancy - Q3 2017 rent roll 95.3% vs PM report 94.1%
3. C3: Name variants - "Parkside at Meridian" / "ParkSide Meridian" / "Meridian Park"

**Actual vs. Underwritten:**
- UW Entry Cap: 6.0%
- UW Exit Cap: 6.6%
- Actual Exit Cap: 5.4% (market compressed)
- UW Rent Growth: 3.0%/yr
- Actual Rent Growth: 4.2%/yr (San Antonio outperformed)
- UW IRR: 17.4% → 18.9% (actual)

---

## Fund II — Synthetic Value Fund II (Current Fund)
**Vintage:** 2020
**Status:** Active
**Equity:** $52M

### Oakwood Commons (Houston, TX)
**Type:** Multifamily
**Units:** 232
**Acquired:** Feb 2021
**Status:** Hold
**Acq. Price:** $18.4M ($79,310/unit)

**Key Metrics (Ground Truth):**
- Entry Cap Rate: 5.6% (Priya v2 approved)
- Current Occupancy: 91.2% (target: 94.5%)
- DSCR (Q2 2023): 1.21x (covenant breach < 1.25x)
- Lender: First Western Capital
- Loan Amount: $13.8M (75% LTV)
- Interest Rate: 4.25% (fixed, 5yr IO)

**Underwriting Models:**
| Version | Author | Entry Cap | Price | IRR | Status |
|---------|--------|-----------|-------|-----|--------|
| v1 | Priya | 5.8% | $41.5M | 16.8% | Superseded |
| v2 | Priya | 5.6% | $41.2M | 17.2% | **APPROVED** |
| v3 | Alex | 6.0% | $41.2M | 14.1% | Alternative |

**Key Changes v1 → v2:**
- Expense assumption reduced by $180K (Priya's revision after market tour)
- Rent growth adjusted from 3.5% to 3.0%
- NOI normalized from seller T12

**Designed Conflicts:**
1. C3: Entity name variants - "Oakwood Commons" / "OC" / "Oakwood Commons at Westchase" / "the Houston deal"
2. C4: Model version conflict - 3 UW versions with different assumptions
3. C5: NOI normalization - Seller T12 vs Priya normalized ($180K difference explained by one-time items)
4. C6: Budget variance - Q2 2024 water/sewer 34% over (broken main, one-time)
5. C7: Covenant breach - DSCR 1.21x vs 1.25x requirement (flagged by Diane)

**Actual Performance vs. UW:**
- UW Stabilized Occupancy: 94.5%
- Actual Current: 91.2% (drift detected)
- UW Y1 NOI: $1,022,080
- Actual Y1 NOI: $980,400 (COVID recovery impact)
- Y3 NOI (current): $1,142,000 (recovering)

---

## People (Consistent Across All Documents)

| Name | Role | Email Pattern | Notes |
|------|------|---------------|-------|
| Nadi | Managing Partner | mp@syntheticcapital.com | Signs IC memos, final decisions |
| Sarah Chen | Partner/CFO | sarah.chen@[firm].com | Financial reporting |
| Priya Nair | Senior Associate | priya.nair@[firm].com | Primary underwriter, detail-oriented |
| Alex Donovan | Senior Associate | alex.donovan@[firm].com | Deal sourcing, aggressive assumptions |
| Jordan Ellis | Analyst | jordan.ellis@[firm].com | Data entry, occasional errors |
| Diane Foster | Asset Manager | diane.foster@[firm].com | Property-level performance |
| Chris Nguyen | Controller | chris.nguyen@[firm].com | Fund accounting |

---

## Validation Queries — Expected Answers

Q1: "Show me everything we have on Oakwood Commons."
→ All files in Fund II/Oakwood_Commons/, plus emails referencing OC/Houston deal

Q2: "Is 'OC Houston' the same property as 'Oakwood Commons at Westchase'?"
→ Yes - entity resolution required

Q3: "Which properties have Greenfield as property manager?"
→ Oakwood Commons (Fund II)

Q8: "What is the current occupancy across the Fund II portfolio?"
→ Oakwood: 91.2% (as of latest rent roll)

Q11: "What is Priya's most recent underwriting for Oakwood, and how does it compare to original?"
→ Approved: v2 (5.6% cap, $41.2M). Original v1 was 5.8% cap, $41.5M. Difference: lower expense assumption.

Q15: "There are multiple T12s for Oakwood Commons — which NOI figure should I use?"
→ Use Priya's normalized version ($1.02M) - seller version includes one-time insurance reimbursement

Q16: "Which underwriting model for Oakwood Commons was used for the IC memo?"
→ Priya v2 (UW_OakwoodCommons_v2_PN_112020.xlsx)

---

## Conflict Resolution Guide

**C1 (Parkside T12 error):**
- Root cause: Jordan rekeyed $34,200 as $43,200
- Resolution: Use PDF source ($34,200)
- Teaching moment: Double-entry validation

**C4 (Oakwood UW versions):**
- v1: Conservative (6.0% implied cap from $41.5M price)
- v2: Base case (5.6% cap, $41.2M) - APPROVED
- v3: Bull case (6.0% cap, aggressive expenses)
- Resolution: v2 was approved per IC memo

**C7 (DSCR breach):**
- Calculation: NOI $1,142K / Debt Service $943K = 1.21x
- Covenant: 1.25x minimum
- Status: Breach flagged Q2 2023, remediation plan submitted

---

## File Manifest

### Fund I / Parkside
- [x] RentRoll_Parkside_PreClose_Jan2016.csv (148 units, 94.6% occ)
- [x] T12_Parkside_2015_SellerVersion.csv (source of truth)
- [x] T12_Parkside_2015_REKEYED_Jordan.csv (Jordan typo: $43,200 vs $34,200)
- [x] RentRoll_Parkside_Q3_2017.csv (95.3% occ)
- [x] PM_Report_Parkside_Q3_2017.txt (says 94.1% — C2 conflict)
- [x] SiteVisit_Parkside_2018_DF.txt (Diane notes, mentions unit 214)

### Fund II / Oakwood — Acquisition
- [x] RentRoll_Oakwood_Preclose_Jan2021.csv (232 units, 86.6% occ)
- [x] T12_Oakwood_2020_SellersVersion.csv (raw seller data)
- [x] T12_Oakwood_2020_Priya_Normalized.csv (adjusted NOI)
- [x] UW_OakwoodCommons_v1_PN_092020.xlsx (Priya v1, 5.8% cap, 15.8% IRR)
- [x] UW_OakwoodCommons_v2_PN_112020.xlsx (Priya v2, 5.6% cap, 16.4% IRR — APPROVED)
- [x] UW_OakwoodCommons_v3_AD_112020.xlsx (Alex v3, 6.0% cap, 18.2% IRR — NOT APPROVED)
- [x] IC_Memo_Oakwood_Commons_FINAL.txt (approved version)
- [x] IC_Memo_Oakwood_Commons_DRAFT_with_Comments.txt (tracked changes with Alex comments)

### Fund II / Oakwood — Asset Management
- [x] RentRoll_Oakwood_Q1_2021.csv (85.3% occ)
- [x] RentRoll_Oakwood_Q2_2021.csv (90.5% occ)
- [x] RentRoll_Oakwood_Q3_2023.csv (81.0% occ — DSCR BREACH)
- [x] RentRoll_Oakwood_Q4_2023.csv (87.9% occ — recovery)
- [x] DebtSummary_Oakwood_FirstWestern.txt (DSCR 1.21x vs 1.25x covenant)
- [x] BudgetVariance_Oakwood_Q2_2023.csv (water 34% over — C6)
- [x] PM_Report_Oakwood_Jan2023.txt (Greenfield PM report)

### Emails (7 threads, ~34 emails)
- [x] Thread_01_Broker_Oakwood_Intro.txt (6 emails)
- [x] Thread_02_IC_Debate_Oakwood.txt (8 emails)
- [x] Thread_03_DSCR_Breach_Alert.txt (7 emails)
- [x] Thread_04_Where_Is_File.txt (3 emails)
- [x] Thread_05_Tyler_UW_Error.txt (4 emails)
- [x] Thread_06_Oakwood_IC_Expense_Debate.txt (3 emails — explains v2 selection)
- [x] Thread_07_Hendricks_COVID_Complaint.txt (4 emails — Fund I wisdom)

### Market Research (illustrative sample, not real index data)
- [x] Synthetic_Houston_Rent_Index_Sample.csv

### Ground Truth
- [x] This file (GroundTruth_MASTER.md)


# Roadmap: from accounting core to a TallyPrime-class product

TallyPrime is not one feature; it is an accounting engine, an inventory and GST system, a payroll
product, a report engine (TDL), a print/design system, a multi-user platform and a compliance
surface built over three decades. \"1:1\" is therefore a programme, not a sprint. This is the
working plan.

## Phase 1 — Accounting core (done)

- Companies, financial years, groups, ledgers, opening balances.
- Double-entry vouchers: Contra, Payment, Receipt, Journal, Sales, Purchase, Credit/Debit Note.
- Day Book, ledger statements, Trial Balance, Balance Sheet, Profit & Loss.
- Group creation and ledger creation/alteration.
- Masters import from a live TallyPrime over port 9000; Tally-compatible XML masters export.
- Keyboard-driven Gateway, company switcher, SQLite persistence.

Exit criterion: a small trading business can keep its books for a year and produce a tallied
Balance Sheet and P&L.

## Phase 2 — Inventory and GST (2a done)

Done in 2a:

- Stock groups, stock items, simple units, opening stock, GST rate and HSN/SAC on items.
- Inventory Masters screen, item lines on Sales/Purchase/Credit/Debit Note, Day Book item display.
- Stock Summary with group-wise opening, inward, outward, closing and weighted-average value.

Still to do:

- Compound units, godowns, batches, manufacturing/expiry dates.
- Stock journals/transfers, physical stock, valuation methods beyond weighted average.
- Sales and purchase item lines with discount, freight and rounding.
- GST: CGST/SGST/IGST split, place of supply, reverse charge, composition, GSTR-1/GSTR-3B,
  e-invoice/e-way bill payloads.
- Invoice and delivery-note printing with a template editor.
- Post opening/closing stock into the books so inventory value flows into the Balance Sheet and
  P&L automatically.

Exit criterion: a distributor can bill with GST, track stock and reconcile input credit.

## Phase 3 — Payroll and compliance

- Employees, pay heads, attendance, payroll vouchers, PF/ESI/PT, TDS sections, Form 16 data.
- Statutory reports and challans.

## Phase 4 — Reports and analysis

- Cash flow and fund flow, ratio analysis, cost centres, budgets and variances, multi-currency,
  interest calculation, ageing (receivables/payables), bank reconciliation.
- Multi-company consolidation and comparatives.

## Phase 5 — Platform

- A TDL-like scripting layer for user-defined reports and voucher logic (the assessment showed how
  central TDL is to TallyPrime; a compatible subset is a project in itself).
- Print designer, user roles and permissions, audit trail, period locking.
- Sync/server mode with conflict handling, backup/restore, scheduled exports.
- Import of full voucher history from TallyPrime (the 7.2 endpoint exposes `LedgerVouchers` and
  related tables; field mapping and valuation are the work).

## Phase 6 — Migration and parity testing

- Golden datasets: create the same books in TallyPrime and TallyClone, diff every report to the
  paisa.
- Field-level compatibility matrix against the 531-column `Ledger`, 437-column `Company` and
  118-column `VoucherType` catalogue recovered in the report.
- Performance targets at 1–5 lakh vouchers, concurrent users, and year-end rollover.

## What will *not* be copied

- VMProtect, the licence machinery, telemetry, or any Tally binary code.
- The unauthenticated HTTP/TDL surface: TallyClone is a normal authenticated web app when it grows
  a server mode. The importer touches port 9000 only in read-only mode and only against systems the
  operator owns.

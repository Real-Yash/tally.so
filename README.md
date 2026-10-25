# TallyClone

A TallyPrime-style accounting application built from the findings in
`../TALLYPRIME_7.2_REA_REPORT.md`. It is a **clean-room** implementation: no Tally code is used,
but the vocabulary, group hierarchy, field names and gateway interaction model follow the
observed 7.2 behaviour.

## Run

```bash
npm install
npm run dev          # API on :8787, Vite on :5173
# or a single production server:
npm run build
npm start            # http://localhost:8787
```

`HOST=100.100.10.10 PORT=8787 npm start` limits the listener to one interface (useful when the
only intended clients are on a tailnet).

The first launch creates `Demo Traders` with sample ledgers and vouchers so the reports are not
empty. Data lives in `data/tally.db` (SQLite, WAL mode).

## Phase 1 — Accounting core (implemented)

- Companies: name, financial-year books, GSTIN, state, address.
- Groups: TallyPrime primary groups plus the common sub-groups, each tagged
  asset / liability / income / expense. Create new groups from the Groups screen.
- Ledgers: group, opening balance with Dr/Cr, GSTIN, PAN, mobile, email, bank account, IFSC.
- Voucher types: Contra, Payment, Receipt, Journal, Sales, Purchase, Credit Note, Debit Note.
- Double-entry vouchers with date, auto number, narration and balance validation.
- Day Book, ledger statement, Trial Balance, Balance Sheet, Profit & Loss A/c (with drill-down).
- Voucher deletion while a mistake is still in the current books.
- Import masters from a live TallyPrime over port 9000 (read-only SQL, the same
  `REPORTNAME=ODBC Report` envelope recovered in the assessment).
- Export masters as a Tally-compatible `<ENVELOPE><IMPORTDATA>` XML file.
- Keyboard-driven Gateway menu (`↑`/`↓`, `Enter`, `Esc`, `F3`).

## Not yet implemented

Inventory masters and stock reports, godowns and batches, stock valuation, stock journals and
transfers, GST computation and e-invoicing, payroll, multi-currency, cost centres, TDL scripting,
user roles and audit trail, print templates, multi-company consolidation, sync/remote access.

Those are the areas that turn a core into a 1:1 replacement; each is a project of its own.
The current core is intentionally small enough to read and extend.

See [ROADMAP.md](ROADMAP.md) for the phased path from this core to a TallyPrime-class product.

## Layout

```
server/
  db.js            SQLite schema, queries, bootstrap
  seed.js          default groups, voucher types, demo data
  reports.js       trial balance, balance sheet, P&L, day book, ledger statements
  tally-client.js  TallyPrime import (port 9000) and XML export
  index.js         Express API + static build
web/
  src/App.jsx      shell, routing stack, keyboard shortcuts
  src/screens/     Gateway, companies, ledgers, vouchers, reports, import
data/tally.db      created on first run
```

## Import from TallyPrime

Utilities → Import from TallyPrime. Fill host, port (9000) and the *remote* company name, then
test the connection. The importer:

1. `SELECT $Name, $Parent FROM Groups`
2. `SELECT $Name, $Parent, $OpeningBalance FROM Ledger` (falls back without opening balances)
3. upserts groups and ledgers, mapping Tally groups onto the app's nature model.

It never sends TDL, write methods or anything that modifies the remote system.

## Export to TallyPrime

Utilities → Export Masters (XML) downloads a Tally `Import Data` envelope with `LEDGER` nodes
(`PARENT`, `OPENINGBALANCE`, `PARTYGSTIN`, `INCOMETAXNUMBER`, bank fields). Point Tally's
import at that file.

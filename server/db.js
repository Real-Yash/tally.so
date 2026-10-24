import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(here, "..", "data");
fs.mkdirSync(dataDir, { recursive: true });

export const DB_PATH = path.join(dataDir, "tally.db");
export const db = new DatabaseSync(DB_PATH);

db.exec(`
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS companies (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL UNIQUE,
  mailing_name  TEXT,
  books_from    TEXT NOT NULL,
  gstin         TEXT,
  pan           TEXT,
  state         TEXT,
  address       TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS groups (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id  INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  parent_name TEXT,
  nature      TEXT NOT NULL CHECK (nature IN ('asset','liability','income','expense')),
  is_primary  INTEGER NOT NULL DEFAULT 0,
  UNIQUE (company_id, name)
);

CREATE TABLE IF NOT EXISTS ledgers (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id      INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  group_id        INTEGER NOT NULL REFERENCES groups(id),
  opening_balance REAL NOT NULL DEFAULT 0,
  opening_type    TEXT NOT NULL DEFAULT 'Dr' CHECK (opening_type IN ('Dr','Cr')),
  gstin           TEXT,
  pan             TEXT,
  mobile          TEXT,
  email           TEXT,
  bank_account    TEXT,
  ifsc            TEXT,
  address         TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (company_id, name)
);

CREATE TABLE IF NOT EXISTS voucher_types (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id  INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  parent      TEXT NOT NULL,
  UNIQUE (company_id, name)
);

CREATE TABLE IF NOT EXISTS vouchers (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id  INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  type_id     INTEGER NOT NULL REFERENCES voucher_types(id),
  number      TEXT,
  date        TEXT NOT NULL,
  narration   TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS voucher_entries (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  voucher_id  INTEGER NOT NULL REFERENCES vouchers(id) ON DELETE CASCADE,
  ledger_id   INTEGER NOT NULL REFERENCES ledgers(id),
  amount      REAL NOT NULL CHECK (amount >= 0),
  type        TEXT NOT NULL CHECK (type IN ('Dr','Cr'))
);

CREATE INDEX IF NOT EXISTS idx_ledgers_company ON ledgers(company_id);
CREATE INDEX IF NOT EXISTS idx_vouchers_company_date ON vouchers(company_id, date);
CREATE INDEX IF NOT EXISTS idx_entries_voucher ON voucher_entries(voucher_id);
CREATE INDEX IF NOT EXISTS idx_entries_ledger ON voucher_entries(ledger_id);
`);

export const q = {
  all: (sql, ...args) => db.prepare(sql).all(...args),
  get: (sql, ...args) => db.prepare(sql).get(...args),
  run: (sql, ...args) => db.prepare(sql).run(...args),
};

export function getCompany(id) {
  return q.get("SELECT * FROM companies WHERE id = ?", id);
}

export function getGroups(companyId) {
  return q.all(
    "SELECT * FROM groups WHERE company_id = ? ORDER BY is_primary DESC, name",
    companyId,
  );
}

export function getLedgers(companyId) {
  return q.all(
    `SELECT l.*, g.name AS group_name, g.nature AS group_nature
       FROM ledgers l JOIN groups g ON g.id = l.group_id
      WHERE l.company_id = ? ORDER BY l.name`,
    companyId,
  );
}

export function getVoucherTypes(companyId) {
  return q.all(
    "SELECT * FROM voucher_types WHERE company_id = ? ORDER BY id",
    companyId,
  );
}

export function companyStats(companyId) {
  const ledgers = q.get("SELECT COUNT(*) n FROM ledgers WHERE company_id = ?", companyId).n;
  const vouchers = q.get("SELECT COUNT(*) n FROM vouchers WHERE company_id = ?", companyId).n;
  const groups = q.get("SELECT COUNT(*) n FROM groups WHERE company_id = ?", companyId).n;
  const last = q.get(
    "SELECT MAX(date) d FROM vouchers WHERE company_id = ?",
    companyId,
  ).d;
  return { ledgers, vouchers, groups, last_voucher_date: last };
}

export function bootstrap(companyId) {
  const company = getCompany(companyId);
  if (!company) return null;
  return {
    company,
    groups: getGroups(companyId),
    ledgers: getLedgers(companyId),
    voucherTypes: getVoucherTypes(companyId),
    stats: companyStats(companyId),
  };
}

import { db, q } from "./db.js";

// TallyPrime's default primary groups, mapped to the accounting nature this app uses.
export const DEFAULT_GROUPS = [
  ["Capital Account", null, "liability"],
  ["Loans (Liability)", null, "liability"],
  ["Current Liabilities", null, "liability"],
  ["Sundry Creditors", "Current Liabilities", "liability"],
  ["Duties & Taxes", "Current Liabilities", "liability"],
  ["Provisions", "Current Liabilities", "liability"],
  ["Bank OD A/c", "Loans (Liability)", "liability"],
  ["Suspense A/c", null, "liability"],
  ["Fixed Assets", null, "asset"],
  ["Investments", null, "asset"],
  ["Current Assets", null, "asset"],
  ["Sundry Debtors", "Current Assets", "asset"],
  ["Cash-in-Hand", "Current Assets", "asset"],
  ["Bank Accounts", "Current Assets", "asset"],
  ["Stock-in-Hand", "Current Assets", "asset"],
  ["Loans & Advances (Asset)", "Current Assets", "asset"],
  ["Deposits (Asset)", "Current Assets", "asset"],
  ["Branch / Divisions", null, "asset"],
  ["Direct Expenses", null, "expense"],
  ["Indirect Expenses", null, "expense"],
  ["Purchase Accounts", null, "expense"],
  ["Direct Incomes", null, "income"],
  ["Indirect Incomes", null, "income"],
  ["Sales Accounts", null, "income"],
];

export const DEFAULT_VOUCHER_TYPES = [
  ["Contra", "Contra"],
  ["Payment", "Payment"],
  ["Receipt", "Receipt"],
  ["Journal", "Journal"],
  ["Sales", "Sales"],
  ["Purchase", "Purchase"],
  ["Credit Note", "Credit Note"],
  ["Debit Note", "Debit Note"],
];

const NATURE_BY_GROUP = new Map(DEFAULT_GROUPS.map(([name, , nature]) => [name, nature]));

export function groupNature(name) {
  return NATURE_BY_GROUP.get(name) ?? null;
}

export function seedMasters(companyId) {
  const insertGroup = db.prepare(
    `INSERT OR IGNORE INTO groups (company_id, name, parent_name, nature, is_primary)
     VALUES (?, ?, ?, ?, ?)`,
  );
  for (const [name, parent, nature] of DEFAULT_GROUPS) {
    insertGroup.run(companyId, name, parent, nature, parent ? 0 : 1);
  }
  const insertType = db.prepare(
    "INSERT OR IGNORE INTO voucher_types (company_id, name, parent) VALUES (?, ?, ?)",
  );
  for (const [name, parent] of DEFAULT_VOUCHER_TYPES) {
    insertType.run(companyId, name, parent);
  }
}

export function ensureGroup(companyId, name, parentName, natureHint) {
  if (!name) name = "Suspense A/c";
  const existing = q.get(
    "SELECT * FROM groups WHERE company_id = ? AND name = ?",
    companyId,
    name,
  );
  if (existing) return existing;

  let parent = parentName ?? null;
  let nature = natureHint ?? groupNature(name);
  if (!nature && parent) {
    const p = q.get(
      "SELECT * FROM groups WHERE company_id = ? AND name = ?",
      companyId,
      parent,
    );
    nature = p?.nature ?? "asset";
  }
  nature ??= "asset";
  if (parent && parent === name) parent = null;

  const res = q.run(
    `INSERT INTO groups (company_id, name, parent_name, nature, is_primary)
     VALUES (?, ?, ?, ?, 0)`,
    companyId,
    name,
    parent,
    nature,
  );
  return q.get("SELECT * FROM groups WHERE id = ?", res.lastInsertRowid);
}

export function ensureLedger(companyId, name, groupName, opts = {}) {
  const group = ensureGroup(companyId, groupName, null, opts.nature);
  const existing = q.get(
    "SELECT * FROM ledgers WHERE company_id = ? AND name = ?",
    companyId,
    name,
  );
  if (existing) return { ledger: existing, created: false };
  const res = q.run(
    `INSERT INTO ledgers
       (company_id, name, group_id, opening_balance, opening_type,
        gstin, pan, mobile, email, bank_account, ifsc, address)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    companyId,
    name,
    group.id,
    Number(opts.opening_balance ?? 0),
    opts.opening_type === "Cr" ? "Cr" : "Dr",
    opts.gstin ?? null,
    opts.pan ?? null,
    opts.mobile ?? null,
    opts.email ?? null,
    opts.bank_account ?? null,
    opts.ifsc ?? null,
    opts.address ?? null,
  );
  return {
    ledger: q.get("SELECT * FROM ledgers WHERE id = ?", res.lastInsertRowid),
    created: true,
  };
}

export function createCompany({ name, mailing_name, books_from, gstin, pan, state, address, demo }) {
  if (!name || !name.trim()) throw new Error("Company name is required");
  const fy = books_from || currentFyStart();
  const res = q.run(
    `INSERT INTO companies (name, mailing_name, books_from, gstin, pan, state, address)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    name.trim(),
    mailing_name ?? name.trim(),
    fy,
    gstin ?? null,
    pan ?? null,
    state ?? null,
    address ?? null,
  );
  const companyId = Number(res.lastInsertRowid);
  seedMasters(companyId);
  if (demo) seedDemo(companyId);
  return companyId;
}

export function seedDemo(companyId) {
  const cash = ensureLedger(companyId, "Cash", "Cash-in-Hand", {
    opening_balance: 50000,
    opening_type: "Dr",
  }).ledger;
  const bank = ensureLedger(companyId, "HDFC Bank", "Bank Accounts", {
    opening_balance: 250000,
    opening_type: "Dr",
    bank_account: "50100123456789",
    ifsc: "HDFC0001234",
  }).ledger;
  const capital = ensureLedger(companyId, "Owner's Capital", "Capital Account", {
    opening_balance: 300000,
    opening_type: "Cr",
  }).ledger;
  const sales = ensureLedger(companyId, "Sales", "Sales Accounts").ledger;
  const purchases = ensureLedger(companyId, "Purchases", "Purchase Accounts").ledger;
  const rent = ensureLedger(companyId, "Rent", "Indirect Expenses").ledger;
  const salaries = ensureLedger(companyId, "Salaries", "Indirect Expenses").ledger;
  const alpha = ensureLedger(companyId, "Alpha Traders", "Sundry Debtors", {
    gstin: "27AABCU9603R1ZM",
    mobile: "+91 98200 00001",
    email: "accounts@alpha.example",
  }).ledger;
  const beta = ensureLedger(companyId, "Beta Supplies", "Sundry Creditors", {
    gstin: "27AAACB1234C1Z5",
    mobile: "+91 98200 00002",
    email: "sales@beta.example",
  }).ledger;
  const types = new Map(
    q.all("SELECT * FROM voucher_types WHERE company_id = ?", companyId).map((t) => [t.name, t]),
  );
  const addVoucher = (type, number, date, narration, entries) => {
    const v = q.run(
      "INSERT INTO vouchers (company_id, type_id, number, date, narration) VALUES (?, ?, ?, ?, ?)",
      companyId,
      types.get(type).id,
      number,
      date,
      narration,
    );
    const ins = db.prepare(
      "INSERT INTO voucher_entries (voucher_id, ledger_id, amount, type) VALUES (?, ?, ?, ?)",
    );
    for (const [ledger, amount, drcr] of entries) {
      ins.run(v.lastInsertRowid, ledger.id, amount, drcr);
    }
  };

  addVoucher("Payment", "PMT-0001", "2026-04-05", "Office rent for April", [
    [rent, 15000, "Dr"],
    [cash, 15000, "Cr"],
  ]);
  addVoucher(
    "Sales",
    "SAL-0001",
    "2026-04-10",
    "Invoice to Alpha Traders",
    [
      [alpha, 45000, "Dr"],
      [sales, 45000, "Cr"],
    ],
  );
  addVoucher(
    "Purchase",
    "PUR-0001",
    "2026-04-12",
    "Goods from Beta Supplies",
    [
      [purchases, 22000, "Dr"],
      [beta, 22000, "Cr"],
    ],
  );
  addVoucher("Receipt", "RCT-0001", "2026-04-20", "Part receipt from Alpha Traders", [
    [cash, 30000, "Dr"],
    [alpha, 30000, "Cr"],
  ]);
  addVoucher("Journal", "JRN-0001", "2026-04-25", "Salaries payable", [
    [salaries, 12000, "Dr"],
    [cash, 12000, "Cr"],
  ]);
}

export function currentFyStart(d = new Date()) {
  const y = d.getMonth() + 1 >= 4 ? d.getFullYear() : d.getFullYear() - 1;
  return `${y}-04-01`;
}

export function ensureDemoCompany() {
  const first = q.get("SELECT * FROM companies ORDER BY id LIMIT 1");
  if (first) return first.id;
  return createCompany({
    name: "Demo Traders",
    mailing_name: "Demo Traders",
    books_from: currentFyStart(),
    state: "Maharashtra",
    demo: true,
  });
}

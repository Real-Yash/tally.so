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

export const DEFAULT_UNITS = [
  ["Nos", "nos"],
  ["Pcs", "pcs"],
  ["Kg", "kg"],
  ["Box", "box"],
  ["Ltr", "ltr"],
];

export const DEFAULT_STOCK_GROUPS = [
  ["Traded Goods", null],
  ["Electronics", "Traded Goods"],
  ["Stationery", "Traded Goods"],
  ["Raw Materials", null],
  ["Finished Goods", null],
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
  const insertUnit = db.prepare(
    "INSERT OR IGNORE INTO units (company_id, name, symbol) VALUES (?, ?, ?)",
  );
  for (const [name, symbol] of DEFAULT_UNITS) insertUnit.run(companyId, name, symbol);
  const insertStockGroup = db.prepare(
    "INSERT OR IGNORE INTO stock_groups (company_id, name, parent_name) VALUES (?, ?, ?)",
  );
  for (const [name, parent] of DEFAULT_STOCK_GROUPS) {
    insertStockGroup.run(companyId, name, parent);
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

export function ensureStockGroup(companyId, name, parentName = null) {
  if (!name) name = "Traded Goods";
  const existing = q.get(
    "SELECT * FROM stock_groups WHERE company_id = ? AND name = ?",
    companyId,
    name,
  );
  if (existing) return existing;
  const res = q.run(
    "INSERT INTO stock_groups (company_id, name, parent_name) VALUES (?, ?, ?)",
    companyId,
    name,
    parentName && parentName !== name ? parentName : null,
  );
  return q.get("SELECT * FROM stock_groups WHERE id = ?", res.lastInsertRowid);
}

export function ensureUnit(companyId, name, symbol = null) {
  if (!name) name = "Nos";
  const existing = q.get("SELECT * FROM units WHERE company_id = ? AND name = ?", companyId, name);
  if (existing) return existing;
  const res = q.run(
    "INSERT INTO units (company_id, name, symbol) VALUES (?, ?, ?)",
    companyId,
    name,
    symbol ?? name.toLowerCase(),
  );
  return q.get("SELECT * FROM units WHERE id = ?", res.lastInsertRowid);
}

export function ensureStockItem(companyId, name, opts = {}) {
  if (!name?.trim()) throw new Error("Stock item name is required");
  const existing = q.get(
    "SELECT * FROM stock_items WHERE company_id = ? AND name = ?",
    companyId,
    name.trim(),
  );
  if (existing) return { item: existing, created: false };
  const group = opts.groupName ? ensureStockGroup(companyId, opts.groupName) : null;
  const unit = opts.unitName ? ensureUnit(companyId, opts.unitName) : null;
  const res = q.run(
    `INSERT INTO stock_items
       (company_id, name, stock_group_id, unit_id, opening_qty, opening_rate,
        gst_rate, hsn, reorder_level)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    companyId,
    name.trim(),
    group?.id ?? null,
    unit?.id ?? null,
    Number(opts.opening_qty ?? 0),
    Number(opts.opening_rate ?? 0),
    Number(opts.gst_rate ?? 0),
    opts.hsn ?? null,
    Number(opts.reorder_level ?? 0),
  );
  return {
    item: q.get("SELECT * FROM stock_items WHERE id = ?", res.lastInsertRowid),
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

export function ensureDemoInventory(companyId) {
  const definitions = [
    {
      key: "cable",
      name: "USB-C Cable",
      group: "Electronics",
      unit: "Nos",
      qty: 120,
      rate: 140,
      gst: 18,
      hsn: "8544",
      reorder: 50,
    },
    {
      key: "mouse",
      name: "Wireless Mouse",
      group: "Electronics",
      unit: "Nos",
      qty: 50,
      rate: 620,
      gst: 18,
      hsn: "8471",
      reorder: 20,
    },
    {
      key: "notebook",
      name: "A4 Notebook",
      group: "Stationery",
      unit: "Nos",
      qty: 300,
      rate: 40,
      gst: 12,
      hsn: "4820",
      reorder: 100,
    },
  ];
  const items = {};
  for (const def of definitions) {
    items[def.key] = ensureStockItem(companyId, def.name, {
      groupName: def.group,
      unitName: def.unit,
      opening_qty: def.qty,
      opening_rate: def.rate,
      gst_rate: def.gst,
      hsn: def.hsn,
      reorder_level: def.reorder,
    }).item;
  }
  return items;
}

export function attachDemoVoucherItems(companyId, items) {
  const byName = new Map(Object.values(items).map((item) => [item.name, item]));
  const attach = (number, rows) => {
    const voucher = q.get(
      "SELECT * FROM vouchers WHERE company_id = ? AND number = ?",
      companyId,
      number,
    );
    if (!voucher) return;
    const existing = q.get(
      "SELECT COUNT(*) n FROM voucher_items WHERE voucher_id = ?",
      voucher.id,
    ).n;
    if (existing) return;
    const ins = db.prepare(
      "INSERT INTO voucher_items (voucher_id, stock_item_id, quantity, rate, amount) VALUES (?, ?, ?, ?, ?)",
    );
    for (const [name, qty, rate] of rows) {
      const item = byName.get(name);
      if (item) ins.run(voucher.id, item.id, qty, rate, Math.round(qty * rate * 100) / 100);
    }
  };
  attach("SAL-0001", [
    ["Wireless Mouse", 40, 900],
    ["USB-C Cable", 60, 150],
  ]);
  attach("PUR-0001", [
    ["USB-C Cable", 100, 150],
    ["A4 Notebook", 70, 100],
  ]);
}

export function ensureInventoryDemo(companyId) {
  const items = ensureDemoInventory(companyId);
  attachDemoVoucherItems(companyId, items);
  return items;
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
  const items = ensureDemoInventory(companyId);

  const types = new Map(
    q.all("SELECT * FROM voucher_types WHERE company_id = ?", companyId).map((t) => [t.name, t]),
  );
  const round2 = (n) => Math.round(n * 100) / 100;
  const addVoucher = (type, number, date, narration, entries, itemLines = []) => {
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
    const insItem = db.prepare(
      "INSERT INTO voucher_items (voucher_id, stock_item_id, quantity, rate, amount) VALUES (?, ?, ?, ?, ?)",
    );
    for (const [item, qty, rate] of itemLines) {
      insItem.run(v.lastInsertRowid, item.id, qty, rate, round2(qty * rate));
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
    [
      [items.mouse, 40, 900],
      [items.cable, 60, 150],
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
    [
      [items.cable, 100, 150],
      [items.notebook, 70, 100],
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
  if (first) {
    seedMasters(first.id);
    if (first.name === "Demo Traders") ensureInventoryDemo(first.id);
    return first.id;
  }
  const id = createCompany({
    name: "Demo Traders",
    mailing_name: "Demo Traders",
    books_from: currentFyStart(),
    state: "Maharashtra",
    demo: true,
  });
  ensureInventoryDemo(id);
  return id;
}

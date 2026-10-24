import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  bootstrap,
  companyStats,
  db,
  getCompany,
  getLedgers,
  q,
} from "./db.js";
import {
  createCompany,
  ensureDemoCompany,
  ensureGroup,
  ensureLedger,
  seedMasters,
} from "./seed.js";
import {
  balanceSheet,
  dayBook,
  ledgerStatement,
  profitAndLoss,
  trialBalance,
} from "./reports.js";
import { exportMastersXml, importFromTally, tallyQuery } from "./tally-client.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || "0.0.0.0";

app.use(express.json({ limit: "2mb" }));

const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const today = () => new Date().toISOString().slice(0, 10);

function requireCompany(id) {
  const company = getCompany(Number(id));
  if (!company) throw Object.assign(new Error("Company not found"), { status: 404 });
  return company;
}

const fyRange = (company, from, to) => ({
  from: from || company.books_from,
  to: to || today(),
});

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, app: "tallyclone", version: "0.1.0", time: new Date().toISOString() });
});

app.get("/api/companies", (_req, res) => {
  const rows = q.all("SELECT * FROM companies ORDER BY name");
  res.json(rows.map((c) => ({ ...c, stats: companyStats(c.id) })));
});

app.post("/api/companies", h(async (req, res) => {
  const { name, mailing_name, books_from, gstin, pan, state, address, demo } = req.body ?? {};
  const id = createCompany({ name, mailing_name, books_from, gstin, pan, state, address, demo });
  res.status(201).json(bootstrap(id));
}));

app.get("/api/companies/:id", (req, res) => {
  const data = bootstrap(Number(req.params.id));
  if (!data) return res.status(404).json({ error: "Company not found" });
  res.json(data);
});

app.get("/api/companies/:id/ledgers", (req, res) => {
  requireCompany(req.params.id);
  res.json(getLedgers(Number(req.params.id)));
});

app.post("/api/companies/:id/ledgers", (req, res) => {
  const companyId = Number(req.params.id);
  requireCompany(companyId);
  const { name, group_name, group_id, opening_balance, opening_type, gstin, pan, mobile, email, bank_account, ifsc, address } =
    req.body ?? {};
  if (!name?.trim()) return res.status(400).json({ error: "Ledger name is required" });

  let group = group_id
    ? q.get("SELECT * FROM groups WHERE id = ? AND company_id = ?", Number(group_id), companyId)
    : null;
  if (!group && group_name) group = ensureGroup(companyId, group_name, null);
  if (!group) return res.status(400).json({ error: "A group is required" });

  const dup = q.get("SELECT id FROM ledgers WHERE company_id = ? AND name = ?", companyId, name.trim());
  if (dup) return res.status(409).json({ error: `Ledger '${name.trim()}' already exists` });

  const { ledger } = ensureLedger(companyId, name.trim(), group.name, {
    opening_balance: Number(opening_balance) || 0,
    opening_type: opening_type === "Cr" ? "Cr" : "Dr",
  });
  q.run(
    `UPDATE ledgers SET gstin=?, pan=?, mobile=?, email=?, bank_account=?, ifsc=?, address=? WHERE id=?`,
    gstin || null,
    pan || null,
    mobile || null,
    email || null,
    bank_account || null,
    ifsc || null,
    address || null,
    ledger.id,
  );
  res.status(201).json(q.get(
    `SELECT l.*, g.name AS group_name FROM ledgers l JOIN groups g ON g.id=l.group_id WHERE l.id=?`,
    ledger.id,
  ));
});

app.put("/api/companies/:id/ledgers/:ledgerId", (req, res) => {
  const companyId = Number(req.params.id);
  requireCompany(companyId);
  const ledgerId = Number(req.params.ledgerId);
  const existing = q.get("SELECT * FROM ledgers WHERE id=? AND company_id=?", ledgerId, companyId);
  if (!existing) return res.status(404).json({ error: "Ledger not found" });
  const b = req.body ?? {};
  const group = b.group_name
    ? ensureGroup(companyId, b.group_name, null)
    : q.get("SELECT * FROM groups WHERE id=?", existing.group_id);
  q.run(
    `UPDATE ledgers SET name=?, group_id=?, opening_balance=?, opening_type=?, gstin=?, pan=?,
       mobile=?, email=?, bank_account=?, ifsc=?, address=? WHERE id=?`,
    (b.name ?? existing.name).trim(),
    group.id,
    Number(b.opening_balance ?? existing.opening_balance) || 0,
    b.opening_type === "Cr" ? "Cr" : b.opening_type === "Dr" ? "Dr" : existing.opening_type,
    b.gstin ?? existing.gstin,
    b.pan ?? existing.pan,
    b.mobile ?? existing.mobile,
    b.email ?? existing.email,
    b.bank_account ?? existing.bank_account,
    b.ifsc ?? existing.ifsc,
    b.address ?? existing.address,
    ledgerId,
  );
  res.json(q.get(
    `SELECT l.*, g.name AS group_name FROM ledgers l JOIN groups g ON g.id=l.group_id WHERE l.id=?`,
    ledgerId,
  ));
});

app.post("/api/companies/:id/groups", (req, res) => {
  const companyId = Number(req.params.id);
  requireCompany(companyId);
  const { name, parent_name, nature } = req.body ?? {};
  if (!name?.trim()) return res.status(400).json({ error: "Group name is required" });
  res.status(201).json(ensureGroup(companyId, name.trim(), parent_name || null, nature));
});

const VOUCHER_PREFIX = {
  Payment: "PMT",
  Receipt: "RCT",
  Sales: "SAL",
  Purchase: "PUR",
  Journal: "JRN",
  Contra: "CTR",
  "Credit Note": "CRN",
  "Debit Note": "DBN",
};

function nextVoucherNumber(companyId, typeName) {
  const prefix =
    VOUCHER_PREFIX[typeName] ??
    typeName.split(/\s+/).map((w) => w[0]).join("").toUpperCase().slice(0, 3);
  const rows = q.all(
    `SELECT v.number FROM vouchers v JOIN voucher_types vt ON vt.id=v.type_id
      WHERE v.company_id=? AND vt.name=?`,
    companyId,
    typeName,
  );
  let max = 0;
  for (const row of rows) {
    const match = String(row.number ?? "").match(/(\d+)\s*$/);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `${prefix}-${String(max + 1).padStart(4, "0")}`;
}

app.post("/api/companies/:id/vouchers", (req, res) => {
  const companyId = Number(req.params.id);
  requireCompany(companyId);
  const { type, date, number, narration, entries } = req.body ?? {};
  if (!type) return res.status(400).json({ error: "Voucher type is required" });
  if (!Array.isArray(entries) || entries.length < 2)
    return res.status(400).json({ error: "A voucher needs at least two entries" });

  const vt = q.get("SELECT * FROM voucher_types WHERE company_id=? AND name=?", companyId, type);
  if (!vt) return res.status(400).json({ error: `Unknown voucher type '${type}'` });

  const cleaned = entries.map((e) => ({
    ledger_id: Number(e.ledger_id),
    amount: Math.round(Number(e.amount) * 100) / 100,
    type: e.type === "Cr" ? "Cr" : "Dr",
  }));
  for (const e of cleaned) {
    if (!e.ledger_id || !q.get("SELECT id FROM ledgers WHERE id=? AND company_id=?", e.ledger_id, companyId))
      return res.status(400).json({ error: "A line references an unknown ledger" });
    if (!(e.amount > 0)) return res.status(400).json({ error: "Every line needs a positive amount" });
  }
  const dr = Math.round(cleaned.filter((e) => e.type === "Dr").reduce((s, e) => s + e.amount, 0) * 100) / 100;
  const cr = Math.round(cleaned.filter((e) => e.type === "Cr").reduce((s, e) => s + e.amount, 0) * 100) / 100;
  if (Math.abs(dr - cr) > 0.004)
    return res.status(400).json({ error: `Voucher is not balanced (Dr ${dr} / Cr ${cr})` });

  const vdate = date || today();
  const vnumber = (number && String(number).trim()) || nextVoucherNumber(companyId, type);
  let voucherId;
  db.exec("BEGIN");
  try {
    const v = q.run(
      "INSERT INTO vouchers (company_id, type_id, number, date, narration) VALUES (?, ?, ?, ?, ?)",
      companyId,
      vt.id,
      vnumber,
      vdate,
      narration || null,
    );
    voucherId = Number(v.lastInsertRowid);
    const ins = db.prepare(
      "INSERT INTO voucher_entries (voucher_id, ledger_id, amount, type) VALUES (?, ?, ?, ?)",
    );
    for (const e of cleaned) ins.run(voucherId, e.ledger_id, e.amount, e.type);
    db.exec("COMMIT");
  } catch (err) {
    try {
      db.exec("ROLLBACK");
    } catch {
      /* already rolled back */
    }
    throw err;
  }
  res.status(201).json({
    id: voucherId,
    number: vnumber,
    date: vdate,
    type,
    entries: cleaned,
  });
});

app.get("/api/companies/:id/vouchers", (req, res) => {
  const company = requireCompany(req.params.id);
  const { from, to } = fyRange(company, req.query.from, req.query.to);
  res.json({ from, to, vouchers: dayBook(company.id, from, to, req.query.type) });
});

app.delete("/api/companies/:id/vouchers/:voucherId", (req, res) => {
  const companyId = Number(req.params.id);
  requireCompany(companyId);
  const voucherId = Number(req.params.voucherId);
  const voucher = q.get(
    "SELECT * FROM vouchers WHERE id=? AND company_id=?",
    voucherId,
    companyId,
  );
  if (!voucher) return res.status(404).json({ error: "Voucher not found" });

  db.exec("BEGIN");
  try {
    q.run("DELETE FROM voucher_entries WHERE voucher_id=?", voucherId);
    q.run("DELETE FROM vouchers WHERE id=?", voucherId);
    db.exec("COMMIT");
  } catch (err) {
    try {
      db.exec("ROLLBACK");
    } catch {
      /* already rolled back */
    }
    throw err;
  }
  res.json({ deleted: true, id: voucherId, number: voucher.number });
});

app.get("/api/companies/:id/reports/trial-balance", (req, res) => {
  const company = requireCompany(req.params.id);
  const { from, to } = fyRange(company, req.query.from, req.query.to);
  res.json(trialBalance(company.id, from, to));
});

app.get("/api/companies/:id/reports/balance-sheet", (req, res) => {
  const company = requireCompany(req.params.id);
  const asOf = req.query.as_of || today();
  res.json(balanceSheet(company.id, asOf));
});

app.get("/api/companies/:id/reports/pnl", (req, res) => {
  const company = requireCompany(req.params.id);
  const { from, to } = fyRange(company, req.query.from, req.query.to);
  res.json(profitAndLoss(company.id, from, to));
});

app.get("/api/companies/:id/reports/daybook", (req, res) => {
  const company = requireCompany(req.params.id);
  const { from, to } = fyRange(company, req.query.from, req.query.to);
  res.json({ from, to, vouchers: dayBook(company.id, from, to, req.query.type) });
});

app.get("/api/companies/:id/ledgers/:ledgerId/statement", (req, res) => {
  const company = requireCompany(req.params.id);
  const { from, to } = fyRange(company, req.query.from, req.query.to);
  res.json(ledgerStatement(company.id, Number(req.params.ledgerId), from, to));
});

app.post("/api/companies/:id/import/tally", h(async (req, res) => {
  const companyId = Number(req.params.id);
  requireCompany(companyId);
  const { host = "127.0.0.1", port = 9000, remote_company } = req.body ?? {};
  if (!remote_company) return res.status(400).json({ error: "remote_company is required" });
  const result = await importFromTally({ companyId, host, port: Number(port), remoteCompany: remote_company });
  res.json(result);
}));

app.post("/api/tally/probe", h(async (req, res) => {
  const { host = "127.0.0.1", port = 9000, company } = req.body ?? {};
  const rows = await tallyQuery({
    host,
    port: Number(port),
    company: company || "Test Co",
    sql: "SELECT $Name FROM Company",
    timeout: 8000,
  });
  res.json({ ok: true, companies: rows.map((r) => r[0]) });
}));

app.get("/api/companies/:id/export/xml", (req, res) => {
  const company = requireCompany(req.params.id);
  const xml = exportMastersXml(company.id);
  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${company.name.replaceAll(/[^\w.-]+/g, "_")}-masters.xml"`,
  );
  res.send(xml);
});

// First run: make the app usable immediately.
try {
  ensureDemoCompany();
} catch (err) {
  console.warn("demo company seed skipped:", err.message);
}

const publicDir = path.join(here, "public");
app.use(express.static(publicDir));
app.use((req, res, next) => {
  if (req.path.startsWith("/api/")) return next();
  res.sendFile(path.join(publicDir, "index.html"), (err) => {
    if (err) next();
  });
});

app.use((err, _req, res, _next) => {
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: err.message || "Internal error" });
});

app.listen(PORT, HOST, () => {
  console.log(`TallyClone API on http://${HOST}:${PORT}`);
});

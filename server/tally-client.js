import { q } from "./db.js";
import { ensureGroup, ensureLedger, groupNature } from "./seed.js";

const decode = (s) =>
  s
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&#39;", "'")
    .replaceAll("&amp;", "&");

const xmlEscape = (s) =>
  String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const cleanName = (s) => String(s ?? "").replace(/[\u0000-\u001f]/g, "").trim();

// TallyPrime system ledgers that are meaningless in a standalone books-of-account.
const SYSTEM_LEDGERS = new Set(["Profit & Loss A/c"]);

export function buildSqlRequest(company, sql) {
  return `<ENVELOPE>
<HEADER><TALLYREQUEST>Export Data</TALLYREQUEST></HEADER>
<BODY><EXPORTDATA><REQUESTDESC>
<REPORTNAME>ODBC Report</REPORTNAME>
<SQLREQUEST Type="Data" Method="Select">${xmlEscape(sql)}</SQLREQUEST>
<STATICVARIABLES><SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT><SVCURRENTCOMPANY>${xmlEscape(company)}</SVCURRENTCOMPANY></STATICVARIABLES>
</REQUESTDESC></EXPORTDATA></BODY>
</ENVELOPE>`;
}

export async function tallyQuery({ host, port = 9000, company, sql, timeout = 20000 }) {
  const url = `http://${host}:${port}/`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "text/xml" },
    body: buildSqlRequest(company, sql),
    signal: AbortSignal.timeout(timeout),
  });
  if (!res.ok) throw new Error(`Tally returned HTTP ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  const text =
    buffer.length > 1 && buffer[0] === 0x3c && buffer[1] === 0x00
      ? buffer.toString("utf16le")
      : buffer.toString("utf8");

  const err = text.match(/<LINEERROR>([\s\S]*?)<\/LINEERROR>/i);
  if (err) throw new Error(decode(err[1].trim()));

  const data = text.match(/<RESULTDATA>([\s\S]*?)<\/RESULTDATA>/i);
  if (!data) return [];
  const rows = data[1].match(/<ROW>[\s\S]*?<\/ROW>/gi) ?? [];
  return rows.map((row) =>
    (row.match(/<COL[^>]*>[\s\S]*?<\/COL>/gi) ?? []).map((col) =>
      decode(col.replace(/<[^>]+>/g, "").trim()),
    ),
  );
}

function inferNature(groupName, parentName, byName) {
  const direct = groupNature(groupName);
  if (direct) return direct;
  let cursor = parentName;
  const seen = new Set();
  while (cursor && !seen.has(cursor)) {
    seen.add(cursor);
    const n = groupNature(cursor);
    if (n) return n;
    cursor = byName.get(cursor) ?? null;
  }
  return "asset";
}

export async function importFromTally({
  companyId,
  host,
  port,
  remoteCompany,
}) {
  if (!remoteCompany) throw new Error("Remote company name is required");
  const warnings = [];

  let groups = [];
  try {
    groups = await tallyQuery({
      host,
      port,
      company: remoteCompany,
      sql: "SELECT $Name, $Parent FROM Groups",
    });
  } catch (err) {
    warnings.push(`Could not read Groups (${err.message}); ledger parents will be used.`);
  }

  let ledgerRows = [];
  try {
    ledgerRows = await tallyQuery({
      host,
      port,
      company: remoteCompany,
      sql: "SELECT $Name, $Parent, $OpeningBalance FROM Ledger",
    });
  } catch (err) {
    warnings.push(`OpeningBalance unavailable (${err.message}); retrying without it.`);
    ledgerRows = await tallyQuery({
      host,
      port,
      company: remoteCompany,
      sql: "SELECT $Name, $Parent FROM Ledger",
    });
  }

  const byName = new Map();
  for (const [rawName, rawParent] of groups) {
    const name = cleanName(rawName);
    if (!name) continue;
    const parent = cleanName(rawParent);
    byName.set(name, parent && parent !== "Primary" ? parent : null);
  }

  // Create groups parents-first so the hierarchy is stable.
  const depth = (name, seen = new Set()) => {
    if (!name || seen.has(name)) return 0;
    seen.add(name);
    const parent = byName.get(name);
    return parent ? 1 + depth(parent, seen) : 0;
  };
  const ordered = [...byName.entries()].sort((a, b) => depth(a[0]) - depth(b[0]));
  for (const [name, parent] of ordered) {
    ensureGroup(companyId, name, parent || null, inferNature(name, parent, byName));
  }

  let created = 0;
  let updated = 0;
  let skipped = 0;
  for (const row of ledgerRows) {
    const name = cleanName(row[0]);
    const parent = cleanName(row[1]);
    const openingRaw = row[2];
    if (!name) continue;
    if (SYSTEM_LEDGERS.has(name)) {
      skipped += 1;
      continue;
    }
    const opening = Number(String(openingRaw ?? "0").replaceAll(",", "")) || 0;
    const groupName = parent || "Suspense A/c";
    const existing = q.get(
      "SELECT * FROM ledgers WHERE company_id = ? AND name = ?",
      companyId,
      name,
    );
    if (existing) {
      const group = ensureGroup(companyId, groupName, null);
      q.run(
        `UPDATE ledgers SET group_id = ?, opening_balance = ?, opening_type = ?
          WHERE id = ?`,
        group.id,
        Math.abs(opening),
        opening < 0 ? "Cr" : "Dr",
        existing.id,
      );
      updated += 1;
    } else {
      ensureLedger(companyId, name, groupName, {
        opening_balance: Math.abs(opening),
        opening_type: opening < 0 ? "Cr" : "Dr",
      });
      created += 1;
    }
  }

  return { groups: byName.size, ledgers: ledgerRows.length, created, updated, skipped, warnings };
}

export function exportMastersXml(companyId) {
  const company = q.get("SELECT * FROM companies WHERE id = ?", companyId);
  if (!company) throw new Error("Company not found");
  const ledgers = q.all(
    `SELECT l.*, g.name AS parent
       FROM ledgers l JOIN groups g ON g.id = l.group_id
      WHERE l.company_id = ? ORDER BY l.name`,
    companyId,
  );
  const nodes = ledgers
    .map((l) => {
      const opening = (l.opening_type === "Cr" ? -1 : 1) * Number(l.opening_balance || 0);
      const fields = [
        `<PARENT>${xmlEscape(l.parent)}</PARENT>`,
        `<OPENINGBALANCE>${opening}</OPENINGBALANCE>`,
        l.gstin ? `<PARTYGSTIN>${xmlEscape(l.gstin)}</PARTYGSTIN>` : "",
        l.pan ? `<INCOMETAXNUMBER>${xmlEscape(l.pan)}</INCOMETAXNUMBER>` : "",
        l.mobile ? `<LEDGERMOBILE>${xmlEscape(l.mobile)}</LEDGERMOBILE>` : "",
        l.email ? `<EMAIL>${xmlEscape(l.email)}</EMAIL>` : "",
        l.bank_account ? `<BANKACCOUNTNUMBER>${xmlEscape(l.bank_account)}</BANKACCOUNTNUMBER>` : "",
        l.ifsc ? `<IFSCODE>${xmlEscape(l.ifsc)}</IFSCODE>` : "",
      ].join("");
      return `<LEDGER NAME="${xmlEscape(l.name)}" ACTION="Create">${fields}</LEDGER>`;
    })
    .join("\n");

  return `<ENVELOPE>
<HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER>
<BODY><IMPORTDATA>
<REQUESTDESC><REPORTNAME>All Masters</REPORTNAME></REQUESTDESC>
<REQUESTDATA><TALLYMESSAGE xmlns:UDF="TallyUDF">
${nodes}
</TALLYMESSAGE></REQUESTDATA>
</IMPORTDATA></BODY>
</ENVELOPE>`;
}

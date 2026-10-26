import { q } from "./db.js";

const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const signedOpening = (l) =>
  (l.opening_type === "Cr" ? -1 : 1) * Number(l.opening_balance || 0);

function company(companyId) {
  const c = q.get("SELECT * FROM companies WHERE id = ?", companyId);
  if (!c) throw Object.assign(new Error("Company not found"), { status: 404 });
  return c;
}

export function movements(companyId, from, to) {
  const rows = q.all(
    `SELECT e.ledger_id,
            SUM(CASE WHEN e.type = 'Dr' THEN e.amount ELSE 0 END) AS dr,
            SUM(CASE WHEN e.type = 'Cr' THEN e.amount ELSE 0 END) AS cr
       FROM voucher_entries e JOIN vouchers v ON v.id = e.voucher_id
      WHERE v.company_id = ? AND v.date >= ? AND v.date <= ?
      GROUP BY e.ledger_id`,
    companyId,
    from,
    to,
  );
  const map = new Map();
  for (const row of rows) map.set(row.ledger_id, { dr: row.dr || 0, cr: row.cr || 0 });
  return map;
}

export function ledgersWithBalances(companyId, from, to) {
  const ledgers = q.all(
    `SELECT l.*, g.name AS group_name, g.nature
       FROM ledgers l JOIN groups g ON g.id = l.group_id
      WHERE l.company_id = ? ORDER BY g.name, l.name`,
    companyId,
  );
  const mv = movements(companyId, from, to);
  return ledgers.map((l) => {
    const m = mv.get(l.id) ?? { dr: 0, cr: 0 };
    const opening = signedOpening(l);
    const closing = opening + m.dr - m.cr;
    return {
      ...l,
      opening: r2(opening),
      dr: r2(m.dr),
      cr: r2(m.cr),
      closing: r2(closing),
      debit: r2(Math.max(closing, 0)),
      credit: r2(Math.max(-closing, 0)),
    };
  });
}

export function trialBalance(companyId, from, to) {
  company(companyId);
  const rows = ledgersWithBalances(companyId, from, to);
  const totalDebit = r2(rows.reduce((s, x) => s + x.debit, 0));
  const totalCredit = r2(rows.reduce((s, x) => s + x.credit, 0));
  return {
    from,
    to,
    rows,
    totalDebit,
    totalCredit,
    difference: r2(totalDebit - totalCredit),
  };
}

function balanceAsOf(companyId, asOf) {
  const companyRow = company(companyId);
  const rows = ledgersWithBalances(companyId, companyRow.books_from, asOf);
  return rows;
}

export function balanceSheet(companyId, asOf) {
  const rows = balanceAsOf(companyId, asOf);
  const assets = [];
  const liabilities = [];
  for (const l of rows) {
    if (l.nature === "asset") {
      if (l.closing !== 0)
        assets.push({ group: l.group_name, name: l.name, amount: l.closing });
    } else if (l.nature === "liability") {
      if (l.closing !== 0)
        liabilities.push({ group: l.group_name, name: l.name, amount: r2(-l.closing) });
    }
  }
  const income = rows
    .filter((l) => l.nature === "income")
    .reduce((s, l) => s + -l.closing, 0);
  const expense = rows
    .filter((l) => l.nature === "expense")
    .reduce((s, l) => s + l.closing, 0);
  const profit = r2(income - expense);

  const assetsTotal = r2(assets.reduce((s, x) => s + x.amount, 0));
  const liabilitiesBase = r2(liabilities.reduce((s, x) => s + x.amount, 0));
  const totalAssets = r2(assetsTotal + (profit < 0 ? -profit : 0));
  const totalLiabilities = r2(liabilitiesBase + (profit > 0 ? profit : 0));
  return {
    asOf,
    assets,
    liabilities,
    profit,
    assetsTotal,
    liabilitiesBase,
    totalAssets,
    totalLiabilities,
    difference: r2(totalAssets - totalLiabilities),
  };
}

export function profitAndLoss(companyId, from, to) {
  company(companyId);
  const rows = ledgersWithBalances(companyId, from, to);
  const incomeRows = rows
    .filter((l) => l.nature === "income" && -l.closing !== 0)
    .map((l) => ({ group: l.group_name, name: l.name, amount: r2(-l.closing) }));
  const expenseRows = rows
    .filter((l) => l.nature === "expense" && l.closing !== 0)
    .map((l) => ({ group: l.group_name, name: l.name, amount: l.closing }));
  const totalIncome = r2(incomeRows.reduce((s, x) => s + x.amount, 0));
  const totalExpense = r2(expenseRows.reduce((s, x) => s + x.amount, 0));
  return {
    from,
    to,
    income: incomeRows,
    expenses: expenseRows,
    totalIncome,
    totalExpense,
    netProfit: r2(totalIncome - totalExpense),
  };
}

export function dayBook(companyId, from, to, typeName) {
  company(companyId);
  const params = [companyId, from, to];
  let filter = "";
  if (typeName) {
    filter = " AND vt.name = ?";
    params.push(typeName);
  }
  const vouchers = q.all(
    `SELECT v.*, vt.name AS type_name
       FROM vouchers v JOIN voucher_types vt ON vt.id = v.type_id
      WHERE v.company_id = ? AND v.date >= ? AND v.date <= ?${filter}
      ORDER BY v.date, v.id`,
    ...params,
  );
  const entryStmt = q;
  return vouchers.map((v) => {
    const entries = entryStmt.all(
      `SELECT e.*, l.name AS ledger_name
         FROM voucher_entries e JOIN ledgers l ON l.id = e.ledger_id
        WHERE e.voucher_id = ? ORDER BY e.id`,
      v.id,
    );
    const items = entryStmt.all(
      `SELECT vi.*, s.name AS item_name, s.hsn, u.name AS unit_name, u.symbol AS unit_symbol
         FROM voucher_items vi
         JOIN stock_items s ON s.id = vi.stock_item_id
         LEFT JOIN units u ON u.id = s.unit_id
        WHERE vi.voucher_id = ? ORDER BY vi.id`,
      v.id,
    );
    return { ...v, entries, items };
  });
}

const STOCK_INWARD = new Set(["Purchase", "Credit Note", "Rejection In"]);
const STOCK_OUTWARD = new Set(["Sales", "Debit Note", "Delivery Note"]);

export function stockSummary(companyId, asOf) {
  const companyRow = company(companyId);
  const items = q.all(
    `SELECT s.*, g.name AS stock_group_name, u.name AS unit_name, u.symbol AS unit_symbol
       FROM stock_items s
       LEFT JOIN stock_groups g ON g.id = s.stock_group_id
       LEFT JOIN units u ON u.id = s.unit_id
      WHERE s.company_id = ? ORDER BY s.name`,
    companyId,
  );
  const movementRows = q.all(
    `SELECT vi.stock_item_id, vi.quantity, vi.amount, vt.name AS voucher_type
       FROM voucher_items vi
       JOIN vouchers v ON v.id = vi.voucher_id
       JOIN voucher_types vt ON vt.id = v.type_id
      WHERE v.company_id = ? AND v.date >= ? AND v.date <= ?`,
    companyId,
    companyRow.books_from,
    asOf,
  );
  const movement = new Map();
  for (const row of movementRows) {
    const bucket = movement.get(row.stock_item_id) ?? {
      in_qty: 0,
      in_value: 0,
      out_qty: 0,
      out_value: 0,
    };
    if (STOCK_INWARD.has(row.voucher_type)) {
      bucket.in_qty += row.quantity;
      bucket.in_value += row.amount;
    } else if (STOCK_OUTWARD.has(row.voucher_type)) {
      bucket.out_qty += row.quantity;
      bucket.out_value += row.amount;
    }
    movement.set(row.stock_item_id, bucket);
  }

  const rows = items.map((item) => {
    const m = movement.get(item.id) ?? { in_qty: 0, in_value: 0, out_qty: 0, out_value: 0 };
    const openingQty = Number(item.opening_qty || 0);
    const openingValue = r2(openingQty * Number(item.opening_rate || 0));
    const availableQty = openingQty + m.in_qty;
    const availableValue = openingValue + m.in_value;
    const rate = availableQty > 0 ? availableValue / availableQty : Number(item.opening_rate || 0);
    const closingQty = availableQty - m.out_qty;
    const closingValue = r2(closingQty * rate);
    return {
      ...item,
      opening_qty: r2(openingQty),
      opening_value: openingValue,
      in_qty: r2(m.in_qty),
      in_value: r2(m.in_value),
      out_qty: r2(m.out_qty),
      out_value: r2(m.out_value),
      closing_qty: r2(closingQty),
      rate: r2(rate),
      closing_value: closingValue,
      low_stock: Number(item.reorder_level || 0) > 0 && closingQty < Number(item.reorder_level),
    };
  });

  return {
    asOf,
    rows,
    totalValue: r2(rows.reduce((s, row) => s + row.closing_value, 0)),
    itemCount: rows.length,
  };
}

export function ledgerStatement(companyId, ledgerId, from, to) {
  company(companyId);
  const ledger = q.get(
    `SELECT l.*, g.name AS group_name, g.nature
       FROM ledgers l JOIN groups g ON g.id = l.group_id
      WHERE l.id = ? AND l.company_id = ?`,
    ledgerId,
    companyId,
  );
  if (!ledger) throw Object.assign(new Error("Ledger not found"), { status: 404 });
  const entries = q.all(
    `SELECT e.type, e.amount, v.date, v.number, v.narration, vt.name AS voucher_type
       FROM voucher_entries e
       JOIN vouchers v ON v.id = e.voucher_id
       JOIN voucher_types vt ON vt.id = v.type_id
      WHERE e.ledger_id = ? AND v.date >= ? AND v.date <= ?
      ORDER BY v.date, v.id`,
    ledgerId,
    from,
    to,
  );
  let running = signedOpening(ledger);
  const rows = entries.map((e) => {
    running += (e.type === "Dr" ? 1 : -1) * e.amount;
    return { ...e, balance: r2(running) };
  });
  return {
    ledger: { ...ledger, opening: r2(signedOpening(ledger)) },
    rows,
    closing: r2(running),
  };
}

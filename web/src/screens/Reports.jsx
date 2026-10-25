import React, { useEffect, useMemo, useState } from "react";
import { api } from "../api.js";
import { Button, Balance, DateRange, Empty, ErrorBox, Field, Money, Screen } from "../components.jsx";

const today = () => new Date().toISOString().slice(0, 10);

function useReport(path, deps) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    let alive = true;
    setError(null);
    (async () => {
      try {
        const res = await api.get(path);
        if (alive) setData(res);
      } catch (err) {
        if (alive) setError(err);
      }
    })();
    return () => {
      alive = false;
    };
  }, deps);
  return { data, error };
}

function groupRows(rows) {
  const map = new Map();
  for (const r of rows) {
    if (!map.has(r.group)) map.set(r.group, []);
    map.get(r.group).push(r);
  }
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

export function TrialBalance({ ctx }) {
  const { company, go } = ctx;
  const [range, setRange] = useState({ from: company.books_from, to: today() });
  const { data, error } = useReport(
    `/companies/${company.id}/reports/trial-balance?from=${range.from}&to=${range.to}`,
    [company.id, range.from, range.to],
  );

  const grouped = useMemo(() => (data ? groupRows(data.rows) : []), [data]);

  return (
    <Screen
      title="Trial Balance"
      subtitle={`${company.name} · ${range.from} to ${range.to}`}
      actions={
        <>
          <DateRange from={range.from} to={range.to} onChange={setRange} />
          <Button onClick={() => window.print()}>Print</Button>
        </>
      }
      wide
    >
      <ErrorBox error={error} />
      {!data ? (
        <p className="muted">Loading…</p>
      ) : data.rows.length === 0 ? (
        <Empty>No ledgers with balances.</Empty>
      ) : (
        <table className="data-table report-table">
          <thead>
            <tr>
              <th>Particulars</th>
              <th className="num">Opening</th>
              <th className="num">Debit</th>
              <th className="num">Credit</th>
              <th className="num">Closing</th>
            </tr>
          </thead>
          <tbody>
            {grouped.map(([group, rows]) => (
              <React.Fragment key={group}>
                <tr className="group-row">
                  <td colSpan={5}>{group}</td>
                </tr>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="indent">
                      <button className="link" onClick={() => go("ledger-statement", { id: r.id })}>
                        {r.name}
                      </button>
                    </td>
                    <td className="num"><Balance value={r.opening} /></td>
                    <td className="num"><Money value={r.dr} /></td>
                    <td className="num"><Money value={r.cr} /></td>
                    <td className="num"><Balance value={r.closing} /></td>
                  </tr>
                ))}
              </React.Fragment>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td>Total</td>
              <td className="num" />
              <td className="num"><Money value={data.totalDebit} /></td>
              <td className="num"><Money value={data.totalCredit} /></td>
              <td className="num" />
            </tr>
            <tr className={data.difference === 0 ? "balanced" : "unbalanced"}>
              <td colSpan={4}>Difference</td>
              <td className="num"><Money value={data.difference} /></td>
            </tr>
          </tfoot>
        </table>
      )}
    </Screen>
  );
}

function Side({ title, groups, total, onOpen }) {
  return (
    <div className="bs-side">
      <table className="data-table report-table">
        <thead>
          <tr>
            <th>{title}</th>
            <th className="num">Amount</th>
          </tr>
        </thead>
        <tbody>
          {groups.map(([group, rows]) => (
            <React.Fragment key={group}>
              <tr className="group-row">
                <td colSpan={2}>{group}</td>
              </tr>
              {rows.map((r) => (
                <tr key={r.name}>
                  <td className="indent">
                    {r.id ? (
                      <button className="link" onClick={() => onOpen(r.id)}>{r.name}</button>
                    ) : (
                      r.name
                    )}
                  </td>
                  <td className="num"><Money value={r.amount} /></td>
                </tr>
              ))}
            </React.Fragment>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td>Total</td>
            <td className="num"><Money value={total} /></td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

export function BalanceSheet({ ctx }) {
  const { company, go } = ctx;
  const [asOf, setAsOf] = useState(today());
  const { data, error } = useReport(
    `/companies/${company.id}/reports/balance-sheet?as_of=${asOf}`,
    [company.id, asOf],
  );

  const assets = useMemo(() => {
    if (!data) return [];
    const rows = [...data.assets];
    if (data.profit < 0) {
      rows.push({
        group: "Profit & Loss A/c",
        name: "Net Loss",
        amount: Math.abs(data.profit),
      });
    }
    return groupRows(rows);
  }, [data]);
  const liabilities = useMemo(() => {
    if (!data) return [];
    const rows = [...data.liabilities];
    if (data.profit > 0) {
      rows.push({
        group: "Profit & Loss A/c",
        name: "Net Profit",
        amount: data.profit,
      });
    }
    return groupRows(rows);
  }, [data]);

  return (
    <Screen
      title="Balance Sheet"
      subtitle={`${company.name} as at ${asOf}`}
      actions={
        <>
          <Field label="As at">
            <input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} />
          </Field>
          <Button onClick={() => window.print()}>Print</Button>
        </>
      }
      wide
    >
      <ErrorBox error={error} />
      {!data ? (
        <p className="muted">Loading…</p>
      ) : (
        <>
          <div className="bs-grid">
            <Side title="Liabilities" groups={liabilities} total={data.totalLiabilities} onOpen={(id) => go("ledger-statement", { id })} />
            <Side title="Assets" groups={assets} total={data.totalAssets} onOpen={(id) => go("ledger-statement", { id })} />
          </div>
          <div className={`balance-note ${data.difference === 0 ? "ok" : "bad"}`}>
            {data.difference === 0
              ? "Balance Sheet tallies."
              : `Difference in Balance Sheet: ${data.difference.toFixed(2)}`}
          </div>
        </>
      )}
    </Screen>
  );
}

export function PnL({ ctx }) {
  const { company, go } = ctx;
  const [range, setRange] = useState({ from: company.books_from, to: today() });
  const { data, error } = useReport(
    `/companies/${company.id}/reports/pnl?from=${range.from}&to=${range.to}`,
    [company.id, range.from, range.to],
  );

  return (
    <Screen
      title="Profit & Loss A/c"
      subtitle={`${company.name} · ${range.from} to ${range.to}`}
      actions={
        <>
          <DateRange from={range.from} to={range.to} onChange={setRange} />
          <Button onClick={() => window.print()}>Print</Button>
        </>
      }
      wide
    >
      <ErrorBox error={error} />
      {!data ? (
        <p className="muted">Loading…</p>
      ) : (
        <div className="pnl-grid">
          <section>
            <h2 className="report-section">Expenses</h2>
            <AmountTable rows={data.expenses} total={data.totalExpense} empty="No expenses." onOpen={(id) => go("ledger-statement", { id })} />
          </section>
          <section>
            <h2 className="report-section">Incomes</h2>
            <AmountTable rows={data.income} total={data.totalIncome} empty="No incomes." onOpen={(id) => go("ledger-statement", { id })} />
          </section>
        </div>
      )}
      {data ? (
        <div className={`balance-note ${data.netProfit >= 0 ? "ok" : "bad"}`}>
          {data.netProfit >= 0 ? "Net Profit" : "Net Loss"}: <Money value={Math.abs(data.netProfit)} />
        </div>
      ) : null}
    </Screen>
  );
}

function AmountTable({ rows, total, empty, onOpen }) {
  if (!rows.length) return <Empty>{empty}</Empty>;
  return (
    <table className="data-table report-table">
      <thead>
        <tr>
          <th>Particulars</th>
          <th className="num">Amount</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            <td>
              {r.id ? (
                <button className="link" onClick={() => onOpen(r.id)}>{r.name}</button>
              ) : (
                r.name
              )}{" "}
              <span className="muted tiny">· {r.group}</span>
            </td>
            <td className="num"><Money value={r.amount} /></td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr>
          <td>Total</td>
          <td className="num"><Money value={total} /></td>
        </tr>
      </tfoot>
    </table>
  );
}

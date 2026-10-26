import React, { useEffect, useMemo, useState } from "react";
import { api } from "../api.js";
import { Button, Empty, ErrorBox, Field, Money, Screen } from "../components.jsx";

const today = () => new Date().toISOString().slice(0, 10);

export default function StockSummary({ ctx }) {
  const { company, go } = ctx;
  const [asOf, setAsOf] = useState(today());
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    setError(null);
    (async () => {
      try {
        const res = await api.get(
          `/companies/${company.id}/reports/stock-summary?as_of=${asOf}`,
        );
        if (alive) setData(res);
      } catch (err) {
        if (alive) setError(err);
      }
    })();
    return () => {
      alive = false;
    };
  }, [company.id, asOf]);

  const grouped = useMemo(() => {
    if (!data) return [];
    const map = new Map();
    for (const row of data.rows) {
      const key = row.stock_group_name || "Unclassified";
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(row);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [data]);

  return (
    <Screen
      title="Stock Summary"
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
      ) : data.rows.length === 0 ? (
        <Empty>
          No stock items yet.{" "}
          <button className="link" onClick={() => go("inventory")}>
            Create your first stock item
          </button>
          .
        </Empty>
      ) : (
        <>
          <div className="stock-summary-head">
            <span>{data.itemCount} items</span>
            <span>
              Closing stock value: <strong><Money value={data.totalValue} /></strong>
            </span>
          </div>
          <table className="data-table report-table stock-table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Unit</th>
                <th className="num">Opening</th>
                <th className="num">Inward</th>
                <th className="num">Outward</th>
                <th className="num">Closing</th>
                <th className="num">Rate</th>
                <th className="num">Value</th>
              </tr>
            </thead>
            <tbody>
              {grouped.map(([group, rows]) => (
                <React.Fragment key={group}>
                  <tr className="group-row">
                    <td colSpan={8}>{group}</td>
                  </tr>
                  {rows.map((r) => (
                    <tr key={r.id} className={r.low_stock ? "low-stock" : ""}>
                      <td>
                        {r.name}
                        {r.low_stock ? <span className="pill warn">reorder</span> : null}
                      </td>
                      <td className="muted">{r.unit_symbol || r.unit_name || "—"}</td>
                      <td className="num">{r.opening_qty}</td>
                      <td className="num">{r.in_qty}</td>
                      <td className="num">{r.out_qty}</td>
                      <td className="num"><strong>{r.closing_qty}</strong></td>
                      <td className="num"><Money value={r.rate} /></td>
                      <td className="num"><Money value={r.closing_value} /></td>
                    </tr>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={7}>Closing stock value</td>
                <td className="num"><strong><Money value={data.totalValue} /></strong></td>
              </tr>
            </tfoot>
          </table>
          <p className="muted tiny" style={{ marginTop: 10 }}>
            Inventory is tracked alongside the books. Stock value is memorandum until an opening
            stock / closing stock adjustment is posted, so the Balance Sheet remains ledger-driven.
          </p>
        </>
      )}
    </Screen>
  );
}

import React, { useEffect, useMemo, useState } from "react";
import { api } from "../api.js";
import {
  Button,
  DateRange,
  Empty,
  ErrorBox,
  Field,
  Money,
  Screen,
  useMenuKeyboard,
} from "../components.jsx";

const today = () => new Date().toISOString().slice(0, 10);

export function VoucherMenu({ ctx }) {
  const { data, go } = ctx;
  const types = data.voucherTypes;
  const [index, setIndex] = useMenuKeyboard(types.length, (i) => {
    const t = types[i];
    if (t) go("voucher-new", { type: t.name });
  });

  return (
    <Screen title="Vouchers" subtitle="Choose a voucher type to enter a transaction.">
      <ul className="voucher-types">
        {types.map((t, i) => (
          <li key={t.id}>
            <button
              className={`voucher-type ${i === index ? "selected" : ""}`}
              onMouseEnter={() => setIndex(i)}
              onClick={() => go("voucher-new", { type: t.name })}
            >
              <span>{t.name}</span>
              <small>{t.parent === t.name ? "Primary" : t.parent}</small>
            </button>
          </li>
        ))}
      </ul>
    </Screen>
  );
}

const blankLine = (type) => ({ ledger_id: "", amount: "", type });

export function VoucherForm({ ctx, type }) {
  const { company, data, refresh, notify, back, go } = ctx;
  const voucherType = data.voucherTypes.find((t) => t.name === type);
  const [form, setForm] = useState({
    date: today(),
    number: "",
    narration: "",
  });
  const [lines, setLines] = useState([blankLine("Dr"), blankLine("Cr")]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const ledgers = [...data.ledgers].sort((a, b) => a.name.localeCompare(b.name));
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const totals = useMemo(() => {
    const dr = lines.filter((l) => l.type === "Dr").reduce((s, l) => s + (Number(l.amount) || 0), 0);
    const cr = lines.filter((l) => l.type === "Cr").reduce((s, l) => s + (Number(l.amount) || 0), 0);
    return { dr, cr, diff: Math.round((dr - cr) * 100) / 100 };
  }, [lines]);

  const complete = lines.every((l) => l.ledger_id && Number(l.amount) > 0);
  function updateLine(i, patch) {
    setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  }

  function addLine() {
    setLines((ls) => [...ls, blankLine(ls.filter((l) => l.type === "Dr").length <= ls.filter((l) => l.type === "Cr").length ? "Dr" : "Cr")]);
  }

  function removeLine(i) {
    setLines((ls) => (ls.length > 2 ? ls.filter((_, j) => j !== i) : ls));
  }

  function balance() {
    const dr = lines.filter((l) => l.type === "Dr").reduce((s, l) => s + (Number(l.amount) || 0), 0);
    const cr = lines.filter((l) => l.type === "Cr").reduce((s, l) => s + (Number(l.amount) || 0), 0);
    const diff = Math.round((dr - cr) * 100) / 100;
    if (diff === 0) return;
    const side = diff > 0 ? "Cr" : "Dr";
    const idx = lines.findIndex((l) => l.type === side);
    if (idx === -1) {
      setLines((ls) => [...ls, { ledger_id: "", amount: Math.abs(diff), type: side }]);
    } else {
      updateLine(idx, { amount: Math.abs(diff) });
    }
  }

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post(`/companies/${company.id}/vouchers`, {
        type,
        date: form.date,
        number: form.number || undefined,
        narration: form.narration,
        entries: lines.map((l) => ({
          ledger_id: Number(l.ledger_id),
          amount: Number(l.amount),
          type: l.type,
        })),
      });
      await refresh();
      notify(`${type} voucher saved`);
      go("daybook");
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen
      title={`${type} Voucher`}
      subtitle={`${company.name} · ${voucherType?.parent === type ? "Primary voucher" : voucherType?.parent}`}
      actions={<Button onClick={back}>Cancel</Button>}
      wide
    >
      <form className="voucher-form" onSubmit={submit}>
        <div className="voucher-head">
          <Field label="Date">
            <input type="date" required value={form.date} onChange={set("date")} />
          </Field>
          <Field label="Voucher number" hint="leave blank to auto-number">
            <input value={form.number} onChange={set("number")} placeholder="auto" />
          </Field>
          <Field label="Narration" className="grow">
            <input value={form.narration} onChange={set("narration")} placeholder="Optional narration" />
          </Field>
        </div>

        <table className="data-table entry-table">
          <thead>
            <tr>
              <th>Particulars</th>
              <th className="amt">Debit</th>
              <th className="amt">Credit</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {lines.map((line, i) => (
              <tr key={i}>
                <td>
                  <select
                    value={line.ledger_id}
                    onChange={(e) => updateLine(i, { ledger_id: e.target.value })}
                  >
                    <option value="">Select ledger…</option>
                    {ledgers.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name} — {l.group_name}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="amt">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={line.type === "Dr" ? line.amount : ""}
                    onChange={(e) => updateLine(i, { amount: e.target.value, type: "Dr" })}
                    placeholder={line.type === "Dr" ? "0.00" : "—"}
                  />
                </td>
                <td className="amt">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={line.type === "Cr" ? line.amount : ""}
                    onChange={(e) => updateLine(i, { amount: e.target.value, type: "Cr" })}
                    placeholder={line.type === "Cr" ? "0.00" : "—"}
                  />
                </td>
                <td className="row-actions">
                  {lines.length > 2 ? (
                    <button type="button" className="link danger" onClick={() => removeLine(i)}>
                      remove
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td>
                <button type="button" className="link" onClick={addLine}>+ Add line</button>
              </td>
              <td className="amt"><Money value={totals.dr} /></td>
              <td className="amt"><Money value={totals.cr} /></td>
              <td />
            </tr>
            <tr className={totals.diff === 0 ? "balanced" : "unbalanced"}>
              <td>Difference</td>
              <td className="amt" colSpan={2}>
                <Money value={totals.diff} /> {totals.diff === 0 && totals.dr > 0 ? "· balanced" : ""}
              </td>
              <td className="row-actions">
                {totals.diff !== 0 ? (
                  <button type="button" className="link" onClick={balance}>balance</button>
                ) : null}
              </td>
            </tr>
          </tfoot>
        </table>

        <ErrorBox error={error} />
        <div className="form-actions">
          <Button
            variant="primary"
            type="submit"
            disabled={busy || !complete || totals.diff !== 0}
          >
            {busy ? "Saving…" : "Accept voucher"}
          </Button>
          <Button type="button" onClick={back}>Cancel</Button>
          <span className="muted tiny">
            Dr {totals.dr.toFixed(2)} / Cr {totals.cr.toFixed(2)}
          </span>
        </div>
      </form>
    </Screen>
  );
}

export function DayBook({ ctx }) {
  const { company, data, refresh, notify } = ctx;
  const [range, setRange] = useState({ from: company.books_from, to: today() });
  const [type, setType] = useState("");
  const [rows, setRows] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  async function remove(voucher) {
    if (!window.confirm(`Delete ${voucher.type_name} ${voucher.number}?`)) return;
    try {
      await api.del(`/companies/${company.id}/vouchers/${voucher.id}`);
      setRows((rs) => rs.filter((v) => v.id !== voucher.id));
      notify(`Deleted ${voucher.number}`);
      await refresh();
    } catch (err) {
      setError(err);
    }
  }

  useEffect(() => {
    setLoading(true);
    (async () => {
      try {
        const qs = new URLSearchParams({ from: range.from, to: range.to });
        if (type) qs.set("type", type);
        const res = await api.get(`/companies/${company.id}/reports/daybook?${qs}`);
        setRows(res.vouchers);
      } catch (err) {
        setError(err);
      } finally {
        setLoading(false);
      }
    })();
  }, [company.id, range.from, range.to, type]);

  return (
    <Screen
      title="Day Book"
      subtitle={`${company.name} · ${range.from} to ${range.to}`}
      actions={<DateRange from={range.from} to={range.to} onChange={setRange} />}
      wide
    >
      <div className="toolbar">
        <select value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">All voucher types</option>
          {data.voucherTypes.map((t) => (
            <option key={t.id} value={t.name}>{t.name}</option>
          ))}
        </select>
        <span className="muted tiny">{rows.length} vouchers</span>
      </div>

      <ErrorBox error={error} />
      {loading ? (
        <p className="muted">Loading…</p>
      ) : rows.length === 0 ? (
        <Empty>No vouchers in this period.</Empty>
      ) : (
        <div className="daybook">
          {rows.map((v) => (
            <article className="voucher-card" key={v.id}>
              <header>
                <div>
                  <strong>{v.type_name} {v.number}</strong>
                  <span className="muted"> · {v.date}</span>
                </div>
                <div className="voucher-meta">
                  <span className="muted tiny">{v.narration || "No narration"}</span>
                  <button className="link danger" onClick={() => remove(v)}>delete</button>
                </div>
              </header>
              <table className="data-table compact-table">
                <thead>
                  <tr>
                    <th>Particulars</th>
                    <th className="num">Debit</th>
                    <th className="num">Credit</th>
                  </tr>
                </thead>
                <tbody>
                  {v.entries.map((e) => (
                    <tr key={e.id}>
                      <td>{e.ledger_name}</td>
                      <td className="num">
                        {e.type === "Dr" ? <Money value={e.amount} /> : ""}
                      </td>
                      <td className="num">
                        {e.type === "Cr" ? <Money value={e.amount} /> : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </article>
          ))}
        </div>
      )}
    </Screen>
  );
}

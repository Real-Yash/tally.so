import React, { useEffect, useMemo, useState } from "react";
import { api } from "../api.js";
import {
  Button,
  Balance,
  DateRange,
  Empty,
  ErrorBox,
  Field,
  Money,
  Screen,
  Toolbar,
} from "../components.jsx";

const today = () => new Date().toISOString().slice(0, 10);

export function LedgerList({ ctx }) {
  const { company, data, go } = ctx;
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const tb = await api.get(
          `/companies/${company.id}/reports/trial-balance?from=${company.books_from}&to=${today()}`,
        );
        setRows(tb.rows);
      } catch (err) {
        setError(err);
      } finally {
        setLoading(false);
      }
    })();
  }, [company.id, company.books_from]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter(
      (r) => r.name.toLowerCase().includes(s) || r.group_name.toLowerCase().includes(s),
    );
  }, [rows, search]);

  const totals = filtered.reduce(
    (acc, r) => ({ debit: acc.debit + r.debit, credit: acc.credit + r.credit }),
    { debit: 0, credit: 0 },
  );

  return (
    <Screen
      title="Chart of Accounts"
      subtitle={`${company.name} · ${data.groups.length} groups · ${rows.length} ledgers`}
      actions={
        <>
          <Button onClick={() => go("ledger-form")}>Create ledger</Button>
        </>
      }
      wide
    >
      <Toolbar>
        <input
          className="search"
          placeholder="Search ledger or group…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <span className="muted tiny">{filtered.length} shown</span>
      </Toolbar>

      <ErrorBox error={error} />
      {loading ? (
        <p className="muted">Loading ledgers…</p>
      ) : filtered.length === 0 ? (
        <Empty>No ledgers yet. Create one to get started.</Empty>
      ) : (
        <table className="data-table ledger-table">
          <thead>
            <tr>
              <th>Ledger</th>
              <th>Under group</th>
              <th className="num">Opening</th>
              <th className="num">Debit</th>
              <th className="num">Credit</th>
              <th className="num">Closing</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id} className="clickable" onClick={() => go("ledger-form", { id: r.id })}>
                <td>{r.name}</td>
                <td className="muted">{r.group_name}</td>
                <td className="num">
                  <Balance value={r.opening} />
                </td>
                <td className="num">
                  <Money value={r.dr} />
                </td>
                <td className="num">
                  <Money value={r.cr} />
                </td>
                <td className="num">
                  <strong><Balance value={r.closing} /></strong>
                </td>
                <td className="row-actions">
                  <button
                    className="link"
                    onClick={(e) => {
                      e.stopPropagation();
                      go("ledger-statement", { id: r.id });
                    }}
                  >
                    statement
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={2}>Total</td>
              <td className="num" />
              <td className="num"><Money value={totals.debit} /></td>
              <td className="num"><Money value={totals.credit} /></td>
              <td className="num" />
              <td />
            </tr>
          </tfoot>
        </table>
      )}
    </Screen>
  );
}

export function LedgerForm({ ctx, id }) {
  const { company, data, refresh, notify, back, go } = ctx;
  const existing = id ? data.ledgers.find((l) => l.id === Number(id)) : null;

  const [form, setForm] = useState({
    name: existing?.name ?? "",
    group_name: existing?.group_name ?? "Cash-in-Hand",
    opening_balance: existing?.opening_balance ?? 0,
    opening_type: existing?.opening_type ?? "Dr",
    gstin: existing?.gstin ?? "",
    pan: existing?.pan ?? "",
    mobile: existing?.mobile ?? "",
    email: existing?.email ?? "",
    bank_account: existing?.bank_account ?? "",
    ifsc: existing?.ifsc ?? "",
    address: existing?.address ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const groups = [...data.groups].sort((a, b) => a.name.localeCompare(b.name));

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (existing) {
        await api.put(`/companies/${company.id}/ledgers/${existing.id}`, form);
        notify(`Ledger '${form.name}' altered`);
      } else {
        await api.post(`/companies/${company.id}/ledgers`, form);
        notify(`Ledger '${form.name}' created`);
      }
      await refresh();
      back();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen
      title={existing ? "Alter Ledger" : "Create Ledger"}
      subtitle={existing ? `Editing ${existing.name}` : "A ledger is an account head under a group."}
      actions={
        existing ? (
          <Button onClick={() => go("ledger-statement", { id: existing.id })}>View statement</Button>
        ) : null
      }
    >
      <form className="form" onSubmit={submit}>
        <div className="form-grid">
          <Field label="Name" className="span-2">
            <input autoFocus required value={form.name} onChange={set("name")} />
          </Field>
          <Field label="Under group" className="span-2">
            <select value={form.group_name} onChange={set("group_name")}>
              {groups.map((g) => (
                <option key={g.id} value={g.name}>
                  {g.name}
                  {g.parent_name ? `  (${g.parent_name})` : ""}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Opening balance">
            <input
              type="number"
              step="0.01"
              value={form.opening_balance}
              onChange={set("opening_balance")}
            />
          </Field>
          <Field label="Dr / Cr">
            <select value={form.opening_type} onChange={set("opening_type")}>
              <option value="Dr">Dr</option>
              <option value="Cr">Cr</option>
            </select>
          </Field>

          <Field label="GSTIN">
            <input value={form.gstin} onChange={set("gstin")} />
          </Field>
          <Field label="PAN / Income-tax no.">
            <input value={form.pan} onChange={set("pan")} />
          </Field>
          <Field label="Mobile">
            <input value={form.mobile} onChange={set("mobile")} />
          </Field>
          <Field label="Email">
            <input type="email" value={form.email} onChange={set("email")} />
          </Field>
          <Field label="Bank account number">
            <input value={form.bank_account} onChange={set("bank_account")} />
          </Field>
          <Field label="IFSC">
            <input value={form.ifsc} onChange={set("ifsc")} />
          </Field>
          <Field label="Address" className="span-2">
            <textarea rows={3} value={form.address} onChange={set("address")} />
          </Field>
        </div>

        <ErrorBox error={error} />
        <div className="form-actions">
          <Button variant="primary" type="submit" disabled={busy}>
            {busy ? "Saving…" : existing ? "Alter" : "Create"}
          </Button>
          <Button onClick={back} type="button">Cancel</Button>
        </div>
      </form>
    </Screen>
  );
}

export function LedgerStatement({ ctx, id }) {
  const { company } = ctx;
  const [range, setRange] = useState({ from: company.books_from, to: today() });
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get(
          `/companies/${company.id}/ledgers/${id}/statement?from=${range.from}&to=${range.to}`,
        );
        setData(res);
      } catch (err) {
        setError(err);
      }
    })();
  }, [company.id, id, range.from, range.to]);

  if (!data) return <Screen title="Ledger Statement"><ErrorBox error={error} /><p className="muted">Loading…</p></Screen>;

  return (
    <Screen
      title={`Ledger Statement — ${data.ledger.name}`}
      subtitle={`${data.ledger.group_name} · opening ${data.ledger.opening}`}
      actions={<DateRange from={range.from} to={range.to} onChange={setRange} />}
      wide
    >
      <ErrorBox error={error} />
      {data.rows.length === 0 ? (
        <Empty>No transactions in this period.</Empty>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Voucher</th>
              <th>Type</th>
              <th>Narration</th>
              <th className="num">Debit</th>
              <th className="num">Credit</th>
              <th className="num">Balance</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r, i) => (
              <tr key={i}>
                <td>{r.date}</td>
                <td>{r.number}</td>
                <td>{r.voucher_type}</td>
                <td className="muted">{r.narration || "—"}</td>
                <td className="num">{r.type === "Dr" ? <Money value={r.amount} /> : ""}</td>
                <td className="num">{r.type === "Cr" ? <Money value={r.amount} /> : ""}</td>
                <td className="num"><Balance value={r.balance} /></td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={6}>Closing balance</td>
              <td className="num"><strong><Balance value={data.closing} /></strong></td>
            </tr>
          </tfoot>
        </table>
      )}
    </Screen>
  );
}

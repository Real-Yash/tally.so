import React, { useMemo, useState } from "react";
import { api } from "../api.js";
import { Button, Empty, ErrorBox, Field, Screen } from "../components.jsx";

const NATURES = [
  ["asset", "Assets"],
  ["liability", "Liabilities"],
  ["income", "Income"],
  ["expense", "Expenses"],
];

export default function Groups({ ctx }) {
  const { company, data, refresh, notify } = ctx;
  const [form, setForm] = useState({ name: "", parent_name: "", nature: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const grouped = useMemo(() => {
    const counts = new Map();
    for (const l of data.ledgers) counts.set(l.group_id, (counts.get(l.group_id) ?? 0) + 1);
    return NATURES.map(([nature, label]) => [
      nature,
      label,
      data.groups
        .filter((g) => g.nature === nature)
        .map((g) => ({ ...g, ledgers: counts.get(g.id) ?? 0 }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    ]);
  }, [data.groups, data.ledgers]);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post(`/companies/${company.id}/groups`, {
        name: form.name,
        parent_name: form.parent_name || null,
        nature: form.nature || undefined,
      });
      await refresh();
      notify(`Group '${form.name}' created`);
      setForm({ name: "", parent_name: "", nature: "" });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen
      title="Groups"
      subtitle={`${company.name} · ${data.groups.length} groups. A group decides how its ledgers appear in reports.`}
      wide
    >
      <div className="form" style={{ marginBottom: 18 }}>
        <h2 className="report-section">Create group</h2>
        <form onSubmit={submit}>
          <div className="form-grid">
            <Field label="Group name">
              <input required value={form.name} onChange={set("name")} placeholder="e.g. Freight & Cartage" />
            </Field>
            <Field label="Under group" hint="Leave blank for a primary group">
              <select value={form.parent_name} onChange={set("parent_name")}>
                <option value="">— primary —</option>
                {[...data.groups]
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map((g) => (
                    <option key={g.id} value={g.name}>
                      {g.name}
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="Nature" hint="Used for the Balance Sheet / P&L split">
              <select value={form.nature} onChange={set("nature")}>
                <option value="">inherit from parent</option>
                {NATURES.map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </Field>
          </div>
          <ErrorBox error={error} />
          <div className="form-actions">
            <Button type="submit" variant="primary" disabled={busy}>Create group</Button>
          </div>
        </form>
      </div>

      <div className="group-sections">
        {grouped.map(([nature, label, rows]) => (
          <section key={nature} className="group-section">
            <h2 className="report-section">{label}</h2>
            {rows.length === 0 ? (
              <Empty>No groups.</Empty>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Group</th>
                    <th>Under</th>
                    <th className="num">Ledgers</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((g) => (
                    <tr key={g.id}>
                      <td>{g.name}</td>
                      <td className="muted">{g.parent_name || "Primary"}</td>
                      <td className="num">{g.ledgers}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        ))}
      </div>
    </Screen>
  );
}

import React, { useEffect, useMemo, useState } from "react";
import { api } from "../api.js";
import { Button, Empty, ErrorBox, Field, Money, Screen } from "../components.jsx";

const emptyItem = () => ({
  name: "",
  stock_group_name: "",
  unit_name: "Nos",
  opening_qty: "0",
  opening_rate: "0",
  gst_rate: "18",
  hsn: "",
  reorder_level: "0",
});

const emptyUnit = () => ({ name: "", symbol: "" });
const emptyGroup = () => ({ name: "", parent_name: "" });

export default function Inventory({ ctx }) {
  const { company, data, refresh, notify, go } = ctx;
  const [tab, setTab] = useState("items");
  const [error, setError] = useState(null);
  const [summary, setSummary] = useState(null);

  const [itemForm, setItemForm] = useState(null);
  const [editingItem, setEditingItem] = useState(null);
  const [busy, setBusy] = useState(false);

  const [unitForm, setUnitForm] = useState(emptyUnit());
  const [groupForm, setGroupForm] = useState(emptyGroup());

  const items = data.stockItems ?? [];
  const units = data.units ?? [];
  const groups = data.stockGroups ?? [];

  const closing = useMemo(() => {
    const map = new Map();
    for (const row of summary?.rows ?? []) map.set(row.id, row);
    return map;
  }, [summary]);

  async function loadSummary() {
    try {
      const res = await api.get(`/companies/${company.id}/reports/stock-summary`);
      setSummary(res);
    } catch (err) {
      setError(err);
    }
  }

  useEffect(() => {
    loadSummary();
  }, [company.id]);

  function startNew() {
    setEditingItem(null);
    setItemForm(emptyItem());
    setError(null);
  }

  function startEdit(item) {
    setEditingItem(item);
    setItemForm({
      name: item.name,
      stock_group_name: item.stock_group_name || "",
      unit_name: item.unit_name || "",
      opening_qty: String(item.opening_qty ?? 0),
      opening_rate: String(item.opening_rate ?? 0),
      gst_rate: String(item.gst_rate ?? 0),
      hsn: item.hsn || "",
      reorder_level: String(item.reorder_level ?? 0),
    });
    setError(null);
  }

  async function saveItem(e) {
    e.preventDefault();
    if (!itemForm?.name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const payload = {
        name: itemForm.name.trim(),
        stock_group_name: itemForm.stock_group_name || null,
        unit_name: itemForm.unit_name || null,
        opening_qty: Number(itemForm.opening_qty) || 0,
        opening_rate: Number(itemForm.opening_rate) || 0,
        gst_rate: Number(itemForm.gst_rate) || 0,
        hsn: itemForm.hsn.trim() || null,
        reorder_level: Number(itemForm.reorder_level) || 0,
      };
      if (editingItem) {
        await api.put(`/companies/${company.id}/stock-items/${editingItem.id}`, payload);
        notify(`Altered ${payload.name}`);
      } else {
        await api.post(`/companies/${company.id}/stock-items`, payload);
        notify(`Created ${payload.name}`);
      }
      await refresh();
      await loadSummary();
      setItemForm(null);
      setEditingItem(null);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  async function saveUnit(e) {
    e.preventDefault();
    if (!unitForm.name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api.post(`/companies/${company.id}/units`, {
        name: unitForm.name.trim(),
        symbol: unitForm.symbol.trim() || null,
      });
      await refresh();
      notify(`Created unit ${unitForm.name.trim()}`);
      setUnitForm(emptyUnit());
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  async function saveGroup(e) {
    e.preventDefault();
    if (!groupForm.name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api.post(`/companies/${company.id}/stock-groups`, {
        name: groupForm.name.trim(),
        parent_name: groupForm.parent_name || null,
      });
      await refresh();
      notify(`Created stock group ${groupForm.name.trim()}`);
      setGroupForm(emptyGroup());
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen
      title="Inventory Masters"
      subtitle={`${company.name} · stock items, units and stock groups`}
      actions={
        <div className="tabs">
          <button className={tab === "items" ? "active" : ""} onClick={() => setTab("items")}>
            Stock Items <span className="count">{items.length}</span>
          </button>
          <button className={tab === "units" ? "active" : ""} onClick={() => setTab("units")}>
            Units <span className="count">{units.length}</span>
          </button>
          <button className={tab === "groups" ? "active" : ""} onClick={() => setTab("groups")}>
            Stock Groups <span className="count">{groups.length}</span>
          </button>
        </div>
      }
      wide
    >
      <ErrorBox error={error} />

      {tab === "items" ? (
        <>
          <div className="toolbar">
            <Button variant="primary" onClick={startNew}>+ New stock item</Button>
            <Button onClick={() => go("stock")}>Stock Summary</Button>
            <span className="muted tiny">
              Closing quantities are live from vouchers. Opening stock is set on the item.
            </span>
          </div>

          {itemForm ? (
            <form className="inline-form" onSubmit={saveItem}>
              <h2>{editingItem ? `Alter ${editingItem.name}` : "Create stock item"}</h2>
              <div className="form-grid">
                <Field label="Name">
                  <input
                    autoFocus
                    required
                    value={itemForm.name}
                    onChange={(e) => setItemForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="e.g. USB-C Cable"
                  />
                </Field>
                <Field label="Stock group">
                  <select
                    value={itemForm.stock_group_name}
                    onChange={(e) =>
                      setItemForm((f) => ({ ...f, stock_group_name: e.target.value }))
                    }
                  >
                    <option value="">— none —</option>
                    {groups.map((g) => (
                      <option key={g.id} value={g.name}>{g.name}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Base unit">
                  <select
                    value={itemForm.unit_name}
                    onChange={(e) => setItemForm((f) => ({ ...f, unit_name: e.target.value }))}
                  >
                    <option value="">— none —</option>
                    {units.map((u) => (
                      <option key={u.id} value={u.name}>{u.name} ({u.symbol})</option>
                    ))}
                  </select>
                </Field>
                <Field label="GST rate %">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={itemForm.gst_rate}
                    onChange={(e) => setItemForm((f) => ({ ...f, gst_rate: e.target.value }))}
                  />
                </Field>
                <Field label="Opening quantity">
                  <input
                    type="number"
                    step="0.001"
                    value={itemForm.opening_qty}
                    onChange={(e) => setItemForm((f) => ({ ...f, opening_qty: e.target.value }))}
                  />
                </Field>
                <Field label="Opening rate">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={itemForm.opening_rate}
                    onChange={(e) => setItemForm((f) => ({ ...f, opening_rate: e.target.value }))}
                  />
                </Field>
                <Field label="HSN / SAC">
                  <input
                    value={itemForm.hsn}
                    onChange={(e) => setItemForm((f) => ({ ...f, hsn: e.target.value }))}
                    placeholder="e.g. 8544"
                  />
                </Field>
                <Field label="Reorder level" hint="shows a warning on Stock Summary">
                  <input
                    type="number"
                    step="0.001"
                    min="0"
                    value={itemForm.reorder_level}
                    onChange={(e) =>
                      setItemForm((f) => ({ ...f, reorder_level: e.target.value }))
                    }
                  />
                </Field>
              </div>
              <div className="form-actions">
                <Button variant="primary" type="submit" disabled={busy || !itemForm.name.trim()}>
                  {busy ? "Saving…" : editingItem ? "Alter item" : "Create item"}
                </Button>
                <Button type="button" onClick={() => { setItemForm(null); setEditingItem(null); }}>
                  Cancel
                </Button>
              </div>
            </form>
          ) : null}

          {items.length === 0 ? (
            <Empty>No stock items yet. Create one to start tracking inventory.</Empty>
          ) : (
            <table className="data-table report-table inventory-table">
              <thead>
                <tr>
                  <th>Stock item</th>
                  <th>Group</th>
                  <th>Unit</th>
                  <th className="num">Opening</th>
                  <th className="num">Closing</th>
                  <th className="num">Value</th>
                  <th className="num">GST %</th>
                  <th>HSN</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const s = closing.get(item.id);
                  return (
                    <tr key={item.id}>
                      <td>
                        <strong>{item.name}</strong>
                        {s?.low_stock ? <span className="pill warn">reorder</span> : null}
                      </td>
                      <td className="muted">{item.stock_group_name || "—"}</td>
                      <td className="muted">{item.unit_symbol || item.unit_name || "—"}</td>
                      <td className="num">{item.opening_qty}</td>
                      <td className="num">
                        {s ? <strong>{s.closing_qty}</strong> : "—"}
                      </td>
                      <td className="num">{s ? <Money value={s.closing_value} /> : "—"}</td>
                      <td className="num">{item.gst_rate ? `${item.gst_rate}%` : "—"}</td>
                      <td className="muted">{item.hsn || "—"}</td>
                      <td className="row-actions">
                        <button className="link" onClick={() => startEdit(item)}>alter</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={5}>{items.length} stock items</td>
                  <td className="num"><Money value={summary?.totalValue ?? 0} /></td>
                  <td colSpan={3} />
                </tr>
              </tfoot>
            </table>
          )}
        </>
      ) : null}

      {tab === "units" ? (
        <>
          <form className="inline-form compact-form" onSubmit={saveUnit}>
            <h2>Create unit</h2>
            <div className="form-grid">
              <Field label="Unit name">
                <input
                  required
                  value={unitForm.name}
                  onChange={(e) => setUnitForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Dozen"
                />
              </Field>
              <Field label="Symbol">
                <input
                  value={unitForm.symbol}
                  onChange={(e) => setUnitForm((f) => ({ ...f, symbol: e.target.value }))}
                  placeholder="e.g. dz"
                />
              </Field>
            </div>
            <div className="form-actions">
              <Button variant="primary" type="submit" disabled={busy || !unitForm.name.trim()}>
                Create unit
              </Button>
            </div>
          </form>

          {units.length === 0 ? (
            <Empty>No units yet.</Empty>
          ) : (
            <table className="data-table">
              <thead>
                <tr><th>Unit</th><th>Symbol</th></tr>
              </thead>
              <tbody>
                {units.map((u) => (
                  <tr key={u.id}><td>{u.name}</td><td className="muted">{u.symbol || "—"}</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      ) : null}

      {tab === "groups" ? (
        <>
          <form className="inline-form compact-form" onSubmit={saveGroup}>
            <h2>Create stock group</h2>
            <div className="form-grid">
              <Field label="Group name">
                <input
                  required
                  value={groupForm.name}
                  onChange={(e) => setGroupForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Packaged Goods"
                />
              </Field>
              <Field label="Parent group">
                <select
                  value={groupForm.parent_name}
                  onChange={(e) => setGroupForm((f) => ({ ...f, parent_name: e.target.value }))}
                >
                  <option value="">— primary —</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.name}>{g.name}</option>
                  ))}
                </select>
              </Field>
            </div>
            <div className="form-actions">
              <Button variant="primary" type="submit" disabled={busy || !groupForm.name.trim()}>
                Create group
              </Button>
            </div>
          </form>

          {groups.length === 0 ? (
            <Empty>No stock groups yet.</Empty>
          ) : (
            <table className="data-table">
              <thead>
                <tr><th>Stock group</th><th>Under</th></tr>
              </thead>
              <tbody>
                {groups.map((g) => (
                  <tr key={g.id}>
                    <td>{g.name}</td>
                    <td className="muted">{g.parent_name || "Primary"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      ) : null}
    </Screen>
  );
}

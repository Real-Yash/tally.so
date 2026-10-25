import React, { useState } from "react";
import { api } from "../api.js";
import { Button, ErrorBox, Field, Screen } from "../components.jsx";

function currentFyStart() {
  const d = new Date();
  const y = d.getMonth() + 1 >= 4 ? d.getFullYear() : d.getFullYear() - 1;
  return `${y}-04-01`;
}

function CompanyForm({ ctx, onCreated, compact = false }) {
  const { reloadCompanies, openCompany, notify } = ctx;
  const [form, setForm] = useState({
    name: "",
    books_from: currentFyStart(),
    state: "",
    gstin: "",
    demo: true,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const set = (k) => (e) =>
    setForm((f) => ({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const created = await api.post("/companies", form);
      await reloadCompanies();
      notify(`Company '${created.company.name}' created`);
      if (onCreated) await onCreated(created);
      else await openCompany(created.company.id);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className={`company-form ${compact ? "compact" : ""}`} onSubmit={submit}>
      <div className="form-grid">
        <Field label="Company name" className="span-2">
          <input
            autoFocus
            required
            value={form.name}
            onChange={set("name")}
            placeholder="e.g. Acme Traders"
          />
        </Field>
        <Field label="Books from">
          <input type="date" value={form.books_from} onChange={set("books_from")} />
        </Field>
        <Field label="State">
          <input value={form.state} onChange={set("state")} placeholder="Maharashtra" />
        </Field>
        <Field label="GSTIN" className="span-2">
          <input value={form.gstin} onChange={set("gstin")} placeholder="27AABCU9603R1ZM" />
        </Field>
      </div>
      <label className="check">
        <input type="checkbox" checked={form.demo} onChange={set("demo")} />
        Seed sample ledgers and vouchers
      </label>
      <ErrorBox error={error} />
      <div className="form-actions">
        <Button variant="primary" type="submit" disabled={busy}>
          {busy ? "Creating…" : "Create company"}
        </Button>
      </div>
    </form>
  );
}

export function Welcome({ ctx }) {
  const { companies, openCompany } = ctx;
  const [showForm, setShowForm] = useState(companies.length === 0);

  return (
    <div className="welcome">
      <div className="welcome-card">
        <div className="welcome-brand">
          Tally<span>Prime</span>
        </div>
        <h1>Welcome to TallyClone</h1>
        <p className="muted">
          A TallyPrime-style accounting core: double-entry vouchers, masters and reports.
        </p>

        {companies.length ? (
          <div className="company-picker">
            <div className="menu-title">SELECT COMPANY</div>
            <ul>
              {companies.map((c) => (
                <li key={c.id}>
                  <button className="company-row" onClick={() => openCompany(c.id)}>
                    <span>{c.name}</span>
                    <small>
                      {c.stats.ledgers} ledgers · {c.stats.vouchers} vouchers
                    </small>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="welcome-actions">
          <Button variant="primary" onClick={() => setShowForm((v) => !v)}>
            {showForm ? "Hide form" : "Create company"}
          </Button>
        </div>

        {showForm ? <CompanyForm ctx={ctx} compact /> : null}

        <p className="welcome-foot">
          Data stays on this machine (SQLite). Import masters from a live TallyPrime over port
          9000 from the Utilities menu.
        </p>
      </div>
    </div>
  );
}

export function Companies({ ctx }) {
  const { companies, openCompany, reloadCompanies, notify } = ctx;
  const [busy, setBusy] = useState(null);

  async function open(id) {
    setBusy(id);
    try {
      await openCompany(id);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Screen
      title="Company"
      subtitle="Select the company to work on, or create a new one."
      actions={<Button onClick={reloadCompanies}>Reload</Button>}
      wide
    >
      <div className="company-list">
        {companies.map((c) => (
          <div className={`company-card ${c.id === ctx.company?.id ? "active" : ""}`} key={c.id}>
            <div>
              <h3>{c.name}</h3>
              <p className="muted">
                Books from {c.books_from}
                {c.state ? ` · ${c.state}` : ""}
                {c.gstin ? ` · ${c.gstin}` : ""}
              </p>
              <p className="tiny">
                {c.stats.ledgers} ledgers · {c.stats.vouchers} vouchers · {c.stats.groups} groups
              </p>
            </div>
            <Button variant="primary" onClick={() => open(c.id)} disabled={busy === c.id}>
              {c.id === ctx.company?.id ? "Continue" : "Open"}
            </Button>
          </div>
        ))}
      </div>

      <div className="panel">
        <h2>Create company</h2>
        <CompanyForm
          ctx={ctx}
          onCreated={async (created) => {
            await openCompany(created.company.id);
            notify(`Opened ${created.company.name}`);
          }}
        />
      </div>
    </Screen>
  );
}

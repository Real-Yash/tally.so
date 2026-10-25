import React, { useState } from "react";
import { api } from "../api.js";
import { Button, ErrorBox, Field, Screen } from "../components.jsx";

export default function ImportTally({ ctx }) {
  const { company, refresh, notify, go } = ctx;
  const [form, setForm] = useState({
    host: "100.100.10.10",
    port: 9000,
    remote_company: "Test Co",
  });
  const [probe, setProbe] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function test() {
    setBusy(true);
    setError(null);
    setProbe(null);
    try {
      const res = await api.post("/tally/probe", {
        host: form.host,
        port: Number(form.port),
        company: form.remote_company,
      });
      setProbe(res);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  async function runImport() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await api.post(`/companies/${company.id}/import/tally`, {
        host: form.host,
        port: Number(form.port),
        remote_company: form.remote_company,
      });
      setResult(res);
      await refresh();
      notify(`Imported ${res.ledgers} ledgers from ${form.remote_company}`);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen
      title="Import from TallyPrime"
      subtitle="Pull masters from a live TallyPrime over the HTTP/ODBC endpoint on port 9000."
      actions={<Button onClick={() => go("ledgers")}>View ledgers</Button>}
    >
      <div className="panel">
        <p className="muted">
          TallyPrime answers <code>REPORTNAME=ODBC Report</code> requests with typed result sets.
          This app reads <code>Groups</code>, <code>Ledger</code> and opening balances using the
          same envelope recovered during the 7.2 assessment.
        </p>
        <p className="muted tiny">
          Tip: import into a new or empty company. Ledgers that already exist under the same name
          are updated in place.
        </p>

        <div className="form-grid">
          <Field label="Host">
            <input value={form.host} onChange={set("host")} placeholder="127.0.0.1" />
          </Field>
          <Field label="Port">
            <input value={form.port} onChange={set("port")} inputMode="numeric" />
          </Field>
          <Field label="Remote company name" className="span-2">
            <input
              value={form.remote_company}
              onChange={set("remote_company")}
              placeholder="Test Co"
            />
          </Field>
        </div>

        <div className="form-actions">
          <Button onClick={test} disabled={busy}>Test connection</Button>
          <Button variant="primary" onClick={runImport} disabled={busy}>
            {busy ? "Working…" : "Import masters"}
          </Button>
        </div>

        <ErrorBox error={error} />

        {probe ? (
          <div className="result-box ok">
            Connected. Remote companies: <strong>{probe.companies.join(", ") || "(none)"}</strong>
          </div>
        ) : null}

        {result ? (
          <div className="result-box ok">
            <p>
              Read <strong>{result.groups}</strong> groups and <strong>{result.ledgers}</strong>{" "}
              ledgers · created <strong>{result.created}</strong>, updated{" "}
              <strong>{result.updated}</strong>
              {result.skipped ? <> , skipped <strong>{result.skipped}</strong></> : null}.
            </p>
            {result.warnings.length ? (
              <ul className="warnings">
                {result.warnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="panel muted-panel">
        <h2>Why this works</h2>
        <p>
          The 7.2 assessment found port 9000 unauthenticated and SQL-capable. The import path here
          is deliberately read-only: it issues three <code>SELECT</code> statements and never sends
          TDL or write methods. Use it against systems you own.
        </p>
      </div>
    </Screen>
  );
}

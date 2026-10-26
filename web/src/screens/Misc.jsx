import React from "react";
import { Screen } from "../components.jsx";

export function About({ ctx }) {
  return (
    <Screen title="About TallyClone" subtitle="A TallyPrime-style accounting core, built from the 7.2 report.">
      <div className="panel">
        <h2>What this is</h2>
        <p>
          A clean-room accounting application that follows TallyPrime’s interaction model and
          master/voucher vocabulary. It is not a binary clone and shares no Tally code; the data
          model, groups and field names are informed by the reverse-engineering report.
        </p>
        <h2>Implemented so far</h2>
        <ul className="roadmap">
          <li>Companies with financial-year books, GSTIN and state.</li>
          <li>Groups, ledgers, opening balances and contact/bank fields.</li>
          <li>Contra, Payment, Receipt, Journal, Sales, Purchase, Credit Note and Debit Note.</li>
          <li>Double-entry validation, auto numbering, day book and ledger statements.</li>
          <li>Trial Balance, Balance Sheet and Profit &amp; Loss A/c.</li>
          <li>Stock items, units, stock groups, item lines on vouchers and Stock Summary.</li>
          <li>Masters import from a live TallyPrime on port 9000 and Tally-compatible XML export.</li>
        </ul>
        <h2>Deliberately not here yet</h2>
        <p className="muted">
          GST computation and e-invoicing, godowns and batches, payroll, multi-currency, cost
          centres, TDL scripting, user roles, audit trail, printing templates and sync.
        </p>
        <h2>Report</h2>
        <p>
          The source assessment is served on the tailnet at{" "}
          <a href="http://devbox.kingfisher-copperhead.ts.net:8088/" target="_blank" rel="noreferrer">
            devbox.kingfisher-copperhead.ts.net:8088
          </a>.
        </p>
      </div>
    </Screen>
  );
}

import React from "react";
import { useMenuKeyboard } from "../components.jsx";

const SECTIONS = [
  {
    title: "MASTERS",
    items: [
      { label: "Create Ledger", hint: "New account head", view: "ledger-form" },
      { label: "Alter Ledger", hint: "Edit an existing account", view: "ledgers" },
      { label: "Chart of Accounts", hint: "All ledgers and groups", view: "ledgers" },
      { label: "Groups", hint: "Create or review account groups", view: "groups" },
    ],
  },
  {
    title: "TRANSACTIONS",
    items: [
      { label: "Vouchers", hint: "Payment, receipt, journal, sales…", view: "voucher-menu" },
      { label: "Day Book", hint: "All vouchers for the period", view: "daybook" },
    ],
  },
  {
    title: "REPORTS",
    items: [
      { label: "Balance Sheet", view: "balance-sheet" },
      { label: "Profit & Loss A/c", view: "pnl" },
      { label: "Trial Balance", view: "trial" },
      { label: "Stock Summary", hint: "Phase 2 — inventory reports", view: "stock" },
    ],
  },
  {
    title: "UTILITIES",
    items: [
      { label: "Import from TallyPrime", hint: "Pull masters over port 9000", view: "import" },
      { label: "Export Masters (XML)", hint: "Tally-compatible ENVELOPE", export: true },
      { label: "Company", hint: "Switch or create a company", view: "companies" },
    ],
  },
];

const FLAT = SECTIONS.flatMap((s) => s.items);

export default function Gateway({ ctx }) {
  const { company, data, go, reset } = ctx;
  const [index, setIndex] = useMenuKeyboard(FLAT.length, (i) => activate(FLAT[i]));

  function activate(item) {
    if (!item) return;
    if (item.export) {
      window.location.href = `/api/companies/${company.id}/export/xml`;
      return;
    }
    if (item.view) go(item.view);
  }

  return (
    <div className="gateway">
      <section className="gateway-main">
        <div className="gateway-hero">
          <p className="eyebrow">Gateway of Tally</p>
          <h1>{company.name}</h1>
          <p className="muted">
            {company.state ? `${company.state} · ` : ""}Books from {company.books_from}
            {company.gstin ? ` · GSTIN ${company.gstin}` : ""}
          </p>
        </div>

        <div className="stat-grid">
          <div className="stat-card">
            <span>Ledgers</span>
            <strong>{data.stats.ledgers}</strong>
          </div>
          <div className="stat-card">
            <span>Vouchers</span>
            <strong>{data.stats.vouchers}</strong>
          </div>
          <div className="stat-card">
            <span>Groups</span>
            <strong>{data.stats.groups}</strong>
          </div>
          <div className="stat-card">
            <span>Last entry</span>
            <strong>{data.stats.last_voucher_date || "—"}</strong>
          </div>
        </div>

        <div className="quick-actions">
          <button onClick={() => go("voucher-new", { type: "Payment" })}>Payment</button>
          <button onClick={() => go("voucher-new", { type: "Receipt" })}>Receipt</button>
          <button onClick={() => go("voucher-new", { type: "Sales" })}>Sales</button>
          <button onClick={() => go("voucher-new", { type: "Journal" })}>Journal</button>
        </div>

        <div className="tip">
          <strong>Keyboard:</strong> use <kbd>↑</kbd>/<kbd>↓</kbd> and <kbd>Enter</kbd> on the
          menu, <kbd>Esc</kbd> to go back, <kbd>F3</kbd> for companies.
        </div>
      </section>

      <nav className="gateway-menu" aria-label="Gateway menu">
        <div className="gateway-menu-head">
          <span>Gateway of Tally</span>
          <button className="link" onClick={() => reset("gateway")}>refresh</button>
        </div>
        {SECTIONS.map((section) => (
          <div className="menu-section" key={section.title}>
            <div className="menu-title">{section.title}</div>
            <ul>
              {section.items.map((item) => {
                const i = FLAT.indexOf(item);
                return (
                  <li key={item.label}>
                    <button
                      className={`menu-item ${i === index ? "selected" : ""}`}
                      onMouseEnter={() => setIndex(i)}
                      onClick={() => activate(item)}
                    >
                      <span>{item.label}</span>
                      {item.hint ? <small>{item.hint}</small> : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </div>
  );
}

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "./api.js";
import { ErrorBox, Spinner } from "./components.jsx";
import Gateway from "./screens/Gateway.jsx";
import { Companies, Welcome } from "./screens/Companies.jsx";
import { LedgerForm, LedgerList, LedgerStatement } from "./screens/Ledgers.jsx";
import { DayBook, VoucherForm, VoucherMenu } from "./screens/Vouchers.jsx";
import { BalanceSheet, PnL, TrialBalance } from "./screens/Reports.jsx";
import ImportTally from "./screens/ImportTally.jsx";
import Groups from "./screens/Groups.jsx";
import Inventory from "./screens/Inventory.jsx";
import StockSummary from "./screens/StockSummary.jsx";
import { About } from "./screens/Misc.jsx";

function fyLabel(booksFrom) {
  if (!booksFrom) return "";
  const start = new Date(`${booksFrom}T00:00:00`);
  if (Number.isNaN(start.getTime())) return booksFrom;
  const end = new Date(start);
  end.setFullYear(start.getFullYear() + 1);
  end.setDate(end.getDate() - 1);
  const fmt = (d) =>
    d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  return `${fmt(start)} to ${fmt(end)}`;
}

export default function App() {
  const [companies, setCompanies] = useState([]);
  const [company, setCompany] = useState(null);
  const [data, setData] = useState(null);
  const [stack, setStack] = useState([{ view: "gateway" }]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);

  const current = stack[stack.length - 1];

  const loadCompanies = useCallback(async () => {
    const list = await api.get("/companies");
    setCompanies(list);
    return list;
  }, []);

  const openCompany = useCallback(async (id) => {
    const payload = await api.get(`/companies/${id}`);
    setCompany(payload.company);
    setData(payload);
    localStorage.setItem("tc.company", String(id));
    setStack([{ view: "gateway" }]);
  }, []);

  const refresh = useCallback(async () => {
    if (!company) return;
    const payload = await api.get(`/companies/${company.id}`);
    setCompany(payload.company);
    setData(payload);
  }, [company]);

  useEffect(() => {
    (async () => {
      try {
        const list = await loadCompanies();
        const saved = Number(localStorage.getItem("tc.company"));
        const pick = list.find((c) => c.id === saved) || list[0];
        if (pick) await openCompany(pick.id);
        else setStack([{ view: "welcome" }]);
      } catch (err) {
        setError(err);
      } finally {
        setLoading(false);
      }
    })();
  }, [loadCompanies, openCompany]);

  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") {
        setStack((s) => (s.length > 1 ? s.slice(0, -1) : s));
      } else if (e.key === "F3") {
        e.preventDefault();
        setStack([{ view: "companies" }]);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const go = useCallback((view, params = {}) => {
    setStack((s) => [...s, { view, ...params }]);
  }, []);
  const back = useCallback(() => {
    setStack((s) => (s.length > 1 ? s.slice(0, -1) : s));
  }, []);
  const reset = useCallback((view = "gateway") => setStack([{ view }]), []);

  const notify = useCallback((message, tone = "ok") => setToast({ message, tone }), []);

  const ctx = useMemo(
    () => ({
      company,
      data,
      companies,
      go,
      back,
      reset,
      refresh,
      notify,
      reloadCompanies: loadCompanies,
      openCompany,
      setStack,
    }),
    [company, data, companies, go, back, reset, refresh, notify, loadCompanies, openCompany],
  );

  let screen = null;
  if (loading) screen = <Spinner label="Starting TallyClone…" />;
  else if (error) screen = <ErrorBox error={error} />;
  else if (!company && current.view === "welcome")
    screen = <Welcome ctx={ctx} />;
  else if (!company && current.view !== "welcome")
    screen = <Welcome ctx={ctx} />;
  else {
    switch (current.view) {
      case "welcome":
        screen = <Welcome ctx={ctx} />;
        break;
      case "companies":
        screen = <Companies ctx={ctx} />;
        break;
      case "gateway":
        screen = <Gateway ctx={ctx} />;
        break;
      case "ledgers":
        screen = <LedgerList ctx={ctx} />;
        break;
      case "groups":
        screen = <Groups ctx={ctx} />;
        break;
      case "ledger-form":
        screen = <LedgerForm ctx={ctx} id={current.id} />;
        break;
      case "ledger-statement":
        screen = <LedgerStatement ctx={ctx} id={current.id} />;
        break;
      case "voucher-menu":
        screen = <VoucherMenu ctx={ctx} />;
        break;
      case "voucher-new":
        screen = <VoucherForm ctx={ctx} type={current.type} />;
        break;
      case "daybook":
        screen = <DayBook ctx={ctx} />;
        break;
      case "trial":
        screen = <TrialBalance ctx={ctx} />;
        break;
      case "balance-sheet":
        screen = <BalanceSheet ctx={ctx} />;
        break;
      case "pnl":
        screen = <PnL ctx={ctx} />;
        break;
      case "import":
        screen = <ImportTally ctx={ctx} />;
        break;
      case "stock":
        screen = <StockSummary ctx={ctx} />;
        break;
      case "inventory":
        screen = <Inventory ctx={ctx} />;
        break;
      case "about":
        screen = <About ctx={ctx} />;
        break;
      default:
        screen = <Gateway ctx={ctx} />;
    }
  }

  const now = new Date();
  const dateLabel = now.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return (
    <div className="app">
      <header className="topbar">
        <button className="logo" onClick={() => company && reset("gateway")} title="Gateway of Tally">
          Tally<span>Clone</span>
        </button>
        <div className="topbar-company">
          {company ? (
            <>
              <strong>{company.name}</strong>
              <span className="dot">·</span>
              <span>{fyLabel(company.books_from)}</span>
            </>
          ) : (
            <span>No company loaded</span>
          )}
        </div>
        <div className="topbar-right">
          <span className="date">{dateLabel}</span>
          {company ? (
            <nav className="topnav">
              <button onClick={() => setStack([{ view: "companies" }])}>Company</button>
              <button onClick={() => go("import")}>Import</button>
              <button onClick={() => go("about")}>Help</button>
            </nav>
          ) : null}
        </div>
      </header>

      <main className="content">{screen}</main>

      <footer className="statusbar">
        <span><kbd>Esc</kbd> Back</span>
        <span><kbd>↑</kbd><kbd>↓</kbd> Select</span>
        <span><kbd>Enter</kbd> Open</span>
        <span><kbd>F3</kbd> Company</span>
        <span className="status-right">TallyClone · 1.1.7.2-compatible data model</span>
      </footer>

      {toast ? <div className={`toast ${toast.tone}`}>{toast.message}</div> : null}
    </div>
  );
}

import React, { useEffect, useRef, useState } from "react";

export const inr = new Intl.NumberFormat("en-IN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function Money({ value, className = "" }) {
  const n = Number(value || 0);
  return (
    <span className={`money ${n < 0 ? "neg" : ""} ${className}`}>
      {n < 0 ? "−" : ""}
      {inr.format(Math.abs(n))}
    </span>
  );
}

// Tally-style balance: amount plus Dr/Cr rather than a signed number.
export function Balance({ value }) {
  const n = Number(value || 0);
  if (!n) return <span className="money">0.00</span>;
  return (
    <span className="money">
      {inr.format(Math.abs(n))}
      <small>{n < 0 ? "Cr" : "Dr"}</small>
    </span>
  );
}

export function Screen({ title, subtitle, actions, children, wide = false }) {
  return (
    <section className={`screen ${wide ? "wide" : ""}`}>
      <div className="screen-head">
        <div>
          <h1>{title}</h1>
          {subtitle ? <p className="subtitle">{subtitle}</p> : null}
        </div>
        {actions ? <div className="screen-actions">{actions}</div> : null}
      </div>
      <div className="screen-body">{children}</div>
    </section>
  );
}

export function Field({ label, hint, children, className = "" }) {
  return (
    <label className={`field ${className}`}>
      <span className="field-label">{label}</span>
      {children}
      {hint ? <span className="field-hint">{hint}</span> : null}
    </label>
  );
}

export function Button({ children, variant = "default", ...rest }) {
  return (
    <button type="button" className={`btn ${variant}`} {...rest}>
      {children}
    </button>
  );
}

export function Toolbar({ children }) {
  return <div className="toolbar">{children}</div>;
}

export function Empty({ children }) {
  return <div className="empty">{children}</div>;
}

export function Spinner({ label = "Loading…" }) {
  return <div className="loading">{label}</div>;
}

export function ErrorBox({ error }) {
  if (!error) return null;
  return <div className="error-box">{error.message || String(error)}</div>;
}

export function useMenuKeyboard(count, onEnter) {
  const [index, setIndex] = useState(0);
  const enterRef = useRef(onEnter);
  enterRef.current = onEnter;

  useEffect(() => {
    function onKey(e) {
      if (!count) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setIndex((i) => (i + 1) % count);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setIndex((i) => (i - 1 + count) % count);
      } else if (e.key === "Enter") {
        e.preventDefault();
        enterRef.current?.(index);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [count, index]);

  return [index, setIndex];
}

export function DateRange({ from, to, onChange, showTo = true }) {
  return (
    <div className="date-range">
      <Field label="From">
        <input type="date" value={from} onChange={(e) => onChange({ from: e.target.value, to })} />
      </Field>
      {showTo ? (
        <Field label="To">
          <input type="date" value={to} onChange={(e) => onChange({ from, to: e.target.value })} />
        </Field>
      ) : null}
    </div>
  );
}

export function AmountRows({ rows, empty = "Nothing to show." }) {
  if (!rows.length) return <Empty>{empty}</Empty>;
  return (
    <table className="data-table">
      <thead>
        <tr>
          <th>Particulars</th>
          <th className="num">Amount</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className={r.group ? "group-row" : ""}>
            <td>
              {r.group ? <strong>{r.name}</strong> : r.name}
            </td>
            <td className="num">
              <Money value={r.amount} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

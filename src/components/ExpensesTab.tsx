import { useState, useMemo } from 'react';
import type { Trip, Expense, ExpenseCategory } from '../types';
import { generateId } from '../storage';

// ─── Category metadata ────────────────────────────────────────
type CatMeta = { icon: string; color: string };
const CAT_META: Record<string, CatMeta> = {
  'מסעדות':   { icon: '🍽️', color: '#2dc76d' },
  'תחבורה':   { icon: '🚌', color: '#e67e22' },
  'לינה':     { icon: '🏨', color: '#e74c3c' },
  'קניות':    { icon: '🛍️', color: '#1abc9c' },
  'פעילויות': { icon: '🏃', color: '#9b59b6' },
  'שתייה':    { icon: '🍹', color: '#8e44ad' },
  'קפה':      { icon: '☕', color: '#a0522d' },
  'טיסות':    { icon: '✈️', color: '#3498db' },
  'כניסות':   { icon: '🎟️', color: '#6c5ce7' },
  'כללי':     { icon: '💬', color: '#f39c12' },
  'סיור':     { icon: '🏛️', color: '#16a085' },
  'בידור':    { icon: '🎬', color: '#c0392b' },
  'כביסה':    { icon: '👕', color: '#27ae60' },
  'אוכל':     { icon: '🍽️', color: '#2dc76d' }, // legacy
  'אחר':      { icon: '💳', color: '#95a5a6' },
};
function getCat(cat: string): CatMeta { return CAT_META[cat] ?? CAT_META['אחר']; }

const PICKER_CATS: ExpenseCategory[] = [
  'מסעדות', 'תחבורה', 'לינה', 'קניות', 'פעילויות', 'שתייה',
  'קפה', 'טיסות', 'כניסות', 'כללי', 'סיור', 'בידור', 'כביסה', 'אחר',
];
const CURRENCIES = ['EUR', 'ILS', 'USD', 'GBP', 'JPY', 'PLN', 'THB', 'CZK'];
const MONTH_HE = ['ינו', 'פבר', 'מרץ', 'אפר', 'מאי', 'יוני', 'יולי', 'אוג', 'ספט', 'אוק', 'נוב', 'דצמ'];
const DOW_HE   = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

function fmtDateHdr(ds: string) {
  const d = new Date(ds + 'T12:00:00');
  return `יום ${DOW_HE[d.getDay()]}, ${d.getDate()} ${MONTH_HE[d.getMonth()]}`;
}
function fmtDateShort(ds: string) {
  const d = new Date(ds + 'T12:00:00');
  return `${d.getDate()} ${MONTH_HE[d.getMonth()]}`;
}
function dateKey(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function daysBetween(a: string, b: string) {
  return Math.max(0,
    Math.round((new Date(b + 'T12:00:00').getTime() - new Date(a + 'T12:00:00').getTime()) / 86400000)
  );
}

// ─── Donut chart ─────────────────────────────────────────────
function DonutChart({ slices }: { slices: { color: string; amount: number }[] }) {
  const total = slices.reduce((s, sl) => s + sl.amount, 0);
  if (total === 0) return null;
  const R = 52; const C = 2 * Math.PI * R;
  let off = 0;
  return (
    <svg viewBox="0 0 130 130" className="exp-donut-svg">
      {slices.map((sl, i) => {
        const frac = sl.amount / total;
        const len  = frac * C - 1.8;
        const dashOff = -off;
        off += frac * C;
        return (
          <circle key={i} cx="65" cy="65" r={R}
            fill="none" stroke={sl.color} strokeWidth="22"
            strokeLinecap="butt"
            strokeDasharray={`${Math.max(0, len).toFixed(2)} ${C.toFixed(2)}`}
            strokeDashoffset={dashOff.toFixed(2)}
            transform="rotate(-90 65 65)"
          />
        );
      })}
    </svg>
  );
}

// ─── Display row type (expense + optional per-day split info) ──
type DisplayExp = Expense & { _perDay?: number; _numDays?: number };

// ─── Main component ───────────────────────────────────────────
interface Props { trip: Trip; onChange: (t: Trip) => void; }

const DEFAULT_CUR = 'EUR';
const blankForm = (): Omit<Expense, 'id'> => ({
  date: new Date().toISOString().slice(0, 10),
  dateEnd: undefined,
  description: '', amount: 0,
  currency: DEFAULT_CUR, category: 'מסעדות', paymentMethod: 'cash',
});

export default function ExpensesTab({ trip, onChange }: Props) {
  const expenses = trip.expenses || [];
  const [showModal, setShowModal] = useState(false);
  const [form, setForm]           = useState<Omit<Expense, 'id'>>(blankForm);
  const [spreadDays, setSpreadDays] = useState(false);
  const [filterCur, setFilterCur] = useState<string | null>(null);

  // ── Totals per currency (count each expense once, regardless of spread)
  const totals = useMemo(() => {
    const t: Record<string, number> = {};
    expenses.forEach(e => { t[e.currency] = (t[e.currency] || 0) + e.amount; });
    return t;
  }, [expenses]);

  const allCurrencies = Object.keys(totals);
  const primaryCur    = filterCur && totals[filterCur] ? filterCur : (allCurrencies[0] || DEFAULT_CUR);
  const primaryTotal  = totals[primaryCur] || 0;
  const primaryExpenses = expenses.filter(e => e.currency === primaryCur);

  const tripDays = useMemo(() => {
    if (!trip.startDate || !trip.endDate) return 1;
    return Math.max(1,
      Math.ceil((new Date(trip.endDate + 'T12:00:00').getTime() -
                 new Date(trip.startDate + 'T12:00:00').getTime()) / 86400000) + 1
    );
  }, [trip.startDate, trip.endDate]);

  const dailyAvg = primaryTotal > 0 ? primaryTotal / tripDays : 0;

  // ── Category breakdown (count each expense once)
  const catRows = useMemo(() => {
    const t: Record<string, number> = {};
    primaryExpenses.forEach(e => { t[e.category] = (t[e.category] || 0) + e.amount; });
    return Object.entries(t)
      .sort((a, b) => b[1] - a[1])
      .map(([cat, amt]) => ({
        cat, amt,
        pct: primaryTotal > 0 ? amt / primaryTotal * 100 : 0,
        ...getCat(cat),
      }));
  }, [primaryExpenses, primaryTotal]);

  // ── Group by date — spread expenses appear on EACH day with per-day amount
  const grouped = useMemo(() => {
    const map: Record<string, DisplayExp[]> = {};

    expenses.forEach(e => {
      if (e.dateEnd && e.dateEnd > e.date) {
        // Multi-day: spread across range
        const numDays = daysBetween(e.date, e.dateEnd) + 1;
        const perDay  = e.amount / numDays;
        const cur = new Date(e.date + 'T12:00:00');
        const end = new Date(e.dateEnd + 'T12:00:00');
        while (cur <= end) {
          const k = dateKey(cur);
          (map[k] ??= []).push({ ...e, _perDay: perDay, _numDays: numDays });
          cur.setDate(cur.getDate() + 1);
        }
      } else {
        (map[e.date] ??= []).push(e);
      }
    });

    return Object.entries(map)
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([date, exps]) => {
        const dayTot: Record<string, number> = {};
        exps.forEach(e => {
          const amt = e._perDay ?? e.amount;
          dayTot[e.currency] = (dayTot[e.currency] || 0) + amt;
        });
        return { date, exps, dayTot };
      });
  }, [expenses]);

  // ── Actions
  function save() {
    if (!form.description.trim() || form.amount <= 0) return;
    const toSave: Expense = {
      ...form,
      id: generateId(),
      dateEnd: spreadDays && form.dateEnd && form.dateEnd > form.date ? form.dateEnd : undefined,
    };
    onChange({ ...trip, expenses: [...expenses, toSave] });
    setShowModal(false);
  }

  function remove(id: string) {
    onChange({ ...trip, expenses: expenses.filter(e => e.id !== id) });
  }

  function openModal() {
    setForm(blankForm());
    setSpreadDays(false);
    setShowModal(true);
  }

  // ── Render
  return (
    <div className="exp-root">

      {/* ── STATS BAR ── */}
      {primaryTotal > 0 && (
        <div className="exp-stats-bar">
          <div className="exp-stat">
            <span className="exp-stat-label">סה״כ</span>
            <span className="exp-stat-value">
              <span className="exp-stat-cur">{primaryCur}</span>{' '}
              {primaryTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
          <div className="exp-stat-sep" />
          <div className="exp-stat">
            <span className="exp-stat-label">ממוצע יומי</span>
            <span className="exp-stat-value">
              <span className="exp-stat-cur">{primaryCur}</span>{' '}
              {dailyAvg.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
        </div>
      )}

      {/* ── CURRENCY FILTER ── */}
      {allCurrencies.length > 1 && (
        <div className="exp-cur-pills">
          {allCurrencies.map(cur => (
            <button key={cur}
              className={`exp-cur-pill${primaryCur === cur ? ' active' : ''}`}
              onClick={() => setFilterCur(cur === filterCur ? null : cur)}>
              {cur} · {totals[cur].toFixed(0)}
            </button>
          ))}
        </div>
      )}

      {/* ── CHART ── */}
      {catRows.length > 0 && (
        <div className="exp-chart-card">
          <div className="exp-donut-wrap">
            <DonutChart slices={catRows.map(c => ({ color: c.color, amount: c.amt }))} />
          </div>
          <div className="exp-cat-breakdown">
            {catRows.map(c => (
              <div key={c.cat} className="exp-cat-brow">
                <span className="exp-cat-bdot" style={{ background: c.color }} />
                <span className="exp-cat-bicon">{c.icon}</span>
                <span className="exp-cat-blabel">{c.cat}</span>
                <span className="exp-cat-bpct">{c.pct.toFixed(0)}%</span>
                <span className="exp-cat-bamt">{c.amt.toFixed(0)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── EXPENSE LIST ── */}
      {grouped.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">💳</div>
          <p>אין הוצאות עדיין</p>
          <p style={{ fontSize: 13, marginTop: 6, color: 'var(--ink-muted)' }}>לחצי על + כדי להוסיף</p>
        </div>
      ) : (
        <div className="exp-list">
          {grouped.map(g => (
            <div key={g.date} className="exp-group">
              <div className="exp-group-hdr">
                <span className="exp-group-date">{fmtDateHdr(g.date)}</span>
                <span className="exp-group-tot">
                  {Object.entries(g.dayTot)
                    .map(([cur, amt]) => `${amt.toFixed(2)} ${cur}`).join(' · ')}
                </span>
              </div>
              {g.exps.map((exp, idx) => {
                const m = getCat(exp.category);
                const isSpread = !!exp._numDays;
                const dispAmt  = exp._perDay ?? exp.amount;
                return (
                  <div key={`${exp.id}-${idx}`} className="exp-row">
                    <div className="exp-icon-circle" style={{ background: m.color }}>
                      <span>{m.icon}</span>
                    </div>
                    <div className="exp-row-body">
                      <div className="exp-row-desc-line">
                        <span className="exp-row-desc">{exp.description}</span>
                        {isSpread && (
                          <span className="exp-spread-badge">{exp._numDays} ימים</span>
                        )}
                      </div>
                      <span className="exp-row-sub">
                        {exp.category}
                        {exp.paymentMethod ? ` · ${exp.paymentMethod === 'cash' ? 'מזומן' : 'אשראי'}` : ''}
                        {isSpread && exp.dateEnd
                          ? ` · ${fmtDateShort(exp.date)}–${fmtDateShort(exp.dateEnd)}`
                          : ''}
                      </span>
                    </div>
                    <div className="exp-row-end">
                      <span className="exp-row-amt">
                        {dispAmt.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                      {isSpread && (
                        <span className="exp-row-total-hint">
                          סה״כ {exp.amount.toFixed(0)}
                        </span>
                      )}
                      <span className="exp-row-cur">{exp.currency}</span>
                    </div>
                    <button className="exp-del" onClick={() => remove(exp.id)} title="מחק">×</button>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {/* ── FAB ── */}
      <button className="exp-fab" onClick={openModal} aria-label="הוסף הוצאה">+</button>

      {/* ── ADD MODAL ── */}
      {showModal && (
        <div className="exp-overlay" onClick={() => setShowModal(false)}>
          <div className="exp-sheet" onClick={e => e.stopPropagation()}>

            {/* Header */}
            <div className="exp-sheet-hdr">
              <button className="exp-sheet-close" onClick={() => setShowModal(false)}>✕</button>
              <span className="exp-sheet-title">הוצאה חדשה</span>
              <button className="btn-primary btn-sm" onClick={save}
                disabled={!form.description.trim() || form.amount <= 0}>
                שמור
              </button>
            </div>

            {/* Amount + currency */}
            <div className="exp-sheet-amount">
              <div className="exp-icon-circle exp-icon-circle--lg" style={{ background: getCat(form.category).color }}>
                <span>{getCat(form.category).icon}</span>
              </div>
              <input
                className="exp-amount-inp"
                type="number" min="0" step="0.01"
                placeholder="0.00"
                value={form.amount || ''}
                onChange={e => setForm(f => ({ ...f, amount: Number(e.target.value) }))}
              />
              <select className="exp-cur-sel"
                value={form.currency}
                onChange={e => setForm(f => ({ ...f, currency: e.target.value }))}>
                {CURRENCIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>

            {/* Category picker */}
            <div className="exp-cat-grid">
              {PICKER_CATS.map(cat => {
                const m = getCat(cat);
                const active = form.category === cat;
                return (
                  <button key={cat}
                    className={`exp-cat-tile${active ? ' active' : ''}`}
                    onClick={() => setForm(f => ({ ...f, category: cat }))}>
                    <div className="exp-cat-tile-circle"
                      style={active ? { background: m.color } : {}}>
                      {m.icon}
                    </div>
                    <span>{cat}</span>
                  </button>
                );
              })}
            </div>

            {/* Fields */}
            <div className="exp-sheet-fields">
              <input className="exp-field-inp"
                placeholder="תיאור — מה שילמת?"
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              />

              {/* Date(s) */}
              <div className="exp-date-row">
                <div className="exp-date-field">
                  <label className="exp-field-label">{spreadDays ? 'מתאריך' : 'תאריך'}</label>
                  <input className="exp-field-inp" type="date"
                    value={form.date}
                    onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                  />
                </div>
                {spreadDays && (
                  <div className="exp-date-field">
                    <label className="exp-field-label">עד תאריך</label>
                    <input className="exp-field-inp" type="date"
                      value={form.dateEnd || ''}
                      min={form.date}
                      onChange={e => setForm(f => ({ ...f, dateEnd: e.target.value }))}
                    />
                  </div>
                )}
              </div>

              {/* Spread toggle */}
              <button
                className={`exp-spread-toggle${spreadDays ? ' active' : ''}`}
                onClick={() => {
                  setSpreadDays(s => !s);
                  if (spreadDays) setForm(f => ({ ...f, dateEnd: undefined }));
                }}>
                📅 פרוס על מספר ימים
                {spreadDays && form.dateEnd && form.dateEnd > form.date && (
                  <span className="exp-spread-info">
                    {daysBetween(form.date, form.dateEnd) + 1} ימים ·{' '}
                    {form.amount > 0
                      ? `${(form.amount / (daysBetween(form.date, form.dateEnd) + 1)).toFixed(2)} ${form.currency}/יום`
                      : ''}
                  </span>
                )}
              </button>

              {/* Payment method */}
              <div className="exp-pay-row">
                {[
                  { k: 'cash' as const, label: '💵 מזומן' },
                  { k: 'card' as const, label: '💳 אשראי' },
                ].map(({ k, label }) => (
                  <button key={k}
                    className={`exp-pay-chip${form.paymentMethod === k ? ' active' : ''}`}
                    onClick={() => setForm(f => ({ ...f, paymentMethod: k }))}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import { useState } from 'react';
import type { Trip, Expense, ExpenseCategory } from '../types';
import { generateId } from '../storage';

const CATEGORIES: ExpenseCategory[] = ['אוכל', 'תחבורה', 'כניסות', 'קניות', 'לינה', 'אחר'];
const CURRENCIES = ['ILS', 'EUR', 'USD', 'GBP', 'JPY'];
const CAT_ICON: Record<ExpenseCategory, string> = {
  'אוכל': '🍽️', 'תחבורה': '🚌', 'כניסות': '🎟️',
  'קניות': '🛍️', 'לינה': '🏨', 'אחר': '💳',
};

interface Props {
  trip: Trip;
  onChange: (trip: Trip) => void;
}

const blankExp = (): Omit<Expense, 'id'> => ({
  date: new Date().toISOString().slice(0, 10),
  description: '', amount: 0, currency: 'EUR', category: 'אוכל', receiptNote: '',
});

export default function ExpensesTab({ trip, onChange }: Props) {
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(blankExp());

  function save() {
    if (!form.description.trim() || form.amount <= 0) return;
    onChange({ ...trip, expenses: [...trip.expenses, { ...form, id: generateId() }] });
    setForm(blankExp());
    setAdding(false);
  }

  function remove(id: string) {
    onChange({ ...trip, expenses: trip.expenses.filter(e => e.id !== id) });
  }

  const sorted = [...trip.expenses].sort((a, b) => b.date.localeCompare(a.date));

  const totalByCurrency: Record<string, number> = {};
  for (const e of trip.expenses) {
    totalByCurrency[e.currency] = (totalByCurrency[e.currency] ?? 0) + e.amount;
  }

  const byCat: Record<string, number> = {};
  for (const e of trip.expenses) {
    byCat[e.category] = (byCat[e.category] ?? 0) + e.amount;
  }

  return (
    <div className="expenses-tab">
      <div className="tab-toolbar">
        <div className="total-chips">
          {Object.entries(totalByCurrency).map(([cur, total]) => (
            <span key={cur} className="total-chip">{total.toFixed(0)} {cur}</span>
          ))}
        </div>
        <button className="btn-primary btn-sm" onClick={() => { setAdding(true); setForm(blankExp()); }}>
          + הוצאה
        </button>
      </div>

      {adding && (
        <div className="add-form">
          <h3>הוצאה חדשה</h3>
          <div className="field-row">
            <div className="field">
              <label>תיאור *</label>
              <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="מה שילמת?" />
            </div>
            <div className="field field-sm">
              <label>סכום *</label>
              <input type="number" min={0} step={0.5} value={form.amount || ''}
                onChange={e => setForm(f => ({ ...f, amount: Number(e.target.value) }))} />
            </div>
            <div className="field field-xs">
              <label>מטבע</label>
              <select value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value }))}>
                {CURRENCIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div className="field-row">
            <div className="field field-sm">
              <label>קטגוריה</label>
              <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value as ExpenseCategory }))}>
                {CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div className="field field-sm">
              <label>תאריך</label>
              <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
            </div>
            <div className="field">
              <label>הערת קבלה</label>
              <input value={form.receiptNote || ''} onChange={e => setForm(f => ({ ...f, receiptNote: e.target.value }))} placeholder="מספר קבלה, הערה..." />
            </div>
          </div>
          <div className="form-actions">
            <button className="btn-primary" onClick={save}>שמור</button>
            <button className="btn-secondary" onClick={() => setAdding(false)}>ביטול</button>
          </div>
        </div>
      )}

      {trip.expenses.length > 0 && (
        <div className="cat-summary">
          {Object.entries(byCat).sort((a, b) => b[1] - a[1]).map(([cat, total]) => (
            <div key={cat} className="cat-row">
              <span>{CAT_ICON[cat as ExpenseCategory]} {cat}</span>
              <span>{total.toFixed(0)}</span>
            </div>
          ))}
        </div>
      )}

      {sorted.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">💰</div>
          <p>אין הוצאות עדיין</p>
        </div>
      ) : (
        <div className="expenses-list">
          {sorted.map(exp => (
            <div key={exp.id} className="expense-row">
              <span className="exp-icon">{CAT_ICON[exp.category]}</span>
              <div className="exp-info">
                <span className="exp-desc">{exp.description}</span>
                <span className="exp-date">{exp.date}</span>
                {exp.receiptNote && <span className="exp-receipt">{exp.receiptNote}</span>}
              </div>
              <div className="exp-amount">{exp.amount} {exp.currency}</div>
              <button className="icon-btn" onClick={() => remove(exp.id)}>🗑️</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

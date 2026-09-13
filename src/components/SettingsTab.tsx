import { useState } from 'react';
import type { Trip, TripStyle, Flight, Stay, ItemStatus, Traveler } from '../types';
import { generateId } from '../storage';
import { stripUndefined } from '../db';

interface Props {
  trip:       Trip;
  onChange:   (trip: Trip) => void;
  onDelete?:  () => void;
}

const STYLES: TripStyle[]   = ['תרבות', 'טבע', 'עיר', 'חוף', 'הרפתקאות', 'קולינריה', 'משפחה'];
const CURRENCIES             = ['ILS', 'EUR', 'USD', 'PLN', 'GBP'];
// Currencies shown in the exchange-rates section (non-ILS)
const RATE_CURRENCIES        = CURRENCIES.filter(c => c !== 'ILS');
const AVATAR_PALETTE         = ['#14b8a6','#f59e0b','#8b5cf6','#ec4899','#3b82f6','#22c55e','#f97316','#64748b'];

function emptyFlight(): Partial<Flight> {
  return { dir: 'out', flightNo: '', from: '', to: '', date: '', dep: '', arr: '' };
}
function emptyStay(): Partial<Stay> {
  return { name: '', checkIn: '', checkOut: '', status: 'planned', currency: 'PLN' };
}
function emptyTraveler(): Traveler {
  return { id: generateId(), name: '', email: '' };
}
function syncList(existing: Traveler[], count: number): Traveler[] {
  const list = [...existing];
  while (list.length < count) list.push(emptyTraveler());
  return list.slice(0, count);
}
function initials(name: string): string {
  return name.trim().split(/\s+/).map(w => w[0] || '').join('').toUpperCase().slice(0, 2) || '?';
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function SettingsTab({ trip, onChange, onDelete }: Props) {
  const [form, setForm] = useState<Trip>(() => {
    const f = { ...trip };
    f.travelersList = syncList(f.travelersList || [], f.travelers || 1);
    return f;
  });
  const [saved,         setSaved]         = useState(false);
  const [showAddFlight, setShowAddFlight] = useState(false);
  const [showAddStay,   setShowAddStay]   = useState(false);
  const [newFlight,     setNewFlight]     = useState<Partial<Flight>>(emptyFlight());
  const [newStay,       setNewStay]       = useState<Partial<Stay>>(emptyStay());

  const flights       = form.flights       || [];
  const stays         = form.stays         || [];
  const travelersList = form.travelersList || [];

  function set<K extends keyof Trip>(key: K, val: Trip[K]) {
    setForm(f => ({ ...f, [key]: val }));
    setSaved(false);
  }

  function toggleStyle(s: TripStyle) {
    set('style', form.style.includes(s)
      ? form.style.filter(x => x !== s)
      : [...form.style, s]);
  }

  function save() {
    onChange(stripUndefined(form) as Trip);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  // ── Travelers ──────────────────────────────────────────────────────────────

  function adjustTravelers(delta: number) {
    const newCount = Math.max(1, Math.min(20, (form.travelers || 1) + delta));
    const newList  = syncList(travelersList, newCount);
    setForm(f => ({ ...f, travelers: newCount, travelersList: newList }));
    setSaved(false);
  }

  function updateTraveler(idx: number, field: keyof Omit<Traveler,'id'>, val: string) {
    const newList = travelersList.map((t, i) => i === idx ? { ...t, [field]: val } : t);
    setForm(f => ({ ...f, travelersList: newList }));
    setSaved(false);
  }

  // ── Flights ────────────────────────────────────────────────────────────────

  function addFlight() {
    if (!newFlight.from || !newFlight.to) return;
    const fl: Flight = {
      id:       generateId(),
      dir:      (newFlight.dir as 'out' | 'back') || 'out',
      flightNo: newFlight.flightNo || '',
      from:     newFlight.from || '',
      to:       newFlight.to   || '',
      date:     newFlight.date || form.startDate || '',
      dep:      newFlight.dep  || '',
      arr:      newFlight.arr  || '',
    };
    set('flights', [...flights, fl]);
    setNewFlight(emptyFlight());
    setShowAddFlight(false);
  }
  function deleteFlight(id: string) { set('flights', flights.filter(f => f.id !== id)); }

  // ── Stays ──────────────────────────────────────────────────────────────────

  function addStay() {
    if (!newStay.name) return;
    const s: Stay = {
      id:       generateId(),
      name:     newStay.name     || '',
      checkIn:  newStay.checkIn  || '',
      checkOut: newStay.checkOut || '',
      cost:     newStay.cost,
      currency: newStay.currency || 'ILS',
      status:   (newStay.status as ItemStatus) || 'planned',
      address:  newStay.address,
      notes:    newStay.notes,
    };
    set('stays', [...stays, s]);
    setNewStay(emptyStay());
    setShowAddStay(false);
  }
  function deleteStay(id: string) { set('stays', stays.filter(s => s.id !== id)); }

  // ── Exchange Rates ─────────────────────────────────────────────────────────

  const [fetchingRates, setFetchingRates] = useState(false);
  const [ratesError,    setRatesError]    = useState('');

  function saveRateInForm(cur: string, val: string) {
    const num = parseFloat(val);
    set('exchangeRates', {
      ...(form.exchangeRates || {}),
      [cur]: isNaN(num) ? 0 : num,
    });
  }

  async function fetchLiveRates() {
    setFetchingRates(true);
    setRatesError('');
    try {
      // fawazahmed0 currency API via jsDelivr CDN — free, no key, CORS-friendly.
      // Returns: { "ils": { "eur": 0.244, "usd": 0.272, ... } }
      const res = await fetch(
        'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/ils.json'
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { ils: Record<string, number> };
      const TARGET = ['eur', 'usd', 'pln', 'gbp'];
      const updated: Record<string, number> = { ...(form.exchangeRates || {}) };
      for (const cur of TARGET) {
        const rate = data.ils[cur];
        if (rate && rate > 0) {
          const key = cur.toUpperCase();
          updated[key] = Math.round((1 / rate) * 100) / 100;
        }
      }
      set('exchangeRates', updated);
    } catch {
      setRatesError('לא ניתן לטעון שערים — בדוק חיבור לאינטרנט');
    } finally {
      setFetchingRates(false);
    }
  }

  // All rate currencies: standard list + any extra already stored
  const allRateCurrencies = [
    ...RATE_CURRENCIES,
    ...Object.keys(form.exchangeRates || {}).filter(c => !RATE_CURRENCIES.includes(c) && c !== 'ILS'),
  ];

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="settings-root" dir="rtl">

      {/* ══ 1. יעד ותאריכים ══ */}
      <section className="settings-section">
        <h3 className="settings-section-title">יעד ותאריכים</h3>

        <div className="settings-field">
          <label>יעד</label>
          <input
            value={form.destination}
            onChange={e => set('destination', e.target.value)}
            placeholder="לאן טסים?"
          />
        </div>

        <div className="settings-row">
          <div className="settings-field" style={{ flex: 1 }}>
            <label>תאריך יציאה</label>
            <input type="date" value={form.startDate} onChange={e => set('startDate', e.target.value)} />
          </div>
          <div className="settings-field" style={{ flex: 1 }}>
            <label>תאריך חזרה</label>
            <input type="date" value={form.endDate} onChange={e => set('endDate', e.target.value)} />
          </div>
        </div>

        <div className="settings-field">
          <label>תמונת רקע (URL)</label>
          <input
            type="url"
            value={form.coverImage || ''}
            onChange={e => set('coverImage', e.target.value || undefined as unknown as string)}
            placeholder="https://... קישור לתמונה רחבה"
          />
          {form.coverImage && (
            <div className="settings-image-preview" style={{ backgroundImage: `url(${form.coverImage})` }} />
          )}
        </div>

        <div className="settings-field">
          <label>סגנון הטיול</label>
          <div className="style-chips">
            {STYLES.map(s => (
              <button
                key={s}
                className={`style-chip ${form.style.includes(s) ? 'style-chip--on' : ''}`}
                onClick={() => toggleStyle(s)}
                type="button"
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <div className="settings-field" style={{ marginBottom: 0 }}>
          <label>הערות</label>
          <textarea
            value={form.notes}
            onChange={e => set('notes', e.target.value)}
            rows={3}
            placeholder="הערות כלליות על הטיול..."
          />
        </div>
      </section>

      {/* ══ 2. מטיילים ══ */}
      <section className="settings-section">
        <h3 className="settings-section-title">מטיילים</h3>

        {/* +/- counter */}
        <div className="trv-counter">
          <button
            className="trv-counter-btn"
            onClick={() => adjustTravelers(-1)}
            disabled={form.travelers <= 1}
            aria-label="הפחת מטייל"
          >−</button>
          <span className="trv-count-num">{form.travelers}</span>
          <button
            className="trv-counter-btn"
            onClick={() => adjustTravelers(1)}
            disabled={form.travelers >= 20}
            aria-label="הוסף מטייל"
          >+</button>
          <span className="trv-count-label">מטיילים</span>
        </div>

        {/* Traveler cards */}
        {travelersList.length > 0 && (
          <div className="trv-grid">
            {travelersList.map((t, i) => {
              const color = AVATAR_PALETTE[i % AVATAR_PALETTE.length];
              const ini   = initials(t.name);
              return (
                <div key={t.id} className="trv-card">
                  {/* Avatar */}
                  <div className="trv-avatar" style={{ background: color }}>
                    {t.avatar
                      ? <img src={t.avatar} alt={t.name || `מטייל ${i+1}`} />
                      : <span>{ini}</span>}
                  </div>

                  {/* Inputs */}
                  <div className="trv-inputs">
                    <input
                      className="trv-input trv-input--name"
                      placeholder={`מטייל ${i + 1}`}
                      value={t.name}
                      onChange={e => updateTraveler(i, 'name', e.target.value)}
                    />
                    <input
                      className="trv-input trv-input--email"
                      type="email"
                      placeholder="אימייל לגישה"
                      value={t.email}
                      dir="ltr"
                      onChange={e => updateTraveler(i, 'email', e.target.value)}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <p className="trv-hint">כל מטייל יוכל להתחבר עם האימייל שלו ולראות את התכנון</p>
      </section>

      {/* ══ 3. טיסות ══ */}
      <section className="settings-section">
        <div className="settings-section-head">
          <h3 className="settings-section-title">טיסות</h3>
          <button className="btn-outline-sm" onClick={() => setShowAddFlight(true)}>+ הוסף טיסה</button>
        </div>

        {flights.length === 0 && !showAddFlight && (
          <p className="settings-empty">אין טיסות מוזנות</p>
        )}

        {flights.map(f => (
          <div key={f.id} className="settings-flight-row">
            <span className="sfr-dir">{f.dir === 'out' ? '✈️ הלוך' : '✈️ חזור'}</span>
            <span className="sfr-route">{f.from} → {f.to}</span>
            <span className="sfr-no">{f.flightNo}</span>
            <span className="sfr-info">{f.date} · {f.dep}–{f.arr}</span>
            <button className="btn-icon-danger" onClick={() => deleteFlight(f.id)}>✕</button>
          </div>
        ))}

        {showAddFlight && (
          <div className="settings-form-inline">
            <div className="settings-row">
              <select value={newFlight.dir} onChange={e => setNewFlight(f => ({ ...f, dir: e.target.value as 'out' | 'back' }))}>
                <option value="out">הלוך</option>
                <option value="back">חזור</option>
              </select>
              <input placeholder="מ-" value={newFlight.from || ''} onChange={e => setNewFlight(f => ({ ...f, from: e.target.value }))} />
              <input placeholder="ל-" value={newFlight.to   || ''} onChange={e => setNewFlight(f => ({ ...f, to:   e.target.value }))} />
              <input placeholder="מספר טיסה" value={newFlight.flightNo || ''} onChange={e => setNewFlight(f => ({ ...f, flightNo: e.target.value }))} />
            </div>
            <div className="settings-row">
              <input type="date" value={newFlight.date || ''} onChange={e => setNewFlight(f => ({ ...f, date: e.target.value }))} />
              <input placeholder="יציאה" value={newFlight.dep || ''} onChange={e => setNewFlight(f => ({ ...f, dep: e.target.value }))} />
              <input placeholder="נחיתה" value={newFlight.arr || ''} onChange={e => setNewFlight(f => ({ ...f, arr: e.target.value }))} />
            </div>
            <div className="settings-row">
              <button className="btn-primary" onClick={addFlight}>שמור טיסה</button>
              <button className="btn-ghost"   onClick={() => { setShowAddFlight(false); setNewFlight(emptyFlight()); }}>ביטול</button>
            </div>
          </div>
        )}
      </section>

      {/* ══ 4. לינות ══ */}
      <section className="settings-section">
        <div className="settings-section-head">
          <h3 className="settings-section-title">לינות</h3>
          <button className="btn-outline-sm" onClick={() => setShowAddStay(true)}>+ הוסף לינה</button>
        </div>

        {stays.length === 0 && !showAddStay && (
          <p className="settings-empty">אין לינות מוזנות</p>
        )}

        {stays.map(s => (
          <div key={s.id} className="settings-stay-row">
            <div className="ssr-name">{s.name}</div>
            <div className="ssr-info">
              <span>{s.checkIn} → {s.checkOut}</span>
              {s.cost
                ? <span>{CURRENCIES.map(c => c === s.currency
                    ? (c==='EUR'?'€':c==='PLN'?'zł':c==='ILS'?'₪':c==='USD'?'$':c)
                    : '').join('')}{s.cost.toLocaleString()}</span>
                : null}
            </div>
            {s.address && <div className="ssr-addr">{s.address}</div>}
            <button className="btn-icon-danger" onClick={() => deleteStay(s.id)}>✕</button>
          </div>
        ))}

        {showAddStay && (
          <div className="settings-form-inline">
            <div className="settings-row">
              <input placeholder="שם המקום" value={newStay.name || ''} onChange={e => setNewStay(s => ({ ...s, name: e.target.value }))} style={{ flex: 2 }} />
              <select value={newStay.status || 'planned'} onChange={e => setNewStay(s => ({ ...s, status: e.target.value as ItemStatus }))}>
                <option value="planned">מתוכנן</option>
                <option value="paid">שולם</option>
              </select>
            </div>
            <div className="settings-row">
              <input type="date" value={newStay.checkIn  || ''} onChange={e => setNewStay(s => ({ ...s, checkIn:  e.target.value }))} />
              <input type="date" value={newStay.checkOut || ''} onChange={e => setNewStay(s => ({ ...s, checkOut: e.target.value }))} />
            </div>
            <div className="settings-row">
              <input type="number" placeholder="מחיר" value={newStay.cost ?? ''} onChange={e => setNewStay(s => ({ ...s, cost: Number(e.target.value) || undefined }))} />
              <select value={newStay.currency || 'PLN'} onChange={e => setNewStay(s => ({ ...s, currency: e.target.value }))}>
                {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="settings-row">
              <input placeholder="כתובת" value={newStay.address || ''} onChange={e => setNewStay(s => ({ ...s, address: e.target.value }))} style={{ flex: 2 }} />
            </div>
            <div className="settings-row">
              <input placeholder="הערות" value={newStay.notes || ''} onChange={e => setNewStay(s => ({ ...s, notes: e.target.value }))} style={{ flex: 2 }} />
            </div>
            <div className="settings-row">
              <button className="btn-primary" onClick={addStay}>שמור לינה</button>
              <button className="btn-ghost"   onClick={() => { setShowAddStay(false); setNewStay(emptyStay()); }}>ביטול</button>
            </div>
          </div>
        )}
      </section>

      {/* ══ 5. שערי חליפין ══ */}
      <section className="settings-section">
        <div className="settings-section-head">
          <h3 className="settings-section-title">שערי חליפין → ₪</h3>
          <button
            className="btn-outline-sm"
            onClick={fetchLiveRates}
            disabled={fetchingRates}
            title="עדכן שערים חיים מהאינטרנט"
          >
            {fetchingRates ? '⏳ טוען...' : '🔄 עדכן שערים'}
          </button>
        </div>
        <p className="settings-hint">כמה שקלים שווה 1 יחידה של כל מטבע — משמש לסיכום ההוצאות</p>
        {ratesError && <p className="settings-hint" style={{ color: 'var(--danger)' }}>{ratesError}</p>}
        <div className="settings-rates-list">
          {allRateCurrencies.map(cur => (
            <div key={cur} className="settings-rate-row">
              <span className="settings-rate-cur">1 {cur}</span>
              <span className="settings-rate-eq">=</span>
              <input
                className="settings-rate-inp"
                type="number" min="0" step="0.01"
                placeholder="0.00"
                value={form.exchangeRates?.[cur] || ''}
                onChange={e => saveRateInForm(cur, e.target.value)}
              />
              <span className="settings-rate-ils">₪</span>
              {form.exchangeRates?.[cur] ? (
                <span className="settings-rate-check">✓</span>
              ) : (
                <span className="settings-rate-missing">!</span>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ══ שמור ══ */}
      <div className="settings-save-bar">
        <button className="btn-primary" onClick={save}>
          {saved ? '✅ נשמר!' : 'שמור שינויים'}
        </button>
      </div>

      {/* ══ אזור סכנה ══ */}
      {onDelete && (
        <section className="settings-section settings-section--danger">
          <h3 className="settings-section-title">אזור סכנה</h3>
          <p className="settings-empty" style={{ marginBottom: 14 }}>
            מחיקת הטיול תמחק את כל המקומות, המסלול וההוצאות. פעולה זו אינה הפיכה.
          </p>
          <button
            className="btn-danger-outline"
            onClick={() => {
              if (confirm(`למחוק לצמיתות את הטיול ל${trip.destination}?`)) onDelete();
            }}
          >
            🗑️ מחק טיול
          </button>
        </section>
      )}

    </div>
  );
}

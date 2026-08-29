import { useState } from 'react';
import type { Trip, TripStyle, Flight, Stay, ItemStatus } from '../types';
import { generateId } from '../storage';
import { stripUndefined } from '../db';

interface Props {
  trip: Trip;
  onChange: (trip: Trip) => void;
  onDelete?: () => void;
}

const STYLES: TripStyle[] = ['תרבות', 'טבע', 'עיר', 'חוף', 'הרפתקאות', 'קולינריה', 'משפחה'];
const CURRENCIES = ['ILS', 'EUR', 'USD', 'PLN', 'GBP'];

function emptyFlight(): Partial<Flight> {
  return { dir: 'out', flightNo: '', from: '', to: '', date: '', dep: '', arr: '' };
}
function emptyStay(): Partial<Stay> {
  return { name: '', checkIn: '', checkOut: '', status: 'planned', currency: 'PLN' };
}

export default function SettingsTab({ trip, onChange, onDelete }: Props) {
  const [form, setForm] = useState({ ...trip });
  const [saved, setSaved] = useState(false);
  const [showAddFlight, setShowAddFlight] = useState(false);
  const [showAddStay, setShowAddStay] = useState(false);
  const [newFlight, setNewFlight] = useState<Partial<Flight>>(emptyFlight());
  const [newStay, setNewStay] = useState<Partial<Stay>>(emptyStay());

  const flights = form.flights || [];
  const stays = form.stays || [];

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

  // ── Flights ──
  function addFlight() {
    if (!newFlight.from || !newFlight.to) return;
    const fl: Flight = {
      id: generateId(),
      dir: (newFlight.dir as 'out' | 'back') || 'out',
      flightNo: newFlight.flightNo || '',
      from: newFlight.from || '',
      to: newFlight.to || '',
      date: newFlight.date || form.startDate || '',
      dep: newFlight.dep || '',
      arr: newFlight.arr || '',
    };
    set('flights', [...flights, fl]);
    setNewFlight(emptyFlight());
    setShowAddFlight(false);
  }

  function deleteFlight(id: string) {
    set('flights', flights.filter(f => f.id !== id));
  }

  // ── Stays ──
  function addStay() {
    if (!newStay.name) return;
    const s: Stay = {
      id: generateId(),
      name: newStay.name || '',
      checkIn: newStay.checkIn || '',
      checkOut: newStay.checkOut || '',
      cost: newStay.cost,
      currency: newStay.currency || 'ILS',
      status: (newStay.status as ItemStatus) || 'planned',
      address: newStay.address,
      notes: newStay.notes,
    };
    set('stays', [...stays, s]);
    setNewStay(emptyStay());
    setShowAddStay(false);
  }

  function deleteStay(id: string) {
    set('stays', stays.filter(s => s.id !== id));
  }

  return (
    <div className="settings-root" dir="rtl">

      {/* ── BASIC INFO ── */}
      <section className="settings-section">
        <h3 className="settings-section-title">פרטי הטיול</h3>

        <div className="settings-field">
          <label>יעד</label>
          <input
            value={form.destination}
            onChange={e => set('destination', e.target.value)}
            placeholder="לאן טסים?"
          />
        </div>

        <div className="settings-row">
          <div className="settings-field">
            <label>תאריך יציאה</label>
            <input type="date" value={form.startDate} onChange={e => set('startDate', e.target.value)} />
          </div>
          <div className="settings-field">
            <label>תאריך חזרה</label>
            <input type="date" value={form.endDate} onChange={e => set('endDate', e.target.value)} />
          </div>
          <div className="settings-field settings-field--narrow">
            <label>מטיילים</label>
            <input
              type="number" min={1} max={20}
              value={form.travelers}
              onChange={e => set('travelers', Number(e.target.value))}
            />
          </div>
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

        <div className="settings-field">
          <label>תמונת רקע לגיבור (URL)</label>
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
          <label>הערות</label>
          <textarea
            value={form.notes}
            onChange={e => set('notes', e.target.value)}
            rows={3}
            placeholder="הערות כלליות על הטיול..."
          />
        </div>
      </section>

      {/* ── FLIGHTS ── */}
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
              <input placeholder="ל-" value={newFlight.to || ''} onChange={e => setNewFlight(f => ({ ...f, to: e.target.value }))} />
              <input placeholder="מספר טיסה" value={newFlight.flightNo || ''} onChange={e => setNewFlight(f => ({ ...f, flightNo: e.target.value }))} />
            </div>
            <div className="settings-row">
              <input type="date" value={newFlight.date || ''} onChange={e => setNewFlight(f => ({ ...f, date: e.target.value }))} />
              <input placeholder="יציאה" value={newFlight.dep || ''} onChange={e => setNewFlight(f => ({ ...f, dep: e.target.value }))} />
              <input placeholder="נחיתה" value={newFlight.arr || ''} onChange={e => setNewFlight(f => ({ ...f, arr: e.target.value }))} />
            </div>
            <div className="settings-row">
              <button className="btn-primary" onClick={addFlight}>שמור טיסה</button>
              <button className="btn-ghost" onClick={() => { setShowAddFlight(false); setNewFlight(emptyFlight()); }}>ביטול</button>
            </div>
          </div>
        )}
      </section>

      {/* ── STAYS ── */}
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
              {s.cost ? <span>{CURRENCIES.map(c => c === s.currency ? (c === 'EUR' ? '€' : c === 'PLN' ? 'zł' : c === 'ILS' ? '₪' : c === 'USD' ? '$' : c) : '').join('')}{s.cost.toLocaleString()}</span> : null}
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
              <input type="date" value={newStay.checkIn || ''} onChange={e => setNewStay(s => ({ ...s, checkIn: e.target.value }))} />
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
              <button className="btn-ghost" onClick={() => { setShowAddStay(false); setNewStay(emptyStay()); }}>ביטול</button>
            </div>
          </div>
        )}
      </section>

      {/* ── SAVE ── */}
      <div className="settings-save-bar">
        <button className="btn-primary" onClick={save}>
          {saved ? '✅ נשמר!' : 'שמור שינויים'}
        </button>
      </div>

      {/* ── DANGER ZONE ── */}
      {onDelete && (
        <section className="settings-section settings-section--danger">
          <h3 className="settings-section-title">אזור סכנה</h3>
          <p className="settings-empty" style={{ marginBottom: 14 }}>מחיקת הטיול תמחק את כל המקומות, המסלול וההוצאות. פעולה זו אינה הפיכה.</p>
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

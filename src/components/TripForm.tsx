import { useState } from 'react';
import type { Trip, TripStyle } from '../types';

const STYLES: TripStyle[] = ['תרבות', 'טבע', 'עיר', 'חוף', 'הרפתקאות', 'קולינריה', 'משפחה'];

interface Props {
  trip: Trip;
  onSave: (trip: Trip) => void;
  onCancel: () => void;
}

export default function TripForm({ trip, onSave, onCancel }: Props) {
  const [form, setForm] = useState<Trip>({ ...trip });

  function toggleStyle(s: TripStyle) {
    setForm(f => ({
      ...f,
      style: f.style.includes(s) ? f.style.filter(x => x !== s) : [...f.style, s],
    }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.destination.trim()) return;
    onSave(form);
  }

  return (
    <div className="form-page">
      <h2>{trip.destination ? `עריכת ${trip.destination}` : 'טיול חדש'}</h2>
      <form onSubmit={handleSubmit} className="trip-form">

        <div className="field">
          <label>יעד *</label>
          <input
            value={form.destination}
            onChange={e => setForm(f => ({ ...f, destination: e.target.value }))}
            placeholder="לדוגמה: פריז, יפן, פורטוגל"
            required
          />
        </div>

        <div className="field-row">
          <div className="field">
            <label>תאריך יציאה</label>
            <input
              type="date"
              value={form.startDate}
              onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))}
            />
          </div>
          <div className="field">
            <label>תאריך חזרה</label>
            <input
              type="date"
              value={form.endDate}
              onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))}
            />
          </div>
          <div className="field field-sm">
            <label>מטיילים</label>
            <input
              type="number"
              min={1}
              max={20}
              value={form.travelers}
              onChange={e => setForm(f => ({ ...f, travelers: Number(e.target.value) }))}
            />
          </div>
        </div>

        <div className="field">
          <label>סגנון טיול</label>
          <div className="style-chips">
            {STYLES.map(s => (
              <button
                key={s}
                type="button"
                className={`chip ${form.style.includes(s) ? 'chip-active' : ''}`}
                onClick={() => toggleStyle(s)}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <label>סטטוס</label>
          <select
            value={form.phase}
            onChange={e => setForm(f => ({ ...f, phase: e.target.value as Trip['phase'] }))}
          >
            <option value="before">לפני הטיול</option>
            <option value="during">במהלך הטיול</option>
            <option value="after">אחרי הטיול</option>
          </select>
        </div>

        <div className="field">
          <label>הערות כלליות</label>
          <textarea
            value={form.notes}
            onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            rows={3}
            placeholder="כל מה שחשוב לזכור..."
          />
        </div>

        <div className="form-actions">
          <button type="submit" className="btn-primary">שמור טיול</button>
          <button type="button" className="btn-secondary" onClick={onCancel}>ביטול</button>
        </div>
      </form>
    </div>
  );
}

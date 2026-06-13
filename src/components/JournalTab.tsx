import { useState } from 'react';
import type { Trip, JournalEntry } from '../types';
import { generateId } from '../storage';

type Mood = JournalEntry['mood'];
const MOODS: Mood[] = ['🤩', '😊', '😐', '😢', '😴'];

interface Props {
  trip: Trip;
  onChange: (trip: Trip) => void;
}

const blankEntry = (): Omit<JournalEntry, 'id'> => ({
  date: new Date().toISOString().slice(0, 10),
  text: '', mood: '😊', photos: [],
});

export default function JournalTab({ trip, onChange }: Props) {
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(blankEntry());

  function save() {
    if (!form.text.trim()) return;
    onChange({ ...trip, journalEntries: [...trip.journalEntries, { ...form, id: generateId() }] });
    setForm(blankEntry());
    setAdding(false);
  }

  function remove(id: string) {
    onChange({ ...trip, journalEntries: trip.journalEntries.filter(e => e.id !== id) });
  }

  const sorted = [...trip.journalEntries].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="journal-tab">
      <div className="tab-toolbar">
        <span className="count-badge">{trip.journalEntries.length} רשומות</span>
        <button className="btn-primary btn-sm" onClick={() => { setAdding(true); setForm(blankEntry()); }}>
          + רשומה חדשה
        </button>
      </div>

      {adding && (
        <div className="add-form">
          <h3>רשומת יומן</h3>
          <div className="field-row">
            <div className="field field-sm">
              <label>תאריך</label>
              <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
            </div>
            <div className="field">
              <label>מצב רוח</label>
              <div className="mood-picker">
                {MOODS.map(m => (
                  <button
                    key={m}
                    type="button"
                    className={`mood-btn ${form.mood === m ? 'mood-active' : ''}`}
                    onClick={() => setForm(f => ({ ...f, mood: m }))}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="field">
            <label>מה קרה היום?</label>
            <textarea
              value={form.text}
              onChange={e => setForm(f => ({ ...f, text: e.target.value }))}
              rows={5}
              placeholder="ספר על היום — מקומות, אנשים, רגעים..."
            />
          </div>
          <div className="form-actions">
            <button className="btn-primary" onClick={save}>שמור</button>
            <button className="btn-secondary" onClick={() => setAdding(false)}>ביטול</button>
          </div>
        </div>
      )}

      {sorted.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📖</div>
          <p>יומן הטיול ריק — התחל לכתוב!</p>
        </div>
      ) : (
        <div className="journal-list">
          {sorted.map(entry => (
            <div key={entry.id} className="journal-card">
              <div className="journal-header">
                <span className="journal-mood">{entry.mood}</span>
                <span className="journal-date">{entry.date}</span>
                <button className="icon-btn" onClick={() => remove(entry.id)}>🗑️</button>
              </div>
              <p className="journal-text">{entry.text}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

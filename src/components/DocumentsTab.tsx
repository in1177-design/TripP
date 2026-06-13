import { useState } from 'react';
import type { Trip, Document } from '../types';
import { generateId } from '../storage';

type DocType = Document['type'];
const DOC_TYPES: { value: DocType; label: string; icon: string }[] = [
  { value: 'passport', label: 'דרכון', icon: '🛂' },
  { value: 'flight', label: 'כרטיס טיסה', icon: '✈️' },
  { value: 'hotel', label: 'מלון', icon: '🏨' },
  { value: 'insurance', label: 'ביטוח', icon: '🛡️' },
  { value: 'other', label: 'אחר', icon: '📄' },
];

interface Props {
  trip: Trip;
  onChange: (trip: Trip) => void;
}

const blankDoc = (): Omit<Document, 'id'> => ({
  name: '', type: 'flight', notes: '', saved: false,
});

export default function DocumentsTab({ trip, onChange }: Props) {
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(blankDoc());

  function save() {
    if (!form.name.trim()) return;
    onChange({ ...trip, documents: [...trip.documents, { ...form, id: generateId() }] });
    setForm(blankDoc());
    setAdding(false);
  }

  function toggleSaved(id: string) {
    onChange({
      ...trip,
      documents: trip.documents.map(d => d.id === id ? { ...d, saved: !d.saved } : d),
    });
  }

  function remove(id: string) {
    onChange({ ...trip, documents: trip.documents.filter(d => d.id !== id) });
  }

  function getDocType(type: DocType) {
    return DOC_TYPES.find(t => t.value === type) ?? DOC_TYPES[4];
  }

  const savedCount = trip.documents.filter(d => d.saved).length;
  const total = trip.documents.length;

  return (
    <div className="docs-tab">
      <div className="tab-toolbar">
        <span className="count-badge">{savedCount}/{total} נשמרו</span>
        <button className="btn-primary btn-sm" onClick={() => { setAdding(true); setForm(blankDoc()); }}>
          + מסמך
        </button>
      </div>

      {total > 0 && (
        <div className="checklist-progress">
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: total ? `${(savedCount / total) * 100}%` : '0%' }} />
          </div>
          <span>{Math.round(total ? (savedCount / total) * 100 : 0)}% מוכן</span>
        </div>
      )}

      {adding && (
        <div className="add-form">
          <h3>מסמך חדש</h3>
          <div className="field-row">
            <div className="field">
              <label>שם / תיאור *</label>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="למשל: כרטיס טיסה TLV-CDG" />
            </div>
            <div className="field field-sm">
              <label>סוג</label>
              <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as DocType }))}>
                {DOC_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
          </div>
          <div className="field">
            <label>הערות (מספר, תאריך תוקף, ...)</label>
            <input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="מידע נוסף..." />
          </div>
          <div className="form-actions">
            <button className="btn-primary" onClick={save}>שמור</button>
            <button className="btn-secondary" onClick={() => setAdding(false)}>ביטול</button>
          </div>
        </div>
      )}

      {trip.documents.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📄</div>
          <p>הוסף מסמכים לטיול — דרכון, כרטיסי טיסה, מלון, ביטוח</p>
        </div>
      ) : (
        <div className="docs-list">
          {trip.documents.map(doc => {
            const dt = getDocType(doc.type);
            return (
              <div key={doc.id} className={`doc-row ${doc.saved ? 'doc-saved' : ''}`}>
                <button
                  className={`doc-check ${doc.saved ? 'checked' : ''}`}
                  onClick={() => toggleSaved(doc.id)}
                  title="סמן כנשמר"
                >
                  {doc.saved ? '✅' : '⬜'}
                </button>
                <span className="doc-icon">{dt.icon}</span>
                <div className="doc-info">
                  <span className="doc-name">{doc.name}</span>
                  <span className="doc-type-label">{dt.label}</span>
                  {doc.notes && <span className="doc-notes">{doc.notes}</span>}
                </div>
                <button className="icon-btn" onClick={() => remove(doc.id)}>🗑️</button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

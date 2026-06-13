import { useState } from 'react';
import type { Trip, Place, Priority, PlaceType } from '../types';
import { generateId } from '../storage';

const PRIORITIES: Priority[] = ['חובה', 'רוצה', 'אולי'];
const TYPES: PlaceType[] = ['אטרקציה', 'מסעדה', 'מוזיאון', 'שוק', 'פארק', 'שכונה', 'אחר'];
const PRIORITY_COLOR: Record<Priority, string> = {
  'חובה': '#ef4444',
  'רוצה': '#f59e0b',
  'אולי': '#6b7280',
};

type SortKey = 'name' | 'type' | 'priority';

interface Props {
  trip: Trip;
  onChange: (trip: Trip) => void;
}

const blank = (): Omit<Place, 'id'> => ({
  name: '', type: 'אטרקציה', priority: 'רוצה', note: '', address: '', duration: 2,
});

export default function PlacesTab({ trip, onChange }: Props) {
  const [adding, setAdding] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(blank());
  const [sort, setSort] = useState<SortKey>('priority');
  const [filterPriority, setFilterPriority] = useState<Priority | 'הכל'>('הכל');

  function sorted(places: Place[]): Place[] {
    const priorityOrder: Record<Priority, number> = { 'חובה': 0, 'רוצה': 1, 'אולי': 2 };
    const filtered = filterPriority === 'הכל' ? places : places.filter(p => p.priority === filterPriority);
    return [...filtered].sort((a, b) => {
      if (sort === 'priority') return priorityOrder[a.priority] - priorityOrder[b.priority];
      if (sort === 'name') return a.name.localeCompare(b.name, 'he');
      return a.type.localeCompare(b.type, 'he');
    });
  }

  function save() {
    if (!form.name.trim()) return;
    if (editId) {
      onChange({
        ...trip,
        places: trip.places.map(p => p.id === editId ? { ...form, id: editId } : p),
      });
      setEditId(null);
    } else {
      onChange({ ...trip, places: [...trip.places, { ...form, id: generateId() }] });
    }
    setForm(blank());
    setAdding(false);
  }

  function startEdit(place: Place) {
    setForm({ name: place.name, type: place.type, priority: place.priority, note: place.note, address: place.address, duration: place.duration });
    setEditId(place.id);
    setAdding(true);
  }

  function remove(id: string) {
    onChange({ ...trip, places: trip.places.filter(p => p.id !== id) });
  }

  const display = sorted(trip.places);

  return (
    <div className="places-tab">
      <div className="tab-toolbar">
        <div className="toolbar-right">
          <span className="count-badge">{trip.places.length} מקומות</span>
          <div className="filter-chips">
            {(['הכל', ...PRIORITIES] as (Priority | 'הכל')[]).map(p => (
              <button
                key={p}
                className={`chip ${filterPriority === p ? 'chip-active' : ''}`}
                onClick={() => setFilterPriority(p)}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
        <div className="toolbar-left">
          <select value={sort} onChange={e => setSort(e.target.value as SortKey)} className="sort-select">
            <option value="priority">מיון: עדיפות</option>
            <option value="name">מיון: שם</option>
            <option value="type">מיון: סוג</option>
          </select>
          <button className="btn-primary btn-sm" onClick={() => { setAdding(true); setEditId(null); setForm(blank()); }}>
            + הוסף מקום
          </button>
        </div>
      </div>

      {adding && (
        <div className="add-form">
          <h3>{editId ? 'עריכת מקום' : 'מקום חדש'}</h3>
          <div className="field-row">
            <div className="field">
              <label>שם *</label>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="שם המקום" />
            </div>
            <div className="field field-sm">
              <label>סוג</label>
              <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as PlaceType }))}>
                {TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div className="field field-sm">
              <label>עדיפות</label>
              <select value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value as Priority }))}>
                {PRIORITIES.map(p => <option key={p}>{p}</option>)}
              </select>
            </div>
            <div className="field field-xs">
              <label>שעות</label>
              <input type="number" min={0.5} max={12} step={0.5} value={form.duration}
                onChange={e => setForm(f => ({ ...f, duration: Number(e.target.value) }))} />
            </div>
          </div>
          <div className="field">
            <label>כתובת / הערה לניווט</label>
            <input value={form.address || ''} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} placeholder="כתובת או שם לחיפוש במפה" />
          </div>
          <div className="field">
            <label>הערה אישית</label>
            <input value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} placeholder="טיפ, המלצה, שעות פתיחה..." />
          </div>
          <div className="form-actions">
            <button className="btn-primary" onClick={save}>שמור</button>
            <button className="btn-secondary" onClick={() => { setAdding(false); setEditId(null); }}>ביטול</button>
          </div>
        </div>
      )}

      {display.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📍</div>
          <p>אין מקומות עדיין. הוסף את הראשון!</p>
        </div>
      ) : (
        <div className="places-table-wrap">
          <table className="places-table">
            <thead>
              <tr>
                <th>שם</th>
                <th>סוג</th>
                <th>עדיפות</th>
                <th>שעות</th>
                <th>הערה</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {display.map(place => (
                <tr key={place.id}>
                  <td>
                    <div className="place-name">{place.name}</div>
                    {place.address && <div className="place-address">{place.address}</div>}
                  </td>
                  <td><span className="type-badge">{place.type}</span></td>
                  <td>
                    <span className="priority-badge" style={{ background: PRIORITY_COLOR[place.priority] }}>
                      {place.priority}
                    </span>
                  </td>
                  <td>{place.duration}ש'</td>
                  <td className="note-cell">{place.note}</td>
                  <td className="actions-cell">
                    <button className="icon-btn" onClick={() => startEdit(place)} title="עריכה">✏️</button>
                    <button className="icon-btn" onClick={() => remove(place.id)} title="מחיקה">🗑️</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

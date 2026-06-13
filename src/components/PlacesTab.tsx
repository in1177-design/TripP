import { useState } from 'react';
import type { Trip, Place, PlaceType } from '../types';
import { generateId } from '../storage';

const TYPES: PlaceType[] = ['אטרקציה', 'מסעדה', 'קפה', 'מוזיאון', 'שוק', 'פארק', 'שכונה', 'אחר'];

type SortKey = 'nameHe' | 'type' | 'city' | 'rating' | 'must';
type FilterKey = 'הכל' | 'must' | 'visited' | 'לא ביקרנו';

interface Props {
  trip: Trip;
  onChange: (trip: Trip) => void;
}

const blank = (): Omit<Place, 'id'> => ({
  nameHe: '', nameEn: '', city: '', area: '', type: 'אטרקציה',
  must: false, visited: false, booked: false,
  priceChild: undefined, priceAdult: undefined,
  rating: undefined, travelTime: '', description: '', website: '', duration: 2,
});

export default function PlacesTab({ trip, onChange }: Props) {
  const [adding, setAdding] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(blank());
  const [sort, setSort] = useState<SortKey>('must');
  const [filter, setFilter] = useState<FilterKey>('הכל');

  function sorted(places: Place[]): Place[] {
    let filtered = [...places];
    if (filter === 'must') filtered = filtered.filter(p => p.must);
    if (filter === 'visited') filtered = filtered.filter(p => p.visited);
    if (filter === 'לא ביקרנו') filtered = filtered.filter(p => !p.visited);

    return filtered.sort((a, b) => {
      if (sort === 'must') return Number(b.must) - Number(a.must);
      if (sort === 'rating') return (b.rating ?? 0) - (a.rating ?? 0);
      if (sort === 'nameHe') return a.nameHe.localeCompare(b.nameHe, 'he');
      if (sort === 'city') return (a.city ?? '').localeCompare(b.city ?? '', 'he');
      return a.type.localeCompare(b.type, 'he');
    });
  }

  function save() {
    if (!form.nameHe.trim()) return;
    if (editId) {
      onChange({ ...trip, places: trip.places.map(p => p.id === editId ? { ...form, id: editId } : p) });
      setEditId(null);
    } else {
      onChange({ ...trip, places: [...trip.places, { ...form, id: generateId() }] });
    }
    setForm(blank());
    setAdding(false);
  }

  function startEdit(place: Place) {
    setForm({ ...place });
    setEditId(place.id);
    setAdding(true);
  }

  function remove(id: string) {
    onChange({ ...trip, places: trip.places.filter(p => p.id !== id) });
  }

  function toggle(id: string, field: 'must' | 'visited' | 'booked') {
    onChange({ ...trip, places: trip.places.map(p => p.id === id ? { ...p, [field]: !p[field] } : p) });
  }

  const display = sorted(trip.places);

  return (
    <div className="places-tab">
      <div className="tab-toolbar">
        <div className="toolbar-right">
          <span className="count-badge">{trip.places.length} מקומות</span>
          <div className="filter-chips">
            {(['הכל', 'must', 'visited', 'לא ביקרנו'] as FilterKey[]).map(f => (
              <button key={f} className={`chip ${filter === f ? 'chip-active' : ''}`} onClick={() => setFilter(f)}>
                {f === 'must' ? '⭐ Must' : f === 'visited' ? '✅ ביקרנו' : f}
              </button>
            ))}
          </div>
        </div>
        <div className="toolbar-left">
          <select value={sort} onChange={e => setSort(e.target.value as SortKey)} className="sort-select">
            <option value="must">מיון: Must</option>
            <option value="rating">מיון: רייטינג</option>
            <option value="nameHe">מיון: שם</option>
            <option value="city">מיון: עיר</option>
            <option value="type">מיון: קטגוריה</option>
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
              <label>שם בעברית *</label>
              <input value={form.nameHe} onChange={e => setForm(f => ({ ...f, nameHe: e.target.value }))} placeholder="שם המקום" />
            </div>
            <div className="field">
              <label>Name in English</label>
              <input value={form.nameEn || ''} onChange={e => setForm(f => ({ ...f, nameEn: e.target.value }))} placeholder="Name in English" />
            </div>
          </div>

          <div className="field-row">
            <div className="field">
              <label>עיר</label>
              <input value={form.city || ''} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} placeholder="עיר" />
            </div>
            <div className="field">
              <label>אזור</label>
              <input value={form.area || ''} onChange={e => setForm(f => ({ ...f, area: e.target.value }))} placeholder="אזור / שכונה" />
            </div>
            <div className="field field-sm">
              <label>קטגוריה</label>
              <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as PlaceType }))}>
                {TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
          </div>

          <div className="field-row">
            <div className="field field-xs">
              <label>מחיר ילד ₪</label>
              <input type="number" min={0} value={form.priceChild ?? ''} onChange={e => setForm(f => ({ ...f, priceChild: e.target.value ? Number(e.target.value) : undefined }))} />
            </div>
            <div className="field field-xs">
              <label>מחיר מבוגר ₪</label>
              <input type="number" min={0} value={form.priceAdult ?? ''} onChange={e => setForm(f => ({ ...f, priceAdult: e.target.value ? Number(e.target.value) : undefined }))} />
            </div>
            <div className="field field-xs">
              <label>רייטינג</label>
              <input type="number" min={1} max={5} step={0.1} value={form.rating ?? ''} onChange={e => setForm(f => ({ ...f, rating: e.target.value ? Number(e.target.value) : undefined }))} />
            </div>
            <div className="field field-sm">
              <label>זמן נסיעה</label>
              <input value={form.travelTime || ''} onChange={e => setForm(f => ({ ...f, travelTime: e.target.value }))} placeholder="למשל: 20 דק'" />
            </div>
            <div className="field field-xs">
              <label>שעות ביקור</label>
              <input type="number" min={0.5} max={12} step={0.5} value={form.duration ?? ''} onChange={e => setForm(f => ({ ...f, duration: Number(e.target.value) }))} />
            </div>
          </div>

          <div className="field">
            <label>מה זה?</label>
            <input value={form.description || ''} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="תיאור קצר..." />
          </div>

          <div className="field">
            <label>אתר</label>
            <input value={form.website || ''} onChange={e => setForm(f => ({ ...f, website: e.target.value }))} placeholder="https://..." />
          </div>

          <div className="checkboxes-row">
            <label className="checkbox-label">
              <input type="checkbox" checked={form.must} onChange={e => setForm(f => ({ ...f, must: e.target.checked }))} />
              ⭐ Must
            </label>
            <label className="checkbox-label">
              <input type="checkbox" checked={form.visited} onChange={e => setForm(f => ({ ...f, visited: e.target.checked }))} />
              ✅ ביקרנו
            </label>
            <label className="checkbox-label">
              <input type="checkbox" checked={form.booked} onChange={e => setForm(f => ({ ...f, booked: e.target.checked }))} />
              📅 הוזמן
            </label>
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
                <th>עיר / אזור</th>
                <th>קטגוריה</th>
                <th>מחיר</th>
                <th>רייטינג</th>
                <th>זמן נסיעה</th>
                <th>⭐</th>
                <th>✅</th>
                <th>📅</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {display.map(place => (
                <tr key={place.id} className={place.visited ? 'row-visited' : ''}>
                  <td>
                    <div className="place-name">{place.nameHe}</div>
                    {place.nameEn && <div className="place-address">{place.nameEn}</div>}
                    {place.description && <div className="place-address">{place.description}</div>}
                    {place.website && <a href={place.website} target="_blank" rel="noreferrer" className="place-link">🔗 אתר</a>}
                  </td>
                  <td>
                    {place.city && <div>{place.city}</div>}
                    {place.area && <div className="place-address">{place.area}</div>}
                  </td>
                  <td><span className="type-badge">{place.type}</span></td>
                  <td>
                    {place.priceChild != null && <div className="price-row">ילד: ₪{place.priceChild}</div>}
                    {place.priceAdult != null && <div className="price-row">מבוגר: ₪{place.priceAdult}</div>}
                  </td>
                  <td>{place.rating != null && <span className="rating">⭐ {place.rating}</span>}</td>
                  <td>{place.travelTime}</td>
                  <td>
                    <button className="toggle-btn" onClick={() => toggle(place.id, 'must')}>
                      {place.must ? '⭐' : '☆'}
                    </button>
                  </td>
                  <td>
                    <button className="toggle-btn" onClick={() => toggle(place.id, 'visited')}>
                      {place.visited ? '✅' : '⬜'}
                    </button>
                  </td>
                  <td>
                    <button className="toggle-btn" onClick={() => toggle(place.id, 'booked')}>
                      {place.booked ? '📅' : '○'}
                    </button>
                  </td>
                  <td className="actions-cell">
                    <button className="icon-btn" onClick={() => startEdit(place)}>✏️</button>
                    <button className="icon-btn" onClick={() => remove(place.id)}>🗑️</button>
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

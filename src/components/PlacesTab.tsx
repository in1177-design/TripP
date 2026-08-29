import { useState, useEffect, useRef, useMemo } from 'react';
import type { Trip, Place, PlaceType } from '../types';
import { generateId } from '../storage';
import { enrichPlace } from '../aiService';

const TYPES: PlaceType[] = ['אטרקציה', 'מסעדה', 'קפה', 'מוזיאון', 'שוק', 'פארק', 'שכונה', 'אחר'];
const TYPE_ICONS: Record<string, string> = {
  'אטרקציה': '🎯', 'מסעדה': '🍽️', 'קפה': '☕', 'מוזיאון': '🏛️',
  'שוק': '🛒', 'פארק': '🌳', 'שכונה': '🏘️', 'אחר': '📌',
};

// Food types — shown in "אוכל" tab; everything else = "אטרקציות"
const FOOD_TYPES = new Set<PlaceType>(['מסעדה', 'קפה']);
type CityTab = 'attractions' | 'food';
type FilterKey = 'הכל' | 'must' | 'visited' | 'לא ביקרנו';

// Normalize Latin city names → Hebrew canonical names
const CITY_ALIASES: Record<string, string> = {
  'zakopane':  'זקופנה',
  'krakow':    'קראקוב',
  'kraków':    'קראקוב',
  'cracow':    'קראקוב',
  'wieliczka': 'וייליצ\'קה',
  'warsaw':    'ורשה',
  'warszawa':  'ורשה',
};
function normalizeCity(city: string): string {
  if (!city) return 'כללי';
  return CITY_ALIASES[city.trim().toLowerCase()] ?? city.trim();
}

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

/* ── Wikipedia image fetch ─────────────────────────────────────── */
async function fetchWikiImage(searchTerm: string): Promise<string | null> {
  const clean = (s: string) =>
    s.trim()
      .replace(/[&/].*/g, '')
      .replace(/['''`]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

  const term = clean(searchTerm);
  if (!term) return null;

  async function summaryImage(lang: string, title: string): Promise<string | null> {
    const encoded = encodeURIComponent(title.replace(/ /g, '_'));
    try {
      const res = await fetch(
        `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encoded}`,
        { headers: { 'Accept': 'application/json' } }
      );
      if (!res.ok) return null;
      const d = await res.json();
      return d?.thumbnail?.source ?? d?.originalimage?.source ?? null;
    } catch { return null; }
  }

  async function openSearch(lang: string, q: string): Promise<string | null> {
    try {
      const url = `https://${lang}.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(q)}&limit=1&format=json&origin=*`;
      const res = await fetch(url);
      if (!res.ok) return null;
      const [, titles] = await res.json() as [string, string[]];
      if (!titles?.[0]) return null;
      return await summaryImage(lang, titles[0]);
    } catch { return null; }
  }

  const en = await summaryImage('en', term);
  if (en) return en;
  const enSearch = await openSearch('en', term);
  if (enSearch) return enSearch;
  const pl = await summaryImage('pl', term);
  if (pl) return pl;
  return await openSearch('pl', term);
}

/* ── Image search: fetch multiple Wikipedia thumbnails ─────────── */
async function searchImages(rawTerm: string): Promise<string[]> {
  const clean = rawTerm.replace(/[&/].*/g, '').replace(/['''`]/g, '').trim();
  if (!clean) return [];
  const results: string[] = [];

  async function getThumb(lang: string, title: string): Promise<string | null> {
    const encoded = encodeURIComponent(title.replace(/ /g, '_'));
    try {
      const res = await fetch(
        `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encoded}`,
        { headers: { Accept: 'application/json' } }
      );
      if (!res.ok) return null;
      const d = await res.json();
      return d?.thumbnail?.source ?? null;
    } catch { return null; }
  }

  async function addFromLang(lang: string, limit: number) {
    try {
      const url = `https://${lang}.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(clean)}&limit=${limit}&format=json&origin=*`;
      const res = await fetch(url);
      const [, titles] = await res.json() as [string, string[]];
      const imgs = await Promise.all((titles ?? []).map(t => getThumb(lang, t)));
      imgs.forEach(img => { if (img && !results.includes(img)) results.push(img); });
    } catch { /* ignore */ }
  }

  await Promise.all([addFromLang('en', 5), addFromLang('pl', 3)]);
  return results;
}

/* ── Main component ────────────────────────────────────────────── */
export default function PlacesTab({ trip, onChange }: Props) {
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Omit<Place, 'id'>>(blank());
  const [filter, setFilter] = useState<FilterKey>('הכל');
  const [cityTabs, setCityTabs] = useState<Record<string, CityTab>>({});
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');
  const [imgResults, setImgResults] = useState<string[]>([]);
  const [imgSearching, setImgSearching] = useState(false);

  // Wikipedia image cache (session-only)
  const [imageCache, setImageCache] = useState<Record<string, string>>({});
  const attempted = useRef<Set<string>>(new Set());

  useEffect(() => {
    trip.places.forEach(async place => {
      if (attempted.current.has(place.id)) return;
      attempted.current.add(place.id);
      if (place.imageUrl) {
        setImageCache(c => ({ ...c, [place.id]: place.imageUrl! }));
        return;
      }
      const term = place.nameEn || place.nameHe;
      const url = await fetchWikiImage(term);
      if (url) setImageCache(c => ({ ...c, [place.id]: url }));
    });
  }, [trip.places]);

  /* ── City grouping ──────────────────────────────────────────── */
  const cityGroups = useMemo(() => {
    // Apply global filter
    let places = [...trip.places];
    if (filter === 'must')       places = places.filter(p => p.must);
    if (filter === 'visited')    places = places.filter(p => p.visited);
    if (filter === 'לא ביקרנו') places = places.filter(p => !p.visited);

    // Group by city
    const map: Record<string, Place[]> = {};
    places.forEach(p => {
      const city = normalizeCity(p.city || '');
      if (!map[city]) map[city] = [];
      map[city].push(p);
    });

    // Sort within each city: attractions first (must first), then food
    return Object.entries(map)
      .sort(([a], [b]) => a === 'כללי' ? 1 : b === 'כללי' ? -1 : a.localeCompare(b, 'he'))
      .map(([city, ps]) => {
        const attractions = ps.filter(p => !FOOD_TYPES.has(p.type)).sort((a, b) => Number(b.must) - Number(a.must));
        const food = ps.filter(p => FOOD_TYPES.has(p.type)).sort((a, b) => Number(b.must) - Number(a.must));
        return { city, attractions, food };
      });
  }, [trip.places, filter]);

  function getCityTab(city: string): CityTab {
    return cityTabs[city] ?? 'attractions';
  }

  /* ── CRUD ───────────────────────────────────────────────────── */
  function openAdd() {
    setForm(blank());
    setEditingId(null);
    setAiError('');
    setModalOpen(true);
  }

  function openEdit(place: Place) {
    setForm({ ...place });
    setEditingId(place.id);
    setAiError('');
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditingId(null);
    setImgResults([]);
    setImgSearching(false);
  }

  async function handleImgSearch() {
    const term = form.nameEn || form.nameHe;
    if (!term) return;
    setImgSearching(true);
    setImgResults([]);
    const imgs = await searchImages(term);
    setImgResults(imgs);
    setImgSearching(false);
  }

  function save() {
    if (!form.nameHe.trim()) return;
    if (editingId) {
      onChange({ ...trip, places: trip.places.map(p => p.id === editingId ? { ...form, id: editingId } : p) });
    } else {
      onChange({ ...trip, places: [...trip.places, { ...form, id: generateId() }] });
    }
    closeModal();
  }

  function remove(id: string) {
    onChange({ ...trip, places: trip.places.filter(p => p.id !== id) });
  }

  function toggle(id: string, field: 'must' | 'visited' | 'booked') {
    onChange({ ...trip, places: trip.places.map(p => p.id === id ? { ...p, [field]: !p[field] } : p) });
  }

  async function handleAIEnrich() {
    if (!form.nameHe.trim()) return;
    setAiLoading(true); setAiError('');
    try {
      const result = await enrichPlace(form.nameHe, trip.destination);
      setForm(f => ({ ...f, ...result }));
    } catch {
      setAiError('לא הצלחתי למצוא מידע על המקום הזה');
    } finally {
      setAiLoading(false);
    }
  }

  /* ── Render ─────────────────────────────────────────────────── */
  return (
    <div className="places-tab" dir="rtl">

      {/* ── TOOLBAR ── */}
      <div className="tab-toolbar">
        <div className="toolbar-right">
          <span className="count-badge">{trip.places.length} רעיונות</span>
          <div className="filter-chips">
            {(['הכל', 'must', 'visited', 'לא ביקרנו'] as FilterKey[]).map(f => (
              <button key={f} className={`chip ${filter === f ? 'chip-active' : ''}`} onClick={() => setFilter(f)}>
                {f === 'must' ? '⭐ Must' : f === 'visited' ? '✅ ביקרנו' : f}
              </button>
            ))}
          </div>
        </div>
        <div className="toolbar-left">
          <button className="btn-primary btn-sm" onClick={openAdd}>+ הוסף רעיון</button>
        </div>
      </div>

      {/* ── CITY GROUPS ── */}
      {cityGroups.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">💡</div>
          <p>אין רעיונות עדיין. הוסיפי את הראשון!</p>
        </div>
      ) : (
        cityGroups.map(({ city, attractions, food }) => {
          const tab = getCityTab(city);
          const display = tab === 'food' ? food : attractions;
          const hasFood = food.length > 0;
          const hasAttractions = attractions.length > 0;

          return (
            <section key={city} className="city-group">
              {/* City header + tabs */}
              <div className="city-group-header">
                <h2 className="city-title">{city}</h2>
                <div className="city-tab-bar">
                  {hasAttractions && (
                    <button
                      className={`city-tab-btn ${tab === 'attractions' ? 'active' : ''}`}
                      onClick={() => setCityTabs(prev => ({ ...prev, [city]: 'attractions' }))}
                    >
                      🎯 אטרקציות
                      <span className="city-tab-count">{attractions.length}</span>
                    </button>
                  )}
                  {hasFood && (
                    <button
                      className={`city-tab-btn ${tab === 'food' ? 'active' : ''}`}
                      onClick={() => setCityTabs(prev => ({ ...prev, [city]: 'food' }))}
                    >
                      🍽️ אוכל
                      <span className="city-tab-count">{food.length}</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Cards grid */}
              {display.length === 0 ? (
                <p className="city-empty">אין פריטים בקטגוריה זו</p>
              ) : (
                <div className="idea-cards">
                  {display.map(place => {
                    const img = imageCache[place.id];
                    return (
                      <div
                        key={place.id}
                        className={`idea-card ${place.visited ? 'idea-card--visited' : ''} ${place.must ? 'idea-card--must' : ''}`}
                      >
                        {/* Image */}
                        <div
                          className="idea-card-img"
                          style={img ? { backgroundImage: `url(${img})` } : {}}
                        >
                          {!img && <span className="idea-card-img-placeholder">{TYPE_ICONS[place.type] || '📌'}</span>}
                          <div className="idea-card-chips">
                            <span className="idea-card-chip">{TYPE_ICONS[place.type]} {place.type}</span>
                            {place.must && <span className="idea-card-chip idea-card-chip--must">⭐ Must</span>}
                          </div>
                          <button
                            type="button"
                            className="idea-card-del"
                            onClick={() => remove(place.id)}
                            title="מחק"
                          >✕</button>
                        </div>

                        {/* Body */}
                        <div className="idea-card-body">
                          <div className="idea-card-names">
                            <span className="idea-card-name-he">{place.nameHe}</span>
                            {place.nameEn && <span className="idea-card-name-en">{place.nameEn}</span>}
                          </div>

                          {place.description && (
                            <p className="idea-card-desc">{place.description}</p>
                          )}

                          <div className="idea-card-meta">
                            {place.duration != null && place.duration > 0 && (
                              <span className="idea-card-meta-chip">🕒 {place.duration}ש'</span>
                            )}
                            {place.rating != null && (
                              <span className="idea-card-meta-chip">⭐ {place.rating}</span>
                            )}
                            {place.travelTime && (
                              <span className="idea-card-meta-chip">🚗 {place.travelTime}</span>
                            )}
                            {(place.priceAdult != null || place.priceChild != null) && (
                              <span className="idea-card-meta-chip">
                                💶{place.priceAdult != null ? ` מבוגר ₪${place.priceAdult}` : ''}
                                {place.priceAdult != null && place.priceChild != null ? ' · ' : ''}
                                {place.priceChild != null ? `ילד ₪${place.priceChild}` : ''}
                              </span>
                            )}
                            {place.website && (
                              <a href={place.website} target="_blank" rel="noreferrer" className="idea-card-meta-chip idea-card-link">🔗 אתר</a>
                            )}
                          </div>

                          {/* Footer */}
                          <div className="idea-card-footer">
                            <div className="idea-card-actions">
                              <button
                                type="button"
                                className={`idea-card-btn ${place.must ? 'on' : ''}`}
                                onClick={() => toggle(place.id, 'must')}
                                title="Must"
                              >{place.must ? '⭐' : '☆'}</button>
                              <button
                                type="button"
                                className={`idea-card-btn ${place.visited ? 'on' : ''}`}
                                onClick={() => toggle(place.id, 'visited')}
                                title="ביקרנו"
                              >{place.visited ? '✅' : '□'}</button>
                              <button
                                type="button"
                                className={`idea-card-btn ${place.booked ? 'on' : ''}`}
                                onClick={() => toggle(place.id, 'booked')}
                                title="הוזמן"
                              >{place.booked ? '📅' : '○'}</button>
                              <button
                                type="button"
                                className="idea-card-btn idea-card-edit"
                                onClick={() => openEdit(place)}
                                title="ערוך"
                              >✏️</button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          );
        })
      )}

      {/* ── ADD / EDIT MODAL ── */}
      {modalOpen && (
        <div className="place-modal-overlay" onClick={e => { if (e.target === e.currentTarget) closeModal(); }}>
          <div className="place-modal" role="dialog" aria-modal="true">
            <div className="place-modal-hdr">
              <h3>{editingId ? 'עריכת מקום' : 'רעיון חדש'}</h3>
              <button type="button" className="place-modal-close" onClick={closeModal}>✕</button>
            </div>
            <div className="place-modal-body">

              <div className="field-row">
                <div className="field">
                  <label>שם בעברית *</label>
                  <input value={form.nameHe} onChange={e => setForm(f => ({ ...f, nameHe: e.target.value }))} placeholder="שם המקום" />
                </div>
                <div className="field">
                  <label>Name in English</label>
                  <input value={form.nameEn || ''} onChange={e => setForm(f => ({ ...f, nameEn: e.target.value }))} placeholder="Name in English" />
                </div>
                <button type="button" className="btn-ai" onClick={handleAIEnrich}
                  disabled={aiLoading || !form.nameHe.trim()} title="מלא פרטים עם AI">
                  {aiLoading ? '⏳' : '✨ AI'}
                </button>
              </div>
              {aiError && <div className="ai-error">{aiError}</div>}

              <div className="field-row">
                <div className="field"><label>עיר</label><input value={form.city || ''} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} placeholder="עיר" /></div>
                <div className="field"><label>אזור</label><input value={form.area || ''} onChange={e => setForm(f => ({ ...f, area: e.target.value }))} placeholder="אזור / שכונה" /></div>
                <div className="field field-sm">
                  <label>קטגוריה</label>
                  <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as PlaceType }))}>
                    {TYPES.map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
              </div>

              <div className="field-row">
                <div className="field field-xs"><label>מחיר ילד ₪</label><input type="number" min={0} value={form.priceChild ?? ''} onChange={e => setForm(f => ({ ...f, priceChild: e.target.value ? Number(e.target.value) : undefined }))} /></div>
                <div className="field field-xs"><label>מחיר מבוגר ₪</label><input type="number" min={0} value={form.priceAdult ?? ''} onChange={e => setForm(f => ({ ...f, priceAdult: e.target.value ? Number(e.target.value) : undefined }))} /></div>
                <div className="field field-xs"><label>דירוג</label><input type="number" min={1} max={5} step={0.1} value={form.rating ?? ''} onChange={e => setForm(f => ({ ...f, rating: e.target.value ? Number(e.target.value) : undefined }))} /></div>
                <div className="field field-sm"><label>זמן נסיעה</label><input value={form.travelTime || ''} onChange={e => setForm(f => ({ ...f, travelTime: e.target.value }))} placeholder="20 דק'" /></div>
                <div className="field field-xs"><label>שעות ביקור</label><input type="number" min={0.5} max={12} step={0.5} value={form.duration ?? ''} onChange={e => setForm(f => ({ ...f, duration: Number(e.target.value) }))} /></div>
              </div>

              <div className="field"><label>תיאור</label><input value={form.description || ''} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="תיאור קצר..." /></div>
              <div className="field"><label>אתר</label><input value={form.website || ''} onChange={e => setForm(f => ({ ...f, website: e.target.value }))} placeholder="https://..." /></div>
              {/* Image field + search */}
              <div className="field">
                <label>תמונה</label>
                <div className="img-field-row">
                  <input
                    type="url"
                    value={form.imageUrl || ''}
                    onChange={e => setForm(f => ({ ...f, imageUrl: e.target.value || undefined as unknown as string }))}
                    placeholder="https://... (אופציונלי)"
                    className="img-url-input"
                  />
                  <button type="button" className="btn-img-search" onClick={handleImgSearch} disabled={imgSearching}>
                    {imgSearching ? '⏳' : '🔍 חפש תמונה'}
                  </button>
                </div>
                {/* Current image preview */}
                {form.imageUrl && (
                  <div className="img-preview" style={{ backgroundImage: `url(${form.imageUrl})` }} />
                )}
                {/* Search results grid */}
                {imgResults.length > 0 && (
                  <div className="img-results">
                    <p className="img-results-label">בחרי תמונה:</p>
                    <div className="img-results-grid">
                      {imgResults.map((url, i) => (
                        <div
                          key={i}
                          className={`img-result-thumb ${form.imageUrl === url ? 'selected' : ''}`}
                          style={{ backgroundImage: `url(${url})` }}
                          onClick={() => setForm(f => ({ ...f, imageUrl: url }))}
                          title="לחצי לבחור תמונה זו"
                        />
                      ))}
                    </div>
                  </div>
                )}
                {imgResults.length === 0 && !imgSearching && imgResults !== undefined && (
                  <span />
                )}
              </div>

              <div className="checkboxes-row">
                <label className="checkbox-label"><input type="checkbox" checked={form.must} onChange={e => setForm(f => ({ ...f, must: e.target.checked }))} /> ⭐ Must</label>
                <label className="checkbox-label"><input type="checkbox" checked={form.visited} onChange={e => setForm(f => ({ ...f, visited: e.target.checked }))} /> ✅ ביקרנו</label>
                <label className="checkbox-label"><input type="checkbox" checked={form.booked} onChange={e => setForm(f => ({ ...f, booked: e.target.checked }))} /> 📅 הוזמן</label>
              </div>

              <div className="form-actions">
                <button type="button" className="btn-primary" onClick={save}>שמור</button>
                <button type="button" className="btn-secondary" onClick={closeModal}>ביטול</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

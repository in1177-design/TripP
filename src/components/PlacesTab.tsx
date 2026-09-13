import { useState, useEffect, useRef, useMemo } from 'react';
import type { Trip, Place, PlaceType, ItineraryItem } from '../types';
import { generateId } from '../storage';
import { enrichPlace } from '../aiService';

const TYPES: PlaceType[] = ['אטרקציה', 'מסעדה', 'קפה', 'מוזיאון', 'שוק', 'פארק', 'שכונה', 'אחר'];
const TYPE_ICONS: Record<string, string> = {
  'אטרקציה': '🎯', 'מסעדה': '🍽️', 'קפה': '☕', 'מוזיאון': '🏛️',
  'שוק': '🛒', 'פארק': '🌳', 'שכונה': '🏘️', 'אחר': '📌',
};

const WEEK_HE = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
const MONTH_HE = ['ינו', 'פבר', 'מרץ', 'אפר', 'מאי', 'יוני', 'יולי', 'אוג', 'ספט', 'אוק', 'נוב', 'דצמ'];

// Food types — shown in "אוכל" tab
const FOOD_TYPES = new Set<PlaceType>(['מסעדה', 'קפה']);
type FilterKey = 'הכל' | 'must';

// Normalize city names (Latin or variant Hebrew) → canonical Hebrew
const CITY_ALIASES: Record<string, string> = {
  // פולין
  'krakow': 'קרקוב', 'kraków': 'קרקוב', 'cracow': 'קרקוב', 'krakov': 'קרקוב',
  'קראקוב': 'קרקוב', 'קרקוב': 'קרקוב',
  'zakopane': 'זקופנה', 'זקופנה': 'זקופנה',
  'warsaw': 'ורשה', 'warszawa': 'ורשה', 'ורשה': 'ורשה',
  'wieliczka': 'ויליצ\'קה', 'ויליצ\'קה': 'ויליצ\'קה',
  'gdansk': 'גדנסק', 'gdańsk': 'גדנסק', 'גדנסק': 'גדנסק',
  'wroclaw': 'ורוצלב', 'wrocław': 'ורוצלב', 'ורוצלב': 'ורוצלב',
  // ישראל
  'tel aviv': 'תל אביב', 'tel-aviv': 'תל אביב',
  'jerusalem': 'ירושלים', 'haifa': 'חיפה', 'eilat': 'אילת',
  // אירופה
  'prague': 'פראג', 'praha': 'פראג', 'פראג': 'פראג',
  'budapest': 'בודפשט', 'בודפשט': 'בודפשט',
  'vienna': 'וינה', 'wien': 'וינה', 'וינה': 'וינה',
  'paris': 'פריז', 'פריז': 'פריז',
  'rome': 'רומא', 'roma': 'רומא', 'רומא': 'רומא',
  'barcelona': 'ברצלונה', 'ברצלונה': 'ברצלונה',
  'madrid': 'מדריד', 'מדריד': 'מדריד',
  'amsterdam': 'אמסטרדם', 'אמסטרדם': 'אמסטרדם',
  'berlin': 'ברלין', 'ברלין': 'ברלין',
  'london': 'לונדון', 'לונדון': 'לונדון',
  'athens': 'אתונה', 'athina': 'אתונה', 'אתונה': 'אתונה',
  'lisbon': 'ליסבון', 'lisboa': 'ליסבון', 'ליסבון': 'ליסבון',
  'porto': 'פורטו', 'פורטו': 'פורטו',
  'istanbul': 'איסטנבול', 'איסטנבול': 'איסטנבול',
  'dubai': 'דובאי', 'דובאי': 'דובאי',
  'tokyo': 'טוקיו', 'טוקיו': 'טוקיו',
  'bangkok': 'בנגקוק', 'בנגקוק': 'בנגקוק',
  'new york': 'ניו יורק', 'new york city': 'ניו יורק',
  'zator': 'זאטור', 'זאטור': 'זאטור',
};

/** Normalize a city name to canonical Hebrew. Used both when displaying and when saving. */
function normalizeCity(city: string): string {
  if (!city?.trim()) return 'כללי';
  const key = city.trim().toLowerCase();
  return CITY_ALIASES[key] ?? city.trim();
}

// Build sorted trip-date list (safe for all timezones)
function getTripDates(start: string, end: string): string[] {
  if (!start || !end) return [];
  const pad = (n: number) => String(n).padStart(2, '0');
  const toKey = (d: Date) =>
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const dates: string[] = [];
  const d = new Date(start + 'T12:00:00');
  const e = new Date(end   + 'T12:00:00');
  while (d <= e) { dates.push(toKey(d)); d.setDate(d.getDate() + 1); }
  return dates;
}

function fmtDateLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return `${WEEK_HE[d.getDay()]} ${d.getDate()} ${MONTH_HE[d.getMonth()]}`;
}

interface Props {
  trip: Trip;
  onChange: (trip: Trip) => void;
}

const blank = (): Omit<Place, 'id'> => ({
  nameHe: '', nameEn: '', city: '', area: '', type: 'אטרקציה',
  must: false, visited: false, booked: false,
  priceChild: undefined, priceAdult: undefined,
  rating: undefined, travelTime: '', description: '', website: '', address: '', duration: 2,
});

/* ── Wikipedia image fetch ─────────────────────────────────────── */
async function fetchWikiImage(searchTerm: string): Promise<string | null> {
  const clean = (s: string) =>
    s.trim().replace(/[&/].*/g, '').replace(/['''`]/g, '').replace(/\s+/g, ' ').trim();
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

/* ── Fetch OG image from a website via microlink.io ────────────── */
async function fetchOGImage(websiteUrl: string): Promise<string | null> {
  if (!websiteUrl) return null;
  try {
    const url = `https://api.microlink.io/?url=${encodeURIComponent(websiteUrl)}&meta=false`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.data?.image?.url ?? data?.data?.logo?.url ?? null;
  } catch { return null; }
}

/* ── Image search: Wikipedia thumbnails + optional website OG ───── */
async function searchImages(rawTerm: string, websiteUrl?: string): Promise<string[]> {
  const clean = rawTerm.replace(/[&/].*/g, '').replace(/['''`]/g, '').trim();
  if (!clean && !websiteUrl) return [];
  const results: string[] = [];

  function addUniq(url: string | null) {
    if (url && !results.includes(url)) results.push(url);
  }

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
    if (!clean) return;
    try {
      const url = `https://${lang}.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(clean)}&limit=${limit}&format=json&origin=*`;
      const res = await fetch(url);
      const [, titles] = await res.json() as [string, string[]];
      const imgs = await Promise.all((titles ?? []).map(t => getThumb(lang, t)));
      imgs.forEach(img => addUniq(img));
    } catch { /* ignore */ }
  }

  // Run Wikipedia + website OG fetch in parallel
  const [, , ogImg] = await Promise.all([
    addFromLang('en', 5),
    addFromLang('pl', 3),
    websiteUrl ? fetchOGImage(websiteUrl) : Promise.resolve(null),
  ]);

  // Prepend OG image (it's usually the most relevant)
  if (ogImg && !results.includes(ogImg)) results.unshift(ogImg);

  return results;
}

/* ── Main component ────────────────────────────────────────────── */
export default function PlacesTab({ trip, onChange }: Props) {
  const [modalOpen,     setModalOpen]     = useState(false);
  const [editingId,     setEditingId]     = useState<string | null>(null);
  const [form,          setForm]          = useState<Omit<Place, 'id'>>(blank());
  const [filter,        setFilter]        = useState<FilterKey>('הכל');
  const [mainTab,       setMainTab]       = useState<'attractions' | 'food'>('attractions');
  // cityTabs removed — replaced by top-level mainTab
  const [aiLoading,     setAiLoading]     = useState(false);
  const [aiError,       setAiError]       = useState('');
  const [imgResults,    setImgResults]    = useState<string[]>([]);
  const [imgSearching,  setImgSearching]  = useState(false);
  const [refreshingId,  setRefreshingId]  = useState<string | null>(null);
  const [calPickerId,   setCalPickerId]   = useState<string | null>(null);  // date-picker open for this place
  const [viewPlace,     setViewPlace]     = useState<Place | null>(null);   // read-only detail view

  // Wikipedia image cache (session-only)
  const [imageCache, setImageCache] = useState<Record<string, string>>({});
  const attempted = useRef<Set<string>>(new Set());

  const tripDates = useMemo(
    () => getTripDates(trip.startDate, trip.endDate),
    [trip.startDate, trip.endDate]
  );

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
    let places = [...trip.places];
    if (filter === 'must') places = places.filter(p => p.must);
    // Filter by main tab
    places = mainTab === 'food'
      ? places.filter(p => FOOD_TYPES.has(p.type))
      : places.filter(p => !FOOD_TYPES.has(p.type));

    const map: Record<string, Place[]> = {};
    places.forEach(p => {
      const city = normalizeCity(p.city || '');
      if (!map[city]) map[city] = [];
      map[city].push(p);
    });

    return Object.entries(map)
      .sort(([a], [b]) => a === 'כללי' ? 1 : b === 'כללי' ? -1 : a.localeCompare(b, 'he'))
      .map(([city, ps]) => ({
        city,
        places: ps.sort((a, b) => Number(b.must) - Number(a.must)),
      }));
  }, [trip.places, filter, mainTab]);

  // Counts for tab badges
  const attractionCount = trip.places.filter(p => !FOOD_TYPES.has(p.type)).length;
  const foodCount       = trip.places.filter(p =>  FOOD_TYPES.has(p.type)).length;

  /* ── CRUD ───────────────────────────────────────────────────── */
  function openAdd() {
    setForm(blank()); setEditingId(null); setAiError(''); setModalOpen(true);
  }
  function openEdit(place: Place) {
    setForm({ ...place }); setEditingId(place.id); setAiError(''); setModalOpen(true);
  }
  function closeModal() {
    setModalOpen(false); setEditingId(null); setImgResults([]); setImgSearching(false);
  }

  async function handleImgSearch() {
    const term = form.nameEn || form.nameHe;
    if (!term) return;
    setImgSearching(true); setImgResults([]);
    // Include destination in query to disambiguate same-name places
    const imgs = await searchImages(`${term} ${trip.destination}`, form.website?.trim() || undefined);
    setImgResults(imgs); setImgSearching(false);
  }

  function save() {
    if (!form.nameHe.trim() && !form.nameEn?.trim()) return;
    // Always store city in canonical Hebrew
    const toSave = { ...form, city: form.city ? normalizeCity(form.city) : form.city };
    if (editingId) {
      onChange({ ...trip, places: trip.places.map(p => p.id === editingId ? { ...toSave, id: editingId } : p) });
    } else {
      onChange({ ...trip, places: [...trip.places, { ...toSave, id: generateId() }] });
    }
    closeModal();
  }

  function remove(id: string) {
    onChange({ ...trip, places: trip.places.filter(p => p.id !== id) });
  }

  function toggleMust(id: string) {
    onChange({ ...trip, places: trip.places.map(p => p.id === id ? { ...p, must: !p.must } : p) });
  }

  async function handleAIEnrich() {
    const searchName = form.nameEn?.trim() || form.nameHe.trim();
    if (!searchName) return;
    // Build a richer query: name + address (or destination for disambiguation)
    const searchQuery = form.address?.trim()
      ? `${searchName}, ${form.address.trim()}`
      : `${searchName} ${trip.destination}`;
    // Image search: name + destination to avoid wrong-country results
    const imgQuery = `${searchName} ${trip.destination}`;
    setAiLoading(true); setAiError('');
    // Kick off initial image search (Wikipedia only — no website yet)
    setImgSearching(true); setImgResults([]);
    searchImages(imgQuery, form.website?.trim() || undefined).then(imgs => {
      setImgResults(imgs); setImgSearching(false);
    });
    try {
      // Pass full query (with address) as primary, Hebrew name as hint
      const result = await enrichPlace(searchQuery, trip.destination, form.nameHe.trim() || undefined);
      // Apply AI result to form — always normalize city to Hebrew
      const normalizedResult = result.city
        ? { ...result, city: normalizeCity(result.city) }
        : result;
      // Apply AI results — only overwrite fields the AI actually returned a value for.
      // Never blank out existing data (website, nameHe, etc.) just because the AI omitted it on a second call.
      const toApply = Object.fromEntries(
        Object.entries(normalizedResult).filter(([, v]) => v !== undefined && v !== null && v !== '')
      );
      setForm(f => ({ ...f, ...toApply }));
      // If AI found a website, fetch its OG image and prepend to results
      const website = result.website || form.website;
      if (website) {
        fetchOGImage(website).then(ogImg => {
          if (ogImg) setImgResults(prev => [ogImg, ...prev.filter(u => u !== ogImg)]);
        });
      }
      // Always re-search Wikipedia with AI's English name (it may differ from what was typed, e.g. Zatorland → Energylandia)
      const enName = result.nameEn || form.nameEn;
      if (enName && enName !== searchName) {
        searchImages(`${enName} ${trip.destination}`, website || undefined).then(imgs => {
          setImgResults(prev => [...new Set([...prev, ...imgs])]);
        });
      }
    } catch (err) {
      const msg = err instanceof Error && err.name === 'AbortError'
        ? 'הבקשה לקחה יותר מדי זמן — נסי שוב'
        : 'לא הצלחתי למצוא מידע על המקום הזה';
      setAiError(msg);
    } finally {
      setAiLoading(false);
    }
  }

  /* ── Refresh place details from web ────────────────────────── */
  async function handleRefresh(place: Place) {
    setRefreshingId(place.id);
    try {
      const searchTerm = place.nameEn || place.nameHe;
      // Include destination to disambiguate same-name places in other countries
      const imgTerm = `${searchTerm} ${trip.destination}`;
      const [enriched, imgs] = await Promise.all([
        enrichPlace(searchTerm, trip.destination, place.nameHe).catch(() => ({})),
        searchImages(imgTerm, place.website || undefined),
      ]);
      // Best image: first from searchImages (OG image is prepended if found), fallback to existing
      const imgUrl = imgs[0] ?? null;
      const enrichedCity = (enriched as { city?: string }).city;
      // Only merge fields the AI actually returned — don't clear existing data with undefined
      const enrichedDefined = Object.fromEntries(
        Object.entries(enriched as Record<string, unknown>).filter(([, v]) => v !== undefined && v !== null && v !== '')
      );
      const updated: Place = {
        ...place,
        ...enrichedDefined,
        ...(enrichedCity ? { city: normalizeCity(enrichedCity) } : {}),
        ...(imgUrl ? { imageUrl: imgUrl } : {}),
      };
      onChange({ ...trip, places: trip.places.map(p => p.id === place.id ? updated : p) });
      if (imgUrl) {
        setImageCache(c => ({ ...c, [place.id]: imgUrl }));
        attempted.current.delete(place.id);
      }
    } catch { /* silent */ }
    finally { setRefreshingId(null); }
  }

  /* ── Add place to itinerary for a date ─────────────────────── */
  function handleAddToCalendar(place: Place, date: string) {
    const item: ItineraryItem = {
      id: generateId(),
      date,
      type: 'activity',
      name: place.nameHe,
      status: 'planned',
      notes: place.nameEn,
      address: place.area || undefined,
    };
    onChange({ ...trip, itinerary: [...(trip.itinerary || []), item] });
    setCalPickerId(null);
  }

  /* ── Render ─────────────────────────────────────────────────── */
  return (
    <div className="places-tab" dir="rtl" onClick={() => setCalPickerId(null)}>

      {/* ── MAIN TABS: אטרקציות / אוכל ── */}
      <div className="exp-subtab-nav places-main-tabs">
        <button
          className={`exp-subtab-btn${mainTab === 'attractions' ? ' active' : ''}`}
          onClick={() => setMainTab('attractions')}
        >🎯 אטרקציות {attractionCount > 0 && <span className="places-tab-count">{attractionCount}</span>}</button>
        <button
          className={`exp-subtab-btn${mainTab === 'food' ? ' active' : ''}`}
          onClick={() => setMainTab('food')}
        >🍽️ אוכל {foodCount > 0 && <span className="places-tab-count">{foodCount}</span>}</button>
      </div>

      {/* ── TOOLBAR ── */}
      <div className="tab-toolbar">
        <div className="toolbar-right">
          <span className="count-badge">{trip.places.length} רעיונות</span>
          <div className="filter-chips">
            {(['הכל', 'must'] as FilterKey[]).map(f => (
              <button key={f} className={`chip ${filter === f ? 'chip-active' : ''}`} onClick={() => setFilter(f)}>
                {f === 'must' ? '⭐ Must' : f}
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
          <div className="empty-icon">{mainTab === 'food' ? '🍽️' : '🎯'}</div>
          <p>{mainTab === 'food' ? 'אין מסעדות / קפות עדיין' : 'אין אטרקציות עדיין'}. הוסיפי את הראשון!</p>
        </div>
      ) : (
        cityGroups.map(({ city, places: cityPlaces }) => {
          return (
            <section key={city} className="city-group">
              {/* City header */}
              <div className="city-group-header">
                <h2 className="city-title">{city}</h2>
              </div>

              {/* Cards grid */}
              <div className="idea-cards">
                {cityPlaces.map(place => {
                    const img = imageCache[place.id];
                    const isRefreshing = refreshingId === place.id;
                    const calOpen = calPickerId === place.id;

                    return (
                      <div
                        key={place.id}
                        className={`idea-card ${place.must ? 'idea-card--must' : ''}`}
                        onClick={() => setViewPlace(place)}
                        style={{ cursor: 'pointer' }}
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
                          <button type="button" className="idea-card-del" onClick={e => { e.stopPropagation(); remove(place.id); }} title="מחק">✕</button>
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

                              {/* Must ⭐ */}
                              <button
                                type="button"
                                className={`idea-card-btn ${place.must ? 'on' : ''}`}
                                onClick={e => { e.stopPropagation(); toggleMust(place.id); }}
                                title="Must"
                              >{place.must ? '⭐' : '☆'}</button>

                              {/* Refresh 🔄 */}
                              <button
                                type="button"
                                className="idea-card-btn idea-card-btn--refresh"
                                onClick={e => { e.stopPropagation(); handleRefresh(place); }}
                                disabled={isRefreshing}
                                title="רענן פרטים"
                              >{isRefreshing ? <span className="spin">⟳</span> : '🔄'}</button>

                              {/* Add to calendar 📅 — with date picker */}
                              <div className="cal-btn-wrap" onClick={e => e.stopPropagation()}>
                                <button
                                  type="button"
                                  className={`idea-card-btn idea-card-btn--cal ${calOpen ? 'on' : ''}`}
                                  onClick={e => { e.stopPropagation(); setCalPickerId(calOpen ? null : place.id); }}
                                  title="הכנס ללוח שנה"
                                >📅</button>

                                {calOpen && tripDates.length > 0 && (
                                  <div className="cal-date-picker" onClick={e => e.stopPropagation()}>
                                    <div className="cal-date-picker-title">בחרי תאריך</div>
                                    <div className="cal-date-list">
                                      {tripDates.map(date => (
                                        <button
                                          key={date}
                                          type="button"
                                          className="cal-date-btn"
                                          onClick={() => handleAddToCalendar(place, date)}
                                        >
                                          {fmtDateLabel(date)}
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                )}
                                {calOpen && tripDates.length === 0 && (
                                  <div className="cal-date-picker" onClick={e => e.stopPropagation()}>
                                    <div className="cal-date-picker-title">אין תאריכים לטיול</div>
                                  </div>
                                )}
                              </div>

                              {/* Edit ✏️ */}
                              <button
                                type="button"
                                className="idea-card-btn idea-card-edit"
                                onClick={e => { e.stopPropagation(); openEdit(place); }}
                                title="ערוך"
                              >✏️</button>

                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
            </section>
          );
        })
      )}

      {/* ── VIEW MODAL (read-only) ── */}
      {viewPlace && (() => {
        const vp = viewPlace;
        const vpImg = imageCache[vp.id] || vp.imageUrl;
        return (
          <div className="place-modal-overlay" onClick={() => setViewPlace(null)}>
            <div className="place-modal place-view-modal" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}>
              {/* Header image */}
              {vpImg && (
                <div className="place-view-hero" style={{ backgroundImage: `url(${vpImg})` }}>
                  <div className="place-view-hero-overlay" />
                  <div className="place-view-hero-chips">
                    <span className="idea-card-chip">{TYPE_ICONS[vp.type]} {vp.type}</span>
                    {vp.must && <span className="idea-card-chip idea-card-chip--must">⭐ Must</span>}
                  </div>
                </div>
              )}

              <div className="place-modal-hdr">
                <div>
                  <h3 style={{ margin: 0 }}>{vp.nameHe}</h3>
                  {vp.nameEn && <div style={{ fontSize: 13, color: 'var(--ink-muted)', marginTop: 2 }}>{vp.nameEn}</div>}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" className="place-modal-close" onClick={() => { setViewPlace(null); openEdit(vp); }} title="עריכה">✏️</button>
                  <button type="button" className="place-modal-close" onClick={() => setViewPlace(null)} title="סגור">✕</button>
                </div>
              </div>

              <div className="place-modal-body place-view-body">
                {/* Meta chips */}
                <div className="place-view-chips">
                  {vp.city && <span className="place-view-chip">📍 {vp.city}{vp.area ? ` · ${vp.area}` : ''}</span>}
                  {vp.duration != null && vp.duration > 0 && <span className="place-view-chip">🕒 {vp.duration}ש' ביקור</span>}
                  {vp.travelTime && <span className="place-view-chip">🚗 {vp.travelTime} מהמרכז</span>}
                  {vp.rating != null && <span className="place-view-chip">⭐ {vp.rating} / 5</span>}
                  {(vp.priceAdult != null || vp.priceChild != null) && (
                    <span className="place-view-chip">
                      💶{vp.priceAdult != null ? ` מבוגר ₪${vp.priceAdult}` : ''}
                      {vp.priceAdult != null && vp.priceChild != null ? ' · ' : ''}
                      {vp.priceChild != null ? `ילד ₪${vp.priceChild}` : ''}
                    </span>
                  )}
                </div>

                {/* Description */}
                {vp.description && <p className="place-view-desc">{vp.description}</p>}

                {/* Address + Maps link */}
                {(vp.address || vp.nameEn || vp.nameHe) && (() => {
                  const q = encodeURIComponent(vp.address || `${vp.nameEn || vp.nameHe} ${vp.city || ''}`);
                  return (
                    <a
                      href={`https://maps.google.com/?q=${q}`}
                      target="_blank" rel="noreferrer"
                      className="place-view-link place-view-maps-link"
                    >
                      📍 {vp.address || `${vp.nameEn || vp.nameHe}${vp.city ? `, ${vp.city}` : ''}`}
                    </a>
                  );
                })()}

                {/* Website */}
                {vp.website && (
                  <a href={vp.website} target="_blank" rel="noreferrer" className="place-view-link">
                    🔗 {vp.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                  </a>
                )}

                {/* Actions */}
                <div className="place-view-actions">
                  <button
                    type="button"
                    className={`btn-secondary ${vp.must ? 'btn-must-on' : ''}`}
                    onClick={() => { toggleMust(vp.id); setViewPlace(p => p ? { ...p, must: !p.must } : null); }}
                  >{vp.must ? '⭐ Must — הסר' : '☆ הוסף ל-Must'}</button>

                  {tripDates.length > 0 && (
                    <div style={{ position: 'relative' }}>
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => setCalPickerId(calPickerId === vp.id ? null : vp.id)}
                      >📅 הוסף לתכנית</button>
                      {calPickerId === vp.id && (
                        <div className="cal-date-picker cal-date-picker--up" onClick={e => e.stopPropagation()}>
                          <div className="cal-date-picker-title">בחרי תאריך</div>
                          <div className="cal-date-list">
                            {tripDates.map(date => (
                              <button key={date} type="button" className="cal-date-btn"
                                onClick={() => { handleAddToCalendar(vp, date); setViewPlace(null); }}>
                                {fmtDateLabel(date)}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

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
                  <label>שם בעברית</label>
                  <input value={form.nameHe} onChange={e => setForm(f => ({ ...f, nameHe: e.target.value }))} placeholder="שם המקום" />
                </div>
                <div className="field">
                  <label>Name in English</label>
                  <input value={form.nameEn || ''} onChange={e => setForm(f => ({ ...f, nameEn: e.target.value }))} placeholder="Name in English" />
                </div>
                <button type="button" className="btn-ai" onClick={handleAIEnrich}
                  disabled={aiLoading || (!form.nameHe.trim() && !form.nameEn?.trim())} title="מלא פרטים עם AI (עברית או אנגלית)">
                  {aiLoading ? '⏳' : '✨ AI'}
                </button>
              </div>
              {aiError && <div className="ai-error">{aiError}</div>}

              <div className="field"><label>כתובת</label><input value={form.address || ''} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} placeholder="רחוב, מספר (לקישור מפה)" /></div>

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
                {form.imageUrl && (
                  <div className="img-preview" style={{ backgroundImage: `url(${form.imageUrl})` }} />
                )}
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
              </div>

              <div className="checkboxes-row">
                <label className="checkbox-label"><input type="checkbox" checked={form.must} onChange={e => setForm(f => ({ ...f, must: e.target.checked }))} /> ⭐ Must</label>
              </div>

              <div className="form-actions">
                <button type="button" className="btn-primary" onClick={save}
                  disabled={!form.nameHe.trim() && !form.nameEn?.trim()}>שמור</button>
                <button type="button" className="btn-secondary" onClick={closeModal}>ביטול</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

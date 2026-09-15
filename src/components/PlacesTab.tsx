import { useState, useEffect, useRef, useMemo, lazy, Suspense } from 'react';
import type { Trip, Place, PlaceType, ItineraryItem } from '../types';
import { generateId } from '../storage';
import { enrichPlace, searchPlaces, getPlaceDetails, savePlaceIdea } from '../aiService';
import type { PlaceSearchResult } from '../aiService';

const TripMap = lazy(() => import('./TripMap'));

const TYPES: PlaceType[] = ['אטרקציה', 'מסעדה', 'קפה', 'מוזיאון', 'שוק', 'פארק', 'שכונה', 'אחר'];
const TYPE_ICONS: Record<string, string> = {
  'אטרקציה': '🎯', 'מסעדה': '🍽️', 'קפה': '☕', 'מוזיאון': '🏛️',
  'שוק': '🛒', 'פארק': '🌳', 'שכונה': '🏘️', 'אחר': '📌',
};

const WEEK_HE = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
const MONTH_HE = ['ינו', 'פבר', 'מרץ', 'אפר', 'מאי', 'יוני', 'יולי', 'אוג', 'ספט', 'אוק', 'נוב', 'דצמ'];

// Food types
const FOOD_TYPES = new Set<PlaceType>(['מסעדה', 'קפה']);
type FilterKey = 'הכל' | 'must' | 'אטרקציה' | 'אוכל' | 'טבע' | 'מוזיאון' | 'ערים';

const FILTER_CHIPS: { key: FilterKey; label: string }[] = [
  { key: 'הכל',     label: '🗺️ הכל' },
  { key: 'must',    label: '⭐ Must' },
  { key: 'ערים',    label: '🏙️ ערים' },
  { key: 'אטרקציה', label: '🎯 אטרקציות' },
  { key: 'אוכל',    label: '🍽️ אוכל' },
  { key: 'טבע',     label: '🌿 טבע' },
  { key: 'מוזיאון', label: '🏛️ מוזיאון' },
];

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

/* ── DuckDuckGo Instant Answer — free, no API key, returns place image ── */
async function fetchDDGImage(query: string): Promise<string | null> {
  if (!query?.trim()) return null;
  try {
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&t=mytrip&no_html=1&skip_disambig=1`;
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    const data = await res.json();
    // data.Image is a relative path like "/i/abc123.png"
    if (data?.Image) return `https://duckduckgo.com${data.Image}`;
    return null;
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

  // Run Wikipedia + website OG + DuckDuckGo in parallel
  const [, , ogImg, ddgImg] = await Promise.all([
    addFromLang('en', 5),
    addFromLang('pl', 3),
    websiteUrl ? fetchOGImage(websiteUrl) : Promise.resolve(null),
    clean ? fetchDDGImage(clean) : Promise.resolve(null),
  ]);

  // Prepend OG image (most relevant), DDG after Wikipedia results
  if (ogImg && !results.includes(ogImg)) results.unshift(ogImg);
  if (ddgImg && !results.includes(ddgImg)) results.push(ddgImg);

  return results;
}

/**
 * Smart merge: pick the better of two values for AI enrichment.
 * - AI returns nothing → keep existing
 * - Existing is empty  → use AI value
 * - Identical          → no change
 * - Both strings       → prefer the longer (more detailed) one
 * - Numbers / other    → prefer AI (fresh lookup)
 */
function pickBest(existing: unknown, aiVal: unknown): unknown {
  const isEmpty = (v: unknown) => v === undefined || v === null || v === '';
  if (isEmpty(aiVal)) return existing;
  if (isEmpty(existing)) return aiVal;
  if (existing === aiVal) return existing;
  if (typeof existing === 'string' && typeof aiVal === 'string') {
    return aiVal.trim().length >= existing.trim().length ? aiVal : existing;
  }
  return aiVal; // numbers, booleans — prefer AI
}

// ── Add/Search sheet types ───────────────────────────────────────
type SheetStep = 'search' | 'results' | 'details';
type SheetMode = 'manual' | 'search';

interface PlaceDraft {
  nameHe:     string;
  nameEn:     string;
  city:       string;
  type:       PlaceType;
  address:    string;
  description:string;
  website:    string;
  priceAdult: string;
  priceChild: string;
  travelTime: string;
  duration:   string;
  imageUrl:   string;
  must:       boolean;
  providerPlaceId?: string;
  lat?: number;
  lng?: number;
}

const emptyDraft = (): PlaceDraft => ({
  nameHe: '', nameEn: '', city: '', type: 'אטרקציה',
  address: '', description: '', website: '',
  priceAdult: '', priceChild: '', travelTime: '', duration: '',
  imageUrl: '', must: false,
});

/* ── Main component ────────────────────────────────────────────── */
export default function PlacesTab({ trip, onChange }: Props) {
  const [modalOpen,     setModalOpen]     = useState(false);
  const [editingId,     setEditingId]     = useState<string | null>(null);
  const [form,          setForm]          = useState<Omit<Place, 'id'>>(blank());
  const [placesView,    setPlacesView]    = useState<'bank' | 'map'>('bank');
  const [filter,        setFilter]        = useState<FilterKey>('הכל');
  const [selectedCity,  setSelectedCity]  = useState<string | null>(null); // active when filter==='ערים'
  // mainTab removed — replaced by filter chips
  const [aiLoading,     setAiLoading]     = useState(false);
  const [aiError,       setAiError]       = useState('');
  const [imgResults,    setImgResults]    = useState<string[]>([]);
  const [imgSearching,  setImgSearching]  = useState(false);
  const [refreshingId,  setRefreshingId]  = useState<string | null>(null);
  const [calPickerId,   setCalPickerId]   = useState<string | null>(null);  // date-picker open for this place
  const [viewPlace,     setViewPlace]     = useState<Place | null>(null);   // read-only detail view

  // ── Add / Search Sheet state ─────────────────────────────────────
  const [sheetOpen,       setSheetOpen]       = useState(false);
  const [sheetStep,       setSheetStep]       = useState<SheetStep>('search');
  const [sheetMode,       setSheetMode]       = useState<SheetMode>('manual');
  const [sheetEditingId,  setSheetEditingId]  = useState<string | null>(null); // null = new, id = edit
  const [searchQuery,     setSearchQuery]     = useState('');
  const [searchResults,   setSearchResults]   = useState<PlaceSearchResult[]>([]);
  const [searchError,     setSearchError]     = useState('');
  const [serviceError,    setServiceError]    = useState(false);
  const [draft,           setDraft]           = useState<PlaceDraft>(emptyDraft());
  const [detailsLoading,  setDetailsLoading]  = useState(false);
  const [sheetSaving,     setSheetSaving]     = useState(false);
  const [sheetSearching,  setSheetSearching]  = useState(false);
  const dirtyFieldsRef  = useRef<Set<string>>(new Set());
  const latestSearchRef = useRef('');
  const latestDetailsRef= useRef('');

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
      // 1. Wikipedia
      let url = await fetchWikiImage(term);
      // 2. Official website / Facebook / Instagram OG image
      if (!url && place.website) url = await fetchOGImage(place.website);
      // 3. DuckDuckGo Instant Answer (free, works for many local businesses)
      if (!url) url = await fetchDDGImage(`${term}${place.city ? ' ' + place.city : ''}`);
      if (url) setImageCache(c => ({ ...c, [place.id]: url }));
    });
  }, [trip.places]);

  /* ── All unique cities (for ערים chip) ──────────────────────── */
  const allCities = useMemo(() => {
    const seen = new Set<string>();
    const cities: string[] = [];
    for (const p of trip.places) {
      const c = normalizeCity(p.city || '');
      if (c && c !== 'כללי' && !seen.has(c)) { seen.add(c); cities.push(c); }
    }
    return cities.sort((a, b) => a.localeCompare(b, 'he'));
  }, [trip.places]);

  /* ── Filtered flat list (no city grouping) ──────────────────── */
  const filteredPlaces = useMemo(() => {
    let places = [...trip.places];
    switch (filter) {
      case 'must':    places = places.filter(p => p.must); break;
      case 'אטרקציה': places = places.filter(p => p.type === 'אטרקציה'); break;
      case 'אוכל':    places = places.filter(p => FOOD_TYPES.has(p.type)); break;
      case 'טבע':     places = places.filter(p => p.type === 'פארק'); break;
      case 'מוזיאון': places = places.filter(p => p.type === 'מוזיאון'); break;
      case 'ערים':
        if (selectedCity) places = places.filter(p => normalizeCity(p.city || '') === selectedCity);
        break;
    }
    return places.sort((a, b) => Number(b.must) - Number(a.must));
  }, [trip.places, filter, selectedCity]);

  /* ── CRUD ───────────────────────────────────────────────────── */
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
      // Smart merge: for each field pick the better value (see pickBest helper).
      // nameHe and city are protected — only fill in if currently empty,
      // to avoid overwriting the user's city and splitting the city groups display.
      setForm(f => {
        const next = { ...f };
        for (const [key, aiVal] of Object.entries(normalizedResult)) {
          if (key === 'nameHe') continue;                         // user's own text — never overwrite
          if (key === 'city' && f.city?.trim()) continue;         // keep existing city → no group split
          const existing = (f as Record<string, unknown>)[key];
          const best = pickBest(existing, aiVal);
          if (best !== existing) (next as Record<string, unknown>)[key] = best;
        }
        return next;
      });
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

      // Real Google Place ID starts with "ChIJ" or similar — never with "mock_"
      const hasRealGoogleId = place.providerPlaceId &&
        !place.providerPlaceId.startsWith('mock_');

      // If no real Google ID, try to find one via searchPlaces first
      let googlePlaceId = hasRealGoogleId ? place.providerPlaceId! : null;
      if (!googlePlaceId) {
        const found = await searchPlaces(trip.id, searchTerm, trip.destination)
          .catch((e) => { console.warn('[Refresh] searchPlaces failed:', e); return null; });
        googlePlaceId = found?.results?.[0]?.providerPlaceId ?? null;
        console.log('[Refresh] searchPlaces result:', found?.results?.length, 'places, first ID:', googlePlaceId);
      }

      const [enriched, googleDetails] = await Promise.all([
        enrichPlace(searchTerm, trip.destination, place.nameHe).catch((e) => { console.warn('[Refresh] enrichPlace failed:', e?.message); return {}; }),
        googlePlaceId
          ? getPlaceDetails(trip.id, googlePlaceId).catch((e) => { console.warn('[Refresh] getPlaceDetails failed:', e?.message); return null; })
          : Promise.resolve(null),
      ]);

      // Google Places photo only (searchImages always fails due to CORS)
      const imgUrl = (googleDetails?.imageUrls ?? [])[0] ?? null;
      // Smart merge: pick the better value per field; nameHe is always the user's saved name.
      const updatedRec = { ...(place as unknown as Record<string, unknown>) };
      for (const [key, aiVal] of Object.entries(enriched as Record<string, unknown>)) {
        if (key === 'nameHe' || key === 'city') continue; // handled separately
        const best = pickBest(updatedRec[key], aiVal);
        if (best !== updatedRec[key]) updatedRec[key] = best;
      }
      const updated = updatedRec as unknown as Place;
      // City: prefer Google Places city → AI city → keep existing (never re-add if user deleted it)
      const googleCity = googleDetails?.address
        ? normalizeCity(googleDetails.address.split(',').slice(-2, -1)[0]?.trim() ?? '')
        : null;
      const aiCity = (enriched as { city?: string }).city;
      if (googleCity) {
        updated.city = googleCity;          // Google is most accurate
      } else if (aiCity && !place.city?.trim()) {
        updated.city = normalizeCity(aiCity); // AI fills only if city was missing
      }
      // If user had a city and we found no Google city → keep existing (don't overwrite with AI)
      if (imgUrl) updated.imageUrl = imgUrl;
      // Save lat/lng from Google Places
      if (googleDetails?.location) {
        updated.lat = googleDetails.location.lat;
        updated.lng = googleDetails.location.lng;
      }
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

  /* ── Add/Search Sheet handlers ──────────────────────────────── */

  /** Open sheet at search step */
  function openSheet() {
    setSheetOpen(true);
    setSheetStep('search');
    setSheetMode('search');
    setSearchQuery('');
    setSearchResults([]);
    setSearchError('');
    setServiceError(false);
    setDraft(emptyDraft());
    dirtyFieldsRef.current = new Set();
  }

  /** Open sheet directly at empty details form (manual mode) */
  function openSheetManual() {
    setSheetOpen(true);
    setSheetStep('details');
    setSheetMode('manual');
    setSheetEditingId(null);
    setDraft(emptyDraft());
    dirtyFieldsRef.current = new Set();
    setSearchError('');
    setDetailsLoading(false);
  }

  /** Open sheet pre-filled with an existing place for editing */
  function openSheetEdit(place: Place) {
    setSheetOpen(true);
    setSheetStep('details');
    setSheetMode('manual');
    setSheetEditingId(place.id);
    setDraft({
      nameHe:      place.nameHe      ?? '',
      nameEn:      place.nameEn      ?? '',
      city:        place.city        ?? '',
      type:        place.type        ?? 'אטרקציה',
      address:     place.address     ?? '',
      description: place.description ?? '',
      website:     place.website     ?? '',
      priceAdult:  place.priceAdult  != null ? String(place.priceAdult) : '',
      priceChild:  place.priceChild  != null ? String(place.priceChild) : '',
      travelTime:  place.travelTime  ?? '',
      duration:    place.duration    != null ? String(place.duration)   : '',
      imageUrl:    place.imageUrl    ?? '',
      must:        place.must        ?? false,
      providerPlaceId: place.providerPlaceId,
    });
    dirtyFieldsRef.current = new Set();
    setSearchError('');
    setImgResults(place.imageUrl ? [place.imageUrl] : []);
    setDetailsLoading(false);
    setViewPlace(null); // close view modal if open
  }

  function closeSheet() {
    const hasEdits = dirtyFieldsRef.current.size > 0 &&
      (draft.nameHe.trim() || draft.nameEn.trim() || draft.description.trim());
    if (hasEdits) {
      if (!window.confirm('יש שינויים שלא נשמרו. לסגור?')) return;
    }
    setSheetOpen(false);
    setSheetEditingId(null);
    latestSearchRef.current  = '';
    latestDetailsRef.current = '';
  }

  /** Mark a draft field as user-edited and update value */
  function updateDraft<K extends keyof PlaceDraft>(field: K, value: PlaceDraft[K]) {
    setDraft(d => ({ ...d, [field]: value }));
    dirtyFieldsRef.current = new Set([...dirtyFieldsRef.current, field as string]);
  }

  /** Switch to manual mode from inside the sheet */
  function switchToManual() {
    setDraft(emptyDraft());
    dirtyFieldsRef.current = new Set();
    setSheetMode('manual');
    setSheetStep('details');
    setDetailsLoading(false);
    setSearchError('');
  }

  async function handleSearch() {
    const q = searchQuery.trim();
    if (!q) return;
    setSheetSearching(true);
    setSearchError('');
    setServiceError(false);
    const reqId = String(Date.now());
    latestSearchRef.current = reqId;
    try {
      const { results } = await searchPlaces(trip.id, q);
      if (latestSearchRef.current !== reqId) return;
      setSearchResults(results);
      if (results.length === 1) {
        // Single result → skip results screen, go straight to details
        await handleSelectResult(results[0], reqId);
      } else {
        setSheetStep('results');
      }
    } catch {
      if (latestSearchRef.current !== reqId) return;
      setServiceError(true);
      setSheetStep('results');
    } finally {
      if (latestSearchRef.current === reqId) setSheetSearching(false);
    }
  }

  async function handleSelectResult(result: PlaceSearchResult, reqIdOverride?: string) {
    dirtyFieldsRef.current = new Set();
    const reqId = reqIdOverride ?? String(Date.now());
    latestDetailsRef.current = reqId;

    const cityGuess = result.address.split(',').slice(-2, -1)[0]?.trim() || '';
    setDraft({
      ...emptyDraft(),
      nameEn:  result.name,
      city:    cityGuess,
      type:    TYPES.includes(result.category as PlaceType) ? result.category as PlaceType : 'אטרקציה',
      address: result.address,
      providerPlaceId: result.providerPlaceId,
      lat: result.location?.lat,
      lng: result.location?.lng,
    });
    setSheetMode('search');
    setSheetStep('details');
    setDetailsLoading(true);
    setSearchError('');

    try {
      const details = await getPlaceDetails(trip.id, result.providerPlaceId);
      if (latestDetailsRef.current !== reqId) return;
      setDraft(prev => {
        const dirty = dirtyFieldsRef.current;
        return {
          ...prev,
          nameHe:      dirty.has('nameHe')      ? prev.nameHe      : (details.nameHe    || prev.nameHe),
          nameEn:      dirty.has('nameEn')       ? prev.nameEn      : (details.name      || prev.nameEn),
          address:     dirty.has('address')      ? prev.address     : (details.address   || prev.address),
          description: dirty.has('description')  ? prev.description : (details.description || prev.description),
          website:     dirty.has('website')      ? prev.website     : (details.website   || prev.website || ''),
          type:        dirty.has('type')         ? prev.type        : (
            TYPES.includes(details.category as PlaceType) ? details.category as PlaceType : prev.type
          ),
          imageUrl:    dirty.has('imageUrl')     ? prev.imageUrl    : (details.imageUrls?.[0] || prev.imageUrl),
          providerPlaceId: details.providerPlaceId,
          lat: details.location?.lat ?? prev.lat,
          lng: details.location?.lng ?? prev.lng,
        };
      });
    } catch (err) {
      if (latestDetailsRef.current !== reqId) return;
      const msg = (err as { message?: string }).message || '';
      setSearchError(msg.includes('מגבלה') ? msg : 'לא הצלחתי לטעון פרטים — ניתן לערוך ידנית');
    } finally {
      if (latestDetailsRef.current === reqId) setDetailsLoading(false);
    }
  }

  /** Refresh: fill only empty fields, never overwrite user edits. Also fetches Google photo. */
  async function handleRefill() {
    const term = (draft.nameEn || draft.nameHe).trim();
    if (!term) { setSearchError('הזיני שם כדי להשלים פרטים'); return; }
    setDetailsLoading(true);
    setSearchError('');
    const reqId = String(Date.now());
    latestDetailsRef.current = reqId;
    try {
      // Find Google Place ID if not already known
      const hasRealId = draft.providerPlaceId && !draft.providerPlaceId.startsWith('mock_');
      let googlePlaceId = hasRealId ? draft.providerPlaceId! : null;
      if (!googlePlaceId) {
        const found = await searchPlaces(trip.id, term, trip.destination).catch(() => null);
        googlePlaceId = found?.results?.[0]?.providerPlaceId ?? null;
      }

      // Run AI enrichment + Google photo in parallel
      const [result, googleDetails] = await Promise.all([
        enrichPlace(term, trip.destination, draft.nameHe || undefined).catch(() => null),
        googlePlaceId
          ? getPlaceDetails(trip.id, googlePlaceId).catch(() => null)
          : Promise.resolve(null),
      ]);

      if (latestDetailsRef.current !== reqId) return;
      const dirty = dirtyFieldsRef.current;
      const googlePhoto = (googleDetails?.imageUrls ?? [])[0] ?? null;

      setDraft(prev => ({
        ...prev,
        ...(result ? {
          nameHe:      (dirty.has('nameHe')      || prev.nameHe)      ? prev.nameHe      : (result.nameHe    || ''),
          nameEn:      (dirty.has('nameEn')       || prev.nameEn)      ? prev.nameEn      : (result.nameEn    || ''),
          // Fill city if empty (even if user cleared it — that means they want it auto-detected)
          city:        prev.city.trim()  ? prev.city  : (result.city || ''),
          description: (dirty.has('description')  || prev.description) ? prev.description : (result.description || ''),
          website:     (dirty.has('website')      || prev.website)     ? prev.website     : (result.website   || ''),
          type:        dirty.has('type')                               ? prev.type        :
            (result.type && TYPES.includes(result.type) ? result.type : prev.type),
          travelTime:  (dirty.has('travelTime')   || prev.travelTime)  ? prev.travelTime  : (result.travelTime || ''),
          priceAdult:  (dirty.has('priceAdult')   || prev.priceAdult)  ? prev.priceAdult  :
            (result.priceAdult != null ? String(result.priceAdult) : ''),
          priceChild:  (dirty.has('priceChild')   || prev.priceChild)  ? prev.priceChild  :
            (result.priceChild != null ? String(result.priceChild) : ''),
        } : {}),
        // Update Google Place ID and photo if found
        providerPlaceId: googlePlaceId ?? prev.providerPlaceId,
        imageUrl: dirty.has('imageUrl') ? prev.imageUrl : (googlePhoto || prev.imageUrl),
      }));
      // Also show the photo in the image results strip
      if (googlePhoto) setImgResults([googlePhoto]);
    } catch (err) {
      if (latestDetailsRef.current !== reqId) return;
      const msg = (err as { message?: string }).message || '';
      setSearchError(msg.includes('מגבלה') ? msg : 'לא הצלחתי להשלים פרטים — ניתן לערוך ידנית');
    } finally {
      if (latestDetailsRef.current === reqId) setDetailsLoading(false);
    }
  }

  async function handleSheetSave() {
    const nameHe = draft.nameHe.trim();
    const nameEn = draft.nameEn.trim();
    if (!nameHe && !nameEn) { setSearchError('נדרש לפחות שם אחד'); return; }
    setSheetSaving(true);
    setSearchError('');
    try {
      // ── Edit existing place ──────────────────────────────────────
      if (sheetEditingId) {
        const existing = trip.places.find(p => p.id === sheetEditingId);
        const updated: Place = {
          visited:     false,
          booked:      false,
          ...(existing ?? {}),
          id:          sheetEditingId,
          nameHe:      nameHe || nameEn,
          nameEn:      nameEn || undefined,
          city:        draft.city ? normalizeCity(draft.city) : undefined,
          type:        draft.type,
          must:        draft.must,
          address:     draft.address      || undefined,
          description: draft.description  || undefined,
          website:     draft.website      || undefined,
          travelTime:  draft.travelTime   || undefined,
          duration:    draft.duration     ? Number(draft.duration)    : undefined,
          priceAdult:  draft.priceAdult   ? Number(draft.priceAdult)  : undefined,
          priceChild:  draft.priceChild   ? Number(draft.priceChild)  : undefined,
          imageUrl:    draft.imageUrl     || undefined,
          providerPlaceId: draft.providerPlaceId,
          lat:         draft.lat,
          lng:         draft.lng,
        };
        onChange({ ...trip, places: trip.places.map(p => p.id === sheetEditingId ? updated : p) });
        if (draft.imageUrl) {
          setImageCache(c => ({ ...c, [sheetEditingId]: draft.imageUrl }));
          attempted.current.delete(sheetEditingId);
        }

      // ── Add via Google Places search ─────────────────────────────
      } else if (sheetMode === 'search' && draft.providerPlaceId) {
        await savePlaceIdea(trip.id, {
          providerPlaceId: draft.providerPlaceId,
          nameHe:      nameHe || nameEn,
          nameEn:      nameEn || undefined,
          address:     draft.address    || undefined,
          city:        draft.city ? normalizeCity(draft.city) : undefined,
          category:    draft.type,
          description: draft.description || undefined,
          website:     draft.website    || undefined,
          imageUrl:    draft.imageUrl   || undefined,
          must:        draft.must,
        });

      // ── Manual add ───────────────────────────────────────────────
      } else {
        const newPlace: Place = {
          id:          generateId(),
          nameHe:      nameHe || nameEn,
          nameEn:      nameEn || undefined,
          city:        draft.city ? normalizeCity(draft.city) : undefined,
          type:        draft.type,
          must:        draft.must,
          visited:     false,
          booked:      false,
          address:     draft.address      || undefined,
          description: draft.description  || undefined,
          website:     draft.website      || undefined,
          travelTime:  draft.travelTime   || undefined,
          duration:    draft.duration     ? Number(draft.duration)    : undefined,
          priceAdult:  draft.priceAdult   ? Number(draft.priceAdult)  : undefined,
          priceChild:  draft.priceChild   ? Number(draft.priceChild)  : undefined,
          imageUrl:    draft.imageUrl     || undefined,
          lat:         draft.lat,
          lng:         draft.lng,
        };
        onChange({ ...trip, places: [...trip.places, newPlace] });
      }
      dirtyFieldsRef.current = new Set();
      setSheetOpen(false);
      setSheetEditingId(null);
    } catch (err) {
      const msg = (err as { message?: string }).message || '';
      setSearchError(msg.includes('כבר קיים') ? '⚠️ המקום כבר קיים בבנק הרעיונות' : 'שגיאה בשמירה — נסי שוב');
    } finally {
      setSheetSaving(false);
    }
  }

  /* ── Render ─────────────────────────────────────────────────── */
  return (
    <div className="places-tab" dir="rtl" onClick={() => setCalPickerId(null)}>

      {/* ── TOOLBAR ── */}
      <div className="tab-toolbar">
        <div className="toolbar-left">
          <button className="btn-secondary btn-sm" onClick={openSheet}>🔍 חפש מקום</button>
          <button className="btn-primary btn-sm" onClick={openSheetManual}>+ הוסף ידנית</button>
        </div>
        <div className="places-view-toggle">
          <button
            className={`places-view-btn ${placesView === 'bank' ? 'active' : ''}`}
            onClick={() => setPlacesView('bank')}
          >📋 בנק</button>
          <button
            className={`places-view-btn ${placesView === 'map' ? 'active' : ''}`}
            onClick={() => setPlacesView('map')}
          >🗺️ מפה</button>
        </div>
      </div>

      {/* ── MAP VIEW ── */}
      {placesView === 'map' && (
        <Suspense fallback={
          <div className="tripmap-empty" style={{ minHeight: 340, fontSize: 14, color: 'var(--ink-muted)' }}>
            טוען מפה...
          </div>
        }>
          <TripMap places={trip.places || []} destination={trip.destination} />
        </Suspense>
      )}

      {/* ── FILTER CHIPS ── */}
      {placesView === 'bank' && (<>
      <div className="filter-chips-row">
        {FILTER_CHIPS.map(({ key, label }) => (
          <button
            key={key}
            className={`chip ${filter === key ? 'chip-active' : ''}`}
            onClick={() => { setFilter(key); setSelectedCity(null); }}
          >
            {label}
            {key === 'הכל' && trip.places.length > 0 && (
              <span className="chip-count">{trip.places.length}</span>
            )}
          </button>
        ))}
      </div>

      {/* ── CITY SUB-CHIPS (shown when filter==='ערים') ── */}
      {filter === 'ערים' && allCities.length > 0 && (
        <div className="filter-chips-row filter-chips-cities">
          <button
            className={`chip chip-sm ${selectedCity === null ? 'chip-active' : ''}`}
            onClick={() => setSelectedCity(null)}
          >🌍 הכל</button>
          {allCities.map(city => (
            <button
              key={city}
              className={`chip chip-sm ${selectedCity === city ? 'chip-active' : ''}`}
              onClick={() => setSelectedCity(city)}
            >
              📍 {city}
              <span className="chip-count">
                {trip.places.filter(p => normalizeCity(p.city || '') === city).length}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* ── CARDS GRID (flat, no city grouping) ── */}
      {filteredPlaces.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">🗺️</div>
          <p>{filter === 'הכל' ? 'אין מקומות עדיין — הוסיפי את הראשון!' : `אין מקומות בקטגוריה "${filter}"`}</p>
        </div>
      ) : (
        <div className="idea-cards">
          {filteredPlaces.map(place => {
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
                    {place.website
                      ? <a href={place.website} target="_blank" rel="noreferrer" className="idea-card-meta-chip idea-card-link">🔗 אתר</a>
                      : <a href={`https://www.tripadvisor.com/Search?q=${encodeURIComponent((place.nameEn || place.nameHe) + (place.city ? ' ' + place.city : ''))}`} target="_blank" rel="noreferrer" className="idea-card-meta-chip idea-card-link">🍴 TripAdvisor</a>
                    }
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

                      {/* Add to calendar 📅 */}
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
                        onClick={e => { e.stopPropagation(); openSheetEdit(place); }}
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
                  <button type="button" className="place-modal-close" onClick={() => openSheetEdit(vp)} title="עריכה">✏️</button>
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

                {/* Website or TripAdvisor fallback */}
                {vp.website
                  ? <a href={vp.website} target="_blank" rel="noreferrer" className="place-view-link">
                      🔗 {vp.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                    </a>
                  : <a href={`https://www.tripadvisor.com/Search?q=${encodeURIComponent((vp.nameEn || vp.nameHe) + (vp.city ? ' ' + vp.city : ''))}`} target="_blank" rel="noreferrer" className="place-view-link">
                      🍴 חפש ב-TripAdvisor
                    </a>
                }

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
      </>)}

      {/* ── ADD / SEARCH SHEET ── */}
      {sheetOpen && (
        <div className="exp-overlay" onClick={e => { if (e.target === e.currentTarget) closeSheet(); }}>
          <div className="exp-sheet pls-sheet">

            {/* ══ STEP 1: SEARCH ══ */}
            {sheetStep === 'search' && (<>
              <div className="exp-sheet-hdr">
                <button className="exp-sheet-close" onClick={closeSheet}>✕</button>
                <span className="exp-sheet-title">רעיון חדש</span>
                <div />
              </div>
              <div className="pls-search-wrap">
                <p className="pls-search-hint">הכנס שם של מקום</p>
                <input
                  className="exp-field-inp"
                  placeholder="מסעדה, אטרקציה, מוזיאון..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSearch()}
                  autoFocus
                />
                {searchError && <div className="pls-error">{searchError}</div>}
                <div className="pls-search-btns">
                  <button
                    className="pls-btn-search"
                    onClick={handleSearch}
                    disabled={sheetSearching || !searchQuery.trim()}
                  >
                    {sheetSearching ? <><span className="spin">⟳</span> מחפש...</> : 'חפש'}
                  </button>
                  <button className="pls-btn-manual" onClick={switchToManual}>
                    הוסף ידנית
                  </button>
                </div>
              </div>
            </>)}

            {/* ══ STEP 2: RESULTS ══ */}
            {sheetStep === 'results' && (<>
              <div className="exp-sheet-hdr">
                <button
                  className="exp-sheet-close pls-back-icon"
                  onClick={() => { setSheetStep('search'); setSearchError(''); setServiceError(false); }}
                >‹</button>
                <span className="exp-sheet-title">
                  {serviceError ? 'שגיאה' : `${searchResults.length} תוצאות`}
                </span>
                <div />
              </div>
              <div className="pls-results-wrap">
                {serviceError ? (
                  <div className="pls-no-results">
                    <div className="pls-no-results-icon">⚠️</div>
                    <p>השירות אינו זמין כרגע</p>
                    <div className="pls-no-results-btns">
                      <button className="pls-btn-outline" onClick={() => { setSheetStep('search'); setServiceError(false); }}>נסי שוב</button>
                      <button className="pls-btn-outline" onClick={switchToManual}>+ הוסף ידנית</button>
                    </div>
                  </div>
                ) : searchResults.length === 0 ? (
                  <div className="pls-no-results">
                    <div className="pls-no-results-icon">🔍</div>
                    <p>לא נמצאו תוצאות עבור &ldquo;{searchQuery}&rdquo;</p>
                    <p className="pls-no-results-hint">נסי שם אחר, או הוסיפי ידנית</p>
                    <div className="pls-no-results-btns">
                      <button className="pls-btn-outline" onClick={() => { setSheetStep('search'); }}>חיפוש חדש</button>
                      <button className="pls-btn-outline" onClick={switchToManual}>+ הוסף ידנית</button>
                    </div>
                  </div>
                ) : (
                  searchResults.map(r => (
                    <button key={r.providerPlaceId} className="pls-result-item" onClick={() => handleSelectResult(r)}>
                      <div className="pls-result-pin" aria-hidden="true">
                        <svg width="12" height="16" viewBox="0 0 14 18" fill="none">
                          <path d="M7 0C3.13 0 0 3.13 0 7c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5C5.62 9.5 4.5 8.38 4.5 7S5.62 4.5 7 4.5 9.5 5.62 9.5 7 8.38 9.5 7 9.5z" fill="white"/>
                        </svg>
                      </div>
                      <div className="pls-result-body">
                        <div className="pls-result-name">{r.name}</div>
                        <div className="pls-result-addr">{r.address}</div>
                        <span className="pls-result-badge">{r.category}</span>
                      </div>
                      <span className="pls-chevron">‹</span>
                    </button>
                  ))
                )}
                {!serviceError && searchResults.length > 0 && (
                  <div className="pls-results-footer">
                    <button className="pls-new-search-btn" onClick={() => { setSheetStep('search'); }}>חיפוש חדש</button>
                  </div>
                )}
              </div>
            </>)}

            {/* ══ STEP 3: DETAILS FORM ══ */}
            {sheetStep === 'details' && (<>
              <div className="exp-sheet-hdr">
                <button className="exp-sheet-close" onClick={closeSheet}>✕</button>
                <span className="exp-sheet-title">רעיון חדש</span>
                <div />
              </div>
              <div className="pls-details-scroll">

                {/* Hero image */}
                <div className="pls-img-box">
                  {draft.imageUrl ? (
                    <img
                      src={draft.imageUrl}
                      alt=""
                      className="pls-img"
                      onError={() => updateDraft('imageUrl', '')}
                    />
                  ) : (
                    <div className="pls-img-placeholder">
                      <span className="pls-img-icon">{TYPE_ICONS[draft.type] || '📌'}</span>
                    </div>
                  )}
                </div>

                {/* Address row */}
                {draft.address && (
                  <div className="pls-addr-row">
                    <span className="pls-addr-text">{draft.address}</span>
                    <span className="pls-addr-pin">📍</span>
                  </div>
                )}

                {/* Loading indicator */}
                {detailsLoading && (
                  <div className="pls-loading-bar">
                    <span className="spin" style={{ fontSize: 14 }}>⟳</span>
                    <span>משלים פרטים...</span>
                  </div>
                )}

                <div className="pls-fields">

                  {/* Row 1: English name + Hebrew name */}
                  <div className="pls-field-row">
                    <div className="pls-field">
                      <label className="pls-label">Name in English</label>
                      <input
                        className="exp-field-inp"
                        dir="ltr"
                        value={draft.nameEn}
                        onChange={e => updateDraft('nameEn', e.target.value)}
                        placeholder="Place name"
                      />
                    </div>
                    <div className="pls-field">
                      <label className="pls-label">שם בעברית</label>
                      <input
                        className="exp-field-inp"
                        value={draft.nameHe}
                        onChange={e => updateDraft('nameHe', e.target.value)}
                        placeholder="שם המקום"
                      />
                    </div>
                  </div>

                  {/* Row 2: Category + City */}
                  <div className="pls-field-row">
                    <div className="pls-field">
                      <label className="pls-label">קטגוריה</label>
                      <select
                        className="exp-field-inp"
                        value={draft.type}
                        onChange={e => updateDraft('type', e.target.value as PlaceType)}
                      >
                        {TYPES.map(t => <option key={t}>{t}</option>)}
                      </select>
                    </div>
                    <div className="pls-field">
                      <label className="pls-label">עיר</label>
                      <input
                        className="exp-field-inp"
                        value={draft.city}
                        onChange={e => updateDraft('city', e.target.value)}
                        placeholder="קרקוב"
                      />
                    </div>
                  </div>

                  {/* Address (full width) */}
                  <div className="pls-field-full">
                    <label className="pls-label">כתובת</label>
                    <input
                      className="exp-field-inp"
                      value={draft.address}
                      onChange={e => updateDraft('address', e.target.value)}
                      placeholder="עיר (אופציונלי)"
                    />
                  </div>

                  {/* Description */}
                  <div className="pls-field-full">
                    <label className="pls-label">תיאור</label>
                    <textarea
                      className="exp-field-inp pls-textarea"
                      rows={3}
                      value={draft.description}
                      onChange={e => updateDraft('description', e.target.value)}
                    />
                  </div>

                  {/* Website */}
                  <div className="pls-field-full">
                    <label className="pls-label">אתר</label>
                    <input
                      className="exp-field-inp"
                      dir="ltr"
                      value={draft.website}
                      onChange={e => updateDraft('website', e.target.value)}
                      placeholder="https://"
                      type="url"
                    />
                  </div>

                  {/* 4-col row: שעת ביקור, זמן נסיעה, מחיר ילד, מחיר מבוגר */}
                  <div className="pls-field-row pls-field-row--4">
                    <div className="pls-field">
                      <label className="pls-label">שעת ביקור</label>
                      <input
                        className="exp-field-inp"
                        value={draft.duration}
                        onChange={e => updateDraft('duration', e.target.value)}
                        placeholder="שע'"
                      />
                    </div>
                    <div className="pls-field">
                      <label className="pls-label">זמן נסיעה</label>
                      <input
                        className="exp-field-inp"
                        value={draft.travelTime}
                        onChange={e => updateDraft('travelTime', e.target.value)}
                        placeholder="שע'"
                      />
                    </div>
                    <div className="pls-field">
                      <label className="pls-label">מחיר לילד</label>
                      <input
                        className="exp-field-inp"
                        value={draft.priceChild}
                        onChange={e => updateDraft('priceChild', e.target.value)}
                        placeholder="₪"
                        type="number" min="0"
                      />
                    </div>
                    <div className="pls-field">
                      <label className="pls-label">מחיר למבוגר</label>
                      <input
                        className="exp-field-inp"
                        value={draft.priceAdult}
                        onChange={e => updateDraft('priceAdult', e.target.value)}
                        placeholder="₪"
                        type="number" min="0"
                      />
                    </div>
                  </div>

                  {searchError && <div className="pls-error">{searchError}</div>}
                </div>

                {/* Save row */}
                <div className="pls-save-row">
                  <button
                    className="pls-btn-save"
                    onClick={handleSheetSave}
                    disabled={sheetSaving}
                  >
                    {sheetSaving ? <><span className="spin">⟳</span> שומר...</> : sheetEditingId ? 'עדכן מקום' : 'שמור בבנק'}
                  </button>
                  <button
                    className="pls-btn-refresh"
                    onClick={handleRefill}
                    disabled={detailsLoading}
                    aria-label="השלם פרטים חסרים"
                    title="השלם פרטים חסרים"
                  >
                    {detailsLoading ? <span className="spin">⟳</span> : '↺'}
                  </button>
                </div>

              </div>{/* /pls-details-scroll */}
            </>)}

          </div>
        </div>
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

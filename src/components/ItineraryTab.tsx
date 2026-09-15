import { useState, useMemo, useRef } from 'react';
import type { Trip, ItineraryItem, ItemType, DayPeriod, Place } from '../types';
import { generateId } from '../storage';
import {
  Search, Pencil, X, Trash2, Check,
  Sunrise, Sun, Moon, Clock, Globe, UtensilsCrossed, Compass, Leaf,
  Landmark, ShoppingBag, Calendar as CalIcon,
} from 'lucide-react';

interface Props {
  trip: Trip;
  onUpdate: (trip: Trip) => void;
}


const MONTH_HE_FULL = ['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'];

// ── ItemType → icon color ─────────────────────────────────────
const ITEM_COLORS: Record<ItemType, string> = {
  flight:   '#3498db',
  hotel:    '#e74c3c',
  car:      '#f39c12',
  activity: '#e91e63',
  food:     '#2dc76d',
  other:    '#95a5a6',
};

// ── ItemType → Hebrew subtitle label ─────────────────────────
const TYPE_LABELS: Record<ItemType, string> = {
  flight:   'טיסה',
  hotel:    'לינה',
  car:      'רכב שכור',
  activity: 'אטרקציות',
  food:     'מסעדה',
  other:    'אחר',
};

// ── Period labels (short, shown in card) ─────────────────────
const PERIOD_SHORT: Record<DayPeriod, string> = {
  morning:   'בוקר',
  afternoon: 'צהריים',
  evening:   'לילה',
  unset:     '',
};

// ── SVG icon paths per type ───────────────────────────────────
interface IconDef { paths?: string[]; circles?: { cx: number; cy: number; r: number }[] }

const ITIN_ICON_DEFS: Record<string, IconDef> = {
  flight: { paths: [
    'M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z',
  ]},
  hotel: { paths: [
    'M2 4v16', 'M2 8h18a2 2 0 0 1 2 2v10', 'M2 17h20', 'M6 8v9',
  ]},
  car: { paths: [
    'M8 6v6', 'M15 6v6', 'M2 12h19.6',
    'M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4a2 2 0 0 0-2 2v10h3',
  ], circles: [{ cx: 7.5, cy: 18, r: 1.5 }, { cx: 16.5, cy: 18, r: 1.5 }]},
  activity: { paths: ['M20 10c0 6-8 13-8 13s-8-7-8-13a8 8 0 0 1 16 0Z'],
    circles: [{ cx: 12, cy: 10, r: 3 }] },
  food: { paths: [
    'M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2', 'M7 2v20',
    'M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3', 'M21 15v7',
  ]},
  other: { circles: [{ cx: 5, cy: 12, r: 1 }, { cx: 12, cy: 12, r: 1 }, { cx: 19, cy: 12, r: 1 }] },
};

// Calendar icon defs & colors (for CalendarGrid dots)
const CAL_ICON_DEFS: Record<string, IconDef> = {
  flight:   { paths: ['M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z'] },
  hotel:    { paths: ['M2 4v16','M2 8h18a2 2 0 0 1 2 2v10','M2 17h20','M6 8v9'] },
  activity: { paths: ['M20 10c0 6-8 13-8 13s-8-7-8-13a8 8 0 0 1 16 0Z'], circles: [{ cx: 12, cy: 10, r: 3 }] },
  food:     { paths: ['M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2','M7 2v20','M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3','M21 15v7'] },
};
const CAL_ICON_COLORS: Record<string, string> = {
  flight: '#3498db', hotel: '#ef4444', activity: '#ec4899', food: '#ef4444',
};

function CalDayIcon({ type, size = 9 }: { type: string; size?: number }) {
  const def = CAL_ICON_DEFS[type];
  if (!def) return null;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="white" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"
      style={{ display: 'block', flexShrink: 0 }}>
      {def.paths?.map((d, i) => <path key={i} d={d} />)}
      {def.circles?.map((c, i) => <circle key={i} cx={c.cx} cy={c.cy} r={c.r} fill="white" stroke="none" />)}
    </svg>
  );
}

// ── Circular SVG icon (like ExpensesTab's CatIcon) ────────────
function StationIcon({ type, size = 18 }: { type: ItemType; size?: number }) {
  const def = ITIN_ICON_DEFS[type];
  if (!def) return <span style={{ fontSize: size * 0.75, lineHeight: 1 }}>📌</span>;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="white" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"
      style={{ display: 'block', flexShrink: 0 }}>
      {def.paths?.map((d, i) => <path key={i} d={d} />)}
      {def.circles?.map((c, i) => <circle key={i} cx={c.cx} cy={c.cy} r={c.r} fill="white" stroke="none" />)}
    </svg>
  );
}

// ── Date helpers ───────────────────────────────────────────────
function getDates(start: string, end: string): string[] {
  const dates: string[] = [];
  const pad = (n: number) => String(n).padStart(2, '0');
  const toKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const d = new Date(start + 'T12:00:00');
  const e = new Date(end   + 'T12:00:00');
  while (d <= e) { dates.push(toKey(d)); d.setDate(d.getDate() + 1); }
  return dates;
}


// "15 בספטמבר · יום 3"
function fmtDayHeader(date: string, dayIdx: number): string {
  const d = new Date(date + 'T12:00:00');
  return `${d.getDate()} ב${MONTH_HE_FULL[d.getMonth()]} · יום ${dayIdx}`;
}

// Subtitle for a station card
function getSubtitle(item: ItineraryItem): string {
  const parts: string[] = [TYPE_LABELS[item.type]];
  if (item.notes) parts.push(item.notes);
  if (item.address) parts.push(`כתובת: ${item.address}`);
  return parts.join(' • ');
}

// Small edit-2 SVG icon (Lucide style)
function EditIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      style={{ display: 'block' }}>
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

// ── Form state ─────────────────────────────────────────────────
interface StationForm {
  name: string;
  type: ItemType;
  period: DayPeriod;
  time: string;
  notes: string;
  address: string;
  imageUrl: string;
}

function emptyForm(): StationForm {
  return { name: '', type: 'activity', period: 'unset', time: '', notes: '', address: '', imageUrl: '' };
}

// ══════════════════════════════════════════════════════════════
export default function ItineraryTab({ trip, onUpdate }: Props) {
  const dates = useMemo(() => {
    if (!trip.startDate || !trip.endDate) return [];
    return getDates(trip.startDate, trip.endDate);
  }, [trip.startDate, trip.endDate]);

  const [activeDay, setActiveDay] = useState<string>(dates[0] || '');
  const [sheetOpen, setSheetOpen]   = useState(false);
  const [editItem, setEditItem]     = useState<ItineraryItem | null>(null);
  const [sourceChosen, setSourceChosen] = useState<'bank' | 'new' | 'picked' | null>(null);
  const [bankFilter,   setBankFilter]   = useState<string>('הכל'); // category filter inside bank
  const [form, setForm]             = useState<StationForm>(emptyForm());
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  const dragIdx = useRef<number | null>(null);

  const itinerary = trip.itinerary || [];
  const flights   = trip.flights   || [];
  const stays     = trip.stays     || [];
  const dayBases  = trip.dayBases  || {};

  // ── Helpers ──────────────────────────────────────────────────
  function save(patch: Partial<Trip>) { onUpdate({ ...trip, ...patch }); }

  function setBase(date: string, city: string) {
    save({ dayBases: { ...dayBases, [date]: city } });
  }

  function dayItems(date: string) { return itinerary.filter(i => i.date === date); }

  function dayStays(date: string) {
    return stays.filter(s =>
      s.checkIn === date || s.checkOut === date ||
      (s.checkIn < date && date < s.checkOut)
    );
  }

  function dayFlights(date: string) { return flights.filter(f => f.date === date); }

  function deleteItem(id: string) {
    save({ itinerary: itinerary.filter(i => i.id !== id) });
  }

  // ── Sheet ────────────────────────────────────────────────────
  function openSheet(item?: ItineraryItem) {
    if (item) {
      setEditItem(item);
      setForm({
        name:     item.name,
        type:     item.type,
        period:   item.period || 'unset',
        time:     item.time   || '',
        notes:    item.notes  || '',
        address:  item.address || '',
        imageUrl: item.imageUrl || '',
      });
      setSourceChosen('new');
    } else {
      setEditItem(null);
      setForm(emptyForm());
      setSourceChosen(null);
    }
    setSheetOpen(true);
  }

  function closeSheet() {
    setSheetOpen(false);
    setEditItem(null);
    setSourceChosen(null);
    setForm(emptyForm());
    setBankFilter('הכל');
  }

  function pickPlace(p: Place) {
    const type: ItemType = (p.type === 'מסעדה' || p.type === 'קפה') ? 'food' : 'activity';
    setForm(prev => ({ ...prev, name: p.nameHe, type, address: p.address || '', imageUrl: p.imageUrl || '' }));
    setSourceChosen('picked');
  }

  function saveStation() {
    if (!form.name.trim()) return;
    const base = {
      date:     activeDay,
      type:     form.type,
      name:     form.name.trim(),
      period:   form.period,
      time:     form.time    || undefined,
      notes:    form.notes.trim()   || undefined,
      address:  form.address.trim() || undefined,
      imageUrl: form.imageUrl || undefined,
      status:   'planned' as const,
    };
    if (editItem) {
      save({ itinerary: itinerary.map(i => i.id === editItem.id ? { ...i, ...base } : i) });
    } else {
      save({ itinerary: [...itinerary, { id: generateId(), ...base }] });
    }
    closeSheet();
  }

  // ── Drag & drop ──────────────────────────────────────────────
  function handleDragStart(idx: number) { dragIdx.current = idx; }

  function handleDragOver(e: React.DragEvent, idx: number) {
    e.preventDefault();
    setDragOverIdx(idx);
  }

  function handleDrop(targetIdx: number) {
    if (dragIdx.current === null || dragIdx.current === targetIdx) {
      dragIdx.current = null; setDragOverIdx(null); return;
    }
    const others = itinerary.filter(i => i.date !== activeDay);
    const day    = [...dayItems(activeDay)];
    const [moved] = day.splice(dragIdx.current, 1);
    day.splice(targetIdx, 0, moved);
    save({ itinerary: [...others, ...day] });
    dragIdx.current = null; setDragOverIdx(null);
  }

  function handleDragEnd() { dragIdx.current = null; setDragOverIdx(null); }

  // ── Bank places (filtered by day base city) ──────────────────
  const dayBase = (activeDay && dayBases[activeDay]) || '';
  const bankPlaces = (trip.places || []).filter(p =>
    !p.visited && (!dayBase || !p.city || p.city.trim() === dayBase.trim())
  );

  // ── Render ───────────────────────────────────────────────────
  if (dates.length === 0) {
    return (
      <div className="itin-empty">
        <div style={{ marginBottom: 12 }}><CalIcon size={48} strokeWidth={1} style={{ opacity:0.3 }} /></div>
        <h3>אין תאריכים לטיול</h3>
        <p>ערוך את פרטי הטיול והוסף תאריכי התחלה וסיום</p>
      </div>
    );
  }

  const dayStations   = dayItems(activeDay);
  const activeFlights = dayFlights(activeDay);
  const activeStays   = dayStays(activeDay);
  const dayIdx        = dates.indexOf(activeDay) + 1;

  return (
    <div className="itin-root" dir="rtl">

      {/* ══ CALENDAR GRID ══════════════════════════════════════ */}
      <CalendarGrid
        dates={dates}
        activeDay={activeDay}
        getDayContent={d => ({
          hasFlights:    dayFlights(d).length > 0,
          hasStay:       dayStays(d).length > 0,
          hasActivities: dayItems(d).filter(i => i.type !== 'food').length > 0,
          hasFood:       dayItems(d).filter(i => i.type === 'food').length > 0,
        })}
        getDayCity={d => dayBases[d] || ''}
        onSelect={setActiveDay}
      />

      {/* ══ DAY VIEW ═══════════════════════════════════════════ */}
      {activeDay && (
        <div className="itin-day">

          {/* ── Day header: title + button in one row ── */}
          <div className="itin-day-hdr">
            <div className="itin-day-title-row">
              <h2 className="itin-day-title-main">{fmtDayHeader(activeDay, dayIdx)}</h2>
              <button className="itin-add-btn" onClick={() => openSheet()}>
                + הוספת תחנה
              </button>
            </div>
            <div className="itin-day-subhdr">
              <input
                className="itin-base-input"
                placeholder="עיר / מקום"
                value={dayBases[activeDay] || ''}
                onChange={e => setBase(activeDay, e.target.value)}
              />
            </div>
          </div>

          {/* ── Info pills: flights + stays ── */}
          {(activeFlights.length > 0 || activeStays.length > 0) && (
            <div className="itin-info-pills">
              {activeFlights.map(f => (
                <div key={f.id} className="itin-info-pill">
                  <span className="itin-pill-icon">
                    <svg width={12} height={12} viewBox="0 0 24 24" fill="none"
                      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z" />
                    </svg>
                  </span>
                  <span>
                    {f.dir === 'out' ? 'המראה' : 'נחיתה'} {f.dir === 'out' ? f.dep : f.arr}
                    {f.flightNo ? ` · ${f.flightNo}` : ''}
                  </span>
                </div>
              ))}
              {activeStays.map(s => (
                <div key={s.id} className="itin-info-pill">
                  <span className="itin-pill-icon">
                    <svg width={12} height={12} viewBox="0 0 24 24" fill="none"
                      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M2 4v16"/><path d="M2 8h18a2 2 0 0 1 2 2v10"/><path d="M2 17h20"/><path d="M6 8v9"/>
                    </svg>
                  </span>
                  <span>
                    {s.checkIn === activeDay
                      ? `צ'ק אין · השעה טרם נקבעה`
                      : s.checkOut === activeDay
                      ? `צ'ק אאוט`
                      : 'לינה'}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* ── Station / auto item cards ── */}
          {dayStations.length === 0 && activeFlights.length === 0 && activeStays.length === 0 ? (
            <div className="itin-empty-day">
              <div style={{ marginBottom: 8 }}><CalIcon size={36} strokeWidth={1} style={{ opacity:0.3 }} /></div>
              <p>עדיין אין תחנות ביום הזה.</p>
              <p style={{ fontSize: 13 }}>הוסיפי מהבנק או צרי תחנה חדשה.</p>
            </div>
          ) : (
            <div className="itin-station-list">

              {/* Auto items first: flights rendered as cards */}
              {activeFlights.map(f => (
                <div key={f.id} className="itin-station-row itin-station-row--auto">
                  {/* icon */}
                  <div className="itin-icon-circle" style={{ background: ITEM_COLORS.flight }}>
                    <StationIcon type="flight" size={22} />
                  </div>
                  <div className="itin-card-divider" />
                  {/* period col: המראה/נחיתה + time */}
                  <div className="itin-period-col">
                    <span className="itin-period-main">{f.dir === 'out' ? 'המראה' : 'נחיתה'}</span>
                    <span className="itin-period-time">{f.dir === 'out' ? f.dep : f.arr}</span>
                  </div>
                  <div className="itin-card-divider" />
                  {/* body */}
                  <div className="itin-station-body">
                    <span className="itin-station-name">{f.flightNo || `${f.from} → ${f.to}`}</span>
                    <span className="itin-station-sub">{f.from} → {f.to} · {f.dep}–{f.arr}</span>
                  </div>
                  <span className="itin-auto-label">אוטומטי</span>
                  <button className="itin-station-edit" title="טיסה"><EditIcon /></button>
                </div>
              ))}

              {/* Auto items: stays rendered as cards */}
              {activeStays.map(s => {
                const cin  = new Date(s.checkIn  + 'T12:00:00');
                const cout = new Date(s.checkOut + 'T12:00:00');
                const nights = Math.round((cout.getTime() - cin.getTime()) / (1000 * 60 * 60 * 24));
                const periodLabel = s.checkIn === activeDay ? `צ'ק-אין`
                                  : s.checkOut === activeDay ? `צ'ק-אאוט`
                                  : 'לינה';
                return (
                  <div key={s.id} className="itin-station-row itin-station-row--auto">
                    {/* icon */}
                    <div className="itin-icon-circle" style={{ background: ITEM_COLORS.hotel }}>
                      <StationIcon type="hotel" size={22} />
                    </div>
                    <div className="itin-card-divider" />
                    {/* period col */}
                    <div className="itin-period-col">
                      <span className="itin-period-main">לילה</span>
                      <span className="itin-period-time">{periodLabel}</span>
                    </div>
                    <div className="itin-card-divider" />
                    {/* body */}
                    <div className="itin-station-body">
                      <div className="itin-station-name-row">
                        <span className="itin-station-name">{s.name}</span>
                        {nights > 1 && <span className="itin-nights-badge">{nights} ימים</span>}
                      </div>
                      <span className="itin-station-sub">{`לינה • מלון${s.address ? ` • כתובת: ${s.address}` : ''}`}</span>
                    </div>
                    <span className="itin-auto-label">אוטומטי</span>
                    <button className="itin-station-edit" title="עריכה"><EditIcon /></button>
                  </div>
                );
              })}

              {/* Manual stations */}
              {dayStations.map((item, idx) => {
                const period = item.period || 'unset';
                return (
                  <div
                    key={item.id}
                    className={`itin-station-row${dragOverIdx === idx ? ' drag-over' : ''}`}
                    draggable
                    onDragStart={() => handleDragStart(idx)}
                    onDragOver={e => handleDragOver(e, idx)}
                    onDrop={() => handleDrop(idx)}
                    onDragEnd={handleDragEnd}
                  >
                    {/* icon (RTL: first in DOM = rightmost) */}
                    <div className="itin-icon-circle" style={{ background: ITEM_COLORS[item.type] }}>
                      <StationIcon type={item.type} size={22} />
                    </div>
                    <div className="itin-card-divider" />

                    {/* period column */}
                    <div className="itin-period-col">
                      {period !== 'unset' && (
                        <span className="itin-period-main">{PERIOD_SHORT[period]}</span>
                      )}
                      {item.time && <span className="itin-period-time">{item.time}</span>}
                    </div>
                    <div className="itin-card-divider" />

                    {/* body: name + subtitle */}
                    <div className="itin-station-body">
                      <div className="itin-station-name-row">
                        <span className="itin-station-name">{item.name}</span>
                      </div>
                      <span className="itin-station-sub">{getSubtitle(item)}</span>
                    </div>

                    {/* edit button (RTL: last in DOM = leftmost) */}
                    <button
                      className="itin-station-edit"
                      onClick={() => openSheet(item)}
                      title="עריכה"
                    ><EditIcon /></button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ══ ADD / EDIT SHEET ════════════════════════════════════ */}
      {sheetOpen && (
        <div
          className="exp-overlay"
          onClick={e => e.target === e.currentTarget && closeSheet()}
        >
          <div className="exp-sheet exp-sheet--form itin-sheet">
            <div className="exp-sheet-hdr">
              <button className="exp-sheet-close" onClick={closeSheet}><X size={18} strokeWidth={2} /></button>
              <span className="exp-sheet-title">
                {editItem ? 'עריכת תחנה' : 'הוספת תחנה'}
              </span>
              <div />
            </div>

            {/* Step 1: choose source (new item only) */}
            {!editItem && sourceChosen === null && (
              <div className="itin-source-pick">
                <button className="itin-source-btn" onClick={() => setSourceChosen('bank')}>
                  <Search size={28} strokeWidth={1.5} style={{ display:'block', marginBottom:4 }} />
                  <span>מהבנק</span>
                </button>
                <button className="itin-source-btn" onClick={() => setSourceChosen('new')}>
                  <Pencil size={28} strokeWidth={1.5} style={{ display:'block', marginBottom:4 }} />
                  <span>תחנה חדשה</span>
                </button>
              </div>
            )}

            {/* Bank list */}
            {sourceChosen === 'bank' && (() => {
              const BANK_CATS: { key: string; label: string; icon: React.ElementType }[] = [
                { key: 'הכל',     label: 'הכל',      icon: Globe },
                { key: 'אוכל',    label: 'אוכל',     icon: UtensilsCrossed },
                { key: 'אטרקציה', label: 'אטרקציות', icon: Compass },
                { key: 'טבע',     label: 'טבע',      icon: Leaf },
                { key: 'מוזיאון', label: 'מוזיאון',  icon: Landmark },
                { key: 'שוק',     label: 'שוק',      icon: ShoppingBag },
              ];
              const FOOD = new Set(['מסעדה', 'קפה']);
              const filtered = bankPlaces.filter(p => {
                if (bankFilter === 'הכל')    return true;
                if (bankFilter === 'אוכל')   return FOOD.has(p.type);
                if (bankFilter === 'אטרקציה') return p.type === 'אטרקציה';
                if (bankFilter === 'טבע')    return p.type === 'פארק';
                if (bankFilter === 'מוזיאון') return p.type === 'מוזיאון';
                if (bankFilter === 'שוק')    return p.type === 'שוק';
                return true;
              });
              return (
                <>
                  {/* Category chips */}
                  <div className="itin-bank-cats">
                    {BANK_CATS.map(({ key, label, icon: BankIcon }) => (
                      <button
                        key={key}
                        className={`chip chip-sm ${bankFilter === key ? 'chip-active' : ''}`}
                        onClick={() => setBankFilter(key)}
                      >
                        <BankIcon size={12} strokeWidth={2} style={{ display:'inline',verticalAlign:'middle',marginInlineEnd:3 }} />{label}
                        <span className="chip-count">
                          {key === 'הכל' ? bankPlaces.length
                            : key === 'אוכל' ? bankPlaces.filter(p => FOOD.has(p.type)).length
                            : key === 'אטרקציה' ? bankPlaces.filter(p => p.type === 'אטרקציה').length
                            : key === 'טבע'     ? bankPlaces.filter(p => p.type === 'פארק').length
                            : key === 'מוזיאון' ? bankPlaces.filter(p => p.type === 'מוזיאון').length
                            : bankPlaces.filter(p => p.type === 'שוק').length}
                        </span>
                      </button>
                    ))}
                  </div>

                  {/* Places list */}
                  {filtered.length === 0 ? (
                    <div style={{ padding: '24px 20px', textAlign: 'center', color: 'var(--ink-muted)', fontSize: 14 }}>
                      {bankPlaces.length === 0
                        ? (dayBase ? `אין מקומות בבנק לעיר "${dayBase}"` : 'הבנק ריק — הוסף מקומות בלשונית מקומות')
                        : `אין מקומות בקטגוריה "${bankFilter}"`}
                    </div>
                  ) : (
                    <div className="itin-bank-list">
                      {filtered.map(p => (
                        <button key={p.id} className="itin-bank-item" onClick={() => pickPlace(p)}>
                          <span className="itin-bank-item-type">{p.type}</span>
                          <span className="itin-bank-item-name">{p.nameHe}</span>
                          {p.city && <span className="itin-bank-item-city">{p.city}</span>}
                        </button>
                      ))}
                    </div>
                  )}

                  <div style={{ padding: '0 16px 16px' }}>
                    <button
                      style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 14px', cursor: 'pointer', color: 'var(--ink-muted)', fontSize: 13 }}
                      onClick={() => setSourceChosen('new')}
                    >
                      <Pencil size={13} strokeWidth={1.75} style={{ display:'inline',verticalAlign:'middle',marginInlineEnd:4 }} />תחנה חדשה במקום
                    </button>
                  </div>
                </>
              );
            })()}

            {/* Form fields */}
            {(sourceChosen === 'new' || sourceChosen === 'picked' || editItem) && (
              <div className="itin-station-form">

                {/* Image (picked from bank) */}
                {form.imageUrl && (
                  <div className="itin-form-img-wrap">
                    <img src={form.imageUrl} alt={form.name} className="itin-form-img" />
                  </div>
                )}

                {/* Name */}
                <div className="itin-form-field">
                  <label className="itin-form-label">שם הפעילות</label>
                  <input
                    className="itin-form-input"
                    placeholder="הזן שם..."
                    value={form.name}
                    // eslint-disable-next-line jsx-a11y/no-autofocus
                    autoFocus={!form.imageUrl}
                    onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                  />
                </div>

                {/* Type — only for new/edit */}
                {(sourceChosen === 'new' || editItem) && (
                  <div className="itin-form-field">
                    <label className="itin-form-label">סוג</label>
                    <div className="itin-type-btns">
                      <button
                        className={form.type === 'activity' ? 'active' : ''}
                        onClick={() => setForm(p => ({ ...p, type: 'activity' }))}
                      ><Compass size={14} strokeWidth={1.75} style={{ display:'inline',verticalAlign:'middle',marginInlineEnd:4 }} />פעילות</button>
                      <button
                        className={form.type === 'food' ? 'active' : ''}
                        onClick={() => setForm(p => ({ ...p, type: 'food' }))}
                      ><UtensilsCrossed size={14} strokeWidth={1.75} style={{ display:'inline',verticalAlign:'middle',marginInlineEnd:4 }} />אוכל</button>
                    </div>
                  </div>
                )}

                {/* Period chips */}
                <div className="itin-form-field">
                  <label className="itin-form-label">חלק ביום</label>
                  <div className="itin-period-chips">
                    {([
                      { v: 'morning',   label: 'בוקר',     icon: Sunrise },
                      { v: 'afternoon', label: 'צהריים',   icon: Sun },
                      { v: 'evening',   label: 'ערב',      icon: Moon },
                      { v: 'unset',     label: 'טרם נקבע', icon: Clock },
                    ] as { v: DayPeriod; label: string; icon: React.ElementType }[]).map(({ v, label, icon: PIcon }) => (
                      <button
                        key={v}
                        className={`itin-period-chip ${form.period === v ? 'active' : ''}`}
                        onClick={() => setForm(p => ({ ...p, period: v }))}
                      >
                        <PIcon size={13} strokeWidth={1.75} style={{ display:'inline',verticalAlign:'middle',marginInlineEnd:4 }} />{label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Time */}
                <div className="itin-form-field">
                  <label className="itin-form-label">שעה <span style={{ fontWeight: 400, color: 'var(--ink-muted)' }}>(אופציונלי)</span></label>
                  <input
                    className="itin-form-input"
                    type="time"
                    value={form.time}
                    onChange={e => setForm(p => ({ ...p, time: e.target.value }))}
                  />
                </div>

                {/* Notes */}
                <div className="itin-form-field">
                  <label className="itin-form-label">הערה <span style={{ fontWeight: 400, color: 'var(--ink-muted)' }}>(אופציונלי)</span></label>
                  <textarea
                    className="itin-form-input"
                    rows={2}
                    placeholder="הערה..."
                    value={form.notes}
                    onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                  />
                </div>

                {/* Save button — lime green like budget tab */}
                <button
                  className="itin-btn-save"
                  disabled={!form.name.trim()}
                  onClick={saveStation}
                >
                  <Check size={15} strokeWidth={2.5} style={{ display:'inline',verticalAlign:'middle',marginInlineEnd:4 }} />{editItem ? 'שמור שינויים' : 'הוסף תחנה'}
                </button>

                {editItem && (
                  <button
                    className="itin-btn-delete"
                    onClick={() => { deleteItem(editItem.id); closeSheet(); }}
                  >
                    <Trash2 size={14} strokeWidth={1.75} style={{ display:'inline',verticalAlign:'middle',marginInlineEnd:5 }} />מחק תחנה
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Calendar Grid (original navigation) ───────────────────────
interface DayContent { hasFlights: boolean; hasStay: boolean; hasActivities: boolean; hasFood: boolean; }

function CalendarGrid({
  dates, activeDay, getDayContent, getDayCity, onSelect,
}: {
  dates: string[];
  activeDay: string;
  getDayContent: (date: string) => DayContent;
  getDayCity: (date: string) => string;
  onSelect: (date: string) => void;
}) {
  if (dates.length === 0) return null;

  const startDow = new Date(dates[0] + 'T12:00:00').getDay();
  const cells: (string | null)[] = [...Array(startDow).fill(null), ...dates];
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) {
    const w = cells.slice(i, i + 7);
    while (w.length < 7) w.push(null);
    weeks.push(w);
  }

  // Full Hebrew day names, Sun→Sat (in RTL grid: ראשון rightmost, שבת leftmost)
  const WEEK_HE_FULL = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
  const MONTH_HE_CAL = ['ינו', 'פבר', 'מרץ', 'אפר', 'מאי', 'יוני', 'יולי', 'אוג', 'ספט', 'אוק', 'נוב', 'דצמ'];

  return (
    <div className="itin-calendar">
      <div className="itin-cal-header">
        {WEEK_HE_FULL.map(d => <div key={d} className="itin-cal-dh">{d}</div>)}
      </div>
      {weeks.map((week, wi) => (
        <div key={wi} className="itin-cal-week">
          {week.map((date, di) => {
            if (!date) return <div key={di} className="itin-cal-empty" />;
            const d = new Date(date + 'T12:00:00');
            const { hasFlights, hasStay, hasActivities, hasFood } = getDayContent(date);
            const city = getDayCity(date);
            return (
              <button
                key={di}
                className={`itin-cal-day${activeDay === date ? ' active' : ''}${hasStay ? ' has-stay' : ''}`}
                onClick={() => onSelect(date)}
              >
                {/* Date row: month name (light) + day number (extrabold) */}
                <div className="icd-date-row">
                  <span className="icd-month">{MONTH_HE_CAL[d.getMonth()]}'</span>
                  <span className="icd-num">{d.getDate()}</span>
                </div>
                {/* City fills middle */}
                {city && <span className="icd-city">{city}</span>}
                {/* Dots row: rounded-square icons */}
                <div className="icd-foot">
                  {hasFlights    && <span className="icd-icon" style={{ background: CAL_ICON_COLORS.flight }}><CalDayIcon type="flight" size={10} /></span>}
                  {hasStay       && <span className="icd-icon" style={{ background: CAL_ICON_COLORS.hotel }}><CalDayIcon type="hotel" size={10} /></span>}
                  {hasActivities && <span className="icd-icon" style={{ background: CAL_ICON_COLORS.activity }}><CalDayIcon type="activity" size={10} /></span>}
                  {hasFood       && <span className="icd-icon" style={{ background: CAL_ICON_COLORS.food }}><CalDayIcon type="food" size={10} /></span>}
                </div>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

import { useState, useMemo } from 'react';
import type { Trip, ItineraryItem, ItemType, MealSlot, ItemStatus } from '../types';
import { generateId } from '../storage';

interface Props {
  trip: Trip;
  onUpdate: (trip: Trip) => void;
}

const WEEK_HE = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
const MONTH_HE = ['ינו', 'פבר', 'מרץ', 'אפר', 'מאי', 'יוני', 'יולי', 'אוג', 'ספט', 'אוק', 'נוב', 'דצמ'];

const ITEM_ICONS: Record<ItemType, string> = {
  flight: '✈️', hotel: '🏨', car: '🚗', activity: '🎯', food: '🍽️', other: '📌'
};

const SLOT_LABELS: Record<MealSlot, string> = {
  breakfast: '🥐 בוקר', lunch: '🍜 צהריים', dinner: '🍷 ערב'
};

const CURRENCY_SYMBOLS: Record<string, string> = {
  ILS: '₪', USD: '$', EUR: '€', PLN: 'zł', GBP: '£'
};

function getDates(start: string, end: string): string[] {
  const dates: string[] = [];
  // Use noon local time so DST / UTC-offset shifts never cross midnight.
  // Build date string from LOCAL getFullYear/getMonth/getDate to avoid UTC shift.
  const pad = (n: number) => String(n).padStart(2, '0');
  const toKey = (d: Date) =>
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const d = new Date(start + 'T12:00:00');
  const e = new Date(end   + 'T12:00:00');
  while (d <= e) {
    dates.push(toKey(d));
    d.setDate(d.getDate() + 1);
  }
  return dates;
}

function fmtDate(date: string) {
  const d = new Date(date + 'T12:00:00');
  return `${d.getDate()} ${MONTH_HE[d.getMonth()]}`;
}

function fmtWeekday(date: string) {
  const d = new Date(date + 'T12:00:00');
  return WEEK_HE[d.getDay()];
}

// --------- Empty state factories ---------
function emptyItem(date: string): Partial<ItineraryItem> {
  return { date, type: 'activity', status: 'planned', name: '' };
}

// --------- Budget helper ---------
function calcBudget(items: ItineraryItem[], stays: Stay[]) {
  const map: Record<string, Record<string, number>> = {};
  const addCost = (cur: string, cat: string, amt: number) => {
    if (!map[cur]) map[cur] = {};
    map[cur][cat] = (map[cur][cat] || 0) + amt;
  };
  items.forEach(i => i.cost && addCost(i.currency || 'ILS', i.type, i.cost));
  stays.forEach(s => s.cost && addCost(s.currency || 'ILS', 'hotel', s.cost));
  return map;
}

export default function ItineraryTab({ trip, onUpdate }: Props) {
  const dates = useMemo(() => {
    if (!trip.startDate || !trip.endDate) return [];
    return getDates(trip.startDate, trip.endDate);
  }, [trip.startDate, trip.endDate]);

  const [activeDay, setActiveDay] = useState<string>(dates[0] || '');
  const [showAddItem, setShowAddItem] = useState(false);
  const [newItem, setNewItem] = useState<Partial<ItineraryItem>>(emptyItem(dates[0] || ''));

  const itinerary = trip.itinerary || [];
  const flights = trip.flights || [];
  const stays = trip.stays || [];
  const dayBases = trip.dayBases || {};

  const budget = useMemo(() => calcBudget(itinerary, stays), [itinerary, stays]);

  function save(patch: Partial<Trip>) {
    onUpdate({ ...trip, ...patch });
  }

  // ---------- ITEMS ----------
  function addItem() {
    if (!newItem.name) return;
    const item: ItineraryItem = {
      id: generateId(),
      date: newItem.date || activeDay,
      type: newItem.type as ItemType || 'activity',
      slot: newItem.slot as MealSlot | undefined,
      name: newItem.name,
      time: newItem.time,
      cost: newItem.cost,
      currency: newItem.currency || 'ILS',
      status: newItem.status as ItemStatus || 'planned',
      address: newItem.address,
      notes: newItem.notes,
    };
    save({ itinerary: [...itinerary, item] });
    setNewItem(emptyItem(activeDay));
    setShowAddItem(false);
  }

  function deleteItem(id: string) {
    save({ itinerary: itinerary.filter(i => i.id !== id) });
  }

  function toggleStatus(id: string) {
    save({
      itinerary: itinerary.map(i =>
        i.id === id ? { ...i, status: i.status === 'paid' ? 'planned' : 'paid' } : i
      )
    });
  }

  // ---------- STAYS ----------
  function deleteStay(id: string) {
    save({ stays: stays.filter(s => s.id !== id) });
  }

  // ---------- DAY BASE ----------
  function setBase(date: string, city: string) {
    save({ dayBases: { ...dayBases, [date]: city } });
  }

  // ---------- Items for a day ----------
  function dayItems(date: string) {
    return itinerary.filter(i => i.date === date);
  }

  function dayStays(date: string) {
    return stays.filter(s =>
      (s.checkIn === date) || (s.checkOut === date) ||
      (s.checkIn < date && date < s.checkOut)
    );
  }

  function dayFlights(date: string) {
    return flights.filter(f => f.date === date);
  }

  const meals: MealSlot[] = ['breakfast', 'lunch', 'dinner'];

  if (dates.length === 0) {
    return (
      <div className="itin-empty">
        <div style={{ fontSize: 48, marginBottom: 12 }}>🗓️</div>
        <h3>אין תאריכים לטיול</h3>
        <p>ערוך את פרטי הטיול והוסף תאריכי התחלה וסיום</p>
      </div>
    );
  }

  return (
    <div className="itin-root" dir="rtl">
      {/* ===== BUDGET ===== */}
      {Object.keys(budget).length > 0 && (
        <div className="itin-budget">
          <h3 className="itin-section-title">💰 תקציב</h3>
          <div className="itin-budget-cards">
            {Object.entries(budget).map(([cur, cats]) => {
              const total = Object.values(cats).reduce((a, b) => a + b, 0);
              const sym = CURRENCY_SYMBOLS[cur] || cur;
              return (
                <div key={cur} className="itin-budget-card">
                  <div className="ibc-total">{sym}{total.toLocaleString()}</div>
                  <div className="ibc-currency">{cur}</div>
                  {Object.entries(cats).map(([cat, amt]) => (
                    <div key={cat} className="ibc-row">
                      <span>{ITEM_ICONS[cat as ItemType] || '📌'} {cat}</span>
                      <span>{sym}{amt.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ===== CALENDAR GRID ===== */}
      <CalendarGrid
        dates={dates}
        activeDay={activeDay}
        dayBases={dayBases}
        hasItems={d =>
          dayItems(d).length > 0 ||
          dayFlights(d).length > 0 ||
          dayStays(d).length > 0
        }
        onSelect={setActiveDay}
      />

      {/* ===== DAY CARD ===== */}
      {activeDay && (
        <div className="itin-day-card">
          <div className="idc-header">
            <h3>{fmtWeekday(activeDay)}, {fmtDate(activeDay)}</h3>
            <input
              className="idc-base-input"
              placeholder="בסיס (עיר/מלון)"
              value={dayBases[activeDay] || ''}
              onChange={e => setBase(activeDay, e.target.value)}
            />
          </div>

          {/* day flights */}
          {dayFlights(activeDay).map(f => (
            <div key={f.id} className="itin-day-flight">
              ✈️ {f.from} → {f.to} · {f.dep}–{f.arr} {f.flightNo && `(${f.flightNo})`}
            </div>
          ))}

          {/* stays banner */}
          {dayStays(activeDay).map(s => (
            <div key={s.id} className={`itin-stay-banner ${s.checkIn === activeDay ? 'check-in' : s.checkOut === activeDay ? 'check-out' : 'staying'}`}>
              🏨 {s.name}
              {s.checkIn === activeDay && ' · צ׳ק-אין'}
              {s.checkOut === activeDay && ' · צ׳ק-אאוט'}
              <button className="stay-del" onClick={() => deleteStay(s.id)}>✕</button>
            </div>
          ))}

          {/* meal slots */}
          <div className="itin-meals">
            {meals.map(slot => {
              const mealItems = dayItems(activeDay).filter(i => i.type === 'food' && i.slot === slot);
              return (
                <div key={slot} className="itin-meal-slot">
                  <div className="ims-label">{SLOT_LABELS[slot]}</div>
                  {mealItems.length === 0
                    ? <div className="ims-empty">—</div>
                    : mealItems.map(item => (
                        <ItemRow key={item.id} item={item} onDelete={deleteItem} onToggle={toggleStatus} />
                      ))
                  }
                  <button className="ims-add" onClick={() => {
                    setNewItem({ ...emptyItem(activeDay), type: 'food', slot });
                    setShowAddItem(true);
                  }}>+</button>
                </div>
              );
            })}
          </div>

          {/* activities */}
          <div className="itin-activities">
            <div className="ia-title">🎯 פעילויות</div>
            {dayItems(activeDay).filter(i => i.type !== 'food').map(item => (
              <ItemRow key={item.id} item={item} onDelete={deleteItem} onToggle={toggleStatus} />
            ))}
            <button className="btn-forest-sm" onClick={() => {
              setNewItem({ ...emptyItem(activeDay), type: 'activity' });
              setShowAddItem(true);
            }}>+ הוסף פעילות</button>
          </div>
        </div>
      )}

      {/* ===== ADD ITEM MODAL ===== */}
      {showAddItem && (
        <Modal title="הוספת פריט" onClose={() => setShowAddItem(false)}>
          <label>שם<input className="itin-input" value={newItem.name || ''} onChange={e => setNewItem(p => ({ ...p, name: e.target.value }))} /></label>
          <label>סוג
            <select className="itin-input" value={newItem.type || 'activity'} onChange={e => setNewItem(p => ({ ...p, type: e.target.value as ItemType }))}>
              <option value="activity">🎯 אטרקציה</option>
              <option value="food">🍽️ אוכל</option>
              <option value="hotel">🏨 לינה</option>
              <option value="car">🚗 תחבורה</option>
              <option value="flight">✈️ טיסה</option>
              <option value="other">📌 אחר</option>
            </select>
          </label>
          {newItem.type === 'food' && (
            <label>ארוחה
              <select className="itin-input" value={newItem.slot || 'lunch'} onChange={e => setNewItem(p => ({ ...p, slot: e.target.value as MealSlot }))}>
                <option value="breakfast">🥐 בוקר</option>
                <option value="lunch">🍜 צהריים</option>
                <option value="dinner">🍷 ערב</option>
              </select>
            </label>
          )}
          <div className="itin-row2">
            <label>שעה<input className="itin-input" type="time" value={newItem.time || ''} onChange={e => setNewItem(p => ({ ...p, time: e.target.value }))} /></label>
            <label>עלות<input className="itin-input" type="number" placeholder="0" value={newItem.cost || ''} onChange={e => setNewItem(p => ({ ...p, cost: +e.target.value }))} /></label>
            <label>מטבע
              <select className="itin-input" value={newItem.currency || 'ILS'} onChange={e => setNewItem(p => ({ ...p, currency: e.target.value }))}>
                <option value="ILS">₪ ILS</option>
                <option value="EUR">€ EUR</option>
                <option value="USD">$ USD</option>
                <option value="PLN">zł PLN</option>
              </select>
            </label>
          </div>
          <label>כתובת<input className="itin-input" value={newItem.address || ''} onChange={e => setNewItem(p => ({ ...p, address: e.target.value }))} /></label>
          <label>הערות<textarea className="itin-input" rows={2} value={newItem.notes || ''} onChange={e => setNewItem(p => ({ ...p, notes: e.target.value }))} /></label>
          <div className="itin-row2">
            <label><input type="radio" name="status" checked={newItem.status !== 'paid'} onChange={() => setNewItem(p => ({ ...p, status: 'planned' }))} /> מתוכנן</label>
            <label><input type="radio" name="status" checked={newItem.status === 'paid'} onChange={() => setNewItem(p => ({ ...p, status: 'paid' }))} /> שולם</label>
          </div>
          <button className="btn-forest" onClick={addItem}>הוסף</button>
        </Modal>
      )}

    </div>
  );
}

// ----- Small components -----
function ItemRow({ item, onDelete, onToggle }: {
  item: ItineraryItem;
  onDelete: (id: string) => void;
  onToggle: (id: string) => void;
}) {
  return (
    <div className={`itin-item-row ${item.status === 'paid' ? 'paid' : ''}`}>
      <span className="iir-icon">{ITEM_ICONS[item.type]}</span>
      <span className="iir-name">{item.name}</span>
      {item.time && <span className="iir-time">{item.time}</span>}
      {item.address && (
        <span className="iir-addr">
          <a href={`https://maps.google.com/?q=${encodeURIComponent(item.address)}`} target="_blank" rel="noreferrer">📍</a>
        </span>
      )}
      {item.cost && (
        <span className="iir-cost">
          {CURRENCY_SYMBOLS[item.currency || 'ILS'] || item.currency}{item.cost}
        </span>
      )}
      <button
        className={`iir-status ${item.status === 'paid' ? 'paid' : ''}`}
        onClick={() => onToggle(item.id)}
      >
        {item.status === 'paid' ? '✓ שולם' : 'מתוכנן'}
      </button>
      <button className="iir-del" onClick={() => onDelete(item.id)}>✕</button>
    </div>
  );
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="itin-modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="itin-modal">
        <div className="itin-modal-header">
          <h3>{title}</h3>
          <button onClick={onClose}>✕</button>
        </div>
        <div className="itin-modal-body">{children}</div>
      </div>
    </div>
  );
}

// ---- Calendar grid ----
function CalendarGrid({
  dates, activeDay, dayBases, hasItems, onSelect,
}: {
  dates: string[];
  activeDay: string;
  dayBases: Record<string, string>;
  hasItems: (date: string) => boolean;
  onSelect: (date: string) => void;
}) {
  if (dates.length === 0) return null;

  // getDay() → 0=ראשון (Sun) … 6=שבת (Sat) — matches Israeli week
  const startDow = new Date(dates[0] + 'T12:00:00').getDay();

  // Flat list: nulls for padding, then trip dates
  const cells: (string | null)[] = [
    ...Array(startDow).fill(null),
    ...dates,
  ];

  // Chunk into weeks of 7, pad last week
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) {
    const w = cells.slice(i, i + 7);
    while (w.length < 7) w.push(null);
    weeks.push(w);
  }

  return (
    <div className="itin-calendar">
      {/* Day-of-week header */}
      <div className="itin-cal-header">
        {WEEK_HE.map(d => <div key={d} className="itin-cal-dh">{d}</div>)}
      </div>

      {/* Week rows */}
      {weeks.map((week, wi) => (
        <div key={wi} className="itin-cal-week">
          {week.map((date, di) =>
            date ? (
              <button
                key={di}
                className={`itin-cal-day${activeDay === date ? ' active' : ''}`}
                onClick={() => onSelect(date)}
              >
                <span className="icd-num">{new Date(date + 'T12:00:00').getDate()}</span>
                {dayBases[date] && (
                  <span className="icd-city">{dayBases[date]}</span>
                )}
                {hasItems(date) && <span className="icd-dot" />}
              </button>
            ) : (
              <div key={di} className="itin-cal-empty" />
            )
          )}
        </div>
      ))}
    </div>
  );
}

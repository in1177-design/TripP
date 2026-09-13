import { useState } from 'react';
import type { Trip, ItineraryItem } from '../types';

interface Props {
  trip: Trip;
  onNavigate: (tab: string) => void;
}

const MONTH_HE      = ['ינו','פבר','מרץ','אפר','מאי','יוני','יולי','אוג','ספט','אוק','נוב','דצמ'];
const MONTH_HE_FULL = ['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'];
const CURRENCY_SYMBOLS: Record<string, string> = { ILS:'₪', USD:'$', EUR:'€', PLN:'zł', GBP:'£' };

function getDates(start: string, end: string): string[] {
  const dates: string[] = [];
  const pad = (n: number) => String(n).padStart(2,'0');
  const toKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  const d = new Date(start+'T12:00:00');
  const e = new Date(end  +'T12:00:00');
  while (d <= e) { dates.push(toKey(d)); d.setDate(d.getDate()+1); }
  return dates;
}

function toILS(amount: number, currency: string, rates: Record<string,number>): number {
  if (currency === 'ILS') return amount;
  return amount * (rates[currency] || 1);
}

export default function DashboardTab({ trip, onNavigate }: Props) {
  const todayStr  = new Date().toISOString().slice(0,10);
  const todayDate = new Date();
  const hour      = todayDate.getHours();

  const itinerary = trip.itinerary || [];
  const stays     = trip.stays     || [];
  const expenses  = trip.expenses  || [];
  const flights   = trip.flights   || [];
  const rates     = trip.exchangeRates || {};

  // ── Trip phase ──────────────────────────────────────────
  const startDate  = new Date(trip.startDate + 'T12:00:00');
  const endDate    = new Date(trip.endDate   + 'T12:00:00');
  const daysUntil  = Math.ceil((startDate.getTime() - todayDate.getTime()) / 86400000);
  const isDuring   = daysUntil <= 0 && todayDate <= endDate;
  const totalDays  = Math.floor((endDate.getTime() - startDate.getTime()) / 86400000) + 1;
  const dayNum     = isDuring ? Math.floor((todayDate.getTime() - startDate.getTime()) / 86400000) + 1 : null;

  // ── City + greeting ──────────────────────────────────────
  // Use dayBase if set, otherwise extract city from destination (strip year & country prefix)
  const rawCity = trip.dayBases?.[todayStr] || '';
  const fallbackCity = (() => {
    const dest = trip.destination || '';
    // "פולין — קרקוב וזקופנה 2026" → "קרקוב"
    const afterDash = dest.includes('—') ? dest.split('—').pop()!.trim() : dest;
    return afterDash.replace(/\b\d{4}\b/g, '').trim().split(' ')[0];
  })();
  const currentCity = rawCity || fallbackCity;
  const greetingWord = hour < 12 ? 'בוקר טוב' : hour < 17 ? 'צהריים טובים' : 'ערב טוב';

  // ── Today's first activity (for subtitle) ────────────────
  const todayItems = itinerary
    .filter(i => i.date === todayStr && i.type !== 'hotel')
    .sort((a,b) => (a.time||'').localeCompare(b.time||''));
  const heroSub = todayItems[0]?.notes || todayItems[0]?.name || '';

  // ── Budget ───────────────────────────────────────────────
  const totalSpent   = expenses.reduce((s,e) => s + toILS(e.amount, e.currency, rates), 0);
  const totalPlanned = [
    ...itinerary.filter(i => i.cost).map(i => toILS(i.cost!, i.currency||'ILS', rates)),
    ...stays.filter(s => s.cost).map(s => toILS(s.cost!, s.currency||'ILS', rates)),
  ].reduce((a,b) => a+b, 0);
  const budgetPct = totalPlanned > 0 ? Math.min(100, (totalSpent/totalPlanned)*100) : 0;

  // ── Checklist ────────────────────────────────────────────
  const checkItems = [
    { label: 'לשמור את אישורי ההזמנה', done: flights.length > 0 },
    { label: 'לוודא שביטוח הנסיעות בתוקף', done: false },
    { label: 'לבדוק את מועד הצ\'ק-אין לחזור', done: stays.length > 0 },
  ];
  const doneCnt = checkItems.filter(c => c.done).length;

  // ── Calendar / timeline ───────────────────────────────────
  const dates = (trip.startDate && trip.endDate) ? getDates(trip.startDate, trip.endDate) : [];
  const defaultDay = dates.includes(todayStr) ? todayStr : (dates[0] || todayStr);
  const [activeDay, setActiveDay] = useState(defaultDay);

  const activeD   = new Date(activeDay + 'T12:00:00');
  const monthLabel = MONTH_HE_FULL[activeD.getMonth()];

  const calItems: ItineraryItem[] = itinerary
    .filter(i => i.date === activeDay)
    .sort((a,b) => (a.time||'').localeCompare(b.time||''));

  // ── Date display ─────────────────────────────────────────
  const dd = String(todayDate.getDate()).padStart(2,'0');
  const mm = String(todayDate.getMonth()+1).padStart(2,'0');

  return (
    <div className="dash-new" dir="rtl">

      {/* ═══ LEFT COLUMN ═══ */}
      <div className="dash-left">

        {/* Hero card */}
        <div
          className="dhc"
          style={trip.coverImage ? { backgroundImage: `url(${trip.coverImage})` } : {}}
        >
          <div className="dhc-overlay">
            <div className="dhc-top">
              <span className="dhc-label">היום בטיול</span>
              <span className="dhc-daycount">
                {isDuring && dayNum ? `יום ${dayNum} מתוך ${totalDays}` :
                 daysUntil > 0    ? `עוד ${daysUntil} ימים` :
                 'הטיול הסתיים'}
              </span>
            </div>
            <div className="dhc-mid">
              <span className="dhc-date">{dd}.{mm}</span>
            </div>
            <div className="dhc-body">
              <h2 className="dhc-greeting">{greetingWord}{currentCity ? `, ${currentCity}` : ''}.</h2>
              {heroSub && <p className="dhc-sub">{heroSub}</p>}
            </div>
          </div>
        </div>

        {/* Budget card */}
        <div className="dash-dark-card">
          <div className="ddc-badge-row">
            <span className="ddc-badge">₪ · תקציב</span>
            <h3 className="ddc-title">התקציב שלנו</h3>
          </div>
          {totalPlanned > 0 ? (
            <>
              <div className="dbc-nums">
                <span className="dbc-spent">{Math.round(totalSpent).toLocaleString()}</span>
                <span className="dbc-slash"> / </span>
                <span className="dbc-planned">{Math.round(totalPlanned).toLocaleString()}</span>
              </div>
              <div className="dbc-bar-wrap">
                <div className="dbc-bar" style={{ width: `${budgetPct}%` }} />
              </div>
              <div className="dbc-footer">
                <span>{Math.round(budgetPct)}% מהתקציב נוצל</span>
                <span>נותרו ₪{Math.round(Math.max(0,totalPlanned-totalSpent)).toLocaleString()}</span>
              </div>
            </>
          ) : (
            <p className="ddc-empty">אין תקציב מתוכנן עדיין</p>
          )}
          <button className="ddc-link" onClick={() => onNavigate('budget')}>לתקציב המלא →</button>
        </div>

        {/* Checklist card */}
        <div className="dash-dark-card">
          <div className="ddc-badge-row">
            <span className="ddc-badge">{doneCnt} מתוך {checkItems.length}</span>
            <h3 className="ddc-title">כדי לצאת בראש שקט</h3>
          </div>
          <div className="dcc-items">
            {checkItems.map((item, i) => (
              <label key={i} className={`dcc-item${item.done ? ' done' : ''}`}>
                <span className={`dcc-box${item.done ? ' checked' : ''}`}>
                  {item.done && '✓'}
                </span>
                <span className="dcc-label">{item.label}</span>
              </label>
            ))}
          </div>
        </div>

      </div>

      {/* ═══ RIGHT COLUMN ═══ */}
      <div className="dash-right">
        <div className="dash-dark-card dash-schedule-card">
          <div className="ddc-badge-row">
            <span className="ddc-badge">{monthLabel}</span>
            <h3 className="ddc-title">המסלול שלנו</h3>
          </div>

          {/* Calendar strip */}
          {dates.length > 0 && (
            <div className="dsc-strip">
              {dates.map(date => {
                const d = new Date(date+'T12:00:00');
                return (
                  <button
                    key={date}
                    className={`dsc-day${activeDay === date ? ' active' : ''}${date === todayStr ? ' today' : ''}`}
                    onClick={() => setActiveDay(date)}
                  >
                    <span className="dsc-mon">{MONTH_HE[d.getMonth()]}'</span>
                    <span className="dsc-num">{d.getDate()}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Timeline */}
          <div className="dsc-timeline">
            {calItems.length === 0 ? (
              <p className="ddc-empty" style={{ marginTop: 24 }}>אין פעילויות ליום זה</p>
            ) : calItems.map(item => (
              <div key={item.id} className="dsc-item">
                <span className="dsc-time">{item.time || '—'}</span>
                <span className="dsc-dot" />
                <div className="dsc-info">
                  <div className="dsc-name">{item.name}</div>
                  {item.notes && <div className="dsc-notes">{item.notes}</div>}
                  {item.cost && (
                    <span className="dsc-chip">
                      {CURRENCY_SYMBOLS[item.currency||'ILS']||item.currency}{item.cost.toLocaleString()}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>

          <button className="ddc-link" style={{ marginTop: 20 }} onClick={() => onNavigate('itinerary')}>
            למסלול המלא →
          </button>
        </div>
      </div>

    </div>
  );
}

import type { Trip, ItineraryItem, Stay } from '../types';

interface Props {
  trip: Trip;
  onNavigate: (tab: string) => void;
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  ILS: '₪', USD: '$', EUR: '€', PLN: 'zł', GBP: '£',
};

const MONTH_HE = ['ינו', 'פבר', 'מרץ', 'אפר', 'מאי', 'יוני', 'יולי', 'אוג', 'ספט', 'אוק', 'נוב', 'דצמ'];

function fmtDate(date: string) {
  const d = new Date(date + 'T12:00:00');
  return `${d.getDate()} ${MONTH_HE[d.getMonth()]}`;
}

function calcDaysUntil(startDate: string): number | null {
  if (!startDate) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(startDate + 'T00:00:00');
  return Math.ceil((start.getTime() - today.getTime()) / 86400000);
}

function calcBudgetTotals(itinerary: ItineraryItem[], stays: Stay[]) {
  const totals: Record<string, number> = {};
  const add = (cur: string, amt: number) => {
    totals[cur] = (totals[cur] || 0) + amt;
  };
  itinerary.forEach(i => i.cost && add(i.currency || 'ILS', i.cost));
  stays.forEach(s => s.cost && add(s.currency || 'ILS', s.cost));
  return totals;
}

export default function DashboardTab({ trip, onNavigate }: Props) {
  const today = new Date().toISOString().slice(0, 10);
  const flights = trip.flights || [];
  const stays = trip.stays || [];
  const itinerary = trip.itinerary || [];
  const places = trip.places || [];

  const daysUntil = calcDaysUntil(trip.startDate);
  const budgetTotals = calcBudgetTotals(itinerary, stays);
  const mustSees = places.filter(p => p.must).slice(0, 6);

  // Next upcoming itinerary item (after today)
  const nextItem = [...itinerary]
    .filter(i => i.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))[0];

  return (
    <div className="dash-root" dir="rtl">
      <div className="dash-grid">

        {/* COUNTDOWN */}
        {daysUntil !== null && (
          <section className={`dash-card dash-card--countdown ${daysUntil <= 0 ? 'dash-card--countdown-now' : ''}`}>
            {daysUntil > 0 ? (
              <>
                <span className="dash-count-num">{daysUntil}</span>
                <span className="dash-count-label">ימים לטיול 🛫</span>
              </>
            ) : daysUntil === 0 ? (
              <span className="dash-count-label">✈️ הטיול מתחיל היום!</span>
            ) : (
              <span className="dash-count-label">🏖️ בטיול עכשיו!</span>
            )}
          </section>
        )}

        {/* FLIGHTS */}
        <section className="dash-card">
          <div className="dash-card-head">
            <span className="dash-card-icon">✈️</span>
            <h3>טיסות</h3>
            <button className="dash-card-link" onClick={() => onNavigate('settings')}>ערוך</button>
          </div>
          {flights.length === 0 ? (
            <div className="dash-empty-small">
              <p>אין טיסות</p>
              <button className="btn-outline-sm" onClick={() => onNavigate('settings')}>+ הוסף טיסה</button>
            </div>
          ) : (
            <div className="dash-flights-list">
              {flights.map(f => (
                <div key={f.id} className="dash-flight-row">
                  <span className="dfr-dir">{f.dir === 'out' ? '→' : '←'}</span>
                  <span className="dfr-route">{f.from} → {f.to}</span>
                  <span className="dfr-no">{f.flightNo}</span>
                  <span className="dfr-info">{fmtDate(f.date)} · {f.dep}–{f.arr}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* STAYS */}
        <section className="dash-card">
          <div className="dash-card-head">
            <span className="dash-card-icon">🏨</span>
            <h3>לינות</h3>
            <button className="dash-card-link" onClick={() => onNavigate('settings')}>ערוך</button>
          </div>
          {stays.length === 0 ? (
            <div className="dash-empty-small">
              <p>אין לינות</p>
              <button className="btn-outline-sm" onClick={() => onNavigate('settings')}>+ הוסף לינה</button>
            </div>
          ) : (
            <div className="dash-stays-list">
              {stays.map(s => (
                <div key={s.id} className="dash-stay-row">
                  <div className="dsr-name">{s.name}</div>
                  <div className="dsr-dates">
                    {fmtDate(s.checkIn)} → {fmtDate(s.checkOut)}
                    {s.cost ? <span className="dsr-cost">{CURRENCY_SYMBOLS[s.currency || 'ILS'] || s.currency}{s.cost.toLocaleString()}</span> : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* BUDGET */}
        <section className="dash-card">
          <div className="dash-card-head">
            <span className="dash-card-icon">💰</span>
            <h3>תקציב משוער</h3>
            <button className="dash-card-link" onClick={() => onNavigate('budget')}>פירוט</button>
          </div>
          {Object.keys(budgetTotals).length === 0 ? (
            <div className="dash-empty-small"><p>אין הוצאות מתוכננות עדיין</p></div>
          ) : (
            <div className="dash-budget-totals">
              {Object.entries(budgetTotals).map(([cur, total]) => (
                <div key={cur} className="dbt-row">
                  <span className="dbt-sym">{CURRENCY_SYMBOLS[cur] || cur}</span>
                  <span className="dbt-amount">{total.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                  <span className="dbt-cur">{cur}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* NEXT UP */}
        <section className="dash-card">
          <div className="dash-card-head">
            <span className="dash-card-icon">⏭️</span>
            <h3>הבא בתור</h3>
            <button className="dash-card-link" onClick={() => onNavigate('itinerary')}>מסלול מלא</button>
          </div>
          {!nextItem ? (
            <div className="dash-empty-small">
              <p>אין פריטים קרובים</p>
              <button className="btn-outline-sm" onClick={() => onNavigate('itinerary')}>+ הוסף לתוכנית</button>
            </div>
          ) : (
            <div className="dash-next-item">
              <div className="dni-date">{fmtDate(nextItem.date)}</div>
              <div className="dni-name">{nextItem.name}</div>
              {nextItem.notes && <div className="dni-notes">{nextItem.notes.slice(0, 80)}{nextItem.notes.length > 80 ? '…' : ''}</div>}
            </div>
          )}
        </section>

        {/* MUST-SEES */}
        {mustSees.length > 0 && (
          <section className="dash-card dash-card--wide">
            <div className="dash-card-head">
              <span className="dash-card-icon">⭐</span>
              <h3>חייבים לראות</h3>
              <button className="dash-card-link" onClick={() => onNavigate('places')}>כל המקומות</button>
            </div>
            <div className="dash-must-grid">
              {mustSees.map(p => (
                <div key={p.id} className="dmg-chip">
                  <span className="dmg-name">{p.nameHe}</span>
                  {p.city && <span className="dmg-city">{p.city}</span>}
                </div>
              ))}
            </div>
          </section>
        )}

      </div>
    </div>
  );
}

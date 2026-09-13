/** ScheduleCard — horizontal calendar strip + daily timeline */
import { useState } from 'react';
import type { ItineraryItem } from '../../types';

const MONTH_HE      = ['ינו','פבר','מרץ','אפר','מאי','יוני','יולי','אוג','ספט','אוק','נוב','דצמ'];
const MONTH_HE_FULL = ['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'];
const CURRENCY_SYMS: Record<string,string> = { ILS:'₪', USD:'$', EUR:'€', PLN:'zł', GBP:'£' };

interface Props {
  dates:      string[];            // all trip dates
  todayStr:   string;              // YYYY-MM-DD for today
  itinerary:  ItineraryItem[];
  onNavigate: () => void;
}

export default function ScheduleCard({ dates, todayStr, itinerary, onNavigate }: Props) {
  const defaultDay = dates.includes(todayStr) ? todayStr : (dates[0] || todayStr);
  const [activeDay, setActiveDay] = useState(defaultDay);

  const activeDate = new Date(activeDay + 'T12:00:00');
  const monthLabel = MONTH_HE_FULL[activeDate.getMonth()];

  const dayItems = itinerary
    .filter(i => i.date === activeDay)
    .sort((a, b) => (a.time || '').localeCompare(b.time || ''));

  return (
    <div className="dash-dark-card dash-schedule-card">
      <div className="ddc-badge-row">
        <span className="ddc-badge">{monthLabel}</span>
        <h3 className="ddc-title">המסלול שלנו</h3>
      </div>

      {/* ── Calendar strip ── */}
      <div className="dsc-strip">
        {dates.map(date => {
          const d = new Date(date + 'T12:00:00');
          return (
            <button
              key={date}
              className={[
                'dsc-day',
                activeDay === date ? 'active'  : '',
                date === todayStr  ? 'today'   : '',
              ].filter(Boolean).join(' ')}
              onClick={() => setActiveDay(date)}
            >
              <span className="dsc-mon">{MONTH_HE[d.getMonth()]}'</span>
              <span className="dsc-num">{d.getDate()}</span>
            </button>
          );
        })}
      </div>

      {/* ── Timeline ── */}
      <div className="dsc-timeline">
        {dayItems.length === 0 ? (
          <p className="ddc-empty" style={{ marginTop: 24 }}>אין פעילויות ליום זה</p>
        ) : dayItems.map(item => (
          <div key={item.id} className="dsc-item">
            <span className="dsc-time">{item.time || '—'}</span>
            <span className="dsc-dot" />
            <div className="dsc-info">
              <div className="dsc-name">{item.name}</div>
              {item.notes && <div className="dsc-notes">{item.notes}</div>}
              {item.cost && (
                <span className="dsc-chip">
                  {CURRENCY_SYMS[item.currency || 'ILS'] || item.currency}
                  {item.cost.toLocaleString()}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      <button className="ddc-link" style={{ marginTop: 20 }} onClick={onNavigate}>
        למסלול המלא →
      </button>
    </div>
  );
}

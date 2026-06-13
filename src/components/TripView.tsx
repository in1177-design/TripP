import { useState } from 'react';
import type { Trip } from '../types';
import PlacesTab from './PlacesTab';
import ScheduleTab from './ScheduleTab';
import ExpensesTab from './ExpensesTab';
import JournalTab from './JournalTab';
import DocumentsTab from './DocumentsTab';

type Tab = 'places' | 'schedule' | 'expenses' | 'journal' | 'docs';

interface Props {
  trip: Trip;
  onChange: (trip: Trip) => void;
  onDelete: () => void;
  onEdit: () => void;
}

function tripDays(trip: Trip): number {
  if (!trip.startDate || !trip.endDate) return 0;
  return Math.max(1, Math.ceil(
    (new Date(trip.endDate).getTime() - new Date(trip.startDate).getTime()) / 86400000
  ));
}

export default function TripView({ trip, onChange, onDelete, onEdit }: Props) {
  const [tab, setTab] = useState<Tab>('places');

  const tabs: { key: Tab; label: string; icon: string }[] = [
    { key: 'places', label: 'מקומות', icon: '📍' },
    { key: 'schedule', label: 'מסלול', icon: '🗓️' },
    { key: 'expenses', label: 'הוצאות', icon: '💰' },
    { key: 'journal', label: 'יומן', icon: '📖' },
    { key: 'docs', label: 'מסמכים', icon: '📄' },
  ];

  const days = tripDays(trip);

  return (
    <div className="trip-view">
      <div className="trip-hero">
        <div className="trip-hero-title">
          <h2>{trip.destination}</h2>
          {trip.startDate && (
            <span className="trip-dates">{trip.startDate} — {trip.endDate} · {days} ימים · {trip.travelers} מטיילים</span>
          )}
          {trip.style.length > 0 && (
            <div className="style-tags">
              {trip.style.map(s => <span key={s} className="style-tag">{s}</span>)}
            </div>
          )}
        </div>
        <div className="trip-hero-actions">
          <button className="btn-sm" onClick={onEdit}>עריכה</button>
          <button className="btn-sm btn-danger" onClick={() => {
            if (confirm(`למחוק את הטיול ל${trip.destination}?`)) onDelete();
          }}>מחיקה</button>
        </div>
      </div>

      <nav className="tab-nav">
        {tabs.map(t => (
          <button
            key={t.key}
            className={`tab-btn ${tab === t.key ? 'tab-active' : ''}`}
            onClick={() => setTab(t.key)}
          >
            <span>{t.icon}</span>
            <span>{t.label}</span>
          </button>
        ))}
      </nav>

      <div className="tab-content">
        {tab === 'places' && <PlacesTab trip={trip} onChange={onChange} />}
        {tab === 'schedule' && <ScheduleTab trip={trip} onChange={onChange} />}
        {tab === 'expenses' && <ExpensesTab trip={trip} onChange={onChange} />}
        {tab === 'journal' && <JournalTab trip={trip} onChange={onChange} />}
        {tab === 'docs' && <DocumentsTab trip={trip} onChange={onChange} />}
      </div>
    </div>
  );
}

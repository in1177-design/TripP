import { useNavigate, useParams } from 'react-router-dom';
import type { Trip, Flight } from '../types';
import DashboardTab from './DashboardTab';
import ItineraryTab from './ItineraryTab';
import PlacesTab from './PlacesTab';
import ExpensesTab from './ExpensesTab';
import SettingsTab from './SettingsTab';
import JournalTab from './JournalTab';

type Tab = 'dashboard' | 'itinerary' | 'places' | 'budget' | 'settings' | 'journal';

const VALID_TABS: Tab[] = ['dashboard', 'itinerary', 'places', 'budget', 'settings', 'journal'];

// Legacy URL slugs → redirect to new names
const SLUG_ALIASES: Record<string, Tab> = {
  expenses: 'budget',
  schedule: 'dashboard',
  docs: 'dashboard',
  places: 'places',    // same
};

const MONTH_HE = ['ינו', 'פבר', 'מרץ', 'אפר', 'מאי', 'יוני', 'יולי', 'אוג', 'ספט', 'אוק', 'נוב', 'דצמ'];
function fmtDateShort(date: string) {
  if (!date) return '';
  const d = new Date(date + 'T12:00:00');
  return `${d.getDate()} ${MONTH_HE[d.getMonth()]}`;
}

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

function HeroFlightCard({ flight }: { flight: Flight }) {
  return (
    <div className="hero-flight-card">
      <div className="hfc-top">
        <span className="hfc-dir">{flight.dir === 'out' ? 'הלוך' : 'חזור'}</span>
        <span className="hfc-no">{flight.flightNo}</span>
      </div>
      <div className="hfc-route">{flight.from} → {flight.to}</div>
      <div className="hfc-info">{flight.dep} – {flight.arr} · {fmtDateShort(flight.date)}</div>
    </div>
  );
}

export default function TripView({ trip, onChange, onDelete, onEdit: _onEdit }: Props) {
  const { tripId, tab } = useParams<{ tripId: string; tab: string }>();
  const navigate = useNavigate();

  // Resolve aliases + validate
  const resolved = tab ? (SLUG_ALIASES[tab] ?? tab) : 'dashboard';
  const activeTab: Tab = VALID_TABS.includes(resolved as Tab) ? (resolved as Tab) : 'dashboard';

  function setTab(newTab: string) {
    navigate(`/trip/${tripId}/${newTab}`, { replace: true });
  }

  const tabs: { key: Tab; label: string; icon: string }[] = [
    { key: 'dashboard',  label: 'דשבורד',  icon: '🏠' },
    { key: 'itinerary',  label: 'מסלול',   icon: '🗓️' },
    { key: 'places',     label: 'בנק רעיונות', icon: '💡' },
    { key: 'budget',     label: 'תקציב',   icon: '💰' },
    { key: 'settings',   label: 'הגדרות',  icon: '⚙️' },
    { key: 'journal',    label: 'יומן',    icon: '📖' },
  ];

  const days = tripDays(trip);
  const flights = trip.flights || [];

  return (
    <div className="trip-view">
      {/* ── HERO ── */}
      <div
        className="trip-hero"
        style={trip.coverImage ? { backgroundImage: `url(${trip.coverImage})` } : {}}
      >
        <div className="hero-overlay">
          {/* Top bar */}
          <div className="hero-topbar">
            <button className="hero-back-btn" onClick={() => navigate('/')}>← כל הטיולים</button>
            <button className="hero-settings-btn" onClick={() => setTab('settings')}>⚙️ הגדרות</button>
          </div>

          {/* Destination + dates */}
          <div className="hero-body">
            <h1 className="hero-destination">{trip.destination}</h1>
            {trip.startDate && (
              <span className="hero-dates">
                {fmtDateShort(trip.startDate)} – {fmtDateShort(trip.endDate)} · {days} ימים · {trip.travelers} מטיילים
              </span>
            )}
            {trip.style && trip.style.length > 0 && (
              <div className="style-tags">
                {trip.style.map(s => <span key={s} className="style-tag">{s}</span>)}
              </div>
            )}
          </div>

          {/* Flight ticket cards */}
          {flights.length > 0 && (
            <div className="hero-flights">
              {flights.map(f => <HeroFlightCard key={f.id} flight={f} />)}
            </div>
          )}
        </div>
      </div>

      {/* ── TABS ── */}
      <nav className="tab-nav">
        {tabs.map(t => (
          <button
            key={t.key}
            className={`tab-btn ${activeTab === t.key ? 'tab-active' : ''}`}
            onClick={() => setTab(t.key)}
          >
            <span>{t.icon}</span>
            <span>{t.label}</span>
          </button>
        ))}
      </nav>

      {/* ── CONTENT ── */}
      <div className="tab-content">
        {activeTab === 'dashboard' && <DashboardTab trip={trip} onNavigate={setTab} />}
        {activeTab === 'itinerary' && <ItineraryTab trip={trip} onUpdate={onChange} />}
        {activeTab === 'places'    && <PlacesTab    trip={trip} onChange={onChange} />}
        {activeTab === 'budget'    && <ExpensesTab  trip={trip} onChange={onChange} />}
        {activeTab === 'settings'  && <SettingsTab  trip={trip} onChange={onChange} onDelete={onDelete} />}
        {activeTab === 'journal'   && <JournalTab   trip={trip} onChange={onChange} />}
      </div>
    </div>
  );
}

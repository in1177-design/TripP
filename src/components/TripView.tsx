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

const AIRPORT_CITY: Record<string, string> = {
  TLV: 'תל אביב', KRK: 'קרקוב', WAW: 'ורשה', PRG: 'פראג',
  BUD: 'בודפשט', VIE: 'וינה', JFK: 'ניו יורק', CDG: 'פריז',
  LHR: 'לונדון', FCO: 'רומא', BCN: 'ברצלונה', AMS: 'אמסטרדם',
  IST: 'איסטנבול', DXB: 'דובאי', BKK: 'בנגקוק', NRT: 'טוקיו',
  ATH: 'אתונה', MAD: 'מדריד', MXP: 'מילאנו', FRA: 'פרנקפורט',
  MUC: 'מינכן', ZRH: 'ציריך', CPH: 'קופנהגן', ARN: 'סטוקהולם',
  OSL: 'אוסלו', HEL: 'הלסינקי', DUB: 'דבלין', LIS: 'ליסבון',
  OPO: 'פורטו',   GDN: 'גדנסק',  WRO: 'ורוצלב',
};

function HeroFlightCard({ flight }: { flight: Flight }) {
  const fromCity = AIRPORT_CITY[flight.from] ?? '';
  const toCity   = AIRPORT_CITY[flight.to]   ?? '';
  return (
    <article className="hfc-ticket">
      <div className="hfc-top">
        <span className="hfc-dir">
          <span className="hfc-plane" aria-hidden="true">{flight.dir === 'out' ? '↗' : '↙'}</span>
          {flight.dir === 'out' ? 'הלוך' : 'חזור'}
        </span>
        <span className="hfc-no" dir="ltr">{flight.flightNo}</span>
      </div>
      <div className="hfc-route" dir="ltr">
        <div className="hfc-airport">
          <div className="hfc-code">{flight.from}</div>
          {fromCity && <div className="hfc-city" dir="rtl">{fromCity}</div>}
        </div>
        <div className="hfc-route-line" aria-hidden="true" />
        <div className="hfc-airport hfc-airport--dest">
          <div className="hfc-code">{flight.to}</div>
          {toCity && <div className="hfc-city" dir="rtl">{toCity}</div>}
        </div>
      </div>
      <div className="hfc-bottom">
        <span>{fmtDateShort(flight.date)}</span>
        <span className="hfc-times" dir="ltr">{flight.dep} → {flight.arr}</span>
      </div>
    </article>
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

  const tabs: { key: Tab; label: string }[] = [
    { key: 'dashboard',  label: 'דשבורד'       },
    { key: 'itinerary',  label: 'מסלול'        },
    { key: 'budget',     label: 'תקציב'        },
    { key: 'places',     label: 'בנק רעיונות'  },
    { key: 'settings',   label: 'הגדרות'       },
  ];

  const flights = trip.flights || [];

  return (
    <div className="trip-view">
      {/* ── TOP NAV (above hero) ── */}
      <nav className="trip-topnav" dir="rtl">
        <div className="trip-topnav-inner">
          <h2 className="trip-topnav-title">{trip.destination}</h2>
          <div className="trip-topnav-tabs">
            {tabs.map(t => (
              <button
                key={t.key}
                className={`trip-topnav-btn${activeTab === t.key ? ' active' : ''}`}
                onClick={() => setTab(t.key)}
              >{t.label}</button>
            ))}
            <button className="trip-topnav-btn trip-topnav-btn--back" onClick={() => navigate('/')}>
              כל הטיולים ←
            </button>
          </div>
        </div>
      </nav>

      {/* ── HERO ── */}
      <div
        className="trip-hero"
        style={trip.coverImage ? { backgroundImage: `url(${trip.coverImage})` } : {}}
      >
        <div className="hero-overlay">
          {/* Flight ticket cards */}
          {flights.length > 0 && (
            <div className="hero-flights">
              {flights.map(f => <HeroFlightCard key={f.id} flight={f} />)}
            </div>
          )}
        </div>
      </div>

      {/* ── CONTENT ── */}
      <div className="tab-content">
        {activeTab === 'dashboard' && <DashboardTab trip={trip} onNavigate={setTab} />}
        {activeTab === 'itinerary' && <ItineraryTab trip={trip} onUpdate={onChange} />}
        {activeTab === 'places'    && <PlacesTab    trip={trip} onChange={onChange} />}
        {activeTab === 'budget'    && <ExpensesTab  trip={trip} onChange={onChange} onNavigate={setTab} />}
        {activeTab === 'settings'  && <SettingsTab  trip={trip} onChange={onChange} onDelete={onDelete} />}
        {activeTab === 'journal'   && <JournalTab   trip={trip} onChange={onChange} />}
      </div>
    </div>
  );
}

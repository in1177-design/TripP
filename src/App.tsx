import { useState, useEffect } from 'react';
import {
  HashRouter, Routes, Route, Navigate,
  useNavigate, useParams, useLocation,
} from 'react-router-dom';
import { saveTrip, deleteTrip, subscribeTrips } from './db';
import { generateId } from './storage';
import type { Trip } from './types';
import TripList from './components/TripList';
import TripForm from './components/TripForm';
import TripView from './components/TripView';
import './App.css';

/* ── shared state lives here ── */
function AppContent() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const unsub = subscribeTrips(data => {
      setTrips(data);
      setLoading(false);
    });
    return unsub;
  }, []);

  async function handleSaveTrip(trip: Trip) {
    await saveTrip(trip);
    navigate(`/trip/${trip.id}/dashboard`, { replace: true });
  }

  // Update within TripView — no navigation, just save
  async function handleUpdateTrip(trip: Trip) {
    await saveTrip(trip);
  }

  async function handleDeleteTrip(id: string) {
    await deleteTrip(id);
    navigate('/', { replace: true });
  }

  if (loading) {
    return (
      <div className="app" dir="rtl">
        <div className="loading-screen">
          <div className="loading-spinner" />
          <p>טוען טיולים...</p>
        </div>
      </div>
    );
  }

  const location = useLocation();
  // On trip view pages the hero carries all navigation — hide the top navbar
  const onTripView = /^\/trip\/[^/]+\/(?!edit)/.test(location.pathname);

  return (
    <div className={`app${onTripView ? ' app--trip-view' : ''}`} dir="rtl">
      {!onTripView && (
        <header className="app-header">
          <div className="header-inner">
            <button className="logo-btn" onClick={() => navigate('/')}>
              ✈️ MyTrip
            </button>
            <Routes>
              <Route path="/" element={null} />
              <Route path="*" element={
                <button className="back-btn" onClick={() => navigate('/')}>
                  ← כל הטיולים
                </button>
              } />
            </Routes>
          </div>
        </header>
      )}

      <main className={`app-main${onTripView ? ' app-main--trip' : ''}`}>
        <Routes>
          <Route path="/" element={
            <TripList
              trips={trips}
              onSelect={t => navigate(`/trip/${t.id}/dashboard`)}
              onNew={() => navigate('/new')}
            />
          } />

          <Route path="/new" element={
            <NewTripWrapper onSave={handleSaveTrip} onCancel={() => navigate('/')} />
          } />

          <Route path="/trip/:tripId/dashboard" element={
            <TripViewWrapper
              trips={trips}
              onUpdate={handleUpdateTrip}
              onDelete={handleDeleteTrip}
            />
          } />

          <Route path="/trip/:tripId/edit" element={
            <EditTripWrapper trips={trips} onSave={handleSaveTrip} />
          } />

          <Route path="/trip/:tripId/:tab" element={
            <TripViewWrapper
              trips={trips}
              onUpdate={handleUpdateTrip}
              onDelete={handleDeleteTrip}
            />
          } />

          {/* fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}

/* ── route wrappers ── */

function NewTripWrapper({
  onSave, onCancel,
}: { onSave: (t: Trip) => Promise<void>; onCancel: () => void }) {
  const [blank] = useState<Trip>(() => ({
    id: generateId(),
    destination: '',
    startDate: '',
    endDate: '',
    travelers: 2,
    style: [],
    notes: '',
    documents: [],
    places: [],
    schedule: [],
    expenses: [],
    journalEntries: [],
    phase: 'before',
  }));
  return <TripForm trip={blank} onSave={onSave} onCancel={onCancel} />;
}

function EditTripWrapper({
  trips, onSave,
}: { trips: Trip[]; onSave: (t: Trip) => Promise<void> }) {
  const { tripId } = useParams<{ tripId: string }>();
  const navigate = useNavigate();
  const trip = trips.find(t => t.id === tripId);
  if (!trip) return <Navigate to="/" replace />;
  return (
    <TripForm
      trip={trip}
      onSave={onSave}
      onCancel={() => navigate(`/trip/${tripId}/places`)}
    />
  );
}

function TripViewWrapper({
  trips, onUpdate, onDelete,
}: {
  trips: Trip[];
  onUpdate: (t: Trip) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const { tripId } = useParams<{ tripId: string }>();
  const navigate = useNavigate();
  const trip = trips.find(t => t.id === tripId);
  if (!trip) return <Navigate to="/" replace />;
  return (
    <TripView
      trip={trip}
      onChange={onUpdate}
      onDelete={() => onDelete(trip.id)}
      onEdit={() => navigate(`/trip/${trip.id}/edit`)}
    />
  );
}

/* ── root ── */
export default function App() {
  return (
    <HashRouter>
      <AppContent />
    </HashRouter>
  );
}

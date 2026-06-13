import { useState, useEffect } from 'react';
import { saveTrip, deleteTrip, subscribeTrips } from './db';
import { generateId } from './storage';
import type { Trip } from './types';
import TripList from './components/TripList';
import TripForm from './components/TripForm';
import TripView from './components/TripView';
import './App.css';

type View = 'list' | 'new' | 'trip';

export default function App() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [view, setView] = useState<View>('list');
  const [activeTrip, setActiveTrip] = useState<Trip | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = subscribeTrips(data => {
      setTrips(data);
      setLoading(false);
    });
    return unsub;
  }, []);

  async function handleSaveTrip(trip: Trip) {
    await saveTrip(trip);
    setActiveTrip(trip);
    setView('trip');
  }

  async function handleDeleteTrip(id: string) {
    await deleteTrip(id);
    setView('list');
    setActiveTrip(null);
  }

  function handleNewTrip() {
    const blank: Trip = {
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
    };
    setActiveTrip(blank);
    setView('new');
  }

  function handleEditTrip(trip: Trip) {
    setActiveTrip(trip);
    setView('new');
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

  return (
    <div className="app" dir="rtl">
      <header className="app-header">
        <div className="header-inner">
          <button className="logo-btn" onClick={() => setView('list')}>
            ✈️ MyTrip
          </button>
          {view !== 'list' && (
            <button className="back-btn" onClick={() => setView('list')}>
              ← כל הטיולים
            </button>
          )}
        </div>
      </header>

      <main className="app-main">
        {view === 'list' && (
          <TripList
            trips={trips}
            onSelect={t => { setActiveTrip(t); setView('trip'); }}
            onNew={handleNewTrip}
          />
        )}
        {view === 'new' && activeTrip && (
          <TripForm
            trip={activeTrip}
            onSave={handleSaveTrip}
            onCancel={() => setView('list')}
          />
        )}
        {view === 'trip' && activeTrip && (
          <TripView
            trip={activeTrip}
            onChange={handleSaveTrip}
            onDelete={() => handleDeleteTrip(activeTrip.id)}
            onEdit={() => handleEditTrip(activeTrip)}
          />
        )}
      </main>
    </div>
  );
}

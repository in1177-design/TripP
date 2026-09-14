import { useState, useEffect } from 'react';
import {
  HashRouter, Routes, Route, Navigate,
  useNavigate, useParams, useLocation,
} from 'react-router-dom';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { auth, app } from './firebase';
import { saveTrip, deleteTrip, subscribeTrips } from './db';
import { generateId } from './storage';
import type { Trip } from './types';
import TripList from './components/TripList';
import TripForm from './components/TripForm';
import TripView from './components/TripView';
import SignInScreen from './components/SignInScreen';
import './App.css';

/* ── shared state lives here ── */
function AppContent() {
  const [trips,           setTrips]           = useState<Trip[]>([]);
  const [loading,         setLoading]         = useState(true);
  const [authReady,       setAuthReady]       = useState(false);
  const [uid,             setUid]             = useState<string | null>(null);
  const [userPhoto,       setUserPhoto]       = useState<string | null>(null);
  const [userName,        setUserName]        = useState<string | null>(null);
  const [sharedError,     setSharedError]     = useState<string | null>(null);
  const [inviteStatus,    setInviteStatus]    = useState<'idle'|'running'|'done'|'error'>('idle');
  const [inviteError,     setInviteError]     = useState('');
  const navigate = useNavigate();

  // 1. Wait for Firebase Auth to resolve
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, user => {
      setUid(user?.uid ?? null);
      setUserPhoto(user?.photoURL ?? null);
      setUserName(user?.displayName ?? user?.email ?? null);
      setAuthReady(true);
      if (!user) setLoading(false);
    });
    return unsub;
  }, []);

  // 2. Once signed in, accept pending invites then subscribe to trips
  useEffect(() => {
    if (!authReady || !uid) return;
    setLoading(true);
    setSharedError(null);

    // Accept pending email invites — track status so user can see and retry on failure.
    async function runAcceptInvites() {
      if (!auth.currentUser?.email) return;
      setInviteStatus('running');
      setInviteError('');
      try {
        const fns = getFunctions(app, 'us-central1');
        await httpsCallable(fns, 'acceptPendingInvites')({});
        setInviteStatus('done');
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        setInviteStatus('error');
        setInviteError(msg);
        console.error('acceptPendingInvites failed:', msg);
      }
    }
    runAcceptInvites();

    const unsub = subscribeTrips(
      data => { setTrips(data); setLoading(false); },
      err  => setSharedError(err),
    );
    return unsub;
  }, [authReady, uid]);

  async function handleSaveTrip(trip: Trip) {
    await saveTrip(trip);
    navigate(`/trip/${trip.id}/dashboard`, { replace: true });
  }

  async function handleUpdateTrip(trip: Trip) {
    await saveTrip(trip);
  }

  async function handleDeleteTrip(id: string) {
    await deleteTrip(id);
    navigate('/', { replace: true });
  }

  // Must call useLocation before any early returns (Rules of Hooks)
  const location = useLocation();
  const onTripView = /^\/trip\/[^/]+\/(?!edit)/.test(location.pathname);

  // Show sign-in screen when auth resolved but no user
  if (authReady && !uid) {
    return <SignInScreen />;
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
    <div className={`app${onTripView ? ' app--trip-view' : ''}`} dir="rtl">
      {!onTripView && (
        <header className="app-header">
          <div className="header-inner">
            <button className="logo-btn" onClick={() => navigate('/')}>
              ✈️ MyTrip
            </button>
            <div className="header-right">
              <Routes>
                <Route path="/" element={null} />
                <Route path="*" element={
                  <button className="back-btn" onClick={() => navigate('/')}>
                    ← כל הטיולים
                  </button>
                } />
              </Routes>
              <div className="user-menu">
                {userPhoto
                  ? <img src={userPhoto} className="user-avatar" alt={userName ?? ''} referrerPolicy="no-referrer" />
                  : <div className="user-avatar user-avatar--initials">
                      {(userName?.[0] ?? '?').toUpperCase()}
                    </div>
                }
                {userName && <span className="user-name">{userName.split(' ')[0]}</span>}
                <button
                  className="signout-btn"
                  onClick={() => signOut(auth)}
                  title="יציאה מהחשבון"
                >
                  יציאה
                </button>
              </div>
            </div>
          </div>
        </header>
      )}

      <main className={`app-main${onTripView ? ' app-main--trip' : ''}`}>
        {/* ── Status banners ── */}
        {inviteStatus === 'error' && (
          <div className="app-banner app-banner--error" role="alert">
            ⚠️ שגיאה בקבלת הזמנות: {inviteError}
            <button
              className="app-banner-retry"
              onClick={() => {
                setInviteStatus('idle');
                const fns = getFunctions(app, 'us-central1');
                setInviteStatus('running');
                setInviteError('');
                httpsCallable(fns, 'acceptPendingInvites')({})
                  .then(() => setInviteStatus('done'))
                  .catch((e: unknown) => {
                    setInviteStatus('error');
                    setInviteError(e instanceof Error ? e.message : String(e));
                  });
              }}
            >נסה שוב</button>
          </div>
        )}
        {sharedError && (
          <div className="app-banner app-banner--warn" role="alert">
            ⚠️ {sharedError}
            <button className="app-banner-retry" onClick={() => window.location.reload()}>רענן</button>
          </div>
        )}

        <Routes>
          <Route path="/" element={
            <TripList
              trips={trips}
              onSelect={t => navigate(`/trip/${t.id}/dashboard`)}
              onNew={() => navigate('/new')}
            />
          } />

          <Route path="/new" element={
            <NewTripWrapper uid={uid} onSave={handleSaveTrip} onCancel={() => navigate('/')} />
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

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}

/* ── route wrappers ── */

function NewTripWrapper({
  uid, onSave, onCancel,
}: { uid: string | null; onSave: (t: Trip) => Promise<void>; onCancel: () => void }) {
  const [blank] = useState<Trip>(() => ({
    id:              generateId(),
    ownerId:         uid ?? undefined,
    participantUids: uid ? [uid] : [],
    destination:     '',
    startDate:       '',
    endDate:         '',
    travelers:       2,
    style:           [],
    notes:           '',
    documents:       [],
    places:          [],
    schedule:        [],
    expenses:        [],
    journalEntries:  [],
    phase:           'before',
  }));
  return <TripForm trip={blank} onSave={onSave} onCancel={onCancel} />;
}

function EditTripWrapper({
  trips, onSave,
}: { trips: Trip[]; onSave: (t: Trip) => Promise<void> }) {
  const { tripId } = useParams<{ tripId: string }>();
  const navigate   = useNavigate();
  const trip       = trips.find(t => t.id === tripId);
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
  const navigate   = useNavigate();
  const trip       = trips.find(t => t.id === tripId);
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

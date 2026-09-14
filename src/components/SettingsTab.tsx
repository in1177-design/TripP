import { useState, useEffect } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { doc, updateDoc } from 'firebase/firestore';
import type { Trip, TripStyle, Flight, Stay, ItemStatus, Traveler, TripParticipant } from '../types';
import { generateId } from '../storage';
import { stripUndefined } from '../db';
import { app, auth, db as firestoreDb } from '../firebase';

// ── Sharing helpers ───────────────────────────────────────────────────────────

interface ShareResponse { uid?: string; displayName?: string; email: string; pending: boolean; }

async function callShareTrip(tripId: string, email: string, role: 'editor' | 'viewer') {
  const fns = getFunctions(app, 'us-central1');
  const fn  = httpsCallable<{ tripId: string; email: string; role: string }, ShareResponse>(fns, 'shareTrip');
  const res = await fn({ tripId, email, role });
  return res.data;
}
async function callRemove(tripId: string, participantUid: string) {
  const fns = getFunctions(app, 'us-central1');
  const fn  = httpsCallable<{ tripId: string; participantUid: string }, { ok: boolean }>(fns, 'removeTripParticipant');
  await fn({ tripId, participantUid });
}

// Share icon SVG (3 nodes connected)
function ShareIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="16" cy="4"  r="2.5" stroke="white" strokeWidth="1.8"/>
      <circle cx="4"  cy="10" r="2.5" stroke="white" strokeWidth="1.8"/>
      <circle cx="16" cy="16" r="2.5" stroke="white" strokeWidth="1.8"/>
      <line x1="6.3" y1="8.8"  x2="13.7" y2="5.2"  stroke="white" strokeWidth="1.5"/>
      <line x1="6.3" y1="11.2" x2="13.7" y2="14.8" stroke="white" strokeWidth="1.5"/>
    </svg>
  );
}

interface Props {
  trip:       Trip;
  onChange:   (trip: Trip) => void;
  onDelete?:  () => void;
}

const STYLES: TripStyle[]   = ['תרבות', 'טבע', 'עיר', 'חוף', 'הרפתקאות', 'קולינריה', 'משפחה'];
const CURRENCIES             = ['ILS', 'EUR', 'USD', 'PLN', 'GBP'];
const RATE_CURRENCIES        = CURRENCIES.filter(c => c !== 'ILS');
const AVATAR_PALETTE         = ['#4f46e5','#e91e8c','#f39c12','#2ecc71','#e74c3c','#3498db','#9b59b6','#1abc9c'];

function emptyFlight(): Partial<Flight> {
  return { dir: 'out', flightNo: '', from: '', to: '', date: '', dep: '', arr: '' };
}
function emptyStay(): Partial<Stay> {
  return { name: '', checkIn: '', checkOut: '', status: 'planned', currency: 'PLN' };
}
function emptyTraveler(): Traveler {
  return { id: generateId(), name: '', email: '', type: 'adult' };
}
function syncList(existing: Traveler[], count: number): Traveler[] {
  const list = [...existing];
  while (list.length < count) list.push(emptyTraveler());
  return list.slice(0, count);
}
function initials(name: string): string {
  return name.trim().split(/\s+/).map(w => w[0] || '').join('').toUpperCase().slice(0, 2) || '?';
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function SettingsTab({ trip, onChange, onDelete }: Props) {
  const [form, setForm] = useState<Trip>(() => {
    const f = { ...trip };
    f.travelersList = syncList(f.travelersList || [], f.travelers || 1);
    return f;
  });
  const [savedSection,  setSavedSection]  = useState<string | null>(null);
  const [showAddFlight, setShowAddFlight] = useState(false);
  const [showAddStay,   setShowAddStay]   = useState(false);
  const [newFlight,     setNewFlight]     = useState<Partial<Flight>>(emptyFlight());
  const [newStay,       setNewStay]       = useState<Partial<Stay>>(emptyStay());

  // Per-card share state
  const [openShareIdx,  setOpenShareIdx]  = useState<number | null>(null);
  const [shareEmail,    setShareEmail]    = useState('');
  const [shareRole,     setShareRole]     = useState<'editor' | 'viewer'>('editor');
  const [shareLoading,  setShareLoading]  = useState(false);
  const [shareError,    setShareError]    = useState('');
  const [shareSuccess,  setShareSuccess]  = useState('');
  const [shareSentOnce, setShareSentOnce] = useState(false); // true after first successful send
  const [copiedAppLink, setCopiedAppLink] = useState(false);
  const [forceEdit,     setForceEdit]     = useState(false); // true = force Design 2 even when participant exists


  const isOwner      = auth.currentUser?.uid === trip.ownerId;
  const participants: TripParticipant[] = trip.participants ?? [];

  // Auto-repair: if any participant UID is missing from participantUids, fix it.
  // This heals trips that were saved before the participantUids-preservation fix.
  useEffect(() => {
    if (!isOwner || participants.length === 0) return;
    const currentUids = trip.participantUids ?? [];
    const missingUids = participants.map(p => p.uid).filter(uid => !currentUids.includes(uid));
    if (missingUids.length === 0) return;

    console.log('[SettingsTab] Repairing participantUids — adding:', missingUids);
    const tripRef = doc(firestoreDb, 'trips', trip.id);
    const fixed = [...new Set([...currentUids, ...missingUids])];
    updateDoc(tripRef, { participantUids: fixed })
      .then(() => console.log('[SettingsTab] participantUids repaired:', fixed))
      .catch(e => console.error('[SettingsTab] repair failed:', e));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trip.id, trip.participantUids?.join(','), participants.map(p => p.uid).join(',')]);


  const flights       = form.flights       || [];
  const stays         = form.stays         || [];
  const travelersList = form.travelersList || [];

  // ── Helpers ────────────────────────────────────────────────────────────────

  function isAdminCard(t: Traveler, idx: number): boolean {
    if (!isOwner) return false;
    const currentEmail = auth.currentUser?.email?.toLowerCase();
    if (currentEmail && t.email.toLowerCase() === currentEmail) return true;
    // Fallback: first card if no traveler's email matches the owner
    if (idx === 0 && !travelersList.some(tv => tv.email.toLowerCase() === currentEmail)) return true;
    return false;
  }

  function getParticipant(t: Traveler): TripParticipant | undefined {
    if (!t.email) return undefined;
    return participants.find(p => p.email.toLowerCase() === t.email.toLowerCase());
  }

  // ── Form ───────────────────────────────────────────────────────────────────

  function set<K extends keyof Trip>(key: K, val: Trip[K]) {
    setForm(f => ({ ...f, [key]: val }));
  }

  function saveSection(name: string) {
    onChange(stripUndefined(form) as Trip);
    setSavedSection(name);
    setTimeout(() => setSavedSection(null), 2500);
  }

  function toggleStyle(s: TripStyle) {
    set('style', form.style.includes(s)
      ? form.style.filter(x => x !== s)
      : [...form.style, s]);
  }

  // ── Travelers ──────────────────────────────────────────────────────────────

  function adjustTravelers(delta: number) {
    const newCount = Math.max(1, Math.min(20, (form.travelers || 1) + delta));
    const newList  = syncList(travelersList, newCount);
    setForm(f => ({ ...f, travelers: newCount, travelersList: newList }));
    // Close share panel if its card was removed
    if (openShareIdx !== null && openShareIdx >= newCount) setOpenShareIdx(null);
  }

  function updateTraveler(idx: number, field: keyof Omit<Traveler, 'id'>, val: string | number) {
    const newList = travelersList.map((t, i) => i === idx ? { ...t, [field]: val } : t);
    setForm(f => ({ ...f, travelersList: newList }));
  }

  function updateTravelerType(idx: number, type: 'adult' | 'child') {
    const newList = travelersList.map((t, i) => {
      if (i !== idx) return t;
      const updated: Traveler = { ...t, type };
      if (type === 'adult') delete updated.age;
      return updated;
    });
    setForm(f => ({ ...f, travelersList: newList }));
  }

  // ── Sharing ────────────────────────────────────────────────────────────────

  function openShare(idx: number, t: Traveler) {
    const p = getParticipant(t);
    setOpenShareIdx(idx);
    setShareEmail(p?.email ?? t.email ?? '');
    setShareRole((p?.role as 'editor' | 'viewer') ?? 'editor');
    setShareError('');
    setShareSuccess('');
    setShareSentOnce(false);
    setForceEdit(false); // default: open in locked mode if participant exists
  }

  async function handleShareForCard(travelerIdx: number) {
    if (!shareEmail.trim()) return;
    setShareLoading(true); setShareError(''); setShareSuccess('');
    try {
      const data = await callShareTrip(trip.id, shareEmail.trim(), shareRole);

      if (data.pending) {
        // Invite stored — user not yet in Firebase Auth.
        // They will see the trip automatically after signing in with this email.
        if (!travelersList[travelerIdx]?.email) {
          updateTraveler(travelerIdx, 'email', data.email);
        }
        // 'pending' prefix lets the panel know to show the copy-link prompt
        setShareSuccess('pending:' + data.email);
        setShareSentOnce(true);
        setForceEdit(false);
      } else {
        // User already registered — access granted immediately.
        const newP: TripParticipant = {
          uid: data.uid!, email: data.email, displayName: data.displayName!, role: shareRole,
        };
        const existing = participants.filter(p => p.uid !== data.uid);
        onChange({
          ...trip,
          travelersList:   form.travelersList,
          participants:    [...existing, newP],
          participantUids: [...new Set([...(trip.participantUids ?? []), data.uid!])],
        });
        if (!travelersList[travelerIdx]?.email) {
          updateTraveler(travelerIdx, 'email', data.email);
        }
        setShareSuccess('confirmed');
        setShareSentOnce(true);
        setForceEdit(false);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      const strippedMsg = msg.replace(/\s*\(functions\/[^)]+\)\s*$/, '').trim();
      setShareError(strippedMsg || msg);
    } finally {
      setShareLoading(false);
    }
  }

  async function handleRemoveParticipant(uid: string) {
    setShareLoading(true); setShareError('');
    try {
      await callRemove(trip.id, uid);
      // BUG FIX: include form.travelersList so unsaved edits on other cards aren't overwritten
      onChange({
        ...trip,
        travelersList:   form.travelersList,
        participants:    participants.filter(p => p.uid !== uid),
        participantUids: (trip.participantUids ?? []).filter(id => id !== uid),
      });
    } catch (e: unknown) {
      setShareError(e instanceof Error ? e.message : String(e));
    } finally {
      setShareLoading(false);
    }
  }

  // ── Flights ────────────────────────────────────────────────────────────────

  function addFlight() {
    if (!newFlight.from || !newFlight.to) return;
    const fl: Flight = {
      id:       generateId(),
      dir:      (newFlight.dir as 'out' | 'back') || 'out',
      flightNo: newFlight.flightNo || '',
      from:     newFlight.from || '',
      to:       newFlight.to   || '',
      date:     newFlight.date || form.startDate || '',
      dep:      newFlight.dep  || '',
      arr:      newFlight.arr  || '',
    };
    const updated = [...flights, fl];
    setForm(f => ({ ...f, flights: updated }));
    onChange(stripUndefined({ ...form, flights: updated }) as Trip);
    setSavedSection('flights');
    setTimeout(() => setSavedSection(null), 2500);
    setNewFlight(emptyFlight());
    setShowAddFlight(false);
  }
  function deleteFlight(id: string) {
    const updated = flights.filter(f => f.id !== id);
    setForm(f => ({ ...f, flights: updated }));
    onChange(stripUndefined({ ...form, flights: updated }) as Trip);
  }

  // ── Stays ──────────────────────────────────────────────────────────────────

  function addStay() {
    if (!newStay.name) return;
    const s: Stay = {
      id:       generateId(),
      name:     newStay.name     || '',
      checkIn:  newStay.checkIn  || '',
      checkOut: newStay.checkOut || '',
      cost:     newStay.cost,
      currency: newStay.currency || 'ILS',
      status:   (newStay.status as ItemStatus) || 'planned',
      address:  newStay.address,
      notes:    newStay.notes,
    };
    const updated = [...stays, s];
    setForm(f => ({ ...f, stays: updated }));
    onChange(stripUndefined({ ...form, stays: updated }) as Trip);
    setSavedSection('stays');
    setTimeout(() => setSavedSection(null), 2500);
    setNewStay(emptyStay());
    setShowAddStay(false);
  }
  function deleteStay(id: string) {
    const updated = stays.filter(s => s.id !== id);
    setForm(f => ({ ...f, stays: updated }));
    onChange(stripUndefined({ ...form, stays: updated }) as Trip);
  }

  // ── Exchange Rates ─────────────────────────────────────────────────────────

  const [fetchingRates, setFetchingRates] = useState(false);
  const [ratesError,    setRatesError]    = useState('');

  function saveRateInForm(cur: string, val: string) {
    const num = parseFloat(val);
    set('exchangeRates', {
      ...(form.exchangeRates || {}),
      [cur]: isNaN(num) ? 0 : num,
    });
  }

  async function fetchLiveRates() {
    setFetchingRates(true);
    setRatesError('');
    try {
      const res = await fetch(
        'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/ils.json'
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { ils: Record<string, number> };
      const TARGET = ['eur', 'usd', 'pln', 'gbp'];
      const updated: Record<string, number> = { ...(form.exchangeRates || {}) };
      for (const cur of TARGET) {
        const rate = data.ils[cur];
        if (rate && rate > 0) {
          const key = cur.toUpperCase();
          updated[key] = Math.round((1 / rate) * 100) / 100;
        }
      }
      set('exchangeRates', updated);
    } catch {
      setRatesError('לא ניתן לטעון שערים — בדוק חיבור לאינטרנט');
    } finally {
      setFetchingRates(false);
    }
  }

  const allRateCurrencies = [
    ...RATE_CURRENCIES,
    ...Object.keys(form.exchangeRates || {}).filter(c => !RATE_CURRENCIES.includes(c) && c !== 'ILS'),
  ];

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="settings-root" dir="rtl">

      {/* ══ 1. יעד ותאריכים ══ */}
      <section className="settings-section">
        <h3 className="settings-section-title">יעד ותאריכים</h3>

        <div className="settings-field">
          <label>יעד</label>
          <input
            value={form.destination}
            onChange={e => set('destination', e.target.value)}
            placeholder="לאן טסים?"
          />
        </div>

        <div className="settings-row">
          <div className="settings-field" style={{ flex: 1 }}>
            <label>תאריך יציאה</label>
            <input type="date" value={form.startDate} onChange={e => set('startDate', e.target.value)} />
          </div>
          <div className="settings-field" style={{ flex: 1 }}>
            <label>תאריך חזרה</label>
            <input type="date" value={form.endDate} onChange={e => set('endDate', e.target.value)} />
          </div>
        </div>

        <div className="settings-field">
          <label>תמונת רקע (URL)</label>
          <input
            type="url"
            value={form.coverImage || ''}
            onChange={e => set('coverImage', e.target.value || undefined as unknown as string)}
            placeholder="https://... קישור לתמונה רחבה"
          />
          {form.coverImage && (
            <div className="settings-image-preview" style={{ backgroundImage: `url(${form.coverImage})` }} />
          )}
        </div>

        <div className="settings-field">
          <label>סגנון הטיול</label>
          <div className="style-chips">
            {STYLES.map(s => (
              <button
                key={s}
                className={`style-chip ${form.style.includes(s) ? 'style-chip--on' : ''}`}
                onClick={() => toggleStyle(s)}
                type="button"
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <div className="settings-field" style={{ marginBottom: 0 }}>
          <label>הערות</label>
          <textarea
            value={form.notes}
            onChange={e => set('notes', e.target.value)}
            rows={3}
            placeholder="הערות כלליות על הטיול..."
          />
        </div>

        <div className="settings-section-save-row">
          <button className="btn-section-save" onClick={() => saveSection('details')}>
            {savedSection === 'details' ? '✅ נשמר!' : 'שמור'}
          </button>
        </div>
      </section>

      {/* ══ 2. מטיילים ══ */}
      <section className="settings-section">

        {/* Counter header */}
        <div className="trv-header-row">
          <p className="trv-header-title">כמה תהיו בטיול?</p>
          <div className="trv-counter-group">
            <button
              className="trv-counter-circle"
              onClick={() => adjustTravelers(-1)}
              disabled={form.travelers <= 1}
            >−</button>
            <span className="trv-counter-num">{form.travelers}</span>
            <button
              className="trv-counter-circle"
              onClick={() => adjustTravelers(1)}
              disabled={form.travelers >= 20}
            >+</button>
          </div>
        </div>

        {/* Traveler cards */}
        <div className="trv-cards-list">
          {travelersList.map((t, i) => {
            const color      = AVATAR_PALETTE[i % AVATAR_PALETTE.length];
            const ini        = initials(t.name || String(i + 1));
            const adminCard  = isAdminCard(t, i);
            const participant = getParticipant(t);
            const isOpen         = openShareIdx === i;
            const isChild        = t.type === 'child';
            // Show locked panel always when participant exists (persists across navigation/refresh)
            const showLockedPanel = !!participant && !forceEdit;
            // Show edit panel only when explicitly opened
            const showEditPanel  = isOpen && !showLockedPanel;
            // Panel visible when either locked OR editing
            const showPanel      = showLockedPanel || showEditPanel;
            // Design 3 locked state — either participant exists or just sent a pending invite
            const isLocked       = showLockedPanel || (isOpen && !!shareSuccess && !forceEdit);

            return (
              <div key={t.id} className="trv-card">
                {/* ── Top row ──
                    RTL DOM order = visual R→L:
                    avatar(1st→R) | type(2nd) | name(3rd) | age(4th,child) | action(last→L)
                ── */}
                <div className="trv-card-row">

                  {/* 1st in DOM → appears RIGHTMOST in RTL */}
                  <div className="trv-avatar-lg" style={{ background: color }}>
                    {t.avatar
                      ? <img src={t.avatar} alt="" />
                      : <span>{ini}</span>}
                  </div>

                  {/* trv-card-meta: type-select + age-group.
                      Desktop → display:contents (items flow in main row).
                      Mobile  → display:flex second row (avoids overflow). */}
                  <div className="trv-card-meta">
                    {/* type select — disabled in Design 3 (locked state) */}
                    <select
                      className="trv-type-select"
                      value={t.type || 'adult'}
                      disabled={showLockedPanel}
                      onChange={e => updateTravelerType(i, e.target.value as 'adult' | 'child')}
                    >
                      <option value="adult">מבוגר</option>
                      <option value="child">ילד</option>
                    </select>

                    {/* age counter (child only) */}
                    {isChild && (
                      <div className="trv-age-group">
                        <button
                          className="trv-age-circle"
                          onClick={() => updateTraveler(i, 'age', Math.max(0, (t.age ?? 0) - 1))}
                        >−</button>
                        <span className="trv-age-num">{t.age ?? 0}</span>
                        <button
                          className="trv-age-circle"
                          onClick={() => updateTraveler(i, 'age', Math.min(16, (t.age ?? 0) + 1))}
                        >+</button>
                      </div>
                    )}
                  </div>

                  {/* name input — disabled in Design 3 (locked state) */}
                  <input
                    className="trv-name-input"
                    placeholder={`מטייל ${i + 1}`}
                    value={t.name}
                    disabled={showLockedPanel}
                    onChange={e => updateTraveler(i, 'name', e.target.value)}
                  />

                  {/* Action area — states:
                      Admin                → admin badge
                      showLockedPanel      → "שותף בהצלחה ✓" green (Design 3)
                      pending success      → "שותף בהצלחה ✓" green (just sent)
                      isOpen + edit mode   → muted share button (Design 2)
                      default              → dark share button (Design 1)
                  */}
                  {adminCard ? (
                    <span className="trv-admin-badge">אדמין</span>
                  ) : showLockedPanel ? (
                    /* Design 3 — permanently visible ✓ + remove button */
                    <div className="trv-success-group">
                      <div className="trv-share-success-inline">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                          <polyline points="20 6 9 17 4 12" stroke="#2ecc71" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                        <span>שותף</span>
                      </div>
                      {isOwner && (
                        <button
                          className="trv-remove-btn"
                          onClick={() => handleRemoveParticipant(participant!.uid)}
                          disabled={shareLoading}
                          title="הסר גישה"
                        >✕</button>
                      )}
                    </div>
                  ) : isOpen && (shareSuccess || isLocked) ? (
                    /* Just sent (pending or confirmed) — show appropriate label */
                    <div className="trv-share-success-inline">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <polyline points="20 6 9 17 4 12" stroke="#2ecc71" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      <span>{shareSuccess?.startsWith('pending:') ? 'הזמנה נשמרה' : 'שותף בהצלחה'}</span>
                    </div>
                  ) : isOpen ? (
                    /* Design 2 top row — muted share button (click = close panel) */
                    <button
                      className="trv-share-btn trv-share-btn--open"
                      onClick={() => { setOpenShareIdx(null); setForceEdit(false); setShareSuccess(''); setShareError(''); }}
                      disabled={shareLoading}
                      title="סגור"
                    >
                      <ShareIcon />
                    </button>
                  ) : (
                    /* Design 1 — default dark share button */
                    <button
                      className="trv-share-btn"
                      onClick={() => openShare(i, t)}
                      title="הענק גישה לאפליקציה"
                      disabled={shareLoading}
                    >
                      <ShareIcon />
                    </button>
                  )}
                </div>

                {/* ── Share panel (expanded) — always visible for participants (Design 3) ── */}
                {showPanel && (
                  <div className="trv-share-panel">
                    {isLocked ? (
                      /* ── Design 3: LOCKED VIEW ── persistent even after navigation ── */
                      <div className="trv-share-row">
                        {/* Email — disabled gray (derived from participant OR last shareEmail) */}
                        <input
                          className="trv-name-input"
                          type="email"
                          value={participant?.email || ''}
                          disabled
                          dir="ltr"
                        />
                        {/* Role — disabled */}
                        <select
                          className="trv-type-select"
                          value={(participant?.role as 'editor' | 'viewer') || 'editor'}
                          disabled
                          dir="ltr"
                        >
                          <option value="editor">editor</option>
                          <option value="viewer">viewer</option>
                        </select>
                        {/* Pencil edit button (Design 3: dark 42×42 icon button) */}
                        <button
                          className="trv-share-edit-btn"
                          onClick={() => {
                            setShareSuccess('');
                            setShareError('');
                            setForceEdit(true);
                            setOpenShareIdx(i); // ensure panel stays open in edit mode
                            if (participant) {
                              setShareEmail(participant.email);
                              setShareRole(participant.role as 'editor' | 'viewer');
                            }
                          }}
                          title="ערוך פרטי שיתוף"
                        >
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </button>
                      </div>
                    ) : (
                      /* ── Design 2: EDIT VIEW — before send or after clicking pencil ── */
                      <div className="trv-share-row">
                        {/* Email input */}
                        <input
                          className="trv-name-input"
                          type="email"
                          placeholder="Gmail"
                          value={shareEmail}
                          dir="ltr"
                          onChange={e => { setShareEmail(e.target.value); setShareError(''); }}
                          onKeyDown={e => e.key === 'Enter' && handleShareForCard(i)}
                          autoFocus
                        />
                        {/* Role select */}
                        <select
                          className="trv-type-select"
                          value={shareRole}
                          onChange={e => setShareRole(e.target.value as 'editor' | 'viewer')}
                          dir="ltr"
                        >
                          <option value="editor">editor</option>
                          <option value="viewer">viewer</option>
                        </select>
                        {/* Send / Resend button */}
                        <button
                          className="trv-share-submit"
                          onClick={() => handleShareForCard(i)}
                          disabled={shareLoading || !shareEmail.trim()}
                        >
                          {shareLoading ? '...' : (shareSentOnce || !!participant) ? '↩ שלח שוב' : 'שלח שיתוף'}
                        </button>
                      </div>
                    )}
                    {/* Pending invite — explain next step + copy link */}
                    {shareSuccess?.startsWith('pending:') && (
                      <div className="trv-share-pending-wrap">
                        <p className="trv-share-pending-msg">
                          📨 הזמנה ממתינה — יש להתחבר לאפליקציה עם <strong dir="ltr">{shareSuccess.slice('pending:'.length)}</strong>
                        </p>
                        <button
                          className="trv-copy-link-btn"
                          onClick={() => {
                            navigator.clipboard.writeText('https://in1177-design.github.io/TripP/').then(() => {
                              setCopiedAppLink(true);
                              setTimeout(() => setCopiedAppLink(false), 2500);
                            });
                          }}
                        >
                          {copiedAppLink ? '✓ הקישור הועתק!' : '🔗 העתק קישור לאפליקציה'}
                        </button>
                      </div>
                    )}
                    {shareError && (
                      <div className="trv-share-error-wrap">
                        <p className="trv-share-error">{shareError}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <p className="trv-hint">💡 המשתמש חייב להתחבר פעם אחת לפני שניתן להוסיף אותו</p>

        <div className="settings-section-save-row">
          <button className="btn-section-save" onClick={() => saveSection('travelers')}>
            {savedSection === 'travelers' ? '✅ נשמר!' : 'שמור'}
          </button>
        </div>
      </section>

      {/* ══ 3. טיסות ══ */}
      <section className="settings-section">
        <div className="settings-section-head">
          <h3 className="settings-section-title">טיסות</h3>
          {savedSection === 'flights' && <span className="section-saved-badge">✅ נשמר!</span>}
          <button className="btn-outline-sm" onClick={() => setShowAddFlight(true)}>+ הוסף טיסה</button>
        </div>

        {flights.length === 0 && !showAddFlight && (
          <p className="settings-empty">אין טיסות מוזנות</p>
        )}

        {flights.map(f => (
          <div key={f.id} className="settings-flight-row">
            <span className="sfr-dir">{f.dir === 'out' ? '✈️ הלוך' : '✈️ חזור'}</span>
            <span className="sfr-route">{f.from} → {f.to}</span>
            <span className="sfr-no">{f.flightNo}</span>
            <span className="sfr-info">{f.date} · {f.dep}–{f.arr}</span>
            <button className="btn-icon-danger" onClick={() => deleteFlight(f.id)}>✕</button>
          </div>
        ))}

        {showAddFlight && (
          <div className="settings-form-inline">
            <div className="settings-row">
              <select value={newFlight.dir} onChange={e => setNewFlight(f => ({ ...f, dir: e.target.value as 'out' | 'back' }))}>
                <option value="out">הלוך</option>
                <option value="back">חזור</option>
              </select>
              <input placeholder="מ-" value={newFlight.from || ''} onChange={e => setNewFlight(f => ({ ...f, from: e.target.value }))} />
              <input placeholder="ל-" value={newFlight.to   || ''} onChange={e => setNewFlight(f => ({ ...f, to:   e.target.value }))} />
              <input placeholder="מספר טיסה" value={newFlight.flightNo || ''} onChange={e => setNewFlight(f => ({ ...f, flightNo: e.target.value }))} />
            </div>
            <div className="settings-row">
              <input type="date" value={newFlight.date || ''} onChange={e => setNewFlight(f => ({ ...f, date: e.target.value }))} />
              <input placeholder="יציאה" value={newFlight.dep || ''} onChange={e => setNewFlight(f => ({ ...f, dep: e.target.value }))} />
              <input placeholder="נחיתה" value={newFlight.arr || ''} onChange={e => setNewFlight(f => ({ ...f, arr: e.target.value }))} />
            </div>
            <div className="settings-row">
              <button className="btn-primary" onClick={addFlight}>שמור טיסה</button>
              <button className="btn-ghost"   onClick={() => { setShowAddFlight(false); setNewFlight(emptyFlight()); }}>ביטול</button>
            </div>
          </div>
        )}
      </section>

      {/* ══ 4. לינות ══ */}
      <section className="settings-section">
        <div className="settings-section-head">
          <h3 className="settings-section-title">לינות</h3>
          {savedSection === 'stays' && <span className="section-saved-badge">✅ נשמר!</span>}
          <button className="btn-outline-sm" onClick={() => setShowAddStay(true)}>+ הוסף לינה</button>
        </div>

        {stays.length === 0 && !showAddStay && (
          <p className="settings-empty">אין לינות מוזנות</p>
        )}

        {stays.map(s => (
          <div key={s.id} className="settings-stay-row">
            <div className="ssr-name">{s.name}</div>
            <div className="ssr-info">
              <span>{s.checkIn} → {s.checkOut}</span>
              {s.cost
                ? <span>{CURRENCIES.map(c => c === s.currency
                    ? (c==='EUR'?'€':c==='PLN'?'zł':c==='ILS'?'₪':c==='USD'?'$':c)
                    : '').join('')}{s.cost.toLocaleString()}</span>
                : null}
            </div>
            {s.address && <div className="ssr-addr">{s.address}</div>}
            <button className="btn-icon-danger" onClick={() => deleteStay(s.id)}>✕</button>
          </div>
        ))}

        {showAddStay && (
          <div className="settings-form-inline">
            <div className="settings-row">
              <input placeholder="שם המקום" value={newStay.name || ''} onChange={e => setNewStay(s => ({ ...s, name: e.target.value }))} style={{ flex: 2 }} />
              <select value={newStay.status || 'planned'} onChange={e => setNewStay(s => ({ ...s, status: e.target.value as ItemStatus }))}>
                <option value="planned">מתוכנן</option>
                <option value="paid">שולם</option>
              </select>
            </div>
            <div className="settings-row">
              <input type="date" value={newStay.checkIn  || ''} onChange={e => setNewStay(s => ({ ...s, checkIn:  e.target.value }))} />
              <input type="date" value={newStay.checkOut || ''} onChange={e => setNewStay(s => ({ ...s, checkOut: e.target.value }))} />
            </div>
            <div className="settings-row">
              <input type="number" placeholder="מחיר" value={newStay.cost ?? ''} onChange={e => setNewStay(s => ({ ...s, cost: Number(e.target.value) || undefined }))} />
              <select value={newStay.currency || 'PLN'} onChange={e => setNewStay(s => ({ ...s, currency: e.target.value }))}>
                {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="settings-row">
              <input placeholder="כתובת" value={newStay.address || ''} onChange={e => setNewStay(s => ({ ...s, address: e.target.value }))} style={{ flex: 2 }} />
            </div>
            <div className="settings-row">
              <input placeholder="הערות" value={newStay.notes || ''} onChange={e => setNewStay(s => ({ ...s, notes: e.target.value }))} style={{ flex: 2 }} />
            </div>
            <div className="settings-row">
              <button className="btn-primary" onClick={addStay}>שמור לינה</button>
              <button className="btn-ghost"   onClick={() => { setShowAddStay(false); setNewStay(emptyStay()); }}>ביטול</button>
            </div>
          </div>
        )}
      </section>

      {/* ══ 5. שערי חליפין ══ */}
      <section className="settings-section">
        <div className="settings-section-head">
          <h3 className="settings-section-title">שערי חליפין → ₪</h3>
          <button
            className="btn-outline-sm"
            onClick={fetchLiveRates}
            disabled={fetchingRates}
            title="עדכן שערים חיים מהאינטרנט"
          >
            {fetchingRates ? '⏳ טוען...' : '🔄 עדכן שערים'}
          </button>
        </div>
        <p className="settings-hint">כמה שקלים שווה 1 יחידה של כל מטבע — משמש לסיכום ההוצאות</p>
        {ratesError && <p className="settings-hint" style={{ color: 'var(--danger)' }}>{ratesError}</p>}
        <div className="settings-rates-list">
          {allRateCurrencies.map(cur => (
            <div key={cur} className="settings-rate-row">
              <span className="settings-rate-cur">1 {cur}</span>
              <span className="settings-rate-eq">=</span>
              <input
                className="settings-rate-inp"
                type="number" min="0" step="0.01"
                placeholder="0.00"
                value={form.exchangeRates?.[cur] || ''}
                onChange={e => saveRateInForm(cur, e.target.value)}
              />
              <span className="settings-rate-ils">₪</span>
              {form.exchangeRates?.[cur] ? (
                <span className="settings-rate-check">✓</span>
              ) : (
                <span className="settings-rate-missing">!</span>
              )}
            </div>
          ))}
        </div>

        <div className="settings-section-save-row">
          <button className="btn-section-save" onClick={() => saveSection('rates')}>
            {savedSection === 'rates' ? '✅ נשמר!' : 'שמור'}
          </button>
        </div>
      </section>

      {/* ══ אזור סכנה ══ */}
      {onDelete && (
        <section className="settings-section settings-section--danger">
          <h3 className="settings-section-title">אזור סכנה</h3>
          <p className="settings-empty" style={{ marginBottom: 14 }}>
            מחיקת הטיול תמחק את כל המקומות, המסלול וההוצאות. פעולה זו אינה הפיכה.
          </p>
          <button
            className="btn-danger-outline"
            onClick={() => {
              if (confirm(`למחוק לצמיתות את הטיול ל${trip.destination}?`)) onDelete();
            }}
          >
            🗑️ מחק טיול
          </button>
        </section>
      )}

    </div>
  );
}

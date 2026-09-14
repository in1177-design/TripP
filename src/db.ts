import {
  collection, doc, setDoc, updateDoc, deleteDoc, onSnapshot,
  query, orderBy, where,
} from 'firebase/firestore';
import type { Unsubscribe } from 'firebase/firestore';
import { db, auth } from './firebase';
import type { Trip } from './types';

const TRIPS = 'trips';

export function stripUndefined(obj: unknown): unknown {
  if (Array.isArray(obj)) return obj.map(stripUndefined);
  if (obj !== null && typeof obj === 'object') {
    return Object.fromEntries(
      Object.entries(obj as Record<string, unknown>)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, stripUndefined(v)])
    );
  }
  return obj;
}

export async function saveTrip(trip: Trip): Promise<void> {
  // Never touch participants / participantUids from the client —
  // those fields are owned exclusively by Cloud Functions (shareTrip,
  // removeTripParticipant, acceptPendingInvites).  Using updateDoc here
  // ensures we only write the fields we send and never blow away sharing data.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { participants, participantUids, ...tripData } = trip;
  const tripRef = doc(db, TRIPS, trip.id);
  try {
    await updateDoc(tripRef, stripUndefined(tripData) as Record<string, unknown>);
  } catch (e: unknown) {
    // If the document doesn't exist yet (new trip), fall back to setDoc
    if ((e as { code?: string }).code === 'not-found') {
      await setDoc(tripRef, stripUndefined(tripData));
    } else {
      throw e;
    }
  }
}

export async function deleteTrip(id: string): Promise<void> {
  await deleteDoc(doc(db, TRIPS, id));
}

/**
 * Subscribe to all trips owned by or shared with the current user.
 *
 * @param onTrips   Called every time the trip list changes.
 * @param onSharedError  Called when the shared-trips query fails (index not ready,
 *                  permission denied, etc.).  Owned trips are still delivered.
 *                  Pass null to clear a previous error.
 */
export function subscribeTrips(
  onTrips: (trips: Trip[]) => void,
  onSharedError?: (error: string | null) => void,
): Unsubscribe {
  const uid = auth.currentUser?.uid;
  if (!uid) {
    onTrips([]);
    return () => {};
  }

  let ownedTrips:  Trip[] = [];
  let sharedTrips: Trip[] = [];
  let ownedReady  = false;
  let sharedReady = false;

  function merge() {
    if (!ownedReady || !sharedReady) return;
    const seen = new Set<string>();
    const all: Trip[] = [];
    for (const t of [...ownedTrips, ...sharedTrips]) {
      if (!seen.has(t.id)) { seen.add(t.id); all.push(t); }
    }
    all.sort((a, b) => (b.startDate ?? '').localeCompare(a.startDate ?? ''));
    onTrips(all);
  }

  // Query 1: trips owned by this user
  const qOwned = query(
    collection(db, TRIPS),
    where('ownerId', '==', uid),
    orderBy('startDate', 'desc'),
  );

  const unsubOwned = onSnapshot(
    qOwned,
    snap => {
      ownedTrips = snap.docs.map(d => d.data() as Trip);
      ownedReady = true;
      merge();
    },
    err => {
      console.error('subscribeTrips owned query error:', err.code, err.message);
      ownedReady = true;
      merge();
    },
  );

  // Query 2: trips shared with this user.
  // No orderBy here — a simple array-contains query uses Firestore's auto-built
  // single-field index and doesn't need a composite index.
  // Ordering is handled client-side in merge() below.
  const qShared = query(
    collection(db, TRIPS),
    where('participantUids', 'array-contains', uid),
  );

  const unsubShared = onSnapshot(
    qShared,
    snap => {
      sharedTrips = snap.docs.map(d => d.data() as Trip);
      sharedReady = true;
      onSharedError?.(null); // clear any previous error
      merge();
    },
    err => {
      // Surface the error so the UI can tell the user what went wrong.
      // Both 'failed-precondition' and 'permission-denied' can appear while the
      // composite index (participantUids + startDate) is still being built —
      // treat both as a transient "index not ready" situation.
      const msg = (err.code === 'failed-precondition' || err.code === 'permission-denied')
        ? 'הטיולים המשותפים עדיין לא נטענו — האינדקס של Firebase בונה. רענן את הדף בעוד כמה דקות.'
        : `שגיאה בטעינת טיולים משותפים (${err.code})`;
      console.error('subscribeTrips shared query error:', err.code, err.message);
      onSharedError?.(msg);
      sharedReady = true;
      // Keep sharedTrips empty — do NOT clear ownedTrips
      merge();
    },
  );

  return () => { unsubOwned(); unsubShared(); };
}

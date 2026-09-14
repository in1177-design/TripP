import {
  collection, doc, setDoc, deleteDoc, onSnapshot,
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
  await setDoc(doc(db, TRIPS, trip.id), stripUndefined(trip));
}

export async function deleteTrip(id: string): Promise<void> {
  await deleteDoc(doc(db, TRIPS, id));
}

/**
 * Subscribe to all trips owned by or shared with the current user.
 * Falls back to a simple owner-only query if composite indexes aren't ready yet.
 */
export function subscribeTrips(callback: (trips: Trip[]) => void): Unsubscribe {
  const uid = auth.currentUser?.uid;
  if (!uid) {
    callback([]);
    return () => {};
  }

  let ownedTrips:  Trip[] = [];
  let sharedTrips: Trip[] = [];
  let ownedReady  = false;
  let sharedReady = false;

  function merge() {
    const seen = new Set<string>();
    const all: Trip[] = [];
    for (const t of [...ownedTrips, ...sharedTrips]) {
      if (!seen.has(t.id)) { seen.add(t.id); all.push(t); }
    }
    all.sort((a, b) => (b.startDate ?? '').localeCompare(a.startDate ?? ''));
    callback(all);
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
      if (!sharedReady) sharedReady = true; // unblock merge if shared never resolves
      merge();
    },
    err => {
      console.warn('subscribeTrips owned query error:', err.code, err.message);
      ownedReady = true;
      // Do NOT reset sharedTrips — only mark ready so merge() unblocks
      if (!sharedReady) sharedReady = true;
      merge();
    },
  );

  // Query 2: trips shared with this user
  const qShared = query(
    collection(db, TRIPS),
    where('participantUids', 'array-contains', uid),
    orderBy('startDate', 'desc'),
  );

  const unsubShared = onSnapshot(
    qShared,
    snap => {
      sharedTrips = snap.docs.map(d => d.data() as Trip);
      sharedReady = true;
      if (!ownedReady) ownedReady = true;
      merge();
    },
    err => {
      console.warn('subscribeTrips shared query error:', err.code, err.message);
      sharedReady = true;
      // Do NOT reset ownedTrips — only mark ready so merge() unblocks
      if (!ownedReady) ownedReady = true;
      merge();
    },
  );

  return () => { unsubOwned(); unsubShared(); };
}

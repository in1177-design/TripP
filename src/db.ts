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
 * Requires the user to be signed in.
 */
export function subscribeTrips(callback: (trips: Trip[]) => void): Unsubscribe {
  const uid = auth.currentUser?.uid;
  if (!uid) {
    // Return a no-op unsubscribe; App.tsx will retry once auth is ready
    callback([]);
    return () => {};
  }

  // Two separate queries merged client-side (Firestore doesn't support OR across fields)
  const qOwned = query(
    collection(db, TRIPS),
    where('ownerId', '==', uid),
    orderBy('startDate', 'desc'),
  );
  const qShared = query(
    collection(db, TRIPS),
    where('participantUids', 'array-contains', uid),
    orderBy('startDate', 'desc'),
  );

  let ownedTrips:  Trip[] = [];
  let sharedTrips: Trip[] = [];

  function merge() {
    const seen = new Set<string>();
    const all: Trip[] = [];
    for (const t of [...ownedTrips, ...sharedTrips]) {
      if (!seen.has(t.id)) { seen.add(t.id); all.push(t); }
    }
    all.sort((a, b) => (b.startDate ?? '').localeCompare(a.startDate ?? ''));
    callback(all);
  }

  const unsubOwned  = onSnapshot(qOwned,  snap => { ownedTrips  = snap.docs.map(d => d.data() as Trip); merge(); });
  const unsubShared = onSnapshot(qShared, snap => { sharedTrips = snap.docs.map(d => d.data() as Trip); merge(); });

  return () => { unsubOwned(); unsubShared(); };
}

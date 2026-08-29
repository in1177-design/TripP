import {
  collection, doc, getDocs, setDoc, deleteDoc, onSnapshot,
  query, orderBy,
} from 'firebase/firestore';
import type { Unsubscribe } from 'firebase/firestore';
import { db } from './firebase';
import type { Trip } from './types';

const TRIPS = 'trips';

export async function fetchTrips(): Promise<Trip[]> {
  const snap = await getDocs(query(collection(db, TRIPS), orderBy('startDate', 'desc')));
  return snap.docs.map(d => d.data() as Trip);
}

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

export function subscribeTrips(callback: (trips: Trip[]) => void): Unsubscribe {
  const q = query(collection(db, TRIPS), orderBy('startDate', 'desc'));
  return onSnapshot(q, snap => {
    callback(snap.docs.map(d => d.data() as Trip));
  });
}

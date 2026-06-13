import type { Trip } from './types';

const KEY = 'mytrip_trips';

export function loadTrips(): Trip[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveTrips(trips: Trip[]): void {
  localStorage.setItem(KEY, JSON.stringify(trips));
}

export function saveTrip(trip: Trip): void {
  const trips = loadTrips();
  const idx = trips.findIndex(t => t.id === trip.id);
  if (idx >= 0) trips[idx] = trip;
  else trips.unshift(trip);
  saveTrips(trips);
}

export function deleteTrip(id: string): void {
  saveTrips(loadTrips().filter(t => t.id !== id));
}

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

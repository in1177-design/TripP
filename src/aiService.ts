import type { PlaceType } from './types';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from './firebase';

interface PlaceAIResult {
  nameEn?: string;
  nameHe?: string;
  city?: string;
  area?: string;
  address?: string;
  type?: PlaceType;
  priceChild?: number;
  priceAdult?: number;
  rating?: number;
  travelTime?: string;
  description?: string;
  website?: string;
}

/**
 * Enrich a place with AI details via secure Cloud Function.
 * The Anthropic API key lives server-side — never in the browser bundle.
 */
export async function enrichPlace(
  placeName: string,
  tripDestination: string,
  nameHe?: string,
): Promise<PlaceAIResult> {
  const functions = getFunctions(app, 'us-central1');
  const enrichFn  = httpsCallable<
    { placeName: string; tripDestination: string; nameHe?: string },
    PlaceAIResult
  >(functions, 'enrichPlace');

  const result = await enrichFn({ placeName, tripDestination, nameHe });
  return result.data;
}

// ── Place Search (3-step flow) ─────────────────────────────────────────────

export interface PlaceSearchResult {
  providerPlaceId: string;
  name: string;
  address: string;
  category: string;
  location?: { lat: number; lng: number };
}

export interface PlaceDetailsResult {
  providerPlaceId: string;
  name: string;
  nameHe: string;
  address: string;
  category: string;
  description: string;
  website?: string | null;
  imageUrls: string[];
  location?: { lat: number; lng: number } | null;
}

export interface SavePlacePayload {
  providerPlaceId: string;
  nameHe: string;
  nameEn?: string;
  address?: string;
  city?: string;
  category: string;
  description?: string;
  website?: string;
  imageUrl?: string;
  must?: boolean;
}

/**
 * Step 1: Search for places by name/query. Returns up to 3 matches.
 */
export async function searchPlaces(
  tripId: string,
  query: string,
  city?: string,
): Promise<{ requestId: string; results: PlaceSearchResult[] }> {
  const fns = getFunctions(app, 'us-central1');
  const fn  = httpsCallable<
    { tripId: string; query: string; city?: string },
    { requestId: string; results: PlaceSearchResult[] }
  >(fns, 'searchPlaces');
  const result = await fn({ tripId, query, city });
  return result.data;
}

/**
 * Step 2: Fetch full details for a selected place (including Hebrew name).
 * Does NOT save yet.
 */
export async function getPlaceDetails(
  tripId: string,
  providerPlaceId: string,
): Promise<PlaceDetailsResult> {
  const fns = getFunctions(app, 'us-central1');
  const fn  = httpsCallable<
    { tripId: string; providerPlaceId: string },
    PlaceDetailsResult
  >(fns, 'getPlaceDetails');
  const result = await fn({ tripId, providerPlaceId });
  return result.data;
}

/**
 * Step 3: Save the confirmed place to the trip's bank.
 * Checks for duplicates server-side.
 */
export async function savePlaceIdea(
  tripId: string,
  data: SavePlacePayload,
): Promise<void> {
  const fns = getFunctions(app, 'us-central1');
  const fn  = httpsCallable<{ tripId: string } & SavePlacePayload, unknown>(fns, 'savePlaceIdea');
  await fn({ tripId, ...data });
}

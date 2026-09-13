/**
 * AI place-enrichment — client side.
 *
 * Calls the `enrichPlace` Firebase Cloud Function instead of Anthropic directly.
 * The Anthropic API key is stored as a server-side secret and never included
 * in the frontend bundle.
 */

import type { PlaceType } from './types';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { signInAnonymously } from 'firebase/auth';
import { auth } from './firebase';
import { getApp } from 'firebase/app';

export interface PlaceAIResult {
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

interface EnrichRequest {
  placeName: string;
  tripDestination: string;
  nameHe?: string;
}

/**
 * Enrich a place with AI details via a secure server-side Cloud Function.
 *
 * Requires the caller to be signed in with Firebase Auth.
 * Anonymous sign-in is triggered automatically if no session exists.
 *
 * @param placeName       Name used for the lookup (English or Hebrew)
 * @param tripDestination e.g. "קרקוב"
 * @param nameHe          Hebrew name hint (optional)
 */
export async function enrichPlace(
  placeName: string,
  tripDestination: string,
  nameHe?: string,
): Promise<PlaceAIResult> {
  // Ensure the user is signed in (anonymous sign-in is transparent to the user)
  if (!auth.currentUser) {
    await signInAnonymously(auth);
  }

  const functions = getFunctions(getApp(), 'us-central1');
  const enrichFn = httpsCallable<EnrichRequest, PlaceAIResult>(
    functions,
    'enrichPlace',
  );

  const result = await enrichFn({ placeName, tripDestination, nameHe });
  return result.data;
}

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

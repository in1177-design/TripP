import type { PlaceType } from './types';

interface PlaceAIResult {
  nameEn?: string;
  nameHe?: string;
  city?: string;
  area?: string;
  type?: PlaceType;
  priceChild?: number;
  priceAdult?: number;
  rating?: number;
  travelTime?: string;
  description?: string;
  website?: string;
}

const VALID_TYPES: PlaceType[] = ['אטרקציה', 'מסעדה', 'קפה', 'מוזיאון', 'שוק', 'פארק', 'שכונה', 'אחר'];

/**
 * Enrich a place with AI details.
 * @param placeName  Hebrew or English name (uses whichever is provided)
 * @param nameHe     Hebrew name (for the prompt; falls back to placeName)
 * @param tripDestination  e.g. "קרקוב"
 */
export async function enrichPlace(
  placeName: string,
  tripDestination: string,
  nameHe?: string,
): Promise<PlaceAIResult> {
  const apiKey = import.meta.env.VITE_ANTHROPIC_KEY;
  if (!apiKey) throw new Error('אין API key');

  const prompt = `אתה עוזר לתכנן טיול ל${tripDestination}.
המשתמש מוסיף מקום בשם: "${placeName}"${nameHe && nameHe !== placeName ? ` (${nameHe})` : ''}

החזר JSON בלבד (ללא טקסט נוסף) עם הפרטים הבאים:
{
  "nameEn": "שם באנגלית",
  "nameHe": "שם בעברית",
  "city": "עיר",
  "area": "שכונה או אזור",
  "type": "אחד מ: אטרקציה, מסעדה, קפה, מוזיאון, שוק, פארק, שכונה, אחר",
  "priceChild": מחיר ילד בשקלים או null,
  "priceAdult": מחיר מבוגר בשקלים או null,
  "rating": דירוג מ-1 עד 5 או null,
  "travelTime": "זמן נסיעה ממרכז העיר למשל 10 דק'",
  "description": "תיאור קצר של המקום בעברית, משפט אחד",
  "website": "כתובת אתר רשמי או null"
}`;

  // Use direct Anthropic API (works in both dev and production)
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);

  let response: Response;
  try {
    response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 500,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const errText = await response.text();
    console.error('Anthropic error:', errText);
    throw new Error(`שגיאה: ${response.status}`);
  }

  const data = await response.json();
  const text = data.content?.[0]?.text ?? '{}';
  const json = JSON.parse(text.replace(/```json|```/g, '').trim());

  return {
    nameEn: json.nameEn || undefined,
    nameHe: json.nameHe || undefined,
    city: json.city || undefined,
    area: json.area || undefined,
    type: VALID_TYPES.includes(json.type) ? json.type : undefined,
    priceChild: json.priceChild ?? undefined,
    priceAdult: json.priceAdult ?? undefined,
    rating: json.rating ?? undefined,
    travelTime: json.travelTime || undefined,
    description: json.description || undefined,
    website: json.website || undefined,
  };
}

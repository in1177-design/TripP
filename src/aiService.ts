import type { PlaceType } from './types';

interface PlaceAIResult {
  nameEn?: string;
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

export async function enrichPlace(nameHe: string, tripDestination: string): Promise<PlaceAIResult> {
  const apiKey = import.meta.env.VITE_ANTHROPIC_KEY;
  console.log('API key starts with:', apiKey?.slice(0, 20));
  if (!apiKey) throw new Error('אין API key');

  const prompt = `אתה עוזר לתכנן טיול ל${tripDestination}.
המשתמש מוסיף מקום בשם: "${nameHe}"

החזר JSON בלבד (ללא טקסט נוסף) עם הפרטים הבאים:
{
  "nameEn": "שם באנגלית",
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

  const response = await fetch('/api/anthropic/v1/messages', {
    method: 'POST',
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

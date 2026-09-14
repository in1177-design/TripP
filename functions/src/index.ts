import * as admin from 'firebase-admin';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import {
  FieldValue, Timestamp,
} from 'firebase-admin/firestore';

// Server-side secret — never exposed to client bundle
const ANTHROPIC_KEY = defineSecret('ANTHROPIC_KEY');

admin.initializeApp();
const db = admin.firestore();

// ── Types ────────────────────────────────────────────────────────────────────

interface EnrichRequest {
  placeName:       string;
  tripDestination: string;
  nameHe?:         string;
  tripId?:         string; // optional — used to verify user has trip access
}

// ── Rate limiting ─────────────────────────────────────────────────────────────

const DAILY_USER_QUOTA   = 20;   // calls per user per day
const DAILY_GLOBAL_QUOTA = 500;  // calls total per day

function todayKey() {
  return new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
}

async function checkRateLimits(uid: string): Promise<void> {
  const day = todayKey();

  // User counter
  const userRef  = db.doc(`_rateLimits/users/${uid}/${day}`);
  // Global counter
  const globalRef = db.doc(`_rateLimits/global/${day}/count`);

  await db.runTransaction(async tx => {
    const [userSnap, globalSnap] = await Promise.all([
      tx.get(userRef),
      tx.get(globalRef),
    ]);

    const userCount   = (userSnap.data()?.n   as number | undefined) ?? 0;
    const globalCount = (globalSnap.data()?.n as number | undefined) ?? 0;

    if (userCount >= DAILY_USER_QUOTA) {
      throw new HttpsError('resource-exhausted',
        `הגעת למגבלה היומית (${DAILY_USER_QUOTA} קריאות). נסי שוב מחר.`);
    }
    if (globalCount >= DAILY_GLOBAL_QUOTA) {
      throw new HttpsError('resource-exhausted',
        'המגבלה היומית הכוללת הגיעה לסיומה. נסי שוב מחר.');
    }

    tx.set(userRef,   { n: FieldValue.increment(1), updatedAt: Timestamp.now() }, { merge: true });
    tx.set(globalRef, { n: FieldValue.increment(1), updatedAt: Timestamp.now() }, { merge: true });
  });
}

// ── Main function ─────────────────────────────────────────────────────────────

export const enrichPlace = onCall(
  {
    secrets:        [ANTHROPIC_KEY],
    maxInstances:   5,
    timeoutSeconds: 30,
    memory:         '256MiB',
    cors: [
      'https://in1177-design.github.io',
      'http://localhost:5173',
      'http://localhost:4173',
    ],
  },
  async (request) => {
    // 1. Require a real (non-anonymous) Google account
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'נדרשת כניסה לחשבון.');
    }

    const provider = request.auth.token.firebase?.sign_in_provider;
    if (provider === 'anonymous') {
      throw new HttpsError('permission-denied',
        'יש להתחבר עם חשבון Google כדי להשתמש ב-AI.');
    }

    const uid = request.auth.uid;

    // 2. Validate input
    const data = request.data as EnrichRequest;
    if (!data?.placeName || typeof data.placeName !== 'string') {
      throw new HttpsError('invalid-argument', 'שדה placeName חסר.');
    }
    if (!data?.tripDestination || typeof data.tripDestination !== 'string') {
      throw new HttpsError('invalid-argument', 'שדה tripDestination חסר.');
    }

    const placeName       = data.placeName.slice(0, 300).trim();
    const tripDestination = data.tripDestination.slice(0, 150).trim();
    const nameHe          = typeof data.nameHe === 'string'
      ? data.nameHe.slice(0, 150).trim()
      : undefined;

    // 3. Optionally verify trip access
    if (data.tripId && typeof data.tripId === 'string') {
      const tripSnap = await db.doc(`trips/${data.tripId}`).get();
      if (!tripSnap.exists) {
        throw new HttpsError('not-found', 'הטיול לא נמצא.');
      }
      const tripData = tripSnap.data() as { ownerId?: string; participantUids?: string[] } | undefined;
      const hasAccess =
        tripData?.ownerId === uid ||
        (tripData?.participantUids ?? []).includes(uid);
      if (!hasAccess) {
        throw new HttpsError('permission-denied', 'אין גישה לטיול זה.');
      }
    }

    // 4. Rate-limit check (atomic transaction)
    await checkRateLimits(uid);

    // 5. Call Anthropic
    const apiKey = ANTHROPIC_KEY.value();
    if (!apiKey) throw new HttpsError('internal', 'מפתח API חסר.');

    const prompt = `אתה עוזר לתכנן טיול ל${tripDestination}.
המשתמש מוסיף מקום בשם: "${placeName}"${nameHe && nameHe !== placeName ? ` (${nameHe})` : ''}

חשוב: המקום חייב להיות ממוקם ב${tripDestination} או באזורה. אם קיימים מקומות בשם זהה במדינות אחרות, התייחס רק לזה שנמצא ביעד הטיול.

ענה על מה שאתה יודע. החזר JSON בלבד (ללא טקסט נוסף). אם אינך בטוח בשדה מסוים — החזר את הניחוש הטוב ביותר שלך. אם אין לך שום מידע על שדה — החזר null.
{
  "nameEn": "שם באנגלית",
  "nameHe": "שם בעברית",
  "city": "שם העיר בעברית בלבד",
  "area": "שכונה או אזור או null",
  "address": "כתובת רחוב מלאה או null",
  "type": "אחד מ: אטרקציה, מסעדה, קפה, מוזיאון, שוק, פארק, שכונה, אחר",
  "priceChild": מחיר ילד במטבע מקומי (מספר) או null,
  "priceAdult": מחיר מבוגר במטבע מקומי (מספר) או null,
  "rating": דירוג 1-5 או null,
  "travelTime": "זמן נסיעה ממרכז העיר או null",
  "description": "תיאור קצר בעברית, משפט אחד",
  "website": "URL רלוונטי או null"
}`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':    'application/json',
        'x-api-key':       apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      'claude-sonnet-4-6',
        max_tokens: 600,
        messages:   [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Anthropic error:', response.status, errText);
      throw new HttpsError('internal', `שגיאת AI: ${response.status}`);
    }

    const anthropicData = await response.json() as {
      content?: Array<{ text?: string }>;
    };
    const text = anthropicData.content?.[0]?.text ?? '{}';

    let json: Record<string, unknown>;
    try {
      json = JSON.parse(text.replace(/```json|```/g, '').trim()) as Record<string, unknown>;
    } catch {
      console.error('Failed to parse Anthropic response:', text);
      throw new HttpsError('internal', 'שגיאה בפענוח תגובת AI.');
    }

    const VALID_TYPES = ['אטרקציה', 'מסעדה', 'קפה', 'מוזיאון', 'שוק', 'פארק', 'שכונה', 'אחר'];

    // Return only known safe fields
    return {
      nameEn:      typeof json.nameEn === 'string' ? json.nameEn         : undefined,
      nameHe:      typeof json.nameHe === 'string' ? json.nameHe         : undefined,
      city:        typeof json.city   === 'string' ? json.city           : undefined,
      area:        typeof json.area   === 'string' ? json.area           : undefined,
      address:     typeof json.address === 'string' ? json.address       : undefined,
      type:        typeof json.type   === 'string' && VALID_TYPES.includes(json.type as string)
                     ? json.type : undefined,
      priceChild:  typeof json.priceChild === 'number' ? json.priceChild : undefined,
      priceAdult:  typeof json.priceAdult === 'number' ? json.priceAdult : undefined,
      rating:      typeof json.rating     === 'number' ? json.rating     : undefined,
      travelTime:  typeof json.travelTime === 'string' ? json.travelTime : undefined,
      description: typeof json.description === 'string' ? json.description : undefined,
      website:     typeof json.website     === 'string' ? json.website   : undefined,
    };
  },
);

// ── Place Search — Phase 1 (Mock Data) ───────────────────────────────────────

interface MockPlace {
  providerPlaceId: string;
  name: string;
  nameHe?: string;
  address: string;
  category: string;
  country: string; // ISO-2 code — used to filter by trip destination
  location: { lat: number; lng: number };
  description?: string;
  website?: string;
  imageUrls?: string[];
}

const MOCK_PLACES: MockPlace[] = [
  // ── Poland — Kraków ───────────────────────────────────────────────────────
  { providerPlaceId: 'mock_krakow_wawel', country: 'PL', name: 'Wawel Royal Castle', nameHe: 'טירת וואוול', address: 'Wawel 5, 31-001 Kraków', category: 'אטרקציה', location: { lat: 50.0542, lng: 19.9355 }, website: 'https://wawel.krakow.pl', description: 'Medieval castle complex on Wawel Hill' },
  { providerPlaceId: 'mock_krakow_pod_aniolami', country: 'PL', name: 'Pod Aniolami', address: 'ul. Grodzka 35, 31-001 Kraków', category: 'מסעדה', location: { lat: 50.0591, lng: 19.9382 }, description: 'Traditional Polish cuisine in a historic cellar' },
  { providerPlaceId: 'mock_krakow_old_town', country: 'PL', name: 'Stare Miasto (Old Town)', nameHe: 'העיר העתיקה של קרקוב', address: 'Rynek Główny, Kraków', category: 'שכונה', location: { lat: 50.0614, lng: 19.9372 }, description: 'Historic city center with the main market square' },
  { providerPlaceId: 'mock_krakow_salt_mine', country: 'PL', name: 'Wieliczka Salt Mine', nameHe: "מכרה המלח וייליצ'קה", address: 'Park Kingi 1, 32-020 Wieliczka', category: 'אטרקציה', location: { lat: 49.9838, lng: 20.0548 }, website: 'https://wieliczka-saltmine.com', description: 'UNESCO World Heritage underground salt mine' },
  { providerPlaceId: 'mock_krakow_kazimierz', country: 'PL', name: 'Kazimierz Jewish Quarter', nameHe: 'רובע קזימייז', address: 'Kazimierz, Kraków', category: 'שכונה', location: { lat: 50.0515, lng: 19.9440 }, description: 'Historic Jewish quarter with synagogues and galleries' },
  { providerPlaceId: 'mock_krakow_market', country: 'PL', name: 'Stary Kleparz Market', nameHe: "שוק סטארי קלפאז'", address: 'ul. Stary Kleparz, Kraków', category: 'שוק', location: { lat: 50.0671, lng: 19.9400 }, description: 'Traditional outdoor food and flower market' },
  { providerPlaceId: 'mock_krakow_hawelka', country: 'PL', name: 'Hawelka', address: 'Rynek Główny 34, 31-010 Kraków', category: 'מסעדה', location: { lat: 50.0618, lng: 19.9378 }, website: 'https://hawelka.pl', description: 'Iconic restaurant on the Main Market Square since 1876' },
  { providerPlaceId: 'mock_krakow_cloth_hall', country: 'PL', name: 'Cloth Hall (Sukiennice)', nameHe: 'אולם הבד', address: 'Rynek Główny 1-3, 31-042 Kraków', category: 'שוק', location: { lat: 50.0616, lng: 19.9375 }, description: 'Gothic trading hall in the center of the main square' },
  { providerPlaceId: 'mock_krakow_schindler', country: 'PL', name: "Schindler's Factory Museum", nameHe: 'מפעל שינדלר', address: 'ul. Lipowa 4, 30-702 Kraków', category: 'מוזיאון', location: { lat: 50.0474, lng: 19.9612 }, website: 'https://muzeumkrakowa.pl', description: 'Museum dedicated to WWII Kraków history' },
  { providerPlaceId: 'mock_krakow_national_museum', country: 'PL', name: 'National Museum in Kraków', nameHe: 'המוזיאון הלאומי בקרקוב', address: 'al. 3 Maja 1, 30-062 Kraków', category: 'מוזיאון', location: { lat: 50.0617, lng: 19.9186 }, website: 'https://mnk.pl', description: 'Largest museum in Poland' },
  { providerPlaceId: 'mock_krakow_wawel_dragon', country: 'PL', name: 'Smocza Jama (Dragon Cave)', nameHe: "מערת הדרקון של וואוול", address: 'Wawel, 31-001 Kraków', category: 'אטרקציה', location: { lat: 50.0535, lng: 19.9348 }, description: 'Legendary cave beneath Wawel Hill' },
  // Poland — Zakopane & Tatry
  { providerPlaceId: 'mock_zak_chocho', country: 'PL', name: 'Chochołowskie Termy', nameHe: 'מרחצאות חוחולובסקיה', address: 'ul. Jana Pawła II 2, 34-481 Chochołów', category: 'אטרקציה', location: { lat: 49.4741, lng: 19.7613 }, website: 'https://chocholowskietermy.pl', description: 'Popular thermal baths and water park near Zakopane' },
  { providerPlaceId: 'mock_zak_krupowki', country: 'PL', name: 'Krupówki Street', nameHe: 'רחוב קרופובקי', address: 'ul. Krupówki, 34-500 Zakopane', category: 'שכונה', location: { lat: 49.2986, lng: 19.9551 }, description: 'Main pedestrian street of Zakopane with restaurants and shops' },
  { providerPlaceId: 'mock_zak_morskie_oko', country: 'PL', name: 'Morskie Oko Lake', nameHe: 'אגם מורסקיה אוקו', address: 'Tatrzański Park Narodowy, 34-500 Zakopane', category: 'פארק', location: { lat: 49.1993, lng: 20.0703 }, description: 'The most famous mountain lake in Poland, a 9km hike from Zakopane' },
  { providerPlaceId: 'mock_zak_gubalowka', country: 'PL', name: 'Gubałówka Hill', nameHe: "גוּבַּלוֹבְקָה", address: 'ul. Gubałówka, 34-500 Zakopane', category: 'אטרקציה', location: { lat: 49.3082, lng: 19.9490 }, description: 'Mountain viewpoint above Zakopane, reachable by funicular' },
  { providerPlaceId: 'mock_zak_tatra_np', country: 'PL', name: 'Tatra National Park', nameHe: 'הפארק הלאומי הטטרי', address: 'Kuźnice, 34-500 Zakopane', category: 'פארק', location: { lat: 49.2632, lng: 19.9821 }, website: 'https://tpn.pl', description: 'The only mountain national park in Poland — stunning peaks and valleys' },
  { providerPlaceId: 'mock_zak_termy_bania', country: 'PL', name: 'Termy Bania', nameHe: "טרמי בניה (בִּיאָלְקָה)", address: 'ul. Bania 1, 34-405 Białka Tatrzańska', category: 'אטרקציה', location: { lat: 49.3811, lng: 20.0964 }, website: 'https://termybania.pl', description: 'Thermal pools and spa with panoramic Tatra views' },
  { providerPlaceId: 'mock_zak_dolina_koscieliska', country: 'PL', name: 'Kościeliska Valley', nameHe: "עמק קושצ'יליסקה", address: 'Dolina Kościeliska, Tatrzański Park Narodowy', category: 'פארק', location: { lat: 49.2660, lng: 19.8757 }, description: 'Beautiful valley with limestone gorges and caves, easy hiking' },
  // Poland — Auschwitz
  { providerPlaceId: 'mock_auschwitz', country: 'PL', name: 'Auschwitz-Birkenau Memorial and Museum', nameHe: 'אנדרטת ומוזיאון אושוויץ-בירקנאו', address: 'ul. Więźniów Oświęcimia 20, 32-603 Oświęcim', category: 'מוזיאון', location: { lat: 50.0271, lng: 19.2037 }, website: 'https://auschwitz.org', description: 'UNESCO World Heritage site — former Nazi concentration camp' },
  // Poland — Energylandia (Zator)
  { providerPlaceId: 'mock_energylandia', country: 'PL', name: 'Energylandia', nameHe: 'אנרג\'יילנד', address: 'Brody 1, 32-640 Zator', category: 'אטרקציה', location: { lat: 49.9909, lng: 19.4398 }, website: 'https://energylandia.pl', description: "Poland's largest amusement park" },
  // ── Israel ────────────────────────────────────────────────────────────────
  { providerPlaceId: 'mock_tlv_carmel', country: 'IL', name: 'Carmel Market', nameHe: 'שוק הכרמל', address: 'Shuk HaCarmel, Tel Aviv', category: 'שוק', location: { lat: 32.0653, lng: 34.7663 }, description: 'Bustling outdoor market in Tel Aviv' },
  { providerPlaceId: 'mock_tlv_jaffa', country: 'IL', name: 'Jaffa Old City', nameHe: 'עיר עתיקה של יפו', address: 'Old Jaffa, Tel Aviv-Yafo', category: 'שכונה', location: { lat: 32.0531, lng: 34.7518 } },
  { providerPlaceId: 'mock_tlv_habasta', country: 'IL', name: 'HaBasta', nameHe: 'הבסטה', address: 'Hashomer St 4, Tel Aviv', category: 'מסעדה', location: { lat: 32.0657, lng: 34.7690 }, description: 'Popular farm-to-table restaurant near Carmel Market' },
  // ── France — Paris ────────────────────────────────────────────────────────
  { providerPlaceId: 'mock_paris_eiffel', country: 'FR', name: 'Eiffel Tower', nameHe: 'מגדל אייפל', address: 'Champ de Mars, 5 Av. Anatole France, 75007 Paris', category: 'אטרקציה', location: { lat: 48.8584, lng: 2.2945 }, website: 'https://www.toureiffel.paris' },
  { providerPlaceId: 'mock_paris_louvre', country: 'FR', name: 'Louvre Museum', nameHe: 'מוזיאון הלובר', address: 'Rue de Rivoli, 75001 Paris', category: 'מוזיאון', location: { lat: 48.8606, lng: 2.3376 }, website: 'https://www.louvre.fr' },
  { providerPlaceId: 'mock_paris_comptoir', country: 'FR', name: 'Le Comptoir du Relais', address: "9 Carrefour de l'Odéon, 75006 Paris", category: 'מסעדה', location: { lat: 48.8515, lng: 2.3401 }, description: 'Classic French bistro in Saint-Germain' },
  // ── Italy — Rome ──────────────────────────────────────────────────────────
  { providerPlaceId: 'mock_rome_colosseum', country: 'IT', name: 'Colosseum', nameHe: 'הקולוסיאום', address: 'Piazza del Colosseo, 1, 00184 Roma RM', category: 'אטרקציה', location: { lat: 41.8902, lng: 12.4922 }, website: 'https://www.parcocolosseo.it' },
  { providerPlaceId: 'mock_rome_vatican', country: 'IT', name: 'Vatican Museums', nameHe: 'מוזיאוני הוותיקן', address: 'Viale Vaticano, 00165 Roma RM', category: 'מוזיאון', location: { lat: 41.9065, lng: 12.4534 } },
  { providerPlaceId: 'mock_rome_da_enzo', country: 'IT', name: 'Da Enzo al 29', address: 'Via dei Vascellari, 29, 00153 Roma RM', category: 'מסעדה', location: { lat: 41.8879, lng: 12.4703 }, description: 'Trattoria in Trastevere neighborhood' },
  // ── Spain — Barcelona ─────────────────────────────────────────────────────
  { providerPlaceId: 'mock_bcn_sagrada', country: 'ES', name: 'Sagrada Família', nameHe: 'סגרדה פמיליה', address: 'C/ de Mallorca, 401, 08013 Barcelona', category: 'אטרקציה', location: { lat: 41.4036, lng: 2.1744 }, website: 'https://sagradafamilia.org' },
  { providerPlaceId: 'mock_bcn_boqueria', country: 'ES', name: 'La Boqueria Market', nameHe: 'שוק לה בוקריה', address: 'La Rambla, 91, 08001 Barcelona', category: 'שוק', location: { lat: 41.3817, lng: 2.1718 }, description: 'Famous public market on La Rambla' },
  // ── Netherlands — Amsterdam ───────────────────────────────────────────────
  { providerPlaceId: 'mock_ams_rijks', country: 'NL', name: 'Rijksmuseum', nameHe: 'ריקסמוזיאום', address: 'Museumstraat 1, 1071 XX Amsterdam', category: 'מוזיאון', location: { lat: 52.3600, lng: 4.8852 }, website: 'https://www.rijksmuseum.nl' },
  { providerPlaceId: 'mock_ams_vondelpark', country: 'NL', name: 'Vondelpark', nameHe: 'פארק פונדל', address: 'Vondelpark, 1071 Amsterdam', category: 'פארק', location: { lat: 52.3579, lng: 4.8687 }, description: "Amsterdam's largest and most famous park" },
  // ── Greece — Athens ───────────────────────────────────────────────────────
  { providerPlaceId: 'mock_ath_acropolis', country: 'GR', name: 'Acropolis of Athens', nameHe: 'האקרופוליס של אתונה', address: 'Acropolis, Athens 105 58, Greece', category: 'אטרקציה', location: { lat: 37.9715, lng: 23.7267 }, website: 'https://www.theacropolismuseum.gr' },
  { providerPlaceId: 'mock_ath_monastiraki', country: 'GR', name: 'Monastiraki Flea Market', nameHe: 'שוק מונסטירקי', address: 'Platia Monastirakiou, Athina 105 55', category: 'שוק', location: { lat: 37.9762, lng: 23.7243 } },
];

/**
 * Extract a 2-letter country code from a free-text destination string.
 * Returns null when the destination is ambiguous or unknown.
 */
function guessCountry(destination: string): string | null {
  const d = destination.toLowerCase();
  if (/poland|פולין|krak[oó]w|warsaw|warszawa|zakopane|gdańsk|gdansk|wrocław|wroclaw|wieliczka|auschwitz|o[sś]wi[eę]cim|zator|energylandia|tatry|tatra|chocho|bania|białka|bialka/.test(d)) return 'PL';
  if (/france|צרפת|paris|פריז|lyon|nice|marseille/.test(d)) return 'FR';
  if (/italy|italia|איטליה|rome|roma|רומא|milan|florence|venice|firenze/.test(d)) return 'IT';
  if (/spain|españa|ספרד|barcelona|ברצלונה|madrid|מדריד|seville|sevilla/.test(d)) return 'ES';
  if (/netherlands|holland|הולנד|amsterdam|אמסטרדם/.test(d)) return 'NL';
  if (/greece|grecia|יוון|athens|athina|אתונה/.test(d)) return 'GR';
  if (/israel|ישראל|tel.?aviv|תל.?אביב|jerusalem|ירושלים|haifa|חיפה/.test(d)) return 'IL';
  return null;
}

function mockSearch(query: string, countryCode: string | null): MockPlace[] {
  const q = query.toLowerCase().trim();
  if (!q) return [];

  // Score each place: higher = better match
  const scored: Array<{ place: MockPlace; score: number }> = [];

  for (const p of MOCK_PLACES) {
    // Skip places from other countries when country is known
    if (countryCode && p.country !== countryCode) continue;

    let score = 0;
    const nameLow = p.name.toLowerCase();
    const nameHeLow = (p.nameHe || '').toLowerCase();
    const descLow  = (p.description || '').toLowerCase();

    if (nameLow === q || nameHeLow === q)               score += 100; // exact match
    else if (nameLow.startsWith(q) || nameHeLow.startsWith(q)) score += 60;
    else if (nameLow.includes(q) || nameHeLow.includes(q))     score += 40;
    else if (p.address.toLowerCase().includes(q))               score += 20;
    else if (p.category.includes(q))                            score += 10;
    else if (descLow.includes(q))                               score += 5;

    if (score > 0) scored.push({ place: p, score });
  }

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(s => s.place);
}

function getMockById(id: string): MockPlace | undefined {
  return MOCK_PLACES.find(p => p.providerPlaceId === id);
}

/** Verify user has at least viewer access to a trip. Returns tripData. */
async function verifyTripAccess(
  uid: string,
  tripId: string,
  requireEditor = false,
): Promise<Record<string, unknown>> {
  const tripSnap = await db.doc(`trips/${tripId}`).get();
  if (!tripSnap.exists) throw new HttpsError('not-found', 'הטיול לא נמצא.');
  const td = tripSnap.data() as {
    ownerId?: string;
    participantUids?: string[];
    participants?: Array<{ uid: string; role: string }>;
    destination?: string;
  };
  const isOwner = td.ownerId === uid;
  const participant = (td.participants ?? []).find(p => p.uid === uid);
  const hasAccess = isOwner || !!participant || (td.participantUids ?? []).includes(uid);
  if (!hasAccess) throw new HttpsError('permission-denied', 'אין גישה לטיול זה.');
  if (requireEditor && !isOwner && participant?.role !== 'editor') {
    throw new HttpsError('permission-denied', 'נדרשת הרשאת עריכה.');
  }
  return td as Record<string, unknown>;
}

const PLACES_CORS = [
  'https://in1177-design.github.io',
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:4173',
];

// ── searchPlaces ──────────────────────────────────────────────────────────────

export const searchPlaces = onCall(
  { maxInstances: 10, timeoutSeconds: 10, cors: PLACES_CORS },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'נדרשת כניסה.');
    const { tripId, query } = request.data as { tripId: string; query?: string; city?: string };
    if (!tripId || !query?.trim()) throw new HttpsError('invalid-argument', 'חסרים פרמטרים.');

    const trip = await verifyTripAccess(request.auth.uid, tripId);

    // Infer country from trip destination so results are scoped to the right country
    const countryCode = guessCountry((trip.destination as string | undefined) || '');
    // Use query alone for text matching — city is used only for future geo-filtering
    const results = mockSearch(query.trim(), countryCode);

    return {
      requestId: String(Date.now()),
      results: results.map(p => ({
        providerPlaceId: p.providerPlaceId,
        name: p.name,
        address: p.address,
        category: p.category,
        location: p.location,
      })),
    };
  },
);

// ── getPlaceDetails ───────────────────────────────────────────────────────────

export const getPlaceDetails = onCall(
  { secrets: [ANTHROPIC_KEY], maxInstances: 5, timeoutSeconds: 30, memory: '256MiB', cors: PLACES_CORS },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'נדרשת כניסה.');
    if (request.auth.token.firebase?.sign_in_provider === 'anonymous') {
      throw new HttpsError('permission-denied', 'נדרשת כניסה עם חשבון Google.');
    }
    const uid = request.auth.uid;
    const { tripId, providerPlaceId } = request.data as { tripId: string; providerPlaceId: string };
    if (!tripId || !providerPlaceId) throw new HttpsError('invalid-argument', 'חסרים פרמטרים.');

    await verifyTripAccess(uid, tripId);

    const place = getMockById(providerPlaceId);
    if (!place) throw new HttpsError('not-found', 'המקום לא נמצא.');

    await checkRateLimits(uid);

    const apiKey = ANTHROPIC_KEY.value();
    if (!apiKey) throw new HttpsError('internal', 'מפתח API חסר.');

    // Use existing AI info from mock as defaults; call Claude only for Hebrew translation
    let nameHe = place.nameHe || place.name;
    let descriptionHe = place.description || '';
    let categoryHe = place.category;

    const prompt = `מקום: "${place.name}" (קטגוריה: ${place.category}), כתובת: ${place.address}.${place.description ? ` תיאור: ${place.description}` : ''}

החזר JSON בלבד (ללא טקסט נוסף):
{
  "nameHe": "שם קצר ומדויק בעברית",
  "descriptionHe": "תיאור קצר בעברית, משפט אחד",
  "categoryHe": "אחד מ: אטרקציה, מסעדה, קפה, מוזיאון, שוק, פארק, שכונה, אחר"
}`;

    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type':      'application/json',
          'x-api-key':         apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model:      'claude-haiku-4-5-20251001',
          max_tokens: 200,
          messages:   [{ role: 'user', content: prompt }],
        }),
      });
      if (res.ok) {
        const d = await res.json() as { content?: Array<{ text?: string }> };
        const text = d.content?.[0]?.text ?? '';
        const json = JSON.parse(text.replace(/```json|```/g, '').trim()) as Record<string, unknown>;
        const VALID_TYPES = ['אטרקציה', 'מסעדה', 'קפה', 'מוזיאון', 'שוק', 'פארק', 'שכונה', 'אחר'];
        if (typeof json.nameHe === 'string' && json.nameHe.trim()) nameHe = json.nameHe.trim();
        if (typeof json.descriptionHe === 'string') descriptionHe = json.descriptionHe.trim();
        if (typeof json.categoryHe === 'string' && VALID_TYPES.includes(json.categoryHe as string)) {
          categoryHe = json.categoryHe as string;
        }
      }
    } catch { /* keep mock defaults on AI failure */ }

    return {
      providerPlaceId: place.providerPlaceId,
      name:       place.name,
      nameHe,
      address:    place.address,
      category:   categoryHe,
      description: descriptionHe,
      website:    place.website ?? null,
      imageUrls:  place.imageUrls ?? [],
    };
  },
);

// ── savePlaceIdea ─────────────────────────────────────────────────────────────

interface SavePlaceData {
  tripId:          string;
  providerPlaceId: string;
  nameHe:          string;
  nameEn?:         string;
  address?:        string;
  city?:           string;
  category:        string;
  description?:    string;
  website?:        string;
  imageUrl?:       string;
  must?:           boolean;
}

export const savePlaceIdea = onCall(
  { maxInstances: 10, timeoutSeconds: 15, cors: PLACES_CORS },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'נדרשת כניסה.');
    const uid = request.auth.uid;
    const data = request.data as SavePlaceData;

    if (!data?.tripId || !data?.providerPlaceId || !data?.nameHe?.trim()) {
      throw new HttpsError('invalid-argument', 'חסרים פרמטרים.');
    }

    const VALID_TYPES = ['אטרקציה', 'מסעדה', 'קפה', 'מוזיאון', 'שוק', 'פארק', 'שכונה', 'אחר'];
    const tripRef = db.doc(`trips/${data.tripId}`);

    const savedPlace = await db.runTransaction(async tx => {
      const tripSnap = await tx.get(tripRef);
      if (!tripSnap.exists) throw new HttpsError('not-found', 'הטיול לא נמצא.');

      const td = tripSnap.data() as {
        ownerId?:         string;
        participants?:    Array<{ uid: string; role: string }>;
        participantUids?: string[];
        places?:          Array<{ providerPlaceId?: string }>;
      };

      // Verify editor access inside transaction
      const isOwner    = td.ownerId === uid;
      const participant = (td.participants ?? []).find(p => p.uid === uid);
      if (!isOwner && participant?.role !== 'editor') {
        throw new HttpsError('permission-denied', 'נדרשת הרשאת עריכה.');
      }

      // Duplicate check
      if ((td.places ?? []).some(p => p.providerPlaceId === data.providerPlaceId)) {
        throw new HttpsError('already-exists', 'המקום כבר קיים בבנק הרעיונות.');
      }

      const newPlace = {
        id:              db.collection('_').doc().id,
        providerPlaceId: data.providerPlaceId,
        nameHe:          data.nameHe.trim().slice(0, 200),
        nameEn:          (data.nameEn  || '').trim().slice(0, 200),
        address:         (data.address || '').trim().slice(0, 300),
        city:            (data.city    || '').trim().slice(0, 100),
        area:            '',
        type:            VALID_TYPES.includes(data.category) ? data.category : 'אחר',
        description:     (data.description || '').trim().slice(0, 500),
        website:         (data.website || '').trim().slice(0, 300),
        imageUrl:        (data.imageUrl || '').slice(0, 500),
        must:            !!data.must,
        visited:         false,
        booked:          false,
        duration:        2,
      };

      tx.update(tripRef, { places: [...(td.places ?? []), newPlace] });
      return newPlace;
    });

    return { place: savedPlace };
  },
);

// ── shareTrip ─────────────────────────────────────────────────────────────────

interface ShareRequest {
  tripId: string;
  email:  string;
  role:   'editor' | 'viewer';
}

interface ShareResponse {
  uid?:         string;
  displayName?: string;
  email:        string;
  pending:      boolean; // true = invite stored, user not yet in Firebase Auth
}

const SHARE_CORS = [
  'https://in1177-design.github.io',
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:4173',
];

export const shareTrip = onCall(
  { maxInstances: 5, timeoutSeconds: 15, cors: SHARE_CORS },
  async (request): Promise<ShareResponse> => {
    // 1. Auth check
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'נדרשת כניסה לחשבון.');
    }
    const callerUid = request.auth.uid;

    // 2. Validate input
    const { tripId, email, role } = request.data as ShareRequest;
    if (!tripId || typeof tripId !== 'string') throw new HttpsError('invalid-argument', 'tripId חסר.');
    if (!email  || typeof email  !== 'string') throw new HttpsError('invalid-argument', 'email חסר.');
    if (role !== 'editor' && role !== 'viewer') throw new HttpsError('invalid-argument', 'role לא תקין.');

    const emailLower = email.trim().toLowerCase();

    // 3. Verify caller is owner of the trip
    const tripRef  = db.doc(`trips/${tripId}`);
    const tripSnap = await tripRef.get();
    if (!tripSnap.exists) throw new HttpsError('not-found', 'הטיול לא נמצא.');

    const tripData = tripSnap.data() as { ownerId?: string; participants?: unknown[]; participantUids?: string[] };
    if (tripData.ownerId !== callerUid) {
      throw new HttpsError('permission-denied', 'רק בעל הטיול יכול לשתף אותו.');
    }

    // 4. Look up target user by email
    let targetUser: admin.auth.UserRecord | null = null;
    try {
      targetUser = await admin.auth().getUserByEmail(emailLower);
    } catch {
      // User not in Firebase Auth yet — store a pending invite and return early
      await db
        .collection('invites').doc(emailLower)
        .collection('trips').doc(tripId)
        .set({
          role,
          invitedBy: callerUid,
          invitedAt: Timestamp.now(),
          tripId,
          email: emailLower,
        });
      return { email: emailLower, pending: true };
    }

    const targetUid = targetUser.uid;
    if (targetUid === callerUid) throw new HttpsError('invalid-argument', 'לא ניתן לשתף עם עצמך.');

    // 5. Build participant record
    const newParticipant = {
      uid:         targetUid,
      email:       emailLower,
      displayName: targetUser.displayName ?? emailLower,
      role,
    };

    // 6. Update trip — add participant atomically
    const existingParticipants = (tripData.participants ?? []) as Array<{ uid: string }>;
    const filtered = existingParticipants.filter(p => p.uid !== targetUid);

    await tripRef.update({
      participants:    [...filtered, newParticipant],
      participantUids: FieldValue.arrayUnion(targetUid),
    });

    return {
      uid:         targetUid,
      displayName: newParticipant.displayName,
      email:       emailLower,
      pending:     false,
    };
  },
);

// ── acceptPendingInvites ──────────────────────────────────────────────────────
// Called client-side right after sign-in. Finds all pending invites for this
// user's email, adds them as participants in each trip, then deletes the invites.

export const acceptPendingInvites = onCall(
  { maxInstances: 5, timeoutSeconds: 20, cors: SHARE_CORS },
  async (request): Promise<{ accepted: number }> => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'נדרשת כניסה.');

    const uid   = request.auth.uid;
    const email = request.auth.token.email?.toLowerCase();
    if (!email) return { accepted: 0 };

    // 1. Get this user's Auth record (for displayName)
    const userRecord = await admin.auth().getUser(uid);

    // 2. Query pending invites for this email
    const inviteSnaps = await db
      .collection('invites').doc(email)
      .collection('trips')
      .get();

    if (inviteSnaps.empty) return { accepted: 0 };

    // 3. Accept each invite: add to trip participants, then delete the invite doc
    let accepted = 0;
    await Promise.all(inviteSnaps.docs.map(async snap => {
      const invite = snap.data() as { tripId: string; role: 'editor' | 'viewer' };
      const tripRef  = db.doc(`trips/${invite.tripId}`);
      const tripSnap = await tripRef.get();

      if (!tripSnap.exists) {
        await snap.ref.delete(); // stale invite — clean up
        return;
      }

      const tripData = tripSnap.data() as {
        participants?:    Array<{ uid: string }>;
        participantUids?: string[];
      };
      const existing = (tripData.participants ?? []).filter(p => p.uid !== uid);
      const newP = {
        uid,
        email,
        displayName: userRecord.displayName ?? email,
        role:        invite.role,
      };

      await tripRef.update({
        participants:    [...existing, newP],
        participantUids: FieldValue.arrayUnion(uid),
      });
      await snap.ref.delete();
      accepted++;
    }));

    return { accepted };
  },
);

// ── removeTripParticipant ─────────────────────────────────────────────────────

interface RemoveRequest {
  tripId:         string;
  participantUid: string;
}

export const removeTripParticipant = onCall(
  {
    maxInstances:   5,
    timeoutSeconds: 15,
    cors: [
      'https://in1177-design.github.io',
      'http://localhost:5173',
      'http://localhost:5174',
      'http://localhost:4173',
    ],
  },
  async (request): Promise<{ ok: true }> => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'נדרשת כניסה.');
    const callerUid = request.auth.uid;

    const { tripId, participantUid } = request.data as RemoveRequest;
    if (!tripId || !participantUid) throw new HttpsError('invalid-argument', 'פרמטרים חסרים.');

    const tripRef  = db.doc(`trips/${tripId}`);
    const tripSnap = await tripRef.get();
    if (!tripSnap.exists) throw new HttpsError('not-found', 'הטיול לא נמצא.');

    const tripData = tripSnap.data() as { ownerId?: string; participants?: Array<{ uid: string }> };

    // Only owner can remove others; a participant can remove themselves
    if (tripData.ownerId !== callerUid && callerUid !== participantUid) {
      throw new HttpsError('permission-denied', 'אין הרשאה להסיר משתתף זה.');
    }

    const updatedParticipants = (tripData.participants ?? []).filter(p => p.uid !== participantUid);

    await tripRef.update({
      participants:    updatedParticipants,
      participantUids: FieldValue.arrayRemove(participantUid),
    });

    return { ok: true };
  },
);

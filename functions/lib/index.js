"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.removeTripParticipant = exports.acceptPendingInvites = exports.shareTrip = exports.savePlaceIdea = exports.getPlaceDetails = exports.searchPlaces = exports.enrichPlace = void 0;
const admin = __importStar(require("firebase-admin"));
const https_1 = require("firebase-functions/v2/https");
const params_1 = require("firebase-functions/params");
const firestore_1 = require("firebase-admin/firestore");
// Server-side secret — never exposed to client bundle
const ANTHROPIC_KEY = (0, params_1.defineSecret)('ANTHROPIC_KEY');
admin.initializeApp();
const db = admin.firestore();
// ── Rate limiting ─────────────────────────────────────────────────────────────
const DAILY_USER_QUOTA = 20; // calls per user per day
const DAILY_GLOBAL_QUOTA = 500; // calls total per day
function todayKey() {
    return new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
}
async function checkRateLimits(uid) {
    const day = todayKey();
    // User counter
    const userRef = db.doc(`_rateLimits/users/${uid}/${day}`);
    // Global counter
    const globalRef = db.doc(`_rateLimits/global/${day}/count`);
    await db.runTransaction(async (tx) => {
        const [userSnap, globalSnap] = await Promise.all([
            tx.get(userRef),
            tx.get(globalRef),
        ]);
        const userCount = userSnap.data()?.n ?? 0;
        const globalCount = globalSnap.data()?.n ?? 0;
        if (userCount >= DAILY_USER_QUOTA) {
            throw new https_1.HttpsError('resource-exhausted', `הגעת למגבלה היומית (${DAILY_USER_QUOTA} קריאות). נסי שוב מחר.`);
        }
        if (globalCount >= DAILY_GLOBAL_QUOTA) {
            throw new https_1.HttpsError('resource-exhausted', 'המגבלה היומית הכוללת הגיעה לסיומה. נסי שוב מחר.');
        }
        tx.set(userRef, { n: firestore_1.FieldValue.increment(1), updatedAt: firestore_1.Timestamp.now() }, { merge: true });
        tx.set(globalRef, { n: firestore_1.FieldValue.increment(1), updatedAt: firestore_1.Timestamp.now() }, { merge: true });
    });
}
// ── Main function ─────────────────────────────────────────────────────────────
exports.enrichPlace = (0, https_1.onCall)({
    secrets: [ANTHROPIC_KEY],
    maxInstances: 5,
    timeoutSeconds: 30,
    memory: '256MiB',
    cors: [
        'https://in1177-design.github.io',
        'http://localhost:5173',
        'http://localhost:4173',
    ],
}, async (request) => {
    // 1. Require a real (non-anonymous) Google account
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'נדרשת כניסה לחשבון.');
    }
    const provider = request.auth.token.firebase?.sign_in_provider;
    if (provider === 'anonymous') {
        throw new https_1.HttpsError('permission-denied', 'יש להתחבר עם חשבון Google כדי להשתמש ב-AI.');
    }
    const uid = request.auth.uid;
    // 2. Validate input
    const data = request.data;
    if (!data?.placeName || typeof data.placeName !== 'string') {
        throw new https_1.HttpsError('invalid-argument', 'שדה placeName חסר.');
    }
    if (!data?.tripDestination || typeof data.tripDestination !== 'string') {
        throw new https_1.HttpsError('invalid-argument', 'שדה tripDestination חסר.');
    }
    const placeName = data.placeName.slice(0, 300).trim();
    const tripDestination = data.tripDestination.slice(0, 150).trim();
    const nameHe = typeof data.nameHe === 'string'
        ? data.nameHe.slice(0, 150).trim()
        : undefined;
    // 3. Optionally verify trip access
    if (data.tripId && typeof data.tripId === 'string') {
        const tripSnap = await db.doc(`trips/${data.tripId}`).get();
        if (!tripSnap.exists) {
            throw new https_1.HttpsError('not-found', 'הטיול לא נמצא.');
        }
        const tripData = tripSnap.data();
        const hasAccess = tripData?.ownerId === uid ||
            (tripData?.participantUids ?? []).includes(uid);
        if (!hasAccess) {
            throw new https_1.HttpsError('permission-denied', 'אין גישה לטיול זה.');
        }
    }
    // 4. Rate-limit check (atomic transaction)
    await checkRateLimits(uid);
    // 5. Call Anthropic
    const apiKey = ANTHROPIC_KEY.value();
    if (!apiKey)
        throw new https_1.HttpsError('internal', 'מפתח API חסר.');
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
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
            model: 'claude-sonnet-4-6',
            max_tokens: 600,
            messages: [{ role: 'user', content: prompt }],
        }),
    });
    if (!response.ok) {
        const errText = await response.text();
        console.error('Anthropic error:', response.status, errText);
        throw new https_1.HttpsError('internal', `שגיאת AI: ${response.status}`);
    }
    const anthropicData = await response.json();
    const text = anthropicData.content?.[0]?.text ?? '{}';
    let json;
    try {
        json = JSON.parse(text.replace(/```json|```/g, '').trim());
    }
    catch {
        console.error('Failed to parse Anthropic response:', text);
        throw new https_1.HttpsError('internal', 'שגיאה בפענוח תגובת AI.');
    }
    const VALID_TYPES = ['אטרקציה', 'מסעדה', 'קפה', 'מוזיאון', 'שוק', 'פארק', 'שכונה', 'אחר'];
    // Return only known safe fields
    return {
        nameEn: typeof json.nameEn === 'string' ? json.nameEn : undefined,
        nameHe: typeof json.nameHe === 'string' ? json.nameHe : undefined,
        city: typeof json.city === 'string' ? json.city : undefined,
        area: typeof json.area === 'string' ? json.area : undefined,
        address: typeof json.address === 'string' ? json.address : undefined,
        type: typeof json.type === 'string' && VALID_TYPES.includes(json.type)
            ? json.type : undefined,
        priceChild: typeof json.priceChild === 'number' ? json.priceChild : undefined,
        priceAdult: typeof json.priceAdult === 'number' ? json.priceAdult : undefined,
        rating: typeof json.rating === 'number' ? json.rating : undefined,
        travelTime: typeof json.travelTime === 'string' ? json.travelTime : undefined,
        description: typeof json.description === 'string' ? json.description : undefined,
        website: typeof json.website === 'string' ? json.website : undefined,
    };
});
const MOCK_PLACES = [
    // Poland — Kraków
    { providerPlaceId: 'mock_krakow_wawel', name: 'Wawel Royal Castle', nameHe: 'טירת וואוול', address: 'Wawel 5, 31-001 Kraków', category: 'אטרקציה', location: { lat: 50.0542, lng: 19.9355 }, website: 'https://wawel.krakow.pl', description: 'Medieval castle complex on Wawel Hill' },
    { providerPlaceId: 'mock_krakow_pod_aniolami', name: 'Pod Aniolami', address: 'ul. Grodzka 35, 31-001 Kraków', category: 'מסעדה', location: { lat: 50.0591, lng: 19.9382 }, description: 'Traditional Polish cuisine in a historic cellar' },
    { providerPlaceId: 'mock_krakow_old_town', name: 'Stare Miasto (Old Town)', nameHe: 'העיר העתיקה של קרקוב', address: 'Rynek Główny, Kraków', category: 'שכונה', location: { lat: 50.0614, lng: 19.9372 }, description: 'Historic city center with the main market square' },
    { providerPlaceId: 'mock_krakow_salt_mine', name: 'Wieliczka Salt Mine', nameHe: "מכרה המלח וייליצ'קה", address: 'Park Kingi 1, 32-020 Wieliczka', category: 'אטרקציה', location: { lat: 49.9838, lng: 20.0548 }, website: 'https://wieliczka-saltmine.com', description: 'UNESCO World Heritage underground salt mine' },
    { providerPlaceId: 'mock_krakow_kazimierz', name: 'Kazimierz Jewish Quarter', nameHe: 'רובע קזימייז', address: 'Kazimierz, Kraków', category: 'שכונה', location: { lat: 50.0515, lng: 19.9440 }, description: 'Historic Jewish quarter with synagogues and galleries' },
    { providerPlaceId: 'mock_krakow_market', name: 'Stary Kleparz Market', nameHe: "שוק סטארי קלפאז'", address: 'ul. Stary Kleparz, Kraków', category: 'שוק', location: { lat: 50.0671, lng: 19.9400 }, description: 'Traditional outdoor food and flower market' },
    { providerPlaceId: 'mock_krakow_hawelka', name: 'Hawelka', address: 'Rynek Główny 34, 31-010 Kraków', category: 'מסעדה', location: { lat: 50.0618, lng: 19.9378 }, website: 'https://hawelka.pl', description: 'Iconic restaurant on the Main Market Square since 1876' },
    { providerPlaceId: 'mock_krakow_cloth_hall', name: 'Cloth Hall (Sukiennice)', nameHe: 'אולם הבד', address: 'Rynek Główny 1-3, 31-042 Kraków', category: 'שוק', location: { lat: 50.0616, lng: 19.9375 }, description: 'Gothic trading hall in the center of the main square' },
    { providerPlaceId: 'mock_krakow_schindler', name: "Schindler's Factory Museum", nameHe: "מפעל שינדלר", address: 'ul. Lipowa 4, 30-702 Kraków', category: 'מוזיאון', location: { lat: 50.0474, lng: 19.9612 }, website: 'https://muzeumkrakowa.pl', description: 'Museum dedicated to WWII Kraków history' },
    // Israel
    { providerPlaceId: 'mock_tlv_carmel', name: 'Carmel Market', nameHe: 'שוק הכרמל', address: 'Shuk HaCarmel, Tel Aviv', category: 'שוק', location: { lat: 32.0653, lng: 34.7663 }, description: 'Bustling outdoor market in Tel Aviv' },
    { providerPlaceId: 'mock_tlv_jaffa', name: 'Jaffa Old City', nameHe: 'עיר עתיקה של יפו', address: 'Old Jaffa, Tel Aviv-Yafo', category: 'שכונה', location: { lat: 32.0531, lng: 34.7518 } },
    { providerPlaceId: 'mock_tlv_habasta', name: 'HaBasta', nameHe: 'הבסטה', address: 'Hashomer St 4, Tel Aviv', category: 'מסעדה', location: { lat: 32.0657, lng: 34.7690 }, description: 'Popular farm-to-table restaurant near Carmel Market' },
    // France — Paris
    { providerPlaceId: 'mock_paris_eiffel', name: 'Eiffel Tower', nameHe: 'מגדל אייפל', address: 'Champ de Mars, 5 Av. Anatole France, 75007 Paris', category: 'אטרקציה', location: { lat: 48.8584, lng: 2.2945 }, website: 'https://www.toureiffel.paris' },
    { providerPlaceId: 'mock_paris_louvre', name: 'Louvre Museum', nameHe: 'מוזיאון הלובר', address: 'Rue de Rivoli, 75001 Paris', category: 'מוזיאון', location: { lat: 48.8606, lng: 2.3376 }, website: 'https://www.louvre.fr' },
    { providerPlaceId: 'mock_paris_comptoir', name: 'Le Comptoir du Relais', address: "9 Carrefour de l'Odéon, 75006 Paris", category: 'מסעדה', location: { lat: 48.8515, lng: 2.3401 }, description: 'Classic French bistro in Saint-Germain' },
    // Italy — Rome
    { providerPlaceId: 'mock_rome_colosseum', name: 'Colosseum', nameHe: 'הקולוסיאום', address: 'Piazza del Colosseo, 1, 00184 Roma RM', category: 'אטרקציה', location: { lat: 41.8902, lng: 12.4922 }, website: 'https://www.parcocolosseo.it' },
    { providerPlaceId: 'mock_rome_vatican', name: 'Vatican Museums', nameHe: 'מוזיאוני הוותיקן', address: 'Viale Vaticano, 00165 Roma RM', category: 'מוזיאון', location: { lat: 41.9065, lng: 12.4534 } },
    { providerPlaceId: 'mock_rome_da_enzo', name: 'Da Enzo al 29', address: 'Via dei Vascellari, 29, 00153 Roma RM', category: 'מסעדה', location: { lat: 41.8879, lng: 12.4703 }, description: 'Trattoria in Trastevere neighborhood' },
    // Spain — Barcelona
    { providerPlaceId: 'mock_bcn_sagrada', name: 'Sagrada Família', nameHe: 'סגרדה פמיליה', address: 'C/ de Mallorca, 401, 08013 Barcelona', category: 'אטרקציה', location: { lat: 41.4036, lng: 2.1744 }, website: 'https://sagradafamilia.org' },
    { providerPlaceId: 'mock_bcn_boqueria', name: 'La Boqueria Market', nameHe: 'שוק לה בוקריה', address: 'La Rambla, 91, 08001 Barcelona', category: 'שוק', location: { lat: 41.3817, lng: 2.1718 }, description: 'Famous public market on La Rambla' },
    // Netherlands — Amsterdam
    { providerPlaceId: 'mock_ams_rijks', name: 'Rijksmuseum', nameHe: 'ריקסמוזיאום', address: 'Museumstraat 1, 1071 XX Amsterdam', category: 'מוזיאון', location: { lat: 52.3600, lng: 4.8852 }, website: 'https://www.rijksmuseum.nl' },
    { providerPlaceId: 'mock_ams_vondelpark', name: 'Vondelpark', nameHe: 'פארק פונדל', address: 'Vondelpark, 1071 Amsterdam', category: 'פארק', location: { lat: 52.3579, lng: 4.8687 }, description: "Amsterdam's largest and most famous park" },
    // Greece — Athens
    { providerPlaceId: 'mock_ath_acropolis', name: 'Acropolis of Athens', nameHe: 'האקרופוליס של אתונה', address: 'Acropolis, Athens 105 58, Greece', category: 'אטרקציה', location: { lat: 37.9715, lng: 23.7267 }, website: 'https://www.theacropolismuseum.gr' },
    { providerPlaceId: 'mock_ath_monastiraki', name: 'Monastiraki Flea Market', nameHe: 'שוק מונסטירקי', address: 'Platia Monastirakiou, Athina 105 55', category: 'שוק', location: { lat: 37.9762, lng: 23.7243 } },
];
function mockSearch(query) {
    const q = query.toLowerCase().trim();
    if (!q)
        return [];
    return MOCK_PLACES.filter(p => p.name.toLowerCase().includes(q) ||
        (p.nameHe && p.nameHe.includes(q)) ||
        p.address.toLowerCase().includes(q) ||
        p.category.includes(q) ||
        (p.description && p.description.toLowerCase().includes(q))).slice(0, 3);
}
function getMockById(id) {
    return MOCK_PLACES.find(p => p.providerPlaceId === id);
}
/** Verify user has at least viewer access to a trip. Returns tripData. */
async function verifyTripAccess(uid, tripId, requireEditor = false) {
    const tripSnap = await db.doc(`trips/${tripId}`).get();
    if (!tripSnap.exists)
        throw new https_1.HttpsError('not-found', 'הטיול לא נמצא.');
    const td = tripSnap.data();
    const isOwner = td.ownerId === uid;
    const participant = (td.participants ?? []).find(p => p.uid === uid);
    const hasAccess = isOwner || !!participant || (td.participantUids ?? []).includes(uid);
    if (!hasAccess)
        throw new https_1.HttpsError('permission-denied', 'אין גישה לטיול זה.');
    if (requireEditor && !isOwner && participant?.role !== 'editor') {
        throw new https_1.HttpsError('permission-denied', 'נדרשת הרשאת עריכה.');
    }
    return td;
}
const PLACES_CORS = [
    'https://in1177-design.github.io',
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:4173',
];
// ── searchPlaces ──────────────────────────────────────────────────────────────
exports.searchPlaces = (0, https_1.onCall)({ maxInstances: 10, timeoutSeconds: 10, cors: PLACES_CORS }, async (request) => {
    if (!request.auth)
        throw new https_1.HttpsError('unauthenticated', 'נדרשת כניסה.');
    const { tripId, query, city } = request.data;
    if (!tripId || !query?.trim())
        throw new https_1.HttpsError('invalid-argument', 'חסרים פרמטרים.');
    await verifyTripAccess(request.auth.uid, tripId);
    const searchTerm = [query.trim(), city?.trim()].filter(Boolean).join(' ');
    const results = mockSearch(searchTerm);
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
});
// ── getPlaceDetails ───────────────────────────────────────────────────────────
exports.getPlaceDetails = (0, https_1.onCall)({ secrets: [ANTHROPIC_KEY], maxInstances: 5, timeoutSeconds: 30, memory: '256MiB', cors: PLACES_CORS }, async (request) => {
    if (!request.auth)
        throw new https_1.HttpsError('unauthenticated', 'נדרשת כניסה.');
    if (request.auth.token.firebase?.sign_in_provider === 'anonymous') {
        throw new https_1.HttpsError('permission-denied', 'נדרשת כניסה עם חשבון Google.');
    }
    const uid = request.auth.uid;
    const { tripId, providerPlaceId } = request.data;
    if (!tripId || !providerPlaceId)
        throw new https_1.HttpsError('invalid-argument', 'חסרים פרמטרים.');
    await verifyTripAccess(uid, tripId);
    const place = getMockById(providerPlaceId);
    if (!place)
        throw new https_1.HttpsError('not-found', 'המקום לא נמצא.');
    await checkRateLimits(uid);
    const apiKey = ANTHROPIC_KEY.value();
    if (!apiKey)
        throw new https_1.HttpsError('internal', 'מפתח API חסר.');
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
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
                model: 'claude-haiku-4-5-20251001',
                max_tokens: 200,
                messages: [{ role: 'user', content: prompt }],
            }),
        });
        if (res.ok) {
            const d = await res.json();
            const text = d.content?.[0]?.text ?? '';
            const json = JSON.parse(text.replace(/```json|```/g, '').trim());
            const VALID_TYPES = ['אטרקציה', 'מסעדה', 'קפה', 'מוזיאון', 'שוק', 'פארק', 'שכונה', 'אחר'];
            if (typeof json.nameHe === 'string' && json.nameHe.trim())
                nameHe = json.nameHe.trim();
            if (typeof json.descriptionHe === 'string')
                descriptionHe = json.descriptionHe.trim();
            if (typeof json.categoryHe === 'string' && VALID_TYPES.includes(json.categoryHe)) {
                categoryHe = json.categoryHe;
            }
        }
    }
    catch { /* keep mock defaults on AI failure */ }
    return {
        providerPlaceId: place.providerPlaceId,
        name: place.name,
        nameHe,
        address: place.address,
        category: categoryHe,
        description: descriptionHe,
        website: place.website ?? null,
        imageUrls: place.imageUrls ?? [],
    };
});
exports.savePlaceIdea = (0, https_1.onCall)({ maxInstances: 10, timeoutSeconds: 15, cors: PLACES_CORS }, async (request) => {
    if (!request.auth)
        throw new https_1.HttpsError('unauthenticated', 'נדרשת כניסה.');
    const uid = request.auth.uid;
    const data = request.data;
    if (!data?.tripId || !data?.providerPlaceId || !data?.nameHe?.trim()) {
        throw new https_1.HttpsError('invalid-argument', 'חסרים פרמטרים.');
    }
    const VALID_TYPES = ['אטרקציה', 'מסעדה', 'קפה', 'מוזיאון', 'שוק', 'פארק', 'שכונה', 'אחר'];
    const tripRef = db.doc(`trips/${data.tripId}`);
    const savedPlace = await db.runTransaction(async (tx) => {
        const tripSnap = await tx.get(tripRef);
        if (!tripSnap.exists)
            throw new https_1.HttpsError('not-found', 'הטיול לא נמצא.');
        const td = tripSnap.data();
        // Verify editor access inside transaction
        const isOwner = td.ownerId === uid;
        const participant = (td.participants ?? []).find(p => p.uid === uid);
        if (!isOwner && participant?.role !== 'editor') {
            throw new https_1.HttpsError('permission-denied', 'נדרשת הרשאת עריכה.');
        }
        // Duplicate check
        if ((td.places ?? []).some(p => p.providerPlaceId === data.providerPlaceId)) {
            throw new https_1.HttpsError('already-exists', 'המקום כבר קיים בבנק הרעיונות.');
        }
        const newPlace = {
            id: db.collection('_').doc().id,
            providerPlaceId: data.providerPlaceId,
            nameHe: data.nameHe.trim().slice(0, 200),
            nameEn: (data.nameEn || '').trim().slice(0, 200),
            address: (data.address || '').trim().slice(0, 300),
            city: (data.city || '').trim().slice(0, 100),
            area: '',
            type: VALID_TYPES.includes(data.category) ? data.category : 'אחר',
            description: (data.description || '').trim().slice(0, 500),
            website: (data.website || '').trim().slice(0, 300),
            imageUrl: (data.imageUrl || '').slice(0, 500),
            must: !!data.must,
            visited: false,
            booked: false,
            duration: 2,
        };
        tx.update(tripRef, { places: [...(td.places ?? []), newPlace] });
        return newPlace;
    });
    return { place: savedPlace };
});
const SHARE_CORS = [
    'https://in1177-design.github.io',
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:4173',
];
exports.shareTrip = (0, https_1.onCall)({ maxInstances: 5, timeoutSeconds: 15, cors: SHARE_CORS }, async (request) => {
    // 1. Auth check
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'נדרשת כניסה לחשבון.');
    }
    const callerUid = request.auth.uid;
    // 2. Validate input
    const { tripId, email, role } = request.data;
    if (!tripId || typeof tripId !== 'string')
        throw new https_1.HttpsError('invalid-argument', 'tripId חסר.');
    if (!email || typeof email !== 'string')
        throw new https_1.HttpsError('invalid-argument', 'email חסר.');
    if (role !== 'editor' && role !== 'viewer')
        throw new https_1.HttpsError('invalid-argument', 'role לא תקין.');
    const emailLower = email.trim().toLowerCase();
    // 3. Verify caller is owner of the trip
    const tripRef = db.doc(`trips/${tripId}`);
    const tripSnap = await tripRef.get();
    if (!tripSnap.exists)
        throw new https_1.HttpsError('not-found', 'הטיול לא נמצא.');
    const tripData = tripSnap.data();
    if (tripData.ownerId !== callerUid) {
        throw new https_1.HttpsError('permission-denied', 'רק בעל הטיול יכול לשתף אותו.');
    }
    // 4. Look up target user by email
    let targetUser = null;
    try {
        targetUser = await admin.auth().getUserByEmail(emailLower);
    }
    catch {
        // User not in Firebase Auth yet — store a pending invite and return early
        await db
            .collection('invites').doc(emailLower)
            .collection('trips').doc(tripId)
            .set({
            role,
            invitedBy: callerUid,
            invitedAt: firestore_1.Timestamp.now(),
            tripId,
            email: emailLower,
        });
        return { email: emailLower, pending: true };
    }
    const targetUid = targetUser.uid;
    if (targetUid === callerUid)
        throw new https_1.HttpsError('invalid-argument', 'לא ניתן לשתף עם עצמך.');
    // 5. Build participant record
    const newParticipant = {
        uid: targetUid,
        email: emailLower,
        displayName: targetUser.displayName ?? emailLower,
        role,
    };
    // 6. Update trip — add participant atomically
    const existingParticipants = (tripData.participants ?? []);
    const filtered = existingParticipants.filter(p => p.uid !== targetUid);
    await tripRef.update({
        participants: [...filtered, newParticipant],
        participantUids: firestore_1.FieldValue.arrayUnion(targetUid),
    });
    return {
        uid: targetUid,
        displayName: newParticipant.displayName,
        email: emailLower,
        pending: false,
    };
});
// ── acceptPendingInvites ──────────────────────────────────────────────────────
// Called client-side right after sign-in. Finds all pending invites for this
// user's email, adds them as participants in each trip, then deletes the invites.
exports.acceptPendingInvites = (0, https_1.onCall)({ maxInstances: 5, timeoutSeconds: 20, cors: SHARE_CORS }, async (request) => {
    if (!request.auth)
        throw new https_1.HttpsError('unauthenticated', 'נדרשת כניסה.');
    const uid = request.auth.uid;
    const email = request.auth.token.email?.toLowerCase();
    if (!email)
        return { accepted: 0 };
    // 1. Get this user's Auth record (for displayName)
    const userRecord = await admin.auth().getUser(uid);
    // 2. Query pending invites for this email
    const inviteSnaps = await db
        .collection('invites').doc(email)
        .collection('trips')
        .get();
    if (inviteSnaps.empty)
        return { accepted: 0 };
    // 3. Accept each invite: add to trip participants, then delete the invite doc
    let accepted = 0;
    await Promise.all(inviteSnaps.docs.map(async (snap) => {
        const invite = snap.data();
        const tripRef = db.doc(`trips/${invite.tripId}`);
        const tripSnap = await tripRef.get();
        if (!tripSnap.exists) {
            await snap.ref.delete(); // stale invite — clean up
            return;
        }
        const tripData = tripSnap.data();
        const existing = (tripData.participants ?? []).filter(p => p.uid !== uid);
        const newP = {
            uid,
            email,
            displayName: userRecord.displayName ?? email,
            role: invite.role,
        };
        await tripRef.update({
            participants: [...existing, newP],
            participantUids: firestore_1.FieldValue.arrayUnion(uid),
        });
        await snap.ref.delete();
        accepted++;
    }));
    return { accepted };
});
exports.removeTripParticipant = (0, https_1.onCall)({
    maxInstances: 5,
    timeoutSeconds: 15,
    cors: [
        'https://in1177-design.github.io',
        'http://localhost:5173',
        'http://localhost:5174',
        'http://localhost:4173',
    ],
}, async (request) => {
    if (!request.auth)
        throw new https_1.HttpsError('unauthenticated', 'נדרשת כניסה.');
    const callerUid = request.auth.uid;
    const { tripId, participantUid } = request.data;
    if (!tripId || !participantUid)
        throw new https_1.HttpsError('invalid-argument', 'פרמטרים חסרים.');
    const tripRef = db.doc(`trips/${tripId}`);
    const tripSnap = await tripRef.get();
    if (!tripSnap.exists)
        throw new https_1.HttpsError('not-found', 'הטיול לא נמצא.');
    const tripData = tripSnap.data();
    // Only owner can remove others; a participant can remove themselves
    if (tripData.ownerId !== callerUid && callerUid !== participantUid) {
        throw new https_1.HttpsError('permission-denied', 'אין הרשאה להסיר משתתף זה.');
    }
    const updatedParticipants = (tripData.participants ?? []).filter(p => p.uid !== participantUid);
    await tripRef.update({
        participants: updatedParticipants,
        participantUids: firestore_1.FieldValue.arrayRemove(participantUid),
    });
    return { ok: true };
});
//# sourceMappingURL=index.js.map
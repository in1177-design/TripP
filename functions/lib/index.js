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
// Server-side secrets — never exposed to client bundle
const ANTHROPIC_KEY = (0, params_1.defineSecret)('ANTHROPIC_KEY');
const GOOGLE_PLACES_KEY = (0, params_1.defineSecret)('GOOGLE_PLACES_KEY');
admin.initializeApp();
const db = admin.firestore();
// ── Rate limiting ─────────────────────────────────────────────────────────────
const DAILY_USER_QUOTA = 50; // calls per user per day (Claude AI only)
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
// ── Place Search — Google Places (New) ───────────────────────────────────────
/** Map Google place types array to a single Hebrew category label */
function mapGoogleTypesToCategory(types) {
    for (const t of types) {
        if (['restaurant', 'food', 'meal_takeaway', 'meal_delivery'].includes(t))
            return 'מסעדה';
        if (['cafe', 'bakery', 'coffee_shop'].includes(t))
            return 'קפה';
        if (['museum'].includes(t))
            return 'מוזיאון';
        if (['park', 'national_park', 'nature_reserve', 'campground', 'natural_feature'].includes(t))
            return 'פארק';
        if (['market', 'supermarket', 'shopping_mall', 'clothing_store', 'store', 'department_store'].includes(t))
            return 'שוק';
        if (['tourist_attraction', 'point_of_interest', 'amusement_park',
            'church', 'synagogue', 'mosque', 'place_of_worship',
            'stadium', 'castle', 'aquarium', 'zoo', 'art_gallery'].includes(t))
            return 'אטרקציה';
        if (['sublocality', 'neighborhood', 'locality'].includes(t))
            return 'שכונה';
    }
    return 'אחר';
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
exports.searchPlaces = (0, https_1.onCall)({ secrets: [GOOGLE_PLACES_KEY], maxInstances: 10, timeoutSeconds: 15, cors: PLACES_CORS }, async (request) => {
    if (!request.auth)
        throw new https_1.HttpsError('unauthenticated', 'נדרשת כניסה.');
    const { tripId, query } = request.data;
    if (!tripId || !query?.trim())
        throw new https_1.HttpsError('invalid-argument', 'חסרים פרמטרים.');
    const trip = await verifyTripAccess(request.auth.uid, tripId);
    const destination = trip.destination ?? '';
    const apiKey = GOOGLE_PLACES_KEY.value().trim();
    if (!apiKey)
        throw new https_1.HttpsError('internal', 'מפתח Google Places חסר.');
    console.log('PLACES_KEY length:', apiKey.length, 'prefix:', apiKey.slice(0, 8));
    // Append destination to focus results on the right city/country
    const searchQuery = destination ? `${query.trim()} ${destination}` : query.trim();
    const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': apiKey,
            'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.types,places.rating,places.photos,places.location',
        },
        body: JSON.stringify({
            textQuery: searchQuery,
            languageCode: 'he',
            maxResultCount: 5,
        }),
    });
    if (!res.ok) {
        const errText = await res.text();
        console.error('Google Places searchText error:', res.status, errText);
        throw new https_1.HttpsError('internal', `שגיאת Google Places: ${res.status}`);
    }
    const data = await res.json();
    const places = data.places ?? [];
    return {
        requestId: String(Date.now()),
        results: places.map(p => ({
            providerPlaceId: p.id,
            name: p.displayName?.text ?? '',
            address: p.formattedAddress ?? '',
            category: mapGoogleTypesToCategory(p.types ?? []),
            location: p.location
                ? { lat: p.location.latitude, lng: p.location.longitude }
                : undefined,
            photoReference: p.photos?.[0]?.name ?? null,
        })),
    };
});
// ── getPlaceDetails ───────────────────────────────────────────────────────────
exports.getPlaceDetails = (0, https_1.onCall)({
    secrets: [ANTHROPIC_KEY, GOOGLE_PLACES_KEY],
    maxInstances: 5,
    timeoutSeconds: 30,
    memory: '256MiB',
    cors: PLACES_CORS,
}, async (request) => {
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
    // No rate limit here — Google Places API is billed by Google, not Anthropic
    const googleKey = GOOGLE_PLACES_KEY.value().trim();
    if (!googleKey)
        throw new https_1.HttpsError('internal', 'מפתח Google Places חסר.');
    // 1. Fetch place details from Google Places (New) API
    const detailsRes = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(providerPlaceId)}?languageCode=he`, {
        headers: {
            'X-Goog-Api-Key': googleKey,
            'X-Goog-FieldMask': 'id,displayName,formattedAddress,types,rating,photos,websiteUri,editorialSummary,location',
        },
    });
    if (!detailsRes.ok) {
        const errText = await detailsRes.text();
        console.error('Google Places details error:', detailsRes.status, errText);
        throw new https_1.HttpsError('internal', `שגיאת Google Places: ${detailsRes.status}`);
    }
    const place = await detailsRes.json();
    // 2. Fetch photo URL (server-side only — keeps API key off the client)
    let imageUrl = '';
    if (place.photos?.[0]?.name) {
        try {
            const photoRes = await fetch(`https://places.googleapis.com/v1/${place.photos[0].name}/media?key=${googleKey}&maxWidthPx=600&skipHttpRedirect=true`);
            if (photoRes.ok) {
                const photoData = await photoRes.json();
                imageUrl = photoData.photoUri ?? '';
            }
        }
        catch { /* continue without photo */ }
    }
    const name = place.displayName?.text ?? providerPlaceId;
    const category = mapGoogleTypesToCategory(place.types ?? []);
    const descEn = place.editorialSummary?.text ?? '';
    // 3. Ask Claude (Haiku) for Hebrew name + description
    let nameHe = name;
    let descriptionHe = descEn;
    const anthropicKey = ANTHROPIC_KEY.value();
    if (anthropicKey) {
        try {
            const prompt = `מקום: "${name}" (קטגוריה: ${category}), כתובת: ${place.formattedAddress ?? ''}.${descEn ? ` תיאור: ${descEn}` : ''}

החזר JSON בלבד (ללא טקסט נוסף):
{
  "nameHe": "שם קצר ומדויק בעברית",
  "descriptionHe": "תיאור קצר בעברית, משפט אחד"
}`;
            const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': anthropicKey,
                    'anthropic-version': '2023-06-01',
                },
                body: JSON.stringify({
                    model: 'claude-haiku-4-5-20251001',
                    max_tokens: 150,
                    messages: [{ role: 'user', content: prompt }],
                }),
            });
            if (aiRes.ok) {
                const d = await aiRes.json();
                const text = d.content?.[0]?.text ?? '';
                const json = JSON.parse(text.replace(/```json|```/g, '').trim());
                if (typeof json.nameHe === 'string' && json.nameHe.trim())
                    nameHe = json.nameHe.trim();
                if (typeof json.descriptionHe === 'string' && json.descriptionHe.trim())
                    descriptionHe = json.descriptionHe.trim();
            }
        }
        catch { /* keep Google defaults */ }
    }
    return {
        providerPlaceId: place.id,
        name,
        nameHe,
        address: place.formattedAddress ?? '',
        category,
        description: descriptionHe,
        website: place.websiteUri ?? null,
        imageUrls: imageUrl ? [imageUrl] : [],
        rating: place.rating ?? null,
        location: place.location
            ? { lat: place.location.latitude, lng: place.location.longitude }
            : null,
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
    // 3. Accept each invite atomically: add participant + delete invite in one transaction.
    //    Using a transaction prevents duplicate entries if the function runs twice.
    let accepted = 0;
    await Promise.all(inviteSnaps.docs.map(async (snap) => {
        const invite = snap.data();
        // Extra validation: invite email must match the signed-in user's verified email
        if (invite.email && invite.email.toLowerCase() !== email.toLowerCase()) {
            console.warn('acceptPendingInvites: email mismatch, skipping', invite.email, email);
            return;
        }
        const tripRef = db.doc(`trips/${invite.tripId}`);
        try {
            await db.runTransaction(async (tx) => {
                const [tripSnap, inviteSnap] = await Promise.all([
                    tx.get(tripRef),
                    tx.get(snap.ref),
                ]);
                // Invite already processed (idempotency)
                if (!inviteSnap.exists)
                    return;
                if (!tripSnap.exists) {
                    tx.delete(snap.ref); // stale invite — clean up
                    return;
                }
                const tripData = tripSnap.data();
                // Idempotent: skip if already a participant
                const alreadyParticipant = (tripData.participantUids ?? []).includes(uid);
                const existing = (tripData.participants ?? []).filter(p => p.uid !== uid);
                const newP = {
                    uid,
                    email,
                    displayName: userRecord.displayName ?? email,
                    role: invite.role,
                };
                tx.update(tripRef, {
                    participants: [...existing, newP],
                    participantUids: firestore_1.FieldValue.arrayUnion(uid),
                });
                tx.delete(snap.ref);
                if (!alreadyParticipant)
                    accepted++;
            });
        }
        catch (txErr) {
            console.error('acceptPendingInvites transaction failed for trip', invite.tripId, txErr);
            // Don't rethrow — try remaining invites
        }
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
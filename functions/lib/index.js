"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.enrichPlace = void 0;
const admin = require("firebase-admin");
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
        var _a, _b, _c, _d;
        const [userSnap, globalSnap] = await Promise.all([
            tx.get(userRef),
            tx.get(globalRef),
        ]);
        const userCount = (_b = (_a = userSnap.data()) === null || _a === void 0 ? void 0 : _a.n) !== null && _b !== void 0 ? _b : 0;
        const globalCount = (_d = (_c = globalSnap.data()) === null || _c === void 0 ? void 0 : _c.n) !== null && _d !== void 0 ? _d : 0;
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
    var _a, _b, _c, _d, _e;
    // 1. Require a real (non-anonymous) Google account
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'נדרשת כניסה לחשבון.');
    }
    const provider = (_a = request.auth.token.firebase) === null || _a === void 0 ? void 0 : _a.sign_in_provider;
    if (provider === 'anonymous') {
        throw new https_1.HttpsError('permission-denied', 'יש להתחבר עם חשבון Google כדי להשתמש ב-AI.');
    }
    const uid = request.auth.uid;
    // 2. Validate input
    const data = request.data;
    if (!(data === null || data === void 0 ? void 0 : data.placeName) || typeof data.placeName !== 'string') {
        throw new https_1.HttpsError('invalid-argument', 'שדה placeName חסר.');
    }
    if (!(data === null || data === void 0 ? void 0 : data.tripDestination) || typeof data.tripDestination !== 'string') {
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
        const hasAccess = (tripData === null || tripData === void 0 ? void 0 : tripData.ownerId) === uid ||
            ((_b = tripData === null || tripData === void 0 ? void 0 : tripData.participantUids) !== null && _b !== void 0 ? _b : []).includes(uid);
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
    const text = (_e = (_d = (_c = anthropicData.content) === null || _c === void 0 ? void 0 : _c[0]) === null || _d === void 0 ? void 0 : _d.text) !== null && _e !== void 0 ? _e : '{}';
    let json;
    try {
        json = JSON.parse(text.replace(/```json|```/g, '').trim());
    }
    catch (_f) {
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
//# sourceMappingURL=index.js.map
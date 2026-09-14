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
exports.removeTripParticipant = exports.acceptPendingInvites = exports.shareTrip = exports.enrichPlace = void 0;
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
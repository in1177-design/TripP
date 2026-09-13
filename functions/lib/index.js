"use strict";
/**
 * Firebase Cloud Function — AI place enrichment proxy.
 *
 * Keeps the Anthropic API key server-side.
 * Requires a valid Firebase Auth token (anonymous or real user).
 * Rate-limited by Firebase (maxInstances) and by Anthropic quotas.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.enrichPlace = void 0;
const https_1 = require("firebase-functions/v2/https");
const params_1 = require("firebase-functions/params");
const app_1 = require("firebase-admin/app");
(0, app_1.initializeApp)();
const anthropicKey = (0, params_1.defineSecret)('ANTHROPIC_KEY');
const ALLOWED_TYPES = [
    'אטרקציה', 'מסעדה', 'קפה', 'מוזיאון', 'שוק', 'פארק', 'שכונה', 'אחר',
];
exports.enrichPlace = (0, https_1.onCall)({
    region: 'us-central1',
    secrets: [anthropicKey],
    maxInstances: 5, // hard cap on concurrent invocations
    timeoutSeconds: 30,
    memory: '256MiB',
    // Only allow requests from the deployed origin and local dev.
    // This is defence-in-depth; auth token validation is the primary gate.
    cors: [
        'https://in1177-design.github.io',
        'http://localhost:5173',
        'http://localhost:4173',
    ],
}, async (request) => {
    // ── 1. Require Firebase Auth (anonymous sign-in is accepted) ──────
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'Authentication required');
    }
    // ── 2. Validate and sanitise inputs ──────────────────────────────
    const { placeName, tripDestination, nameHe } = request.data;
    if (typeof placeName !== 'string' ||
        !placeName.trim() ||
        placeName.length > 300) {
        throw new https_1.HttpsError('invalid-argument', 'Invalid place name');
    }
    if (typeof tripDestination !== 'string' ||
        !tripDestination.trim() ||
        tripDestination.length > 150) {
        throw new https_1.HttpsError('invalid-argument', 'Invalid destination');
    }
    if (nameHe !== undefined &&
        (typeof nameHe !== 'string' || nameHe.length > 300)) {
        throw new https_1.HttpsError('invalid-argument', 'Invalid nameHe');
    }
    const safeName = placeName.trim().slice(0, 300);
    const safeDest = tripDestination.trim().slice(0, 150);
    const safeNameHe = nameHe?.trim().slice(0, 300);
    // ── 3. Build prompt server-side (never constructed by the client) ─
    const prompt = `אתה עוזר לתכנן טיול ל${safeDest}.\n` +
        `המשתמש מוסיף מקום בשם: "${safeName}"` +
        (safeNameHe && safeNameHe !== safeName ? ` (${safeNameHe})` : '') +
        `\n\nחשוב: המקום חייב להיות ממוקם ב${safeDest} או באזורה.\n` +
        `ענה על מה שאתה יודע. החזר JSON בלבד (ללא טקסט נוסף).\n` +
        `{\n` +
        `  "nameEn": "שם באנגלית",\n` +
        `  "nameHe": "שם בעברית",\n` +
        `  "city": "שם העיר בעברית (חייב להיות עיר ב${safeDest})",\n` +
        `  "area": "שכונה או אזור או null",\n` +
        `  "address": "כתובת רחוב מלאה או null",\n` +
        `  "type": "אחד מ: ${ALLOWED_TYPES.join(', ')}",\n` +
        `  "priceChild": מחיר ילד (מספר) או null,\n` +
        `  "priceAdult": מחיר מבוגר (מספר) או null,\n` +
        `  "rating": דירוג 1–5 (מספר) או null,\n` +
        `  "travelTime": "זמן נסיעה ממרכז העיר או null",\n` +
        `  "description": "תיאור קצר בעברית, משפט אחד",\n` +
        `  "website": "URL רלוונטי או null"\n` +
        `}`;
    // ── 4. Call Anthropic (key never leaves the server) ───────────────
    const apiKey = anthropicKey.value();
    if (!apiKey) {
        throw new https_1.HttpsError('internal', 'Service not configured');
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25000);
    let anthropicRes;
    try {
        anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            signal: controller.signal,
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
                // No 'anthropic-dangerous-direct-browser-access' — server-side is fine
            },
            body: JSON.stringify({
                model: 'claude-haiku-4-5-20251001',
                max_tokens: 600,
                messages: [{ role: 'user', content: prompt }],
            }),
        });
    }
    finally {
        clearTimeout(timer);
    }
    if (!anthropicRes.ok) {
        // Log internally but never expose raw upstream error to the client
        console.error(`Anthropic error ${anthropicRes.status} for uid=${request.auth.uid}`);
        throw new https_1.HttpsError('internal', 'AI service error');
    }
    // ── 5. Parse and strictly type-check the AI response ─────────────
    const body = (await anthropicRes.json());
    const rawText = body.content?.[0]?.text ?? '{}';
    let parsed;
    try {
        parsed = JSON.parse(rawText.replace(/```json|```/g, '').trim());
    }
    catch {
        throw new https_1.HttpsError('internal', 'Unexpected AI response format');
    }
    // Return only explicitly typed, validated fields
    const result = {};
    if (typeof parsed.nameEn === 'string')
        result.nameEn = parsed.nameEn;
    if (typeof parsed.nameHe === 'string')
        result.nameHe = parsed.nameHe;
    if (typeof parsed.city === 'string')
        result.city = parsed.city;
    if (typeof parsed.area === 'string')
        result.area = parsed.area;
    if (typeof parsed.address === 'string')
        result.address = parsed.address;
    if (ALLOWED_TYPES.includes(parsed.type))
        result.type = parsed.type;
    if (typeof parsed.priceChild === 'number' && parsed.priceChild >= 0)
        result.priceChild = parsed.priceChild;
    if (typeof parsed.priceAdult === 'number' && parsed.priceAdult >= 0)
        result.priceAdult = parsed.priceAdult;
    if (typeof parsed.rating === 'number' &&
        parsed.rating >= 1 &&
        parsed.rating <= 5)
        result.rating = parsed.rating;
    if (typeof parsed.travelTime === 'string')
        result.travelTime = parsed.travelTime;
    if (typeof parsed.description === 'string')
        result.description = parsed.description;
    if (typeof parsed.website === 'string')
        result.website = parsed.website;
    return result;
});
//# sourceMappingURL=index.js.map
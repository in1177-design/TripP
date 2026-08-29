/**
 * ייבוא מסלול פולין 2026 מקובץ poland-trip_1.html
 * מעדכן את הטיול הקיים poland-2024 עם:
 * - תאריכים נכונים (ספטמבר 2026)
 * - פרטי טיסות
 * - פרטי לינה
 * - מסלול יומי (פעילויות, ארוחות, רכב)
 * - בסיס לכל יום (קרקוב / זקופנה / נסיעה)
 */
import { db } from './firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { stripUndefined } from './db';
import type { Trip, Flight, Stay, ItineraryItem } from './types';

const TRIP_ID = 'poland-2024';

const FLIGHTS: Flight[] = [
  {
    id: 'f-w6-2098-out',
    dir: 'out',
    flightNo: 'W6 2098',
    from: 'TLV',
    to: 'KRK',
    date: '2026-09-15',
    dep: '11:05',
    arr: '13:50',
  },
  {
    id: 'f-w6-2097-back',
    dir: 'back',
    flightNo: 'W6 2097',
    from: 'KRK',
    to: 'TLV',
    date: '2026-09-27',
    dep: '05:40',
    arr: '10:10',
  },
];

const STAYS: Stay[] = [
  {
    id: 'stay-krk1',
    name: 'Metropolis Old Town Apartments — קראקוב',
    checkIn: '2026-09-15',
    checkOut: '2026-09-19',
    cost: 2312,
    currency: 'PLN',
    status: 'planned',
    address: 'Krowoderska 40B, 31-142 Kraków, Poland',
    notes:
      'דירת 2 חדרי שינה. העיר העתיקה, קרקוב. אישור #5920704465, קוד PIN 2890. ' +
      'סה״כ 2,312 zł, טרם שולם. ' +
      'לב שימו: בהזמנה מבוקש צ׳ק-אין מאוחר 00:00–01:00 — זה נשאר מלפני שינוי שעת הטיסה; ' +
      'עכשיו נוחתים ב-13:50, כדאי לעדכן/לבטל את הבקשה מול הנכס.',
  },
  {
    id: 'stay-zak1',
    name: 'Domek Rumcajsówka — זקופנה / Ząb',
    checkIn: '2026-09-19',
    checkOut: '2026-09-24',
    cost: 2480,
    currency: 'PLN',
    status: 'planned',
    address: 'Szlak Papieski 352, 34-521 Ząb, Poland',
    notes:
      'בית עם חדר שינה אחד (כ-5 ק"מ מזקופנה). ' +
      'אישור #5938686356, קוד PIN 7967. סה״כ 2,480 zł, טרם שולם.',
  },
  {
    id: 'stay-zator1',
    name: 'לינה באזור זאטור',
    checkIn: '2026-09-24',
    checkOut: '2026-09-25',
    cost: 0,
    currency: 'PLN',
    status: 'planned',
    notes: 'המקום הספציפי טרם נבחר/הוזמן.',
  },
];

const ITINERARY: ItineraryItem[] = [
  {
    id: 'it-flights-cost',
    date: '2026-09-15',
    type: 'flight',
    name: 'טיסות Wizz Air הלוך ושוב — כל המשפחה',
    cost: 915.12,
    currency: 'EUR',
    status: 'paid',
    notes: 'קוד הזמנה KNIB8G',
  },
  {
    id: 'it-car-pickup-0919',
    date: '2026-09-19',
    type: 'car',
    name: 'איסוף רכב שכור',
    cost: 0,
    currency: 'PLN',
    status: 'planned',
    notes:
      'טרם הוזמן. נדרש לפני היציאה לזקופנה — התוכנית היא הליכה ברגל בקרקוב, ' +
      'אבל רכב לאזור זקופנה/טטרה. לתכנן הזמנה ואיסוף בקרקוב.',
  },
  {
    id: 'it-siwydym-0919',
    date: '2026-09-19',
    type: 'food',
    slot: 'lunch',
    name: 'Siwy Dym — עצירת צהריים בדרך לזקופנה (אופציה א)',
    cost: 0,
    currency: 'PLN',
    status: 'planned',
    address: 'Jana Kilińskiego 54a, 34-700 Rabka-Zdrój, Poland',
    notes:
      'בדיוק באמצע הדרך קרקוב–זקופנה, ברבקה-זדרוי. ' +
      'מסעדה מעולה וזולה, מוגדרת כעצירת חובה. ' +
      'זו ואופציה ב (Bacówka u Jacka) הן שתי אלטרנטיבות — לבחור אחת.',
  },
  {
    id: 'it-bacowka-0919',
    date: '2026-09-19',
    type: 'food',
    name: 'Bacówka u Jacka — עצירה קצרה בדרך (אופציה ב)',
    cost: 0,
    currency: 'PLN',
    status: 'planned',
    notes:
      'בקתת רועים אותנטית — גבינת אוסצ׳יפק צלויה על אש פתוחה. ' +
      'יותר חטיף/עצירה קצרה מאשר ארוחה מלאה. ' +
      'זו ו-Siwy Dym הן שתי אלטרנטיבות — לבחור אחת.',
  },
  {
    id: 'it-energylandia-0924',
    date: '2026-09-24',
    type: 'activity',
    name: 'Energylandia — פארק שעשועים בזאטור',
    time: '10:00',
    cost: 0,
    currency: 'PLN',
    status: 'planned',
    address: 'aleja 3 Maja 2, 32-640 Zator, Poland',
    notes:
      'יציאה מזקופנה בבוקר, כ-2 שעות נסיעה (110 ק"מ). ' +
      'יום הביקור בפארק גמיש — 24/09 או 25/09 לפי מזג האוויר. ' +
      'שעות פתיחה בספטמבר בד"כ 10:00–18:00. מתאים לגילאי 9 ו-12.',
  },
  {
    id: 'it-car-return-0925',
    date: '2026-09-25',
    type: 'car',
    name: 'החזרת רכב שכור',
    cost: 0,
    currency: 'PLN',
    status: 'planned',
    notes:
      'מגיעים לקרקוב בערב ה-25/09 (אחרי לינה בזאטור). ' +
      'להחזיר את הרכב אז. מכאן והלאה שוב הליכה ברגל. ' +
      'לוודא שעות פתיחה של דלפק ההשכרה.',
  },
  {
    id: 'it-airport-dep-0927',
    date: '2026-09-27',
    type: 'other',
    name: 'יציאה לשדה התעופה קרקוב',
    time: '02:30',
    cost: 0,
    currency: 'PLN',
    status: 'planned',
    address: 'ul. kpt. M. Medweckiego 1, 32-083 Balice, Poland',
    notes:
      'טיסה ב-05:40, מומלץ להגיע כ-3 שעות מראש. ' +
      'אין רכב (הוחזר ב-25/09) — לתכנן מונית/הסעה. ' +
      'לעדכן שעה בהתאם למקום הלינה בפועל.',
  },
];

const DAY_BASES: Record<string, string> = {
  '2026-09-15': 'קרקוב',
  '2026-09-16': 'קרקוב',
  '2026-09-17': 'קרקוב',
  '2026-09-18': 'קרקוב',
  '2026-09-19': 'זקופנה',
  '2026-09-20': 'זקופנה',
  '2026-09-21': 'זקופנה',
  '2026-09-22': 'זקופנה',
  '2026-09-23': 'זקופנה',
  '2026-09-24': 'נסיעה',
  '2026-09-25': 'קרקוב',
  '2026-09-26': 'קרקוב',
  '2026-09-27': 'קרקוב',
};

export async function importPolandItinerary(): Promise<void> {
  const ref = doc(db, 'trips', TRIP_ID);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    alert('לא נמצא טיול פולין. ייבא קודם את הטיול עם כפתור "ייבא פולין".');
    return;
  }

  const existing = snap.data() as Trip;

  const updated: Trip = {
    ...existing,
    destination: 'פולין — קראקוב וזקופנה 2026',
    startDate: '2026-09-15',
    endDate: '2026-09-27',
    travelers: 4,
    flights: FLIGHTS,
    stays: STAYS,
    itinerary: ITINERARY,
    dayBases: DAY_BASES,
  };

  await setDoc(ref, stripUndefined(updated));
  alert('✅ מסלול פולין 2026 יובא בהצלחה!\nטיסות, לינות, ומסלול יומי עודכנו.');
}

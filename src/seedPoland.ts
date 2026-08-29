import { db } from './firebase';
import { doc, setDoc } from 'firebase/firestore';
import type { Trip, Place } from './types';

function id() { return Date.now().toString(36) + Math.random().toString(36).slice(2); }

const places: Omit<Place, 'id'>[] = [
  // קראקוב — אטרקציות
  { nameHe: 'רינק גלובני וסוקייניצה', nameEn: 'Rynek Główny & Sukiennice', city: 'קראקוב', area: 'עיר עתיקה', type: 'אטרקציה', must: true, visited: false, booked: false, description: 'אחת הכיכרות הגדולות באירופה. אולם האריגים וצריח בזיליקת מריה.', duration: 2 },
  { nameHe: 'טירת ואוול ומאורת הדרקון', nameEn: 'Wawel Castle', city: 'קראקוב', area: 'ואוול', type: 'אטרקציה', must: true, visited: false, booked: false, description: 'מושבם ההיסטורי של מלכי פולין, נוף לנהר וויסלה. למרגלות — מערה עם פסל דרקון נושף אש.', duration: 2 },
  { nameHe: "קז'ימייז'", nameEn: 'Kazimierz', city: 'קראקוב', area: "קז'ימייז'", type: 'שכונה', must: true, visited: false, booked: false, description: 'הרובע היהודי ההיסטורי — בית הכנסת הישנה, רמ"א ובית העלמין. פלאץ נובי עם זפייקנקה.', duration: 4 },
  { nameHe: 'מוזיאון מפעל שינדלר', nameEn: "Schindler's Factory Museum", city: 'קראקוב', area: 'פודגורז\'ה', type: 'מוזיאון', must: true, visited: false, booked: false, description: 'תערוכה אינטראקטיבית על קרקוב תחת הכיבוש הנאצי.', duration: 2 },
  { nameHe: 'מכרות המלח וייליצ\'קה', nameEn: 'Wieliczka Salt Mine', city: 'וייליצ\'קה', area: '', type: 'אטרקציה', must: true, visited: false, booked: false, description: 'אתר מורשת עולמית של אונסק"ו. מסלול כ-3 שעות, קפלת סנטה קינגה המפוארת.', travelTime: '30 דק\'', duration: 3 },
  { nameHe: 'פארק פלנטי / פארק יורדן', nameEn: 'Planty Park / Jordan Park', city: 'קראקוב', area: 'עיר עתיקה', type: 'פארק', must: false, visited: false, booked: false, description: 'פלנטי — הטבעת הירוקה סביב העיר. יורדן — משחקייה גדולה לילדים.', duration: 1 },
  { nameHe: 'טיילת לאורך הוויסלה', nameEn: 'Vistula Riverbank', city: 'קראקוב', area: 'ואוול', type: 'פארק', must: false, visited: false, booked: false, description: 'שביל נעים למרגלות טירת ואוול, אפשר גם שיט קצר בנהר.', duration: 1.5 },
  { nameHe: 'מוזיאון הפינבול והארקייד', nameEn: 'Pinball & Arcade Museum', city: 'קראקוב', area: 'עיר עתיקה', type: 'מוזיאון', must: false, visited: false, booked: false, description: 'משחק חופשי ללא הגבלת זמן במכונות פינבול וארקייד היסטוריות.', duration: 2 },
  { nameHe: 'Ciuciu – מפעל סוכריות', nameEn: 'Ciuciu Candy Factory', city: 'קראקוב', area: 'עיר עתיקה', type: 'אטרקציה', must: false, visited: false, booked: false, description: 'הדגמת הכנת סוכריות בעבודת יד על מקל. חוויה קצרה וצבעונית.', duration: 0.5 },
  { nameHe: 'גן החיות של קרקוב', nameEn: 'Kraków Zoo', city: 'קראקוב', area: '', type: 'אטרקציה', must: false, visited: false, booked: false, description: 'ממוקם בתוך יער, כולל פינת ליטוף והאכלת חיות. כניסת משפחה כ-66 ש"ח.', duration: 4, priceAdult: 30, priceChild: 20 },
  { nameHe: 'מוזיאון התעופה הפולני', nameEn: 'Polish Aviation Museum', city: 'קראקוב', area: '', type: 'מוזיאון', must: false, visited: false, booked: false, description: 'מטוסים, מסוקים וטילים מכל התקופות. כניסת משפחה כ-35 ש"ח.', duration: 2, priceAdult: 20, priceChild: 10 },
  { nameHe: 'Aqua Park Kraków', nameEn: 'Aqua Park Kraków', city: 'קראקוב', area: '', type: 'אטרקציה', must: false, visited: false, booked: false, description: 'פארק מים עם בריכות ומגלשות. כניסת יום שלם למשפחה כ-220 ש"ח.', duration: 4 },
  { nameHe: 'שוק Stary Kleparz', nameEn: 'Stary Kleparz Market', city: 'קראקוב', area: '', type: 'שוק', must: false, visited: false, booked: false, description: 'שוק מקומי עם דוכנים ומסעדות — טוב לשוטטות.', duration: 1 },
  { nameHe: 'המוזיאון התת-קרקעי', nameEn: 'Rynek Underground', city: 'קראקוב', area: 'עיר עתיקה', type: 'מוזיאון', must: false, visited: false, booked: false, description: 'ממצאים ארכיאולוגיים מתחת לכיכר, עם תצוגות אינטראקטיביות.', duration: 1.5 },
  { nameHe: 'מוזיאון השוקולד', nameEn: 'Chocolate Museum', city: 'קראקוב', area: 'עיר עתיקה', type: 'מוזיאון', must: false, visited: false, booked: false, description: 'סדנת שוקולד עם למידה על התהליך וטעימות. מומלץ להזמין מראש.', duration: 1.5 },
  { nameHe: 'מוזיאון הבייגל', nameEn: 'Bagel Museum', city: 'קראקוב', area: 'עיר עתיקה', type: 'מוזיאון', must: false, visited: false, booked: false, description: 'סדנת הכנת בייגלה מסורתי וטעימות. מתאים לילדים.', duration: 1 },
  { nameHe: 'מוזיאון החושים Womai', nameEn: 'Womai Senses Museum', city: 'קראקוב', area: '', type: 'מוזיאון', must: false, visited: false, booked: false, description: 'תערוכות אינטראקטיביות המאתגרות את החושים.', duration: 1.5 },
  { nameHe: 'Bunny Cafe', nameEn: 'Królicza Kawiarnia', city: 'קראקוב', area: '', type: 'קפה', must: false, visited: false, booked: false, description: 'בית קפה שמשחקים בו עם ארנבים. כניסה מגיל 7+.', duration: 1 },
  { nameHe: 'Bonarka', nameEn: 'Bonarka Shopping Center', city: 'קראקוב', area: '', type: 'אחר', must: false, visited: false, booked: false, description: 'קניון גדול. אופציה ליום גשום.', duration: 2 },

  // זקופנה
  { nameHe: "עמק קושצ'ליסקה", nameEn: 'Kościeliska Valley', city: 'זקופנה', area: 'טטרה', type: 'פארק', must: true, visited: false, booked: false, description: 'שביל חצץ שטוח לאורך נחל — מהמסלולים הקלים והמשפחתיים בטטרה.', duration: 3 },
  { nameHe: "רחוב קרופובקי", nameEn: 'Krupówki Street', city: 'זקופנה', area: 'מרכז', type: 'שוק', must: true, visited: false, booked: false, description: 'הרחוב הראשי של זקופנה — חנויות, אמני רחוב, דוכני אוכל וגבינת אוסצ\'יפק.', duration: 2 },
  { nameHe: "גובאלובקה", nameEn: 'Gubałówka', city: 'זקופנה', area: '', type: 'אטרקציה', must: true, visited: false, booked: false, description: 'רכבל פנורמי מעל זקופנה. בפסגה: שוק, מגלשת קיץ ונוף לשרשרת הטטרה.', duration: 2 },
  { nameHe: "קספרובי וייך", nameEn: 'Kasprowy Wierch', city: 'זקופנה', area: 'טטרה', type: 'אטרקציה', must: false, visited: false, booked: false, description: 'רכבל לפסגה בגובה 1987 מ\'. שבילים בטוחים בפסגה, נוף עד סלובקיה.', duration: 3 },
  { nameHe: "מורסקיה אוקו", nameEn: 'Morskie Oko', city: 'זקופנה', area: 'טטרה', type: 'פארק', must: true, visited: false, booked: false, description: 'האגם המפורסם בטטרה. הליכה 2.5-3 שעות כל כיוון. יש עגלת סוסים לחלק מהדרך.', duration: 6 },
  { nameHe: 'מרחצאות תרמיים חוחולובסקי', nameEn: 'Chochołowskie Termy', city: 'זקופנה', area: '', type: 'אטרקציה', must: false, visited: false, booked: false, description: 'בריכות חמות בחוץ עם מגלשות מים ואזור ילדים.', duration: 3 },
  { nameHe: 'Brama w Gorce – צמרות העצים', nameEn: 'Brama w Gorce Treetop Walk', city: 'וקסמונד', area: '', type: 'אטרקציה', must: false, visited: false, booked: false, description: 'מסלול צמרות העצים הארוך באירופה (1300 מ\'). מגדלי תצפית ופינת חי.', travelTime: "40 דק' מזקופנה", duration: 3 },
  { nameHe: 'Adventure Park Gubałówka', nameEn: 'Adventure Park Gubałówka', city: 'זקופנה', area: 'גובאלובקה', type: 'אטרקציה', must: false, visited: false, booked: false, description: 'פארק חבלים ואומגות מול נוף הטטרה. מתאים גם מגיל 6.', duration: 2 },
  { nameHe: 'Park Harnasia', nameEn: 'Park Harnasia', city: 'זקופנה', area: '', type: 'אטרקציה', must: false, visited: false, booked: false, description: 'משחקייה מקורה נקייה. טובה ליום גשום. כ-40 ש"ח לשעה לילד.', duration: 2, priceChild: 40 },
  { nameHe: 'Terma Bania', nameEn: 'Terma Bania', city: 'ביאלה טטז\'נסקה', area: '', type: 'אטרקציה', must: false, visited: false, booked: false, description: 'מתחם תרמי יוקרתי עם ספא ומגלשות מים.', duration: 4 },
  { nameHe: 'Dolina Strążyska', nameEn: 'Strążyska Valley', city: 'זקופנה', area: 'טטרה', type: 'פארק', must: false, visited: false, booked: false, description: 'מסלול הליכה קליל בטבע, חניה מסודרת.', duration: 2 },

  // זאטור
  { nameHe: 'Energylandia', nameEn: 'Energylandia', city: 'זאטור', area: '', type: 'אטרקציה', must: true, visited: false, booked: false, description: 'פארק השעשועים הגדול בפולין. רכבות הרים ומתקני מים. באוקטובר כמעט אין תורים.', travelTime: "50 דק' מקראקוב", duration: 8 },
  { nameHe: 'Zatorland', nameEn: 'Zatorland', city: 'זאטור', area: '', type: 'אטרקציה', must: false, visited: false, booked: false, description: 'פארק שעשועים לימודי בנושא דינוזאורים, מתאים לילדים צעירים.', duration: 3 },

  // בדרך
  { nameHe: 'Parc Zarabie', nameEn: 'Parc Zarabie', city: 'בדרך', area: 'בין קראקוב לזקופנה', type: 'פארק', must: false, visited: false, booked: false, description: 'נקודת עצירה מומלצת בדרך.', duration: 0.5 },
  { nameHe: 'שמורת Bukowica', nameEn: 'Bukowica Nature Reserve', city: 'בדרך', area: 'בין זאטור לקראקוב', type: 'פארק', must: false, visited: false, booked: false, description: 'מסלול הליכה קליל ביער קסום, כחצי שעה.', duration: 0.5 },

  // אוכל קראקוב
  { nameHe: 'סדנת פירוגי – Eat Polska', nameEn: 'Eat Polska Pierogi Workshop', city: 'קראקוב', area: '', type: 'אטרקציה', must: true, visited: false, booked: false, description: 'סדנה של כ-3 שעות להכנת פירוגי בבית מארח מקומי. גם ילדים קטנים מצטרפים.', duration: 3 },
  { nameHe: 'Mr. Pancake', nameEn: 'Mr. Pancake', city: 'קראקוב', area: 'עיר עתיקה', type: 'מסעדה', must: false, visited: false, booked: false, description: 'מקום צבעוני עם עיצוב אינסטגרמי ונדנדות. מדבר מאוד לילדים.', website: 'https://www.instagram.com/mrpancakepl/', rating: 4.5 },
  { nameHe: 'The Leaky Cauldron', nameEn: 'The Leaky Cauldron', city: 'קראקוב', area: '', type: 'מסעדה', must: false, visited: false, booked: false, description: 'מסעדת קונספט בהשראת הארי פוטר — עיצוב מערה קסומה.', duration: 2 },
  { nameHe: 'Cosmic Games Pub', nameEn: 'Cosmic Games Pub', city: 'קראקוב', area: '', type: 'מסעדה', must: false, visited: false, booked: false, description: 'גישה חופשית לארקייד, שולחנות משחק, בריכת כדורים ומיני גולף.', duration: 2 },
  { nameHe: 'Tawerna Wilczy Dół', nameEn: 'Tawerna Wilczy Dół', city: 'קראקוב', area: '', type: 'מסעדה', must: false, visited: false, booked: false, description: 'מעוצבת כמערת זאבים מכושפת. אווירה מיוחדת לכל המשפחה.', duration: 2 },
  { nameHe: 'Nova Resto Bar', nameEn: 'Nova Resto Bar', city: 'קראקוב', area: "קז'ימייז'", type: 'מסעדה', must: false, visited: false, booked: false, description: 'מסעדה מעוצבת יפה עם שירות טוב.', duration: 1.5 },
  { nameHe: 'Skansen Smaków', nameEn: 'Skansen Smaków', city: 'קראקוב', area: 'ליד שדה התעופה', type: 'מסעדה', must: false, visited: false, booked: false, description: 'ארוחת ערב מסכמת באווירה פולנית, כולל פינת משחקים לילדים. אידיאלי לפני טיסה.', duration: 2 },
  { nameHe: 'גלידה ב-Starowiślna', nameEn: 'Ice Cream Starowiślna', city: 'קראקוב', area: 'Starowiślna', type: 'קפה', must: false, visited: false, booked: false, description: 'רחוב עם גלידריות בוטיק מהמדוברות בקרקוב.', duration: 0.5 },
  { nameHe: 'U Babci Maliny', nameEn: 'U Babci Maliny', city: 'קראקוב', area: '', type: 'מסעדה', must: false, visited: false, booked: false, description: 'מסעדה פולנית מסורתית, אווירה ביתית וחמה.', duration: 1.5 },

  // אוכל זקופנה
  { nameHe: 'Gorczańska Restaurant', nameEn: 'Gorczańska Restaurant', city: 'וקסמונד', area: '', type: 'מסעדה', must: true, visited: false, booked: false, description: 'מנות אזוריות, אוכל טרי וביתי, ליד Brama w Gorce. מתחם משחקים לילדים.', website: 'https://bramawgorce.pl/gastronomia/', rating: 4.6 },
  { nameHe: 'Siwy Dym', nameEn: 'Siwy Dym Restaurant', city: 'בדרך', area: 'בין קראקוב לזקופנה', type: 'מסעדה', must: true, visited: false, booked: false, description: 'מסעדה מעולה וזולה, בדיוק באמצע הדרך קרקוב-זקופנה. עצירת חובה!', website: 'https://siwydym.pl/en/', rating: 4.8 },
  { nameHe: 'Villa Toscana', nameEn: 'Villa Toscana', city: 'זקופנה', area: '', type: 'מסעדה', must: true, visited: false, booked: false, description: 'מסעדה איטלקית מעולה ליד המלון בזקופנה. ביקרו פעמיים — מומלץ.', duration: 2 },
  { nameHe: 'Gwarno', nameEn: 'Gwarno', city: 'זקופנה', area: '', type: 'מסעדה', must: false, visited: false, booked: false, description: 'אוכל מקומי טוב בלי "מלכודות תיירים", אווירה שמחה עם מוזיקה.', website: 'https://www.facebook.com/gwarnozakopane/', rating: 4.6, priceAdult: 60, priceChild: 35 },
  { nameHe: "Bacówka u Jacka", nameEn: "Bacówka u Jacka", city: 'זקופנה', area: 'הרים', type: 'מסעדה', must: false, visited: false, booked: false, description: 'בקתת רועים אותנטית — גבינת אוסצ\'יפק צלויה על אש פתוחה.', duration: 1 },
  { nameHe: 'מסעדת גובאלובקה', nameEn: 'Restauracja Schronisko Gubałówka', city: 'זקופנה', area: 'גובאלובקה', type: 'מסעדה', must: false, visited: false, booked: false, description: 'מסעדה עם נוף פתוח להרים, על הר גובאלובקה. טוב לשלב עם הרכבל.', duration: 1.5 },
  { nameHe: 'STRH Bistro Art Cafe', nameEn: 'STRH Bistro Art Cafe', city: 'זקופנה', area: '', type: 'קפה', must: true, visited: false, booked: false, description: 'קפה מעולה (נדיר באזור) וקינוחים. מומלץ מאוד!', website: 'https://www.facebook.com/strhcafe/', rating: 4.7, priceAdult: 40, priceChild: 20 },

  // אוכל זאטור
  { nameHe: 'Brohouse', nameEn: 'Brohouse', city: 'זאטור', area: '', type: 'מסעדה', must: false, visited: false, booked: false, description: 'מבשלת בירה עם אווירה טובה ואוכל איכותי. טוב לשלב עם הפארקים.', duration: 2 },
];

export async function seedPolandTrip() {
  const tripId = 'poland-2024';
  const trip: Trip = {
    id: tripId,
    destination: 'פולין — קראקוב וזקופנה',
    startDate: '2024-10-01',
    endDate: '2024-10-10',
    travelers: 4,
    style: ['תרבות', 'משפחה', 'טבע'],
    notes: 'טיול משפחתי לפולין. קראקוב 5 לילות, זקופנה 4 לילות. ילדים בגילאי 9 ו-12.',
    documents: [],
    places: places.map(p => ({ ...p, id: id() })),
    schedule: [],
    expenses: [],
    journalEntries: [],
    phase: 'before',
  };

  function stripUndefined(obj: unknown): unknown {
    if (Array.isArray(obj)) return obj.map(stripUndefined);
    if (obj !== null && typeof obj === 'object') {
      return Object.fromEntries(
        Object.entries(obj as Record<string, unknown>)
          .filter(([, v]) => v !== undefined)
          .map(([k, v]) => [k, stripUndefined(v)])
      );
    }
    return obj;
  }

  await setDoc(doc(db, 'trips', tripId), stripUndefined(trip));
  console.log('✅ טיול פולין נוסף בהצלחה! ' + places.length + ' מקומות.');
  alert('✅ טיול פולין נוסף! ' + places.length + ' מקומות.');
}

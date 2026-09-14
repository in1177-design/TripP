# MyTrip — Roadmap

## ✅ שלב 1 — MVP (הושלם)
- [x] אימות משתמשים (Firebase Auth — אימייל)
- [x] ניהול טיולים (צור / ערוך / מחק)
- [x] לשונית מסלול — ימים ואירועים
- [x] לשונית תקציב — קטגוריות + מעקב הוצאות
- [x] בנק רעיונות — הוספה ידנית
- [x] חיפוש מקומות (mock data, סינון לפי מדינה)
- [x] ממשק חיפוש/הוספה — 3 מסכים לפי Figma (search → results → details)
- [x] תמיכה ב-RTL מלאה

---

## 🔄 שלב 2 — שיפורים ואיחוד (הבא בתור)

### 🧩 איחוד רכיבים ואייקונים
- [ ] **Design System קטן** — ריכוז כל הכפתורים לקובץ `components/ui/` (Button, IconButton, Badge, Sheet, BottomSheet)
- [ ] **ספריית אייקונים אחידה** — החלפת אימוג'י מפוזרים + SVG ישיר ב-`lucide-react` (כבר מותקן) בצורה עקבית
- [ ] **CSS Variables** — כל הצבעים הקשיחים (`#c8f135`, `#e91e8c`, `#1a1a2e`) להפוך ל-CSS custom properties ב-`:root`
- [ ] **Sheet/BottomSheet** — קומפוננט אחד משותף במקום duplicate code ב-Budget + PlacesTab
- [ ] **Input / Select / Textarea** — עיצוב שדות אחיד (כרגע יש סגנונות שונים בין לשוניות)
- [ ] **EmptyState** — קומפוננט `<EmptyState icon tite subtitle />` משותף לכל הלשוניות

### 🔌 Google Places API (חיפוש אמיתי)
- [ ] פתח Google Cloud → Enable **Places API (New)**
- [ ] `searchPlaces` Cloud Function — swap mock → `POST /v1/places:searchText`
- [ ] `getPlaceDetails` Cloud Function — `GET /v1/places/{id}` + שמור `photoName` (לא URL)
- [ ] Claude Haiku → `nameHe` + `shortDescriptionHe` בלבד (לא נתונים עובדתיים)

### 🔐 הרשאות שיתוף טיול
- [ ] הזמנת משתמש לטיול לפי אימייל
- [ ] תפקידים: `owner / editor / viewer`
- [ ] Firestore Rules לפי תפקיד

### 📱 חוויית מובייל
- [ ] Bottom Sheet אנימציה חלקה (swipe-to-dismiss)
- [ ] תמונת גיבור בכרטיסי מקומות — העלאה מהגלריה
- [ ] PWA: `manifest.json` + Service Worker (offline cache)

---

## 🔮 שלב 3 — עתיד

- [ ] ייצוא PDF של מסלול הטיול
- [ ] שיתוף ציבורי (קישור read-only)
- [ ] אינטגרציה עם Google Maps (מסלול על מפה)
- [ ] תזכורות ועדכונים (Firebase Cloud Messaging)
- [ ] תמיכה במספר מטבעות (שערי חליפין)

import { useState, useMemo } from 'react';
import type { Trip, Expense, ExpenseCategory, CustomCategory } from '../types';
import { generateId } from '../storage';
import { detectLocalCurrency } from '../utils/currencyUtils';
import { auth } from '../firebase';

// ─── Avatar helpers ───────────────────────────────────────────
const AVATAR_COLORS = ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899','#14b8a6','#f97316'];
function uidColor(uid: string): string {
  let h = 0;
  for (let i = 0; i < uid.length; i++) h = (h * 31 + uid.charCodeAt(i)) & 0xffffffff;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}
function nameInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

// ─── Category metadata ────────────────────────────────────────
type CatMeta = { icon: string; color: string };
const CAT_META: Record<string, CatMeta> = {
  'מסעדות':       { icon: '🍽️', color: '#2dc76d' },
  'תחבורה':       { icon: '🚌', color: '#e67e22' },
  'לינה':         { icon: '🏨', color: '#e74c3c' },
  'קניות':        { icon: '🛍️', color: '#1abc9c' },
  'תרבות':        { icon: '🏛️', color: '#6c5ce7' },
  'אטרקציות':     { icon: '📍', color: '#e91e63' },
  'פינוקים בדרך': { icon: '☕', color: '#a0522d' },
  'טיסות':        { icon: '✈️', color: '#3498db' },
  'כללי':         { icon: '💬', color: '#f39c12' },
  'כביסה':        { icon: '👕', color: '#27ae60' },
  'אחר':          { icon: '💳', color: '#95a5a6' },
  // legacy aliases — kept so old expenses still resolve correctly
  'אוכל':         { icon: '🍽️', color: '#2dc76d' },
  'שתייה':        { icon: '☕', color: '#a0522d' },
  'קפה':          { icon: '☕', color: '#a0522d' },
  'פעילויות':     { icon: '📍', color: '#e91e63' },
  'כניסות':       { icon: '🏛️', color: '#6c5ce7' },
  'סיור':         { icon: '📍', color: '#e91e63' },
  'בידור':        { icon: '🏛️', color: '#6c5ce7' },
};
// fallback used outside component scope (e.g., in DonutChart helper)
function getCat(cat: string): CatMeta { return CAT_META[cat] ?? CAT_META['אחר']; }

// ─── SVG icon definitions (Lucide-style, 24×24 viewBox, stroke only) ──────
interface IconDef { paths?: string[]; circles?: { cx: number; cy: number; r: number }[] }
const CAT_ICON_DEFS: Record<string, IconDef> = {
  'מסעדות': { paths: [
    'M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2',
    'M7 2v20',
    'M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3',
    'M21 15v7',
  ]},
  'תחבורה': { paths: [
    'M8 6v6', 'M15 6v6', 'M2 12h19.6',
    'M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4a2 2 0 0 0-2 2v10h3',
  ], circles: [
    { cx: 7.5, cy: 18, r: 1.5 },
    { cx: 16.5, cy: 18, r: 1.5 },
  ]},
  'לינה': { paths: [
    'M2 4v16',
    'M2 8h18a2 2 0 0 1 2 2v10',
    'M2 17h20',
    'M6 8v9',
  ]},
  'קניות': { paths: [
    'M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z',
    'M3 6h18',
    'M16 10a4 4 0 0 1-8 0',
  ]},
  'תרבות': { paths: [
    'M3 22h18',
    'M6 18v-7', 'M10 18v-7', 'M14 18v-7', 'M18 18v-7',
    'M12 2 2 7h20z',
  ]},
  'אטרקציות': { paths: ['M20 10c0 6-8 13-8 13s-8-7-8-13a8 8 0 0 1 16 0Z'],
    circles: [{ cx: 12, cy: 10, r: 3 }],
  },
  // legacy aliases
  'פעילויות':  { paths: ['M20 10c0 6-8 13-8 13s-8-7-8-13a8 8 0 0 1 16 0Z'], circles: [{ cx: 12, cy: 10, r: 3 }] },
  'כניסות':   { paths: ['M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z', 'M13 5v2', 'M13 17v2', 'M13 11v2'] },
  'סיור':     { paths: ['M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z', 'M16.24 7.76l-2.12 6.36-6.36 2.12 2.12-6.36 6.36-2.12z'] },
  'בידור':    { paths: ['M19.82 2H4.18A2.18 2.18 0 0 0 2 4.18v15.64A2.18 2.18 0 0 0 4.18 22h15.64A2.18 2.18 0 0 0 22 19.82V4.18A2.18 2.18 0 0 0 19.82 2z', 'M7 2v20', 'M17 2v20', 'M2 12h20', 'M2 7h5', 'M2 17h5', 'M17 17h5', 'M17 7h5'] },
  'פינוקים בדרך': { paths: [
    'M18 8h1a4 4 0 0 1 0 8h-1',
    'M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z',
    'M6 1v3', 'M10 1v3', 'M14 1v3',
  ]},
  'טיסות': { paths: [
    'M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z',
  ]},
  'כללי': { paths: ['M7.9 20A9 9 0 1 0 4 16.1L2 22z'] },
  'כביסה': { paths: [
    'M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.57a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.57a2 2 0 0 0-1.34-2.23z',
  ]},
  'אחר': { circles: [{ cx: 5, cy: 12, r: 1 }, { cx: 12, cy: 12, r: 1 }, { cx: 19, cy: 12, r: 1 }] },
};

function CatIcon({ cat, size = 20, color = 'white', fallback }: {
  cat: string; size?: number; color?: string; fallback?: string;
}) {
  const def = CAT_ICON_DEFS[cat];
  if (!def) {
    const emoji = fallback ?? CAT_META[cat]?.icon ?? '?';
    return <span style={{ fontSize: size * 0.75, lineHeight: 1 }}>{emoji}</span>;
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"
      style={{ display: 'block', flexShrink: 0 }}>
      {def.paths?.map((d, i) => <path key={i} d={d} />)}
      {def.circles?.map((c, i) => <circle key={i} cx={c.cx} cy={c.cy} r={c.r} fill={color} stroke="none" />)}
    </svg>
  );
}

// ─── Subcategories per category ──────────────────────────────
const SUBCATS: Record<string, string[]> = {
  'מסעדות':        ['ארוחת בוקר', 'ארוחת צהריים', 'ארוחת ערב', 'אוכל רחוב', 'פאב / בר', 'קינוח'],
  'תחבורה':        ['אוטובוס', 'רכבת / מטרו', 'מונית / אובר', 'שכירת רכב', 'אופניים / קטנוע', 'אוניה / מעבורת'],
  'לינה':          ['מלון', 'אירבנב', 'הוסטל', 'ריוקאן', 'קפסולה', 'קמפינג'],
  'קניות':         ['מזכרות', 'בגדים', 'אוכל / סופר', 'אלקטרוניקה', 'קוסמטיקה', 'שוק מקומי'],
  'תרבות':         ['מוזיאון / גלריה', 'מופע / הצגה', 'מקדש', 'קולנוע'],
  'אטרקציות':      ['פארק שעשועים', 'בריכה / פארק מים', 'סיור', 'פעילות אתגרית', 'אחר'],
  'פינוקים בדרך':  ['קפה', 'גלידה', 'שתיה חמה', 'משקות קלים', 'קינוח', 'מאפים'],
  'טיסות':         ['כרטיס טיסה', 'כבודה', 'ביטוח נסיעות', 'VISA / ESTA', 'חניון שדה תעופה'],
  'כללי':          ['דמי שימוש', 'טיפ', 'שונות'],
  'כביסה':         ['מכבסה', 'ניקוי יבש', 'מטבחון'],
  'אחר':           ['שונות', 'קנסות', 'בריאות / רפואה', 'SIM / תקשורת'],
  // legacy aliases subcats
  'פעילויות':      ['ספורט', 'טיול טבע', 'שייט', 'סקי / שלג', 'אדרנלין'],
  'כניסות':        ['מוזיאון', 'מקדש / כנסיה', 'פארק לאומי', 'הופעה / מופע', 'פארק שעשועים'],
  'סיור':          ['סיור מודרך', 'אודיו גייד', 'מפה / מדריך', 'נסיעה מאורגנת'],
  'בידור':         ['קולנוע', 'מועדון לילה', 'קזינו', 'אמנות / תרבות'],
  'שתייה':         ['בר', 'בירה', 'קוקטייל', 'יין', 'משקאות קלים'],
  'קפה':           ['קפה', 'עוגה / מאפה', 'ארוחת בוקר קלה', 'תה'],
};

const BUILTIN_CATS: ExpenseCategory[] = [
  'מסעדות', 'תחבורה', 'לינה', 'קניות',
  'תרבות', 'אטרקציות', 'פינוקים בדרך',
  'טיסות', 'כללי', 'כביסה', 'אחר',
];
const COLOR_PALETTE = [
  '#e74c3c', '#e67e22', '#f39c12', '#2dc76d', '#1abc9c',
  '#3498db', '#6c5ce7', '#9b59b6', '#e91e63', '#16a085',
  '#27ae60', '#a0522d', '#c0392b', '#607d8b', '#ff5722',
  '#00bcd4', '#8bc34a', '#795548',
];
const CURRENCIES = ['EUR', 'ILS', 'USD', 'GBP', 'JPY', 'PLN', 'THB', 'CZK'];
const MONTH_HE = ['ינו', 'פבר', 'מרץ', 'אפר', 'מאי', 'יוני', 'יולי', 'אוג', 'ספט', 'אוק', 'נוב', 'דצמ'];
const DOW_HE   = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

function fmtDateHdr(ds: string) {
  const d = new Date(ds + 'T12:00:00');
  return `יום ${DOW_HE[d.getDay()]}, ${d.getDate()} ${MONTH_HE[d.getMonth()]}`;
}
function fmtDateShort(ds: string) {
  const d = new Date(ds + 'T12:00:00');
  return `${d.getDate()} ${MONTH_HE[d.getMonth()]}`;
}
function dateKey(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function daysBetween(a: string, b: string) {
  return Math.max(0,
    Math.round((new Date(b + 'T12:00:00').getTime() - new Date(a + 'T12:00:00').getTime()) / 86400000)
  );
}

// ─── Donut chart ─────────────────────────────────────────────
function DonutChart({ slices }: { slices: { color: string; amount: number }[] }) {
  const total = slices.reduce((s, sl) => s + sl.amount, 0);
  if (total === 0) return null;
  const R = 52; const C = 2 * Math.PI * R;
  let off = 0;
  return (
    <svg viewBox="0 0 130 130" className="exp-donut-svg">
      {slices.map((sl, i) => {
        const frac = sl.amount / total;
        const len  = frac * C - 1.8;
        const dashOff = -off;
        off += frac * C;
        return (
          <circle key={i} cx="65" cy="65" r={R}
            fill="none" stroke={sl.color} strokeWidth="22"
            strokeLinecap="butt"
            strokeDasharray={`${Math.max(0, len).toFixed(2)} ${C.toFixed(2)}`}
            strokeDashoffset={dashOff.toFixed(2)}
            transform="rotate(-90 65 65)"
          />
        );
      })}
    </svg>
  );
}

// ─── Display row type (expense + optional per-day split info) ──
type DisplayExp = Expense & { _perDay?: number; _numDays?: number };

// ─── Main component ───────────────────────────────────────────
interface Props { trip: Trip; onChange: (t: Trip) => void; onNavigate?: (tab: string) => void; }

/** Returns the best default currency for a new expense in this trip.
 *  Priority: last-used currency in expenses → detected local → ILS */
function getDefaultCur(trip: Trip): string {
  const expenses = trip.expenses || [];
  if (expenses.length > 0) return expenses[expenses.length - 1].currency;
  const local = detectLocalCurrency(trip.destination);
  return local ?? 'ILS';
}

const blankForm = (trip: Trip): Omit<Expense, 'id'> => ({
  date: new Date().toISOString().slice(0, 10),
  dateEnd: undefined,
  useDate: undefined,
  description: '', amount: 0,
  currency: getDefaultCur(trip), category: 'מסעדות', subcategory: undefined, paymentMethod: 'cash',
});

const blankNewCat = () => ({ icon: '', name: '', color: '#3498db' });

export default function ExpensesTab({ trip, onChange, onNavigate }: Props) {
  const expenses    = trip.expenses   || [];
  const customCats  = trip.categories || [] as CustomCategory[];

  // Resolve category metadata — built-in first, then custom overrides
  function getCatMeta(cat: string): CatMeta {
    const custom = customCats.find(c => c.name === cat);
    if (custom) return { icon: custom.icon, color: custom.color };
    return CAT_META[cat] ?? CAT_META['אחר'];
  }

  // All picker categories = built-ins + custom (no duplicates)
  const allPickerCats: ExpenseCategory[] = [
    ...BUILTIN_CATS,
    ...customCats.map(c => c.name).filter(n => !BUILTIN_CATS.includes(n)),
  ];

  const [showModal, setShowModal]     = useState(false);
  const [step, setStep]               = useState<'category' | 'form'>('category');
  const [editingId, setEditingId]     = useState<string | null>(null);
  const [form, setForm]               = useState<Omit<Expense, 'id'>>(() => blankForm(trip));
  const [spreadDays, setSpreadDays]   = useState(false);
  const [earlyPurchase, setEarlyPurchase] = useState(false); // רכישה מוקדמת
  const [showNote, setShowNote]           = useState(false);
  const [showFormMenu, setShowFormMenu]   = useState(false);  // "..." dropdown in form header
  // filterCur reserved for future currency filter UI
  // const [filterCur, setFilterCur] = useState<string | null>(null);

  // Category editor state
  const [showCatEditor, setShowCatEditor]   = useState(false);
  const [newCatForm, setNewCatForm]         = useState(blankNewCat);
  const [addingCat, setAddingCat]           = useState(false);
  const [editingCatId, setEditingCatId]     = useState<string | null>(null);

  // Exchange rates are now managed in the Settings tab

  // Sub-tab: 'list' | 'stats'
  const [subTab, setSubTab] = useState<'list' | 'stats'>('list');

  function saveNewCat() {
    if (!newCatForm.name.trim() || !newCatForm.icon.trim()) return;
    if (editingCatId) {
      onChange({
        ...trip,
        categories: customCats.map(c =>
          c.id === editingCatId ? { ...c, ...newCatForm, name: newCatForm.name.trim(), icon: newCatForm.icon.trim() } : c
        ),
      });
      setEditingCatId(null);
    } else {
      const cat: CustomCategory = { id: generateId(), name: newCatForm.name.trim(), icon: newCatForm.icon.trim(), color: newCatForm.color };
      onChange({ ...trip, categories: [...customCats, cat] });
    }
    setNewCatForm(blankNewCat());
    setAddingCat(false);
  }

  function deleteCustomCat(id: string) {
    onChange({ ...trip, categories: customCats.filter(c => c.id !== id) });
  }

  function startEditCat(cat: CustomCategory) {
    setNewCatForm({ icon: cat.icon, name: cat.name, color: cat.color });
    setEditingCatId(cat.id);
    setAddingCat(true);
  }

  const tripDays = useMemo(() => {
    if (!trip.startDate || !trip.endDate) return 1;
    return Math.max(1,
      Math.ceil((new Date(trip.endDate + 'T12:00:00').getTime() -
                 new Date(trip.startDate + 'T12:00:00').getTime()) / 86400000) + 1
    );
  }, [trip.startDate, trip.endDate]);

  // dailyAvg kept for potential future per-currency chart use
  // const dailyAvg = primaryTotal > 0 ? primaryTotal / tripDays : 0;

  // ── ILS conversion ────────────────────────────────────────────
  // foreignCurs: currencies in expenses that aren't ILS
  const foreignCurs = useMemo(
    () => [...new Set(expenses.filter(e => e.currency !== 'ILS').map(e => e.currency))],
    [expenses]
  );
  // are all foreign currencies configured?
  const ratesReady = foreignCurs.length === 0 ||
    foreignCurs.every(c => !!(trip.exchangeRates?.[c]));
  // helper: convert any amount to ILS using stored rates
  function toILS(amount: number, currency: string): number {
    if (currency === 'ILS') return amount;
    return (trip.exchangeRates?.[currency] ?? 0) * amount;
  }
  // grand ILS total (all expenses)
  const totalILS = useMemo(
    () => expenses.reduce((s, e) => s + (
      e.currency === 'ILS' ? e.amount : (trip.exchangeRates?.[e.currency] ?? 0) * e.amount
    ), 0),
    [expenses, trip.exchangeRates]
  );
  const dailyILS = totalILS > 0 && tripDays > 0 ? totalILS / tripDays : 0;

  // today's spending in ILS — show during the trip
  const todayStr = new Date().toISOString().slice(0, 10);
  const todayILS = useMemo(() => {
    return expenses.reduce((s, e) => {
      const displayDate = (e.useDate && e.useDate > e.date) ? e.useDate : e.date;
      // single-day expense on today
      if (!e.dateEnd && displayDate === todayStr) {
        return s + (e.currency === 'ILS' ? e.amount : (trip.exchangeRates?.[e.currency] ?? 0) * e.amount);
      }
      // multi-day expense spanning today — add its per-day share
      if (e.dateEnd && e.date <= todayStr && e.dateEnd >= todayStr) {
        const days = Math.max(1, daysBetween(e.date, e.dateEnd) + 1);
        const perDay = e.amount / days;
        return s + (e.currency === 'ILS' ? perDay : (trip.exchangeRates?.[e.currency] ?? 0) * perDay);
      }
      return s;
    }, 0);
  }, [expenses, trip.exchangeRates, todayStr]);
  // only show the "today" block when today is within the trip
  const isOnTrip = trip.startDate && trip.endDate
    && todayStr >= trip.startDate && todayStr <= trip.endDate;

  // ── Category breakdown — ALL expenses converted to ILS
  const catRowsILS = useMemo(() => {
    const t: Record<string, number> = {};
    expenses.forEach(e => {
      const ils = e.currency === 'ILS' ? e.amount : (trip.exchangeRates?.[e.currency] ?? 0) * e.amount;
      if (ils > 0) t[e.category] = (t[e.category] || 0) + ils;
    });
    return Object.entries(t)
      .sort((a, b) => b[1] - a[1])
      .map(([cat, amt]) => ({
        cat, amt,
        pct: totalILS > 0 ? amt / totalILS * 100 : 0,
        ...getCat(cat),
      }));
  }, [expenses, trip.exchangeRates, totalILS]);

  // ── Group by date — spread expenses appear on EACH day with per-day amount
  const grouped = useMemo(() => {
    const map: Record<string, DisplayExp[]> = {};

    expenses.forEach(e => {
      if (e.dateEnd && e.dateEnd > e.date) {
        // Multi-day: spread across range
        const numDays = daysBetween(e.date, e.dateEnd) + 1;
        const perDay  = e.amount / numDays;
        const cur = new Date(e.date + 'T12:00:00');
        const end = new Date(e.dateEnd + 'T12:00:00');
        while (cur <= end) {
          const k = dateKey(cur);
          (map[k] ??= []).push({ ...e, _perDay: perDay, _numDays: numDays });
          cur.setDate(cur.getDate() + 1);
        }
      } else {
        // Early-purchase: group by useDate when present, otherwise by date
        const key = (e.useDate && e.useDate > e.date) ? e.useDate : e.date;
        (map[key] ??= []).push(e);
      }
    });

    return Object.entries(map)
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([date, exps]) => {
        const dayTot: Record<string, number> = {};
        exps.forEach(e => {
          const amt = e._perDay ?? e.amount;
          dayTot[e.currency] = (dayTot[e.currency] || 0) + amt;
        });
        return { date, exps, dayTot };
      });
  }, [expenses]);

  // ── Actions
  function save() {
    // אם אין תיאור — השתמש בתת-קטגוריה כתיאור (אם נבחרה)
    const desc = form.description.trim() || form.subcategory?.trim() || '';
    if (!desc || form.amount <= 0) return;
    const dateEnd = spreadDays && form.dateEnd && form.dateEnd > form.date ? form.dateEnd : undefined;
    const useDate = earlyPurchase && form.useDate && form.useDate > form.date ? form.useDate : undefined;
    const toSaveForm = { ...form, description: desc };
    if (editingId) {
      // Update existing expense
      onChange({
        ...trip,
        expenses: expenses.map(e =>
          e.id === editingId ? { ...toSaveForm, id: editingId, dateEnd, useDate } : e
        ),
      });
    } else {
      // Add new expense — stamp who added it
      const addedByUid = auth.currentUser?.uid || undefined;
      const toSave: Expense = { ...toSaveForm, id: generateId(), dateEnd, useDate, addedByUid };
      onChange({ ...trip, expenses: [...expenses, toSave] });
    }
    setShowModal(false);
    setEditingId(null);
  }

  function remove(id: string) {
    onChange({ ...trip, expenses: expenses.filter(e => e.id !== id) });
  }

  function openModal() {
    setForm(blankForm(trip));
    setSpreadDays(false);
    setEarlyPurchase(false);
    setShowNote(false);
    setShowFormMenu(false);
    setEditingId(null);
    setStep('category');
    setShowModal(true);
  }

  function openEdit(exp: Expense) {
    // Strip _perDay/_numDays (those are display-only injected fields)
    const { ...rest } = exp as Expense & { _perDay?: number; _numDays?: number };
    delete (rest as Record<string, unknown>)._perDay;
    delete (rest as Record<string, unknown>)._numDays;
    setForm({
      date: rest.date,
      dateEnd: rest.dateEnd,
      useDate: rest.useDate,
      description: rest.description,
      amount: rest.amount,
      currency: rest.currency,
      category: rest.category,
      subcategory: rest.subcategory,
      receiptNote: rest.receiptNote,
      paymentMethod: rest.paymentMethod,
    });
    setSpreadDays(!!(rest.dateEnd && rest.dateEnd > rest.date));
    setEarlyPurchase(!!(rest.useDate && rest.useDate > rest.date));
    setShowNote(!!(rest.receiptNote));
    setShowFormMenu(false);
    setEditingId(exp.id);
    setStep('form');
    setShowModal(true);
  }

  // ── Render
  return (
    <div className="exp-root">

      {/* ── GRAND TOTAL BAR (ILS) ── */}
      {expenses.length > 0 && (
        <div className="exp-stats-bar">
          {totalILS > 0 ? (
            <>
              <div className="exp-stat">
                <span className="exp-stat-label">סה״כ{!ratesReady ? ' (חלקי)' : ''}</span>
                <span className="exp-stat-value">
                  <span className="exp-stat-cur">₪</span>
                  {totalILS.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </span>
              </div>
              <div className="exp-stat-sep" />
              <div className="exp-stat">
                <span className="exp-stat-label">ממוצע יומי</span>
                <span className="exp-stat-value">
                  <span className="exp-stat-cur">₪</span>
                  {dailyILS.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </span>
              </div>
              {isOnTrip && (
                <>
                  <div className="exp-stat-sep" />
                  <div className="exp-stat exp-stat--today">
                    <span className="exp-stat-label">הוצאות היום</span>
                    <span className="exp-stat-value">
                      <span className="exp-stat-cur">₪</span>
                      {todayILS > 0
                        ? todayILS.toLocaleString(undefined, { maximumFractionDigits: 0 })
                        : '—'}
                    </span>
                  </div>
                </>
              )}
            </>
          ) : (
            <button
              className="exp-stat exp-stat--setup"
              onClick={() => onNavigate?.('settings')}
              title="עבור להגדרות שערי חליפין"
            >
              <span className="exp-stat-label">הגדר שערי חליפין בהגדרות ←</span>
            </button>
          )}
        </div>
      )}

      {/* ── SUB-TAB NAV ── */}
      {expenses.length > 0 && (
        <div className="exp-subtab-nav">
          <button
            className={`exp-subtab-btn${subTab === 'list' ? ' active' : ''}`}
            onClick={() => setSubTab('list')}>
            הוצאות
          </button>
          <button
            className={`exp-subtab-btn${subTab === 'stats' ? ' active' : ''}`}
            onClick={() => setSubTab('stats')}>
            סטטיסטיקות
          </button>
        </div>
      )}

      {/* ── STATS SUB-TAB: donut chart + category breakdown ── */}
      {subTab === 'stats' && (
        <>
          {catRowsILS.length > 0 ? (
            <div className="exp-chart-card">
              <div className="exp-donut-wrap">
                <DonutChart slices={catRowsILS.map(c => ({ color: c.color, amount: c.amt }))} />
              </div>
              <div className="exp-cat-breakdown">
                {catRowsILS.map(c => (
                  <div key={c.cat} className="exp-cat-brow">
                    <span className="exp-cat-bdot" style={{ background: c.color }} />
                    <CatIcon cat={c.cat} size={14} color={c.color} fallback={c.icon} />
                    <span className="exp-cat-blabel">{c.cat}</span>
                    <span className="exp-cat-bpct">{c.pct.toFixed(0)}%</span>
                    <span className="exp-cat-bamt">₪{c.amt.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="exp-stats-empty">
              <p>הגדר שערי חליפין כדי לראות התפלגות בשקלים</p>
              <button className="exp-rates-btn-big" onClick={() => setShowCatEditor(true)}>
                ⚙️ הגדרת שערים
              </button>
            </div>
          )}
        </>
      )}

      {/* ── EXPENSE LIST ── */}
      {subTab === 'list' && (grouped.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">💳</div>
          <p>אין הוצאות עדיין</p>
          <p style={{ fontSize: 13, marginTop: 6, color: 'var(--ink-muted)' }}>לחצי על + כדי להוסיף</p>
        </div>
      ) : (() => {
        // Build avatar map: uid → { label, color, name } — used when trip is shared
        const currentUid = auth.currentUser?.uid;
        const isShared   = (trip.participants?.length ?? 0) > 0;
        const avatarMap: Record<string, { label: string; color: string; name: string }> = {};
        if (isShared) {
          (trip.participants ?? []).forEach(p => {
            const name = p.displayName || p.email;
            avatarMap[p.uid] = {
              label: nameInitials(name),
              color: uidColor(p.uid),
              name,
            };
          });
          // Add owner = current user (may not be in participants array)
          if (currentUid && !avatarMap[currentUid] && auth.currentUser) {
            const name = auth.currentUser.displayName || auth.currentUser.email || 'אני';
            avatarMap[currentUid] = {
              label: nameInitials(name),
              color: uidColor(currentUid),
              name,
            };
          }
        }

        return (
          <div className="exp-list">
            {grouped.map(g => (
              <div key={g.date} className="exp-group">
                {(() => {
                  const dayILS = Object.entries(g.dayTot).reduce((s, [cur, amt]) => s + toILS(amt, cur), 0);
                  return (
                    <div className="exp-group-hdr">
                      <span className="exp-group-date">{fmtDateHdr(g.date)}</span>
                      <span className="exp-group-tot">
                        {dayILS > 0
                          ? `₪ ${dayILS.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
                          : Object.entries(g.dayTot).map(([cur, amt]) => `${amt.toFixed(0)} ${cur}`).join(' · ')}
                      </span>
                    </div>
                  );
                })()}
                <div className="exp-group-rows">
                {g.exps.map((exp, idx) => {
                  const m = getCatMeta(exp.category);
                  const isSpread = !!exp._numDays;
                  const dispAmt  = exp._perDay ?? exp.amount;
                  const ilsAmt   = toILS(dispAmt, exp.currency);
                  const showOrig = exp.currency !== 'ILS' || isSpread;
                  const isEarlyPurchase = !!(exp.useDate && exp.useDate > exp.date);

                  // Avatar: shown only in shared trips, only when addedByUid is known
                  const avatar = isShared && exp.addedByUid
                    ? (avatarMap[exp.addedByUid] ?? {
                        label: exp.addedByUid.slice(0, 2).toUpperCase(),
                        color: uidColor(exp.addedByUid),
                        name: exp.addedByUid,
                      })
                    : null;
                  const isMine = exp.addedByUid === currentUid;

                  return (
                    <div key={`${exp.id}-${idx}`} className="exp-row" onClick={() => openEdit(exp)}>
                      {/* Icon — rightmost in RTL */}
                      <div className="exp-icon-circle" style={{ background: m.color }}>
                        <CatIcon cat={exp.category} size={18} fallback={m.icon} />
                      </div>
                      {/* Name + meta */}
                      <div className="exp-row-body">
                        <div className="exp-row-desc-line">
                          <span className="exp-row-desc">{exp.description}</span>
                          {isSpread && <span className="exp-spread-badge">{exp._numDays} ימים</span>}
                          {isEarlyPurchase && <span className="exp-early-badge">🎟️</span>}
                        </div>
                        <span className="exp-row-sub">
                          {exp.category}
                          {exp.subcategory ? ` • ${exp.subcategory}` : ''}
                          {exp.paymentMethod ? ` • ${{ cash: 'מזומן', card: 'אשראי', online: 'הזמנה אינטרנטית' }[exp.paymentMethod] ?? exp.paymentMethod}` : ''}
                          {isSpread && exp.dateEnd
                            ? ` • ${fmtDateShort(exp.date)}–${fmtDateShort(exp.dateEnd)}`
                            : ''}
                          {isEarlyPurchase ? ` • נקנה ${fmtDateShort(exp.date)}` : ''}
                        </span>
                      </div>
                      {/* Amounts — leftmost in RTL */}
                      <div className="exp-row-amounts">
                        {ilsAmt > 0 ? (
                          <span className="exp-row-ils">
                            ₪{ilsAmt.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                          </span>
                        ) : (
                          <span className="exp-row-ils">
                            {dispAmt.toLocaleString(undefined, { maximumFractionDigits: 2 })} {exp.currency}
                          </span>
                        )}
                        {ilsAmt > 0 && showOrig && (
                          <span className="exp-row-orig">
                            {dispAmt.toLocaleString(undefined, { maximumFractionDigits: 2 })} {exp.currency}
                          </span>
                        )}
                      </div>
                      {/* Adder avatar — shows who added this expense in shared trips */}
                      {avatar && (
                        <div
                          className={`exp-adder-chip${isMine ? ' exp-adder-chip--me' : ''}`}
                          style={{ background: avatar.color }}
                          title={avatar.name}
                        >
                          {avatar.label}
                        </div>
                      )}
                    </div>
                  );
                })}
                </div>{/* end exp-group-rows */}
              </div>
            ))}
          </div>
        );
      })())}

      {/* ── FAB ── */}
      <button className="exp-fab" onClick={openModal} aria-label="הוסף הוצאה">+</button>

      {/* ── CATEGORY EDITOR ── */}
      {showCatEditor && (
        <div className="exp-overlay" onClick={() => { setShowCatEditor(false); setAddingCat(false); setEditingCatId(null); setNewCatForm(blankNewCat()); }}>
          <div className="exp-sheet exp-sheet--tall" onClick={e => e.stopPropagation()}>
            <div className="exp-sheet-hdr">
              <button className="exp-sheet-close" onClick={() => { setShowCatEditor(false); setAddingCat(false); setEditingCatId(null); setNewCatForm(blankNewCat()); }}>✕</button>
              <span className="exp-sheet-title">קטגוריות</span>
              <button className="exp-cat-mgr-btn" onClick={() => { setAddingCat(true); setEditingCatId(null); setNewCatForm(blankNewCat()); }}>+ הוסף</button>
            </div>

            <div className="exp-catlist">
              {/* Built-in categories */}
              <div className="exp-catlist-section">קטגוריות ברירת מחדל</div>
              {BUILTIN_CATS.map(name => {
                const m = getCat(name);
                return (
                  <div key={name} className="exp-catlist-row">
                    <div className="exp-catlist-icon" style={{ background: m.color }}>
                      <CatIcon cat={name} size={16} fallback={m.icon} />
                    </div>
                    <span className="exp-catlist-name">{name}</span>
                    <span className="exp-catlist-lock">🔒</span>
                  </div>
                );
              })}

              {/* Custom categories */}
              {customCats.length > 0 && (
                <div className="exp-catlist-section" style={{ marginTop: 14 }}>קטגוריות מותאמות</div>
              )}
              {customCats.map(cat => (
                <div key={cat.id} className="exp-catlist-row">
                  <div className="exp-catlist-icon" style={{ background: cat.color }}>
                    <CatIcon cat={cat.name} size={16} fallback={cat.icon} />
                  </div>
                  <span className="exp-catlist-name">{cat.name}</span>
                  <div className="exp-catlist-actions">
                    <button className="exp-catlist-btn" onClick={() => startEditCat(cat)} title="ערוך">✏️</button>
                    <button className="exp-catlist-btn exp-catlist-btn--del" onClick={() => deleteCustomCat(cat.id)} title="מחק">🗑️</button>
                  </div>
                </div>
              ))}
            </div>

            {/* Add / Edit form */}
            {addingCat && (
              <div className="exp-cat-add-form">
                <div className="exp-cat-add-row">
                  <input
                    className="exp-cat-emoji-inp"
                    placeholder="😀"
                    value={newCatForm.icon}
                    maxLength={4}
                    onChange={e => setNewCatForm(f => ({ ...f, icon: e.target.value }))}
                  />
                  <input
                    className="exp-field-inp exp-cat-name-inp"
                    placeholder="שם הקטגוריה"
                    value={newCatForm.name}
                    onChange={e => setNewCatForm(f => ({ ...f, name: e.target.value }))}
                  />
                </div>
                <div className="exp-color-palette">
                  {COLOR_PALETTE.map(c => (
                    <button key={c} className={`exp-color-swatch${newCatForm.color === c ? ' active' : ''}`}
                      style={{ background: c }}
                      onClick={() => setNewCatForm(f => ({ ...f, color: c }))}
                    />
                  ))}
                </div>
                <div className="exp-cat-add-actions">
                  <button className="btn-outline-sm" onClick={() => { setAddingCat(false); setEditingCatId(null); setNewCatForm(blankNewCat()); }}>ביטול</button>
                  <button className="btn-primary btn-sm" onClick={saveNewCat}
                    disabled={!newCatForm.name.trim() || !newCatForm.icon.trim()}>
                    {editingCatId ? 'עדכן' : 'הוסף'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── ADD MODAL ── */}
      {showModal && (
        <div className="exp-overlay" onClick={() => setShowModal(false)}>
          <div className={`exp-sheet${step === 'form' ? ' exp-sheet--form' : ''}`} onClick={e => e.stopPropagation()}>

            {/* ── STEP 1: CATEGORY PICKER ── */}
            {step === 'category' && (
              <>
                <div className="exp-sheet-hdr">
                  <button className="exp-sheet-close" onClick={() => setShowModal(false)}>✕</button>
                  <span className="exp-sheet-title">איזה סוג הוצאה?</span>
                  <button className="exp-cat-mgr-btn" onClick={() => { setShowModal(false); setShowCatEditor(true); }}>
                    ✏️ ערוך
                  </button>
                </div>
                <div className="exp-cat-grid exp-cat-grid--pick">
                  {allPickerCats.map(cat => {
                    const m = getCatMeta(cat);
                    return (
                      <button key={cat}
                        className="exp-cat-tile exp-cat-tile--big"
                        onClick={() => {
                          setForm(f => ({ ...f, category: cat, subcategory: undefined }));
                          setStep('form');
                        }}>
                        <div className="exp-cat-tile-circle exp-cat-tile-circle--big"
                          style={{ background: m.color }}>
                          <CatIcon cat={cat} size={24} fallback={m.icon} />
                        </div>
                        <span>{cat}</span>
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            {/* ── STEP 2: FORM ── */}
            {step === 'form' && (
              <>
                {/* Header — outlined-square close + title + "..." menu */}
                <div className="exp-sheet-hdr">
                  <button className="exp-hdr-icon-btn"
                    onClick={() => { setShowFormMenu(false); setShowModal(false); }}
                    title="סגור">
                    ✕
                  </button>
                  <span className="exp-sheet-title">{editingId ? 'עריכת הוצאה' : 'הוצאה חדשה'}</span>
                  {editingId ? (
                    <div className="exp-hdr-menu-wrap">
                      <button className="exp-hdr-icon-btn"
                        onClick={() => setShowFormMenu(m => !m)}
                        title="אפשרויות נוספות">
                        ···
                      </button>
                      {showFormMenu && (
                        <div className="exp-hdr-dropdown">
                          <button className="exp-hdr-dropdown-item exp-hdr-dropdown-item--danger"
                            onClick={() => { remove(editingId); setShowModal(false); setEditingId(null); setShowFormMenu(false); }}>
                            🗑️ מחק הוצאה
                          </button>
                        </div>
                      )}
                    </div>
                  ) : <span style={{ width: 36 }} />}
                </div>

                {/* Scrollable content */}
                <div className="exp-form-scroll">

                  {/* Amount LEFT + currency RIGHT (LTR row) */}
                  <div className="exp-form-amount-row">
                    <input
                      className="exp-amount-big"
                      type="number" min="0" step="0.01"
                      placeholder="0"
                      value={form.amount || ''}
                      autoFocus
                      onChange={e => setForm(f => ({ ...f, amount: Number(e.target.value) }))}
                    />
                    <select className="exp-cur-big"
                      value={form.currency}
                      onChange={e => setForm(f => ({ ...f, currency: e.target.value }))}>
                      {CURRENCIES.map(c => <option key={c}>{c}</option>)}
                    </select>
                  </div>

                  {/* Category (right) + subcategory (left) — grid layout like reference */}
                  <div className="exp-form-cat-row">
                    {/* Main category — colored filled box, click to go back to picker */}
                    <div className="exp-form-main-cat"
                      style={{ background: getCatMeta(form.category).color }}>
                      <button className="exp-form-cat-select-btn"
                        onClick={() => setStep('category')}>
                        <CatIcon cat={form.category} size={20} color="#fff"
                          fallback={getCatMeta(form.category).icon} />
                        <span>{form.category}</span>
                      </button>
                      <span className="exp-form-cat-chevron">▾</span>
                    </div>
                    {/* Subcategory select */}
                    {(() => {
                      const customCatObj = customCats.find(c => c.name === form.category);
                      const opts = customCatObj?.subcats?.length ? customCatObj.subcats : (SUBCATS[form.category] ?? []);
                      return (
                        <div className="exp-form-subcat-wrap">
                          <select className="exp-form-subcat"
                            value={form.subcategory || ''}
                            onChange={e => setForm(f => ({ ...f, subcategory: e.target.value || undefined }))}>
                            <option value="">— תת-קטגוריה —</option>
                            {opts.map(o => <option key={o} value={o}>{o}</option>)}
                          </select>
                          <span className="exp-form-subcat-chevron">▾</span>
                        </div>
                      );
                    })()}
                  </div>

                  {/* Description + note toggle */}
                  <div className="exp-form-desc-row">
                    <input className="exp-form-desc-inp"
                      placeholder="תיאור — מה שילמת?"
                      value={form.description}
                      onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                    />
                    <button
                      className={`exp-form-desc-plus${showNote ? ' active' : ''}`}
                      onClick={() => setShowNote(s => !s)}
                      title="הוסף הערה">
                      {showNote ? '−' : '+'}
                    </button>
                  </div>
                  {showNote && (
                    <div className="exp-form-note-row">
                      <input className="exp-form-note-inp"
                        placeholder="הערה / מספר קבלה"
                        value={form.receiptNote || ''}
                        onChange={e => setForm(f => ({ ...f, receiptNote: e.target.value || undefined }))}
                      />
                    </div>
                  )}

                  {/* Date mode toggle + early-purchase checkbox */}
                  <div className="exp-form-date-ctrl">
                    <div className="exp-form-date-toggle">
                      <button
                        className={`exp-form-date-tab${!spreadDays ? ' active' : ''}`}
                        onClick={() => { setSpreadDays(false); setForm(f => ({ ...f, dateEnd: undefined })); }}>
                        תאריך
                      </button>
                      <button
                        className={`exp-form-date-tab${spreadDays ? ' active' : ''}`}
                        onClick={() => setSpreadDays(true)}>
                        טווח תאריכים
                      </button>
                    </div>
                    <label className="exp-form-early-check">
                      <input type="checkbox" checked={earlyPurchase}
                        onChange={e => {
                          setEarlyPurchase(e.target.checked);
                          if (!e.target.checked) setForm(f => ({ ...f, useDate: undefined }));
                        }}
                      />
                      <span>רכישה מוקדמת</span>
                    </label>
                  </div>

                  {/* Date inputs — grid: cols depend on range/purchase state */}
                  <div className={[
                    'exp-form-date-grid',
                    spreadDays ? 'is-range' : '',
                    !earlyPurchase ? 'no-purchase' : '',
                  ].join(' ')}>
                    {/* dates sub-wrapper: display:contents → children are grid items */}
                    <div className="exp-form-date-dates">
                      <div className="exp-form-date-field">
                        <label className="exp-field-label">{spreadDays ? 'מתאריך' : 'תאריך'}</label>
                        <input className="exp-form-date-inp" type="date"
                          value={form.date}
                          onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                        />
                      </div>
                      {spreadDays && (
                        <div className="exp-form-date-field">
                          <label className="exp-field-label">עד תאריך</label>
                          <input className="exp-form-date-inp" type="date"
                            value={form.dateEnd || ''}
                            min={form.date}
                            onChange={e => setForm(f => ({ ...f, dateEnd: e.target.value }))}
                          />
                        </div>
                      )}
                    </div>
                    {earlyPurchase && (
                      <div className="exp-form-date-field">
                        <label className="exp-field-label">תאריך רכישה</label>
                        <input className="exp-form-date-inp" type="date"
                          value={form.useDate || ''}
                          onChange={e => setForm(f => ({ ...f, useDate: e.target.value }))}
                        />
                      </div>
                    )}
                    {spreadDays && form.dateEnd && form.dateEnd > form.date && form.amount > 0 && (
                      <span className="exp-spread-info-row">
                        {daysBetween(form.date, form.dateEnd) + 1} ימים · {(form.amount / (daysBetween(form.date, form.dateEnd) + 1)).toFixed(2)} {form.currency}/יום
                      </span>
                    )}
                  </div>

                  {/* Payment method — button-based segmented control */}
                  <div className="exp-payment-wrap" role="group" aria-label="אמצעי תשלום">
                    <span className="exp-field-label exp-payment-label">אמצעי תשלום</span>
                    <div className="exp-payment-opts">
                      {([ ['cash', 'מזומן'], ['card', 'אשראי'], ['online', 'הזמנה אינטרנטית'] ] as const).map(
                        ([val, label]) => (
                          <button key={val} type="button"
                            className={form.paymentMethod === val ? 'is-selected' : ''}
                            aria-pressed={form.paymentMethod === val}
                            onClick={() => setForm(f => ({ ...f, paymentMethod: val }))}>
                            {label}
                          </button>
                        )
                      )}
                    </div>
                  </div>

                </div>{/* end exp-form-scroll */}

                {/* Save — sticky at bottom, lime-yellow background */}
                <div className="exp-form-save-wrap">
                  <button className="exp-form-save-btn" onClick={save}
                    disabled={(!form.description.trim() && !form.subcategory?.trim()) || form.amount <= 0}>
                    שמור הוצאה
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

    </div>
  );
}

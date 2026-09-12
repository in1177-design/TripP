import { useState, useMemo } from 'react';
import type { Trip, Expense, ExpenseCategory, CustomCategory } from '../types';
import { generateId } from '../storage';

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
interface Props { trip: Trip; onChange: (t: Trip) => void; }

const DEFAULT_CUR = 'EUR';
const blankForm = (): Omit<Expense, 'id'> => ({
  date: new Date().toISOString().slice(0, 10),
  dateEnd: undefined,
  description: '', amount: 0,
  currency: DEFAULT_CUR, category: 'מסעדות', subcategory: undefined, paymentMethod: 'cash',
});

const blankNewCat = () => ({ icon: '', name: '', color: '#3498db' });

export default function ExpensesTab({ trip, onChange }: Props) {
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
  const [form, setForm]               = useState<Omit<Expense, 'id'>>(blankForm);
  const [spreadDays, setSpreadDays]   = useState(false);
  const [filterCur, setFilterCur]     = useState<string | null>(null);

  // Category editor state
  const [showCatEditor, setShowCatEditor]   = useState(false);
  const [newCatForm, setNewCatForm]         = useState(blankNewCat);
  const [addingCat, setAddingCat]           = useState(false);
  const [editingCatId, setEditingCatId]     = useState<string | null>(null);

  // Exchange rates editor
  const [showRatesEditor, setShowRatesEditor] = useState(false);

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

  // ── Totals per currency (count each expense once, regardless of spread)
  const totals = useMemo(() => {
    const t: Record<string, number> = {};
    expenses.forEach(e => { t[e.currency] = (t[e.currency] || 0) + e.amount; });
    return t;
  }, [expenses]);

  const allCurrencies = Object.keys(totals);
  const primaryCur    = filterCur && totals[filterCur] ? filterCur : (allCurrencies[0] || DEFAULT_CUR);
  const primaryTotal  = totals[primaryCur] || 0;
  const primaryExpenses = expenses.filter(e => e.currency === primaryCur);

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

  // update a single exchange rate and save
  function saveRate(currency: string, value: string) {
    const num = parseFloat(value);
    onChange({
      ...trip,
      exchangeRates: { ...(trip.exchangeRates || {}), [currency]: isNaN(num) ? 0 : num },
    });
  }

  // ── Category breakdown (count each expense once)
  const catRows = useMemo(() => {
    const t: Record<string, number> = {};
    primaryExpenses.forEach(e => { t[e.category] = (t[e.category] || 0) + e.amount; });
    return Object.entries(t)
      .sort((a, b) => b[1] - a[1])
      .map(([cat, amt]) => ({
        cat, amt,
        pct: primaryTotal > 0 ? amt / primaryTotal * 100 : 0,
        ...getCat(cat),
      }));
  }, [primaryExpenses, primaryTotal]);

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
        (map[e.date] ??= []).push(e);
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
    if (!form.description.trim() || form.amount <= 0) return;
    const dateEnd = spreadDays && form.dateEnd && form.dateEnd > form.date ? form.dateEnd : undefined;
    if (editingId) {
      // Update existing expense
      onChange({
        ...trip,
        expenses: expenses.map(e =>
          e.id === editingId ? { ...form, id: editingId, dateEnd } : e
        ),
      });
    } else {
      // Add new expense
      const toSave: Expense = { ...form, id: generateId(), dateEnd };
      onChange({ ...trip, expenses: [...expenses, toSave] });
    }
    setShowModal(false);
    setEditingId(null);
  }

  function remove(id: string) {
    onChange({ ...trip, expenses: expenses.filter(e => e.id !== id) });
  }

  function openModal() {
    setForm(blankForm());
    setSpreadDays(false);
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
      description: rest.description,
      amount: rest.amount,
      currency: rest.currency,
      category: rest.category,
      subcategory: rest.subcategory,
      receiptNote: rest.receiptNote,
      paymentMethod: rest.paymentMethod,
    });
    setSpreadDays(!!(rest.dateEnd && rest.dateEnd > rest.date));
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
            </>
          ) : (
            <div className="exp-stat exp-stat--setup">
              <span className="exp-stat-label">הגדר שערי חליפין לסיכום בשקלים</span>
            </div>
          )}
          <button className="exp-rates-btn" onClick={() => setShowRatesEditor(true)} title="שערי חליפין">
            ⚙️
          </button>
        </div>
      )}

      {/* ── PER-CURRENCY PILLS (for chart filtering) ── */}
      {allCurrencies.length > 0 && (
        <div className="exp-cur-pills">
          {allCurrencies.map(cur => (
            <button key={cur}
              className={`exp-cur-pill${primaryCur === cur ? ' active' : ''}`}
              onClick={() => setFilterCur(cur === filterCur ? null : cur)}>
              {cur} · {totals[cur].toFixed(0)}
            </button>
          ))}
        </div>
      )}

      {/* ── CHART ── */}
      {catRows.length > 0 && (
        <div className="exp-chart-card">
          <div className="exp-donut-wrap">
            <DonutChart slices={catRows.map(c => ({ color: c.color, amount: c.amt }))} />
          </div>
          <div className="exp-cat-breakdown">
            {catRows.map(c => (
              <div key={c.cat} className="exp-cat-brow">
                <span className="exp-cat-bdot" style={{ background: c.color }} />
                <CatIcon cat={c.cat} size={14} color={c.color} fallback={c.icon} />
                <span className="exp-cat-blabel">{c.cat}</span>
                <span className="exp-cat-bpct">{c.pct.toFixed(0)}%</span>
                <span className="exp-cat-bamt">{c.amt.toFixed(0)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── EXPENSE LIST ── */}
      {grouped.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">💳</div>
          <p>אין הוצאות עדיין</p>
          <p style={{ fontSize: 13, marginTop: 6, color: 'var(--ink-muted)' }}>לחצי על + כדי להוסיף</p>
        </div>
      ) : (
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
              {g.exps.map((exp, idx) => {
                const m = getCatMeta(exp.category);
                const isSpread = !!exp._numDays;
                const dispAmt  = exp._perDay ?? exp.amount;
                return (
                  <div key={`${exp.id}-${idx}`} className="exp-row"
                    onClick={() => openEdit(exp)} style={{ cursor: 'pointer' }}>
                    <div className="exp-icon-circle" style={{ background: m.color }}>
                      <CatIcon cat={exp.category} size={18} fallback={m.icon} />
                    </div>
                    <div className="exp-row-body">
                      <div className="exp-row-desc-line">
                        <span className="exp-row-desc">{exp.description}</span>
                        {isSpread && (
                          <span className="exp-spread-badge">{exp._numDays} ימים</span>
                        )}
                      </div>
                      <span className="exp-row-sub">
                        {exp.category}
                        {exp.subcategory ? ` › ${exp.subcategory}` : ''}
                        {exp.paymentMethod ? ` · ${exp.paymentMethod === 'cash' ? 'מזומן' : 'אשראי'}` : ''}
                        {isSpread && exp.dateEnd
                          ? ` · ${fmtDateShort(exp.date)}–${fmtDateShort(exp.dateEnd)}`
                          : ''}
                      </span>
                    </div>
                    <div className="exp-row-end">
                      <span className="exp-row-amt">
                        {dispAmt.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                      {isSpread && (
                        <span className="exp-row-total-hint">
                          סה״כ {exp.amount.toFixed(0)}
                        </span>
                      )}
                      <span className="exp-row-cur">{exp.currency}</span>
                    </div>
                    <button className="exp-del" onClick={e => { e.stopPropagation(); remove(exp.id); }} title="מחק">×</button>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

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
          <div className="exp-sheet" onClick={e => e.stopPropagation()}>

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
                <div className="exp-sheet-hdr">
                  <button className="exp-sheet-close"
                    onClick={() => editingId ? setShowModal(false) : setStep('category')}
                    title={editingId ? 'סגור' : 'חזור לקטגוריה'}>
                    {editingId ? '✕' : '←'}
                  </button>
                  <span className="exp-sheet-title">{editingId ? 'עריכת הוצאה' : 'הוצאה חדשה'}</span>
                  <button className="btn-primary btn-sm" onClick={save}
                    disabled={!form.description.trim() || form.amount <= 0}>
                    שמור
                  </button>
                </div>

                {/* Amount + currency */}
                <div className="exp-sheet-amount">
                  <div className="exp-icon-circle exp-icon-circle--lg" style={{ background: getCatMeta(form.category).color }}>
                    <CatIcon cat={form.category} size={22} fallback={getCatMeta(form.category).icon} />
                  </div>
                  <input
                    className="exp-amount-inp"
                    type="number" min="0" step="0.01"
                    placeholder="0.00"
                    value={form.amount || ''}
                    autoFocus
                    onChange={e => setForm(f => ({ ...f, amount: Number(e.target.value) }))}
                  />
                  <select className="exp-cur-sel"
                    value={form.currency}
                    onChange={e => setForm(f => ({ ...f, currency: e.target.value }))}>
                    {CURRENCIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>

                {/* Category label (clickable to go back) */}
                <button className="exp-cat-label-btn" onClick={() => setStep('category')}>
                  <span className="exp-cat-label-dot" style={{ background: getCatMeta(form.category).color }} />
                  {form.category}
                  <span className="exp-cat-label-change">שנה ›</span>
                </button>

                {/* Subcategory dropdown */}
                {(() => {
                  const customCatObj = customCats.find(c => c.name === form.category);
                  const opts = customCatObj?.subcats?.length
                    ? customCatObj.subcats
                    : (SUBCATS[form.category] ?? []);
                  if (opts.length === 0) return null;
                  return (
                    <div className="exp-subcat-wrap">
                      <select
                        className="exp-subcat-sel"
                        value={form.subcategory || ''}
                        onChange={e => setForm(f => ({ ...f, subcategory: e.target.value || undefined }))}
                      >
                        <option value="">— תת-קטגוריה —</option>
                        {opts.map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    </div>
                  );
                })()}

                {/* Fields */}
                <div className="exp-sheet-fields">
                  <input className="exp-field-inp"
                    placeholder="תיאור — מה שילמת?"
                    value={form.description}
                    onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  />

                  {/* Date(s) */}
                  <div className="exp-date-row">
                    <div className="exp-date-field">
                      <label className="exp-field-label">{spreadDays ? 'מתאריך' : 'תאריך'}</label>
                      <input className="exp-field-inp" type="date"
                        value={form.date}
                        onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                      />
                    </div>
                    {spreadDays && (
                      <div className="exp-date-field">
                        <label className="exp-field-label">עד תאריך</label>
                        <input className="exp-field-inp" type="date"
                          value={form.dateEnd || ''}
                          min={form.date}
                          onChange={e => setForm(f => ({ ...f, dateEnd: e.target.value }))}
                        />
                      </div>
                    )}
                  </div>

                  {/* Spread toggle */}
                  <button
                    className={`exp-spread-toggle${spreadDays ? ' active' : ''}`}
                    onClick={() => {
                      setSpreadDays(s => !s);
                      if (spreadDays) setForm(f => ({ ...f, dateEnd: undefined }));
                    }}>
                    📅 פרוס על מספר ימים
                    {spreadDays && form.dateEnd && form.dateEnd > form.date && (
                      <span className="exp-spread-info">
                        {daysBetween(form.date, form.dateEnd) + 1} ימים ·{' '}
                        {form.amount > 0
                          ? `${(form.amount / (daysBetween(form.date, form.dateEnd) + 1)).toFixed(2)} ${form.currency}/יום`
                          : ''}
                      </span>
                    )}
                  </button>

                  {/* Payment method */}
                  <div className="exp-pay-row">
                    {[
                      { k: 'cash' as const, label: '💵 מזומן' },
                      { k: 'card' as const, label: '💳 אשראי' },
                    ].map(({ k, label }) => (
                      <button key={k}
                        className={`exp-pay-chip${form.paymentMethod === k ? ' active' : ''}`}
                        onClick={() => setForm(f => ({ ...f, paymentMethod: k }))}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── EXCHANGE RATES EDITOR ── */}
      {showRatesEditor && (
        <div className="exp-overlay" onClick={() => setShowRatesEditor(false)}>
          <div className="exp-sheet exp-sheet--rates" onClick={e => e.stopPropagation()}>
            <div className="exp-sheet-hdr">
              <button className="exp-sheet-close" onClick={() => setShowRatesEditor(false)}>✕</button>
              <span className="exp-sheet-title">שערי חליפין → ₪</span>
              <span />
            </div>
            <p className="exp-rates-hint">הכנס כמה שקלים שווה 1 יחידה של כל מטבע</p>
            <div className="exp-rates-list">
              {(foreignCurs.length > 0 ? foreignCurs : CURRENCIES.filter(c => c !== 'ILS')).map(cur => (
                <div key={cur} className="exp-rate-row">
                  <span className="exp-rate-cur">1 {cur}</span>
                  <span className="exp-rate-eq">=</span>
                  <input
                    className="exp-rate-inp"
                    type="number" min="0" step="0.01"
                    placeholder="0.00"
                    value={trip.exchangeRates?.[cur] || ''}
                    onChange={e => saveRate(cur, e.target.value)}
                  />
                  <span className="exp-rate-ils">₪</span>
                  {trip.exchangeRates?.[cur] ? (
                    <span className="exp-rate-check">✓</span>
                  ) : (
                    <span className="exp-rate-missing">!</span>
                  )}
                </div>
              ))}
            </div>
            <p className="exp-rates-tip">💡 שערים נשמרים לנסיעה זו אוטומטית</p>
          </div>
        </div>
      )}
    </div>
  );
}

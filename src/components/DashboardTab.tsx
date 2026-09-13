/**
 * DashboardTab — two-column dark overview for a trip.
 *
 * Left column (RTL → right):
 *   HeroCard       — immersive image + greeting + day info
 *   BudgetCard     — spent / planned with progress bar
 *   ChecklistCard  — pre-trip to-do list
 *
 * Right column (RTL → left):
 *   ScheduleCard   — calendar strip + day timeline
 */
import type { Trip } from '../types';
import HeroCard                    from './dashboard/HeroCard';
import BudgetCard                  from './dashboard/BudgetCard';
import ChecklistCard  from './dashboard/ChecklistCard';
import type { CheckItem } from './dashboard/ChecklistCard';
import ScheduleCard                from './dashboard/ScheduleCard';

interface Props {
  trip:       Trip;
  onNavigate: (tab: string) => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getDates(start: string, end: string): string[] {
  const dates: string[] = [];
  const pad   = (n: number) => String(n).padStart(2, '0');
  const toKey = (d: Date)   => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  const d = new Date(start + 'T12:00:00');
  const e = new Date(end   + 'T12:00:00');
  while (d <= e) { dates.push(toKey(d)); d.setDate(d.getDate() + 1); }
  return dates;
}

function toILS(amount: number, currency: string, rates: Record<string, number>): number {
  return currency === 'ILS' ? amount : amount * (rates[currency] || 1);
}

/** Extract the first city from a destination string like "פולין — קרקוב וזקופנה 2026" */
function extractCity(destination: string): string {
  const afterDash = destination.includes('—')
    ? destination.split('—').pop()!.trim()
    : destination;
  return afterDash.replace(/\b\d{4}\b/g, '').trim().split(' ')[0];
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function DashboardTab({ trip, onNavigate }: Props) {
  const todayStr  = new Date().toISOString().slice(0, 10);
  const todayDate = new Date();
  const hour      = todayDate.getHours();

  const itinerary = trip.itinerary || [];
  const stays     = trip.stays     || [];
  const expenses  = trip.expenses  || [];
  const flights   = trip.flights   || [];
  const rates     = trip.exchangeRates || {};

  // ── Trip phase ─────────────────────────────────────────────────────────────
  const startDate = new Date(trip.startDate + 'T12:00:00');
  const endDate   = new Date(trip.endDate   + 'T12:00:00');
  const daysUntil = Math.ceil((startDate.getTime() - todayDate.getTime()) / 86400000);
  const isDuring  = daysUntil <= 0 && todayDate <= endDate;
  const totalDays = Math.floor((endDate.getTime() - startDate.getTime()) / 86400000) + 1;
  const dayNum    = isDuring
    ? Math.floor((todayDate.getTime() - startDate.getTime()) / 86400000) + 1
    : undefined;

  // ── HeroCard props ─────────────────────────────────────────────────────────
  const rawCity   = trip.dayBases?.[todayStr] || '';
  const city      = rawCity || extractCity(trip.destination || '');
  const greeting  = hour < 12 ? 'בוקר טוב' : hour < 17 ? 'צהריים טובים' : 'ערב טוב';
  const dd = String(todayDate.getDate()).padStart(2, '0');
  const mm = String(todayDate.getMonth() + 1).padStart(2, '0');

  const todayFirst = itinerary
    .filter(i => i.date === todayStr && i.type !== 'hotel')
    .sort((a, b) => (a.time || '').localeCompare(b.time || ''))[0];
  const heroSub = todayFirst?.notes || todayFirst?.name || '';

  // ── BudgetCard props ───────────────────────────────────────────────────────
  const totalSpent = expenses.reduce(
    (s, e) => s + toILS(e.amount, e.currency, rates), 0
  );
  const totalPlanned = [
    ...itinerary.filter(i => i.cost).map(i => toILS(i.cost!, i.currency || 'ILS', rates)),
    ...stays.filter(s => s.cost).map(s => toILS(s.cost!, s.currency || 'ILS', rates)),
  ].reduce((a, b) => a + b, 0);

  // ── ChecklistCard props ────────────────────────────────────────────────────
  const checkItems: CheckItem[] = [
    { label: 'לשמור את אישורי ההזמנה',           done: flights.length > 0 },
    { label: 'לוודא שביטוח הנסיעות בתוקף',        done: false              },
    { label: "לבדוק את מועד הצ'ק-אין לחזור",      done: stays.length > 0  },
  ];

  // ── ScheduleCard props ─────────────────────────────────────────────────────
  const dates = trip.startDate && trip.endDate
    ? getDates(trip.startDate, trip.endDate)
    : [];

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="dash-new" dir="rtl">

      {/* LEFT column (RTL → right side) */}
      <div className="dash-left">
        <HeroCard
          coverImage={trip.coverImage}
          date={`${dd}.${mm}`}
          greeting={greeting}
          city={city}
          dayNum={dayNum}
          totalDays={isDuring ? totalDays : undefined}
          daysUntil={!isDuring ? daysUntil : undefined}
          subtitle={heroSub}
        />

        <BudgetCard
          totalSpent={totalSpent}
          totalPlanned={totalPlanned}
          onNavigate={() => onNavigate('budget')}
        />

        <ChecklistCard items={checkItems} />
      </div>

      {/* RIGHT column (RTL → left side) */}
      <div className="dash-right">
        <ScheduleCard
          dates={dates}
          todayStr={todayStr}
          itinerary={itinerary}
          onNavigate={() => onNavigate('itinerary')}
        />
      </div>

    </div>
  );
}

import { useState } from 'react';
import type { Trip, DaySchedule, Place } from '../types';

interface Props {
  trip: Trip;
  onChange: (trip: Trip) => void;
}

function tripDays(trip: Trip): number {
  if (!trip.startDate || !trip.endDate) return 0;
  return Math.max(1, Math.ceil(
    (new Date(trip.endDate).getTime() - new Date(trip.startDate).getTime()) / 86400000
  ));
}

function dateForDay(startDate: string, day: number): string {
  if (!startDate) return `יום ${day}`;
  const d = new Date(startDate);
  d.setDate(d.getDate() + day - 1);
  return d.toLocaleDateString('he-IL', { weekday: 'short', day: 'numeric', month: 'short' });
}

function buildAutoSchedule(trip: Trip): DaySchedule[] {
  const days = tripDays(trip);
  if (days === 0) return [];

  const sorted = [...trip.places].sort((a, b) => Number(b.must) - Number(a.must));

  const hoursPerDay = 8;
  const schedule: DaySchedule[] = Array.from({ length: days }, (_, i) => ({
    day: i + 1,
    date: trip.startDate ? (() => { const d = new Date(trip.startDate); d.setDate(d.getDate() + i); return d.toISOString().slice(0, 10); })() : '',
    places: [],
  }));

  let dayIdx = 0;
  let hoursUsed = 0;

  for (const place of sorted) {
    const dur = place.duration ?? 2;
    if (hoursUsed + dur > hoursPerDay && dayIdx < days - 1) {
      dayIdx++;
      hoursUsed = 0;
    }
    schedule[dayIdx].places.push(place.id);
    hoursUsed += dur;
  }

  return schedule;
}

export default function ScheduleTab({ trip, onChange }: Props) {
  const [draggingPlace, setDraggingPlace] = useState<string | null>(null);
  const days = tripDays(trip);

  function autoGenerate() {
    const schedule = buildAutoSchedule(trip);
    onChange({ ...trip, schedule });
  }

  function removePlaceFromDay(dayNum: number, placeId: string) {
    const schedule = trip.schedule.map(d =>
      d.day === dayNum ? { ...d, places: d.places.filter(id => id !== placeId) } : d
    );
    onChange({ ...trip, schedule });
  }

  function handleDrop(e: React.DragEvent, dayNum: number) {
    e.preventDefault();
    if (!draggingPlace) return;
    const schedule = trip.schedule.map(d => ({
      ...d,
      places: d.places.filter(id => id !== draggingPlace),
    }));
    const target = schedule.find(d => d.day === dayNum);
    if (target) target.places.push(draggingPlace);
    onChange({ ...trip, schedule });
    setDraggingPlace(null);
  }

  function getPlace(id: string): Place | undefined {
    return trip.places.find(p => p.id === id);
  }

  const scheduledIds = new Set(trip.schedule.flatMap(d => d.places));
  const unscheduled = trip.places.filter(p => !scheduledIds.has(p.id));

  if (!trip.startDate || days === 0) {
    return (
      <div className="empty-state">
        <div className="empty-icon">🗓️</div>
        <p>הוסף תאריכי טיול בפרטי הטיול כדי לבנות מסלול</p>
      </div>
    );
  }

  return (
    <div className="schedule-tab">
      <div className="tab-toolbar">
        <span className="count-badge">{days} ימים</span>
        <button className="btn-primary btn-sm" onClick={autoGenerate} disabled={trip.places.length === 0}>
          ✨ בנה מסלול אוטומטי
        </button>
      </div>

      {unscheduled.length > 0 && (
        <div className="unscheduled-pool">
          <h4>לא משובצים ({unscheduled.length})</h4>
          <div className="pool-places">
            {unscheduled.map(p => (
              <div
                key={p.id}
                className="place-pill draggable"
                draggable
                onDragStart={() => setDraggingPlace(p.id)}
              >
                {p.nameHe}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="days-grid">
        {Array.from({ length: days }, (_, i) => i + 1).map(day => {
          const dayData = trip.schedule.find(d => d.day === day);
          const dayPlaces = (dayData?.places ?? []).map(id => getPlace(id)).filter(Boolean) as Place[];
          const totalHours = dayPlaces.reduce((sum, p) => sum + (p.duration ?? 2), 0);

          return (
            <div
              key={day}
              className="day-card"
              onDragOver={e => e.preventDefault()}
              onDrop={e => handleDrop(e, day)}
            >
              <div className="day-header">
                <strong>יום {day}</strong>
                <span className="day-date">{dateForDay(trip.startDate, day)}</span>
                <span className="day-hours">{totalHours}ש'</span>
              </div>
              <div className="day-places">
                {dayPlaces.map(p => (
                  <div
                    key={p.id}
                    className="place-pill draggable"
                    draggable
                    onDragStart={() => setDraggingPlace(p.id)}
                  >
                    <span>{p.nameHe}</span>
                    <button className="pill-remove" onClick={() => removePlaceFromDay(day, p.id)}>×</button>
                  </div>
                ))}
                {dayPlaces.length === 0 && (
                  <div className="drop-hint">גרור מקום לכאן</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

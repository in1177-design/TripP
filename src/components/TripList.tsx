import type { Trip } from '../types';

interface Props {
  trips: Trip[];
  onSelect: (trip: Trip) => void;
  onNew: () => void;
}

function tripDuration(trip: Trip): number {
  if (!trip.startDate || !trip.endDate) return 0;
  const diff = new Date(trip.endDate).getTime() - new Date(trip.startDate).getTime();
  return Math.max(1, Math.ceil(diff / 86400000));
}

function phaseLabel(phase: Trip['phase']) {
  if (phase === 'before') return { label: 'לפני', color: '#3b82f6' };
  if (phase === 'during') return { label: 'בטיול', color: '#10b981' };
  return { label: 'אחרי', color: '#8b5cf6' };
}

export default function TripList({ trips, onSelect, onNew }: Props) {
  return (
    <div className="trip-list">
      <div className="list-header">
        <h1>הטיולים שלי</h1>
        <button className="btn-primary" onClick={onNew}>+ טיול חדש</button>
      </div>

      {trips.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">🗺️</div>
          <h2>אין טיולים עדיין</h2>
          <p>לחץ על "טיול חדש" כדי להתחיל לתכנן</p>
        </div>
      ) : (
        <div className="cards-grid">
          {trips.map(trip => {
            const ph = phaseLabel(trip.phase);
            const days = tripDuration(trip);
            return (
              <button key={trip.id} className="trip-card" onClick={() => onSelect(trip)}>
                <div className="card-top">
                  <span className="destination">{trip.destination || 'ללא יעד'}</span>
                  <span className="phase-badge" style={{ background: ph.color }}>{ph.label}</span>
                </div>
                {trip.startDate && (
                  <div className="card-dates">
                    {trip.startDate} — {trip.endDate}
                    {days > 0 && <span className="days-chip">{days} ימים</span>}
                  </div>
                )}
                <div className="card-stats">
                  <span>👤 {trip.travelers}</span>
                  <span>📍 {trip.places.length} מקומות</span>
                  <span>💰 {trip.expenses.length} הוצאות</span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

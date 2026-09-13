/** BudgetCard — total spent vs planned with a teal progress bar */

interface Props {
  totalSpent:   number;   // ILS equivalent spent so far
  totalPlanned: number;   // ILS equivalent of all planned costs
  onNavigate:   () => void;
}

export default function BudgetCard({ totalSpent, totalPlanned, onNavigate }: Props) {
  const pct      = totalPlanned > 0 ? Math.min(100, (totalSpent / totalPlanned) * 100) : 0;
  const remaining = Math.max(0, totalPlanned - totalSpent);

  return (
    <div className="dash-dark-card">
      <div className="ddc-badge-row">
        <span className="ddc-badge">₪ · תקציב</span>
        <h3 className="ddc-title">התקציב שלנו</h3>
      </div>

      {totalPlanned > 0 ? (
        <>
          <div className="dbc-nums">
            <span className="dbc-spent">{Math.round(totalSpent).toLocaleString()}</span>
            <span className="dbc-slash"> / </span>
            <span className="dbc-planned">{Math.round(totalPlanned).toLocaleString()}</span>
          </div>

          <div className="dbc-bar-wrap">
            <div className="dbc-bar" style={{ width: `${pct}%` }} />
          </div>

          <div className="dbc-footer">
            <span>{Math.round(pct)}% מהתקציב נוצל</span>
            <span>נותרו ₪{Math.round(remaining).toLocaleString()}</span>
          </div>
        </>
      ) : (
        <p className="ddc-empty">אין תקציב מתוכנן עדיין</p>
      )}

      <button className="ddc-link" onClick={onNavigate}>לתקציב המלא →</button>
    </div>
  );
}

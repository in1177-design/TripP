/** ChecklistCard — pre-trip "peace of mind" checklist */

export interface CheckItem {
  label: string;
  done:  boolean;
}

interface Props {
  items: CheckItem[];
}

export default function ChecklistCard({ items }: Props) {
  const doneCnt = items.filter(c => c.done).length;

  return (
    <div className="dash-dark-card">
      <div className="ddc-badge-row">
        <span className="ddc-badge">{doneCnt} מתוך {items.length}</span>
        <h3 className="ddc-title">כדי לצאת בראש שקט</h3>
      </div>

      <div className="dcc-items">
        {items.map((item, i) => (
          <label key={i} className={`dcc-item${item.done ? ' done' : ''}`}>
            <span className={`dcc-box${item.done ? ' checked' : ''}`}>
              {item.done && '✓'}
            </span>
            <span className="dcc-label">{item.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

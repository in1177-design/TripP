/** HeroCard — the immersive trip-day card with background image, date, and greeting */

interface Props {
  coverImage?:   string;    // URL for background photo
  date:          string;    // formatted as "DD.MM"
  greeting:      string;    // e.g. "בוקר טוב"
  city:          string;    // current city
  dayNum?:       number;    // day X in the trip (null if not started)
  totalDays?:    number;    // total trip days
  daysUntil?:    number;    // days until trip starts (null if during/after)
  subtitle?:     string;    // first activity name/notes for the day
}

export default function HeroCard({
  coverImage, date, greeting, city, dayNum, totalDays, daysUntil, subtitle,
}: Props) {
  const dayLabel =
    dayNum != null && totalDays != null ? `יום ${dayNum} מתוך ${totalDays}` :
    daysUntil != null && daysUntil > 0  ? `עוד ${daysUntil} ימים` :
    'הטיול הסתיים';

  return (
    <div
      className="dhc"
      style={coverImage ? { backgroundImage: `url(${coverImage})` } : {}}
    >
      <div className="dhc-overlay">
        <div className="dhc-top">
          <span className="dhc-label">היום בטיול</span>
          <span className="dhc-daycount">{dayLabel}</span>
        </div>
        <div className="dhc-mid">
          <span className="dhc-date">{date}</span>
        </div>
        <div className="dhc-body">
          <h2 className="dhc-greeting">
            {greeting}{city ? `, ${city}` : ''}.
          </h2>
          {subtitle && <p className="dhc-sub">{subtitle}</p>}
        </div>
      </div>
    </div>
  );
}

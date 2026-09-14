import { useState } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { app, auth } from '../firebase';
import type { Trip, TripParticipant, TripRole } from '../types';

interface Props {
  trip: Trip;
  onClose: () => void;
  onUpdate: (updated: Trip) => void;
}

interface ShareResponse {
  uid: string;
  displayName: string;
  email: string;
}

const ROLE_LABELS: Record<TripRole, string> = {
  owner:  '👑 בעלים',
  editor: '✏️ עורך',
  viewer: '👁️ צופה',
};

export default function ShareSheet({ trip, onClose, onUpdate }: Props) {
  const [email,   setEmail]   = useState('');
  const [role,    setRole]    = useState<'editor' | 'viewer'>('editor');
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');
  const [success, setSuccess] = useState('');

  const isOwner = auth.currentUser?.uid === trip.ownerId;
  const participants: TripParticipant[] = trip.participants ?? [];

  async function handleShare() {
    if (!email.trim()) return;
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      const fns    = getFunctions(app, 'us-central1');
      const shareFn = httpsCallable<
        { tripId: string; email: string; role: string },
        ShareResponse
      >(fns, 'shareTrip');

      const result = await shareFn({ tripId: trip.id, email: email.trim(), role });
      const newParticipant: TripParticipant = {
        uid:         result.data.uid,
        email:       result.data.email,
        displayName: result.data.displayName,
        role,
      };

      // Optimistically update local trip state
      const existing = participants.filter(p => p.uid !== result.data.uid);
      const updated: Trip = {
        ...trip,
        participants:    [...existing, newParticipant],
        participantUids: [...new Set([...(trip.participantUids ?? []), result.data.uid])],
      };
      onUpdate(updated);
      setSuccess(`${result.data.displayName} נוסף${role === 'editor' ? ' כעורך' : ' כצופה'} ✓`);
      setEmail('');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      // Firebase wraps the error message
      const match = msg.match(/\(([^)]+)\)/);
      setError(match?.[1] ?? msg);
    } finally {
      setLoading(false);
    }
  }

  async function handleRemove(uid: string) {
    setLoading(true);
    setError('');
    try {
      const fns = getFunctions(app, 'us-central1');
      const removeFn = httpsCallable<{ tripId: string; participantUid: string }, { ok: boolean }>(
        fns, 'removeTripParticipant'
      );
      await removeFn({ tripId: trip.id, participantUid: uid });

      const updated: Trip = {
        ...trip,
        participants:    participants.filter(p => p.uid !== uid),
        participantUids: (trip.participantUids ?? []).filter(id => id !== uid),
      };
      onUpdate(updated);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="exp-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="exp-sheet share-sheet" dir="rtl">
        {/* Header */}
        <div className="exp-sheet-hdr">
          <span className="exp-sheet-title">שיתוף הטיול</span>
          <button className="exp-sheet-close" onClick={onClose}>✕</button>
        </div>

        {/* Current participants */}
        <div className="share-participants">
          {/* Owner row */}
          <div className="share-row share-row--owner">
            <span className="share-avatar">{trip.destination?.[0] ?? '✈'}</span>
            <div className="share-info">
              <span className="share-name">אתה (הבעלים)</span>
            </div>
            <span className="share-role-badge share-role--owner">{ROLE_LABELS.owner}</span>
          </div>

          {/* Participants */}
          {participants.map(p => (
            <div key={p.uid} className="share-row">
              <span className="share-avatar">
                {(p.displayName ?? p.email)?.[0]?.toUpperCase() ?? '?'}
              </span>
              <div className="share-info">
                <span className="share-name">{p.displayName ?? p.email}</span>
                <span className="share-email">{p.email}</span>
              </div>
              <span className={`share-role-badge share-role--${p.role}`}>
                {ROLE_LABELS[p.role]}
              </span>
              {isOwner && (
                <button
                  className="share-remove-btn"
                  onClick={() => handleRemove(p.uid)}
                  disabled={loading}
                  title="הסר משתתף"
                >
                  ✕
                </button>
              )}
            </div>
          ))}

          {participants.length === 0 && (
            <p className="share-empty">הטיול לא שותף עדיין עם אף אחד.</p>
          )}
        </div>

        {/* Add participant (owner only) */}
        {isOwner && (
          <div className="share-add">
            <p className="share-add-title">הוסף משתתף</p>
            <input
              className="share-email-input"
              type="email"
              placeholder="כתובת Gmail של בן המשפחה"
              value={email}
              onChange={e => { setEmail(e.target.value); setError(''); setSuccess(''); }}
              onKeyDown={e => e.key === 'Enter' && handleShare()}
              dir="ltr"
            />
            <div className="share-role-row">
              <button
                className={`share-role-btn${role === 'editor' ? ' active' : ''}`}
                onClick={() => setRole('editor')}
              >✏️ עורך — יכול לערוך</button>
              <button
                className={`share-role-btn${role === 'viewer' ? ' active' : ''}`}
                onClick={() => setRole('viewer')}
              >👁️ צופה — קריאה בלבד</button>
            </div>
            <button
              className="btn-forest share-submit"
              onClick={handleShare}
              disabled={loading || !email.trim()}
            >
              {loading ? 'מוסיף...' : 'הוסף'}
            </button>
            {error   && <p className="share-error">{error}</p>}
            {success && <p className="share-success">{success}</p>}
          </div>
        )}

        <p className="share-note">
          💡 על המשתמש להתחבר פעם אחת לאפליקציה לפני שניתן להוסיף אותו.
        </p>
      </div>
    </div>
  );
}

import { useState } from 'react';
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { auth } from '../firebase';

interface Props {
  onSignedIn?: () => void;
}

export default function SignInScreen({ onSignedIn }: Props) {
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  async function handleGoogle() {
    setLoading(true);
    setError('');
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
      onSignedIn?.();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      // User closed popup — not an error we surface
      if (!msg.includes('popup-closed-by-user')) {
        setError('ההתחברות נכשלה. נסי שוב.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="signin-screen" dir="rtl">
      <div className="signin-card">
        <div className="signin-logo">✈️</div>
        <h1 className="signin-title">MyTrip</h1>
        <p className="signin-sub">תכנון טיולים חכם לכל המשפחה</p>

        <button
          className={`signin-google-btn${loading ? ' loading' : ''}`}
          onClick={handleGoogle}
          disabled={loading}
        >
          {loading ? (
            <span className="signin-spinner" />
          ) : (
            <img
              src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg"
              alt=""
              width={20}
              height={20}
              className="signin-google-icon"
            />
          )}
          {loading ? 'מתחבר...' : 'כניסה עם Google'}
        </button>

        {error && <p className="signin-error">{error}</p>}

        <p className="signin-note">
          הכניסה מאובטחת דרך Firebase Auth.
          <br />
          המידע שלך פרטי ומוגן.
        </p>
      </div>
    </div>
  );
}

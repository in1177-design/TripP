import { useState, useEffect } from 'react';
import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
} from 'firebase/auth';
import { auth } from '../firebase';

interface Props {
  onSignedIn?: () => void;
}

const provider = new GoogleAuthProvider();

export default function SignInScreen({ onSignedIn }: Props) {
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  // Handle result when user comes back from a redirect-based sign-in
  useEffect(() => {
    getRedirectResult(auth)
      .then(result => {
        if (result?.user) onSignedIn?.();
      })
      .catch(() => {
        // Redirect result errors are silent — user can try again manually
      });
  }, [onSignedIn]);

  async function handleGoogle() {
    setLoading(true);
    setError('');
    try {
      // Popup works on desktop AND modern mobile browsers.
      // It's more reliable than redirect (no cross-site cookie dependency).
      await signInWithPopup(auth, provider);
      // onAuthStateChanged in App.tsx handles the rest
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);

      if (msg.includes('popup-blocked')) {
        // Popup was blocked by the browser — fall back to redirect flow
        try {
          await signInWithRedirect(auth, provider);
          // Page will navigate away; result handled in useEffect above on return
          return; // don't setLoading(false) — we're navigating away
        } catch {
          setError('ההתחברות נכשלה. נסי שוב.');
          setLoading(false);
        }
      } else if (msg.includes('popup-closed-by-user') || msg.includes('popup-closed')) {
        // User voluntarily closed the popup — not an error
        setLoading(false);
      } else {
        setError('ההתחברות נכשלה. נסי שוב.');
        setLoading(false);
      }
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

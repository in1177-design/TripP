import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY            ?? 'AIzaSyD6fT9kgIfOfDlXqMMOesLu_kNkoHvPHpc',
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN        ?? 'tripp-9be77.firebaseapp.com',
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID         ?? 'tripp-9be77',
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET     ?? 'tripp-9be77.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? '1050843744536',
  appId:             import.meta.env.VITE_FIREBASE_APP_ID             ?? '1:1050843744536:web:63b856051a291ca3bbf66d',
};

export const app  = initializeApp(firebaseConfig);
export const db   = getFirestore(app);
export const auth = getAuth(app);

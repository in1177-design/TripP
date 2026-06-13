import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyD6fT9kgIfOfDlXqMMOesLu_kNkoHvPHpc',
  authDomain: 'tripp-9be77.firebaseapp.com',
  projectId: 'tripp-9be77',
  storageBucket: 'tripp-9be77.firebasestorage.app',
  messagingSenderId: '1050843744536',
  appId: '1:1050843744536:web:63b856051a291ca3bbf66d',
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

/**
 * Migration: stamp all existing trip documents with ownerId.
 *
 * Run BEFORE deploying strict Firestore rules that require ownerId.
 * Usage:
 *   1. Set FIREBASE_UID to your own Firebase Auth UID (find it in the
 *      Firebase Console → Authentication → Users).
 *   2. Ensure GOOGLE_APPLICATION_CREDENTIALS points to a service-account
 *      key that has Firestore read/write permission, OR run with
 *      Application Default Credentials:
 *        gcloud auth application-default login
 *   3. npx tsx scripts/migrate-add-owners.ts
 *
 * The script is idempotent — it skips documents that already have ownerId.
 * No data is deleted. Back up before running in production.
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const OWNER_UID = process.env.FIREBASE_UID;
if (!OWNER_UID) {
  console.error('Set FIREBASE_UID environment variable to your Firebase Auth UID.');
  process.exit(1);
}

initializeApp(
  process.env.GOOGLE_APPLICATION_CREDENTIALS
    ? { credential: cert(process.env.GOOGLE_APPLICATION_CREDENTIALS) }
    : undefined, // falls back to Application Default Credentials
);

const db = getFirestore();

async function migrate() {
  const snap = await db.collection('trips').get();
  let updated = 0;
  let skipped = 0;

  const batch = db.batch();
  for (const doc of snap.docs) {
    const data = doc.data();
    if (data.ownerId) { skipped++; continue; }
    batch.update(doc.ref, { ownerId: OWNER_UID });
    updated++;
  }

  if (updated > 0) {
    await batch.commit();
    console.log(`✓ Stamped ${updated} trips with ownerId=${OWNER_UID}`);
  }
  if (skipped > 0) console.log(`  Skipped ${skipped} already-stamped trips.`);
  if (updated === 0 && skipped === 0) console.log('No trips found.');
}

migrate().catch(err => { console.error(err); process.exit(1); });

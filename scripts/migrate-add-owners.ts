/**
 * scripts/migrate-add-owners.ts
 *
 * Stamps all existing Firestore trips that lack an `ownerId` with the
 * Firebase UID you supply via FIREBASE_UID env variable.
 *
 * Usage:
 *   $env:FIREBASE_UID="your-uid-here"
 *   $env:GOOGLE_APPLICATION_CREDENTIALS="path/to/service-account.json"
 *   npx tsx scripts/migrate-add-owners.ts [--dry-run]
 *
 * Flags:
 *   --dry-run   Preview what would change without writing to Firestore.
 *
 * The script is idempotent — trips that already have ownerId are skipped.
 */

import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore, FieldValue }          from 'firebase-admin/firestore';

// ── Config ───────────────────────────────────────────────────────────────────

const OWNER_UID = process.env.FIREBASE_UID;
if (!OWNER_UID) {
  console.error('❌  Set FIREBASE_UID env variable to your Firebase Auth UID before running.');
  process.exit(1);
}

const DRY_RUN = process.argv.includes('--dry-run');
if (DRY_RUN) console.log('🔍  DRY RUN — no writes will be made.\n');

// ── Init ─────────────────────────────────────────────────────────────────────

initializeApp({ credential: applicationDefault() });
const db = getFirestore();

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const snap = await db.collection('trips').get();

  let toMigrate = 0;
  let skipped   = 0;

  const batch = db.batch();

  for (const docSnap of snap.docs) {
    const data = docSnap.data();

    if (data.ownerId) {
      console.log(`⏭   ${docSnap.id} — already has ownerId (${data.ownerId}), skipping`);
      skipped++;
      continue;
    }

    console.log(`✏️   ${docSnap.id} — destination: ${data.destination ?? '?'} — will stamp ownerId + participantUids`);
    toMigrate++;

    if (!DRY_RUN) {
      batch.update(docSnap.ref, {
        ownerId:         OWNER_UID,
        participantUids: FieldValue.arrayUnion(OWNER_UID),
      });
    }
  }

  if (!DRY_RUN && toMigrate > 0) {
    await batch.commit();
    console.log(`\n✅  Migrated ${toMigrate} trips. Skipped ${skipped}.`);
  } else {
    console.log(`\n${DRY_RUN ? '🔍  DRY RUN complete.' : '✅  Nothing to migrate.'}  Would migrate: ${toMigrate}  Skipped: ${skipped}`);
  }
}

main().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});

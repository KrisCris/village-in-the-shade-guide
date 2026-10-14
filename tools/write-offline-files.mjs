/**
 * Write the file lists the offline download reads (dist/app/offline-*.json).
 * Runs after Pagefind so the search index is included.
 *
 *   node tools/write-offline-files.mjs dist
 */
import { writeOfflineManifests } from '../src/pwa/offlineFiles.mjs';

const counts = await writeOfflineManifests(process.argv[2] ?? 'dist');
console.log(`Offline file lists: ${Object.entries(counts).map(([group, count]) => `${group} ${count}`).join(', ')}`);

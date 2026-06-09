// SHA-256 content hashing for the embedding skip-if-unchanged check.
//
// Lives in the Electron host (not @ziba/core) so core stays free of
// `node:crypto` and remains bundleable for web + mobile. SHA-256 is
// collision-resistant enough that an unchanged note reliably skips
// re-embedding while a single edited byte reliably triggers one.

import { createHash } from 'node:crypto';

export function hashContent(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

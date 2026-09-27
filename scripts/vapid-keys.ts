// Makes a VAPID key pair for web push (docs/V2.md §6.4): the public key goes
// in wrangler.jsonc's VAPID_PUBLIC_KEY, the private one is the Worker secret
// VAPID_PRIVATE_KEY (`wrangler secret put VAPID_PRIVATE_KEY`). Production's
// pair is set; a new one breaks every saved subscription, so this is for
// local work (`.dev.vars`) or a real rotation.
//
//   pnpm tsx scripts/vapid-keys.ts
import {
  exportPublicKey,
  generateKeyPair,
  toBase64url,
} from "../src/core/push";

const pair = await generateKeyPair("ECDSA", true);
const { d } = (await crypto.subtle.exportKey(
  "jwk",
  pair.privateKey,
)) as JsonWebKey;
console.log(
  `VAPID_PUBLIC_KEY=${toBase64url(await exportPublicKey(pair.publicKey))}`,
);
console.log(`VAPID_PRIVATE_KEY=${d}`);

import { describe, expect, it } from "vitest";
import { fromBase64url, toBase64url, utf8 } from "./bytes";
import {
  decryptPushPayload,
  encryptPushPayload,
  PUSH_MAX_PLAINTEXT,
} from "./encrypt";
import {
  exportPublicKey,
  generateKeyPair,
  importPrivateKey,
  importPublicKey,
  publicKeyBytes,
} from "./keys";
import { isPushEndpoint, pushHeaders, pushTopic } from "./request";
import {
  signVapidJwt,
  VAPID_JWT_SECONDS,
  vapidAuthorization,
  verifyVapidJwt,
} from "./vapid";

const b64 = (text: string) => {
  const bytes = fromBase64url(text);
  if (!bytes) throw new Error(`not base64url: ${text}`);
  return bytes;
};

// RFC 8291 Appendix A, with its line breaks and spaces removed.
const RFC8291 = {
  plaintext: "V2hlbiBJIGdyb3cgdXAsIEkgd2FudCB0byBiZSBhIHdhdGVybWVsb24",
  asPublic:
    "BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8",
  asPrivate: "yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw",
  uaPublic:
    "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4",
  uaPrivate: "q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94",
  salt: "DGv6ra1nlYgDCS1FRnbzlw",
  authSecret: "BTBZMqHH6r4Tts7J_aSIgg",
  header:
    "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8",
  ciphertext:
    "8pfeW0KbunFT06SuDKoJH9Ql87S1QUrdirN6GcG7sFz1y1sqLgVi1VhjVkHsUoEsbI_0LpXMuGvnzQ",
  // Section 5: the header and the ciphertext together.
  body: "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN",
};

async function rfcSender(): Promise<CryptoKeyPair> {
  const publicKey = b64(RFC8291.asPublic);
  return {
    publicKey: await importPublicKey(publicKey, "ECDH"),
    privateKey: await importPrivateKey(RFC8291.asPrivate, publicKey, "ECDH"),
  };
}

describe("encryptPushPayload (RFC 8291)", () => {
  it("reproduces Appendix A byte for byte", async () => {
    const body = await encryptPushPayload({
      plaintext: b64(RFC8291.plaintext),
      uaPublic: b64(RFC8291.uaPublic),
      authSecret: b64(RFC8291.authSecret),
      sender: await rfcSender(),
      salt: b64(RFC8291.salt),
    });
    const text = toBase64url(body);
    expect(text).toBe(RFC8291.body);
    // The 86-octet header, then the record.
    expect(toBase64url(body.slice(0, 86))).toBe(RFC8291.header);
    expect(toBase64url(body.slice(86))).toBe(RFC8291.ciphertext);
    expect(new TextDecoder().decode(b64(RFC8291.plaintext))).toBe(
      "When I grow up, I want to be a watermelon",
    );
  });

  it("decrypts Appendix A's message with the user agent's key", async () => {
    const uaPublic = b64(RFC8291.uaPublic);
    const plain = await decryptPushPayload({
      body: b64(RFC8291.body),
      uaPrivate: await importPrivateKey(RFC8291.uaPrivate, uaPublic, "ECDH"),
      uaPublic,
      authSecret: b64(RFC8291.authSecret),
    });
    expect(plain && toBase64url(plain)).toBe(RFC8291.plaintext);
  });

  it("round-trips a fresh key pair and salt, and refuses a wrong secret", async () => {
    const ua = await generateKeyPair("ECDH", true);
    const uaPublic = await exportPublicKey(ua.publicKey);
    const authSecret = crypto.getRandomValues(new Uint8Array(16));
    const sender = await generateKeyPair("ECDH");
    const message = utf8(JSON.stringify({ v: 1, title: "A seat opened" }));
    const body = await encryptPushPayload({
      plaintext: message,
      uaPublic,
      authSecret,
      sender,
      salt: crypto.getRandomValues(new Uint8Array(16)),
    });
    const back = await decryptPushPayload({
      body,
      uaPrivate: ua.privateKey,
      uaPublic,
      authSecret,
    });
    expect(back && new TextDecoder().decode(back)).toBe(
      new TextDecoder().decode(message),
    );
    expect(
      await decryptPushPayload({
        body,
        uaPrivate: ua.privateKey,
        uaPublic,
        authSecret: new Uint8Array(16),
      }),
    ).toBeNull();
  });

  it("refuses a message too big for one record, and a short salt", async () => {
    const args = {
      uaPublic: b64(RFC8291.uaPublic),
      authSecret: b64(RFC8291.authSecret),
      sender: await rfcSender(),
      salt: b64(RFC8291.salt),
    };
    await expect(
      encryptPushPayload({
        ...args,
        plaintext: new Uint8Array(PUSH_MAX_PLAINTEXT + 1),
      }),
    ).rejects.toThrow(RangeError);
    await expect(
      encryptPushPayload({
        ...args,
        plaintext: new Uint8Array(1),
        salt: new Uint8Array(8),
      }),
    ).rejects.toThrow(RangeError);
  });
});

describe("VAPID (RFC 8292)", () => {
  it("verifies the RFC's own example token", async () => {
    // Section 2.4, Figure 1, unwrapped.
    const jwt =
      "eyJ0eXAiOiJKV1QiLCJhbGciOiJFUzI1NiJ9.eyJhdWQiOiJodHRwczovL3B1c2guZXhhbXBsZS5uZXQiLCJleHAiOjE0NTM1MjM3NjgsInN1YiI6Im1haWx0bzpwdXNoQGV4YW1wbGUuY29tIn0.i3CYb7t4xfxCDquptFOepC9GAu_HLGkMlMuCGSK2rpiUfnK9ojFwDXb1JrErtmysazNjjvW2L9OkSSHzvoD1oA";
    const key =
      "BA1Hxzyi1RUM1b5wjxsn7nGxAszw2u61m164i3MrAIxHF6YK5h4SDYic-dRuU_RCPCfA5aq9ojSwk5Y2EmClBPs";
    expect(await verifyVapidJwt(jwt, key)).toEqual({
      aud: "https://push.example.net",
      exp: 1453523768,
      sub: "mailto:push@example.com",
    });
    // One changed claim and the signature no longer holds.
    const [h, , s] = jwt.split(".");
    const forged = toBase64url(
      utf8(
        JSON.stringify({
          aud: "https://push.example.net",
          exp: 1453523769,
          sub: "mailto:push@example.com",
        }),
      ),
    );
    expect(await verifyVapidJwt(`${h}.${forged}.${s}`, key)).toBeNull();
    // A key that isn't a point is a no, not a throw.
    expect(await verifyVapidJwt(jwt, RFC8291.authSecret)).toBeNull();
    expect(await verifyVapidJwt("a.b", key)).toBeNull();
  });

  it("signs an ES256 token that the public key verifies", async () => {
    const pair = await generateKeyPair("ECDSA", true);
    const publicKey = toBase64url(await exportPublicKey(pair.publicKey));
    const { d } = (await crypto.subtle.exportKey(
      "jwk",
      pair.privateKey,
    )) as JsonWebKey;
    if (!d) throw new Error("no d");
    const bytes = publicKeyBytes(publicKey);
    if (!bytes) throw new Error("bad key");
    // Imported the way the Worker does: `d` from a secret, the point from a var.
    const signer = await importPrivateKey(d, bytes, "ECDSA");
    const claims = {
      aud: "https://fcm.googleapis.com",
      exp: 1_790_000_000 + VAPID_JWT_SECONDS,
      sub: "mailto:alerts@terpsicle.com",
    };
    const jwt = await signVapidJwt(claims, signer);
    const header = fromBase64url(jwt.split(".")[0] ?? "");
    expect(header && JSON.parse(new TextDecoder().decode(header))).toEqual({
      typ: "JWT",
      alg: "ES256",
    });
    // Raw r ‖ s, 64 bytes, as JWS wants.
    expect(fromBase64url(jwt.split(".")[2] ?? "")?.length).toBe(64);
    expect(await verifyVapidJwt(jwt, publicKey)).toEqual(claims);
    expect(vapidAuthorization(jwt, publicKey)).toBe(
      `vapid t=${jwt}, k=${publicKey}`,
    );
  });
});

describe("publicKeyBytes", () => {
  it("takes a 65-byte uncompressed point only", () => {
    expect(publicKeyBytes(RFC8291.uaPublic)?.length).toBe(65);
    expect(publicKeyBytes(RFC8291.authSecret)).toBeNull();
    expect(publicKeyBytes("not base64!")).toBeNull();
  });
});

describe("fromBase64url", () => {
  it("reads unpadded and padded text, and refuses anything else", () => {
    expect(fromBase64url("AQID")).toEqual(new Uint8Array([1, 2, 3]));
    expect(fromBase64url("AQI")).toEqual(new Uint8Array([1, 2]));
    expect(fromBase64url("AQI=")).toEqual(new Uint8Array([1, 2]));
    expect(fromBase64url("A")).toBeNull();
    expect(fromBase64url("AQ+/")).toBeNull();
  });
});

describe("isPushEndpoint", () => {
  const remote = { allowLocal: false };
  it.each([
    "https://fcm.googleapis.com/fcm/send/abc:def",
    "https://updates.push.services.mozilla.com/wpush/v2/gAAAA",
    "https://web.push.apple.com/QGa1…",
    "https://wns2-bl2p.notify.windows.com/w/?token=abc",
  ])("takes %s", (endpoint) => {
    expect(isPushEndpoint(endpoint, remote)).toBe(true);
  });

  it.each([
    "http://fcm.googleapis.com/fcm/send/abc",
    "https://fcm.googleapis.com:8443/fcm/send/abc",
    "https://evil.example/fcm.googleapis.com",
    "https://fcm.googleapis.com.evil.example/x",
    "https://user:pw@fcm.googleapis.com/x",
    "http://127.0.0.1:9999/push/1",
    "not a url",
  ])("refuses %s", (endpoint) => {
    expect(isPushEndpoint(endpoint, remote)).toBe(false);
  });

  it("takes this machine in test mode only", () => {
    const local = { allowLocal: true };
    expect(isPushEndpoint("http://127.0.0.1:9999/push/1", local)).toBe(true);
    expect(isPushEndpoint("http://localhost:9999/push/1", local)).toBe(true);
    expect(isPushEndpoint("http://10.0.0.1/push/1", local)).toBe(false);
  });
});

describe("pushTopic and pushHeaders", () => {
  it("hashes a tag to at most 32 base64url characters", async () => {
    const topic = await pushTopic("seat:202608:CMSC351-0101");
    expect(topic).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(await pushTopic("seat:202608:CMSC351-0101")).toBe(topic);
    expect(await pushTopic("seat:202608:CMSC351-0102")).not.toBe(topic);
  });

  it("sets the coding, TTL, urgency, topic and authorization", () => {
    expect(
      pushHeaders({
        ttl: 3600.4,
        urgency: "high",
        topic: "t",
        authorization: "vapid t=x, k=y",
      }),
    ).toEqual({
      "Content-Type": "application/octet-stream",
      "Content-Encoding": "aes128gcm",
      TTL: "3600",
      Urgency: "high",
      Topic: "t",
      Authorization: "vapid t=x, k=y",
    });
  });
});

import { generateKeyPairSync } from "node:crypto";

export interface WebhookKeyPair {
  privateKeyPem: string;
  publicKeyPrefixed: string;
}

export function generateWebhookKeyPair(): WebhookKeyPair {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519", {
    privateKeyEncoding: {
      type: "pkcs8",
      format: "pem",
    },
    publicKeyEncoding: {
      type: "spki",
      format: "pem",
    },
  });

  const publicKeyPrefixed = publicKeyToPrefixed(publicKey);

  return { privateKeyPem: privateKey, publicKeyPrefixed };
}

function publicKeyToPrefixed(publicKeyPem: string): string {
  const base64Key = publicKeyPem
    .replace("-----BEGIN PUBLIC KEY-----", "")
    .replace("-----END PUBLIC KEY-----", "")
    .replace(/\s/g, "");

  return `whpk_${base64Key}`;
}

function prefixedToPublicKeyPem(prefixedKey: string): string {
  const base64Key = prefixedKey.replace("whpk_", "");
  return `-----BEGIN PUBLIC KEY-----\n${base64Key}\n-----END PUBLIC KEY-----`;
}

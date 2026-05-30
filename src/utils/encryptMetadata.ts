import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  hkdfSync,
} from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;

class MetadataEncryptionError extends Error {
  public readonly type = "MetadataEncryptionError";

  constructor(message: string, options?: { cause?: Error }) {
    super(message);
    this.name = "MetadataEncryptionError";
    this.cause = options?.cause;
  }

  static missingSecret(): MetadataEncryptionError {
    return new MetadataEncryptionError(
      "HMAC_SECRET is required for metadata encryption"
    );
  }

  static decryptionFailed(
    details: string,
    cause?: Error
  ): MetadataEncryptionError {
    return new MetadataEncryptionError(`Decryption failed: ${details}`, {
      cause,
    });
  }
}

function assertSecret(): Buffer {
  const secret = process.env.HMAC_SECRET;
  if (!secret) {
    throw MetadataEncryptionError.missingSecret();
  }
  return Buffer.from(
    hkdfSync(
      "sha256",
      secret,
      Buffer.alloc(0),
      Buffer.from("metadata-encryption"),
      32
    )
  );
}

export function encrypt(plaintext: string): string {
  const key = assertSecret();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, "utf-8", "base64");
  encrypted += cipher.final("base64");
  const authTag = cipher.getAuthTag();

  return `${iv.toString("base64")}:${authTag.toString("base64")}:${encrypted}`;
}

export function decrypt(ciphertext: string): string {
  const key = assertSecret();
  const parts = ciphertext.split(":");
  if (parts.length !== 3) {
    throw MetadataEncryptionError.decryptionFailed("Invalid encrypted format");
  }

  const iv = Buffer.from(parts[0]!, "base64");
  const authTag = Buffer.from(parts[1]!, "base64");
  const encrypted = parts[2]!;

  try {
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encrypted, "base64", "utf-8");
    decrypted += decipher.final("utf-8");
    return decrypted;
  } catch (error) {
    throw MetadataEncryptionError.decryptionFailed(
      "Auth tag verification failed",
      error instanceof Error ? error : undefined
    );
  }
}

export function isEncrypted(value: string): boolean {
  return /^[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/.test(value);
}

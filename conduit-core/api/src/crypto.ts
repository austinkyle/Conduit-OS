import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

function encryptionKey(): Buffer {
  const encoded = process.env.ENCRYPTION_KEY;
  if (!encoded || !/^[0-9a-fA-F]{64}$/.test(encoded)) {
    throw new Error('ENCRYPTION_KEY must be a 32-byte hexadecimal string');
  }
  return Buffer.from(encoded, 'hex');
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [iv, ciphertext, authTag].map((part) => part.toString('base64')).join(':');
}

export function decryptSecret(blob: string): string {
  const parts = blob.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted secret format');
  }

  const [ivPart, ciphertextPart, authTagPart] = parts as [string, string, string];
  const iv = Buffer.from(ivPart, 'base64');
  const ciphertext = Buffer.from(ciphertextPart, 'base64');
  const authTag = Buffer.from(authTagPart, 'base64');

  if (iv.length !== IV_LENGTH || authTag.length !== 16) {
    throw new Error('Invalid encrypted secret format');
  }

  const decipher = createDecipheriv(ALGORITHM, encryptionKey(), iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

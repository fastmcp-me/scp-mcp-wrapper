/**
 * Token encryption/decryption using AES-256-GCM
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';
import { getEncryptionKey, storeEncryptionKey } from './database-sqljs.js';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const SALT_LENGTH = 32;
const AUTH_TAG_LENGTH = 16;

// Cache the master key to avoid async lookups on every encrypt/decrypt
let masterKeyCache: Buffer | null = null;

/**
 * Get or create master encryption key
 */
async function getMasterKey(): Promise<Buffer> {
  // Return cached key if available
  if (masterKeyCache) {
    return masterKeyCache;
  }

  let keyData = await getEncryptionKey();

  if (!keyData) {
    // Generate new key
    const salt = randomBytes(SALT_LENGTH);
    const key = randomBytes(KEY_LENGTH);

    // Store with salt (in production, use OS keychain)
    const stored = JSON.stringify({
      salt: salt.toString('hex'),
      key: key.toString('hex')
    });

    await storeEncryptionKey(stored);
    masterKeyCache = key;
    return key;
  }

  // Retrieve existing key
  const parsed = JSON.parse(keyData);
  masterKeyCache = Buffer.from(parsed.key, 'hex');
  return masterKeyCache;
}

/**
 * Initialize encryption (loads/creates master key)
 */
export async function initEncryption(): Promise<void> {
  await getMasterKey();
}

/**
 * Encrypt a token (must call initEncryption first)
 */
export function encryptToken(token: string): string {
  if (!masterKeyCache) {
    throw new Error('Encryption not initialized - call initEncryption() first');
  }

  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, masterKeyCache, iv);

  const encrypted = Buffer.concat([
    cipher.update(token, 'utf8'),
    cipher.final()
  ]);

  const authTag = cipher.getAuthTag();

  // Combine iv + encrypted + authTag
  const result = {
    iv: iv.toString('hex'),
    data: encrypted.toString('hex'),
    tag: authTag.toString('hex')
  };

  return JSON.stringify(result);
}

/**
 * Decrypt a token (must call initEncryption first)
 */
export function decryptToken(encrypted: string): string {
  if (!masterKeyCache) {
    throw new Error('Encryption not initialized - call initEncryption() first');
  }

  const parsed = JSON.parse(encrypted);

  const iv = Buffer.from(parsed.iv, 'hex');
  const data = Buffer.from(parsed.data, 'hex');
  const authTag = Buffer.from(parsed.tag, 'hex');

  const decipher = createDecipheriv(ALGORITHM, masterKeyCache, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(data),
    decipher.final()
  ]);

  return decrypted.toString('utf8');
}

/**
 * Test encryption/decryption
 */
export async function testEncryption(): Promise<boolean> {
  try {
    await initEncryption();
    const testToken = 'test-token-' + randomBytes(16).toString('hex');
    const encrypted = encryptToken(testToken);
    const decrypted = decryptToken(encrypted);

    return testToken === decrypted;
  } catch (error) {
    return false;
  }
}

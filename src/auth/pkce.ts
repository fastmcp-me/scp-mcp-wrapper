/**
 * PKCE (Proof Key for Code Exchange) utilities
 */

import { randomBytes, createHash } from 'crypto';

/**
 * Generate code verifier (random string)
 */
export function generateCodeVerifier(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * Generate code challenge from verifier (SHA256)
 */
export function generateCodeChallenge(verifier: string): string {
  return createHash('sha256')
    .update(verifier)
    .digest('base64url');
}

/**
 * Generate PKCE pair
 */
export function generatePKCE(): {
  code_verifier: string;
  code_challenge: string;
  code_challenge_method: 'S256';
} {
  const code_verifier = generateCodeVerifier();
  const code_challenge = generateCodeChallenge(code_verifier);

  return {
    code_verifier,
    code_challenge,
    code_challenge_method: 'S256'
  };
}

/**
 * Generate random state parameter
 */
export function generateState(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * Token management with automatic refresh
 */

import type { MerchantAuthorization } from '../types.js';
import {
  getAuthorization,
  updateAuthorizationTokens
} from '../storage/database-sqljs.js';
import { encryptToken, decryptToken } from '../storage/encryption.js';
import { refreshAccessToken } from './oauth-client.js';

const TOKEN_REFRESH_THRESHOLD = 300000; // 5 minutes in milliseconds

/**
 * Get valid access token for a merchant (with auto-refresh)
 */
export async function getValidAccessToken(merchantDomain: string): Promise<string> {
  const auth = await getAuthorization(merchantDomain);

  if (!auth) {
    throw new Error(`No authorization found for ${merchantDomain}`);
  }

  // Check if token needs refresh
  const now = Date.now();
  const timeUntilExpiry = auth.expires_at - now;

  if (timeUntilExpiry < TOKEN_REFRESH_THRESHOLD) {
    // Token expired or expiring soon, refresh it
    await refreshTokenIfNeeded(auth);

    // Get updated authorization
    const updatedAuth = await getAuthorization(merchantDomain);
    if (!updatedAuth) {
      throw new Error('Authorization lost after refresh');
    }

    return decryptToken(updatedAuth.access_token_encrypted);
  }

  // Token is still valid
  return decryptToken(auth.access_token_encrypted);
}

/**
 * Refresh token if needed
 */
async function refreshTokenIfNeeded(auth: MerchantAuthorization): Promise<void> {
  // Decrypt refresh token
  const refreshToken = decryptToken(auth.refresh_token_encrypted);

  try {
    // Call refresh endpoint
    const tokenResponse = await refreshAccessToken(auth.scp_endpoint, refreshToken);

    // Encrypt new tokens
    const accessTokenEncrypted = encryptToken(tokenResponse.access_token);
    const refreshTokenEncrypted = encryptToken(tokenResponse.refresh_token);

    // Calculate expiration timestamp
    const expiresAt = Date.now() + (tokenResponse.expires_in * 1000);

    // Update database
    await updateAuthorizationTokens(
      auth.merchant_domain,
      accessTokenEncrypted,
      refreshTokenEncrypted,
      expiresAt
    );
  } catch (error: any) {
    throw new Error(`Failed to refresh token for ${auth.merchant_domain}: ${error.message}`);
  }
}

/**
 * Check if authorization exists and is valid
 */
export async function hasValidAuthorization(merchantDomain: string): Promise<boolean> {
  const auth = await getAuthorization(merchantDomain);

  if (!auth) {
    return false;
  }

  // Check if token is expired (with some buffer)
  const now = Date.now();
  return auth.expires_at > now;
}

/**
 * Get authorization info (without tokens)
 */
export async function getAuthorizationInfo(merchantDomain: string): Promise<{
  authorized: boolean;
  customer_email?: string;
  customer_id?: string;
  scopes?: string[];
  authorized_at?: number;
  expires_at?: number;
}> {
  const auth = await getAuthorization(merchantDomain);

  if (!auth) {
    return { authorized: false };
  }

  return {
    authorized: true,
    customer_email: auth.customer_email,
    customer_id: auth.customer_id,
    scopes: auth.scopes,
    authorized_at: auth.created_at,
    expires_at: auth.expires_at
  };
}

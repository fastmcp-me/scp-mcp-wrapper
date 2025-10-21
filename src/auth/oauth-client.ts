/**
 * OAuth 2.0 client with PKCE flow
 */

import type {
  AuthorizationRequest,
  AuthorizationResponse,
  PollResponse,
  TokenResponse,
  SCPCapabilities
} from '../types.js';
import { generatePKCE, generateState } from './pkce.js';

const CLIENT_ID = 'scp-mcp-server';
const CLIENT_NAME = 'SCP MCP Server';
const REDIRECT_URI = 'urn:ietf:wg:oauth:2.0:oob';

/**
 * Initiate OAuth authorization flow
 */
export async function initiateAuthorization(
  endpoint: string,
  email: string,
  domain: string,
  scopes: string[]
): Promise<{
  authRequestId: string;
  pollInterval: number;
  codeVerifier: string;
  state: string;
}> {
  const pkce = generatePKCE();
  const state = generateState();

  const request: AuthorizationRequest = {
    email,
    client_id: CLIENT_ID,
    client_name: CLIENT_NAME,
    domain: domain,
    scopes,
    code_challenge: pkce.code_challenge,
    code_challenge_method: pkce.code_challenge_method,
    redirect_uri: REDIRECT_URI,
    state
  };

  const response = await fetch(`${endpoint}/authorize/init`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(request),
    signal: AbortSignal.timeout(30000)
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({})) as any;
    throw new Error(
      error.error_description ||
      `Authorization failed: ${response.status} ${response.statusText}`
    );
  }

  const authResponse = await response.json() as AuthorizationResponse;

  return {
    authRequestId: authResponse.auth_request_id,
    pollInterval: authResponse.poll_interval,
    codeVerifier: pkce.code_verifier,
    state
  };
}

/**
 * Poll for authorization status
 */
export async function pollAuthorization(
  endpoint: string,
  authRequestId: string,
  maxAttempts: number = 150,
  pollInterval: number = 2,
  domain: string
): Promise<string> {
  let attempts = 0;

  while (attempts < maxAttempts) {
    const response = await fetch(
      `${endpoint}/authorize/poll?auth_request_id=${authRequestId}&client_id=${CLIENT_ID}`,
      {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        },
        signal: AbortSignal.timeout(10000)
      }
    );

    if (!response.ok) {
      throw new Error(`Poll failed: ${response.status} ${response.statusText}`);
    }

    const pollResponse = await response.json() as PollResponse;

    if (pollResponse.status === 'authorized' && pollResponse.code) {
      return pollResponse.code;
    } else if (pollResponse.status === 'denied') {
      throw new Error(`Authorization denied: ${pollResponse.reason || 'User declined'}`);
    } else if (pollResponse.status === 'expired') {
      throw new Error('Authorization request expired');
    }

    // Status is 'pending', wait and retry
    await new Promise(resolve => setTimeout(resolve, pollInterval * 1000));
    attempts++;
  }

  throw new Error('Authorization timeout: maximum poll attempts reached');
}

/**
 * Exchange authorization code for tokens
 */
export async function exchangeCodeForTokens(
  endpoint: string,
  code: string,
  codeVerifier: string
): Promise<TokenResponse> {
  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    code_verifier: codeVerifier,
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI
  });

  const response = await fetch(`${endpoint}/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: params.toString(),
    signal: AbortSignal.timeout(30000)
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({})) as any;
    throw new Error(
      error.error_description ||
      `Token exchange failed: ${response.status} ${response.statusText}`
    );
  }

  const tokenResponse = await response.json() as TokenResponse;

  return tokenResponse;
}

/**
 * Refresh access token
 */
export async function refreshAccessToken(
  endpoint: string,
  refreshToken: string
): Promise<TokenResponse> {
  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: CLIENT_ID
  });

  const response = await fetch(`${endpoint}/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: params.toString(),
    signal: AbortSignal.timeout(30000)
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({})) as any;
    throw new Error(
      error.error_description ||
      `Token refresh failed: ${response.status} ${response.statusText}`
    );
  }

  const tokenResponse = await response.json() as TokenResponse;

  return tokenResponse;
}

/**
 * Revoke token
 */
export async function revokeToken(
  endpoint: string,
  token: string
): Promise<void> {
  const params = new URLSearchParams({
    token,
    client_id: CLIENT_ID
  });

  const response = await fetch(`${endpoint}/revoke`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: params.toString(),
    signal: AbortSignal.timeout(30000)
  });

  if (!response.ok) {
    throw new Error(`Token revocation failed: ${response.status} ${response.statusText}`);
  }
}

/**
 * Complete authorization flow
 */
export async function completeAuthorizationFlow(
  endpoint: string,
  email: string,
  domain: string,
  scopes: string[],
  maxPollAttempts: number = 150
): Promise<{
  tokenResponse: TokenResponse;
  scopes: string[];
}> {
  // Step 1: Initiate authorization
  const { authRequestId, pollInterval, codeVerifier } = await initiateAuthorization(
    endpoint,
    email,
    domain,
    scopes
  );

  // Step 2: Poll for authorization
  const code = await pollAuthorization(endpoint, authRequestId, maxPollAttempts, pollInterval, domain);

  // Step 3: Exchange code for tokens
  const tokenResponse = await exchangeCodeForTokens(endpoint, code, codeVerifier);

  return {
    tokenResponse,
    scopes: tokenResponse.scope.split(' ')
  };
}

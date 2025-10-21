/**
 * HTTP client for SCP JSON-RPC requests
 */

import type { JSONRPCRequest, JSONRPCResponse, JSONRPCError } from '../types.js';

/**
 * Make JSON-RPC request to SCP server
 */
export async function makeRPCRequest<T = any>(
  endpoint: string,
  accessToken: string,
  method: string,
  params?: Record<string, any>
): Promise<T> {
  const request: JSONRPCRequest = {
    jsonrpc: '2.0',
    id: Date.now(),
    method,
    params
  };

  const response = await fetch(`${endpoint}/rpc`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`
    },
    body: JSON.stringify(request),
    signal: AbortSignal.timeout(30000)
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const rpcResponse = await response.json() as JSONRPCResponse<T>;

  if (rpcResponse.error) {
    throw new SCPError(
      rpcResponse.error.code,
      rpcResponse.error.message,
      rpcResponse.error.data
    );
  }

  if (rpcResponse.result === undefined) {
    throw new Error('Invalid JSON-RPC response: missing result');
  }

  return rpcResponse.result;
}

/**
 * SCP-specific error class
 */
export class SCPError extends Error {
  constructor(
    public code: number,
    message: string,
    public data?: any
  ) {
    super(message);
    this.name = 'SCPError';
  }

  /**
   * Check if error is specific type
   */
  isUnauthorized(): boolean {
    return this.code === -32000;
  }

  isForbidden(): boolean {
    return this.code === -32001;
  }

  isNotFound(): boolean {
    return this.code === -32002;
  }

  isRateLimited(): boolean {
    return this.code === -32003;
  }

  isCustomerNotFound(): boolean {
    return this.code === -32004;
  }
}

/**
 * Convenience methods for common SCP operations
 */
export async function getOrders(
  endpoint: string,
  accessToken: string,
  params?: { limit?: number; offset?: number; status?: string[] }
): Promise<any> {
  return makeRPCRequest(endpoint, accessToken, 'scp.get_orders', params);
}

export async function getLoyalty(
  endpoint: string,
  accessToken: string
): Promise<any> {
  return makeRPCRequest(endpoint, accessToken, 'scp.get_loyalty');
}

export async function getOffers(
  endpoint: string,
  accessToken: string,
  params?: { active_only?: boolean }
): Promise<any> {
  return makeRPCRequest(endpoint, accessToken, 'scp.get_offers', params);
}

export async function getPreferences(
  endpoint: string,
  accessToken: string
): Promise<any> {
  return makeRPCRequest(endpoint, accessToken, 'scp.get_preferences');
}

export async function getIntents(
  endpoint: string,
  accessToken: string,
  params?: {
    status?: string[];
    mechanism?: string;
    limit?: number;
    offset?: number;
  }
): Promise<any> {
  return makeRPCRequest(endpoint, accessToken, 'scp.get_intents', params);
}

export async function createIntent(
  endpoint: string,
  accessToken: string,
  params: {
    base_intent: string;
    mechanism: string;
    ai_assistant?: string;
    ai_session_id?: string;
    context?: Record<string, any>;
    visibility?: string;
    expires_at?: string;
  }
): Promise<any> {
  return makeRPCRequest(endpoint, accessToken, 'scp.create_intent', params);
}

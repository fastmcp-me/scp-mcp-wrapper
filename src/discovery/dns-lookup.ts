/**
 * DNS-based SCP endpoint discovery
 */

import { Resolver } from 'dns/promises';
import type { SCPCapabilities } from '../types.js';
import { getCachedEndpoint, cacheEndpoint } from "../storage/database-sqljs.js";
import { checkTestEndpoint, loadConfig } from '../config.js';

const DNS_QUERY_PREFIX = '_scp._tcp.';

/**
 * Discover SCP endpoint for a domain
 */
export async function discoverSCPEndpoint(domain: string): Promise<string | null> {
  // Check for test endpoint override first
  const testEndpoint = checkTestEndpoint(domain);
  if (testEndpoint) {
    return testEndpoint;
  }

  // Check for demo mode
  const config = loadConfig();
  if (config.demo_mode) {
    const demoEndpoint = config.demo_endpoint || 'https://demo.shoppercontextprotocol.io/v1';
    console.error(`[SCP] Demo mode enabled - using ${demoEndpoint} for all domains`);
    return demoEndpoint;
  }

  // Check cache first
  const cached = await getCachedEndpoint(domain);
  if (cached) {
    return cached.endpoint;
  }

  // Try DNS TXT record
  const dnsEndpoint = await tryDNSDiscovery(domain);
  if (dnsEndpoint) {
    // Cache the result
    await cacheEndpoint({
      domain,
      endpoint: dnsEndpoint,
      capabilities: null,
      discovered_at: Date.now(),
      ttl: 86400 // 24 hours
    });
    return dnsEndpoint;
  }

  // Try fallback methods
  const fallbackEndpoint = await tryFallbackDiscovery(domain);
  if (fallbackEndpoint) {
    // Cache the result
    await cacheEndpoint({
      domain,
      endpoint: fallbackEndpoint,
      capabilities: null,
      discovered_at: Date.now(),
      ttl: 86400 // 24 hours
    });
    return fallbackEndpoint;
  }

  return null;
}

/**
 * Try DNS TXT record discovery
 */
async function tryDNSDiscovery(domain: string): Promise<string | null> {
  const resolver = new Resolver();
  const query = `${DNS_QUERY_PREFIX}${domain}`;

  try {
    const records = await resolver.resolveTxt(query);

    for (const record of records) {
      // TXT records are returned as array of strings, join them
      const txt = record.join('');

      // Check if this is a SCP record
      if (txt.startsWith('v=scp1')) {
        // Extract endpoint URL
        const match = txt.match(/endpoint=(https:\/\/[^\s]+)/);
        if (match) {
          return match[1];
        }
      }
    }

    return null;
  } catch (error: any) {
    // DNS lookup failed (NXDOMAIN, NODATA, etc.)
    if (error.code === 'ENOTFOUND' || error.code === 'ENODATA') {
      return null;
    }
    throw error;
  }
}

/**
 * Try fallback discovery methods
 */
async function tryFallbackDiscovery(domain: string): Promise<string | null> {
  // Try .well-known URI
  const wellKnownUrl = `https://${domain}/.well-known/customer-context-protocol`;

  try {
    const response = await fetch(wellKnownUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      },
      signal: AbortSignal.timeout(5000)
    });

    if (response.ok) {
      const data = await response.json() as any;
      if (data.endpoint && typeof data.endpoint === 'string') {
        return data.endpoint;
      }
    }
  } catch (error) {
    // .well-known failed, continue to next method
  }

  // Try HTTP header
  try {
    const response = await fetch(`https://${domain}/`, {
      method: 'HEAD',
      signal: AbortSignal.timeout(5000)
    });

    const scpEndpoint = response.headers.get('SCP-Endpoint');
    if (scpEndpoint) {
      return scpEndpoint;
    }
  } catch (error) {
    // Header check failed
  }

  return null;
}

/**
 * Fetch capabilities from SCP endpoint
 */
export async function fetchCapabilities(endpoint: string): Promise<SCPCapabilities> {
  const capabilitiesUrl = `${endpoint}/capabilities`;

  const response = await fetch(capabilitiesUrl, {
    method: 'GET',
    headers: {
      'Accept': 'application/json'
    },
    signal: AbortSignal.timeout(10000)
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch capabilities: ${response.status} ${response.statusText}`);
  }

  const capabilities = await response.json() as SCPCapabilities;

  return capabilities;
}

/**
 * Discover endpoint and fetch capabilities
 */
export async function discoverWithCapabilities(domain: string): Promise<{
  endpoint: string;
  capabilities: SCPCapabilities;
} | null> {
  const endpoint = await discoverSCPEndpoint(domain);

  if (!endpoint) {
    return null;
  }

  try {
    const capabilities = await fetchCapabilities(endpoint);

    // Update cache with capabilities
    await cacheEndpoint({
      domain,
      endpoint,
      capabilities,
      discovered_at: Date.now(),
      ttl: 86400
    });

    return { endpoint, capabilities };
  } catch (error) {
    // Capabilities fetch failed, but we have endpoint
    return { endpoint, capabilities: null as any };
  }
}

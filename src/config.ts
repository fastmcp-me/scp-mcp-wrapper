/**
 * Configuration management
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import type { SCPConfig } from './types.js';

const SCP_DIR = join(homedir(), '.scp');
const CONFIG_PATH = join(SCP_DIR, 'config.json');

const DEFAULT_CONFIG: SCPConfig = {
  dns_resolver: '1.1.1.1',
  dns_cache_ttl: 86400,
  poll_interval: 2,
  max_poll_attempts: 150,
  token_refresh_threshold: 300,
  request_timeout: 30000,
  demo_mode: true, // Use localhost:8787 for demo
  demo_endpoint: 'https://demo.shoppercontextprotocol.io/v1'
};

/**
 * Load configuration (or create with defaults)
 */
export function loadConfig(): SCPConfig {
  if (!existsSync(SCP_DIR)) {
    mkdirSync(SCP_DIR, { recursive: true });
  }

  if (!existsSync(CONFIG_PATH)) {
    writeFileSync(CONFIG_PATH, JSON.stringify(DEFAULT_CONFIG, null, 2));
    return DEFAULT_CONFIG;
  }

  try {
    const data = readFileSync(CONFIG_PATH, 'utf8');
    const config = JSON.parse(data);

    // Merge with defaults (in case new config options added)
    return { ...DEFAULT_CONFIG, ...config };
  } catch (error) {
    console.error('Failed to load config, using defaults:', error);
    return DEFAULT_CONFIG;
  }
}

/**
 * Save configuration
 */
export function saveConfig(config: SCPConfig): void {
  if (!existsSync(SCP_DIR)) {
    mkdirSync(SCP_DIR, { recursive: true });
  }

  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

/**
 * Get config value
 */
export function getConfigValue<K extends keyof SCPConfig>(key: K): SCPConfig[K] {
  const config = loadConfig();
  return config[key];
}

/**
 * Get test endpoint override from environment variable
 * If SCP_TEST_ENDPOINT is set, all domains will use this endpoint
 *
 * Example: SCP_TEST_ENDPOINT=http://localhost:8787/v1
 */
export function getTestEndpointOverride(): string | null {
  return process.env.SCP_TEST_ENDPOINT || null;
}

/**
 * Check if a domain should use test endpoint override
 * Returns the test endpoint if set, otherwise null
 */
export function checkTestEndpoint(domain: string): string | null {
  const override = getTestEndpointOverride();

  if (override) {
    console.error(`[SCP] Using test endpoint override for ${domain}: ${override}`);
    return override;
  }

  return null;
}

/**
 * Enable or disable demo mode
 */
export function setDemoMode(enabled: boolean, endpoint?: string): void {
  const config = loadConfig();
  config.demo_mode = enabled;
  if (endpoint) {
    config.demo_endpoint = endpoint;
  }
  saveConfig(config);
  console.error(`[SCP] Demo mode ${enabled ? 'enabled' : 'disabled'}${endpoint ? ` with endpoint: ${endpoint}` : ''}`);
}

/**
 * Check if demo mode is enabled
 */
export function isDemoMode(): boolean {
  const config = loadConfig();
  return config.demo_mode === true;
}

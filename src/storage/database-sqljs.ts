/**
 * SQLite database operations using sql.js (pure JavaScript/WebAssembly)
 * This version works with mcpb pack since it has no native dependencies
 */

import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import { homedir } from 'os';
import { join } from 'path';
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'fs';
import type { MerchantAuthorization, EndpointCache } from '../types.js';

const SCP_DIR = join(homedir(), '.scp');
const DB_PATH = join(SCP_DIR, 'tokens.db');

// Ensure .scp directory exists
if (!existsSync(SCP_DIR)) {
  mkdirSync(SCP_DIR, { recursive: true });
}

let db: SqlJsDatabase | null = null;
let sqlJs: any = null;

/**
 * Initialize sql.js
 */
async function initSqlJsLib() {
  if (!sqlJs) {
    console.error('[SCP] Initializing sql.js...');
    sqlJs = await initSqlJs();
    console.error('[SCP] sql.js initialized');
  }
  return sqlJs;
}

/**
 * Save database to disk
 */
function saveDatabase(database: SqlJsDatabase) {
  try {
    const data = database.export();
    const buffer = Buffer.from(data);
    writeFileSync(DB_PATH, buffer);
  } catch (error) {
    console.error('[SCP] Error saving database:', error);
    throw error;
  }
}

/**
 * Get database instance (singleton)
 */
export async function getDatabase(): Promise<SqlJsDatabase> {
  if (!db) {
    try {
      console.error('[SCP] Initializing database at:', DB_PATH);

      const SQL = await initSqlJsLib();

      // Load existing database or create new one
      if (existsSync(DB_PATH)) {
        console.error('[SCP] Loading existing database');
        const buffer = readFileSync(DB_PATH);
        db = new SQL.Database(buffer);
      } else {
        console.error('[SCP] Creating new database');
        db = new SQL.Database();
      }

      if (!db) {
        throw new Error('Failed to create database instance');
      }

      console.error('[SCP] Database opened successfully');
      await initializeSchema(db);
      console.error('[SCP] Database schema initialized');

      // Save after initialization
      saveDatabase(db);
    } catch (error) {
      console.error('[SCP] FATAL: Failed to initialize database:', error);
      console.error('[SCP] DB_PATH:', DB_PATH);
      console.error('[SCP] Error details:', error instanceof Error ? error.stack : error);
      throw error;
    }
  }

  if (!db) {
    throw new Error('Database not initialized');
  }

  return db;
}

/**
 * Initialize database schema
 */
async function initializeSchema(db: SqlJsDatabase): Promise<void> {
  db.run(`
    CREATE TABLE IF NOT EXISTS merchant_authorizations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      merchant_domain TEXT NOT NULL UNIQUE,
      scp_endpoint TEXT NOT NULL,
      customer_id TEXT NOT NULL,
      customer_email TEXT NOT NULL,
      access_token_encrypted TEXT NOT NULL,
      refresh_token_encrypted TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      scopes TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS endpoint_cache (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      domain TEXT NOT NULL UNIQUE,
      endpoint TEXT NOT NULL,
      capabilities TEXT,
      discovered_at INTEGER NOT NULL,
      ttl INTEGER DEFAULT 86400
    );

    CREATE TABLE IF NOT EXISTS encryption_keys (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      key_encrypted TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_merchant_domain
      ON merchant_authorizations(merchant_domain);

    CREATE INDEX IF NOT EXISTS idx_customer_email
      ON merchant_authorizations(customer_email);

    CREATE INDEX IF NOT EXISTS idx_endpoint_domain
      ON endpoint_cache(domain);
  `);
}

/**
 * Store merchant authorization
 */
export async function storeAuthorization(auth: Omit<MerchantAuthorization, 'id'>): Promise<void> {
  const database = await getDatabase();

  database.run(
    `INSERT INTO merchant_authorizations (
      merchant_domain,
      scp_endpoint,
      customer_id,
      customer_email,
      access_token_encrypted,
      refresh_token_encrypted,
      expires_at,
      scopes,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(merchant_domain) DO UPDATE SET
      scp_endpoint = excluded.scp_endpoint,
      customer_id = excluded.customer_id,
      customer_email = excluded.customer_email,
      access_token_encrypted = excluded.access_token_encrypted,
      refresh_token_encrypted = excluded.refresh_token_encrypted,
      expires_at = excluded.expires_at,
      scopes = excluded.scopes,
      updated_at = excluded.updated_at`,
    [
      auth.merchant_domain,
      auth.scp_endpoint,
      auth.customer_id,
      auth.customer_email,
      auth.access_token_encrypted,
      auth.refresh_token_encrypted,
      auth.expires_at,
      JSON.stringify(auth.scopes),
      auth.created_at,
      auth.updated_at
    ]
  );

  saveDatabase(database);
}

/**
 * Get authorization for a merchant
 */
export async function getAuthorization(merchantDomain: string): Promise<MerchantAuthorization | null> {
  const database = await getDatabase();

  const stmt = database.prepare(
    'SELECT * FROM merchant_authorizations WHERE merchant_domain = ?'
  );
  stmt.bind([merchantDomain]);

  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();

    return {
      id: row.id as number,
      merchant_domain: row.merchant_domain as string,
      scp_endpoint: row.scp_endpoint as string,
      customer_id: row.customer_id as string,
      customer_email: row.customer_email as string,
      access_token_encrypted: row.access_token_encrypted as string,
      refresh_token_encrypted: row.refresh_token_encrypted as string,
      expires_at: row.expires_at as number,
      scopes: JSON.parse(row.scopes as string),
      created_at: row.created_at as number,
      updated_at: row.updated_at as number
    };
  }

  stmt.free();
  return null;
}

/**
 * Get all authorizations
 */
export async function getAllAuthorizations(): Promise<MerchantAuthorization[]> {
  const database = await getDatabase();

  const stmt = database.prepare(
    'SELECT * FROM merchant_authorizations ORDER BY updated_at DESC'
  );

  const results: MerchantAuthorization[] = [];

  while (stmt.step()) {
    const row = stmt.getAsObject();
    results.push({
      id: row.id as number,
      merchant_domain: row.merchant_domain as string,
      scp_endpoint: row.scp_endpoint as string,
      customer_id: row.customer_id as string,
      customer_email: row.customer_email as string,
      access_token_encrypted: row.access_token_encrypted as string,
      refresh_token_encrypted: row.refresh_token_encrypted as string,
      expires_at: row.expires_at as number,
      scopes: JSON.parse(row.scopes as string),
      created_at: row.created_at as number,
      updated_at: row.updated_at as number
    });
  }

  stmt.free();
  return results;
}

/**
 * Delete authorization
 */
export async function deleteAuthorization(merchantDomain: string): Promise<void> {
  const database = await getDatabase();

  database.run(
    'DELETE FROM merchant_authorizations WHERE merchant_domain = ?',
    [merchantDomain]
  );

  saveDatabase(database);
}

/**
 * Update tokens for an authorization
 */
export async function updateAuthorizationTokens(
  merchantDomain: string,
  accessTokenEncrypted: string,
  refreshTokenEncrypted: string,
  expiresAt: number
): Promise<void> {
  const database = await getDatabase();

  database.run(
    `UPDATE merchant_authorizations
    SET access_token_encrypted = ?,
        refresh_token_encrypted = ?,
        expires_at = ?,
        updated_at = ?
    WHERE merchant_domain = ?`,
    [accessTokenEncrypted, refreshTokenEncrypted, expiresAt, Date.now(), merchantDomain]
  );

  saveDatabase(database);
}

/**
 * Cache endpoint discovery
 */
export async function cacheEndpoint(cache: Omit<EndpointCache, 'id'>): Promise<void> {
  const database = await getDatabase();

  database.run(
    `INSERT INTO endpoint_cache (
      domain,
      endpoint,
      capabilities,
      discovered_at,
      ttl
    ) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(domain) DO UPDATE SET
      endpoint = excluded.endpoint,
      capabilities = excluded.capabilities,
      discovered_at = excluded.discovered_at,
      ttl = excluded.ttl`,
    [
      cache.domain,
      cache.endpoint,
      cache.capabilities ? JSON.stringify(cache.capabilities) : null,
      cache.discovered_at,
      cache.ttl || 86400
    ]
  );

  saveDatabase(database);
}

/**
 * Get cached endpoint
 */
export async function getCachedEndpoint(domain: string): Promise<EndpointCache | null> {
  const database = await getDatabase();

  const stmt = database.prepare(
    'SELECT * FROM endpoint_cache WHERE domain = ?'
  );
  stmt.bind([domain]);

  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();

    // Check if cache is expired
    const age = Date.now() - (row.discovered_at as number);
    if (age > (row.ttl as number) * 1000) {
      return null;
    }

    return {
      id: row.id as number,
      domain: row.domain as string,
      endpoint: row.endpoint as string,
      capabilities: row.capabilities ? JSON.parse(row.capabilities as string) : null,
      discovered_at: row.discovered_at as number,
      ttl: row.ttl as number
    };
  }

  stmt.free();
  return null;
}

/**
 * Store encryption key
 */
export async function storeEncryptionKey(keyEncrypted: string): Promise<void> {
  const database = await getDatabase();

  database.run(
    `INSERT INTO encryption_keys (id, key_encrypted, created_at)
    VALUES (1, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      key_encrypted = excluded.key_encrypted,
      created_at = excluded.created_at`,
    [keyEncrypted, Date.now()]
  );

  saveDatabase(database);
}

/**
 * Get encryption key
 */
export async function getEncryptionKey(): Promise<string | null> {
  const database = await getDatabase();

  const stmt = database.prepare(
    'SELECT key_encrypted FROM encryption_keys WHERE id = 1'
  );

  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();
    return row.key_encrypted as string;
  }

  stmt.free();
  return null;
}

/**
 * Close database connection
 */
export async function closeDatabase(): Promise<void> {
  if (db) {
    saveDatabase(db);
    db.close();
    db = null;
  }
}

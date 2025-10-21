#!/usr/bin/env node

/**
 * SCP Local MCP Server - Entry Point
 */

import { startServer } from './server.js';
import { testEncryption } from './storage/encryption.js';

async function main() {
  console.error('[SCP] Starting MCP server...');

  // Test encryption on startup
  console.error('[SCP] Testing encryption...');
  try {
    if (!(await testEncryption())) {
      console.error('[SCP] ERROR: Encryption test failed!');
      process.exit(1);
    }
    console.error('[SCP] Encryption test passed');
  } catch (error) {
    console.error('[SCP] ERROR: Encryption test threw exception:', error);
    process.exit(1);
  }

  // Start MCP server
  console.error('[SCP] Initializing server...');
  try {
    await startServer();
    console.error('[SCP] Server initialized successfully');
  } catch (error) {
    console.error('[SCP] ERROR: Server initialization failed:', error);
    throw error;
  }
}

main().catch(error => {
  console.error('[SCP] FATAL ERROR:', error);
  console.error('[SCP] Stack trace:', error.stack);
  process.exit(1);
});

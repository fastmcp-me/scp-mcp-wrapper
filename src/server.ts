/**
 * MCP Server implementation for SCP
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema
} from '@modelcontextprotocol/sdk/types.js';

import { discoverWithCapabilities } from './discovery/dns-lookup.js';
import { completeAuthorizationFlow, revokeToken } from './auth/oauth-client.js';
import { getAuthorizationInfo, getValidAccessToken } from './auth/token-manager.js';
import {
  getAuthorization,
  storeAuthorization,
  deleteAuthorization
} from './storage/database-sqljs.js';
import { encryptToken } from './storage/encryption.js';
import * as scpClient from './http/client.js';

/**
 * Create and configure MCP server
 */
export function createServer(): Server {
  const server = new Server(
    {
      name: 'scp-mcp-server',
      version: '0.1.0',
      instructions: `Shopper Context Protocol (SCP) Server

CRITICAL: ALWAYS GET REAL EMAIL FROM USER

When authorizing, you MUST get the user's actual email address.
❌ NEVER use placeholder emails like user@example.com
✅ ALWAYS ask: "What email address do you use with [Merchant]?"

IMPORTANT WORKFLOW:

BEFORE YOU DO ANYTHING YOU MUST SEE IF THE DOMAIN SUPPORTS SCP

   Check if domain supports SCP:
   - scp_check_domain_support(domain="acmestore.com")

   If not supported:
   - Tell user: "This domain does not support Shopper Context Protocol, tell them to email scp@cordial.com to get it hooked up"

1. AUTHORIZATION REQUIRED FIRST
   Before accessing ANY customer data, you MUST authorize with the merchant domain.

   Check authorization:
   - scp_check_authorization(domain="acmestore.com")

   If not authorized:
   - ASK USER: "What email address do you use with [Merchant Name]?"
   - WAIT for user to provide their REAL email
   - Call: scp_authorize(domain="...", email="user_provided_email", scopes=["orders", "loyalty", "preferences", "intent:read", "intent:create"])
   - Tell user: "Please check your email for a magic link to authorize access"

2. ACCESSING DATA
   Once authorized, use these tools:
   - scp_get_orders(domain="...") - Order history
   - scp_get_loyalty(domain="...") - Loyalty status
   - scp_get_preferences(domain="...") - Saved preferences
   - scp_get_intents(domain="...") - Shopping intents

3. CREATING INTENTS
   When user expresses a shopping goal, create an intent:
   - scp_create_intent(domain="...", base_intent="...", context={...})

4. ERROR HANDLING
   If you get "Not authorized" error:
   - Follow authorization workflow above
   If you get "Invalid email" error:
   - Ask user for their REAL email address

REMEMBER:
✅ ALWAYS ask user for their real email address before authorizing
✅ ALWAYS check authorization before accessing data
✅ Request comprehensive scopes upfront: ["orders", "loyalty", "preferences", "intent:read", "intent:create"]
✅ Create intents when users express shopping goals
❌ NEVER use example.com or placeholder email addresses
❌ NEVER access data without authorization first`
    },
    {
      capabilities: {
        tools: {},
        prompts: {}
      }
    }
  );

  // Register prompts - provide instructions to LLM
  server.setRequestHandler(ListPromptsRequestSchema, async () => ({
    prompts: [
      {
        name: 'scp-usage-guide',
        description: 'How to use Shopper Context Protocol (SCP) tools',
        arguments: []
      }
    ]
  }));

  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    if (request.params.name === 'scp-usage-guide') {
      return {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `# Shopper Context Protocol (SCP) - Usage Guide

You have access to Shopper Context Protocol tools that allow you to securely access shopper data from merchants.

## IMPORTANT: Authorization Required First

Before accessing ANY shopper data, you MUST authorize with the merchant domain first.

## Step-by-Step Workflow

BEFORE YOU DO ANYTHING YOU MUST SEE IF THE DOMAIN SUPPORTS SCP

   Check if domain supports SCP:
   - scp_check_domain_support(domain="acmestore.com")

   If not supported:
   - Tell user: "This domain does not support Shopper Context Protocol, tell them to email scp@cordial.com to get it hooked up"

### 1. When User Asks About Merchant Data

Example: "Show me my Boot Barn orders"

**Step 1:** Check if already authorized
\`\`\`
scp_check_authorization(domain="acmestore.com")
\`\`\`

**If NOT authorized:**

**Step 2:** Ask the user for their email
"What email address do you use with Boot Barn?"

**Step 3:** Authorize with the merchant
\`\`\`
scp_authorize(
  domain="acmestore.com",
  email="user@example.com",
  scopes=["orders", "loyalty", "preferences", "intent:read", "intent:create"]
)
\`\`\`

**Step 4:** Inform user they'll receive a magic link
"I've started the authorization process. Please check your email for a magic link from Boot Barn and click it to authorize access."

**Step 5:** After user confirms, proceed to access data

### 2. Accessing Customer Data

Once authorized, use these tools:

**Get Orders:**
\`\`\`
scp_get_orders(domain="acmestore.com", limit=10)
\`\`\`

**Get Loyalty Status:**
\`\`\`
scp_get_loyalty(domain="acmestore.com")
\`\`\`

**Get Preferences:**
\`\`\`
scp_get_preferences(domain="acmestore.com")
\`\`\`

**Get Shopping Intents:**
\`\`\`
scp_get_intents(domain="acmestore.com", status=["active", "in_progress"])
\`\`\`

### 3. Creating Shopping Intents

When a user expresses a shopping goal, create an intent to track it:

Example: "I'm looking for hiking boots for a summer trip to Colorado"

\`\`\`
scp_create_intent(
  domain="acmestore.com",
  base_intent="Find hiking boots for summer Colorado trip",
  context={
    "trip_date": "2025-07-15",
    "location": "Colorado mountains",
    "activities": ["hiking", "camping"],
    "budget": "under $250"
  },
  ai_assistant="claude"
)
\`\`\`

This allows the merchant to help fulfill the intent across touchpoints (website, store, email, etc.)

### 4. Discovering New Merchants

If you need to find a merchant's SCP endpoint:

\`\`\`
scp_discover(domain="acmestore.com")
\`\`\`

This returns the SCP endpoint URL and supported capabilities.

## Common Scopes

Request these scopes based on what data you need:

- \`orders\` - Order history
- \`loyalty\` - Loyalty points and tier
- \`offers\` - Personalized offers
- \`preferences\` - Saved sizes, addresses, brands
- \`intent:read\` - View shopping intents
- \`intent:create\` - Create new intents
- \`intent:write\` - Update existing intents

**Best Practice:** Request all commonly-needed scopes upfront:
\`["orders", "loyalty", "preferences", "intent:read", "intent:create"]\`

## Error Handling

### "Not Authorized" Error

If you get this error:
\`\`\`
❌ Not authorized with acmestore.com.
Please authorize first by calling: scp_authorize...
\`\`\`

**Action:** Follow the authorization workflow (ask for email, call scp_authorize)

### "Customer Not Found" Error

The email address doesn't have an account with this merchant.

**Action:** Ask user to verify their email or check if they have an account.

### "Missing Scope" Error

The authorization doesn't include the required scope.

**Action:** Re-authorize with additional scopes:
\`\`\`
scp_revoke_authorization(domain="acmestore.com")
scp_authorize(domain="acmestore.com", email="...", scopes=["orders", "loyalty", "new_scope"])
\`\`\`

## Example Conversation Flow

**User:** "What are my recent Boot Barn orders?"

**You:**
1. Call \`scp_check_authorization(domain="acmestore.com")\`
2. If not authorized:
   - Ask: "What email do you use with Acme Store?"
   - User provides: "john@example.com"
   - Call \`scp_authorize(domain="acmestore.com", email="john@example.com", scopes=[...])\`
   - Say: "Please check your email for a magic link to authorize access."
   - Wait for confirmation
3. Call \`scp_get_orders(domain="acmestore.com", limit=5)\`
4. Present orders in a friendly format

## Security & Privacy

- All data is fetched in real-time from the merchant (nothing stored)
- Tokens are encrypted locally
- Each merchant has isolated authorization
- User can revoke access anytime with \`scp_revoke_authorization\`

## Remember

✅ ALWAYS check authorization before accessing data
✅ ALWAYS ask for email if not authorized
✅ Create intents when users express shopping goals
✅ Use appropriate scopes for the data needed
✅ Present data in a user-friendly way
❌ NEVER try to access data without authorization
❌ NEVER store or cache customer data
❌ NEVER use @example.com email addresses, always use a real email address and ask the user for it if not provided
`
            }
          }
        ]
      };
    }

    throw new Error('Unknown prompt');
  });

  // Register tool handlers
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: 'scp_authorize',
        description: 'BEFORE USING THIS ENSURE THE DOMAIN SUPPORTS SCP BY CALLING scp_discover FIRST. Authorize access to a merchant\'s customer context via SCP. Must be called before accessing any customer data. IMPORTANT: You must ask the user for their REAL email address - never use placeholder emails like user@example.com. Ask: "What email address do you use with [Merchant]?" and wait for their response.',
        inputSchema: {
          type: 'object',
          properties: {
            domain: {
              type: 'string',
              description: 'Merchant domain (e.g., \'acmestore.com\')'
            },
            email: {
              type: 'string',
              description: 'Customer\'s REAL email address (must ask user for this - never use example.com or placeholder emails)'
            },
            scopes: {
              type: 'array',
              items: { type: 'string' },
              description: 'Requested scopes (e.g., [\'orders\', \'loyalty\', \'intent:read\']). Best practice: request all needed scopes upfront.'
            }
          },
          required: ['domain', 'email', 'scopes']
        }
      },
      {
        name: 'scp_check_authorization',
        description: 'Check if authorized with a merchant domain',
        inputSchema: {
          type: 'object',
          properties: {
            domain: {
              type: 'string',
              description: 'Merchant domain'
            }
          },
          required: ['domain']
        }
      },
      {
        name: 'scp_revoke_authorization',
        description: 'Revoke authorization with a merchant domain',
        inputSchema: {
          type: 'object',
          properties: {
            domain: {
              type: 'string',
              description: 'Merchant domain'
            }
          },
          required: ['domain']
        }
      },
      {
        name: 'scp_discover',
        description: 'Discover SCP endpoint for a merchant domain via DNS',
        inputSchema: {
          type: 'object',
          properties: {
            domain: {
              type: 'string',
              description: 'Merchant domain'
            }
          },
          required: ['domain']
        }
      },
      {
        name: 'scp_get_orders',
        description: 'Get order history from a merchant. Domain must be authorized first.',
        inputSchema: {
          type: 'object',
          properties: {
            domain: {
              type: 'string',
              description: 'Merchant domain'
            },
            limit: {
              type: 'number',
              description: 'Maximum number of orders to return',
              default: 10
            },
            offset: {
              type: 'number',
              description: 'Number of orders to skip',
              default: 0
            },
            status: {
              type: 'array',
              items: { type: 'string' },
              description: 'Filter by order status (e.g., [\'delivered\', \'shipped\'])'
            }
          },
          required: ['domain']
        }
      },
      {
        name: 'scp_get_loyalty',
        description: 'Get loyalty status and points from a merchant. Domain must be authorized first.',
        inputSchema: {
          type: 'object',
          properties: {
            domain: {
              type: 'string',
              description: 'Merchant domain'
            }
          },
          required: ['domain']
        }
      },
      {
        name: 'scp_get_offers',
        description: 'Get active personalized offers from a merchant. Domain must be authorized first.',
        inputSchema: {
          type: 'object',
          properties: {
            domain: {
              type: 'string',
              description: 'Merchant domain'
            },
            active_only: {
              type: 'boolean',
              description: 'Only return active offers',
              default: true
            }
          },
          required: ['domain']
        }
      },
      {
        name: 'scp_get_preferences',
        description: 'Get saved customer preferences (sizes, styles, addresses) from a merchant. Domain must be authorized first.',
        inputSchema: {
          type: 'object',
          properties: {
            domain: {
              type: 'string',
              description: 'Merchant domain'
            }
          },
          required: ['domain']
        }
      },
      {
        name: 'scp_get_intents',
        description: 'Get shopping intents from a merchant. Domain must be authorized first.',
        inputSchema: {
          type: 'object',
          properties: {
            domain: {
              type: 'string',
              description: 'Merchant domain'
            },
            status: {
              type: 'array',
              items: { type: 'string' },
              description: 'Filter by status (e.g., [\'active\', \'in_progress\'])'
            },
            limit: {
              type: 'number',
              description: 'Maximum number of intents to return',
              default: 10
            }
          },
          required: ['domain']
        }
      },
      {
        name: 'scp_create_intent',
        description: 'Create a new shopping intent with a merchant. Domain must be authorized with intent:create scope.',
        inputSchema: {
          type: 'object',
          properties: {
            domain: {
              type: 'string',
              description: 'Merchant domain'
            },
            base_intent: {
              type: 'string',
              description: 'Natural language description of the shopping goal'
            },
            context: {
              type: 'object',
              description: 'Additional context about the intent'
            },
            mechanism: {
              type: 'string',
              description: 'How the intent was created',
              default: 'conversational_ai'
            },
            ai_assistant: {
              type: 'string',
              description: 'Name of the AI assistant'
            },
            visibility: {
              type: 'string',
              description: 'Who can see this intent',
              enum: ['merchant_only', 'shared_with_customer'],
              default: 'merchant_only'
            }
          },
          required: ['domain', 'base_intent']
        }
      },
      {
        name: 'scp_update_intent',
        description: 'Update an existing shopping intent. Domain must be authorized with intent:write scope.',
        inputSchema: {
          type: 'object',
          properties: {
            domain: {
              type: 'string',
              description: 'Merchant domain'
            },
            intent_id: {
              type: 'string',
              description: 'Intent ID to update'
            },
            status: {
              type: 'string',
              description: 'New status'
            },
            context: {
              type: 'object',
              description: 'Updated context'
            },
            add_milestone: {
              type: 'string',
              description: 'Add a milestone note'
            }
          },
          required: ['domain', 'intent_id']
        }
      }
    ]
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    if (!args) {
      throw new Error('Missing tool arguments');
    }

    try {
      switch (name) {
        case 'scp_authorize':
          return await handleAuthorize(args.domain as string, args.email as string, args.scopes as string[]);

        case 'scp_check_authorization':
          return await handleCheckAuthorization(args.domain as string);

        case 'scp_revoke_authorization':
          return await handleRevokeAuthorization(args.domain as string);

        case 'scp_discover':
          return await handleDiscover(args.domain as string);

        case 'scp_get_orders':
          return await handleGetOrders(args.domain as string, args);

        case 'scp_get_loyalty':
          return await handleGetLoyalty(args.domain as string);

        case 'scp_get_offers':
          return await handleGetOffers(args.domain as string, args);

        case 'scp_get_preferences':
          return await handleGetPreferences(args.domain as string);

        case 'scp_get_intents':
          return await handleGetIntents(args.domain as string, args);

        case 'scp_create_intent':
          return await handleCreateIntent(args.domain as string, args);

        case 'scp_update_intent':
          return await handleUpdateIntent(args.domain as string, args);

        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (error: any) {
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${error.message}`
          }
        ],
        isError: true
      };
    }
  });

  return server;
}

/**
 * Tool handler: scp_authorize
 * Handles both initial authorization and re-authorization with scope changes
 */
async function handleAuthorize(
  domain: string,
  email: string,
  scopes: string[]
) {
  // Validate email - reject example/test emails
  if (email.endsWith('@example.com') || email.includes('example')) {
    return {
      content: [
        {
          type: 'text',
          text: `❌ Invalid email address: ${email}\n\nPlease use a REAL email address, not an example one.\n\nAsk the user: "What email address do you use with ${domain}?"\n\nThen call scp_authorize again with their actual email address.`
        }
      ]
    };
  }

  // Check if already authorized
  const existing = await getAuthorization(domain);

  if (existing) {
    // Compare requested scopes with existing scopes
    const existingScopes = new Set(existing.scopes);
    const requestedScopes = new Set(scopes);

    // Check if scopes are identical
    const scopesMatch =
      existingScopes.size === requestedScopes.size &&
      [...requestedScopes].every(s => existingScopes.has(s));

    if (scopesMatch && existing.customer_email === email) {
      // Same scopes and email - just return that they're already authorized
      return {
        content: [
          {
            type: 'text',
            text: `✓ Already authorized with ${domain}\nEmail: ${existing.customer_email}\nScopes: ${existing.scopes.join(', ')}`
          }
        ]
      };
    }

    // Scopes are different or email is different - need to re-authorize
    if (existing.customer_email !== email) {
      // Different email - must revoke first
      return {
        content: [
          {
            type: 'text',
            text: `⚠️ Already authorized with ${domain} using ${existing.customer_email}.\n\nTo authorize with a different email (${email}), please revoke the existing authorization first:\nscp_revoke_authorization(domain="${domain}")\n\nThen try authorizing again.`
          }
        ]
      };
    }

    // Same email, different scopes - re-authorize
    const addedScopes = [...requestedScopes].filter(s => !existingScopes.has(s));
    const removedScopes = [...existingScopes].filter(s => !requestedScopes.has(s));

    console.error(`[SCP] Re-authorizing ${domain} with scope changes:`, {
      added: addedScopes,
      removed: removedScopes
    });
  }

  // Discover endpoint
  const discovery = await discoverWithCapabilities(domain);
  if (!discovery) {
    throw new Error(`Could not discover Shopper Context Protocol endpoint for ${domain}`);
  }

  const { endpoint, capabilities } = discovery;

  // Verify scopes are supported
  if (capabilities && capabilities.scopes_supported) {
    const unsupported = scopes.filter(s => !capabilities.scopes_supported.includes(s));
    if (unsupported.length > 0) {
      throw new Error(`Unsupported scopes: ${unsupported.join(', ')}`);
    }
  }

  // Complete OAuth flow (will trigger email verification)
  const { tokenResponse } = await completeAuthorizationFlow(endpoint, email, domain, scopes);

  // Store authorization (will update if existing)
  const now = Date.now();
  await storeAuthorization({
    merchant_domain: domain,
    scp_endpoint: endpoint,
    customer_id: tokenResponse.customer_id,
    customer_email: tokenResponse.email,
    access_token_encrypted: encryptToken(tokenResponse.access_token),
    refresh_token_encrypted: encryptToken(tokenResponse.refresh_token),
    expires_at: now + (tokenResponse.expires_in * 1000),
    scopes: tokenResponse.scope.split(' '),
    created_at: existing ? existing.created_at : now, // Preserve original creation time
    updated_at: now
  });

  const action = existing ? 'Re-authorized' : 'Connected to';

  return {
    content: [
      {
        type: 'text',
        text: `✓ ${action} ${domain}!\nGranted scopes: ${tokenResponse.scope}\nCustomer: ${tokenResponse.email}`
      }
    ]
  };
}

/**
 * Tool handler: scp_check_authorization
 */
async function handleCheckAuthorization(domain: string) {
  const info = await getAuthorizationInfo(domain);

  if (!info.authorized) {
    return {
      content: [
        {
          type: 'text',
          text: `Not authorized with ${domain}`
        }
      ]
    };
  }

  const expiresDate = new Date(info.expires_at!).toISOString();

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          authorized: true,
          domain,
          customer_email: info.customer_email,
          scopes: info.scopes,
          authorized_at: new Date(info.authorized_at!).toISOString(),
          expires_at: expiresDate
        }, null, 2)
      }
    ]
  };
}

/**
 * Tool handler: scp_revoke_authorization
 */
async function handleRevokeAuthorization(domain: string) {
  const auth = await getAuthorization(domain);

  if (!auth) {
    throw new Error(`No authorization found for ${domain}`);
  }

  // Try to revoke token on server
  try {
    const accessToken = await getValidAccessToken(domain);
    await revokeToken(auth.scp_endpoint, accessToken);
  } catch (error) {
    // Revocation failed, but still delete locally
  }

  // Delete local authorization
  await deleteAuthorization(domain);

  return {
    content: [
      {
        type: 'text',
        text: `✓ Revoked authorization for ${domain}`
      }
    ]
  };
}

/**
 * Tool handler: scp_discover
 */
async function handleDiscover(domain: string) {
  const discovery = await discoverWithCapabilities(domain);

  if (!discovery) {
    throw new Error(`Could not discover Shopper Context Protocol endpoint for ${domain}`);
  }

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          domain,
          scp_endpoint: discovery.endpoint,
          discovery_method: 'dns_txt',
          capabilities: discovery.capabilities
        }, null, 2)
      }
    ]
  };
}

/**
 * Helper: Check authorization and return helpful message if not authorized
 */
async function checkAuthorizationOrThrow(domain: string): Promise<{ auth: any; accessToken: Promise<string> }> {
  const auth = await getAuthorization(domain);

  if (!auth) {
    const errorMessage = `❌ Not authorized with ${domain}.\n\n` +
      `Please authorize first by calling:\n` +
      `scp_authorize with domain="${domain}", email="your@email.com", and scopes=["orders", "loyalty", "preferences", "intent:read", "intent:create"]`;
    throw new Error(errorMessage);
  }

  return {
    auth,
    accessToken: getValidAccessToken(domain)
  };
}

/**
 * Tool handler: scp_get_orders
 */
async function handleGetOrders(domain: string, params: any) {
  const { auth, accessToken } = await checkAuthorizationOrThrow(domain);
  const token = await accessToken;

  const data = await scpClient.getOrders(auth.scp_endpoint, token, {
    limit: params.limit || 10,
    offset: params.offset || 0,
    status: params.status
  });

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(data, null, 2)
      }
    ]
  };
}

/**
 * Tool handler: scp_get_loyalty
 */
async function handleGetLoyalty(domain: string) {
  const { auth, accessToken } = await checkAuthorizationOrThrow(domain);
  const token = await accessToken;

  const data = await scpClient.getLoyalty(auth.scp_endpoint, token);

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(data, null, 2)
      }
    ]
  };
}

/**
 * Tool handler: scp_get_offers
 */
async function handleGetOffers(domain: string, params: any) {
  const { auth, accessToken } = await checkAuthorizationOrThrow(domain);
  const token = await accessToken;

  const data = await scpClient.getOffers(auth.scp_endpoint, token, {
    active_only: params.active_only !== false
  });

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(data, null, 2)
      }
    ]
  };
}

/**
 * Tool handler: scp_get_preferences
 */
async function handleGetPreferences(domain: string) {
  const { auth, accessToken } = await checkAuthorizationOrThrow(domain);
  const token = await accessToken;

  const data = await scpClient.getPreferences(auth.scp_endpoint, token);

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(data, null, 2)
      }
    ]
  };
}

/**
 * Tool handler: scp_get_intents
 */
async function handleGetIntents(domain: string, params: any) {
  const { auth, accessToken } = await checkAuthorizationOrThrow(domain);
  const token = await accessToken;

  const data = await scpClient.getIntents(auth.scp_endpoint, token, {
    status: params.status || ['active', 'in_progress'],
    limit: params.limit || 10,
    offset: params.offset || 0
  });

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(data, null, 2)
      }
    ]
  };
}

/**
 * Tool handler: scp_create_intent
 */
async function handleCreateIntent(domain: string, params: any) {
  const { auth, accessToken } = await checkAuthorizationOrThrow(domain);
  const token = await accessToken;

  const data = await scpClient.createIntent(auth.scp_endpoint, token, {
    base_intent: params.base_intent,
    mechanism: params.mechanism || 'conversational_ai',
    ai_assistant: params.ai_assistant,
    ai_session_id: params.ai_session_id,
    context: params.context,
    visibility: params.visibility || 'merchant_only',
    expires_at: params.expires_at
  });

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(data, null, 2)
      }
    ]
  };
}

/**
 * Tool handler: scp_update_intent
 */
async function handleUpdateIntent(domain: string, params: any) {
  const { auth, accessToken } = await checkAuthorizationOrThrow(domain);
  const token = await accessToken;

  // Need to implement updateIntent in http/client.ts
  const data = await scpClient.makeRPCRequest(
    auth.scp_endpoint,
    token,
    'scp.update_intent',
    {
      intent_id: params.intent_id,
      status: params.status,
      context: params.context,
      add_milestone: params.add_milestone
    }
  );

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(data, null, 2)
      }
    ]
  };
}

/**
 * Start MCP server with stdio transport
 */
export async function startServer() {
  const server = createServer();
  const transport = new StdioServerTransport();

  await server.connect(transport);

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    await server.close();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    await server.close();
    process.exit(0);
  });
}

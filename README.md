# SCP Local MCP Server

A [Model Context Protocol](https://modelcontextprotocol.io) (MCP) server that provides AI assistants like Claude with secure access to customer data through the [Shopper Context Protocol](https://shoppercontextprotocol.io) (SCP).

## What is this?

This MCP server acts as a bridge between AI assistants and e-commerce systems that implement the SCP protocol. It enables Claude Desktop and other MCP clients to:

- 🔐 Securely authorize access to customer accounts using OAuth 2.0 with PKCE
- 📦 Retrieve order history, loyalty points, active offers, and shopping preferences
- 🔍 Discover SCP endpoints for merchants via DNS or well-known URIs
- 🔒 Store and manage encrypted authentication tokens locally

All customer data requests are authenticated and authorized by the merchant's SCP server, ensuring privacy and security.

## Quick Start with npx

The easiest way to use this server is with `npx` - no installation required!

### With Claude Desktop

Add to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "scp": {
      "command": "npx",
      "args": ["-y", "@shoppercontextprotocol/local-mcp-server"]
    }
  }
}
```

On Windows, the config file is located at: `%APPDATA%\Claude\claude_desktop_config.json`

### Testing with a Local Development Server

If you're developing an SCP server locally, you can configure the MCP server to point to your test endpoint:

```json
{
  "mcpServers": {
    "scp": {
      "command": "npx",
      "args": ["-y", "@shoppercontextprotocol/local-mcp-server"],
      "env": {
        "SCP_TEST_ENDPOINT": "http://localhost:8787/v1"
      }
    }
  }
}
```

This bypasses DNS discovery and directs all requests to your local test server.

## Installation (Alternative)

For development or if you prefer a local installation:

```bash
# Install globally
npm install -g @shoppercontextprotocol/local-mcp-server

# Or install locally for development
git clone <repository>
cd local_mcp
npm install
npm run build
```

## Usage

### With Claude Desktop (Local Installation)

```json
{
  "mcpServers": {
    "scp": {
      "command": "scp-mcp-server"
    }
  }
}
```

Or with a local build:

```json
{
  "mcpServers": {
    "scp": {
      "command": "node",
      "args": ["/absolute/path/to/local_mcp/dist/index.js"]
    }
  }
}
```

### Direct Usage

```bash
# If installed globally
scp-mcp-server

# Or with local build
npm start
```

## Development

```bash
npm run dev    # Watch mode
npm run build  # Production build
npm test       # Run tests
```

## Configuration

The server stores configuration in `~/.scp/config.json`. It will be created automatically on first run with these defaults:

```json
{
  "dns_resolver": "1.1.1.1",
  "dns_cache_ttl": 86400,
  "poll_interval": 2,
  "max_poll_attempts": 150,
  "token_refresh_threshold": 300,
  "request_timeout": 30000,
  "demo_mode": true,
  "demo_endpoint": "http://localhost:8787/v1"
}
```

### Configuration Options

- **`dns_resolver`**: DNS server to use for SCP endpoint discovery (default: Cloudflare's 1.1.1.1)
- **`dns_cache_ttl`**: How long to cache discovered endpoints in seconds (default: 24 hours)
- **`poll_interval`**: Seconds between polling attempts during OAuth flow (default: 2)
- **`max_poll_attempts`**: Maximum number of polling attempts (default: 150 / 5 minutes)
- **`token_refresh_threshold`**: Seconds before expiry to refresh tokens (default: 300 / 5 minutes)
- **`request_timeout`**: HTTP request timeout in milliseconds (default: 30000 / 30 seconds)
- **`demo_mode`**: Enable demo mode (default: true)
- **`demo_endpoint`**: Endpoint to use in demo mode (default: http://localhost:8787/v1)

### Testing with a Development Server

There are multiple ways to point the MCP server to your test SCP server:

#### Option 1: Environment Variable (Recommended for npx)

Set `SCP_TEST_ENDPOINT` when running the server:

```bash
# Direct usage
SCP_TEST_ENDPOINT=http://localhost:8787/v1 scp-mcp-server

# With npx
SCP_TEST_ENDPOINT=http://localhost:8787/v1 npx @shoppercontextprotocol/local-mcp-server

# In Claude Desktop config (see Quick Start section above)
```

#### Option 2: Demo Mode Configuration

Edit `~/.scp/config.json`:

```json
{
  "demo_mode": true,
  "demo_endpoint": "http://localhost:8787/v1"
}
```

By default, demo mode is enabled and directs all SCP requests to the demo endpoint. This is useful for local testing without needing DNS records.

#### Option 3: Production Mode

To use real DNS-based discovery for production merchants:

```json
{
  "demo_mode": false
}
```

**Priority Order:**
1. `SCP_TEST_ENDPOINT` environment variable (highest priority)
2. Demo mode configuration
3. DNS-based discovery (lowest priority)

## Data Storage

- Tokens: `~/.scp/tokens.db` (SQLite, encrypted)
- Config: `~/.scp/config.json`

## MCP Tools

- `scp_authorize` - Authorize access to a merchant
- `scp_check_authorization` - Check authorization status
- `scp_revoke_authorization` - Revoke access to a merchant
- `scp_discover` - Discover SCP endpoint for a domain

## MCP Resources

- `scp://{domain}/orders` - Order history
- `scp://{domain}/loyalty` - Loyalty status
- `scp://{domain}/offers` - Active offers
- `scp://{domain}/preferences` - Customer preferences
- `scp://{domain}/intents` - Shopping intents

## How to Use in Claude Desktop

After adding the MCP server to your Claude Desktop config and restarting Claude, you can interact with SCP-enabled merchants:

### First Time: Authorize Access

```
Can you help me authorize access to my Boot Barn account? 
My email is customer@example.com
```

Claude will use the `scp_authorize` tool to:
1. Discover the SCP endpoint for bootbarn.com
2. Initiate OAuth authorization with a magic link
3. The magic link will be sent to your email
4. Poll for authorization completion
5. Store encrypted tokens locally

### Access Your Data

Once authorized, you can ask Claude to retrieve your data:

```
What are my recent Boot Barn orders?
```

```
How many loyalty points do I have at Boot Barn?
```

```
Do I have any active offers or coupons?
```

Claude will automatically:
- Use the stored authorization tokens
- Refresh tokens if they're about to expire
- Fetch data from the merchant's SCP server
- Present the information in a helpful format

### Check Authorization Status

```
Am I authorized with Boot Barn?
```

### Revoke Access

```
Revoke my Boot Barn authorization
```

## Example Workflow

Here's a complete example of using SCP in Claude Desktop:

**You:** "Help me authorize with acmestore.com using customer@example.com"

**Claude:** *Initiates OAuth flow, sends magic link to email*

**You:** *Clicks magic link in email*

**Claude:** *Completes authorization and confirms success*

**You:** "What orders have I placed?"

**Claude:** *Retrieves and displays order history*

**You:** "Do I have any active coupons?"

**Claude:** *Shows available offers and promotions*

## How It Works: Initialization Instructions

The SCP MCP Server provides built-in instructions to Claude during the initialization phase, ensuring it knows how to properly use the SCP tools without any additional prompting.

### Automatic Guidance

When Claude Desktop connects to the SCP server, it automatically receives instructions that tell it to:

1. **Always check authorization first** - Before accessing any customer data, Claude will check if you're authorized with the merchant
2. **Ask for your email** - If not authorized, Claude will ask for your email address to start the OAuth flow
3. **Request all necessary scopes** - Claude requests comprehensive permissions upfront: `orders`, `loyalty`, `preferences`, `intent:read`, `intent:create`
4. **Explain the magic link process** - Claude tells you to check your email for the authorization link
5. **Handle errors gracefully** - If something goes wrong, Claude knows how to guide you through fixing it

### Why This Matters

This automatic initialization means:

- ✅ **No manual configuration needed** - Claude knows how to use SCP tools immediately
- ✅ **Consistent behavior** - Every conversation follows the same authorization workflow
- ✅ **Better user experience** - Claude proactively handles authorization before trying to access data
- ✅ **Fewer errors** - Reduces "Not authorized" errors by checking authorization first

### The Initialization Flow

```
1. Claude Desktop starts and reads claude_desktop_config.json
2. Spawns the SCP MCP server (node dist/index.js or npx)
3. Sends initialize request to the server
4. Server responds with:
   - Server info (name, version)
   - Instructions for the LLM
   - Capabilities (tools, resources)
5. Claude reads the instructions and knows:
   ✓ Check authorization first
   ✓ Ask for email when needed
   ✓ Request all scopes upfront
   ✓ Create intents when users express shopping goals
6. Server is ready, Claude is ready with full context
7. User asks: "Show me my orders"
8. Claude follows the instructions:
   - Checks authorization
   - Asks for email if needed
   - Initiates OAuth flow
   - Retrieves and displays orders
```

### Example Instructions Provided

During initialization, Claude receives these instructions:

```
IMPORTANT WORKFLOW:

1. AUTHORIZATION REQUIRED FIRST
   Before accessing ANY customer data, you MUST authorize with the merchant domain.
   
   Check authorization:
   - scp_check_authorization(domain="acmestore.com")
   
   If not authorized:
   - Ask user: "What email do you use with [Merchant]?"
   - Call: scp_authorize(domain="...", email="...", scopes=[...])
   - Tell user: "Please check your email for a magic link"

2. ACCESSING DATA
   Once authorized, use these tools:
   - scp_get_orders(domain="...") - Order history
   - scp_get_loyalty(domain="...") - Loyalty status
   - scp_get_preferences(domain="...") - Saved preferences
   - scp_get_intents(domain="...") - Shopping intents

3. CREATING INTENTS
   When user expresses a shopping goal, create an intent:
   - scp_create_intent(domain="...", base_intent="...", context={...})

REMEMBER:
✅ ALWAYS check authorization before accessing data
✅ Request comprehensive scopes upfront
✅ Create intents when users express shopping goals
❌ NEVER access data without authorization first
```

This ensures every interaction with the SCP server follows best practices and provides a smooth, secure experience for users.

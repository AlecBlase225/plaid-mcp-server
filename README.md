# Plaid MCP Server

A Model Context Protocol (MCP) server and HTTP API for integrating Plaid banking services. This server provides three interfaces:
- 🌐 **HTTP/REST API** with web interface for connecting bank accounts
- 🤖 **MCP Server (stdio)** for Claude Desktop (local)
- 🌍 **MCP Server (SSE)** for ChatGPT and remote clients

## Quick Links

- **[Quick Start](#quick-start)** ⚡ - Get running in 5 minutes
- **[ChatGPT Setup](./CHATGPT-SETUP.md)** 🤖 - Connect to ChatGPT
- **[Authentication](./AUTHENTICATION.md)** 🔐 - OAuth 2.1, Bearer Token, Test Mode
- **[Deployment Guide](./DEPLOYMENT.md)** 🚀 - Production deployment

## Quick Start

Get your Plaid MCP server running with ChatGPT in 5 minutes.

### Prerequisites

- Node.js (v18+)
- Plaid API credentials ([Get free sandbox credentials](https://dashboard.plaid.com/signup))

### Setup

```bash
# 1. Install dependencies
npm install

# 2. Create .env.local with your Plaid credentials
cat > .env.local << EOF
PLAID_CLIENT_ID=your_client_id_here
PLAID_SECRET=your_secret_here
PLAID_ENV=sandbox

# OAuth 2.1 (for ChatGPT) - auto-generate secure credentials
MCP_OAUTH_CLIENT_ID=$(openssl rand -hex 8)
MCP_OAUTH_CLIENT_SECRET=$(openssl rand -hex 16)
EOF

# 3. Build
npm run build

# 4. Start the server
npm run start:sse
```

### Test Locally

```bash
npm run test
```

Expected output: `✓ All tests passed! Your SSE server is ready for ChatGPT!`

### Connect to ChatGPT

1. **Expose with ngrok** (in a new terminal):
   ```bash
   ngrok http 3001
   ```
   Copy the HTTPS URL (e.g., `https://abc123.ngrok-free.dev`)

2. **Get OAuth credentials:**
   ```bash
   grep MCP_OAUTH .env.local
   ```

3. **Add to ChatGPT:**
   - Settings → Connectors → Add Connector
   - **URL:** `https://your-ngrok-url.ngrok-free.dev` (without `/sse`)
   - **Authentication:** OAuth
   - **Client ID & Secret:** From `.env.local`
   - Authorize in browser

See [CHATGPT-SETUP.md](./CHATGPT-SETUP.md) for detailed instructions.

## Features

- 🏦 Connect bank accounts via Plaid Link
- 💾 Securely store access tokens locally in `~/.plaid_tokens.json`
- 🌐 Web interface for easy bank account linking
- 🤖 MCP server for integration with Claude and other AI assistants
- 📊 Access account balances, transactions, and account details
- 📄 Download and access bank statements (PDF format)
- ✨ Enrich transaction data with merchant information, logos, categories, and metadata (no bank connection required)


## Running the Server

### For ChatGPT (SSE Server)

```bash
npm run start:sse  # Runs on http://localhost:3001
```

See [CHATGPT-SETUP.md](./CHATGPT-SETUP.md) for complete setup instructions.

### For Claude Desktop (stdio)

```bash
npm run start:mcp
```

**Configuration file locations:**
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
- **Linux**: `~/.config/Claude/claude_desktop_config.json`

Add to your `claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "plaid": {
      "command": "node",
      "args": ["/absolute/path/to/server.js"],
      "env": {
        "PLAID_CLIENT_ID": "your_client_id_here",
        "PLAID_SECRET": "your_secret_here",
        "PLAID_ENV": "sandbox"
      }
    }
  }
}
```

**Note:** Replace `/absolute/path/to/server.js` with the actual path to your compiled `server.js` file. Restart Claude Desktop after making changes.

### Web Interface (HTTP Server)

```bash
npm run start:http  # Runs on http://localhost:3000
open http://localhost:3000/index.html
```


## Available MCP Tools

When running the MCP server, the following tools are available:

**Authentication & Setup:**
- `create_link_token` - Create a Plaid Link token for bank connection
- `exchange_public_token` - Exchange public token for access token
- `list_items` - List all connected bank accounts

**Account Data:**
- `get_accounts` - Get accounts for a Plaid item
- `get_balances` - Get current balances
- `get_transactions` - Get transactions within a date range (with account filtering)
- `get_recurring_transactions` - Get recurring transaction streams (subscriptions, bills, regular income)
- `enrich_transactions` - Enrich transaction data with merchant information, categories, logos, and metadata (no bank connection required)
- `get_investment_holdings` - View investment accounts and holdings

**Bank Statements:**
- `refresh_statements` - Refresh available statements for a date range
- `list_statements` - List all available bank statements
- `download_statement` - Download a specific statement as base64-encoded PDF

**Example Usage:**
- "List my connected bank accounts"
- "Show me my account balances"
- "Get my transactions from last month"
- "What are my recurring subscriptions?"
- "Get my investment holdings"

## Token Storage

Access tokens are securely stored in `~/.plaid_tokens.json` with restricted permissions (600). The file is automatically created when you connect your first bank account.

## Scripts

- `npm run build` - Compile TypeScript files
- `npm run test` - Test the SSE server (exits cleanly with pass/fail)
- `npm run start:http` - Start HTTP server (production)
- `npm run start:mcp` - Start MCP server for Claude Desktop (production)
- `npm run start:sse` - Start SSE server for ChatGPT (production)
- `npm run dev:http` - Start HTTP server (development mode)
- `npm run dev:sse` - Start SSE server (development mode)

## Security Notes

⚠️ **Important Security Considerations:**

1. Never commit your `.env` file to version control
2. Keep your Plaid credentials secure
3. The `~/.plaid_tokens.json` file contains sensitive access tokens - keep it secure
4. Use `sandbox` environment for testing, only use `production` when ready
5. For production deployments, consider using a proper secrets management solution

## Troubleshooting

### Port already in use
If port 3000 or 3001 is already in use, change the `PORT` in your `.env.local` file:
```env
PORT=8080
```

### Missing environment variables
If you see "PLAID_CLIENT_ID and PLAID_SECRET environment variables are required", make sure your `.env.local` file exists and contains valid credentials.

### Token exchange fails
- Ensure you're using the correct environment (sandbox/development/production)
- Verify your Plaid credentials are valid
- Check that the public token hasn't expired (they're single-use and short-lived)

For more troubleshooting help, see [CHATGPT-SETUP.md](./CHATGPT-SETUP.md), [AUTHENTICATION.md](./AUTHENTICATION.md), or [DEPLOYMENT.md](./DEPLOYMENT.md).

## Resources

- [Plaid Documentation](https://plaid.com/docs/)
- [Model Context Protocol](https://modelcontextprotocol.io/)
- [Plaid Dashboard](https://dashboard.plaid.com/)

## License

ISC


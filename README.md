# Plaid MCP Server

A Model Context Protocol (MCP) server and HTTP API for integrating Plaid banking services. This server provides three interfaces:
- 🌐 **HTTP/REST API** with web interface for connecting bank accounts
- 🤖 **MCP Server (stdio)** for Claude Desktop (local)
- 🌍 **MCP Server (SSE)** for ChatGPT and remote clients

## Quick Links

- **[ChatGPT Setup](./CHATGPT-SETUP.md)** 🤖 - Connect to ChatGPT (5 minutes)
- **[Authentication](./AUTHENTICATION.md)** 🔐 - OAuth 2.1, Bearer Token, Test Mode
- **[Deployment Guide](./DEPLOYMENT.md)** 🚀 - Production deployment

## Features

- 🏦 Connect bank accounts via Plaid Link
- 💾 Securely store access tokens locally in `~/.plaid_tokens.json`
- 🌐 Web interface for easy bank account linking
- 🤖 MCP server for integration with Claude and other AI assistants
- 📊 Access account balances, transactions, and account details
- 📄 Download and access bank statements (PDF format)
- ✨ Enrich transaction data with merchant information, logos, categories, and metadata (no bank connection required)

## Prerequisites

- Node.js (v18 or higher recommended)
- npm or yarn
- A Plaid account with API credentials ([Get started here](https://dashboard.plaid.com/signup))

## Installation

```bash
# Install dependencies
npm install

# Create .env.local with your Plaid credentials
cat > .env.local << EOF
PLAID_CLIENT_ID=your_client_id_here
PLAID_SECRET=your_secret_here
PLAID_ENV=sandbox

# OAuth 2.1 (for ChatGPT) - auto-generate secure credentials
MCP_OAUTH_CLIENT_ID=$(openssl rand -hex 8)
MCP_OAUTH_CLIENT_SECRET=$(openssl rand -hex 16)
EOF

# Build
npm run build
```

**Get Plaid credentials:** [dashboard.plaid.com/signup](https://dashboard.plaid.com/signup) (free sandbox available)

## Running the Server

### For ChatGPT (Remote - SSE)

```bash
npm run start:sse  # Runs on http://localhost:3001

# Test it (starts a test server in test mode)
npm run test
```

**Note:** Testing starts a temporary server with authentication bypassed (`MCP_TEST_MODE=true`). Your production server on port 3001 will be temporarily stopped during testing and needs to be restarted afterward.

### For Claude Desktop (Local - stdio)

```bash
npm run start:mcp
```

Then add to `claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "plaid": {
      "command": "node",
      "args": ["/absolute/path/to/server.js"],
      "env": {
        "PLAID_CLIENT_ID": "xxx",
        "PLAID_SECRET": "xxx",
        "PLAID_ENV": "sandbox"
      }
    }
  }
}
```

### Web Interface (HTTP Server)

```bash
npm run start:http  # Runs on http://localhost:3000
open http://localhost:3000/index.html
```

## Configuring ChatGPT (Remote MCP Server)

### Prerequisites
- ChatGPT Plus or Pro subscription
- ngrok or similar tunneling service (for remote access)
- OAuth credentials from `.env.local`

### Setup Steps

1. **Start the SSE server:**
   ```bash
   npm run build
   npm run start:sse
   ```

2. **Expose via ngrok (required for ChatGPT):**
   ```bash
   ngrok http 3001
   ```
   This gives you an HTTPS URL like: `https://abc123.ngrok-free.dev`

3. **Get your OAuth credentials from `.env.local`:**
   ```bash
   grep MCP_OAUTH .env.local
   ```
   You'll need the `MCP_OAUTH_CLIENT_ID` and `MCP_OAUTH_CLIENT_SECRET`

4. **Add to ChatGPT:**
   - Go to ChatGPT → Settings → Connectors
   - Click "Add Connector"
   - **URL:** `https://your-ngrok-url.ngrok-free.dev` (without `/sse`)
   - Select **OAuth** authentication
   - **Client ID:** Your `MCP_OAUTH_CLIENT_ID`
   - **Client Secret:** Your `MCP_OAUTH_CLIENT_SECRET`
   - Click "Create"

5. **Authorize access:**
   - A browser window will open with an authorization consent screen
   - Review the permissions and click "Authorize"
   - ChatGPT will complete the connection

You should now see your Plaid MCP server connected in ChatGPT!

## Configuring Claude Desktop (Local MCP Server)

To use this MCP server with Claude Desktop, you need to add it to Claude's configuration file.

### Steps:

1. **Locate your Claude Desktop configuration file:**

   - **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
   - **Linux**: `~/.config/Claude/claude_desktop_config.json`

2. **Edit the configuration file** and add the Plaid MCP server:

   ```json
   {
     "mcpServers": {
       "plaid": {
         "command": "node",
         "args": [
           "<absolute-path-to-project>/server.js"
         ],
         "env": {
           "PLAID_CLIENT_ID": "your_client_id_here",
           "PLAID_SECRET": "your_secret_here",
           "PLAID_ENV": "sandbox"
         }
       }
     }
   }
   ```

   **Important:** Replace the path with the absolute path to your `server.js` file and add your actual Plaid credentials.

3. **Alternative: Use your .env file approach**

   If you prefer to keep credentials in your `.env` file, you can use `node` with a wrapper that loads the `.env`:

   ```json
   {
     "mcpServers": {
       "plaid": {
         "command": "node",
         "args": [
           "<absolute-path-to-project>/server.js"
         ],
         "cwd": "<absolute-path-to-project>"
       }
     }
   }
   ```

   This will automatically load your `.env` file from the project directory.

4. **Restart Claude Desktop** to apply the configuration changes.

5. **Verify the connection:**
   - Open Claude Desktop
   - Look for the tools icon or MCP indicator
   - You should see the Plaid tools available (create_link_token, get_accounts, etc.)

### Using Plaid Tools in Claude

Once configured, you can ask Claude to use your bank data:

**Setup & Account Info:**
- "Create a Plaid link token for me"
- "List my connected bank accounts"
- "Get my account balances for item [item_id]"
- "Show me transactions from the last 30 days for item [item_id]"
- "Get my recurring transactions for item [item_id]"
- "Show me all my subscription payments and bills for item [item_id]"

**Transaction Enrichment:**
- "Enrich these transactions with merchant details: [provide transaction data]"
- "Get merchant information for this transaction: AMZN Mktp US*123456789"
- "Categorize this transaction: Starbucks Store #12345"

**Bank Statements:**
- "Refresh statements for item [item_id] from 2024-01-01 to 2024-12-31"
- "List all available statements for item [item_id]"
- "Download statement [statement_id] for item [item_id]"

Claude will use the MCP tools to interact with your Plaid account through the server.

## Using the Web Interface

1. **Generate Link Token**: Click the button to create a Plaid Link token
2. **Connect Bank Account**: Launch Plaid Link and select your bank
3. **Authenticate**: Log in to your bank account through Plaid's secure interface
4. **Exchange Token**: The public token is automatically exchanged for an access token and stored in `~/.plaid_tokens.json`

## Available API Endpoints

The HTTP server provides the following REST API endpoints:

### Authentication & Setup
- `POST /api/create_link_token` - Generate a Plaid Link token
- `POST /api/exchange_public_token` - Exchange public token for access token
  - Body: `{ "public_token": "...", "institution_name": "..." }`
- `GET /api/items` - List all stored items

### Account Data
- `GET /api/accounts/:itemId` - Get all accounts for an item
- `GET /api/balances/:itemId` - Get current balances for an item
- `GET /api/transactions/:itemId?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD&limit=100` - Get transactions
- `GET /api/recurring_transactions/:itemId?account_ids=acc1,acc2` - Get recurring transaction streams
- `POST /api/enrich_transactions` - Enrich transaction data with merchant information, categories, and metadata
  - Body: `{ "transactions": [{ "id": "...", "description": "...", "amount": 0.00, "iso_currency_code": "USD", "datetime": "...", "direction": "OUTFLOW" }] }`

### Statements (NEW)
- `POST /api/statements/refresh/:itemId` - Refresh available statements
  - Body: `{ "start_date": "YYYY-MM-DD", "end_date": "YYYY-MM-DD" }`
- `GET /api/statements/:itemId` - List all available statements for an item
- `GET /api/statements/:itemId/download/:statementId` - Download a specific statement as base64-encoded PDF

## MCP Tools

When running the MCP server, the following tools are available:

### Authentication & Setup
- `create_link_token` - Create a Plaid Link token
- `exchange_public_token` - Exchange public token for access token
- `list_items` - List all connected bank accounts

### Account Data
- `get_accounts` - Get accounts for a Plaid item
- `get_balances` - Get current balances
- `get_transactions` - Get transactions within a date range
- `get_recurring_transactions` - Get recurring transaction streams (subscriptions, bills, regular income)
- `enrich_transactions` - Enrich transaction data with merchant information, categories, logos, and other metadata (does not require a linked bank account)

### Statements (NEW)
- `refresh_statements` - Refresh available statements for a date range
- `list_statements` - List all available bank statements
- `download_statement` - Download a specific statement as base64-encoded PDF

## Token Storage

Access tokens are securely stored in:
```
~/.plaid_tokens.json
```

The file is automatically created with restricted permissions (600) and contains:
```json
{
  "item_xxxxx": {
    "itemId": "item_xxxxx",
    "accessToken": "access-sandbox-xxxxx",
    "institutionName": "Chase Bank",
    "storedAt": "2025-11-17T12:00:00.000Z"
  }
}
```

## Project Structure

```
plaid-mcp-server/
├── server.ts           # MCP server (stdio transport for Claude Desktop)
├── server.js           # Compiled MCP server
├── sse-server.ts       # MCP SSE server (HTTP transport for ChatGPT)
├── sse-server.js       # Compiled SSE server
├── http-server.ts      # HTTP server with REST API
├── http-server.js      # Compiled HTTP server
├── index.html          # Web interface
├── package.json        # Dependencies and scripts
├── .env                # Environment variables (create this)
└── README.md           # This file
```

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
If port 3000 is already in use, change the `PORT` in your `.env` file:
```env
PORT=8080
```

### Missing environment variables
If you see "PLAID_CLIENT_ID and PLAID_SECRET environment variables are required", make sure your `.env` file exists and contains valid credentials.

### Token exchange fails
- Ensure you're using the correct environment (sandbox/development/production)
- Verify your Plaid credentials are valid
- Check that the public token hasn't expired (they're single-use and short-lived)

## Resources

- [Plaid Documentation](https://plaid.com/docs/)
- [Model Context Protocol](https://modelcontextprotocol.io/)
- [Plaid Dashboard](https://dashboard.plaid.com/)

## License

ISC


# Plaid MCP Server

A Model Context Protocol (MCP) server and HTTP API for integrating Plaid banking services. This server provides both a web interface for connecting bank accounts and an MCP interface for use with Claude and other MCP clients.

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

1. **Clone or navigate to the repository:**
   ```bash
   cd <path-to-plaid-mcp-server>
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Create a `.env` file** in the project root with your Plaid credentials:
   ```env
   PLAID_CLIENT_ID=your_client_id_here
   PLAID_SECRET=your_secret_here
   PLAID_ENV=sandbox
   PORT=3000
   ```

   Environment variables:
   - `PLAID_CLIENT_ID`: Your Plaid client ID
   - `PLAID_SECRET`: Your Plaid secret key
   - `PLAID_ENV`: Environment (`sandbox`, `development`, or `production`)
   - `PORT`: HTTP server port (default: 3000)

4. **Build the project:**
   ```bash
   npm run build
   ```
   
   Or compile manually using:
   ```bash
   npx tsc server.ts --lib es2020 --target es2020 --module commonjs --moduleResolution node --outDir . --declaration false --esModuleInterop true --skipLibCheck true
   ```

## Running the Application

### Option 1: HTTP Server (Web Interface)

Run the HTTP server to use the web interface:

```bash
npm start:http
```

Then open your browser to:
```
http://localhost:3000/index.html
```

**Development mode** (with auto-reload using ts-node):
```bash
npm run dev:http
```

### Option 2: MCP Server (for Claude/MCP Clients)

Run the MCP server for integration with Claude or other MCP clients:

```bash
npm start:mcp
```

This runs the server in stdio mode for MCP protocol communication.

## Configuring Claude Desktop

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
├── server.ts           # MCP server (stdio transport)
├── server.js           # Compiled MCP server
├── http-server.ts      # HTTP server with REST API
├── http-server.js      # Compiled HTTP server
├── index.html          # Web interface
├── package.json        # Dependencies and scripts
├── .env                # Environment variables (create this)
└── README.md           # This file
```

## Scripts

- `npm run build` - Compile TypeScript files
- `npm start:http` - Start HTTP server (production)
- `npm start:mcp` - Start MCP server (production)
- `npm run dev:http` - Start HTTP server (development mode)

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


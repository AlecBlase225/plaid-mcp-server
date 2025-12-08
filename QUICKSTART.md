# Quick Start Guide

Get your Plaid MCP server running with ChatGPT in 5 minutes.

## Prerequisites

- Node.js (v18+)
- Plaid API credentials ([Get free sandbox credentials](https://dashboard.plaid.com/signup))

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Create .env.local from example
cp .env.example .env.local

# Edit .env.local with your Plaid credentials
# OAuth credentials are auto-generated or use:
cat >> .env.local << EOF
MCP_OAUTH_CLIENT_ID=$(openssl rand -hex 8)
MCP_OAUTH_CLIENT_SECRET=$(openssl rand -hex 16)
EOF

# 3. Build
npm run build

# 4. Start the server
npm run start:sse
```

## Test Locally

The test client automatically loads OAuth credentials from `.env.local`:

```bash
npm run test
```

Expected output (with OAuth):
```
Testing MCP SSE Server at: http://localhost:3001

🔐 Using OAuth 2.0 authentication (Client ID: f14a6478125f6698)

Step 0: Obtaining OAuth access token...
✓ OAuth token obtained

Step 1: Connecting to SSE...
✓ SSE connected (200)

Step 2: Sending initialize request...
✓ POST response (202)
📥 SSE Event: ... initialize response ...

Step 3: Sending tools/list request...
✓ POST response (202)
📥 SSE Event: ... 12 Plaid tools ...

═══════════════════════════════════════
✓ All tests passed!
═══════════════════════════════════════

Your SSE server is ready for ChatGPT!
```

## Connect to ChatGPT

### Option A: ngrok (Quick Test)

```bash
# Install ngrok
brew install ngrok

# Start tunnel (in new terminal)
ngrok http 3001

# Copy the https URL: https://abc123.ngrok.io/sse
# Get your auth token: cat .env.local | grep MCP_AUTH_TOKEN
```

**In ChatGPT:**
1. **Server URL:** `https://abc123.ngrok.io/sse`
2. **OAuth Client ID:** Get from `.env.local` → `MCP_OAUTH_CLIENT_ID`
3. **OAuth Client Secret:** Get from `.env.local` → `MCP_OAUTH_CLIENT_SECRET`
4. **Token URL:** `https://abc123.ngrok.io/oauth/token`

> 🔒 **OAuth 2.0:** Recommended authentication method for ChatGPT  
> See [CHATGPT-SETUP.md](./CHATGPT-SETUP.md) for complete guide

### Option B: Production Deployment

See [DEPLOYMENT.md](./DEPLOYMENT.md) for ngrok setup to expose your local server.

## Available Tools

Once connected, you can ask ChatGPT:

- "List my connected bank accounts"
- "Show me my checking account transactions from last month"
- "What are my recurring subscriptions?"
- "Show my account balances"
- "Get my investment holdings"

## Environment Files

- **`.env.local`** - Used by SSE and HTTP servers (ChatGPT, web interface)
- **`.env`** - Used by stdio server (Claude Desktop)

For most users, just create `.env.local`.

## Troubleshooting

### Server won't start

**Error:** Missing credentials

**Fix:** Create `.env.local` with your Plaid credentials

### Test fails with "Unauthorized"

**Error:** `❌ Unauthorized access attempt`

**Fix:** OAuth credentials are set but test client can't load them. Try:
```bash
# Option 1: Run test with explicit env loading
source .env.local && npm run test

# Option 2: Disable auth for testing only
MCP_REQUIRE_AUTH=false npm run start:sse
```

### Test fails with connection refused

**Error:** Connection refused

**Fix:** Make sure server is running in another terminal

### ChatGPT can't connect

**Problem:** Using http instead of https

**Fix:** Use ngrok or deploy to get an https URL

## Next Steps

1. ✅ Test with sandbox data (username: `user_good`, password: `pass_good`)
2. ✅ Connect real bank via web interface: `npm run start:http`
3. ✅ Deploy for permanent access: See [DEPLOYMENT.md](./DEPLOYMENT.md)

## Support

- **Issues?** Check the [main README](./README.md)
- **Deployment?** See [DEPLOYMENT.md](./DEPLOYMENT.md)
- **Plaid Docs:** https://plaid.com/docs/

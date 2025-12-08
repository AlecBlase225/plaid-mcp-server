# ChatGPT MCP Setup Guide

Complete guide to connect your Plaid MCP server to ChatGPT using OAuth 2.1.

## Prerequisites

1. ✅ ChatGPT Plus or Pro subscription
2. ✅ Plaid MCP server built and configured
3. ✅ ngrok or public HTTPS URL
4. ✅ OAuth credentials generated in `.env.local`

## Quick Start

### Step 1: Start Your Server

```bash
# Build the server
npm run build

# Start the SSE server
npm run start:sse
```

You should see:
```
🔒 OAuth 2.1 authentication enabled (with PKCE and Dynamic Client Registration)
Plaid MCP SSE Server running on http://localhost:3001
```

### Step 2: Expose with ngrok

In a new terminal:

```bash
ngrok http 3001
```

You'll get an HTTPS URL like: `https://abc123.ngrok-free.dev`

⚠️ **Important:** ChatGPT requires HTTPS - don't use the HTTP URL!

### Step 3: Get Your OAuth Credentials

```bash
cat .env.local | grep MCP_OAUTH
```

Example output:
```
MCP_OAUTH_CLIENT_ID=f14a6478125f6698
MCP_OAUTH_CLIENT_SECRET=647ff36aead390189890fe13f93a7caf
```

### Step 4: Add to ChatGPT

1. **Open ChatGPT** → Settings → **Connectors**
2. Click **"Add Connector"**
3. Fill in the details:

| Field | Value | Example |
|-------|-------|---------|
| **Name** | Plaid Banking | (any name) |
| **MCP Server URL** | `https://YOUR-NGROK-URL.ngrok-free.dev` | ⚠️ **NO /sse suffix!** |
| **Authentication** | OAuth | (select from dropdown) |
| **OAuth Client ID** | From `.env.local` | `f14a6478125f6698` |
| **OAuth Client Secret** | From `.env.local` | `647ff36aead390189890fe13f93a7caf` |

4. Click **"Create"**

### Step 5: Authorize Access

- A **browser window** will open automatically
- You'll see an **authorization consent screen**
- Review the permissions:
  - Access your Plaid banking data
  - Execute MCP tools on your behalf
  - Manage your connected accounts
- Click **"Authorize"**

✅ ChatGPT will complete the connection and show the connector as "Connected"!

## Available Tools

Once connected, try asking ChatGPT:

- "List my connected Plaid items"
- "Show me my account balances"
- "Get my transactions from last month"
- "Create a link token to connect my bank"

See [README.md](./README.md#available-mcp-tools) for the complete tool list.

## How It Works

The OAuth 2.1 flow with PKCE:

1. **Discovery** - ChatGPT finds your OAuth endpoints
2. **Registration** - ChatGPT registers using provided credentials
3. **Authorization** - You approve access in browser
4. **Token Exchange** - ChatGPT exchanges code for access token
5. **Authenticated Requests** - All MCP requests include the token

## Troubleshooting

### "Error fetching OAuth configuration"

**Problem:** ChatGPT can't find OAuth endpoints

**Solution:**
```bash
# Test that discovery endpoints work
curl https://YOUR-NGROK-URL/.well-known/oauth-authorization-server

# Should return JSON with authorization_endpoint, token_endpoint, etc.
# NOT a 404 or 401 error
```

### "Invalid client_id" in browser

**Problem:** OAuth credentials don't match

**Solution:**
1. Check credentials in `.env.local` match ChatGPT exactly
2. Restart server after changing `.env.local`:
   ```bash
   pkill -f sse-server
   npm run start:sse
   ```

### Authorization page hangs

**Problem:** Redirect back to ChatGPT fails

**Solution:**
1. Check server logs for errors
2. Verify ngrok is still running
3. Try deleting and re-adding the connector in ChatGPT

### ngrok URL changed

**Problem:** Connection stopped after restarting ngrok

**Solution:**
1. Get new URL: check ngrok terminal
2. In ChatGPT: Delete old connector
3. Add new connector with new URL
4. Use same OAuth credentials (no need to regenerate)

### Connection works but tools don't appear

**Problem:** ChatGPT shows "Connected" but no tools

**Solution:**
1. Check server logs for SSE connection
2. Try asking ChatGPT: "What MCP tools do you have access to?"
3. Refresh ChatGPT page

## Testing Before ChatGPT

Verify your setup works:

```bash
# 1. Test OAuth discovery (public - no auth needed)
curl https://YOUR-NGROK-URL/.well-known/oauth-authorization-server | jq .

# Should show: authorization_endpoint, token_endpoint, registration_endpoint

# 2. Test server health
curl https://YOUR-NGROK-URL/health | jq .

# Should show: status: "ok", authentication: "oauth2.1"

# 3. Test with automated client (local only)
npm run test
```

**Note:** `npm run test` starts a temporary test server with authentication bypassed. It only works for local testing and will temporarily stop your production server on port 3001.

## Server Logs

Monitor your server in real-time:

```bash
# Follow server logs
tail -f /tmp/sse-server.log

# Look for these successful events:
# 🔐 OAuth authorization request from client: ...
# ✅ Authorization code issued
# 🎫 OAuth token request
# ✅ Access token issued
# ✅ Authenticated OAuth request
```

## Security Notes

- 🔒 Uses OAuth 2.1 with PKCE (Proof Key for Code Exchange)
- 🔒 Access tokens expire after 1 hour
- 🔒 Authorization codes are single-use and expire in 10 minutes
- 🔒 All tokens stored in memory (cleared on restart)
- 🔒 HTTPS required (ngrok provides this automatically)
- 🔒 Never commit `.env.local` to git

## Production Deployment

For production use:

1. **Deploy to a server** with a stable HTTPS URL (not ngrok)
2. **Generate new OAuth credentials** for production
3. **Set up proper token storage** (Redis/database instead of memory)
4. **Add rate limiting** and request logging
5. **Monitor OAuth flows** for security issues

See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed production setup.

## Next Steps

Once connected successfully:

1. **Connect a bank:** "Create a link token to connect my bank account"
2. **View data:** "Show me my account balances"
3. **Analyze spending:** "Get my transactions from last month and categorize them"
4. **Find subscriptions:** "Find all my recurring transactions"

Enjoy using your Plaid banking data with ChatGPT! 🎉

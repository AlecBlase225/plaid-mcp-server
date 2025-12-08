# Deployment Guide

Deploy your Plaid MCP server for use with ChatGPT.

## Local Development

Run the server locally on your machine:

```bash
# Start the server
npm run start:sse

# Server runs on http://localhost:3001
# SSE endpoint: http://localhost:3001/sse
```

**Environment Variables** (in `.env.local`):
```env
PLAID_CLIENT_ID=your_client_id
PLAID_SECRET=your_secret
PLAID_ENV=sandbox

# OAuth 2.0 (for ChatGPT)
MCP_OAUTH_CLIENT_ID=$(openssl rand -hex 8)
MCP_OAUTH_CLIENT_SECRET=$(openssl rand -hex 16)
```

**Test it:**
```bash
npm run test
```

## Expose with ngrok

Use ngrok to make your local server accessible to ChatGPT over the internet:

### Install ngrok

```bash
# macOS
brew install ngrok

# Or download from https://ngrok.com/download
```

### Start ngrok

```bash
# In terminal 1: Start your server
npm run start:sse

# In terminal 2: Start ngrok
ngrok http 3001
```

You'll see output like:
```
Forwarding  https://abc123.ngrok.io -> http://localhost:3001
```

### Use in ChatGPT

**Your server URL:** `https://abc123.ngrok.io/sse`

**OAuth Configuration:**
- OAuth Client ID: (from your `.env.local`)
- OAuth Client Secret: (from your `.env.local`)  
- Token URL: `https://abc123.ngrok.io/oauth/token`

**To get your credentials:**
```bash
cat .env.local | grep MCP_OAUTH
```

See [CHATGPT-SETUP.md](./CHATGPT-SETUP.md) for complete ChatGPT setup guide.

## ngrok Tips

### Free vs Paid

**Free tier:**
- ✅ Random URL that changes each restart
- ✅ Good for testing and development
- ✅ HTTPS included

**Paid ($8/month):**
- ✅ Custom subdomain (`yourname.ngrok.io`)
- ✅ URL stays the same across restarts
- ✅ No need to update ChatGPT config

### Keep ngrok Running

ngrok must stay running while you use the server:

```bash
# Terminal 1
npm run start:sse

# Terminal 2 (keep this open)
ngrok http 3001
```

If ngrok stops, the URL becomes invalid. Restart ngrok and update ChatGPT with the new URL.

## Environment Variables

Required for all setups:

| Variable | Description | Example |
|----------|-------------|---------|
| `PLAID_CLIENT_ID` | Your Plaid client ID | `6656c8bee5f188001c...` |
| `PLAID_SECRET` | Your Plaid secret | `3c70bf742aeaf0ccd...` |
| `PLAID_ENV` | Plaid environment | `sandbox`, `production` |
| `MCP_OAUTH_CLIENT_ID` | OAuth Client ID | Generate with `openssl rand -hex 8` |
| `MCP_OAUTH_CLIENT_SECRET` | OAuth Client Secret | Generate with `openssl rand -hex 16` |
| `PORT` | Server port (optional) | `3001` (default for SSE) |

## Security Notes

### OAuth 2.0 Authentication

OAuth 2.0 authentication is **built-in** and automatically enabled when you set credentials in `.env.local`:

```bash
MCP_OAUTH_CLIENT_ID=your_client_id
MCP_OAUTH_CLIENT_SECRET=your_secret
```

The server will show:
```
🔒 OAuth 2.0 authentication enabled (Client ID: ...)
```

### Additional Security Tips

- ✅ Use HTTPS (ngrok provides this automatically)
- ✅ Keep OAuth credentials secure (never commit to git)
- ✅ Use production Plaid credentials only when ready
- ✅ Monitor server logs for suspicious activity
- ✅ Restart ngrok periodically if using free tier (URL changes = less exposure)

## Testing Your Deployment

### Health Check

```bash
# Test server is running
curl https://abc123.ngrok.io/health

# Should return:
{
  "status": "ok",
  "authentication": "oauth2",
  "endpoints": {
    "sse": "/sse",
    "oauth": "/oauth/token"
  }
}
```

### Test Client

```bash
# Test with OAuth authentication
node test-sse-client.js https://abc123.ngrok.io

# Should output:
# ✓ OAuth token obtained
# ✓ SSE connected (200)
# ✓ All tests passed!
```

### Add to ChatGPT

1. Go to ChatGPT Settings → MCP Servers
2. Add server:
   - **URL:** `https://abc123.ngrok.io/sse`
   - **OAuth Client ID:** (from `.env.local`)
   - **OAuth Client Secret:** (from `.env.local`)
3. ChatGPT will test the connection and show available tools

## Troubleshooting

### ngrok URL changed

**Problem:** ChatGPT can't connect after restarting ngrok

**Solution:** Get new URL from ngrok and update ChatGPT configuration

### Server won't start

**Error:** Missing environment variables

**Solution:** Ensure `.env.local` has all required variables

### OAuth fails

**Error:** "Invalid client credentials"

**Solution:** 
1. Verify OAuth credentials match in both `.env.local` and ChatGPT
2. Regenerate credentials if needed:
   ```bash
   openssl rand -hex 8   # New Client ID
   openssl rand -hex 16  # New Client Secret
   ```
3. Update both `.env.local` and ChatGPT config

### ChatGPT can't reach server

**Checklist:**
- [ ] Server is running (`npm run start:sse`)
- [ ] ngrok is running (`ngrok http 3001`)
- [ ] URL uses `https://` protocol
- [ ] URL ends with `/sse` endpoint
- [ ] OAuth credentials are correct

## Back to Local Testing

To stop ngrok and work locally only:

```bash
# Stop ngrok (Ctrl+C in terminal 2)
# Keep server running in terminal 1

# Test locally
npm run test
```

# Deployment Guide

Deploy your Plaid MCP server for use with ChatGPT.

## Local Development

```bash
# Start the server
npm run start:sse

# Test it
npm run test
```

Server runs on `http://localhost:3001` with SSE endpoint at `/sse`.

## Expose with ngrok

### Install ngrok

```bash
# macOS
brew install ngrok

# Or download from https://ngrok.com/download
```

### Start ngrok

```bash
# Terminal 1: Start server
npm run start:sse

# Terminal 2: Start ngrok
ngrok http 3001
```

You'll get an HTTPS URL like: `https://abc123.ngrok-free.dev`

**Important:** Keep both terminals running. If ngrok stops, the URL becomes invalid.

### Configure ChatGPT

See [CHATGPT-SETUP.md](./CHATGPT-SETUP.md) for complete setup instructions.

Quick reference:
```bash
# Get your OAuth credentials
grep MCP_OAUTH .env.local
```

Use these in ChatGPT:
- **URL:** `https://abc123.ngrok-free.dev` (without `/sse`)
- **OAuth Client ID:** From `.env.local`
- **OAuth Client Secret:** From `.env.local`

## Environment Variables

Required in `.env.local`:

```env
PLAID_CLIENT_ID=your_client_id
PLAID_SECRET=your_secret
PLAID_ENV=sandbox

# OAuth 2.1 (for ChatGPT)
MCP_OAUTH_CLIENT_ID=$(openssl rand -hex 8)
MCP_OAUTH_CLIENT_SECRET=$(openssl rand -hex 16)
```

## Testing Deployment

### Health Check

```bash
curl https://your-ngrok-url.ngrok-free.dev/health
```

Should return status `ok` and authentication type.

### Test OAuth Flow

See [CHATGPT-SETUP.md](./CHATGPT-SETUP.md) for testing with ChatGPT.

## Troubleshooting

### ngrok URL changed

Get the new URL from ngrok output and update ChatGPT configuration.

### Server won't start

Check that `.env.local` has all required variables.

### OAuth authentication fails

1. Verify credentials match in `.env.local` and ChatGPT
2. Restart server after changing `.env.local`
3. Regenerate credentials if needed:
   ```bash
   echo "MCP_OAUTH_CLIENT_ID=$(openssl rand -hex 8)" >> .env.local
   echo "MCP_OAUTH_CLIENT_SECRET=$(openssl rand -hex 16)" >> .env.local
   ```

### ChatGPT can't reach server

Checklist:
- Server is running: `npm run start:sse`
- ngrok is running: `ngrok http 3001`
- Using HTTPS URL (not HTTP)
- OAuth credentials are correct

## Production Deployment

For production (Railway, Render, Fly.io, etc.), see platform-specific guides:

### Environment Variables

Set these in your platform:
```bash
PLAID_CLIENT_ID=your_client_id
PLAID_SECRET=your_secret
PLAID_ENV=production
MCP_OAUTH_CLIENT_ID=$(openssl rand -hex 8)
MCP_OAUTH_CLIENT_SECRET=$(openssl rand -hex 16)
PORT=3001
```

### Start Command

```bash
npm run start:sse
```

### Health Endpoint

Most platforms support health checks at `/health`.

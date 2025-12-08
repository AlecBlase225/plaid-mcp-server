# Authentication Guide

The Plaid MCP server supports three authentication methods:

1. **OAuth 2.1** (Recommended for ChatGPT)
2. **Bearer Token** (Legacy/simple deployments)
3. **Test Mode** (Automated testing only)

## OAuth 2.1 (Recommended)

**For ChatGPT integration** - See [CHATGPT-SETUP.md](./CHATGPT-SETUP.md) for complete guide.

### Quick Setup

1. Generate OAuth credentials:
   ```bash
   echo "MCP_OAUTH_CLIENT_ID=$(openssl rand -hex 8)" >> .env.local
   echo "MCP_OAUTH_CLIENT_SECRET=$(openssl rand -hex 16)" >> .env.local
   ```

2. Start server:
   ```bash
   npm run build
   npm run start:sse
   ```

3. Add to ChatGPT:
   - Settings → Connectors → Add Connector
   - Enter your ngrok URL (without `/sse`)
   - Select OAuth authentication
   - Paste Client ID and Secret
   - Authorize in browser

### Disable OAuth (Not Recommended)

```bash
echo "MCP_OAUTH_ENABLED=false" >> .env.local
```

## Bearer Token (Legacy)

For simple deployments without OAuth complexity.

### Setup

1. Generate token:
   ```bash
   echo "MCP_AUTH_TOKEN=$(openssl rand -hex 32)" >> .env.local
   ```

2. Disable OAuth:
   ```bash
   echo "MCP_OAUTH_ENABLED=false" >> .env.local
   ```

3. Restart server:
   ```bash
   npm run build
   npm run start:sse
   ```

### Usage

Include in all requests:
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" http://localhost:3001/sse
```

## Test Mode (Development Only)

Bypasses all authentication for automated testing. **Never use in production!**

### Usage

```bash
# Run tests
npm run test

# Or manually
MCP_TEST_MODE=true npm run start:sse
```

## Configuration Reference

| Variable | Description | Example |
|----------|-------------|---------|
| `MCP_OAUTH_CLIENT_ID` | OAuth 2.1 client ID | `a1b2c3d4e5f6g7h8` |
| `MCP_OAUTH_CLIENT_SECRET` | OAuth 2.1 client secret | `i9j0k1l2m3n4o5p6...` |
| `MCP_OAUTH_ENABLED` | Enable OAuth (default: `true`) | `true` or `false` |
| `MCP_AUTH_TOKEN` | Legacy bearer token | `a1b2c3d4e5f6...` |
| `MCP_TEST_MODE` | Bypass auth for testing | `true` or `false` |

## Check Status

```bash
curl http://localhost:3001/health
```

Shows current authentication mode: `oauth2.1`, `bearer`, or `disabled`.

## Troubleshooting

### "Authorization header required"
- **OAuth:** Complete authorization flow in browser
- **Bearer:** Include `Authorization: Bearer TOKEN` header

### "Invalid client_id"
- Check `MCP_OAUTH_CLIENT_ID` matches in `.env.local` and ChatGPT
- Restart server after changing credentials

### "Error fetching OAuth configuration"
- Verify server is running: `curl http://localhost:3001/health`
- Check ngrok URL is HTTPS (not HTTP)
- Test discovery: `curl http://localhost:3001/.well-known/oauth-authorization-server`

## Migration: Bearer Token → OAuth 2.1

```bash
# Add OAuth credentials (keep bearer token temporarily)
echo "MCP_OAUTH_CLIENT_ID=$(openssl rand -hex 8)" >> .env.local
echo "MCP_OAUTH_CLIENT_SECRET=$(openssl rand -hex 16)" >> .env.local

# Restart and test
npm run start:sse

# After confirming OAuth works, remove bearer token from .env.local
```

## Related Guides

- **[CHATGPT-SETUP.md](./CHATGPT-SETUP.md)** - Complete ChatGPT integration
- **[DEPLOYMENT.md](./DEPLOYMENT.md)** - Production deployment

#!/usr/bin/env node

/**
 * Test script for the SSE MCP server
 * 
 * Usage: 
 *   node test-sse-client.js [server-url] [client-id] [client-secret]
 * 
 * Examples:
 *   node test-sse-client.js http://localhost:3001
 *   node test-sse-client.js https://your-app.com abc123 def456
 * 
 * Authentication:
 *   - OAuth credentials loaded from .env.local: MCP_OAUTH_CLIENT_ID, MCP_OAUTH_CLIENT_SECRET
 *   - Bearer token loaded from .env.local: MCP_AUTH_TOKEN
 *   - Or pass as arguments: [server-url] [client-id] [client-secret]
 */

// Load environment variables from .env.local
const fs = require('fs');
const path = require('path');

function loadEnvFile() {
  const envPath = path.join(__dirname, '.env.local');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
      // Skip comments and empty lines
      line = line.trim();
      if (!line || line.startsWith('#')) return;
      
      // Parse KEY=VALUE
      const match = line.match(/^([^=]+)=(.*)$/);
      if (match) {
        const key = match[1].trim();
        const value = match[2].trim();
        // Only set if not already in environment
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    });
    console.log('✓ Loaded credentials from .env.local\n');
  }
}

// Load .env.local first
loadEnvFile();

const http = require('http');
const https = require('https');

const SERVER_URL = process.argv[2] || 'http://localhost:3001';
const isHttps = SERVER_URL.startsWith('https://');
const httpModule = isHttps ? https : http;

// OAuth credentials from environment or command line
const OAUTH_CLIENT_ID = process.env.MCP_OAUTH_CLIENT_ID || process.argv[3];
const OAUTH_CLIENT_SECRET = process.env.MCP_OAUTH_CLIENT_SECRET || process.argv[4];
const AUTH_TOKEN = process.env.MCP_AUTH_TOKEN;

console.log(`Testing MCP SSE Server at: ${SERVER_URL}\n`);

if (OAUTH_CLIENT_ID && OAUTH_CLIENT_SECRET) {
  console.log(`🔐 Using OAuth 2.0 authentication (Client ID: ${OAUTH_CLIENT_ID})\n`);
} else if (AUTH_TOKEN) {
  console.log(`🔐 Using Bearer token authentication\n`);
} else {
  console.log(`⚠️  No authentication credentials provided\n`);
}

let accessToken = null;

let messageId = 0;

// Get OAuth access token
function getAccessToken() {
  return new Promise((resolve, reject) => {
    // If we have a bearer token, use that directly (for testing)
    if (AUTH_TOKEN) {
      console.log('✓ Using bearer token from environment\n');
      resolve(AUTH_TOKEN);
      return;
    }

    if (!OAUTH_CLIENT_ID || !OAUTH_CLIENT_SECRET) {
      resolve(null);
      return;
    }

    console.log('✗ OAuth 2.1 requires browser-based authorization flow\n');
    console.log('For automated testing, set MCP_AUTH_TOKEN in .env.local:\n');
    console.log('  MCP_AUTH_TOKEN=your-test-token\n');
    resolve(null);
  });
}

function sendMessage(url, message) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const data = JSON.stringify(message);
    
    const headers = {
      'Content-Type': 'application/json',
      'Content-Length': data.length
    };

    // Add authentication if available
    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`;
    } else if (AUTH_TOKEN) {
      headers['Authorization'] = `Bearer ${AUTH_TOKEN}`;
    }
    
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers
    };

    const req = httpModule.request(options, (res) => {
      let responseData = '';
      
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      
      res.on('end', () => {
        // Check for auth errors
        if (res.statusCode === 401 || res.statusCode === 403) {
          console.error(`✗ Authentication failed (${res.statusCode}):`, responseData);
          reject(new Error(`Authentication failed: ${responseData}`));
          return;
        }
        
        // Check for other errors
        if (res.statusCode >= 400) {
          console.error(`✗ Request failed (${res.statusCode}):`, responseData);
          reject(new Error(`Request failed: ${responseData}`));
          return;
        }
        
        console.log(`✓ POST response (${res.statusCode}):`, responseData || '(empty)');
        resolve(responseData);
      });
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function connectSSE() {
  return new Promise((resolve, reject) => {
    const url = new URL(`${SERVER_URL}/sse`);
    
    console.log(`Connecting to SSE endpoint: ${url.href}`);
    
    const headers = {
      'Accept': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    };

    // Add authentication if available
    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`;
    } else if (AUTH_TOKEN) {
      headers['Authorization'] = `Bearer ${AUTH_TOKEN}`;
    }
    
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: 'GET',
      headers
    };

    const req = httpModule.request(options, (res) => {
      console.log(`✓ SSE connected (${res.statusCode})`);
      console.log('✓ Headers:', res.headers);
      console.log('\n--- Listening for SSE events ---\n');

      let buffer = '';

      res.on('data', (chunk) => {
        buffer += chunk.toString();
        
        // Process complete events (separated by double newlines)
        const events = buffer.split('\n\n');
        buffer = events.pop() || ''; // Keep incomplete event in buffer
        
        events.forEach(event => {
          if (event.trim()) {
            console.log('📥 SSE Event:', event);
            console.log('');
          }
        });
      });

      res.on('end', () => {
        console.log('SSE connection closed by server');
      });

      resolve(res);
    });

    req.on('error', (error) => {
      console.error('✗ SSE connection failed:', error.message);
      reject(error);
    });

    req.end();
  });
}

async function testMCPProtocol() {
  try {
    // Step 0: Get OAuth token if needed
    if (OAUTH_CLIENT_ID && OAUTH_CLIENT_SECRET) {
      console.log('Step 0: Obtaining OAuth access token...\n');
      accessToken = await getAccessToken();
    }

    console.log('Step 1: Connecting to SSE...\n');
    const sseConnection = await connectSSE();
    
    // Wait a moment for connection to stabilize
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    console.log('\nStep 2: Sending initialize request...\n');
    
    const initializeMessage = {
      jsonrpc: '2.0',
      id: messageId++,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {
          roots: {
            listChanged: true
          }
        },
        clientInfo: {
          name: 'test-client',
          version: '1.0.0'
        }
      }
    };
    
    console.log('📤 Sending:', JSON.stringify(initializeMessage, null, 2));
    await sendMessage(`${SERVER_URL}/message`, initializeMessage);
    
    // Wait for response
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    console.log('\nStep 3: Sending tools/list request...\n');
    
    const toolsListMessage = {
      jsonrpc: '2.0',
      id: messageId++,
      method: 'tools/list',
      params: {}
    };
    
    console.log('📤 Sending:', JSON.stringify(toolsListMessage, null, 2));
    await sendMessage(`${SERVER_URL}/message`, toolsListMessage);
    
    // Wait for final response
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    console.log('\n═══════════════════════════════════════');
    console.log('✓ All tests passed!');
    console.log('═══════════════════════════════════════');
    console.log('\nYour SSE server is ready for ChatGPT!');
    console.log(`SSE Endpoint: ${SERVER_URL}/sse\n`);
    
    process.exit(0);
    
  } catch (error) {
    console.error('\n═══════════════════════════════════════');
    console.error('✗ Tests failed!');
    console.error('═══════════════════════════════════════');
    console.error(`\nError: ${error.message}`);
    
    // Provide helpful debugging info
    if (error.message.includes('Authentication failed')) {
      console.error('\n💡 Authentication Troubleshooting:');
      if (!OAUTH_CLIENT_ID && !AUTH_TOKEN) {
        console.error('   ❌ No credentials found in environment');
        console.error('   📝 Solution: Add to .env.local:');
        console.error('      MCP_OAUTH_CLIENT_ID=$(openssl rand -hex 8)');
        console.error('      MCP_OAUTH_CLIENT_SECRET=$(openssl rand -hex 16)');
      } else if (OAUTH_CLIENT_ID) {
        console.error('   ❌ OAuth credentials provided but server rejected them');
        console.error('   📝 Verify .env.local has matching credentials on server');
        console.error('   🔍 Check server logs for details');
      }
      console.error('\n   💡 Or disable auth for testing:');
      console.error('      MCP_REQUIRE_AUTH=false npm run start:sse\n');
    } else {
      console.error('\nMake sure the server is running:');
      console.error('  npm run start:sse\n');
    }
    
    process.exit(1);
  }
}

// Handle Ctrl+C
process.on('SIGINT', () => {
  console.log('\n\nTest interrupted by user');
  process.exit(0);
});

// Run the test
testMCPProtocol();

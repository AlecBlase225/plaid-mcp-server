import * as dotenv from "dotenv";
import express, { Request, Response } from "express";

// Load environment variables from .env.local
dotenv.config({ path: ".env.local" });
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { z } from "zod";
import {
  PlaidApi,
  Configuration,
  PlaidEnvironments,
  Products,
  CountryCode,
  EnrichTransactionDirection,
} from "plaid";
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";

// Types
interface AccessTokenEntry {
  itemId: string;
  accessToken: string;
  institutionName: string;
  storedAt: string;
}

interface TokenStorage {
  [key: string]: AccessTokenEntry;
}

// Configuration
const TOKENS_FILE = path.join(process.env.HOME || "", ".plaid_tokens.json");
const CLIENT_ID = process.env.PLAID_CLIENT_ID || "";
const SECRET = process.env.PLAID_SECRET || "";
const ENV = (process.env.PLAID_ENV || "sandbox") as
  | "sandbox"
  | "development"
  | "production";
const PORT = process.env.PORT || 3001;

if (!CLIENT_ID || !SECRET) {
  console.error(
    "Error: PLAID_CLIENT_ID and PLAID_SECRET environment variables are required"
  );
  process.exit(1);
}

// Initialize Plaid client
const plaidConfig = new Configuration({
  basePath: PlaidEnvironments[ENV],
  baseOptions: {
    headers: {
      "PLAID-CLIENT-ID": CLIENT_ID,
      "PLAID-SECRET": SECRET,
    },
  },
});

const plaidClient = new PlaidApi(plaidConfig);

// Token storage functions
function loadTokens(): TokenStorage {
  try {
    if (fs.existsSync(TOKENS_FILE)) {
      const data = fs.readFileSync(TOKENS_FILE, "utf-8");
      return JSON.parse(data);
    }
  } catch (error) {
    console.error("Error loading tokens:", error);
  }
  return {};
}

function saveTokens(tokens: TokenStorage): void {
  try {
    fs.writeFileSync(TOKENS_FILE, JSON.stringify(tokens, null, 2));
    fs.chmodSync(TOKENS_FILE, 0o600); // Restrict permissions
  } catch (error) {
    console.error("Error saving tokens:", error);
  }
}

function storeToken(
  itemId: string,
  accessToken: string,
  institutionName: string
): void {
  const tokens = loadTokens();
  tokens[itemId] = {
    itemId,
    accessToken,
    institutionName,
    storedAt: new Date().toISOString(),
  };
  saveTokens(tokens);
}

function getToken(itemId: string): string | null {
  const tokens = loadTokens();
  return tokens[itemId]?.accessToken || null;
}

function listStoredItems(): AccessTokenEntry[] {
  const tokens = loadTokens();
  return Object.values(tokens);
}

// Tool implementations
async function createLinkToken(): Promise<string> {
  const response = await plaidClient.linkTokenCreate({
    user: { client_user_id: `user-${Date.now()}` },
    client_name: "Claude Plaid Integration",
    language: "en",
    products: [Products.Transactions],
    country_codes: [CountryCode.Us],
  });
  return response.data.link_token;
}

async function exchangePublicToken(
  publicToken: string,
  institutionName: string
): Promise<{ itemId: string; accessToken: string }> {
  const response = await plaidClient.itemPublicTokenExchange({
    public_token: publicToken,
  });

  const itemId = response.data.item_id;
  const accessToken = response.data.access_token;

  storeToken(itemId, accessToken, institutionName);

  return { itemId, accessToken };
}

async function getAccounts(itemId: string): Promise<object> {
  const accessToken = getToken(itemId);
  if (!accessToken) {
    throw new Error(`No access token found for item ${itemId}`);
  }

  const response = await plaidClient.accountsGet({
    access_token: accessToken,
  });

  return response.data.accounts;
}

async function getBalances(itemId: string): Promise<object> {
  const accessToken = getToken(itemId);
  if (!accessToken) {
    throw new Error(`No access token found for item ${itemId}`);
  }

  const response = await plaidClient.accountsBalanceGet({
    access_token: accessToken,
  });

  return {
    accounts: response.data.accounts,
    item: response.data.item,
  };
}

async function getTransactions(
  itemId: string,
  startDate: string,
  endDate: string,
  limit?: number,
  accountIds?: string[]
): Promise<object> {
  const accessToken = getToken(itemId);
  if (!accessToken) {
    throw new Error(`No access token found for item ${itemId}`);
  }

  const response = await plaidClient.transactionsGet({
    access_token: accessToken,
    start_date: startDate,
    end_date: endDate,
    options: {
      count: limit || 100,
      account_ids: accountIds,
    },
  });

  return {
    transactions: response.data.transactions,
    total_transactions: response.data.total_transactions,
    accounts: response.data.accounts,
  };
}

function listItems(): object {
  const items = listStoredItems();
  return items.map((item) => ({
    itemId: item.itemId,
    institution: item.institutionName,
    storedAt: item.storedAt,
  }));
}

// Statements functions
async function refreshStatements(
  itemId: string,
  startDate: string,
  endDate: string
): Promise<object> {
  const accessToken = getToken(itemId);
  if (!accessToken) {
    throw new Error(`No access token found for item ${itemId}`);
  }

  const response = await plaidClient.statementsRefresh({
    access_token: accessToken,
    start_date: startDate,
    end_date: endDate,
  });

  return {
    request_id: response.data.request_id,
  };
}

async function listStatements(itemId: string): Promise<object> {
  const accessToken = getToken(itemId);
  if (!accessToken) {
    throw new Error(`No access token found for item ${itemId}`);
  }

  const response = await plaidClient.statementsList({
    access_token: accessToken,
  });

  return response.data;
}

async function downloadStatement(
  itemId: string,
  statementId: string
): Promise<object> {
  const accessToken = getToken(itemId);
  if (!accessToken) {
    throw new Error(`No access token found for item ${itemId}`);
  }

  const response = await plaidClient.statementsDownload(
    {
      access_token: accessToken,
      statement_id: statementId,
    },
    {
      responseType: "arraybuffer",
    }
  );

  // Convert buffer to base64 for easy transmission
  const base64 = Buffer.from(response.data as ArrayBuffer).toString("base64");

  return {
    statement_id: statementId,
    content_type: response.headers["content-type"] || "application/pdf",
    data: base64,
    size: base64.length,
  };
}

async function getRecurringTransactions(
  itemId: string,
  accountIds?: string[]
): Promise<object> {
  const accessToken = getToken(itemId);
  if (!accessToken) {
    throw new Error(`No access token found for item ${itemId}`);
  }

  const response = await plaidClient.transactionsRecurringGet({
    access_token: accessToken,
    account_ids: accountIds,
  });

  return {
    inflow_streams: response.data.inflow_streams,
    outflow_streams: response.data.outflow_streams,
  };
}

async function enrichTransactions(
  transactions: Array<{
    id: string;
    description: string;
    amount: number;
    direction: EnrichTransactionDirection;
    iso_currency_code?: string;
    date_posted?: string;
    account_type?: string;
    account_subtype?: string;
    mcc?: string;
    location?: {
      country?: string;
      region?: string;
      city?: string;
      address?: string;
      postal_code?: string;
    };
  }>
): Promise<object> {
  const response = await plaidClient.transactionsEnrich({
    account_type: "depository",
    transactions: transactions.map((tx) => ({
      id: tx.id,
      description: tx.description,
      amount: tx.amount,
      direction: tx.direction,
      iso_currency_code: tx.iso_currency_code || "USD",
      ...(tx.date_posted && { date_posted: tx.date_posted }),
      ...(tx.account_type && { account_type: tx.account_type }),
      ...(tx.account_subtype && { account_subtype: tx.account_subtype }),
      ...(tx.mcc && { mcc: tx.mcc }),
      ...(tx.location && { location: tx.location }),
    })),
  });

  return {
    enriched_transactions: response.data.enriched_transactions,
  };
}

async function getInvestmentHoldings(
  itemId: string,
  accountIds?: string[]
): Promise<object> {
  const accessToken = getToken(itemId);
  if (!accessToken) {
    throw new Error(`No access token found for item ${itemId}`);
  }

  const response = await plaidClient.investmentsHoldingsGet({
    access_token: accessToken,
    options: accountIds ? { account_ids: accountIds } : undefined,
  });

  return {
    accounts: response.data.accounts,
    holdings: response.data.holdings,
    securities: response.data.securities,
  };
}

// Function to create and configure a new MCP server instance
function createMcpServer() {
  const server = new McpServer(
    {
      name: "Plaid Banking",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Register all tools
  server.registerTool(
    "create_link_token",
  {
    description: "Create a Plaid Link token to connect a bank account",
    inputSchema: z.object({}),
  },
  async () => {
    try {
      const linkToken = await createLinkToken();
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              success: true,
              link_token: linkToken,
              message:
                "Use this link token to complete account linking in Plaid Link UI",
            }),
          },
        ],
      };
    } catch (error: any) {
      let errorMsg = error instanceof Error ? error.message : String(error);
      let errorDetails: any = {};
      
      if (error.response?.data) {
        errorDetails = error.response.data;
        errorMsg = JSON.stringify(error.response.data, null, 2);
      }
      
      console.error("Full error details:", error);
      console.error("Error response:", error.response?.data);
      
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ 
              success: false, 
              error: errorMsg,
              details: errorDetails,
              env: ENV,
              has_client_id: !!CLIENT_ID,
              has_secret: !!SECRET
            }, null, 2),
          },
        ],
      };
    }
  }
);

  server.registerTool(
    "exchange_public_token",
  {
    description: "Exchange Plaid public token for access token and store it",
    inputSchema: z.object({
      public_token: z.string().describe("The public token received from Plaid Link"),
      institution_name: z.string().describe("The name of the financial institution"),
    }),
  },
  async (args) => {
    try {
      const result = await exchangePublicToken(
        args.public_token,
        args.institution_name
      );
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              success: true,
              item_id: result.itemId,
              message: `Successfully linked account. Item ID: ${result.itemId}`,
            }),
          },
        ],
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ success: false, error: errorMsg }),
          },
        ],
      };
    }
  }
);

  server.registerTool(
    "get_accounts",
  {
    description: "Get all bank accounts for an item",
    inputSchema: z.object({
      item_id: z.string().describe("The Plaid item ID"),
    }),
  },
  async (args) => {
    try {
      const accounts = await getAccounts(args.item_id);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ success: true, accounts }),
          },
        ],
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ success: false, error: errorMsg }),
          },
        ],
      };
    }
  }
);

  server.registerTool(
    "get_balances",
  {
    description: "Get current account balances",
    inputSchema: z.object({
      item_id: z.string().describe("The Plaid item ID"),
    }),
  },
  async (args) => {
    try {
      const balances = await getBalances(args.item_id);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ success: true, ...balances }),
          },
        ],
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ success: false, error: errorMsg }),
          },
        ],
      };
    }
  }
);

  server.registerTool(
    "get_transactions",
  {
    description: "Get transactions within a date range",
    inputSchema: z.object({
      item_id: z.string().describe("The Plaid item ID"),
      start_date: z.string().describe("Start date in YYYY-MM-DD format"),
      end_date: z.string().describe("End date in YYYY-MM-DD format"),
      limit: z.number().optional().describe("Maximum number of transactions to return (default: 100)"),
      account_ids: z.array(z.string()).optional().describe("Optional array of account IDs to filter transactions for specific accounts"),
    }),
  },
  async (args) => {
    try {
      const transactions = await getTransactions(
        args.item_id,
        args.start_date,
        args.end_date,
        args.limit,
        args.account_ids
      );
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ success: true, ...transactions }),
          },
        ],
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ success: false, error: errorMsg }),
          },
        ],
      };
    }
  }
);

  server.registerTool(
    "list_items",
  {
    description: "List all connected bank accounts",
    inputSchema: z.object({}),
  },
  async () => {
    try {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ success: true, items: listItems() }),
          },
        ],
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ success: false, error: errorMsg }),
          },
        ],
      };
    }
  }
);

  server.registerTool(
    "refresh_statements",
  {
    description: "Refresh available bank statements for date range",
    inputSchema: z.object({
      item_id: z.string().describe("The Plaid item ID"),
      start_date: z.string().describe("Start date in YYYY-MM-DD format"),
      end_date: z.string().describe("End date in YYYY-MM-DD format"),
    }),
  },
  async (args) => {
    try {
      const result = await refreshStatements(
        args.item_id,
        args.start_date,
        args.end_date
      );
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ success: true, ...result }),
          },
        ],
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ success: false, error: errorMsg }),
          },
        ],
      };
    }
  }
);

  server.registerTool(
    "list_statements",
  {
    description: "List all available bank statements",
    inputSchema: z.object({
      item_id: z.string().describe("The Plaid item ID"),
    }),
  },
  async (args) => {
    try {
      const result = await listStatements(args.item_id);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ success: true, ...result }),
          },
        ],
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ success: false, error: errorMsg }),
          },
        ],
      };
    }
  }
);

  server.registerTool(
    "download_statement",
  {
    description: "Download a bank statement as PDF",
    inputSchema: z.object({
      item_id: z.string().describe("The Plaid item ID"),
      statement_id: z.string().describe("The statement ID to download"),
    }),
  },
  async (args) => {
    try {
      const result = await downloadStatement(args.item_id, args.statement_id);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ success: true, ...result }),
          },
        ],
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ success: false, error: errorMsg }),
          },
        ],
      };
    }
  }
);

  server.registerTool(
    "get_recurring_transactions",
  {
    description: "Get recurring transactions and subscriptions",
    inputSchema: z.object({
      item_id: z.string().describe("The Plaid item ID"),
      account_ids: z
        .array(z.string())
        .optional()
        .describe("Optional array of account IDs to filter results"),
    }),
  },
  async (args) => {
    try {
      const result = await getRecurringTransactions(
        args.item_id,
        args.account_ids
      );
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ success: true, ...result }),
          },
        ],
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ success: false, error: errorMsg }),
          },
        ],
      };
    }
  }
);

  server.registerTool(
    "enrich_transactions",
  {
    description: "Enrich transactions with merchant info and categories",
    inputSchema: z.object({
      transactions: z.array(
        z.object({
          id: z.string().describe("A unique ID for the transaction"),
          description: z.string().describe("The raw description of the transaction"),
          amount: z.number().describe("The absolute value of the transaction (>= 0). Must be realistic for best enrichment results."),
          direction: z.enum(["INFLOW", "OUTFLOW"]).describe("REQUIRED: The direction of the transaction flow. 'INFLOW' for money coming in, 'OUTFLOW' for money going out."),
          iso_currency_code: z.string().optional().describe("The ISO-4217 currency code (e.g., USD, EUR). Defaults to USD if not provided."),
          date_posted: z.string().optional().describe("The date the transaction posted in ISO 8601 format (YYYY-MM-DD)"),
          account_type: z.string().optional().describe("The account type (e.g., 'depository', 'credit')"),
          account_subtype: z.string().optional().describe("The account subtype (e.g., 'checking', 'savings')"),
          mcc: z.string().optional().describe("Merchant category code (MCC) - a four-digit number"),
          location: z.object({
            country: z.string().optional(),
            region: z.string().optional(),
            city: z.string().optional(),
            address: z.string().optional(),
            postal_code: z.string().optional(),
          }).optional().describe("Location information for the transaction"),
        })
      ).describe("An array of transactions to enrich (max 100 per request)"),
    }),
  },
  async (args) => {
    try {
      const result = await enrichTransactions(args.transactions as Array<{
        id: string;
        description: string;
        amount: number;
        direction: EnrichTransactionDirection;
        iso_currency_code?: string;
        date_posted?: string;
        account_type?: string;
        account_subtype?: string;
        mcc?: string;
        location?: {
          country?: string;
          region?: string;
          city?: string;
          address?: string;
          postal_code?: string;
        };
      }>);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ success: true, ...result }),
          },
        ],
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ success: false, error: errorMsg }),
          },
        ],
      };
    }
  }
);

  server.registerTool(
    "get_investment_holdings",
  {
    description: "Get investment holdings and portfolio details",
    inputSchema: z.object({
      item_id: z.string().describe("The Plaid item ID"),
      account_ids: z
        .array(z.string())
        .optional()
        .describe("Optional array of account IDs to filter results to specific investment accounts"),
    }),
  },
  async (args) => {
    try {
      const result = await getInvestmentHoldings(
        args.item_id,
        args.account_ids
      );
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ success: true, ...result }),
          },
        ],
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ success: false, error: errorMsg }),
          },
        ],
      };
    }
    }
  );

  return server;
}

// Initialize Express app for SSE
const app = express();

// Store active transports and servers
const activeSessions = new Map<string, { transport: SSEServerTransport; server: McpServer }>();

// OAuth 2.1 Types
interface RegisteredClient {
  client_id: string;
  client_secret?: string;
  redirect_uris: string[];
  grant_types: string[];
  response_types: string[];
  token_endpoint_auth_method: string;
  registered_at: number;
}

interface AuthorizationCode {
  code: string;
  client_id: string;
  redirect_uri: string;
  code_challenge: string;
  code_challenge_method: string;
  expires_at: number;
  user_approved: boolean;
}

interface OAuth2Token {
  clientId: string;
  expiresAt: number;
  scope?: string;
}

// Authentication configuration
// OAuth 2.1 with Dynamic Client Registration and PKCE
const OAUTH_ENABLED = process.env.MCP_OAUTH_ENABLED !== "false";

// Legacy Bearer Token (fallback)
const AUTH_TOKEN = process.env.MCP_AUTH_TOKEN;

// Test mode - bypass authentication for automated testing
const TEST_MODE = process.env.MCP_TEST_MODE === "true";

const REQUIRE_AUTH = !TEST_MODE && (process.env.MCP_REQUIRE_AUTH === "true" || OAUTH_ENABLED || !!AUTH_TOKEN);

// OAuth 2.1 Storage (in production, use Redis or database)
const registeredClients = new Map<string, RegisteredClient>();
const authorizationCodes = new Map<string, AuthorizationCode>();
const issuedTokens = new Map<string, OAuth2Token>();

if (TEST_MODE) {
  console.log("🧪 Test mode enabled - authentication bypassed (for automated testing only)");
} else if (REQUIRE_AUTH) {
  if (OAUTH_ENABLED) {
    console.log("🔒 OAuth 2.1 authentication enabled (with PKCE and Dynamic Client Registration)");
  } else if (AUTH_TOKEN) {
    console.log("🔒 Bearer token authentication enabled");
  } else {
    console.warn("⚠️  Warning: MCP_REQUIRE_AUTH is true but no credentials set!");
  }
} else {
  console.warn("⚠️  Warning: Running without authentication");
}

// Request logging middleware (to debug ChatGPT requests)
app.use((req, res, next) => {
  console.log(`📥 ${req.method} ${req.path} - ${req.ip}`);
  console.log(`   Headers:`, JSON.stringify({
    authorization: req.headers.authorization ? '(present)' : '(none)',
    'user-agent': req.headers['user-agent'],
    accept: req.headers.accept
  }));
  next();
});

// CORS middleware for remote access
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ============================================================================
// PUBLIC ENDPOINTS (No Authentication Required)
// ============================================================================

// OAuth 2.1 Discovery Endpoints (must be public for ChatGPT)
const oauthDiscoveryHandler = (req: Request, res: Response) => {
  if (!OAUTH_ENABLED) {
    return res.status(404).json({ error: "OAuth not configured" });
  }

  // Use X-Forwarded-Proto for proxied requests (ngrok, etc.)
  const protocol = req.get('x-forwarded-proto') || req.protocol;
  const baseUrl = `${protocol}://${req.get('host')}`;
  
  res.json({
    issuer: baseUrl,
    authorization_endpoint: `${baseUrl}/oauth/authorize`,
    token_endpoint: `${baseUrl}/oauth/token`,
    registration_endpoint: `${baseUrl}/oauth/register`,
    grant_types_supported: ["authorization_code"],
    response_types_supported: ["code"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none", "client_secret_post", "client_secret_basic"],
    scopes_supported: ["mcp"],
    response_modes_supported: ["query"],
    revocation_endpoint: `${baseUrl}/oauth/revoke`,
    revocation_endpoint_auth_methods_supported: ["none"]
  });
};

app.get("/.well-known/oauth-authorization-server", oauthDiscoveryHandler);
app.get("/sse/.well-known/oauth-authorization-server", oauthDiscoveryHandler);
app.get("/.well-known/oauth-authorization-server/sse", oauthDiscoveryHandler);

// OpenID Configuration (ChatGPT looks for this)
const openidConfigHandler = (req: Request, res: Response) => {
  if (!OAUTH_ENABLED) {
    return res.status(404).json({ error: "OAuth not configured" });
  }

  // Use X-Forwarded-Proto for proxied requests (ngrok, etc.)
  const protocol = req.get('x-forwarded-proto') || req.protocol;
  const baseUrl = `${protocol}://${req.get('host')}`;
  
  res.json({
    issuer: baseUrl,
    authorization_endpoint: `${baseUrl}/oauth/authorize`,
    token_endpoint: `${baseUrl}/oauth/token`,
    registration_endpoint: `${baseUrl}/oauth/register`,
    grant_types_supported: ["authorization_code"],
    response_types_supported: ["code"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none", "client_secret_post", "client_secret_basic"]
  });
};

app.get("/.well-known/openid-configuration", openidConfigHandler);
app.get("/sse/.well-known/openid-configuration", openidConfigHandler);
app.get("/.well-known/openid-configuration/sse", openidConfigHandler);

// OAuth Protected Resource (RFC 8705)
const oauthProtectedResourceHandler = (req: Request, res: Response) => {
  if (!OAUTH_ENABLED) {
    return res.status(404).json({ error: "OAuth not configured" });
  }

  const protocol = req.get('x-forwarded-proto') || req.protocol;
  const baseUrl = `${protocol}://${req.get('host')}`;
  
  res.json({
    resource: `${baseUrl}/sse`,
    authorization_servers: [`${baseUrl}`],
    bearer_methods_supported: ["header"],
    resource_documentation: `${baseUrl}/health`,
    scopes_supported: ["mcp"]
  });
};

app.get("/.well-known/oauth-protected-resource", oauthProtectedResourceHandler);
app.get("/.well-known/oauth-protected-resource/sse", oauthProtectedResourceHandler);

// MCP configuration endpoint (for ChatGPT MCP discovery)
app.get("/.well-known/mcp", (req: Request, res: Response) => {
  // Use X-Forwarded-Proto for proxied requests (ngrok, etc.)
  const protocol = req.get('x-forwarded-proto') || req.protocol;
  const baseUrl = `${protocol}://${req.get('host')}`;
  
  res.json({
    name: "Plaid Banking",
    version: "1.0.0",
    sse_endpoint: `${baseUrl}/sse`,
    authentication: OAUTH_ENABLED ? {
      type: "oauth2.1",
      authorization_endpoint: `${baseUrl}/oauth/authorize`,
      token_endpoint: `${baseUrl}/oauth/token`,
      registration_endpoint: `${baseUrl}/oauth/register`,
      grant_types: ["authorization_code"],
      pkce_required: true
    } : undefined
  });
});

// MCP metadata endpoint (what ChatGPT checks first)
const rootMetadataHandler = (req: Request, res: Response) => {
  // Use X-Forwarded-Proto for proxied requests (ngrok, etc.)
  const protocol = req.get('x-forwarded-proto') || req.protocol;
  const baseUrl = `${protocol}://${req.get('host')}`;
  
  res.json({
    name: "Plaid Banking",
    version: "1.0.0",
    protocol: "mcp/1.0",
    transport: "sse",
    endpoints: {
      sse: `${baseUrl}/sse`,
      health: `${baseUrl}/health`,
      logo: `${baseUrl}/logo.svg`
    },
    authentication: OAUTH_ENABLED ? {
      type: "oauth2.1",
      flows: ["authorization_code"],
      authorization_url: `${baseUrl}/oauth/authorize`,
      token_url: `${baseUrl}/oauth/token`,
      registration_url: `${baseUrl}/oauth/register`,
      pkce_required: true,
      required: true
    } : {
      type: "none",
      required: false
    },
    capabilities: ["tools"]
  });
};

app.get("/", rootMetadataHandler);
app.post("/", rootMetadataHandler);

// Health check endpoint (public)
app.get("/health", (req: Request, res: Response) => {
  // Use X-Forwarded-Proto for proxied requests (ngrok, etc.)
  const protocol = req.get('x-forwarded-proto') || req.protocol;
  const baseUrl = `${protocol}://${req.get('host')}`;
  
  res.json({
    status: "ok",
    server: "plaid-mcp-sse-server",
    name: "Plaid Banking",
    version: "1.0.0",
    logo: "/logo.svg",
    authentication: REQUIRE_AUTH ? (OAUTH_ENABLED ? "oauth2.1" : "bearer") : "disabled",
    endpoints: {
      sse: "/sse",
      oauth_authorize: OAUTH_ENABLED ? "/oauth/authorize" : undefined,
      oauth_token: OAUTH_ENABLED ? "/oauth/token" : undefined,
      oauth_register: OAUTH_ENABLED ? "/oauth/register" : undefined,
      oauth_discovery: OAUTH_ENABLED ? "/.well-known/oauth-authorization-server" : undefined,
      openid_configuration: OAUTH_ENABLED ? "/.well-known/openid-configuration" : undefined,
      mcp_discovery: "/.well-known/mcp"
    },
    registered_clients: registeredClients.size,
    active_sessions: activeSessions.size
  });
});

// Logo endpoint (public)
app.get("/logo.svg", (req: Request, res: Response) => {
  const logoPath = path.join(__dirname, "logo.svg");
  res.setHeader('Content-Type', 'image/svg+xml');
  if (fs.existsSync(logoPath)) {
    res.sendFile(logoPath);
  } else {
    // Fallback: send inline SVG
    res.send(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" rx="15" fill="#1E3A8A"/>
  <path d="M30 40 L50 25 L70 40 L70 75 L30 75 Z" fill="#60A5FA" stroke="#3B82F6" stroke-width="2"/>
  <circle cx="40" cy="55" r="3" fill="#FCD34D"/>
  <circle cx="50" cy="55" r="3" fill="#FCD34D"/>
  <circle cx="60" cy="55" r="3" fill="#FCD34D"/>
  <text x="50" y="92" font-family="Arial, sans-serif" font-size="12" font-weight="bold" fill="#BFDBFE" text-anchor="middle">PLAID</text>
</svg>`);
  }
});

// ============================================================================
// OAuth 2.1 Endpoints (Dynamic Client Registration + Authorization Code + PKCE)
// ============================================================================

// 1. Dynamic Client Registration (RFC 7591)
app.post("/oauth/register", (req: Request, res: Response) => {
  const { redirect_uris, grant_types, response_types, token_endpoint_auth_method } = req.body;

  console.log(`📝 OAuth client registration request`);

  // Validate required fields
  if (!redirect_uris || !Array.isArray(redirect_uris) || redirect_uris.length === 0) {
    return res.status(400).json({
      error: "invalid_request",
      error_description: "redirect_uris is required and must be a non-empty array"
    });
  }

  // Generate client credentials
  const client_id = `mcp_client_${crypto.randomBytes(16).toString('hex')}`;
  const client_secret = token_endpoint_auth_method === "none" ? undefined : crypto.randomBytes(32).toString('hex');

  // Store client
  const client: RegisteredClient = {
    client_id,
    client_secret,
    redirect_uris,
    grant_types: grant_types || ["authorization_code"],
    response_types: response_types || ["code"],
    token_endpoint_auth_method: token_endpoint_auth_method || "client_secret_basic",
    registered_at: Date.now()
  };

  registeredClients.set(client_id, client);

  console.log(`✅ OAuth client registered: ${client_id}`);

  // Return client credentials
  const response: any = {
    client_id,
    redirect_uris,
    grant_types: client.grant_types,
    response_types: client.response_types,
    token_endpoint_auth_method: client.token_endpoint_auth_method,
    client_id_issued_at: Math.floor(client.registered_at / 1000)
  };

  if (client_secret) {
    response.client_secret = client_secret;
    response.client_secret_expires_at = 0; // Never expires
  }

  res.status(201).json(response);
});

// 2. Authorization Endpoint (with user consent UI)
app.get("/oauth/authorize", (req: Request, res: Response) => {
  const {
    client_id,
    redirect_uri,
    response_type,
    state,
    code_challenge,
    code_challenge_method,
    scope
  } = req.query;

  console.log(`🔐 OAuth authorization request from client: ${client_id}`);

  // Validate client (check both registered clients and pre-configured clients)
  let client = registeredClients.get(client_id as string);
  
  // If not found in registered clients, check if it's a pre-configured client from env
  const PRE_CONFIGURED_CLIENT_ID = process.env.MCP_OAUTH_CLIENT_ID;
  if (!client && PRE_CONFIGURED_CLIENT_ID && client_id === PRE_CONFIGURED_CLIENT_ID) {
    // Auto-register pre-configured client on first use
    client = {
      client_id: PRE_CONFIGURED_CLIENT_ID,
      client_secret: process.env.MCP_OAUTH_CLIENT_SECRET,
      redirect_uris: [redirect_uri as string], // Trust the redirect_uri for pre-configured clients
      grant_types: ["authorization_code"],
      response_types: ["code"],
      token_endpoint_auth_method: "client_secret_post",
      registered_at: Date.now()
    };
    registeredClients.set(PRE_CONFIGURED_CLIENT_ID, client);
    console.log(`✅ Auto-registered pre-configured client: ${PRE_CONFIGURED_CLIENT_ID}`);
  }
  
  if (!client) {
    return res.status(400).send(`
      <html><body>
        <h1>Authorization Error</h1>
        <p>Invalid client_id: ${client_id}</p>
        <p>Client must register first at /oauth/register or use pre-configured credentials</p>
      </body></html>
    `);
  }

  // Validate redirect_uri (allow any redirect_uri for pre-configured clients, add to list)
  if (!redirect_uri) {
    return res.status(400).send(`
      <html><body>
        <h1>Authorization Error</h1>
        <p>redirect_uri is required</p>
      </body></html>
    `);
  }
  
  if (!client.redirect_uris.includes(redirect_uri as string)) {
    // For pre-configured clients, auto-add the redirect_uri
    if (process.env.MCP_OAUTH_CLIENT_ID && client_id === process.env.MCP_OAUTH_CLIENT_ID) {
      client.redirect_uris.push(redirect_uri as string);
      console.log(`📝 Added redirect_uri for pre-configured client: ${redirect_uri}`);
    } else {
      return res.status(400).send(`
        <html><body>
          <h1>Authorization Error</h1>
          <p>Invalid redirect_uri: ${redirect_uri}</p>
          <p>Registered URIs: ${client.redirect_uris.join(', ')}</p>
        </body></html>
      `);
    }
  }

  // Validate PKCE
  if (!code_challenge || !code_challenge_method) {
    return res.status(400).send(`
      <html><body>
        <h1>Authorization Error</h1>
        <p>PKCE is required (code_challenge and code_challenge_method)</p>
      </body></html>
    `);
  }

  if (code_challenge_method !== "S256") {
    return res.status(400).send(`
      <html><body>
        <h1>Authorization Error</h1>
        <p>Only S256 code_challenge_method is supported</p>
      </body></html>
    `);
  }

  // Show consent UI (simple auto-approval for now)
  res.send(`
    <html>
      <head>
        <title>Authorize MCP Access</title>
        <style>
          body { font-family: system-ui; max-width: 600px; margin: 50px auto; padding: 20px; }
          .container { background: #f5f5f5; padding: 30px; border-radius: 8px; }
          h1 { color: #333; }
          .info { background: white; padding: 15px; margin: 20px 0; border-radius: 4px; }
          button { background: #0066cc; color: white; border: none; padding: 12px 24px; 
                   border-radius: 4px; font-size: 16px; cursor: pointer; margin-right: 10px; }
          button:hover { background: #0052a3; }
          .cancel { background: #666; }
          .cancel:hover { background: #444; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>🔒 Authorize MCP Access</h1>
          <p>An application wants to access your Plaid MCP server:</p>
          <div class="info">
            <p><strong>Client ID:</strong> ${client_id}</p>
            <p><strong>Scope:</strong> ${scope || 'mcp (full access)'}</p>
            <p><strong>Redirect URI:</strong> ${redirect_uri}</p>
          </div>
          <p>This will allow the application to:</p>
          <ul>
            <li>Access your Plaid banking data</li>
            <li>Execute MCP tools on your behalf</li>
            <li>Manage your connected accounts</li>
          </ul>
          <form action="/oauth/authorize" method="post">
            <input type="hidden" name="client_id" value="${client_id}">
            <input type="hidden" name="redirect_uri" value="${redirect_uri}">
            <input type="hidden" name="state" value="${state || ''}">
            <input type="hidden" name="code_challenge" value="${code_challenge}">
            <input type="hidden" name="code_challenge_method" value="${code_challenge_method}">
            <input type="hidden" name="scope" value="${scope || ''}">
            <button type="submit" name="approve" value="true">Authorize</button>
            <button type="submit" name="approve" value="false" class="cancel">Cancel</button>
          </form>
        </div>
      </body>
    </html>
  `);
});

// Handle authorization form submission
app.post("/oauth/authorize", express.urlencoded({ extended: true }), (req: Request, res: Response) => {
  const {
    client_id,
    redirect_uri,
    state,
    code_challenge,
    code_challenge_method,
    approve
  } = req.body;

  console.log(`📝 OAuth authorization ${approve === 'true' ? 'approved' : 'denied'} by user`);

  if (approve !== 'true') {
    // User denied
    const errorUrl = `${redirect_uri}?error=access_denied&error_description=User+denied+authorization${state ? '&state=' + encodeURIComponent(state) : ''}`;
    return res.redirect(errorUrl);
  }

  // Generate authorization code
  const code = crypto.randomBytes(32).toString('base64url');
  const authCode: AuthorizationCode = {
    code,
    client_id,
    redirect_uri,
    code_challenge,
    code_challenge_method,
    expires_at: Date.now() + (10 * 60 * 1000), // 10 minutes
    user_approved: true
  };

  authorizationCodes.set(code, authCode);

  console.log(`✅ Authorization code issued: ${code.substring(0, 16)}...`);

  // Redirect back with code
  const successUrl = `${redirect_uri}?code=${encodeURIComponent(code)}${state ? '&state=' + encodeURIComponent(state) : ''}`;
  res.redirect(successUrl);
});

// 3. Token Endpoint (exchange authorization code for access token)
app.post("/oauth/token", (req: Request, res: Response) => {
  const {
    grant_type,
    code,
    redirect_uri,
    code_verifier,
    client_id,
    client_secret
  } = req.body;

  console.log(`🎫 OAuth token request (grant_type: ${grant_type})`);

  // Validate grant type
  if (grant_type !== "authorization_code") {
    return res.status(400).json({
      error: "unsupported_grant_type",
      error_description: "Only authorization_code grant type is supported"
    });
  }

  // Validate required fields
  if (!code || !redirect_uri || !code_verifier) {
    return res.status(400).json({
      error: "invalid_request",
      error_description: "code, redirect_uri, and code_verifier are required"
    });
  }

  // Retrieve authorization code
  const authCode = authorizationCodes.get(code);
  if (!authCode) {
    return res.status(400).json({
      error: "invalid_grant",
      error_description: "Invalid or expired authorization code"
    });
  }

  // Check expiration
  if (Date.now() > authCode.expires_at) {
    authorizationCodes.delete(code);
    return res.status(400).json({
      error: "invalid_grant",
      error_description: "Authorization code has expired"
    });
  }

  // Validate client
  if (client_id && authCode.client_id !== client_id) {
    return res.status(400).json({
      error: "invalid_grant",
      error_description: "Authorization code was issued to a different client"
    });
  }

  // Validate redirect_uri
  if (authCode.redirect_uri !== redirect_uri) {
    return res.status(400).json({
      error: "invalid_grant",
      error_description: "redirect_uri does not match"
    });
  }

  // Verify PKCE challenge
  const hash = crypto.createHash('sha256').update(code_verifier).digest();
  const computedChallenge = hash.toString('base64url');
  
  if (computedChallenge !== authCode.code_challenge) {
    authorizationCodes.delete(code);
    return res.status(400).json({
      error: "invalid_grant",
      error_description: "PKCE verification failed"
    });
  }

  // Authorization code is valid and verified - delete it (one-time use)
  authorizationCodes.delete(code);

  // Generate access token
  const accessToken = `mcp_access_${crypto.randomBytes(32).toString('base64url')}`;
  const expiresIn = 3600; // 1 hour
  const expiresAt = Date.now() + (expiresIn * 1000);

  // Store token
  issuedTokens.set(accessToken, {
    clientId: authCode.client_id,
    expiresAt,
    scope: "mcp"
  });

  console.log(`✅ Access token issued for client: ${authCode.client_id}`);

  res.json({
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: expiresIn,
    scope: "mcp"
  });
});

// 4. Token Revocation Endpoint (optional but recommended)
app.post("/oauth/revoke", (req: Request, res: Response) => {
  const { token } = req.body;

  if (token && issuedTokens.has(token)) {
    issuedTokens.delete(token);
    console.log(`🗑️  Token revoked`);
  }

  // Always return 200 per RFC 7009
  res.status(200).send();
});

// Authentication middleware
function requireAuth(req: any, res: any, next: any) {
  // Skip auth in test mode
  if (TEST_MODE) {
    return next();
  }

  // Skip auth for public endpoints
  const publicPaths = [
    "/health",
    "/logo.svg",
    "/oauth/token",
    "/"
  ];
  
  // Skip auth for all .well-known paths (OAuth discovery)
  if (req.path.includes("/.well-known/")) {
    return next();
  }
  
  // Skip auth for specific public paths
  if (publicPaths.includes(req.path)) {
    return next();
  }

  // Skip if auth is not required
  if (!REQUIRE_AUTH) {
    return next();
  }

  // Check for Authorization header
  const authHeader = req.headers.authorization;
  
  if (!authHeader) {
    console.log(`❌ Unauthorized access attempt from ${req.ip} - No Authorization header`);
    
    // Add WWW-Authenticate header for OAuth discovery (RFC 6750 + RFC 8414)
    const protocol = req.get('x-forwarded-proto') || req.protocol;
    const baseUrl = `${protocol}://${req.get('host')}`;
    
    if (OAUTH_ENABLED) {
      // Include endpoints in WWW-Authenticate header for OAuth discovery
      res.setHeader('WWW-Authenticate', 
        `Bearer realm="${baseUrl}", ` +
        `error="invalid_token", ` +
        `error_description="Authorization header required", ` +
        `authorization_uri="${baseUrl}/oauth/authorize", ` +
        `token_uri="${baseUrl}/oauth/token", ` +
        `registration_uri="${baseUrl}/oauth/register"`
      );
    }
    
    return res.status(401).json({ 
      error: "Unauthorized",
      message: "Authorization header required",
      authentication: OAUTH_ENABLED ? {
        type: "oauth2.1",
        authorization_endpoint: `${baseUrl}/oauth/authorize`,
        token_endpoint: `${baseUrl}/oauth/token`,
        registration_endpoint: `${baseUrl}/oauth/register`,
        grant_type: "authorization_code",
        pkce_required: true
      } : undefined
    });
  }

  // Extract token from "Bearer TOKEN" format
  const token = authHeader.replace(/^Bearer\s+/i, "");
  
  if (!token || token === authHeader) {
    console.log(`❌ Unauthorized access attempt from ${req.ip} - Invalid Authorization format`);
    
    // Add WWW-Authenticate header
    const protocol = req.get('x-forwarded-proto') || req.protocol;
    const baseUrl = `${protocol}://${req.get('host')}`;
    
    if (OAUTH_ENABLED) {
      res.setHeader('WWW-Authenticate', `Bearer realm="${baseUrl}", error="invalid_token", error_description="Invalid token format"`);
    }
    
    return res.status(401).json({ 
      error: "Unauthorized",
      message: "Invalid token format",
      authentication: OAUTH_ENABLED ? {
        type: "oauth2.1",
        authorization_endpoint: `${baseUrl}/oauth/authorize`,
        token_endpoint: `${baseUrl}/oauth/token`,
        registration_endpoint: `${baseUrl}/oauth/register`,
        grant_type: "authorization_code",
        pkce_required: true
      } : undefined
    });
  }

  // Check OAuth 2.1 token
  if (OAUTH_ENABLED) {
    const tokenData = issuedTokens.get(token);
    
    if (!tokenData) {
      console.log(`❌ Unauthorized access attempt from ${req.ip} - Invalid or expired OAuth token`);
      
      // Add WWW-Authenticate header
      const protocol = req.get('x-forwarded-proto') || req.protocol;
      const baseUrl = `${protocol}://${req.get('host')}`;
      res.setHeader('WWW-Authenticate', `Bearer realm="${baseUrl}", error="invalid_token", error_description="Invalid or expired token"`);
      
      return res.status(401).json({ 
        error: "Unauthorized",
        message: "Invalid or expired access token",
        authentication: {
          type: "oauth2.1",
          authorization_endpoint: `${baseUrl}/oauth/authorize`,
          token_endpoint: `${baseUrl}/oauth/token`,
          registration_endpoint: `${baseUrl}/oauth/register`,
          grant_type: "authorization_code",
          pkce_required: true
        }
      });
    }

    // Check if token is expired
    if (Date.now() > tokenData.expiresAt) {
      issuedTokens.delete(token);
      console.log(`❌ Unauthorized access attempt from ${req.ip} - Expired OAuth token`);
      
      // Add WWW-Authenticate header
      const protocol = req.get('x-forwarded-proto') || req.protocol;
      const baseUrl = `${protocol}://${req.get('host')}`;
      res.setHeader('WWW-Authenticate', `Bearer realm="${baseUrl}", error="invalid_token", error_description="Token expired"`);
      
      return res.status(401).json({ 
        error: "Unauthorized",
        message: "Access token has expired",
        authentication: {
          type: "oauth2.1",
          authorization_endpoint: `${baseUrl}/oauth/authorize`,
          token_endpoint: `${baseUrl}/oauth/token`,
          registration_endpoint: `${baseUrl}/oauth/register`,
          grant_type: "authorization_code",
          pkce_required: true
        }
      });
    }

    console.log(`✅ Authenticated OAuth request from ${req.ip} (client: ${tokenData.clientId})`);
    return next();
  }

  // Fallback to legacy Bearer token
  if (AUTH_TOKEN && token !== AUTH_TOKEN) {
    console.log(`❌ Unauthorized access attempt from ${req.ip} - Invalid token`);
    return res.status(401).json({ 
      error: "Unauthorized",
      message: "Invalid authentication token"
    });
  }

  console.log(`✅ Authenticated request from ${req.ip}`);
  next();
}

// ============================================================================
// PROTECTED ENDPOINTS (Authentication Required)
// ============================================================================

// Apply authentication to protected routes
app.use(requireAuth);

// SSE endpoint for MCP - handle both GET (SSE connection) and POST (messages)
app.get("/sse", async (req: Request, res: Response) => {
  const sessionId = req.query.sessionId as string || `session-${Date.now()}`;
  console.log(`New SSE connection established from: ${req.ip} (session: ${sessionId})`);

  try {
    // Create a new server instance for this connection
    const mcpServer = createMcpServer();
    
    // Let SSEServerTransport handle the headers and response
    const transport = new SSEServerTransport("/message", res);
    
    // Store both transport and server for this session
    activeSessions.set(sessionId, { transport, server: mcpServer });
    
    await mcpServer.connect(transport);
    console.log(`MCP server connected to SSE transport (session: ${sessionId})`);

    // Handle client disconnect
    req.on("close", () => {
      console.log(`SSE connection closed (session: ${sessionId})`);
      activeSessions.delete(sessionId);
      mcpServer.close().catch(console.error);
    });
  } catch (error) {
    console.error("Error establishing SSE connection:", error);
    if (!res.headersSent) {
      res.status(500).end();
    }
  }
});

// Message endpoint for MCP client messages
const messageHandler = async (req: Request, res: Response) => {
  const sessionIdFromQuery = req.query.sessionId as string;
  console.log(`Received message (sessionId: ${sessionIdFromQuery || 'none'}):`, req.body);
  
  // Get the most recent session (for single-connection scenario)
  const sessions = Array.from(activeSessions.entries());
  
  if (sessions.length === 0) {
    console.error("No active sessions");
    return res.status(404).json({ 
      jsonrpc: "2.0",
      error: { code: -32000, message: "No active session" },
      id: req.body.id 
    });
  }
  
  // Try to find session by ID from query param, otherwise use most recent
  let transport;
  let sessionId;
  
  if (sessionIdFromQuery) {
    const session = activeSessions.get(sessionIdFromQuery);
    if (session) {
      transport = session.transport;
      sessionId = sessionIdFromQuery;
      console.log(`✓ Matched session by ID: ${sessionId}`);
    }
  }
  
  // Fallback to most recent session
  if (!transport) {
    [sessionId, { transport }] = sessions[sessions.length - 1];
    console.log(`Using most recent session: ${sessionId}`);
  }
  
  try {
    // Let the transport handle the message
    // The SSEServerTransport should process this and send response via SSE
    await transport.handleMessage(req.body);
    
    // Acknowledge receipt (transport will send actual response via SSE)
    res.status(202).end();
  } catch (error) {
    console.error("Error handling message:", error);
    if (!res.headersSent) {
      res.status(500).json({ 
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal error" },
        id: req.body.id 
      });
    }
  }
};

app.post("/message", messageHandler);
// Also handle POST to /sse (ChatGPT may POST here)
app.post("/sse", messageHandler);

// Start server
app.listen(PORT, () => {
  console.log(`Plaid MCP SSE Server running on http://localhost:${PORT}`);
  console.log(`SSE endpoint: http://localhost:${PORT}/sse`);
  console.log(`Tokens will be stored in: ${TOKENS_FILE}`);
  console.log(`Environment: ${ENV}`);
  console.log("\nThis server can be used as a remote MCP server for ChatGPT.");
});

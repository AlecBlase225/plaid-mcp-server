import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
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
    optional_products: [Products.Investments],
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

// Initialize MCP Server
const server = new McpServer(
  {
    name: "plaid-mcp-server",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Register tools
server.registerTool(
  "create_link_token",
  {
    description:
      "Create a Plaid Link token for account linking. This token is used to initialize the Plaid Link UI for connecting a bank account.",
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
      // Capture full Plaid API error details
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
    description:
      "Exchange a public token from Plaid Link for an access token and store it securely.",
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
    description: "Get all accounts for a specific Plaid item.",
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
    description: "Get current balances for all accounts of a specific Plaid item.",
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
    description:
      "Get transactions for a specific Plaid item within a date range.",
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
    description:
      "List all stored Plaid items (connected bank accounts) with their details.",
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
    description:
      "Refresh the list of available statements for a Plaid item. Call this before listing statements to ensure you have the latest data.",
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
    description:
      "List all available bank statements for a Plaid item. Returns statement metadata including statement IDs, dates, and accounts.",
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
    description:
      "Download a specific bank statement as a PDF. Returns the statement as base64-encoded data.",
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
    description:
      "Get recurring transaction streams for a Plaid item. Returns both inflow and outflow recurring streams that Plaid has automatically identified, including subscription payments, bills, and regular income.",
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
    description:
      "Enrich transaction data with merchant information, categories, logos, and other metadata. This endpoint does not require a linked bank account and can enrich any transaction data. Returns enriched transaction details including merchant name, logo, website, category, location, and more.",
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
    description:
      "Get investment holdings for a Plaid item. Returns detailed information about securities held in investment accounts, including quantity, current price, cost basis, and account details. Useful for tracking investment portfolios, calculating asset allocation, and monitoring investment performance.",
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

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Plaid MCP Server running on stdio");
}

main().catch(console.error);
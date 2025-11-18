import * as dotenv from "dotenv";
import express from "express";

// Load environment variables from .env.local
dotenv.config({ path: ".env.local" });
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
const PORT = process.env.PORT || 3000;

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

// Plaid API functions
async function createLinkToken(): Promise<string> {
  const response = await plaidClient.linkTokenCreate({
    user: { client_user_id: `user-${Date.now()}` },
    client_name: "Claude Plaid Integration",
    language: "en",
    products: [Products.Auth, Products.Statements, Products.Transactions, Products.Investments],
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
  limit?: number
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

// Initialize Express app
const app = express();

// Middleware
app.use(express.json());
app.use(express.static(".")); // Serve static files from current directory

// API Routes
app.post("/api/create_link_token", async (req, res) => {
  try {
    const linkToken = await createLinkToken();
    res.json({
      success: true,
      link_token: linkToken,
      message: "Use this link token to complete account linking in Plaid Link UI",
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    res.status(500).json({ success: false, error: errorMsg });
  }
});

app.post("/api/exchange_public_token", async (req, res) => {
  try {
    const { public_token, institution_name } = req.body;

    if (!public_token || !institution_name) {
      return res.status(400).json({
        success: false,
        error: "public_token and institution_name are required",
      });
    }

    const result = await exchangePublicToken(public_token, institution_name);
    res.json({
      success: true,
      item_id: result.itemId,
      message: `Successfully linked account. Item ID: ${result.itemId}`,
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    res.status(500).json({ success: false, error: errorMsg });
  }
});

app.get("/api/accounts/:itemId", async (req, res) => {
  try {
    const accounts = await getAccounts(req.params.itemId);
    res.json({ success: true, accounts });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    res.status(500).json({ success: false, error: errorMsg });
  }
});

app.get("/api/balances/:itemId", async (req, res) => {
  try {
    const balances = await getBalances(req.params.itemId);
    res.json({ success: true, ...balances });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    res.status(500).json({ success: false, error: errorMsg });
  }
});

app.get("/api/transactions/:itemId", async (req, res) => {
  try {
    const { start_date, end_date, limit } = req.query;

    if (!start_date || !end_date) {
      return res.status(400).json({
        success: false,
        error: "start_date and end_date query parameters are required",
      });
    }

    const transactions = await getTransactions(
      req.params.itemId,
      start_date as string,
      end_date as string,
      limit ? parseInt(limit as string) : undefined
    );
    res.json({ success: true, ...transactions });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    res.status(500).json({ success: false, error: errorMsg });
  }
});

app.get("/api/recurring_transactions/:itemId", async (req, res) => {
  try {
    const { account_ids } = req.query;
    
    const accountIdsArray = account_ids 
      ? (typeof account_ids === 'string' ? account_ids.split(',') : account_ids as string[])
      : undefined;

    const result = await getRecurringTransactions(
      req.params.itemId,
      accountIdsArray
    );
    res.json({ success: true, ...result });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    res.status(500).json({ success: false, error: errorMsg });
  }
});

app.post("/api/enrich_transactions", async (req, res) => {
  try {
    const { transactions } = req.body;

    if (!transactions || !Array.isArray(transactions)) {
      return res.status(400).json({
        success: false,
        error: "transactions array is required in request body",
      });
    }

    const result = await enrichTransactions(transactions);
    res.json({ success: true, ...result });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    res.status(500).json({ success: false, error: errorMsg });
  }
});

app.get("/api/investment_holdings/:itemId", async (req, res) => {
  try {
    const { account_ids } = req.query;
    
    const accountIdsArray = account_ids 
      ? (typeof account_ids === 'string' ? account_ids.split(',') : account_ids as string[])
      : undefined;

    const result = await getInvestmentHoldings(
      req.params.itemId,
      accountIdsArray
    );
    res.json({ success: true, ...result });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    res.status(500).json({ success: false, error: errorMsg });
  }
});

app.get("/api/items", async (req, res) => {
  try {
    res.json({ success: true, items: listItems() });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    res.status(500).json({ success: false, error: errorMsg });
  }
});

// Statements endpoints
app.post("/api/statements/refresh/:itemId", async (req, res) => {
  try {
    const { start_date, end_date } = req.body;

    if (!start_date || !end_date) {
      return res.status(400).json({
        success: false,
        error: "start_date and end_date are required in request body",
      });
    }

    const result = await refreshStatements(
      req.params.itemId,
      start_date,
      end_date
    );
    res.json({ success: true, ...result });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    res.status(500).json({ success: false, error: errorMsg });
  }
});

app.get("/api/statements/:itemId", async (req, res) => {
  try {
    const result = await listStatements(req.params.itemId);
    res.json({ success: true, ...result });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    res.status(500).json({ success: false, error: errorMsg });
  }
});

app.get("/api/statements/:itemId/download/:statementId", async (req, res) => {
  try {
    const result = await downloadStatement(
      req.params.itemId,
      req.params.statementId
    );
    res.json({ success: true, ...result });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    res.status(500).json({ success: false, error: errorMsg });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Plaid HTTP Server running on http://localhost:${PORT}`);
  console.log(`Open http://localhost:${PORT}/index.html in your browser`);
  console.log(`Tokens will be stored in: ${TOKENS_FILE}`);
});


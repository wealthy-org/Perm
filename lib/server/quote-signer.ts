import {
  getAddress,
  isAddress,
  recoverTypedDataAddress,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

export const PERM_QUOTE_TYPES = {
  PermQuote: [
    { name: "account", type: "address" },
    { name: "tokenIn", type: "address" },
    { name: "tokenOut", type: "address" },
    { name: "amountIn", type: "uint256" },
    { name: "minAmountOut", type: "uint256" },
    { name: "gasEstimate", type: "uint256" },
    { name: "recipient", type: "address" },
    { name: "deadline", type: "uint256" },
    { name: "quotedAt", type: "uint64" },
    { name: "policyVersion", type: "uint32" },
    { name: "chainId", type: "uint256" },
    { name: "referrer", type: "address" },
    { name: "routeHash", type: "bytes32" },
  ],
} as const;

export type PermQuoteMessage = {
  account: Address;
  tokenIn: Address;
  tokenOut: Address;
  amountIn: bigint;
  minAmountOut: bigint;
  gasEstimate: bigint;
  recipient: Address;
  deadline: bigint;
  quotedAt: bigint;
  policyVersion: number;
  chainId: bigint;
  referrer: Address;
  routeHash: Hex;
};

type QuoteDomain = {
  name: "Perm";
  version: "2";
  chainId: number;
  verifyingContract: Address;
};

export type QuoteSignerConfiguration = {
  mode: "local" | "remote" | "unconfigured";
  address: Address | null;
  configured: boolean;
  custodyReady: boolean;
  reason?: string;
};

const MAX_REMOTE_SIGNER_RESPONSE_BYTES = 16_384;

async function boundedResponseText(response: Response, maximumBytes: number) {
  const declared = response.headers.get("content-length");
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > maximumBytes)) {
    throw new Error("Remote quote signer response is too large");
  }
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maximumBytes) {
      await reader.cancel();
      throw new Error("Remote quote signer response is too large");
    }
    chunks.push(value);
  }
  const combined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(combined);
}

function remoteUrl() {
  const raw = process.env.PERM_QUOTE_SIGNER_URL;
  if (!raw) return undefined;
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error("PERM_QUOTE_SIGNER_URL is invalid"); }
  if (url.protocol !== "https:" || url.username || url.password) throw new Error("PERM_QUOTE_SIGNER_URL must be a credential-free HTTPS URL");
  if (url.hostname === "localhost" || url.hostname.endsWith(".local")) throw new Error("PERM_QUOTE_SIGNER_URL may not target a local host");
  return url;
}

export function quoteSignerConfiguration(): QuoteSignerConfiguration {
  const mode = process.env.PERM_QUOTE_SIGNER_MODE;
  if (mode === "remote") {
    const address = process.env.QUOTE_SIGNER_ADDRESS;
    if (!address || !isAddress(address)) return { mode, address: null, configured: false, custodyReady: false, reason: "QUOTE_SIGNER_ADDRESS is invalid" };
    try {
      remoteUrl();
    } catch (cause) {
      return { mode, address: getAddress(address), configured: false, custodyReady: false, reason: cause instanceof Error ? cause.message : "Remote signer URL is invalid" };
    }
    if (!process.env.PERM_QUOTE_SIGNER_URL || (process.env.PERM_QUOTE_SIGNER_TOKEN || "").length < 16) {
      return { mode, address: getAddress(address), configured: false, custodyReady: false, reason: "Remote signer URL/token is missing" };
    }
    if (process.env.PERM_QUOTE_SIGNER_PRIVATE_KEY) {
      return { mode, address: getAddress(address), configured: false, custodyReady: false, reason: "Remote mode must not expose a local private key" };
    }
    return { mode, address: getAddress(address), configured: true, custodyReady: true };
  }
  if (mode && mode !== "local") return { mode: "unconfigured", address: null, configured: false, custodyReady: false, reason: "PERM_QUOTE_SIGNER_MODE must be local or remote" };
  const key = process.env.PERM_QUOTE_SIGNER_PRIVATE_KEY;
  if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key)) {
    return { mode: "unconfigured", address: null, configured: false, custodyReady: false, reason: "Local quote signer key is missing" };
  }
  return { mode: "local", address: privateKeyToAccount(key as Hex).address, configured: true, custodyReady: false };
}

export function quoteSignerExecutionReady(
  configuration: QuoteSignerConfiguration = quoteSignerConfiguration(),
  environment = process.env.NODE_ENV,
) {
  return configuration.configured && (configuration.custodyReady || environment !== "production");
}

export async function signPermQuote(domain: QuoteDomain, message: PermQuoteMessage): Promise<{ address: Address; signature: Hex }> {
  const configuration = quoteSignerConfiguration();
  if (!configuration.configured || !configuration.address) throw new Error(configuration.reason || "Quote signer is not configured");
  if (configuration.mode === "local") {
    if (process.env.NODE_ENV === "production") throw new Error("Production quote signing requires authenticated remote custody");
    const account = privateKeyToAccount(process.env.PERM_QUOTE_SIGNER_PRIVATE_KEY as Hex);
    const signature = await account.signTypedData({ domain, types: PERM_QUOTE_TYPES, primaryType: "PermQuote", message });
    return { address: account.address, signature };
  }

  const url = remoteUrl();
  if (!url) throw new Error("Remote quote signer URL is missing");
  const response = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.PERM_QUOTE_SIGNER_TOKEN}`,
      "content-type": "application/json",
      accept: "application/json",
      "user-agent": "PermQuoteService/2.0",
    },
    body: JSON.stringify({
      schemaVersion: 1,
      purpose: "perm-eip712-quote",
      domain,
      types: PERM_QUOTE_TYPES,
      primaryType: "PermQuote",
      message: Object.fromEntries(Object.entries(message).map(([key, value]) => [key, typeof value === "bigint" ? value.toString() : value])),
    }),
    redirect: "error",
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Remote quote signer returned HTTP ${response.status}`);
  const text = await boundedResponseText(response, MAX_REMOTE_SIGNER_RESPONSE_BYTES);
  if (!/^application\/json(?:;|$)/i.test(response.headers.get("content-type") || "")) {
    throw new Error("Remote quote signer returned an invalid content type");
  }
  let payload: unknown;
  try { payload = JSON.parse(text); } catch { throw new Error("Remote quote signer returned invalid JSON"); }
  const result = payload as { address?: string; signature?: string };
  if (!result.address || !isAddress(result.address) || getAddress(result.address) !== configuration.address
    || !/^0x[0-9a-fA-F]{130}$/.test(result.signature || "")) {
    throw new Error("Remote quote signer returned an invalid identity or signature");
  }
  const signature = result.signature as Hex;
  const recovered = await recoverTypedDataAddress({ domain, types: PERM_QUOTE_TYPES, primaryType: "PermQuote", message, signature });
  if (getAddress(recovered) !== configuration.address) throw new Error("Remote quote signer signature does not match the authorized address");
  return { address: configuration.address, signature };
}

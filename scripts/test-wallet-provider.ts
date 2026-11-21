import assert from "node:assert/strict";
import {
  parseEip155ChainId,
  WALLETCONNECT_EIP155_METHODS,
  WALLETCONNECT_REQUIRED_METHODS,
  walletConnectSessionHasRequiredMethods,
} from "../lib/web3/eip1193";

assert.equal(parseEip155ChainId("0xb626"), 46_630, "EIP-1193 hexadecimal chain IDs must parse as hexadecimal");
assert.equal(parseEip155ChainId("46630"), 46_630, "WalletConnect decimal chain references must parse as decimal");
assert.equal(parseEip155ChainId("eip155:46630"), 46_630, "CAIP-2 chain IDs must parse their decimal reference");
assert.equal(parseEip155ChainId(46_630), 46_630, "numeric chain IDs must be accepted");
assert.equal(parseEip155ChainId(46_630n), 46_630, "bigint chain IDs must be accepted");

for (const invalid of [undefined, null, "", "0x", "46630x", "eip155:", "eip155:0xb626:extra", 0, -1, Number.NaN, Number.MAX_SAFE_INTEGER + 1]) {
  assert.equal(parseEip155ChainId(invalid), undefined, `invalid chain ID must fail closed: ${String(invalid)}`);
}

for (const required of WALLETCONNECT_REQUIRED_METHODS) {
  assert.ok(WALLETCONNECT_EIP155_METHODS.includes(required), `${required} must be included in the WalletConnect proposal`);
}
const approvedNamespace = {
  eip155: {
    methods: [...WALLETCONNECT_EIP155_METHODS],
    accounts: ["eip155:46630:0x0000000000000000000000000000000000000001"],
  },
};
assert.equal(walletConnectSessionHasRequiredMethods(approvedNamespace), true, "a complete EIP-155 session must be accepted");
assert.equal(walletConnectSessionHasRequiredMethods({
  "eip155:46630": { methods: [...WALLETCONNECT_REQUIRED_METHODS] },
}), true, "chain-scoped EIP-155 namespaces must be accepted");
assert.equal(walletConnectSessionHasRequiredMethods({
  eip155: { methods: WALLETCONNECT_EIP155_METHODS.filter((method) => method !== "eth_sendTransaction") },
}), false, "sessions without transaction submission must fail closed");
assert.equal(walletConnectSessionHasRequiredMethods(undefined), false, "missing session namespaces must fail closed");

console.log("Wallet provider chain-ID and session-capability tests passed");

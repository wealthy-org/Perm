import assert from "node:assert/strict";
import { parseEip155ChainId } from "../lib/web3/eip1193";

assert.equal(parseEip155ChainId("0xb626"), 46_630, "EIP-1193 hexadecimal chain IDs must parse as hexadecimal");
assert.equal(parseEip155ChainId("46630"), 46_630, "WalletConnect decimal chain references must parse as decimal");
assert.equal(parseEip155ChainId("eip155:46630"), 46_630, "CAIP-2 chain IDs must parse their decimal reference");
assert.equal(parseEip155ChainId(46_630), 46_630, "numeric chain IDs must be accepted");
assert.equal(parseEip155ChainId(46_630n), 46_630, "bigint chain IDs must be accepted");

for (const invalid of [undefined, null, "", "0x", "46630x", "eip155:", "eip155:0xb626:extra", 0, -1, Number.NaN, Number.MAX_SAFE_INTEGER + 1]) {
  assert.equal(parseEip155ChainId(invalid), undefined, `invalid chain ID must fail closed: ${String(invalid)}`);
}

console.log("Wallet provider chain-ID normalization tests passed");

import assert from "node:assert/strict";
import { discoverTwoStepRoutes, mapLimited, topByOutput } from "../lib/server/route-planner";

type Token = { address: string; symbol: string };
type Step = { amountOut: string; path: string };

async function main() {
  const tokens: Token[] = [
    { address: "0x01", symbol: "A" },
    { address: "0x02", symbol: "B" },
    { address: "0x03", symbol: "ETH" },
    { address: "0x04", symbol: "C" },
    { address: "0x05", symbol: "D" },
    { address: "0x04", symbol: "C-duplicate" },
  ];
  const graph = new Map<string, Step[]>([
    ["A>ETH", [{ amountOut: "80", path: "A>ETH" }]],
    ["ETH>B", [{ amountOut: "70", path: "ETH>B" }]],
    ["A>C", [{ amountOut: "100", path: "A>C-low" }, { amountOut: "120", path: "A>C-high" }, { amountOut: "110", path: "A>C-mid" }]],
    ["C>B", [{ amountOut: "150", path: "C>B-high" }, { amountOut: "140", path: "C>B-mid" }, { amountOut: "130", path: "C>B-low" }, { amountOut: "1", path: "C>B-discarded" }]],
  ]);
  const calls: string[] = [];
  const routes = await discoverTwoStepRoutes<Token, Step, string>({
    tokens,
    input: tokens[0],
    output: tokens[1],
    amountIn: 100n,
    edges: async (input, output) => {
      const key = `${input.symbol.split("-")[0]}>${output.symbol.split("-")[0]}`;
      calls.push(key);
      return graph.get(key) || [];
    },
    buildCandidate: async ([first, second]) => `${first.path}|${second.path}`,
    maxFirstLegs: 2,
    maxSecondLegs: 3,
    concurrency: 2,
  });
  assert.deepEqual(routes, [
    "A>ETH|ETH>B",
    "A>C-high|C>B-high", "A>C-high|C>B-mid", "A>C-high|C>B-low",
    "A>C-mid|C>B-high", "A>C-mid|C>B-mid", "A>C-mid|C>B-low",
  ]);
  assert.equal(calls.filter((value) => value === "A>C").length, 1, "duplicate intermediary addresses must be deduplicated");
  assert.deepEqual(topByOutput([{ amountOut: "9" }, { amountOut: "11" }], 1), [{ amountOut: "11" }]);
  await assert.rejects(() => mapLimited([1], 0, async (value) => value), /between 1 and 32/);
  console.log("Route planner: all supported intermediaries, output ranking, deduplication, and search bounds passed");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });

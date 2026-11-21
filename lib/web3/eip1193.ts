export function parseEip155ChainId(value: unknown): number | undefined {
  let reference: string;
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value > 0 ? value : undefined;
  }
  if (typeof value === "bigint") {
    return value > 0n && value <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(value) : undefined;
  }
  if (typeof value !== "string") return undefined;

  reference = value.trim();
  if (reference.toLowerCase().startsWith("eip155:")) reference = reference.slice("eip155:".length);

  let parsed: number;
  if (/^0x[0-9a-f]+$/i.test(reference)) parsed = Number.parseInt(reference.slice(2), 16);
  else if (/^[0-9]+$/.test(reference)) parsed = Number(reference);
  else return undefined;

  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

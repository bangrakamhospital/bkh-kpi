import "server-only";

/**
 * Exact fixed-point arithmetic for stock math with BigInt "units":
 * quantities have 3 decimals (QTY_SCALE), values / unit costs 4 decimals
 * (VALUE_SCALE). Values read from PostgreSQL as text (numeric::text) and
 * written back as decimal strings, so no float rounding ever reaches
 * the ledger.
 */

export const QTY_SCALE = 3;
export const VALUE_SCALE = 4;

const TEN = BigInt(10);
const pow = (n: number) => TEN ** BigInt(n);

/** "123.45" -> 123450n at scale 3 (extra digits are an error). */
export function toUnits(dec: string | number, scale: number): bigint {
  const s = typeof dec === "number" ? dec.toFixed(scale) : dec.trim();
  const m = /^(-)?(\d+)(?:\.(\d+))?$/.exec(s);
  if (!m) throw new Error("invalid decimal");
  const frac = (m[3] ?? "").replace(/0+$/, "");
  if (frac.length > scale) throw new Error("too many decimals");
  const u = BigInt(m[2]) * pow(scale) + BigInt((frac + "0".repeat(scale)).slice(0, scale) || "0");
  return m[1] ? -u : u;
}

export function fromUnits(u: bigint, scale: number): string {
  const neg = u < BigInt(0);
  const abs = neg ? -u : u;
  const p = pow(scale);
  const int = abs / p;
  const frac = (abs % p).toString().padStart(scale, "0");
  return `${neg ? "-" : ""}${int}${scale > 0 ? `.${frac}` : ""}`;
}

/** round(a / b) half up, a >= 0, b > 0. */
export function roundDiv(a: bigint, b: bigint): bigint {
  return (a * BigInt(2) + b) / (b * BigInt(2));
}

/** value (scale 4) of qty (scale 3) at unitCost (scale 4). */
export function lineValue(qtyU: bigint, unitCostU: bigint): bigint {
  return roundDiv(qtyU * unitCostU, pow(QTY_SCALE));
}

/** unit cost (scale 4) = value (scale 4) / qty (scale 3). */
export function unitCostOf(valueU: bigint, qtyU: bigint): bigint {
  return qtyU === BigInt(0) ? BigInt(0) : roundDiv(valueU * pow(QTY_SCALE), qtyU);
}

/** Value (scale 4) rounded to 2 decimals, as a decimal string (document amounts). */
export function money2(valueU: bigint): string {
  return fromUnits(roundDiv(valueU, BigInt(100)), 2);
}

export const ZERO = BigInt(0);

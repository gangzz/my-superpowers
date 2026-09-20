import { createHash } from "node:crypto";

function normalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => entry === undefined ? null : normalize(entry));
  }
  if (typeof value !== "object" || value === null) return value;

  const record = value as Record<string, unknown>;
  const normalized: Record<string, unknown> = {};
  for (const key of Object.keys(record).sort()) {
    if (record[key] !== undefined) normalized[key] = normalize(record[key]);
  }
  return normalized;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(normalize(value));
}

export function jsonDigest(value: unknown): string {
  return `sha256:${createHash("sha256").update(canonicalJson(value)).digest("hex")}`;
}

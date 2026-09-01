export type Gs1ProductAttributes = {
  batchLot?: string | null;
  serialNumber?: string | null;
  expiryDate?: string | null; // YYYY-MM-DD
};

function digitsOnly(value: string) {
  return value.replace(/\D/g, "");
}

export function validateGtin(value: string): { valid: boolean; normalized14?: string; original?: string; error?: string } {
  const raw = digitsOnly(String(value || "").trim());
  if (![8, 12, 13, 14].includes(raw.length)) {
    return { valid: false, error: "GTIN must contain 8, 12, 13, or 14 digits." };
  }

  const body = raw.slice(0, -1);
  const checkDigit = Number(raw.at(-1));
  let sum = 0;

  for (let i = body.length - 1, position = 1; i >= 0; i--, position++) {
    const digit = Number(body[i]);
    sum += digit * (position % 2 === 1 ? 3 : 1);
  }

  const expected = (10 - (sum % 10)) % 10;
  if (expected !== checkDigit) {
    return { valid: false, error: `Invalid GTIN check digit. Expected ${expected}.` };
  }

  return {
    valid: true,
    original: raw,
    normalized14: raw.padStart(14, "0"),
  };
}

export function normalizeGs1Qualifier(value: string | null | undefined, maxLength = 20) {
  if (!value) return "";
  return value.trim().slice(0, maxLength);
}

export function toGs1ExpiryDate(value: string | null | undefined) {
  if (!value) return "";
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return "";
  const [, year, month, day] = match;
  return `${year.slice(-2)}${month}${day}`;
}

export function buildGs1DigitalLinkPath(
  normalizedGtin14: string,
  attrs: Gs1ProductAttributes = {}
) {
  const gtin = validateGtin(normalizedGtin14);
  if (!gtin.valid || !gtin.normalized14) {
    throw new Error(gtin.error || "Invalid GTIN.");
  }

  let path = `/01/${gtin.normalized14}`;
  const batchLot = normalizeGs1Qualifier(attrs.batchLot);
  const serialNumber = normalizeGs1Qualifier(attrs.serialNumber);

  if (batchLot) path += `/10/${encodeURIComponent(batchLot)}`;
  if (serialNumber) path += `/21/${encodeURIComponent(serialNumber)}`;

  const expiry = toGs1ExpiryDate(attrs.expiryDate);
  if (expiry) path += `?17=${expiry}`;

  return path;
}

export function buildGs1DigitalLinkUrl(
  origin: string,
  normalizedGtin14: string,
  attrs: Gs1ProductAttributes = {}
) {
  return `${origin.replace(/\/$/, "")}${buildGs1DigitalLinkPath(normalizedGtin14, attrs)}`;
}

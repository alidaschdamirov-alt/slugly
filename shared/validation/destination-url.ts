import { z } from "zod";

export const DESTINATION_URL_ERROR =
  "Enter a valid URL, for example https://example.com/page";

export const EMPTY_DESTINATION_URL_ERROR = "Enter a destination URL.";

const HOSTNAME_RE =
  /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9][a-z0-9-]{1,62}$/i;

const IPV4_RE = /^\d{1,3}(\.\d{1,3}){3}$/;

function hasScheme(value: string) {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(value);
}

function looksLikeHostname(value: string) {
  const firstSegment = value.split(/[/?#]/, 1)[0] || "";
  if (!firstSegment.includes(".")) return false;
  return firstSegment.length <= 253;
}

function isBlockedPublicHostname(hostname: string) {
  const host = hostname.toLowerCase();
  return (
    host === "localhost" ||
    IPV4_RE.test(host) ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  );
}

/**
 * Normalizes user input into an absolute public http(s) URL.
 * Returns null when the input cannot be a valid public destination URL.
 */
export function normalizeDestinationUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed) && !/^https?:\/\//i.test(trimmed)) {
    return null;
  }

  if (!hasScheme(trimmed) && !looksLikeHostname(trimmed)) {
    return null;
  }

  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  let url: URL;
  try {
    url = new URL(withProtocol);
  } catch {
    return null;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") return null;

  const host = url.hostname;
  if (!HOSTNAME_RE.test(host)) return null;
  if (isBlockedPublicHostname(host)) return null;

  return url.toString();
}

export const destinationUrlSchema = z
  .string()
  .trim()
  .min(1, EMPTY_DESTINATION_URL_ERROR)
  .transform((value, ctx) => {
    const normalized = normalizeDestinationUrl(value);
    if (!normalized) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: DESTINATION_URL_ERROR,
      });
      return z.NEVER;
    }
    return normalized;
  });

export function getDestinationUrlError(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) return EMPTY_DESTINATION_URL_ERROR;
  return normalizeDestinationUrl(raw) ? null : DESTINATION_URL_ERROR;
}

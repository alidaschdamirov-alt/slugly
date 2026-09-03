export type AnonymousShortenAction =
  | { kind: "await-captcha"; pendingUrl: string }
  | { kind: "submit"; payload: { url: string; captchaToken?: string } };

export function planAnonymousShorten(
  url: string,
  turnstileRequired: boolean,
  captchaToken: string | null,
): AnonymousShortenAction {
  if (turnstileRequired && !captchaToken) {
    return { kind: "await-captcha", pendingUrl: url };
  }
  return {
    kind: "submit",
    payload: { url, captchaToken: captchaToken || undefined },
  };
}

export function resumeAnonymousShorten(pendingUrl: string | null, captchaToken: string) {
  if (!pendingUrl) return null;
  return { url: pendingUrl, captchaToken };
}

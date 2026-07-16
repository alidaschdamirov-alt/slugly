import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { useState, useEffect, useRef, useCallback } from "react";
import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { trackEvent } from "@/lib/analytics";

const TILES = [
  { ch: "Instagram", c: "#E1306C", slug: "summer-sale", n: 2481, sp: "0,22 12,18 24,24 36,12 48,16 60,8 72,14 88,4", live: true },
  { ch: "Email", c: "#FF5A3C", slug: "bf-teaser", n: 5932, sp: "0,26 14,20 28,22 42,14 56,18 70,10 88,6" },
  { ch: "YouTube", c: "#FF0033", slug: "launch-film", n: 1204, sp: "0,14 12,18 24,10 36,16 48,9 60,13 72,7 88,11" },
  { ch: "LinkedIn", c: "#0A66C2", slug: "webinar-reg", n: 1640, sp: "0,24 16,22 30,18 44,20 58,12 72,15 88,8" },
  { ch: "X", c: "#15151A", slug: "promo-thread", n: 873, sp: "0,20 14,16 28,18 42,10 56,14 70,9 88,5" },
  { ch: "Telegram", c: "#229ED9", slug: "early-access", n: 612, sp: "0,12 16,15 30,11 44,14 58,10 72,13 88,9" },
];

export default function Home() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [url, setUrl] = useState("");
  const [error, setError] = useState(false);
  const [shortCode, setShortCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isShortening, setIsShortening] = useState(false);
  const liveCounterRef = useRef<HTMLSpanElement>(null);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const turnstileRef = useRef<TurnstileInstance | null>(null);
  const turnstileSiteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY || "";

  const shortenMutation = trpc.link.shortenAnonymous.useMutation({
    onSuccess: (data) => {
      setShortCode(data.shortCode);
      setIsShortening(false);
      trackEvent("anonymous_shorten", { shortCode: data.shortCode });
    },
    onError: (err) => {
      toast.error(err.message);
      setIsShortening(false);
      // Reset captcha on error
      turnstileRef.current?.reset();
      setCaptchaToken(null);
    },
  });

  // Live counter animation for the demo tile
  useEffect(() => {
    const el = liveCounterRef.current;
    if (!el) return;
    let val = 2481;
    const interval = setInterval(() => {
      val += Math.floor(Math.random() * 4) + 1;
      el.textContent = val.toLocaleString();
    }, 2200);
    return () => clearInterval(interval);
  }, []);

  const handleShorten = () => {
    let v = url.trim();
    if (!v) { setError(true); return; }
    if (!/^https?:\/\//i.test(v)) v = "https://" + v;
    try { new URL(v); } catch { setError(true); return; }
    setError(false);
    setShortCode(null);
    setIsShortening(true);
    if (turnstileSiteKey && !captchaToken) {
      toast.error("Please complete the CAPTCHA verification.");
      setIsShortening(false);
      return;
    }
    shortenMutation.mutate({ url: v, captchaToken: captchaToken || undefined });
  };

  const handleCopy = async () => {
    if (!shortCode) return;
    const text = `${window.location.origin}/r/${shortCode}`;
    try { await navigator.clipboard.writeText(text); } catch {}
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };

  return (
    <div className="min-h-screen" style={{
      background: "radial-gradient(900px 500px at 78% -8%, rgba(90,63,240,.10), transparent 60%), radial-gradient(700px 460px at 8% 8%, rgba(255,90,60,.07), transparent 55%), #F4F4FB",
    }}>
      {/* Nav */}
      <nav className="sticky top-0 z-20 backdrop-blur-[10px] border-b" style={{ background: "rgba(244,244,251,.72)", borderColor: "#E8E8F1" }}>
        <div className="max-w-[1120px] mx-auto px-4 sm:px-6 flex items-center justify-between h-[60px] sm:h-[68px]">
          <a href="/" className="flex items-center gap-[11px] font-[800] text-[22px] tracking-[-0.5px]" style={{ fontFamily: "'Bricolage Grotesque'" }}>
            <img src="/assets/slugly-logo.svg" alt="Slugly" className="w-[34px] h-[34px]" />
            Slugly
          </a>
          <div className="flex items-center gap-[22px]">
            {user ? (
              <button onClick={() => setLocation("/dashboard")} className="font-semibold text-[#6F6F8C] hover:text-[#14152B] transition-colors">Dashboard</button>
            ) : (
              <a href={getLoginUrl()} className="font-semibold text-[#6F6F8C] hover:text-[#14152B] transition-colors hidden sm:inline">Sign in</a>
            )}
            <button
              onClick={() => user ? setLocation("/dashboard") : (window.location.href = getLoginUrl())}
              className="inline-flex items-center gap-2 font-bold rounded-[11px] px-[14px] sm:px-[18px] py-[9px] sm:py-[11px] text-[13px] sm:text-[15px] text-white border-0 cursor-pointer"
              style={{ background: "#5A3FF0", boxShadow: "0 8px 20px -8px rgba(90,63,240,.6)" }}
            >
              <span className="hidden sm:inline">Get started free</span>
              <span className="sm:hidden">Start free</span>
            </button>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <header className="text-center pt-[40px] sm:pt-[70px] pb-[30px] max-w-[1120px] mx-auto px-4 sm:px-6">
        <span className="inline-flex items-center gap-[7px] font-semibold text-[13.5px] px-[13px] py-[6px] rounded-full" style={{ background: "#ECE9FF", color: "#4A2FE0" }}>
          <span className="w-[6px] h-[6px] rounded-full" style={{ background: "#FF5A3C", boxShadow: "0 0 0 4px rgba(255,90,60,.18)" }} />
          Built for marketing teams
        </span>
        <h1 className="mt-[22px] mx-auto max-w-[14ch] leading-[1.02] tracking-[-2px]" style={{ fontFamily: "'Bricolage Grotesque'", fontWeight: 800, fontSize: "clamp(38px, 6.4vw, 72px)", color: "#14152B" }}>
          Every campaign link, in{" "}
          <em className="not-italic relative" style={{ color: "#5A3FF0" }}>
            one live grid
            <span className="absolute left-0 right-0 bottom-[0.06em] h-[0.13em] rounded-sm" style={{ background: "#FF5A3C", opacity: 0.85 }} />
          </em>
        </h1>
        <p className="mt-[22px] mx-auto max-w-[54ch] text-[#6F6F8C]" style={{ fontSize: "clamp(16px, 2vw, 19px)" }}>
          Slugly groups your short links by project, auto-tags UTM parameters, and shows real-time clicks on every tile — so you stop hunting through spreadsheets for that one link.
        </p>

        {/* Shorten widget */}
        <div className="max-w-[560px] mx-auto mt-[30px] px-2 sm:px-0">
          <div
            className={`flex flex-col sm:flex-row gap-2 rounded-[14px] p-2 transition-all ${error ? "" : ""}`}
            style={{
              background: "#FFFFFF",
              border: `1px solid ${error ? "#FF5A3C" : "#E8E8F1"}`,
              boxShadow: error ? "0 14px 32px -16px rgba(255,90,60,.4)" : "0 12px 32px -18px rgba(40,30,120,.32)",
            }}
          >
            <input
              type="url"
              inputMode="url"
              placeholder="Paste a long URL…"
              value={url}
              onChange={(e) => { setUrl(e.target.value); setError(false); }}
              onKeyDown={(e) => { if (e.key === "Enter") handleShorten(); }}
              className="flex-1 min-w-0 border-0 outline-0 bg-transparent text-[16px] px-3 py-2 sm:py-0"
              style={{ fontFamily: "inherit", color: "#14152B" }}
            />
            <button
              onClick={handleShorten}
              disabled={isShortening}
              className="flex-none inline-flex items-center justify-center gap-2 font-bold rounded-[11px] px-[18px] py-[11px] text-[15px] text-white border-0 cursor-pointer disabled:opacity-70"
              style={{ background: "#5A3FF0", boxShadow: "0 8px 20px -8px rgba(90,63,240,.6)" }}
            >
              {isShortening ? "..." : "Shorten →"}
            </button>
          </div>
          {turnstileSiteKey && !shortCode && (
            <div className="mt-[12px] flex justify-center">
              <Turnstile
                ref={turnstileRef}
                siteKey={turnstileSiteKey}
                onSuccess={(token) => setCaptchaToken(token)}
                onExpire={() => setCaptchaToken(null)}
                options={{ theme: "light", size: "normal" }}
              />
            </div>
          )}
          {error && (
            <p className="text-left text-[13.5px] font-semibold mt-[10px] pl-[6px]" style={{ color: "#FF5A3C" }}>
              Enter a valid URL to shorten.
            </p>
          )}
          {shortCode && (
            <div className="mt-[14px]">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3 rounded-[13px] p-[12px_14px]" style={{ background: "#ECE9FF", border: "1px solid #D9D2FF" }}>
                <span className="text-[14px] sm:text-[17px] font-medium overflow-hidden text-ellipsis whitespace-nowrap" style={{ fontFamily: "'DM Mono', monospace", color: "#14152B" }}>
                  <span style={{ color: "#5A3FF0" }}>{window.location.host}/r/</span>{shortCode}
                </span>
                <button
                  onClick={handleCopy}
                  className="sm:ml-auto flex-none border-0 text-white font-bold text-[14px] px-4 py-[9px] rounded-[10px] cursor-pointer text-center"
                  style={{ background: "#5A3FF0" }}
                >
                  {copied ? "Copied!" : "Copy"}
                </button>
              </div>
              <p className="text-center text-[14px] mt-[11px]" style={{ color: "#6F6F8C" }}>
                {user ? (
                  <span>Link created! <a onClick={() => setLocation("/dashboard")} className="cursor-pointer font-bold" style={{ color: "#4A2FE0" }}>View in dashboard →</a></span>
                ) : (
                  <span>This link expires in 30 days. <a href="/auth?from=shorten" className="font-bold" style={{ color: "#4A2FE0" }}>Sign up free →</a> to make it permanent and track clicks.</span>
                )}
              </p>
            </div>
          )}
        </div>
        <p className="mt-[15px] text-[13.5px]" style={{ color: "#6F6F8C" }}>Free plan: 1 project, 5 links. No card required.</p>
      </header>

      {/* Grid showcase */}
      <section className="max-w-[1120px] mx-auto px-4 sm:px-6" id="grid">
        <div className="mt-[46px] relative">
          {/* Glow */}
          <div className="absolute inset-[-6%_-2%_8%] z-0" style={{ background: "radial-gradient(60% 70% at 50% 0%, rgba(90,63,240,.16), transparent 70%)", filter: "blur(8px)" }} />
          <div className="relative z-[1] rounded-[22px] overflow-hidden" style={{ background: "#FFFFFF", border: "1px solid #E8E8F1", boxShadow: "0 24px 60px -20px rgba(40,30,120,.28)" }}>
            {/* Panel bar */}
            <div className="flex items-center gap-[10px] px-[18px] py-[14px] border-b" style={{ borderColor: "#E8E8F1" }}>
              <div className="flex gap-[6px]">
                <i className="w-[10px] h-[10px] rounded-full" style={{ background: "#E2E2EC" }} />
                <i className="w-[10px] h-[10px] rounded-full" style={{ background: "#E2E2EC" }} />
                <i className="w-[10px] h-[10px] rounded-full" style={{ background: "#E2E2EC" }} />
              </div>
              <span className="ml-[6px] text-[13.5px]" style={{ color: "#6F6F8C" }}>
                <b className="font-bold" style={{ color: "#14152B" }}>slug.ly</b> / dashboard / Summer Campaign 2026
              </span>
            </div>
            {/* Project header */}
            <div className="flex items-end justify-between gap-4 px-[22px] pt-[20px] pb-[16px] flex-wrap">
              <div>
                <h2 className="flex items-center gap-[10px] text-[22px] tracking-[-0.6px]" style={{ fontFamily: "'Bricolage Grotesque'", fontWeight: 700 }}>
                  <span className="w-[30px] h-[30px] rounded-[9px] grid place-items-center" style={{ background: "#ECE9FF", color: "#5A3FF0" }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>
                  </span>
                  Summer Campaign 2026
                </h2>
                <div className="flex gap-[14px] flex-wrap mt-[5px] text-[13.5px]" style={{ color: "#6F6F8C" }}>
                  <span><b className="font-bold" style={{ color: "#14152B" }}>18</b> links</span>
                  <span><b className="font-bold" style={{ color: "#14152B" }}>24,109</b> clicks</span>
                  <span>updated 2m ago</span>
                </div>
              </div>
              <div className="flex gap-[7px] flex-wrap">
                <span className="text-[12px] font-semibold px-[10px] py-[4px] rounded-full text-white" style={{ background: "#5A3FF0", border: "1px solid #5A3FF0" }}>#summer-sale</span>
                <span className="text-[12px] font-semibold px-[10px] py-[4px] rounded-full" style={{ background: "#F3F2FA", color: "#6F6F8C", border: "1px solid #E8E8F1" }}>#paid-social</span>
                <span className="text-[12px] font-semibold px-[10px] py-[4px] rounded-full" style={{ background: "#F3F2FA", color: "#6F6F8C", border: "1px solid #E8E8F1" }}>#email</span>
              </div>
            </div>
            {/* Grid tiles */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-[14px] px-[22px] pb-[24px] pt-[6px]">
              {TILES.map((tile, i) => (
                <div
                  key={i}
                  className="rounded-[15px] p-[15px_16px_13px] transition-transform hover:-translate-y-[3px]"
                  style={{
                    background: "#FFFFFF",
                    border: tile.live ? "1px solid rgba(255,90,60,.45)" : "1px solid #E8E8F1",
                    boxShadow: tile.live ? "0 0 0 3px rgba(255,90,60,.08)" : "none",
                  }}
                >
                  <div className="flex items-center gap-[7px] text-[12.5px] font-semibold" style={{ color: "#6F6F8C" }}>
                    <i className="w-[8px] h-[8px] rounded-full" style={{ background: tile.c }} />
                    {tile.ch}
                    {tile.live && (
                      <span className="inline-flex items-center gap-[5px] text-[11px] font-bold ml-1" style={{ color: "#FF5A3C" }}>
                        <i className="w-[6px] h-[6px] rounded-full" style={{ background: "#FF5A3C" }} />
                        live
                      </span>
                    )}
                  </div>
                  <div className="mt-[11px] text-[14px] font-medium flex items-center gap-2" style={{ fontFamily: "'DM Mono', monospace", color: "#14152B" }}>
                    <span><span style={{ color: "#5A3FF0" }}>slug.ly/</span>{tile.slug}</span>
                    <svg className="ml-auto" style={{ color: "#B7B7C9" }} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>
                  </div>
                  <div className="flex items-end justify-between mt-[14px] gap-[10px]">
                    <div>
                      <div className="text-[26px] font-medium tracking-[-0.5px] leading-none" style={{ fontFamily: "'DM Mono', monospace" }}>
                        {tile.live ? <span ref={i === 0 ? liveCounterRef : undefined}>{tile.n.toLocaleString()}</span> : tile.n.toLocaleString()}
                      </div>
                      <div className="text-[11.5px] font-semibold uppercase tracking-[0.06em] mt-[4px]" style={{ color: "#6F6F8C" }}>clicks</div>
                    </div>
                    <svg className="flex-none" width="88" height="30" viewBox="0 0 88 30" fill="none">
                      <polyline points={tile.sp} fill="none" stroke={tile.live ? "#FF5A3C" : "#5A3FF0"} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-[1120px] mx-auto px-4 sm:px-6 pt-[50px] sm:pt-[74px] pb-[20px]">
        <h3 className="text-center tracking-[-1px]" style={{ fontFamily: "'Bricolage Grotesque'", fontWeight: 700, fontSize: "clamp(26px, 3.4vw, 38px)" }}>
          Less link chaos. More signal.
        </h3>
        <p className="text-center max-w-[50ch] mx-auto mt-[14px]" style={{ color: "#6F6F8C" }}>
          Everything a marketer actually does with links — without the spreadsheet.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-[18px] mt-[42px]">
          <div className="rounded-[18px] p-[24px]" style={{ background: "#FFFFFF", border: "1px solid #E8E8F1" }}>
            <div className="w-[42px] h-[42px] rounded-[12px] grid place-items-center mb-[16px]" style={{ background: "#ECE9FF", color: "#5A3FF0" }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>
            </div>
            <h4 className="text-[19px] tracking-[-0.3px]" style={{ fontFamily: "'Bricolage Grotesque'", fontWeight: 700 }}>Organized by project</h4>
            <p className="mt-[9px] text-[15px]" style={{ color: "#6F6F8C" }}>Group links by campaign, client, or channel. Open a project and see every link as a live tile.</p>
          </div>
          <div className="rounded-[18px] p-[24px]" style={{ background: "#FFFFFF", border: "1px solid #E8E8F1" }}>
            <div className="w-[42px] h-[42px] rounded-[12px] grid place-items-center mb-[16px]" style={{ background: "#ECE9FF", color: "#5A3FF0" }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12a8 8 0 0 1 13-6.3M20 12a8 8 0 0 1-13 6.3"/><path d="M17 3v4h-4M7 21v-4h4"/></svg>
            </div>
            <h4 className="text-[19px] tracking-[-0.3px]" style={{ fontFamily: "'Bricolage Grotesque'", fontWeight: 700 }}>Swap the destination, keep the link</h4>
            <p className="mt-[9px] text-[15px]" style={{ color: "#6F6F8C" }}>Point a short link somewhere new without breaking it or losing a single click of history.</p>
          </div>
          <div className="rounded-[18px] p-[24px]" style={{ background: "#FFFFFF", border: "1px solid #E8E8F1" }}>
            <div className="w-[42px] h-[42px] rounded-[12px] grid place-items-center mb-[16px]" style={{ background: "#ECE9FF", color: "#5A3FF0" }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 8.5 11 3l8 5.5v7L11 21l-8-5.5z"/><path d="M11 3v18"/><path d="M3 8.5 11 12l8-3.5"/></svg>
            </div>
            <h4 className="text-[19px] tracking-[-0.3px]" style={{ fontFamily: "'Bricolage Grotesque'", fontWeight: 700 }}>Tag across campaigns</h4>
            <p className="mt-[9px] text-[15px]" style={{ color: "#6F6F8C" }}>One tag spans every project. Roll up clicks for a whole campaign in a single click.</p>
          </div>
        </div>
      </section>

      {/* Closing CTA */}
      <section className="max-w-[1120px] mx-auto px-4 sm:px-6 mt-[40px] sm:mt-[64px] mb-[50px] sm:mb-[70px]">
        <div className="rounded-[24px] px-[28px] py-[54px] text-center text-white relative overflow-hidden" style={{ background: "linear-gradient(120deg, #5A3FF0, #7B61FF)", boxShadow: "0 30px 60px -24px rgba(90,63,240,.55)" }}>
          <div className="absolute right-[-60px] top-[-60px] w-[240px] h-[240px] rounded-full" style={{ background: "rgba(255,90,60,.35)", filter: "blur(20px)" }} />
          <h3 className="relative tracking-[-1.2px]" style={{ fontFamily: "'Bricolage Grotesque'", fontWeight: 800, fontSize: "clamp(28px, 4vw, 42px)" }}>
            Put your links in order today
          </h3>
          <p className="relative opacity-[0.92] mt-[12px]">Start free, no card. Bring your own domain when you're ready.</p>
          <button
            onClick={() => user ? setLocation("/dashboard") : (window.location.href = getLoginUrl())}
            className="relative mt-[26px] inline-flex items-center gap-2 font-bold rounded-[11px] px-[18px] py-[11px] text-[15px] border-0 cursor-pointer hover:bg-[#f4f2ff]"
            style={{ background: "#fff", color: "#4A2FE0" }}
          >
            Get started free →
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t" style={{ borderColor: "#E8E8F1", padding: "26px 0" }}>
        <div className="max-w-[1120px] mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-[13.5px]" style={{ color: "#6F6F8C" }}>
          <span className="flex items-center gap-[9px] text-[17px] font-[800]" style={{ fontFamily: "'Bricolage Grotesque'", color: "#14152B" }}>
            <img src="/assets/slugly-logo.svg" alt="Slugly" className="w-[26px] h-[26px]" />
            Slugly
          </span>
          <div className="flex items-center gap-4">
            <a href="/terms" className="hover:underline">Terms</a>
            <a href="/privacy" className="hover:underline">Privacy</a>
            <a href="/aup" className="hover:underline">Acceptable Use</a>
            <a href="/report" className="hover:underline">Report Abuse</a>
          </div>
          <span>© 2026 Slugly</span>
        </div>
      </footer>
    </div>
  );
}

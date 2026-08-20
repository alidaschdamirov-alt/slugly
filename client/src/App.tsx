import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, useLocation } from "wouter";
import { useEffect } from "react";
import ErrorBoundary from "./components/ErrorBoundary";
import ImpersonationBanner from "./components/ImpersonationBanner";
import { ThemeProvider } from "./contexts/ThemeContext";
import CookieConsent from "./components/CookieConsent";
import { initAnalytics, trackEvent, trackPageView } from "@/lib/analytics";
import Home from "./pages/Home";
import PricingPage from "./pages/PricingPage";
import Dashboard from "./pages/Dashboard";
import ProjectView from "./pages/ProjectView";
import LinkAnalytics from "./pages/LinkAnalytics";
import ProjectAnalytics from "./pages/ProjectAnalytics";
import CreateLink from "./pages/CreateLink";
import BulkCreate from "./pages/BulkCreate";
import DomainsPage from "./pages/DomainsPage";
import BillingPage from "./pages/BillingPage";
import TagsPage from "./pages/TagsPage";
import TagAnalytics from "./pages/TagAnalytics";
import QrCodesPage from "./pages/QrCodesPage";
import ReportPage from "./pages/ReportPage";
import AuthPage from "./pages/AuthPage";
import AdminRoute from "./pages/AdminRoute";
import PrivacySettings from "./pages/PrivacySettings";
import { TermsPage, PrivacyPage, AupPage } from "./pages/LegalPages";
import Team from "./pages/Team";
import InviteAccept from "./pages/InviteAccept";
import UtmTemplates from "./pages/UtmTemplates";
import LinkRules from "./pages/LinkRules";
import CampaignDashboard from "./pages/CampaignDashboard";
import WhiteLabelReport from "./pages/WhiteLabelReport";
import ProjectComparison from "./pages/ProjectComparison";
import TagComparison from "./pages/TagComparison";
import ExportReport from "./pages/ExportReport";

function AppRoutes() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/pricing" component={PricingPage} />
      <Route path="/auth" component={AuthPage} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/project/:id" component={ProjectView} />
      <Route path="/project/:id/analytics" component={ProjectAnalytics} />
      <Route path="/link/:id/analytics" component={LinkAnalytics} />
      <Route path="/link/:linkId/rules" component={LinkRules} />
      <Route path="/create" component={CreateLink} />
      <Route path="/links/new" component={CreateLink} />
      <Route path="/create/bulk" component={BulkCreate} />
      <Route path="/domains" component={DomainsPage} />
      <Route path="/billing" component={BillingPage} />
      <Route path="/tags" component={TagsPage} />
      <Route path="/tags/compare" component={TagComparison} />
      <Route path="/tags/:tag" component={TagAnalytics} />
      <Route path="/qr" component={QrCodesPage} />
      <Route path="/report" component={ReportPage} />
      <Route path="/reports" component={ExportReport} />
      <Route path="/team" component={Team} />
      <Route path="/utm-templates" component={UtmTemplates} />
      <Route path="/campaigns" component={CampaignDashboard} />
      <Route path="/compare" component={ProjectComparison} />
      <Route path="/branding" component={WhiteLabelReport} />
      <Route path="/export-report" component={ExportReport} />
      <Route path="/invite/:token" component={InviteAccept} />
      <Route path="/admin" component={AdminRoute} />
      <Route path="/privacy-settings" component={PrivacySettings} />
      <Route path="/terms" component={TermsPage} />
      <Route path="/privacy" component={PrivacyPage} />
      <Route path="/aup" component={AupPage} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function getRouteEvent(location: string) {
  if (location === "/") return "home_opened";
  if (location.startsWith("/pricing")) return "pricing_opened";
  if (location.startsWith("/auth")) return "auth_opened";
  if (location.startsWith("/dashboard")) return "dashboard_opened";
  if (location.startsWith("/create/bulk")) return "bulk_create_opened";
  if (location.startsWith("/create") || location.startsWith("/links/new")) return "create_link_opened";
  if (/^\/project\/[^/]+\/analytics/.test(location)) return "project_analytics_opened";
  if (/^\/project\/[^/]+/.test(location)) return "project_opened";
  if (/^\/link\/[^/]+\/analytics/.test(location)) return "link_analytics_opened";
  if (location.startsWith("/team")) return "team_opened";
  if (location.startsWith("/billing")) return "billing_opened";
  if (location.startsWith("/domains")) return "domains_opened";
  if (location.startsWith("/qr")) return "qr_page_opened";
  if (location.startsWith("/tags")) return "tags_opened";
  if (location.startsWith("/campaigns")) return "campaigns_opened";
  if (location.startsWith("/compare")) return "comparison_opened";
  if (location.startsWith("/reports") || location.startsWith("/export-report")) return "reports_opened";
  if (location.startsWith("/invite")) return "invite_accept_opened";
  if (location.startsWith("/admin")) return "admin_opened";
  return null;
}

function AnalyticsRouteTracker() {
  const [location] = useLocation();

  useEffect(() => {
    trackPageView(location);

    const eventName = getRouteEvent(location);
    if (eventName) {
      trackEvent(eventName, { route: location });
    }
  }, [location]);

  return null;
}

function normalizeLandingCopy() {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const replacements = [
    ["Bring your own domain when you're ready.", "Upgrade when you're ready for more links, analytics, and team workflows."],
    ["slug.ly/", "slugly.io/r/"],
    ["slug.ly", "slugly.io"],
  ] as const;

  const nodes: Text[] = [];
  let current = walker.nextNode();
  while (current) {
    nodes.push(current as Text);
    current = walker.nextNode();
  }

  for (const node of nodes) {
    let nextValue = node.nodeValue || "";
    for (const [from, to] of replacements) {
      nextValue = nextValue.split(from).join(to);
    }
    if (nextValue !== node.nodeValue) node.nodeValue = nextValue;
  }
}

function LandingPricingLinkInjector() {
  const [location] = useLocation();

  useEffect(() => {
    if (location !== "/" || typeof document === "undefined") return;

    normalizeLandingCopy();

    const createPricingLink = (variant: "nav" | "footer") => {
      const link = document.createElement("a");
      link.href = "/pricing";
      link.textContent = "Pricing";
      link.dataset.sluglyPricingLink = variant;
      if (variant === "nav") {
        link.className = "font-semibold text-[#6F6F8C] hover:text-[#14152B] transition-colors hidden sm:inline";
      } else {
        link.className = "hover:underline";
      }
      return link;
    };

    const nav = document.querySelector("nav");
    if (nav && !nav.querySelector("[data-slugly-pricing-link='nav']")) {
      const navGroups = Array.from(nav.querySelectorAll("div")).filter(group => {
        const text = group.textContent || "";
        return text.includes("Get started") || text.includes("Start free") || text.includes("Dashboard") || text.includes("Sign in");
      });
      const actions = navGroups[navGroups.length - 1];
      const firstAction = actions?.firstElementChild;
      if (actions && firstAction) {
        actions.insertBefore(createPricingLink("nav"), firstAction.nextSibling);
      }
    }

    const footer = document.querySelector("footer");
    if (footer && !footer.querySelector("[data-slugly-pricing-link='footer']")) {
      const linkGroups = Array.from(footer.querySelectorAll("div")).filter(group => {
        const text = group.textContent || "";
        return text.includes("Terms") && text.includes("Privacy") && text.includes("Acceptable Use");
      });
      const links = linkGroups[linkGroups.length - 1];
      if (links) {
        const pricing = createPricingLink("footer");
        const spacer = document.createElement("span");
        spacer.className = "mx-2";
        spacer.textContent = "·";
        links.insertBefore(spacer, links.firstChild);
        links.insertBefore(pricing, links.firstChild);
      }
    }
  }, [location]);

  return null;
}

initAnalytics();

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light" switchable>
        <TooltipProvider>
          <Toaster />
          <ImpersonationBanner />
          <AnalyticsRouteTracker />
          <LandingPricingLinkInjector />
          <AppRoutes />
          <CookieConsent />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
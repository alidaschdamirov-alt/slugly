import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, useLocation } from "wouter";
import { useEffect } from "react";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import CookieConsent from "./components/CookieConsent";
import { initAnalytics, trackPageView } from "@/lib/analytics";
import Home from "./pages/Home";
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
import AdminPanel from "./pages/AdminPanel";
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
      <Route path="/auth" component={AuthPage} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/project/:id" component={ProjectView} />
      <Route path="/project/:id/analytics" component={ProjectAnalytics} />
      <Route path="/link/:id/analytics" component={LinkAnalytics} />
      <Route path="/link/:linkId/rules" component={LinkRules} />
      <Route path="/create" component={CreateLink} />
      <Route path="/create/bulk" component={BulkCreate} />
      <Route path="/domains" component={DomainsPage} />
      <Route path="/billing" component={BillingPage} />
      <Route path="/tags" component={TagsPage} />
      <Route path="/tags/compare" component={TagComparison} />
      <Route path="/tags/:tag" component={TagAnalytics} />
      <Route path="/qr" component={QrCodesPage} />
      <Route path="/report" component={ReportPage} />
      <Route path="/team" component={Team} />
      <Route path="/utm-templates" component={UtmTemplates} />
      <Route path="/campaigns" component={CampaignDashboard} />
      <Route path="/compare" component={ProjectComparison} />
      <Route path="/branding" component={WhiteLabelReport} />
      <Route path="/export-report" component={ExportReport} />
      <Route path="/invite/:token" component={InviteAccept} />
      <Route path="/admin" component={AdminPanel} />
      <Route path="/privacy-settings" component={PrivacySettings} />
      <Route path="/terms" component={TermsPage} />
      <Route path="/privacy" component={PrivacyPage} />
      <Route path="/aup" component={AupPage} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function AnalyticsRouteTracker() {
  const [location] = useLocation();

  useEffect(() => {
    trackPageView(location);
  }, [location]);

  return null;
}

// Initialize analytics (respects stored consent)
initAnalytics();

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light" switchable>
        <TooltipProvider>
          <Toaster />
          <AnalyticsRouteTracker />
          <AppRoutes />
          <CookieConsent />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;

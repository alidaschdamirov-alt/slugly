import { useAuth } from "@/_core/hooks/useAuth";
import AppShell from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import {
  getLinkStatus,
  getLinkStatusClass,
  getLinkStatusLabel,
  type LinkStatus,
} from "@shared/link-status";
import {
  Shield,
  Search,
  Loader2,
  Ban,
  Trash2,
  Plus,
  ExternalLink,
  LayoutDashboard,
  AlertTriangle,
  Users,
  Link2,
  CreditCard,
  Settings,
  ScrollText,
  Download,
  Pause,
  Play,
  UserX,
  Crown,
  ChevronRight,
  Activity,
  Globe,
  Eye,
  EyeOff,
  RefreshCw,
  Mail,
  Send,
  Bell,
  Megaphone,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import Sluggo from "@/components/Sluggo";

type AdminSection =
  | "dashboard"
  | "abuse"
  | "users"
  | "links"
  | "workspaces"
  | "billing"
  | "config"
  | "email"
  | "emailTemplates"
  | "audit"
  | "notifications";

const NAV_ITEMS: {
  id: AdminSection;
  label: string;
  icon: React.ElementType;
}[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "abuse", label: "Abuse & Trust", icon: AlertTriangle },
  { id: "users", label: "Users", icon: Users },
  { id: "links", label: "Links", icon: Link2 },
  { id: "workspaces", label: "Workspaces", icon: Globe },
  { id: "billing", label: "Billing", icon: CreditCard },
  { id: "config", label: "Config", icon: Settings },
  { id: "email", label: "Email Settings", icon: Mail },
  { id: "emailTemplates", label: "Email Templates", icon: Megaphone },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "audit", label: "Audit Log", icon: ScrollText },
];

const ADMIN_GROUPS: { label: string; items: AdminSection[] }[] = [
  { label: "Overview", items: ["dashboard"] },
  {
    label: "Manage",
    items: ["users", "workspaces", "links", "abuse", "billing"],
  },
  {
    label: "Configure",
    items: ["config", "notifications", "email", "emailTemplates", "audit"],
  },
];

export default function AdminPanel() {
  const { user, loading } = useAuth();
  const [section, setSection] = useState<AdminSection>("dashboard");
  const [, setLocation] = useLocation();

  if (loading)
    return (
      <AppShell>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      </AppShell>
    );
  if (!user || user.role !== "admin")
    return (
      <AppShell>
        <div className="text-center py-20">
          <h1 className="text-xl font-semibold">Access Denied</h1>
          <p className="text-muted-foreground mt-2">Admin access required.</p>
        </div>
      </AppShell>
    );

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 flex h-14 items-center gap-3 bg-[#14152B] px-5 text-white">
        <button
          className="flex items-center gap-2.5"
          onClick={() => setLocation("/dashboard")}
        >
          <img src="/assets/slugly-logo.svg" alt="Slugly" className="h-6 w-6" />
          <span
            className="text-[17px] font-extrabold"
            style={{ fontFamily: "'Bricolage Grotesque'" }}
          >
            Slugly
          </span>
        </button>
        <span className="rounded-md bg-[#FF5A3C] px-2 py-0.5 text-[10px] font-extrabold tracking-[0.08em]">
          ADMIN
        </span>
        <div className="ml-auto flex items-center gap-3 text-[13px] text-[#C9C9DA]">
          <button
            className="hidden hover:text-white sm:inline"
            onClick={() => setLocation("/dashboard")}
          >
            ← Back to app
          </button>
          <span className="max-w-[190px] truncate">{user.email}</span>
        </div>
      </header>

      <div className="grid min-h-[calc(100vh-56px)] md:grid-cols-[228px_minmax(0,1fr)]">
        <aside className="hidden border-r border-border bg-card px-3 py-3.5 md:block">
          <nav className="sticky top-[70px]">
            {ADMIN_GROUPS.map(group => (
              <div key={group.label}>
                <div className="px-2.5 pb-1.5 pt-3 text-[10px] font-extrabold uppercase tracking-[0.07em] text-[#9A9AB2]">
                  {group.label}
                </div>
                {group.items.map(id => {
                  const item = NAV_ITEMS.find(navItem => navItem.id === id)!;
                  return (
                    <button
                      key={item.id}
                      onClick={() => setSection(item.id)}
                      className={`flex w-full items-center gap-2.5 rounded-[9px] px-[11px] py-[9px] text-sm font-semibold transition-colors ${section === item.id ? "bg-[#EDEBFB] text-[#4A2FE0]" : "text-muted-foreground hover:bg-accent hover:text-foreground"}`}
                    >
                      <item.icon className="h-4 w-4" />
                      {item.label}
                    </button>
                  );
                })}
              </div>
            ))}
          </nav>
        </aside>

        <main className="min-w-0 overflow-x-hidden px-4 py-[26px] pb-14 sm:px-7">
          <div className="-mx-1 mb-5 flex gap-1 overflow-x-auto px-1 pb-2 md:hidden">
            {NAV_ITEMS.map(item => (
              <button
                key={item.id}
                onClick={() => setSection(item.id)}
                className={`flex shrink-0 items-center gap-1.5 rounded-[9px] px-3 py-2 text-xs font-bold transition-colors ${section === item.id ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground"}`}
              >
                <item.icon className="h-3.5 w-3.5" />
                {item.label}
              </button>
            ))}
          </div>

          <div className="mx-auto max-w-[1180px]">
            {section === "dashboard" && <DashboardSection />}
            {section === "abuse" && <AbuseSection />}
            {section === "users" && <UsersSection />}
            {section === "links" && <LinksSection />}
            {section === "workspaces" && <WorkspacesSection />}
            {section === "billing" && <BillingSection />}
            {section === "config" && <ConfigSection />}
            {section === "email" && <EmailSection onNavigate={setSection} />}
            {section === "emailTemplates" && (
              <EmailTemplatesSection onNavigate={setSection} />
            )}
            {section === "audit" && <AuditSection />}
            {section === "notifications" && <NotificationsSection />}
          </div>
        </main>
      </div>
    </div>
  );
}

function AdminQueryError({
  title,
  error,
  onRetry,
}: {
  title: string;
  error: unknown;
  onRetry: () => void;
}) {
  console.error(`[Admin] ${title}`, error);
  return (
    <Card className="border-destructive/30 bg-destructive/5 p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 text-destructive" />
          <div>
            <p className="font-medium">{title}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              The server could not load this section. Try again in a moment.
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Retry
        </Button>
      </div>
    </Card>
  );
}

// ============ DASHBOARD ============
function DashboardSection() {
  const { data: metrics, isLoading, isError, error, refetch } = trpc.admin.getMetrics.useQuery();
  const { data: reports } = trpc.admin.getReports.useQuery({ status: "pending" });
  const { data: dashboardLinks } = trpc.admin.searchLinks.useQuery({});

  const statusCounts: Record<LinkStatus, number> = {
    active: 0,
    paused: 0,
    scheduled: 0,
    expired: 0,
    broken: 0,
  };
  for (const link of dashboardLinks || []) statusCounts[getLinkStatus(link)] += 1;

  if (isLoading)
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  if (isError)
    return <AdminQueryError title="Couldn't load platform metrics." error={error} onRetry={() => void refetch()} />;
  if (!metrics)
    return <AdminQueryError title="Couldn't load platform metrics." error={new Error("Empty metrics response")} onRetry={() => void refetch()} />;

  const hasFullLinkSnapshot = dashboardLinks !== undefined;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold">Dashboard</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">Platform health at a glance</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard label="Total Users" value={metrics.totalUsers} icon={Users} />
        <MetricCard label="Registrations (today)" value={metrics.registrationsToday} icon={Activity} />
        <MetricCard label="Registrations (week)" value={metrics.registrationsWeek} icon={Activity} />
        <MetricCard label="Pro Users" value={metrics.proUsers} icon={Crown} accent />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        <MetricCard label="Clicks Today" value={metrics.clicksToday} icon={Link2} />
        <MetricCard label="Clicks This Week" value={metrics.clicksWeek} icon={Link2} />
        <MetricCard label="Total Links" value={metrics.totalLinks} icon={Globe} />
        <MetricCard label="Active Links" value={hasFullLinkSnapshot ? statusCounts.active : metrics.activeLinks} icon={Globe} />
        <MetricCard label="Broken Links" value={statusCounts.broken} icon={AlertTriangle} alert={statusCounts.broken > 0} />
        <MetricCard label="Expired Links" value={statusCounts.expired} icon={Activity} alert={statusCounts.expired > 0} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard label="Open Reports" value={metrics.openReports} icon={AlertTriangle} alert={metrics.openReports > 0} />
        <MetricCard label="Links Disabled Today" value={metrics.linksDisabledToday} icon={Ban} />
        <MetricCard label="Suspended Users" value={metrics.suspendedUsers} icon={UserX} />
        <MetricCard
          label="Conversion Rate"
          value={metrics.totalUsers > 0 ? `${((metrics.proUsers / metrics.totalUsers) * 100).toFixed(1)}%` : "0%"}
          icon={CreditCard}
        />
      </div>

      {(reports?.length || 0) > 0 && (
        <Card className="p-4 border-amber-500/30 bg-amber-500/5">
          <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
            <AlertTriangle className="h-4 w-4" />
            <span className="text-sm font-medium">{reports?.length} pending report(s) require review</span>
          </div>
        </Card>
      )}
    </div>
  );
}

function MetricCard({ label, value, icon: Icon, accent, alert }: {
  label: string;
  value: number | string;
  icon: React.ElementType;
  accent?: boolean;
  alert?: boolean;
}) {
  return (
    <Card className={`p-[15px_17px] ${alert ? "border-amber-500/50" : accent ? "border-primary/30" : ""}`}>
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-bold uppercase tracking-[0.05em] text-[#9A9AB2]">{label}</p>
        <Icon className={`h-4 w-4 ${alert ? "text-amber-500" : accent ? "text-primary" : "text-muted-foreground"}`} />
      </div>
      <p className="mt-1.5 text-[27px] font-extrabold tracking-tight">{value}</p>
    </Card>
  );
}

// ============ ABUSE & TRUST ============
function AbuseSection() {
  const utils = trpc.useUtils();
  const { data: reports } = trpc.admin.getReports.useQuery({});
  const updateReport = trpc.admin.updateReport.useMutation({
    onSuccess: () => {
      utils.admin.getReports.invalidate();
      utils.admin.getMetrics.invalidate();
      toast.success("Report updated");
    },
  });
  const disableLink = trpc.admin.disableLink.useMutation({
    onSuccess: () => {
      utils.admin.getReports.invalidate();
      toast.success("Link disabled");
    },
  });
  const banUser = trpc.admin.banUser.useMutation({
    onSuccess: () => {
      utils.admin.getReports.invalidate();
      toast.success("User banned & links paused");
    },
  });

  const { data: blockedDomains } = trpc.admin.getBlockedDomains.useQuery();
  const [newDomain, setNewDomain] = useState("");
  const [blockReason, setBlockReason] = useState("");
  const addBlockedDomain = trpc.admin.addBlockedDomain.useMutation({
    onSuccess: () => {
      utils.admin.getBlockedDomains.invalidate();
      setNewDomain("");
      setBlockReason("");
      toast.success("Domain blocked");
    },
    onError: err => toast.error(err.message),
  });
  const removeBlockedDomain = trpc.admin.removeBlockedDomain.useMutation({
    onSuccess: () => {
      utils.admin.getBlockedDomains.invalidate();
      toast.success("Domain unblocked");
    },
  });

  const { data: settings } = trpc.admin.getSiteSettings.useQuery();
  const updateSettings = trpc.admin.updateSiteSettings.useMutation({
    onSuccess: () => {
      utils.admin.getSiteSettings.invalidate();
      toast.success("Settings updated");
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3.5">
        <Sluggo variant="shield" className="h-14 w-[60px] shrink-0" />
        <div>
          <h1 className="text-2xl font-extrabold">Abuse & Trust</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">Review reports and keep redirects safe</p>
        </div>
      </div>

      <Card className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-sm font-medium">Global Safe Mode</Label>
            <p className="text-xs text-muted-foreground mt-0.5">Show interstitial warning for anonymous/new links before redirecting</p>
          </div>
          <Switch checked={settings?.safeMode ?? false} onCheckedChange={checked => updateSettings.mutate({ safeMode: checked })} />
        </div>
      </Card>

      <div>
        <h3 className="text-sm font-semibold mb-3">Reports Queue ({reports?.length || 0})</h3>
        {!reports?.length ? (
          <Card className="p-6 text-center text-muted-foreground text-sm">No reports. All clear.</Card>
        ) : (
          <div className="space-y-2">
            {reports.map((report: any) => (
              <Card key={report.id} className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <code className="text-sm font-mono bg-muted px-2 py-0.5 rounded">{report.shortCode}</code>
                      <Badge variant={report.status === "pending" ? "destructive" : report.status === "actioned" ? "default" : "secondary"}>{report.status}</Badge>
                    </div>
                    {report.reason && <p className="text-sm text-muted-foreground mt-1">{report.reason}</p>}
                    {report.reporterEmail && <p className="text-xs text-muted-foreground mt-1">From: {report.reporterEmail}</p>}
                    <p className="text-xs text-muted-foreground mt-1">{new Date(report.createdAt).toLocaleString()}</p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    {report.status === "pending" && (
                      <>
                        <Button size="sm" variant="outline" onClick={() => updateReport.mutate({ id: report.id, status: "dismissed" })}>Dismiss</Button>
                        <Button size="sm" variant="destructive" onClick={() => { disableLink.mutate({ id: report.linkId || 0 }); updateReport.mutate({ id: report.id, status: "actioned" }); }}>
                          <Ban className="h-3 w-3 mr-1" /> Disable Link
                        </Button>
                        {report.userId && report.userId > 0 && (
                          <Button size="sm" variant="destructive" onClick={() => { banUser.mutate({ id: report.userId }); updateReport.mutate({ id: report.id, status: "actioned" }); }}>
                            <UserX className="h-3 w-3 mr-1" /> Ban Owner
                          </Button>
                        )}
                        {report.destinationDomain && (
                          <Button size="sm" variant="outline" onClick={() => { addBlockedDomain.mutate({ hostname: report.destinationDomain, reason: `Reported: ${report.reason || "abuse"}` }); updateReport.mutate({ id: report.id, status: "actioned" }); }}>
                            <Globe className="h-3 w-3 mr-1" /> Block Domain
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Separator />

      <div>
        <h3 className="text-sm font-semibold mb-3">Domain Blocklist ({blockedDomains?.length || 0})</h3>
        <Card className="p-4 mb-3">
          <div className="flex gap-2">
            <Input value={newDomain} onChange={e => setNewDomain(e.target.value)} placeholder="malicious-site.com" className="flex-1" />
            <Input value={blockReason} onChange={e => setBlockReason(e.target.value)} placeholder="Reason" className="max-w-[180px]" />
            <Button onClick={() => addBlockedDomain.mutate({ hostname: newDomain, reason: blockReason || undefined })} size="sm" disabled={!newDomain.trim()}><Plus className="h-4 w-4" /></Button>
          </div>
        </Card>
        <div className="space-y-1.5">
          {blockedDomains?.map((d: any) => (
            <div key={d.id} className="flex items-center justify-between p-2.5 bg-muted/50 rounded text-sm">
              <div>
                <code className="font-mono text-xs">{d.hostname}</code>
                {d.reason && <span className="text-muted-foreground ml-2 text-xs">— {d.reason}</span>}
              </div>
              <Button size="sm" variant="ghost" onClick={() => removeBlockedDomain.mutate({ id: d.id })}><Trash2 className="h-3 w-3" /></Button>
            </div>
          ))}
          {!blockedDomains?.length && <p className="text-xs text-muted-foreground">No blocked domains.</p>}
        </div>
      </div>
    </div>
  );
}

// ============ USERS ============
function UsersSection() {
  const utils = trpc.useUtils();
  const [search, setSearch] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);

  const { data: usersList } = trpc.admin.searchUsers.useQuery({ search: search || undefined });
  const { data: userCard } = trpc.admin.getUserCard.useQuery({ id: selectedUserId! }, { enabled: !!selectedUserId });

  const suspendUser = trpc.admin.suspendUser.useMutation({ onSuccess: () => { utils.admin.searchUsers.invalidate(); utils.admin.getUserCard.invalidate(); toast.success("User suspended"); } });
  const unsuspendUser = trpc.admin.unsuspendUser.useMutation({ onSuccess: () => { utils.admin.searchUsers.invalidate(); utils.admin.getUserCard.invalidate(); toast.success("User unsuspended"); } });
  const setRole = trpc.admin.setRole.useMutation({ onSuccess: () => { utils.admin.searchUsers.invalidate(); utils.admin.getUserCard.invalidate(); toast.success("Role updated"); } });
  const deleteUser = trpc.admin.deleteUser.useMutation({ onSuccess: () => { utils.admin.searchUsers.invalidate(); setSelectedUserId(null); toast.success("User deleted"); } });

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">Users</h2>
      <div className="flex gap-2">
        <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or email..." className="max-w-sm" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="space-y-1.5 max-h-[500px] overflow-y-auto">
          {usersList?.map((u: any) => (
            <div key={u.id} onClick={() => setSelectedUserId(u.id)} className={`flex items-center justify-between p-3 rounded-md cursor-pointer transition-colors ${selectedUserId === u.id ? "bg-accent" : "hover:bg-muted/50"}`}>
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{u.name || "Anonymous"}</p>
                <p className="text-xs text-muted-foreground truncate">{u.email || "No email"}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {u.suspended && <Badge variant="destructive" className="text-[10px]">Suspended</Badge>}
                <Badge variant={u.plan === "pro" ? "default" : "secondary"} className="text-[10px]">{u.plan}</Badge>
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
            </div>
          ))}
          {usersList?.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No users found.</p>}
        </div>

        {userCard && (
          <Card className="p-5 space-y-4">
            <div>
              <h3 className="font-semibold text-base">{userCard.name || "Anonymous"}</h3>
              <p className="text-sm text-muted-foreground">{userCard.email || "No email"}</p>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-muted-foreground">Plan:</span>{" "}<Badge variant={userCard.plan === "pro" ? "default" : "secondary"}>{userCard.plan}</Badge></div>
              <div><span className="text-muted-foreground">Role:</span>{" "}<Badge variant="outline">{userCard.role}</Badge></div>
              <div><span className="text-muted-foreground">Links:</span> {userCard.linkCount}</div>
              <div><span className="text-muted-foreground">Projects:</span> {userCard.projectCount}</div>
              <div><span className="text-muted-foreground">Status:</span>{" "}{userCard.suspended ? <Badge variant="destructive">Suspended</Badge> : <Badge variant="outline">Active</Badge>}</div>
              <div><span className="text-muted-foreground">Subscription:</span> {userCard.subscriptionStatus || "None"}</div>
              <div className="col-span-2"><span className="text-muted-foreground">Joined:</span> {new Date(userCard.createdAt).toLocaleDateString()}</div>
              <div className="col-span-2"><span className="text-muted-foreground">Last seen:</span> {new Date(userCard.lastSignedIn).toLocaleDateString()}</div>
            </div>

            {userCard.violations && userCard.violations.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Violation History</p>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {userCard.violations.map((v: any) => (
                    <div key={v.id} className="text-xs p-1.5 bg-muted/50 rounded flex justify-between">
                      <span>{v.action}</span><span className="text-muted-foreground">{new Date(v.createdAt).toLocaleDateString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <Separator />
            <div className="flex flex-wrap gap-2">
              {userCard.suspended ? (
                <Button size="sm" variant="outline" onClick={() => unsuspendUser.mutate({ id: userCard.id })}><Play className="h-3 w-3 mr-1" /> Unsuspend</Button>
              ) : (
                <Button size="sm" variant="outline" onClick={() => suspendUser.mutate({ id: userCard.id })}><Pause className="h-3 w-3 mr-1" /> Suspend</Button>
              )}
              <p className="text-xs text-muted-foreground italic">Plan override: use Workspaces section</p>
              {userCard.role === "user" && <Button size="sm" variant="outline" onClick={() => setRole.mutate({ id: userCard.id, role: "support" })}><Shield className="h-3 w-3 mr-1" /> Make Support</Button>}
              {userCard.role === "support" && <Button size="sm" variant="outline" onClick={() => setRole.mutate({ id: userCard.id, role: "admin" })}><Shield className="h-3 w-3 mr-1" /> Make Admin</Button>}
              {(userCard.role === "support" || userCard.role === "admin") && <Button size="sm" variant="outline" onClick={() => setRole.mutate({ id: userCard.id, role: "user" })}>Demote to User</Button>}
              <Button size="sm" variant="destructive" onClick={() => { if (confirm(`Delete user "${userCard.name || userCard.email}"? This cannot be undone.`)) deleteUser.mutate({ id: userCard.id }); }}>
                <Trash2 className="h-3 w-3 mr-1" /> Delete
              </Button>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

// ============ LINKS ============
function LinksSection() {
  const utils = trpc.useUtils();
  const [query, setQuery] = useState("");
  const [showAnonymous, setShowAnonymous] = useState(false);
  const [statusFilter, setStatusFilter] = useState<"" | LinkStatus>("");

  const { data: linksList, isLoading, isError, error, refetch } = trpc.admin.searchLinks.useQuery({
    query: query || undefined,
    anonymous: showAnonymous || undefined,
  });

  const displayLinks = (linksList || []).filter(link => !statusFilter || getLinkStatus(link) === statusFilter);

  const disableLink = trpc.admin.disableLink.useMutation({ onSuccess: () => { utils.admin.searchLinks.invalidate(); utils.admin.getMetrics.invalidate(); toast.success("Link disabled"); } });
  const deleteLink = trpc.admin.deleteLink.useMutation({ onSuccess: () => { utils.admin.searchLinks.invalidate(); utils.admin.getMetrics.invalidate(); toast.success("Link deleted"); } });
  const cleanupExpired = trpc.admin.cleanupExpiredAnonymous.useMutation({ onSuccess: data => { utils.admin.searchLinks.invalidate(); utils.admin.getMetrics.invalidate(); toast.success(`Cleaned up ${data.count} expired anonymous links`); } });

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">Links & Content</h2>

      <div className="flex gap-2 flex-wrap">
        <Input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search by code, destination, or title..." className="max-w-sm" />
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as "" | LinkStatus)} className="text-sm border rounded-md px-3 py-1.5 bg-background">
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="paused">Paused</option>
          <option value="scheduled">Scheduled</option>
          <option value="expired">Expired</option>
          <option value="broken">Broken</option>
        </select>
        <Button variant={showAnonymous ? "default" : "outline"} size="sm" onClick={() => setShowAnonymous(!showAnonymous)}>
          {showAnonymous ? <EyeOff className="h-3.5 w-3.5 mr-1" /> : <Eye className="h-3.5 w-3.5 mr-1" />} Anonymous Only
        </Button>
        <Button variant="outline" size="sm" onClick={() => cleanupExpired.mutate()} disabled={cleanupExpired.isPending}>
          <RefreshCw className={`h-3.5 w-3.5 mr-1 ${cleanupExpired.isPending ? "animate-spin" : ""}`} /> Cleanup Expired
        </Button>
      </div>

      {isLoading && <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div>}
      {isError && <AdminQueryError title="Couldn't load links." error={error} onRetry={() => void refetch()} />}

      {!isLoading && !isError && (
        <div className="space-y-1.5">
          {displayLinks.map((link: any) => {
            const effectiveStatus = getLinkStatus(link);
            return (
              <Card key={link.id} className="p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">/r/{link.shortCode}</code>
                      <Badge variant="secondary" className={`text-[10px] ${getLinkStatusClass(effectiveStatus)}`}>{getLinkStatusLabel(effectiveStatus)}</Badge>
                      {link.userId === 0 && <Badge variant="outline" className="text-[10px]">Anonymous</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{link.destinationUrl}</p>
                    <div className="flex items-center gap-3 mt-0.5">
                      {link.title && <span className="text-xs text-muted-foreground truncate">{link.title}</span>}
                      {link.ownerName && <span className="text-xs text-muted-foreground">by {link.ownerName}</span>}
                      {link.expiresAt && <span className="text-xs text-muted-foreground">Expires: {new Date(link.expiresAt).toLocaleDateString()}</span>}
                    </div>
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    {effectiveStatus === "active" && (
                      <Button size="sm" variant="ghost" onClick={() => disableLink.mutate({ id: link.id })} title="Disable"><Pause className="h-3.5 w-3.5" /></Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => { if (confirm("Delete this link permanently?")) deleteLink.mutate({ id: link.id }); }} title="Delete">
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
          {displayLinks.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No links found.</p>}
        </div>
      )}
    </div>
  );
}

// ============ WORKSPACES ============
function WorkspacesSection() {
  const utils = trpc.useUtils();
  const [search, setSearch] = useState("");
  const [planFilter, setPlanFilter] = useState<string>("");

  const { data: workspacesList, isLoading, isError, error, refetch } = trpc.admin.listWorkspaces.useQuery({
    search: search || undefined,
    plan: (planFilter || undefined) as any,
  });

  const overridePlan = trpc.admin.overrideWorkspacePlan.useMutation({
    onSuccess: () => { utils.admin.listWorkspaces.invalidate(); toast.success("Workspace plan updated"); },
    onError: e => { console.error("[Admin] workspace plan override failed", e); toast.error("Couldn't update the workspace plan. Try again."); },
  });

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">Workspace Management</h2>

      <div className="flex gap-2">
        <Input placeholder="Search workspaces..." value={search} onChange={e => setSearch(e.target.value)} className="max-w-xs" />
        <select value={planFilter} onChange={e => setPlanFilter(e.target.value)} className="text-sm border rounded-md px-3 py-1.5 bg-background">
          <option value="">All plans</option><option value="free">Free</option><option value="starter">Starter</option><option value="pro">Pro</option><option value="team">Team</option>
        </select>
      </div>

      {isLoading && <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div>}
      {isError && <AdminQueryError title="Couldn't load workspaces." error={error} onRetry={() => void refetch()} />}

      {!isLoading && !isError && (
        <div className="space-y-2">
          {workspacesList?.map((ws: any) => (
            <Card key={ws.id} className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2"><span className="font-medium">{ws.name}</span><Badge variant="outline" className="text-xs">{ws.plan}</Badge></div>
                  <p className="text-xs text-muted-foreground mt-0.5">{ws.memberCount} member{ws.memberCount !== 1 ? "s" : ""} · {ws.projectCount} project{ws.projectCount !== 1 ? "s" : ""} · {ws.linkCount} link{ws.linkCount !== 1 ? "s" : ""}</p>
                </div>
                <div className="flex gap-1">
                  {(["free", "starter", "pro", "team"] as const).filter(p => p !== ws.plan).map(plan => (
                    <Button key={plan} size="sm" variant="ghost" className="text-xs" onClick={() => overridePlan.mutate({ workspaceId: ws.id, plan })}>→ {plan}</Button>
                  ))}
                </div>
              </div>
            </Card>
          ))}
          {workspacesList?.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No workspaces found.</p>}
        </div>
      )}
    </div>
  );
}

// ============ BILLING ============
function BillingSection() {
  const { data: metrics } = trpc.admin.getMetrics.useQuery();
  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">Billing Overview</h2>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <MetricCard label="MRR" value="$0" icon={CreditCard} accent />
        <MetricCard label="Pro Users" value={metrics?.proUsers || 0} icon={Crown} accent />
        <MetricCard label="Active Subs" value={metrics?.subscriptions?.active || 0} icon={CreditCard} />
        <MetricCard label="Past Due" value={metrics?.subscriptions?.pastDue || 0} icon={AlertTriangle} alert={(metrics?.subscriptions?.pastDue || 0) > 0} />
        <MetricCard label="Canceled" value={metrics?.subscriptions?.canceled || 0} icon={Ban} />
      </div>
      <Card className="p-5">
        <h3 className="font-medium mb-2">Stripe Integration</h3>
        <p className="text-sm text-muted-foreground mb-4">Stripe is not yet connected. Once you provide API keys in Settings → Integrations → Stripe, this section will show MRR, subscription details, and deep links to the Stripe Dashboard.</p>
        <div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => toast.info("Connect Stripe in Settings → Integrations to enable")}><ExternalLink className="h-3.5 w-3.5 mr-1" /> Open Stripe Dashboard</Button></div>
      </Card>
      <Card className="p-5">
        <h3 className="font-medium mb-2">Manual Plan Override</h3>
        <p className="text-sm text-muted-foreground mb-2">Use the Workspaces section to manually change a workspace plan. This is a local override and does not create a Stripe subscription.</p>
      </Card>
    </div>
  );
}

function PlanLimitRow({ plan, limits, onSave }: {
  plan: string;
  limits?: { projects?: number; links?: number; domains?: number; seats?: number; analyticsRetentionDays?: number; features?: Record<string, any>; };
  onSave: (v: any) => void;
}) {
  const [projects, setProjects] = useState("");
  const [linksVal, setLinksVal] = useState("");
  const [domainsVal, setDomainsVal] = useState("");
  const [seatsVal, setSeatsVal] = useState("");
  const [analyticsVal, setAnalyticsVal] = useState("");

  return (
    <tr className="border-b last:border-0">
      <td className="p-2 font-medium capitalize">{plan}</td>
      <td className="p-2 text-center"><Input type="number" className="w-16 text-center mx-auto" value={projects || String(limits?.projects ?? "")} onChange={e => setProjects(e.target.value)} /></td>
      <td className="p-2 text-center"><Input type="number" className="w-16 text-center mx-auto" value={linksVal || String(limits?.links ?? "")} onChange={e => setLinksVal(e.target.value)} /></td>
      <td className="p-2 text-center"><Input type="number" className="w-16 text-center mx-auto" value={domainsVal || String(limits?.domains ?? "")} onChange={e => setDomainsVal(e.target.value)} /></td>
      <td className="p-2 text-center"><Input type="number" className="w-16 text-center mx-auto" value={seatsVal || String(limits?.seats ?? "")} onChange={e => setSeatsVal(e.target.value)} /></td>
      <td className="p-2 text-center"><Input type="number" className="w-16 text-center mx-auto" value={analyticsVal || String(limits?.analyticsRetentionDays ?? "")} onChange={e => setAnalyticsVal(e.target.value)} /></td>
      <td className="p-2">
        <Button size="sm" variant="ghost" onClick={() => onSave({ projects: parseInt(projects) || limits?.projects || 1, links: parseInt(linksVal) || limits?.links || 5, domains: parseInt(domainsVal) || limits?.domains, seats: parseInt(seatsVal) || limits?.seats, analyticsRetentionDays: parseInt(analyticsVal) || limits?.analyticsRetentionDays })}>Save</Button>
      </td>
    </tr>
  );
}

// ============ CONFIG ============
function ConfigSection() {
  const utils = trpc.useUtils();
  const { data: settings } = trpc.admin.getSiteSettings.useQuery();
  const updateSettings = trpc.admin.updateSiteSettings.useMutation({ onSuccess: () => { utils.admin.getSiteSettings.invalidate(); toast.success("Settings saved"); } });
  const { data: planLimits } = trpc.admin.getPlanLimits.useQuery();
  const updatePlanLimits = trpc.admin.updatePlanLimits.useMutation({ onSuccess: () => { utils.admin.getPlanLimits.invalidate(); toast.success("Plan limits updated"); } });
  const [banner, setBanner] = useState("");
  const { data: customSlugs } = trpc.admin.getReservedSlugs.useQuery();
  const updateSlugs = trpc.admin.updateReservedSlugs.useMutation({ onSuccess: () => { utils.admin.getReservedSlugs.invalidate(); toast.success("Reserved slugs updated"); } });
  const [slugsText, setSlugsText] = useState("");
  const { data: backupInfo } = trpc.admin.getBackupInfo.useQuery();
  const exportBackup = trpc.admin.exportBackup.useMutation({
    onSuccess: data => {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `slugly-backup-${new Date().toISOString().split("T")[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Backup downloaded");
    },
    onError: err => toast.error(err.message),
  });

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">Configuration</h2>
      <Card className="p-5 space-y-4">
        <h3 className="font-medium">Global Settings</h3>
        <div className="flex items-center justify-between">
          <div><Label className="text-sm">IP Anonymization</Label><p className="text-xs text-muted-foreground">Hash IPs before storing (GDPR)</p></div>
          <Switch checked={settings?.ipAnonymization ?? false} onCheckedChange={checked => updateSettings.mutate({ ipAnonymization: checked })} />
        </div>
        <Separator />
        <div>
          <Label className="text-sm">Maintenance Banner</Label>
          <p className="text-xs text-muted-foreground mb-2">Show a banner to all users (leave empty to hide)</p>
          <div className="flex gap-2"><Input value={banner || settings?.maintenanceBanner || ""} onChange={e => setBanner(e.target.value)} placeholder="e.g. Scheduled maintenance at 3am UTC..." /><Button size="sm" onClick={() => updateSettings.mutate({ maintenanceBanner: banner })}>Save</Button></div>
        </div>
      </Card>

      <Card className="p-5 space-y-4">
        <h3 className="font-medium">Plan Configuration (4-Tier)</h3>
        <p className="text-xs text-muted-foreground">Edit limits for each plan. Use -1 for unlimited.</p>
        <div className="overflow-x-auto -mx-2 px-2">
          <table className="w-full text-sm min-w-[640px]">
            <thead className="border-b"><tr><th className="text-left p-2 font-medium">Plan</th><th className="text-center p-2 font-medium">Projects</th><th className="text-center p-2 font-medium">Links</th><th className="text-center p-2 font-medium">Domains</th><th className="text-center p-2 font-medium">Seats</th><th className="text-center p-2 font-medium">Analytics (days)</th><th className="p-2"></th></tr></thead>
            <tbody>{(["free", "starter", "pro", "team"] as const).map(plan => <PlanLimitRow key={plan} plan={plan} limits={planLimits?.[plan]} onSave={limits => updatePlanLimits.mutate({ plan, ...limits })} />)}</tbody>
          </table>
        </div>
      </Card>

      <Card className="p-5 space-y-3">
        <h3 className="font-medium">Custom Reserved Slugs</h3>
        <p className="text-xs text-muted-foreground">Additional slugs to block (one per line). System reserved slugs are always enforced.</p>
        <Textarea value={slugsText || (customSlugs || []).join("\n")} onChange={e => setSlugsText(e.target.value)} placeholder="promo\nspecial\nvip" rows={4} />
        <Button size="sm" onClick={() => updateSlugs.mutate({ slugs: (slugsText || "").split("\n").map(s => s.trim()).filter(Boolean) })}>Save Reserved Slugs</Button>
      </Card>

      <Card className="p-5 space-y-3">
        <h3 className="font-medium">Database Backup</h3>
        <p className="text-xs text-muted-foreground">Export all data as JSON.</p>
        {backupInfo?.lastBackupAt && <p className="text-xs text-muted-foreground">Last backup: {new Date(backupInfo.lastBackupAt).toLocaleString()}{backupInfo.lastBackupSize && ` (${(backupInfo.lastBackupSize / 1024 / 1024).toFixed(2)} MB)`}</p>}
        <Button size="sm" onClick={() => exportBackup.mutate()} disabled={exportBackup.isPending}>
          {exportBackup.isPending ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> Generating...</> : <><Download className="h-3.5 w-3.5 mr-1" /> Export Backup</>}
        </Button>
      </Card>
    </div>
  );
}

// ============ AUDIT LOG ============
function AuditSection() {
  const [actionFilter, setActionFilter] = useState("");
  const [actorFilter, setActorFilter] = useState("");
  const { data: logs } = trpc.admin.getAuditLog.useQuery({ action: actionFilter || undefined, limit: 100 });

  const uniqueActions = Array.from(new Set((logs || []).map((l: any) => l.action))).sort();
  const uniqueActors = Array.from(new Set((logs || []).map((l: any) => l.actorName || `User #${l.actorId}`).filter(Boolean))).sort();
  const filteredLogs = actorFilter ? (logs || []).filter((l: any) => (l.actorName || `User #${l.actorId}`) === actorFilter) : logs;

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">Audit Log</h2>
      <div className="flex gap-2 flex-wrap">
        <select value={actionFilter} onChange={e => setActionFilter(e.target.value)} className="text-sm border rounded-md px-3 py-1.5 bg-background"><option value="">All actions</option>{uniqueActions.map(a => <option key={a} value={a}>{a}</option>)}</select>
        <select value={actorFilter} onChange={e => setActorFilter(e.target.value)} className="text-sm border rounded-md px-3 py-1.5 bg-background"><option value="">All actors</option>{uniqueActors.map(a => <option key={a} value={a}>{a}</option>)}</select>
      </div>
      <div className="space-y-1">
        {filteredLogs?.map((entry: any) => (
          <div key={entry.id} className="flex items-start gap-3 p-2.5 bg-muted/30 rounded text-sm">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2"><Badge variant="outline" className="text-[10px] font-mono">{entry.action}</Badge><span className="text-xs text-muted-foreground">by {entry.actorName || `User #${entry.actorId}`}</span></div>
              {entry.targetType && <p className="text-xs text-muted-foreground mt-0.5">Target: {entry.targetType} {entry.targetId ? `#${entry.targetId}` : ""}{entry.metadata && <span className="ml-1">({JSON.stringify(entry.metadata)})</span>}</p>}
            </div>
            <span className="text-xs text-muted-foreground shrink-0">{new Date(entry.createdAt).toLocaleString()}</span>
          </div>
        ))}
        {!filteredLogs?.length && <p className="text-sm text-muted-foreground text-center py-4">No audit log entries yet.</p>}
      </div>
    </div>
  );
}

// ============ EMAIL SECTION ============
function EmailSection({ onNavigate }: { onNavigate?: (section: AdminSection) => void; }) {
  const { data: config, isLoading } = trpc.admin.getEmailConfig.useQuery();
  const utils = trpc.useUtils();
  const updateConfig = trpc.admin.updateEmailConfig.useMutation({ onSuccess: () => { utils.admin.getEmailConfig.invalidate(); toast.success("Email config updated"); }, onError: e => toast.error(e.message) });
  const sendTest = trpc.admin.sendTestEmail.useMutation({ onSuccess: r => r.success ? toast.success("Test email sent!") : toast.error(r.error || "Failed"), onError: e => toast.error(e.message) });
  const [testEmail, setTestEmail] = useState("");
  const [testTemplate, setTestTemplate] = useState<"invite" | "welcome" | "reportReceived" | "anonymousLinkExpiring" | "weeklyDigest">("welcome");

  if (isLoading || !config) return <div className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading...</div>;

  return (
    <div className="space-y-6">
      <div><h2 className="text-xl font-semibold">Email Configuration</h2><p className="text-sm text-muted-foreground mt-1">Manage email notifications sent by Slugly via Resend.</p></div>
      <Card className="p-4"><div className="flex items-center justify-between"><div><Label className="font-medium">Email Sending</Label><p className="text-xs text-muted-foreground">Master toggle for all outgoing emails</p></div><Switch checked={config.enabled} onCheckedChange={enabled => updateConfig.mutate({ enabled })} /></div></Card>
      <Card className="p-4 space-y-3">
        <h3 className="font-medium">Sender Identity</h3>
        <div className="grid grid-cols-2 gap-3">
          <div><Label className="text-xs">Sender Name</Label><Input defaultValue={config.senderName} onBlur={e => { if (e.target.value !== config.senderName) updateConfig.mutate({ senderName: e.target.value }); }} /></div>
          <div><Label className="text-xs">Sender Email</Label><Input defaultValue={config.senderEmail} onBlur={e => { if (e.target.value !== config.senderEmail) updateConfig.mutate({ senderEmail: e.target.value }); }} /></div>
        </div>
        <p className="text-xs text-muted-foreground">Note: Sender email must be verified in Resend or use onboarding@resend.dev for testing.</p>
      </Card>
      <Card className="p-4"><div className="flex items-center justify-between"><div><h3 className="font-medium">Email Templates</h3><p className="text-xs text-muted-foreground">Manage email content, enable/disable types, and preview templates in the Email Templates section.</p></div><Button variant="outline" size="sm" onClick={() => onNavigate?.("emailTemplates")}>Manage Templates</Button></div></Card>
      <Card className="p-4 space-y-3">
        <h3 className="font-medium">Send Test Email</h3>
        <div className="flex gap-2">
          <Input placeholder="recipient@example.com" value={testEmail} onChange={e => setTestEmail(e.target.value)} className="flex-1" />
          <select className="border rounded px-2 py-1 text-sm bg-background" value={testTemplate} onChange={e => setTestTemplate(e.target.value as any)}><option value="welcome">Welcome</option><option value="reportReceived">Report</option><option value="anonymousLinkExpiring">Link Expiring</option><option value="invite">Invite</option><option value="weeklyDigest">Digest</option></select>
          <Button size="sm" onClick={() => { if (testEmail) sendTest.mutate({ to: testEmail, templateType: testTemplate }); }} disabled={!testEmail || sendTest.isPending}><Send className="h-3 w-3 mr-1" />{sendTest.isPending ? "Sending..." : "Send"}</Button>
        </div>
      </Card>
      <Card className="p-4"><h3 className="font-medium mb-2">Integration Status</h3><div className="flex items-center gap-2"><div className={`h-2 w-2 rounded-full ${config.enabled ? "bg-green-500" : "bg-red-500"}`} /><span className="text-sm">{config.enabled ? "Active" : "Disabled"}</span></div><p className="text-xs text-muted-foreground mt-2">Provider: Resend • All config changes are logged to the audit log.</p></Card>
    </div>
  );
}

// ============ EMAIL TEMPLATES SECTION ============
function EmailTemplatesSection({ onNavigate }: { onNavigate?: (section: AdminSection) => void; }) {
  const { data: registry } = trpc.admin.getTemplateRegistry.useQuery();
  const { data: templates, isLoading } = trpc.admin.getAllTemplates.useQuery();
  const utils = trpc.useUtils();
  const [editingType, setEditingType] = useState<string | null>(null);
  const [editSubject, setEditSubject] = useState("");
  const [editBody, setEditBody] = useState("");
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);

  const saveMutation = trpc.admin.saveTemplate.useMutation({
    onSuccess: result => { utils.admin.getAllTemplates.invalidate(); if (result.warnings.length > 0) toast.warning(`Saved with warnings: ${result.warnings.join("; ")}`); else toast.success("Template saved"); setEditingType(null); setPreviewHtml(null); },
    onError: e => toast.error(e.message),
  });
  const previewMutation = trpc.admin.previewTemplate.useMutation({ onSuccess: result => setPreviewHtml(result.html), onError: e => toast.error(e.message) });
  const sendTestMutation = trpc.admin.sendTestEmail.useMutation({ onSuccess: r => r.success ? toast.success("Test email sent!") : toast.error(r.error || "Failed"), onError: e => toast.error(e.message) });
  const [testEmail, setTestEmail] = useState("");

  if (isLoading || !templates || !registry) return <div className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading templates...</div>;

  const startEditing = (type: string) => {
    const t = templates[type as keyof typeof templates];
    if (t) { setEditSubject(t.subject); setEditBody(t.bodyHtml); setEditingType(type); setPreviewHtml(null); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between"><div><h2 className="text-xl font-semibold">Email Templates</h2><p className="text-sm text-muted-foreground mt-1">Edit email content, placeholders, and enable/disable each type.</p></div><Button variant="outline" size="sm" onClick={() => onNavigate?.("email")}>← Back to Email Config</Button></div>
      {!editingType && (
        <div className="space-y-3">
          {registry.map(def => {
            const tmpl = templates[def.type as keyof typeof templates];
            return (
              <Card key={def.type} className="p-4"><div className="flex items-center justify-between"><div className="flex-1"><div className="flex items-center gap-2"><h3 className="font-medium text-sm">{def.label}</h3><span className={`text-xs px-1.5 py-0.5 rounded ${tmpl?.enabled ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>{tmpl?.enabled ? "Active" : "Disabled"}</span></div><p className="text-xs text-muted-foreground mt-0.5">{def.description}</p>{tmpl?.updatedBy && <p className="text-xs text-muted-foreground mt-1">Last edited by {tmpl.updatedBy} • {new Date(tmpl.updatedAt).toLocaleDateString()}</p>}</div><div className="flex items-center gap-2"><Switch checked={tmpl?.enabled ?? true} onCheckedChange={enabled => saveMutation.mutate({ type: def.type as any, enabled })} /><Button variant="outline" size="sm" onClick={() => startEditing(def.type)}>Edit</Button></div></div></Card>
            );
          })}
        </div>
      )}
      {editingType && (() => {
        const def = registry.find(d => d.type === editingType);
        if (!def) return null;
        return (
          <div className="space-y-4">
            <div className="flex items-center justify-between"><h3 className="font-medium">Editing: {def.label}</h3><Button variant="ghost" size="sm" onClick={() => { setEditingType(null); setPreviewHtml(null); }}>Cancel</Button></div>
            <Card className="p-3"><h4 className="text-xs font-medium mb-2 text-muted-foreground uppercase tracking-wide">Available Placeholders</h4><div className="flex flex-wrap gap-1.5">{def.placeholders.map(ph => <span key={ph.key} className={`text-xs px-2 py-0.5 rounded font-mono ${ph.required ? "bg-violet-100 text-violet-800 border border-violet-200" : "bg-muted text-muted-foreground"}`}>{`{${ph.key}}`}{ph.required && " *"}</span>)}</div><p className="text-xs text-muted-foreground mt-2">* = required (template won't save cleanly without these)</p></Card>
            <div><Label className="text-sm">Subject Line</Label><Input value={editSubject} onChange={e => setEditSubject(e.target.value)} className="mt-1 font-mono text-sm" /></div>
            <div><Label className="text-sm">Body (HTML)</Label><textarea value={editBody} onChange={e => setEditBody(e.target.value)} className="mt-1 w-full h-64 p-3 border rounded-md font-mono text-xs bg-background resize-y" /></div>
            <div className="flex items-center gap-2">
              <Button onClick={() => saveMutation.mutate({ type: editingType as any, subject: editSubject, bodyHtml: editBody })} disabled={saveMutation.isPending}>{saveMutation.isPending ? "Saving..." : "Save Template"}</Button>
              <Button variant="outline" onClick={() => previewMutation.mutate({ type: editingType as any, subject: editSubject, bodyHtml: editBody })} disabled={previewMutation.isPending}>{previewMutation.isPending ? "Rendering..." : "Preview"}</Button>
              <div className="flex-1" /><Input placeholder="test@example.com" value={testEmail} onChange={e => setTestEmail(e.target.value)} className="w-48" />
              <Button variant="outline" size="sm" onClick={() => { if (testEmail) sendTestMutation.mutate({ to: testEmail, templateType: editingType as any }); }} disabled={!testEmail || sendTestMutation.isPending}>{sendTestMutation.isPending ? "Sending..." : "Send Test"}</Button>
            </div>
            {previewHtml && <Card className="p-0 overflow-hidden"><div className="bg-muted px-3 py-2 border-b flex items-center justify-between"><span className="text-xs font-medium">Preview</span><Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setPreviewHtml(null)}>Close</Button></div><iframe srcDoc={previewHtml} className="w-full h-96 border-0" sandbox="allow-same-origin" title="Email Preview" /></Card>}
          </div>
        );
      })()}
    </div>
  );
}

// ============ NOTIFICATIONS SECTION ============
function NotificationsSection() {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState<"system" | "update" | "promo" | "alert">("system");
  const [audienceType, setAudienceType] = useState<"all" | "plan" | "role" | "workspace" | "users">("all");
  const [audienceValue, setAudienceValue] = useState("");
  const { data: sentNotifications, isLoading } = trpc.notification.adminList.useQuery();
  const utils = trpc.useUtils();

  const broadcast = trpc.notification.broadcast.useMutation({
    onSuccess: data => { toast.success(`Notification sent to ${data.recipientCount} users`); setTitle(""); setBody(""); setCategory("system"); setAudienceType("all"); setAudienceValue(""); utils.notification.adminList.invalidate(); },
    onError: err => toast.error(err.message),
  });

  const handleSend = () => {
    if (!title.trim() || !body.trim()) { toast.error("Title and body are required"); return; }
    broadcast.mutate({
      title: title.trim(), body: body.trim(), category,
      audience: {
        type: audienceType,
        value: audienceType !== "all" && audienceType !== "users" ? audienceValue : undefined,
        userIds: audienceType === "users" ? audienceValue.split(",").map(s => parseInt(s.trim())).filter(n => !isNaN(n)) : undefined,
      },
    });
  };

  return (
    <div className="space-y-6">
      <div><h2 className="text-xl font-semibold flex items-center gap-2"><Megaphone className="h-5 w-5" /> Send Notification</h2><p className="text-sm text-muted-foreground mt-1">Broadcast a notification to users.</p></div>
      <Card className="p-5 space-y-4">
        <div className="space-y-2"><Label>Title</Label><Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Notification title..." maxLength={255} /></div>
        <div className="space-y-2"><Label>Body</Label><Textarea value={body} onChange={e => setBody(e.target.value)} placeholder="Notification body..." rows={3} maxLength={2000} /></div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2"><Label>Category</Label><select value={category} onChange={e => setCategory(e.target.value as any)} className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"><option value="system">System</option><option value="update">Update</option><option value="promo">Promo</option><option value="alert">Alert</option></select></div>
          <div className="space-y-2"><Label>Audience</Label><select value={audienceType} onChange={e => setAudienceType(e.target.value as any)} className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"><option value="all">All Users</option><option value="plan">By Plan</option><option value="role">By Role</option><option value="workspace">By Workspace</option><option value="users">Specific Users (IDs)</option></select></div>
        </div>
        {audienceType !== "all" && <div className="space-y-2"><Label>{audienceType === "plan" && "Plan (free/starter/pro/team)"}{audienceType === "role" && "Role (user/admin)"}{audienceType === "workspace" && "Workspace ID"}{audienceType === "users" && "User IDs (comma-separated)"}</Label><Input value={audienceValue} onChange={e => setAudienceValue(e.target.value)} placeholder={audienceType === "plan" ? "pro" : audienceType === "role" ? "admin" : audienceType === "workspace" ? "1" : "1, 2, 3"} /></div>}
        <Button onClick={handleSend} disabled={broadcast.isPending || !title.trim() || !body.trim()}>{broadcast.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}Send Notification</Button>
      </Card>
      <Separator />
      <div>
        <h3 className="text-lg font-semibold mb-3">Sent Notifications</h3>
        {isLoading ? <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div> : !sentNotifications || sentNotifications.length === 0 ? <p className="text-sm text-muted-foreground text-center py-8">No notifications sent yet.</p> : (
          <div className="space-y-2">{sentNotifications.map(n => <Card key={n.id} className="p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="flex items-center gap-2"><p className="font-medium text-sm truncate">{n.title}</p><Badge variant="secondary" className="text-[10px] shrink-0">{n.category}</Badge></div><p className="text-xs text-muted-foreground mt-1 line-clamp-2">{n.body}</p></div><span className="text-[10px] text-muted-foreground whitespace-nowrap">{new Date(n.createdAt).toLocaleDateString()}</span></div></Card>)}</div>
        )}
      </div>
    </div>
  );
}

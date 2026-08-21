import { useAuth } from "@/_core/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import {
  Activity,
  AlertTriangle,
  Bell,
  CreditCard,
  Eye,
  Globe,
  LayoutDashboard,
  Link2,
  Loader2,
  Mail,
  Megaphone,
  Pause,
  RefreshCw,
  ScrollText,
  Search,
  Settings,
  Shield,
  UserX,
  Users,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

type Section = "dashboard" | "abuse" | "users" | "links" | "workspaces" | "billing" | "config" | "email" | "emailTemplates" | "notifications" | "audit";

const NAV: Array<{ id: Section; label: string; icon: React.ElementType }> = [
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

function ErrorCard({ onRetry }: { onRetry?: () => void }) {
  return (
    <Card className="border-destructive/30 bg-destructive/5 p-5">
      <div className="flex items-center gap-3">
        <AlertTriangle className="h-5 w-5 text-destructive" />
        <div className="flex-1">
          <p className="font-medium">Couldn&apos;t load this section</p>
          <p className="text-sm text-muted-foreground">Try again in a moment.</p>
        </div>
        {onRetry && <Button variant="outline" size="sm" onClick={onRetry}><RefreshCw className="mr-1 h-3.5 w-3.5" />Retry</Button>}
      </div>
    </Card>
  );
}

export default function SupportAdminPanel() {
  const { user, loading } = useAuth();
  const [section, setSection] = useState<Section>("dashboard");
  const [, setLocation] = useLocation();

  if (loading) return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  if (!user || user.role !== "support") {
    return <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Support access required.</div>;
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 flex h-14 items-center gap-3 bg-[#14152B] px-5 text-white">
        <button className="flex items-center gap-2.5" onClick={() => setLocation("/dashboard")}>
          <img src="/assets/slugly-logo.svg" alt="Slugly" className="h-6 w-6" />
          <span className="text-[17px] font-extrabold">Slugly</span>
        </button>
        <span className="rounded-md bg-blue-500 px-2 py-0.5 text-[10px] font-extrabold tracking-[0.08em]">SUPPORT</span>
        <Badge variant="secondary" className="hidden sm:inline-flex">Restricted permissions</Badge>
        <button className="ml-auto text-sm text-[#C9C9DA] hover:text-white" onClick={() => setLocation("/dashboard")}>← Back to app</button>
      </header>

      <div className="grid min-h-[calc(100vh-56px)] md:grid-cols-[228px_minmax(0,1fr)]">
        <aside className="hidden border-r bg-card px-3 py-4 md:block">
          <nav className="sticky top-[70px] space-y-1">
            {NAV.map(item => (
              <button key={item.id} onClick={() => setSection(item.id)} className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold ${section === item.id ? "bg-[#EDEBFB] text-[#4A2FE0]" : "text-muted-foreground hover:bg-accent"}`}>
                <item.icon className="h-4 w-4" />{item.label}
              </button>
            ))}
          </nav>
        </aside>
        <main className="min-w-0 px-4 py-6 sm:px-7">
          <div className="mb-5 flex gap-1 overflow-x-auto md:hidden">
            {NAV.map(item => <Button key={item.id} size="sm" variant={section === item.id ? "default" : "outline"} onClick={() => setSection(item.id)}><item.icon className="mr-1 h-3.5 w-3.5" />{item.label}</Button>)}
          </div>
          <div className="mx-auto max-w-[1180px]">
            {section === "dashboard" && <Dashboard />}
            {section === "abuse" && <Abuse />}
            {section === "users" && <UsersView />}
            {section === "links" && <LinksView />}
            {section === "workspaces" && <WorkspacesView />}
            {section === "billing" && <BillingView />}
            {section === "config" && <ConfigView />}
            {section === "email" && <EmailView />}
            {section === "emailTemplates" && <EmailTemplatesView />}
            {section === "notifications" && <NotificationsView />}
            {section === "audit" && <AuditView />}
          </div>
        </main>
      </div>
    </div>
  );
}

function Dashboard() {
  const query = trpc.admin.getMetrics.useQuery();
  if (query.isLoading) return <Loader />;
  if (query.isError || !query.data) return <ErrorCard onRetry={() => void query.refetch()} />;
  const m = query.data;
  const cards = [
    ["Total users", m.totalUsers], ["Total links", m.totalLinks], ["Active links", m.activeLinks],
    ["Broken links", m.brokenLinks ?? 0], ["Expired links", m.expiredLinks ?? 0], ["Open reports", m.openReports],
    ["Suspended users", m.suspendedUsers], ["Clicks today", m.clicksToday],
  ];
  return <Section title="Dashboard" subtitle="Read-only platform overview"><div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{cards.map(([label, value]) => <Card key={String(label)} className="p-4"><p className="text-xs uppercase text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-bold">{String(value)}</p></Card>)}</div></Section>;
}

function Abuse() {
  const utils = trpc.useUtils();
  const reports = trpc.admin.getReports.useQuery({});
  const blocked = trpc.admin.getBlockedDomains.useQuery();
  const updateReport = trpc.admin.updateReport.useMutation({ onSuccess: () => void utils.admin.getReports.invalidate() });
  const disableLink = trpc.admin.disableLink.useMutation({ onSuccess: () => toast.success("Link paused") });
  const banUser = trpc.admin.banUser.useMutation({ onSuccess: () => toast.success("User blocked") });
  if (reports.isLoading) return <Loader />;
  if (reports.isError) return <ErrorCard onRetry={() => void reports.refetch()} />;
  return <Section title="Abuse & Trust" subtitle="Support may review reports and apply reversible trust & safety actions">
    <div className="space-y-3">
      {(reports.data || []).map((r: any) => <Card key={r.id} className="p-4"><div className="flex flex-wrap items-start gap-3"><div className="min-w-0 flex-1"><code className="text-sm">/r/{r.shortCode}</code><Badge className="ml-2" variant={r.status === "pending" ? "destructive" : "secondary"}>{r.status}</Badge><p className="mt-2 text-sm text-muted-foreground">{r.reason || "No reporter reason"}</p></div>{r.status === "pending" && <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => updateReport.mutate({ id: r.id, status: "dismissed" })}>Dismiss</Button><Button size="sm" variant="destructive" onClick={() => { disableLink.mutate({ id: r.linkId || 0 }); updateReport.mutate({ id: r.id, status: "actioned" }); }}><Pause className="mr-1 h-3.5 w-3.5" />Pause link</Button>{r.userId > 0 && <Button size="sm" variant="destructive" onClick={() => { banUser.mutate({ id: r.userId }); updateReport.mutate({ id: r.id, status: "actioned" }); }}><UserX className="mr-1 h-3.5 w-3.5" />Block owner</Button>}</div>}</div></Card>)}
      {!reports.data?.length && <Card className="p-6 text-center text-sm text-muted-foreground">No reports in queue.</Card>}
      <Card className="p-4"><h3 className="text-sm font-semibold">Blocked domains</h3><div className="mt-2 space-y-1 text-sm">{blocked.data?.map((d: any) => <div key={d.id}><code>{d.hostname}</code>{d.reason ? <span className="text-muted-foreground"> — {d.reason}</span> : null}</div>)}</div></Card>
    </div>
  </Section>;
}

function UsersView() {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<number | null>(null);
  const users = trpc.admin.searchUsers.useQuery({ search: search || undefined });
  const card = trpc.admin.getUserCard.useQuery({ id: selected! }, { enabled: !!selected });
  const utils = trpc.useUtils();
  const suspend = trpc.admin.suspendUser.useMutation({ onSuccess: () => { void utils.admin.searchUsers.invalidate(); void utils.admin.getUserCard.invalidate(); toast.success("User suspended"); } });
  const unsuspend = trpc.admin.unsuspendUser.useMutation({ onSuccess: () => { void utils.admin.searchUsers.invalidate(); void utils.admin.getUserCard.invalidate(); toast.success("User restored"); } });
  const userCard = card.data;

  const viewAs = async (targetUserId: number, email?: string | null) => {
    const reason = window.prompt(`Reason for viewing as ${email || `user #${targetUserId}`}?\n\nThe session is read-only, lasts 30 minutes, and is fully audited.`)?.trim();
    if (!reason || reason.length < 3) return;
    const response = await fetch("/api/impersonation/start", {
      method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetUserId, reason }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return toast.error(data?.error || "Could not start View as user");
    window.location.href = "/dashboard";
  };

  return <Section title="Users" subtitle="Read user details or enter a 30-minute read-only support view">
    <Input className="mb-4 max-w-sm" placeholder="Search name or email…" value={search} onChange={e => setSearch(e.target.value)} />
    <div className="grid gap-4 lg:grid-cols-2"><Card className="max-h-[520px] overflow-y-auto p-2">{users.data?.map((u: any) => <button key={u.id} onClick={() => setSelected(u.id)} className={`flex w-full items-center justify-between rounded p-3 text-left ${selected === u.id ? "bg-accent" : "hover:bg-muted/50"}`}><div className="min-w-0"><p className="truncate text-sm font-medium">{u.name || "Anonymous"}</p><p className="truncate text-xs text-muted-foreground">{u.email || "No email"}</p></div><Badge variant={u.suspended ? "destructive" : "secondary"}>{u.role}</Badge></button>)}</Card>
      {userCard ? <Card className="p-5"><h3 className="font-semibold">{userCard.name || "Anonymous"}</h3><p className="text-sm text-muted-foreground">{userCard.email}</p><div className="mt-4 grid grid-cols-2 gap-2 text-sm"><span>Plan: {userCard.plan}</span><span>Role: {userCard.role}</span><span>Links: {userCard.linkCount}</span><span>Projects: {userCard.projectCount}</span></div><div className="mt-5 flex flex-wrap gap-2">{userCard.role === "user" && <Button onClick={() => void viewAs(userCard.id, userCard.email)}><Eye className="mr-1.5 h-4 w-4" />View as user</Button>}{userCard.suspended ? <Button variant="outline" onClick={() => unsuspend.mutate({ id: userCard.id })}>Unsuspend</Button> : <Button variant="destructive" onClick={() => suspend.mutate({ id: userCard.id })}><UserX className="mr-1.5 h-4 w-4" />Suspend</Button>}</div></Card> : <Card className="flex items-center justify-center p-8 text-sm text-muted-foreground">Select a user</Card>}
    </div>
  </Section>;
}

function LinksView() {
  const [search, setSearch] = useState("");
  const utils = trpc.useUtils();
  const links = trpc.admin.searchLinks.useQuery({ query: search || undefined });
  const pause = trpc.admin.disableLink.useMutation({ onSuccess: () => { void utils.admin.searchLinks.invalidate(); toast.success("Link paused"); } });
  return <Section title="Links" subtitle="Search and pause links; permanent deletion is admin-only"><Input className="mb-4 max-w-sm" placeholder="Slug, destination or owner…" value={search} onChange={e => setSearch(e.target.value)} /><div className="space-y-2">{links.data?.map((l: any) => <Card key={l.id} className="flex items-center gap-3 p-3"><div className="min-w-0 flex-1"><code className="text-xs">/r/{l.shortCode}</code><p className="truncate text-xs text-muted-foreground">{l.destinationUrl}</p></div><Badge variant="outline">{l.effectiveStatus || l.status}</Badge>{l.status !== "paused" && <Button size="sm" variant="outline" onClick={() => pause.mutate({ id: l.id })}><Pause className="mr-1 h-3.5 w-3.5" />Pause</Button>}</Card>)}</div></Section>;
}

function WorkspacesView() {
  const q = trpc.admin.listWorkspaces.useQuery({});
  if (q.isLoading) return <Loader />;
  return <Section title="Workspaces" subtitle="Read-only workspace usage"><div className="space-y-2">{q.data?.map((w: any) => <Card key={w.id} className="grid grid-cols-2 gap-2 p-4 text-sm sm:grid-cols-5"><strong className="col-span-2 sm:col-span-1">{w.name}</strong><span>{w.plan}</span><span>{w.memberCount} members</span><span>{w.projectCount} projects</span><span>{w.linkCount} links</span></Card>)}</div></Section>;
}

function BillingView() {
  const q = trpc.admin.listWorkspaces.useQuery({});
  return <Section title="Billing" subtitle="Read-only plan overview — plan override is admin-only"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{q.data?.map((w: any) => <Card key={w.id} className="p-4"><p className="font-medium">{w.name}</p><Badge className="mt-2" variant="secondary">{w.plan}</Badge><p className="mt-2 text-xs text-muted-foreground">{w.linkCount} links · {w.memberCount} members</p></Card>)}</div></Section>;
}

function ConfigView() {
  const site = trpc.admin.getSiteSettings.useQuery();
  const plans = trpc.admin.getPlanConfigs.useQuery();
  return <Section title="Config" subtitle="Read-only system and plan configuration"><Card className="mb-4 p-4"><p className="text-sm">Safe mode: <b>{site.data?.safeMode ? "On" : "Off"}</b></p><p className="text-sm">IP anonymization: <b>{site.data?.ipAnonymization ? "On" : "Off"}</b></p></Card><pre className="overflow-auto rounded-lg bg-muted p-4 text-xs">{JSON.stringify(plans.data || {}, null, 2)}</pre></Section>;
}

function EmailView() {
  const q = trpc.admin.getEmailConfig.useQuery();
  return <Section title="Email Settings" subtitle="Read-only — email configuration is admin-only"><Card className="p-4 text-sm"><p>Enabled: <b>{q.data?.enabled ? "Yes" : "No"}</b></p><p>Sender: {q.data?.senderName} &lt;{q.data?.senderEmail}&gt;</p></Card></Section>;
}

function EmailTemplatesView() {
  const q = trpc.admin.getAllTemplates.useQuery();
  return <Section title="Email Templates" subtitle="Read-only — support cannot save or send templates"><div className="grid gap-3 md:grid-cols-2">{Object.entries(q.data || {}).map(([key, value]: any) => <Card key={key} className="p-4"><Badge variant="outline">{key}</Badge><p className="mt-2 text-sm font-medium">{value.subject}</p><p className="mt-1 text-xs text-muted-foreground">{value.enabled ? "Enabled" : "Disabled"}</p></Card>)}</div></Section>;
}

function NotificationsView() {
  const q = trpc.notification.adminList.useQuery();
  return <Section title="Notifications" subtitle="Sent notifications — broadcast is admin-only"><div className="space-y-2">{q.data?.map((n: any) => <Card key={n.id} className="p-4"><p className="font-medium">{n.title}</p><p className="mt-1 text-sm text-muted-foreground">{n.body}</p></Card>)}</div></Section>;
}

function AuditView() {
  const [action, setAction] = useState("");
  const q = trpc.admin.getAuditLog.useQuery({ action: action || undefined, limit: 100 });
  const rows = useMemo(() => q.data || [], [q.data]);
  return <Section title="Audit Log" subtitle="Read-only security and administrative history"><Input className="mb-4 max-w-sm" placeholder="Filter action…" value={action} onChange={e => setAction(e.target.value)} /><div className="space-y-1.5">{rows.map((row: any) => <Card key={row.id} className="p-3 text-xs"><div className="flex flex-wrap gap-2"><Badge variant="outline">{row.action}</Badge><span>{row.actorName || `#${row.actorId}`}</span><span className="text-muted-foreground">{new Date(row.createdAt).toLocaleString()}</span></div><p className="mt-1 text-muted-foreground">{row.targetType}:{row.targetId || "—"}</p></Card>)}</div></Section>;
}

function Section({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return <div className="space-y-5"><div><h1 className="text-2xl font-extrabold">{title}</h1><p className="mt-1 text-sm text-muted-foreground">{subtitle}</p></div>{children}</div>;
}
function Loader() { return <div className="flex justify-center py-16"><Loader2 className="h-5 w-5 animate-spin" /></div>; }

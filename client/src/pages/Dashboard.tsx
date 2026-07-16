import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { getLoginUrl } from "@/const";
import { trackEvent } from "@/lib/analytics";
import {
  FolderOpen,
  Plus,
  Link2,
  MousePointerClick,
  ArrowRight,
  Loader2,
  Zap,
  BarChart3,
  Lock,
} from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";
import AppShell from "@/components/AppShell";
import { OnboardingChecklist } from "@/components/OnboardingChecklist";
import { UpsellDialog, parseLimitError } from "@/components/UpsellDialog";
import { toast } from "sonner";
import Sluggo from "@/components/Sluggo";

function MiniSparkline({
  data,
  color,
}: {
  data: Array<{ day: string; count: number }>;
  color: string;
}) {
  if (data.length < 2) return null;
  const maxCount = Math.max(...data.map(d => d.count), 1);
  const width = 120;
  const height = 32;
  const padding = 2;
  const points = data
    .map((d, i) => {
      const x = padding + (i / (data.length - 1)) * (width - padding * 2);
      const y =
        height - padding - (d.count / maxCount) * (height - padding * 2);
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg
      width={width}
      height={height}
      className="w-full"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
    >
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function Dashboard() {
  const { user, loading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newColor, setNewColor] = useState("#5A3FF0");

  const { data: projects, isLoading } = trpc.project.list.useQuery(undefined, {
    enabled: !!user,
  });
  const { data: billing } = trpc.billing.status.useQuery(undefined, {
    enabled: !!user,
  });
  const utils = trpc.useUtils();
  const [upsellError, setUpsellError] = useState<any>(null);
  const [upsellOpen, setUpsellOpen] = useState(false);

  const createProject = trpc.project.create.useMutation({
    onSuccess: () => {
      utils.project.list.invalidate();
      utils.billing.status.invalidate();
      setCreateOpen(false);
      setNewName("");
      setNewDesc("");
      trackEvent("project_created");
    },
    onError: err => {
      const limitErr = parseLimitError(err.message);
      if (limitErr) {
        setUpsellError(limitErr);
        setUpsellOpen(true);
      } else {
        toast.error(err.message);
      }
    },
  });

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) {
    window.location.href = getLoginUrl();
    return null;
  }

  const hasProjects = projects && projects.length > 0;
  const hasLinks = (billing?.usage?.links ?? 0) > 0;
  const totalClicks = projects?.reduce((sum, p) => sum + p.totalClicks, 0) ?? 0;
  const firstName =
    user.name?.trim().split(/\s+/)[0] || user.email?.split("@")[0] || "there";

  // Onboarding steps for new users
  const onboardingSteps = [
    {
      label: "Create your first project",
      done: !!hasProjects,
      href: undefined,
    },
    {
      label: "Shorten a link",
      done: hasLinks,
      href: hasProjects ? `/create?project=${projects![0]?.id}` : undefined,
    },
    { label: "Get your first click", done: totalClicks > 0, href: undefined },
  ];

  return (
    <AppShell>
      <div className="slugly-greeting">
        <Sluggo className="slugly-mascot-wave h-[58px] w-[62px] shrink-0" />
        <div>
          <h1>Welcome back, {firstName}</h1>
          <p>
            Sluggo kept an eye on things — here&apos;s where your campaigns
            stand.
          </p>
        </div>
      </div>

      {/* Workspace summary */}
      {billing && (
        <div className="mb-7 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Card className="slugly-stat-card p-[15px_18px]">
            <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-[#9A9AB2]">
              Projects
            </p>
            <p className="mt-1.5 text-[28px] font-extrabold">
              {billing.usage?.projects ?? 0}
              <span className="font-mono text-[13px] font-medium text-muted-foreground">
                /
                {billing.planConfig?.limits?.projects === -1
                  ? "∞"
                  : (billing.planConfig?.limits?.projects ?? "∞")}
              </span>
            </p>
          </Card>
          <Card className="slugly-stat-card p-[15px_18px]">
            <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-[#9A9AB2]">
              Links
            </p>
            <p className="mt-1.5 text-[28px] font-extrabold">
              {billing.usage?.links ?? 0}
              <span className="font-mono text-[13px] font-medium text-muted-foreground">
                /
                {billing.planConfig?.limits?.links === -1
                  ? "∞"
                  : (billing.planConfig?.limits?.links ?? "∞")}
              </span>
            </p>
          </Card>
          <Card className="slugly-stat-card p-[15px_18px]">
            <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-[#9A9AB2]">
              Clicks (7d)
            </p>
            <p className="mt-1.5 text-[28px] font-extrabold">
              {totalClicks.toLocaleString()}
            </p>
          </Card>
          <Card className="slugly-stat-card p-[15px_18px]">
            <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-[#9A9AB2]">
              Plan
            </p>
            <p className="mt-1.5 text-[22px] font-extrabold capitalize text-[#4A2FE0]">
              {billing.plan ?? "free"}
            </p>
            <span className="mt-1.5 inline-block rounded-full bg-[#EAF6F1] px-2 py-0.5 text-[11px] font-bold text-[#1FB57A]">
              Active
            </span>
          </Card>
        </div>
      )}

      <div className="mb-[18px] flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-[25px] font-extrabold tracking-tight">
            Projects
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Organize your links by campaign or client
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setLocation("/compare")}>
            <BarChart3 className="h-4 w-4 mr-2" />
            Compare
          </Button>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                New Project
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Project</DialogTitle>
              </DialogHeader>
              <form
                onSubmit={e => {
                  e.preventDefault();
                  createProject.mutate({
                    name: newName,
                    description: newDesc || undefined,
                    color: newColor,
                  });
                }}
                className="space-y-4 mt-2"
              >
                <div className="space-y-2">
                  <Label>Name</Label>
                  <Input
                    value={newName}
                    onChange={e => setNewName(e.target.value)}
                    placeholder="Q4 Campaign"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Description (optional)</Label>
                  <Textarea
                    value={newDesc}
                    onChange={e => setNewDesc(e.target.value)}
                    placeholder="Links for the Q4 marketing push"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Color</Label>
                  <div className="flex gap-2 items-center">
                    <input
                      type="color"
                      value={newColor}
                      onChange={e => setNewColor(e.target.value)}
                      className="h-9 w-12 rounded border cursor-pointer"
                    />
                    <span className="text-sm text-muted-foreground">
                      {newColor}
                    </span>
                  </div>
                </div>
                <Button
                  type="submit"
                  className="w-full"
                  disabled={createProject.isPending || !newName.trim()}
                >
                  {createProject.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : null}
                  Create Project
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Onboarding checklist for new users */}
      {!isLoading && (billing?.usage?.links ?? 0) === 0 && (
        <OnboardingChecklist
          steps={onboardingSteps}
          title="Quick start guide"
          subtitle="Complete these steps to start tracking your links"
        />
      )}

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <Card key={i} className="p-6 animate-pulse">
              <div className="h-4 bg-muted rounded w-1/2 mb-3" />
              <div className="h-3 bg-muted rounded w-3/4" />
            </Card>
          ))}
        </div>
      ) : hasProjects ? (
        <div className="grid grid-cols-1 gap-[18px] md:grid-cols-2 lg:grid-cols-3">
          {projects.map(project => (
            <Card
              key={project.id}
              className="slugly-project-card group cursor-pointer border-l-4 p-5"
              style={{ borderLeftColor: project.color }}
              onClick={() => setLocation(`/project/${project.id}`)}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-bold transition-colors group-hover:text-primary">
                    {project.name}
                  </h3>
                  {project.isSystem && (
                    <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
              {project.description && (
                <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
                  {project.description}
                </p>
              )}
              {/* Sparkline */}
              {project.sparkline && project.sparkline.length > 0 && (
                <div className="mb-3">
                  <MiniSparkline
                    data={project.sparkline}
                    color={project.color}
                  />
                </div>
              )}
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <Link2 className="h-3.5 w-3.5" />
                  {project.linkCount} links
                </span>
                <span className="flex items-center gap-1.5">
                  <MousePointerClick className="h-3.5 w-3.5" />
                  {project.totalClicks.toLocaleString()} clicks
                </span>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        /* Enhanced empty state for first-time users */
        <div className="flex flex-col items-center py-14">
          <Sluggo variant="link" className="mb-2 h-32 w-36" />
          <h3 className="font-semibold text-xl mb-2">Welcome to Slugly</h3>
          <p className="text-muted-foreground text-center max-w-md mb-8">
            Projects help you organize links by campaign, client, or channel.
            Create your first project to start shortening and tracking links.
          </p>

          <Button
            size="lg"
            onClick={() => setCreateOpen(true)}
            className="mb-8"
          >
            <Plus className="h-4 w-4 mr-2" />
            Create Your First Project
          </Button>

          {/* Feature highlights */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-2xl w-full">
            <div className="flex flex-col items-center text-center p-4 rounded-lg bg-muted/50">
              <Zap className="h-5 w-5 text-primary mb-2" />
              <span className="text-xs font-medium">Instant Shortening</span>
              <span className="text-xs text-muted-foreground mt-0.5">
                Paste a URL, get a short link
              </span>
            </div>
            <div className="flex flex-col items-center text-center p-4 rounded-lg bg-muted/50">
              <BarChart3 className="h-5 w-5 text-primary mb-2" />
              <span className="text-xs font-medium">Click Analytics</span>
              <span className="text-xs text-muted-foreground mt-0.5">
                Track countries, devices, referrers
              </span>
            </div>
            <div className="flex flex-col items-center text-center p-4 rounded-lg bg-muted/50">
              <Link2 className="h-5 w-5 text-primary mb-2" />
              <span className="text-xs font-medium">UTM Builder</span>
              <span className="text-xs text-muted-foreground mt-0.5">
                Campaign tracking built in
              </span>
            </div>
          </div>
        </div>
      )}

      <UnassignedLinksBlock />

      <UpsellDialog
        error={upsellError}
        open={upsellOpen}
        onOpenChange={setUpsellOpen}
      />
    </AppShell>
  );
}

function UnassignedLinksBlock() {
  const [, setLocation] = useLocation();
  const { data: unassigned, isLoading } =
    trpc.link.unassigned.useQuery(undefined);

  if (isLoading || !unassigned || unassigned.length === 0) return null;

  return (
    <div className="mt-6 grid gap-[18px] lg:grid-cols-[1.6fr_1fr]">
      <Card className="p-5">
        <h2 className="mb-2 flex items-center gap-2 text-base font-bold">
          <Link2 className="h-4 w-4 text-muted-foreground" />
          Links without projects
        </h2>
        <div>
          {unassigned.slice(0, 10).map(link => (
            <button
              key={link.id}
              className="flex w-full items-center justify-between gap-4 border-b border-border py-2.5 text-left last:border-0 hover:text-primary"
              onClick={() => setLocation(`/link/${link.id}/analytics`)}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <code className="text-sm font-mono text-primary">
                    /r/{link.shortCode}
                  </code>
                  {link.title && (
                    <span className="text-sm text-muted-foreground truncate">
                      — {link.title}
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground truncate mt-0.5">
                  {link.destinationUrl}
                </p>
              </div>
              <span className="text-sm font-medium ml-4 whitespace-nowrap">
                {link.clickCount.toLocaleString()} clicks
              </span>
            </button>
          ))}
          {unassigned.length > 10 && (
            <p className="text-sm text-muted-foreground text-center py-2">
              +{unassigned.length - 10} more unassigned links
            </p>
          )}
        </div>
      </Card>
      <div className="slugly-tip flex min-h-[210px] flex-col p-[22px]">
        <Sluggo variant="white" className="relative z-10 h-[74px] w-[78px]" />
        <h3 className="relative z-10 mt-1 text-[17px] font-extrabold">
          {unassigned.length}{" "}
          {unassigned.length === 1 ? "link has" : "links have"} no home
        </h3>
        <p className="relative z-10 mt-1.5 text-[13.5px] text-white/90">
          Sluggo spotted links outside a project. Organize them to keep campaign
          reporting clean.
        </p>
        <Button
          variant="outline"
          className="relative z-10 mt-3.5 w-fit border-0 bg-white text-[#4A2FE0]"
          onClick={() => setLocation(`/link/${unassigned[0].id}/analytics`)}
        >
          Organize links
        </Button>
      </div>
    </div>
  );
}

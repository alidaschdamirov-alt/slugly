import { useAuth } from "@/_core/hooks/useAuth";
import AppShell from "@/components/AppShell";
import EditLinkDialog, { type EditLinkDialogPayload } from "@/components/EditLinkDialog";
import LinkGridCard from "@/components/LinkGridCard";
import { QrCodeDialog } from "@/components/QrCodeDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { getLoginUrl } from "@/const";
import { getEffectiveStatusClass, getEffectiveStatusLabel } from "@/lib/linkStatus";
import { trpc } from "@/lib/trpc";
import {
  ArrowLeft,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  Copy,
  ExternalLink,
  Filter,
  LayoutGrid,
  List,
  Loader2,
  Pencil,
  Plus,
  QrCode,
  RefreshCw,
  Search,
  Settings,
  ShieldAlert,
  Tag,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState, type MouseEvent } from "react";
import { toast } from "sonner";
import { useLocation, useParams } from "wouter";

type EffectiveStatus = "active" | "paused" | "scheduled" | "expired" | "broken" | "quarantine";
type SortField = "createdAt" | "clicks" | "shortCode";
type SortDir = "asc" | "desc";

type PagedLink = {
  id: number;
  userId: number;
  projectId: number | null;
  destinationUrl: string;
  shortCode: string;
  title: string | null;
  tags: string[] | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmTerm: string | null;
  utmContent: string | null;
  domainId: number | null;
  status: string;
  activeFrom: number | null;
  expiresAt: number | null;
  createdAt: string;
  updatedAt: string;
  effectiveStatus: EffectiveStatus;
  quarantineReason: string | null;
  clickCount: number;
};

type PageResponse = {
  projectId: number;
  items: PagedLink[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pageCount: number;
    hasPreviousPage: boolean;
    hasNextPage: boolean;
  };
  filters: {
    allTags: string[];
    search: string;
    tag: string | null;
    status: EffectiveStatus | null;
    sortField: SortField;
    sortDir: SortDir;
  };
};

function readApiError(response: Response, fallback: string) {
  return response.json().catch(() => ({})).then(data => data?.error || fallback);
}

export default function ProjectViewPaginated() {
  const { user, loading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const params = useParams<{ id: string }>();
  const projectId = Number(params.id || 0);

  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [tagFilter, setTagFilter] = useState("all");
  const [sortField, setSortField] = useState<SortField>("createdAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(1);
  const [pageData, setPageData] = useState<PageResponse | null>(null);
  const [pageLoading, setPageLoading] = useState(false);
  const [pageError, setPageError] = useState("");
  const [reloadToken, setReloadToken] = useState(0);

  const [editProjectOpen, setEditProjectOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editColor, setEditColor] = useState("#5A3FF0");
  const [deleteProjectOpen, setDeleteProjectOpen] = useState(false);

  const [editLinkOpen, setEditLinkOpen] = useState(false);
  const [editLinkRecord, setEditLinkRecord] = useState<PagedLink | null>(null);
  const [deleteLinkRecord, setDeleteLinkRecord] = useState<PagedLink | null>(null);
  const [qrLink, setQrLink] = useState<PagedLink | null>(null);

  const { data: project, isLoading: projectLoading } = trpc.project.get.useQuery(
    { id: projectId },
    { enabled: !!user && projectId > 0 }
  );
  const { data: projectOptions } = trpc.project.list.useQuery(undefined, { enabled: !!user });
  const { data: domainsData } = trpc.domain.list.useQuery(undefined, { enabled: !!user });
  const utils = trpc.useUtils();

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, statusFilter, tagFilter, sortField, sortDir]);

  useEffect(() => {
    if (!user || !project || projectId <= 0) return;
    const controller = new AbortController();
    const query = new URLSearchParams({
      page: String(page),
      limit: "50",
      sortField,
      sortDir,
    });
    if (debouncedSearch) query.set("search", debouncedSearch);
    if (statusFilter !== "all") query.set("status", statusFilter);
    if (tagFilter !== "all") query.set("tag", tagFilter);

    setPageLoading(true);
    setPageError("");
    fetch(`/api/project-links/${projectId}?${query.toString()}`, {
      credentials: "include",
      signal: controller.signal,
    })
      .then(async response => {
        if (!response.ok) throw new Error(await readApiError(response, "Failed to load project links"));
        return response.json() as Promise<PageResponse>;
      })
      .then(result => {
        setPageData(result);
        if (result.pagination.page !== page) setPage(result.pagination.page);
      })
      .catch(error => {
        if (error?.name !== "AbortError") setPageError(error?.message || "Failed to load project links");
      })
      .finally(() => {
        if (!controller.signal.aborted) setPageLoading(false);
      });
    return () => controller.abort();
  }, [user, project, projectId, page, debouncedSearch, statusFilter, tagFilter, sortField, sortDir, reloadToken]);

  const links = pageData?.items || [];
  const pageLinkIds = useMemo(() => links.map(link => link.id), [links]);
  const { data: sparklines } = trpc.link.sparklines.useQuery(
    { linkIds: pageLinkIds, days: 7 },
    { enabled: pageLinkIds.length > 0 }
  );

  const reloadPage = () => setReloadToken(value => value + 1);

  const updateProject = trpc.project.update.useMutation({
    onSuccess: () => {
      utils.project.get.invalidate({ id: projectId });
      utils.project.list.invalidate();
      setEditProjectOpen(false);
      toast.success("Project updated");
    },
    onError: error => toast.error(error.message),
  });

  const deleteProject = trpc.project.delete.useMutation({
    onSuccess: () => {
      utils.project.list.invalidate();
      toast.success("Project deleted; links moved to Other Links");
      setLocation("/dashboard");
    },
    onError: error => toast.error(error.message),
  });

  const updateLink = trpc.link.update.useMutation({
    onSuccess: () => {
      setEditLinkOpen(false);
      setEditLinkRecord(null);
      reloadPage();
      utils.project.list.invalidate();
      utils.tag.list.invalidate();
      toast.success("Link updated");
    },
    onError: error => toast.error(error.message),
  });

  const toggleStatus = trpc.link.update.useMutation({
    onSuccess: () => {
      reloadPage();
      toast.success("Status updated");
    },
    onError: error => toast.error(error.message),
  });

  const deleteLink = trpc.link.delete.useMutation({
    onSuccess: () => {
      setDeleteLinkRecord(null);
      reloadPage();
      utils.project.list.invalidate();
      utils.tag.list.invalidate();
      toast.success("Link deleted");
    },
    onError: error => toast.error(error.message),
  });

  if (authLoading) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }
  if (!user) {
    window.location.href = getLoginUrl();
    return null;
  }
  if (projectLoading) return <ProjectViewSkeleton />;
  if (!project) {
    return (
      <AppShell>
        <Button variant="ghost" onClick={() => setLocation("/dashboard")}><ArrowLeft className="mr-2 h-4 w-4" />Back to Projects</Button>
        <div className="mt-6 rounded-lg border border-dashed p-10 text-center text-muted-foreground">Project not found.</div>
      </AppShell>
    );
  }

  const openProjectEdit = () => {
    setEditName(project.name);
    setEditDesc(project.description || "");
    setEditColor(project.color || "#5A3FF0");
    setEditProjectOpen(true);
  };

  const qrUrlFor = (link: PagedLink) => {
    const customDomain = link.domainId
      ? (domainsData || []).find((domain: any) => domain.id === link.domainId && domain.verified)
      : null;
    return customDomain ? `https://${customDomain.hostname}/${link.shortCode}` : `${window.location.origin}/r/${link.shortCode}`;
  };

  const filtersActive = !!debouncedSearch || statusFilter !== "all" || tagFilter !== "all";
  const total = pageData?.pagination.total ?? 0;
  const pageCount = pageData?.pagination.pageCount ?? 1;

  return (
    <AppShell>
      <div className="mb-6">
        <button onClick={() => setLocation("/dashboard")} className="mb-4 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to Projects
        </button>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <span className="h-3 w-3 rounded-full" style={{ backgroundColor: project.color || "#5A3FF0" }} />
              <h1 className="text-2xl font-semibold tracking-tight">{project.name}</h1>
              {!project.isSystem && (
                <button onClick={openProjectEdit} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Edit project"><Settings className="h-4 w-4" /></button>
              )}
            </div>
            {project.description && <p className="mt-2 text-sm text-muted-foreground">{project.description}</p>}
            <p className="mt-1 text-xs text-muted-foreground">{total.toLocaleString()} matching link{total === 1 ? "" : "s"} · 50 per page</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => setLocation(`/project/${projectId}/analytics`)}><BarChart3 className="mr-1.5 h-4 w-4" />Analytics</Button>
            {!project.isSystem && <Button variant="outline" size="sm" className="text-destructive" onClick={() => setDeleteProjectOpen(true)}><Trash2 className="mr-1.5 h-4 w-4" />Delete Project</Button>}
            <Button size="sm" onClick={() => setLocation(`/create?project=${projectId}`)}><Plus className="mr-1.5 h-4 w-4" />Add Link</Button>
          </div>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1 sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search links..." className="pl-9" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[165px]"><Filter className="mr-1.5 h-3.5 w-3.5" /><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="paused">Paused</SelectItem>
            <SelectItem value="scheduled">Scheduled</SelectItem>
            <SelectItem value="expired">Expired</SelectItem>
            <SelectItem value="broken">Broken</SelectItem>
            <SelectItem value="quarantine">Quarantine</SelectItem>
          </SelectContent>
        </Select>
        {(pageData?.filters.allTags.length || 0) > 0 && (
          <Select value={tagFilter} onValueChange={setTagFilter}>
            <SelectTrigger className="w-[150px]"><Tag className="mr-1.5 h-3.5 w-3.5" /><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Tags</SelectItem>
              {pageData!.filters.allTags.map(tag => <SelectItem key={tag} value={tag}>{tag}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        <Select value={`${sortField}-${sortDir}`} onValueChange={value => {
          const [field, direction] = value.split("-") as [SortField, SortDir];
          setSortField(field);
          setSortDir(direction);
        }}>
          <SelectTrigger className="w-[165px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="createdAt-desc">Newest First</SelectItem>
            <SelectItem value="createdAt-asc">Oldest First</SelectItem>
            <SelectItem value="clicks-desc">Most Clicks</SelectItem>
            <SelectItem value="clicks-asc">Fewest Clicks</SelectItem>
            <SelectItem value="shortCode-asc">Short code A–Z</SelectItem>
          </SelectContent>
        </Select>
        <div className="ml-auto flex items-center rounded-md border">
          <button onClick={() => setViewMode("grid")} className={`p-2 ${viewMode === "grid" ? "bg-accent" : "text-muted-foreground"}`} aria-label="Grid view"><LayoutGrid className="h-4 w-4" /></button>
          <button onClick={() => setViewMode("table")} className={`p-2 ${viewMode === "table" ? "bg-accent" : "text-muted-foreground"}`} aria-label="Table view"><List className="h-4 w-4" /></button>
        </div>
      </div>

      {pageError ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-8 text-center">
          <p className="font-medium">Couldn’t load project links</p>
          <p className="mt-1 text-sm text-muted-foreground">{pageError}</p>
          <Button variant="outline" className="mt-4" onClick={reloadPage}><RefreshCw className="mr-2 h-4 w-4" />Retry</Button>
        </div>
      ) : pageLoading && !pageData ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : links.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center">
          <p className="font-medium">{filtersActive ? "No links match these filters" : "No links in this project yet"}</p>
          <p className="mt-1 text-sm text-muted-foreground">{filtersActive ? "Change the search or filters to see more links." : "Create your first short link for this project."}</p>
          {!filtersActive && <Button className="mt-4" onClick={() => setLocation(`/create?project=${projectId}`)}><Plus className="mr-2 h-4 w-4" />Add Link</Button>}
        </div>
      ) : viewMode === "grid" ? (
        <div className={`grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 ${pageLoading ? "opacity-60" : ""}`}>
          {links.map(link => (
            <LinkGridCard
              key={link.id}
              link={{ ...link, quarantined: link.effectiveStatus === "quarantine" }}
              sparklineData={sparklines?.[link.id] || []}
              onClick={() => setLocation(`/link/${link.id}/analytics`)}
              onEdit={() => { setEditLinkRecord(link); setEditLinkOpen(true); }}
              onToggleStatus={(event: MouseEvent) => {
                event.stopPropagation();
                if (link.effectiveStatus === "quarantine") return;
                toggleStatus.mutate({ id: link.id, status: link.status === "active" ? "paused" : "active" });
              }}
              onDelete={(event: MouseEvent) => { event.stopPropagation(); setDeleteLinkRecord(link); }}
              onQr={(event: MouseEvent) => { event.stopPropagation(); setQrLink(link); }}
            />
          ))}
        </div>
      ) : (
        <div className={`overflow-x-auto rounded-lg border ${pageLoading ? "opacity-60" : ""}`}>
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground"><tr><th className="p-3 text-left">Short link</th><th className="p-3 text-left">Destination</th><th className="p-3 text-left">Status</th><th className="p-3 text-right">Clicks</th><th className="p-3 text-right">Actions</th></tr></thead>
            <tbody>
              {links.map(link => (
                <tr key={link.id} className="border-t hover:bg-muted/30">
                  <td className="p-3"><button onClick={() => setLocation(`/link/${link.id}/analytics`)} className="font-mono font-medium text-primary hover:underline">/r/{link.shortCode}</button>{link.title && <div className="mt-1 max-w-[220px] truncate text-xs text-muted-foreground">{link.title}</div>}</td>
                  <td className="p-3"><div className="flex max-w-[380px] items-center gap-1.5 truncate text-muted-foreground">{link.effectiveStatus === "quarantine" ? <ShieldAlert className="h-3.5 w-3.5 shrink-0 text-destructive" /> : <ExternalLink className="h-3.5 w-3.5 shrink-0" />}<span className="truncate">{link.destinationUrl}</span></div></td>
                  <td className="p-3"><Badge variant="secondary" className={`border-0 ${getEffectiveStatusClass(link.effectiveStatus)}`}>{getEffectiveStatusLabel(link.effectiveStatus)}</Badge></td>
                  <td className="p-3 text-right font-mono">{link.clickCount.toLocaleString()}</td>
                  <td className="p-3"><div className="flex justify-end gap-1"><Button size="icon" variant="ghost" onClick={() => navigator.clipboard.writeText(`${window.location.origin}/r/${link.shortCode}`).then(() => toast.success("Copied!"))}><Copy className="h-4 w-4" /></Button><Button size="icon" variant="ghost" onClick={() => setQrLink(link)}><QrCode className="h-4 w-4" /></Button><Button size="icon" variant="ghost" onClick={() => { setEditLinkRecord(link); setEditLinkOpen(true); }}><Pencil className="h-4 w-4" /></Button><Button size="icon" variant="ghost" className="text-destructive" onClick={() => setDeleteLinkRecord(link)}><Trash2 className="h-4 w-4" /></Button></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pageData && pageData.pagination.total > 0 && (
        <div className="mt-5 flex flex-col items-center justify-between gap-3 rounded-lg border bg-card px-4 py-3 sm:flex-row">
          <p className="text-sm text-muted-foreground">Showing {(pageData.pagination.page - 1) * pageData.pagination.limit + 1}–{Math.min(pageData.pagination.page * pageData.pagination.limit, pageData.pagination.total)} of {pageData.pagination.total.toLocaleString()}</p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={!pageData.pagination.hasPreviousPage || pageLoading} onClick={() => setPage(value => Math.max(1, value - 1))}><ChevronLeft className="mr-1 h-4 w-4" />Previous</Button>
            <span className="min-w-[110px] text-center text-sm">Page {pageData.pagination.page} of {pageCount}</span>
            <Button variant="outline" size="sm" disabled={!pageData.pagination.hasNextPage || pageLoading} onClick={() => setPage(value => Math.min(pageCount, value + 1))}>Next<ChevronRight className="ml-1 h-4 w-4" /></Button>
          </div>
        </div>
      )}

      <Dialog open={editProjectOpen} onOpenChange={setEditProjectOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Project</DialogTitle><DialogDescription>Update the project name, description, and color. Links remain unchanged.</DialogDescription></DialogHeader>
          <div className="space-y-4">
            <div><Label htmlFor="project-name">Name</Label><Input id="project-name" value={editName} onChange={event => setEditName(event.target.value)} /></div>
            <div><Label htmlFor="project-description">Description</Label><Textarea id="project-description" value={editDesc} onChange={event => setEditDesc(event.target.value)} /></div>
            <div><Label htmlFor="project-color">Color</Label><Input id="project-color" type="color" value={editColor} onChange={event => setEditColor(event.target.value)} className="h-10 w-20 p-1" /></div>
            <Button className="w-full" disabled={!editName.trim() || updateProject.isPending} onClick={() => updateProject.mutate({ id: projectId, name: editName.trim(), description: editDesc, color: editColor })}>{updateProject.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save Project</Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteProjectOpen} onOpenChange={setDeleteProjectOpen}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Delete project?</AlertDialogTitle><AlertDialogDescription>The project will be removed, but its links will be moved to the system “Other Links” project. No link or click history will be deleted.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction className="bg-destructive text-destructive-foreground" onClick={() => deleteProject.mutate({ id: projectId, mode: "move" })}>Delete Project</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <EditLinkDialog
        open={editLinkOpen}
        onOpenChange={open => { setEditLinkOpen(open); if (!open) setEditLinkRecord(null); }}
        link={editLinkRecord}
        projects={projectOptions}
        isPending={updateLink.isPending}
        onSubmit={(payload: EditLinkDialogPayload) => updateLink.mutate(payload)}
      />

      <AlertDialog open={!!deleteLinkRecord} onOpenChange={open => { if (!open) setDeleteLinkRecord(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Delete link?</AlertDialogTitle><AlertDialogDescription>This removes /r/{deleteLinkRecord?.shortCode} and its click history. This action cannot be undone from the project view.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction className="bg-destructive text-destructive-foreground" disabled={deleteLink.isPending} onClick={() => deleteLinkRecord && deleteLink.mutate({ id: deleteLinkRecord.id })}>Delete Link</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {qrLink && (
        <QrCodeDialog
          open={!!qrLink}
          onOpenChange={open => { if (!open) setQrLink(null); }}
          url={qrUrlFor(qrLink)}
          title={qrLink.shortCode}
          isBroken={qrLink.effectiveStatus === "broken"}
          isQuarantined={qrLink.effectiveStatus === "quarantine"}
          quarantineReason={qrLink.quarantineReason || undefined}
          onEditDestination={() => {
            setEditLinkRecord(qrLink);
            setQrLink(null);
            setEditLinkOpen(true);
          }}
        />
      )}
    </AppShell>
  );
}

function ProjectViewSkeleton() {
  return (
    <AppShell>
      <div className="animate-pulse space-y-5">
        <div className="h-5 w-32 rounded bg-muted" />
        <div className="h-9 w-64 rounded bg-muted" />
        <div className="flex gap-3"><div className="h-10 flex-1 rounded bg-muted" /><div className="h-10 w-40 rounded bg-muted" /></div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }).map((_, index) => <div key={index} className="h-52 rounded-xl bg-muted" />)}</div>
      </div>
    </AppShell>
  );
}

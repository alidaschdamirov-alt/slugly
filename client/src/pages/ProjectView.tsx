import { useAuth } from "@/_core/hooks/useAuth";
import AppShell from "@/components/AppShell";
import EditLinkDialog, { type EditLinkDialogPayload } from "@/components/EditLinkDialog";
import LinkGridCard from "@/components/LinkGridCard";
import { QrCodeDialog } from "@/components/QrCodeDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { getLoginUrl } from "@/const";
import {
  getEffectiveLinkStatus,
  getEffectiveStatusClass,
  getEffectiveStatusLabel,
} from "@/lib/linkStatus";
import { trpc } from "@/lib/trpc";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  ArrowUpDown,
  BarChart3,
  Check,
  Copy,
  Filter,
  LayoutGrid,
  List,
  Loader2,
  Pencil,
  Plus,
  QrCode,
  Search,
  Settings,
  Tag,
  Trash2,
} from "lucide-react";
import { useMemo, useState, type MouseEvent } from "react";
import { useLocation, useParams } from "wouter";
import { toast } from "sonner";

type SortField = "clicks" | "createdAt" | "shortCode";
type SortDir = "asc" | "desc";

export default function ProjectView() {
  const { user, loading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const params = useParams<{ id: string }>();
  const projectId = parseInt(params.id || "0", 10);

  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [tagFilter, setTagFilter] = useState("all");
  const [sortField, setSortField] = useState<SortField>("createdAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const [editProjectOpen, setEditProjectOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editColor, setEditColor] = useState("#5A3FF0");
  const [deleteProjectOpen, setDeleteProjectOpen] = useState(false);
  const [deleteMode, setDeleteMode] = useState<"cascade" | "move">("cascade");

  const [editLinkOpen, setEditLinkOpen] = useState(false);
  const [editLinkRecord, setEditLinkRecord] = useState<any | null>(null);
  const [deleteLinkOpen, setDeleteLinkOpen] = useState(false);
  const [deleteLinkId, setDeleteLinkId] = useState<number | null>(null);
  const [qrOpen, setQrOpen] = useState(false);
  const [qrCode, setQrCode] = useState("");
  const [qrUrl, setQrUrl] = useState("");

  const { data: project, isLoading: projectLoading } = trpc.project.get.useQuery(
    { id: projectId },
    { enabled: !!user && projectId > 0 }
  );
  const { data: links, isLoading: linksLoading } = trpc.link.list.useQuery(
    { projectId },
    { enabled: !!user && projectId > 0 && !!project }
  );
  const { data: projectOptions } = trpc.project.list.useQuery(undefined, { enabled: !!user });
  const { data: domainsData } = trpc.domain.list.useQuery(undefined, { enabled: !!user });
  const utils = trpc.useUtils();

  const updateProject = trpc.project.update.useMutation({
    onSuccess: () => {
      utils.project.get.invalidate({ id: projectId });
      utils.project.list.invalidate();
      setEditProjectOpen(false);
      toast.success("Project updated");
    },
    onError: err => toast.error(err.message),
  });

  const deleteProject = trpc.project.delete.useMutation({
    onSuccess: () => {
      utils.project.list.invalidate();
      setDeleteProjectOpen(false);
      toast.success("Project deleted");
      setLocation("/dashboard");
    },
    onError: err => toast.error(err.message),
  });

  const updateLink = trpc.link.update.useMutation({
    onSuccess: () => {
      utils.link.list.invalidate();
      utils.project.list.invalidate();
      utils.tag.list.invalidate();
      setEditLinkOpen(false);
      setEditLinkRecord(null);
      toast.success("Link updated");
    },
    onError: err => toast.error(err.message),
  });

  const deleteLink = trpc.link.delete.useMutation({
    onSuccess: () => {
      utils.link.list.invalidate();
      utils.tag.list.invalidate();
      setDeleteLinkOpen(false);
      toast.success("Link deleted (short code retired)");
    },
    onError: err => toast.error(err.message),
  });

  const toggleStatus = trpc.link.update.useMutation({
    onSuccess: () => utils.link.list.invalidate(),
    onError: err => toast.error(err.message),
  });

  const filteredAndSortedLinks = useMemo(() => {
    if (!links) return [];
    let result = [...links];

    if (statusFilter !== "all") {
      result = result.filter(link => getEffectiveLinkStatus(link) === statusFilter);
    }

    if (tagFilter !== "all") {
      result = result.filter(link => Array.isArray(link.tags) && link.tags.includes(tagFilter));
    }

    if (search.trim()) {
      const query = search.toLowerCase();
      result = result.filter(link =>
        link.shortCode.toLowerCase().includes(query) ||
        link.destinationUrl.toLowerCase().includes(query) ||
        (link.title && link.title.toLowerCase().includes(query)) ||
        (link.utmSource && link.utmSource.toLowerCase().includes(query)) ||
        (link.utmCampaign && link.utmCampaign.toLowerCase().includes(query))
      );
    }

    result.sort((a, b) => {
      let cmp = 0;
      if (sortField === "clicks") cmp = a.clickCount - b.clickCount;
      if (sortField === "createdAt") cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      if (sortField === "shortCode") cmp = a.shortCode.localeCompare(b.shortCode);
      return sortDir === "desc" ? -cmp : cmp;
    });

    return result;
  }, [links, search, statusFilter, tagFilter, sortField, sortDir]);

  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    for (const link of links || []) {
      if (Array.isArray(link.tags)) {
        link.tags.forEach(tag => tagSet.add(tag));
      }
    }
    return Array.from(tagSet).sort();
  }, [links]);

  const linkIds = useMemo(() => filteredAndSortedLinks.map(link => link.id), [filteredAndSortedLinks]);
  const { data: sparklines } = trpc.link.sparklines.useQuery(
    { linkIds, days: 7 },
    { enabled: linkIds.length > 0 }
  );

  if (authLoading) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  if (!user) {
    window.location.href = getLoginUrl();
    return null;
  }

  if (projectLoading) {
    return <ProjectViewSkeleton />;
  }

  if (!project) {
    return (
      <AppShell>
        <button onClick={() => setLocation("/dashboard")} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6">
          <ArrowLeft className="h-4 w-4" />
          Back to Projects
        </button>
        <div className="rounded-lg border border-dashed p-10 text-center text-muted-foreground">Project not found.</div>
      </AppShell>
    );
  }

  const openEditProjectDialog = () => {
    setEditName(project.name);
    setEditDesc(project.description || "");
    setEditColor(project.color);
    setEditProjectOpen(true);
  };

  const handleToggleStatus = (link: any, event: MouseEvent) => {
    event.stopPropagation();
    toggleStatus.mutate({ id: link.id, status: link.status === "active" ? "paused" : "active" });
  };

  const openQrDialog = (shortCode: string, domainId: number | null | undefined, event: MouseEvent) => {
    event.stopPropagation();
    const linkDomain = domainId ? (domainsData || []).find((domain: any) => domain.id === domainId && domain.verified) : null;
    setQrCode(shortCode);
    setQrUrl(linkDomain ? `https://${linkDomain.hostname}/${shortCode}` : `${window.location.origin}/r/${shortCode}`);
    setQrOpen(true);
  };

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(direction => (direction === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  };

  const filtersActive = Boolean(search.trim()) || statusFilter !== "all" || tagFilter !== "all";
  const linkCount = links?.length ?? 0;

  return (
    <AppShell>
      <div className="mb-6">
        <button onClick={() => setLocation("/dashboard")} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4">
          <ArrowLeft className="h-4 w-4" />
          Back to Projects
        </button>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="h-3 w-3 rounded-full" style={{ backgroundColor: project.color }} />
            <h1 className="text-2xl font-semibold tracking-tight">{project.name}</h1>
            {!project.isSystem && (
              <button onClick={openEditProjectDialog} className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground" aria-label="Edit project">
                <Settings className="h-4 w-4" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={() => setLocation(`/project/${projectId}/analytics`)}>
              <BarChart3 className="h-4 w-4 mr-1.5" />
              Analytics
            </Button>
            {!project.isSystem && (
              <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={() => setDeleteProjectOpen(true)}>
                <Trash2 className="h-4 w-4 mr-1.5" />
                Delete
              </Button>
            )}
            <Button size="sm" onClick={() => setLocation(`/create?project=${projectId}`)}>
              <Plus className="h-4 w-4 mr-1.5" />
              Add Link
            </Button>
          </div>
        </div>

        {project.description && <p className="text-muted-foreground mt-2">{project.description}</p>}
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search links..." className="pl-9" />
        </div>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[150px]"><Filter className="h-3.5 w-3.5 mr-1.5" /><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="paused">Paused</SelectItem>
            <SelectItem value="scheduled">Scheduled</SelectItem>
            <SelectItem value="expired">Expired</SelectItem>
          </SelectContent>
        </Select>

        {allTags.length > 0 && (
          <Select value={tagFilter} onValueChange={setTagFilter}>
            <SelectTrigger className="w-[140px]"><Tag className="h-3.5 w-3.5 mr-1.5" /><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Tags</SelectItem>
              {allTags.map(tag => <SelectItem key={tag} value={tag}>{tag}</SelectItem>)}
            </SelectContent>
          </Select>
        )}

        <Select
          value={`${sortField}-${sortDir}`}
          onValueChange={value => {
            const [field, direction] = value.split("-");
            setSortField(field as SortField);
            setSortDir(direction as SortDir);
          }}
        >
          <SelectTrigger className="w-[160px]"><ArrowUpDown className="h-3.5 w-3.5 mr-1.5" /><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="createdAt-desc">Newest First</SelectItem>
            <SelectItem value="createdAt-asc">Oldest First</SelectItem>
            <SelectItem value="clicks-desc">Most Clicks</SelectItem>
            <SelectItem value="clicks-asc">Fewest Clicks</SelectItem>
            <SelectItem value="shortCode-asc">A-Z</SelectItem>
          </SelectContent>
        </Select>

        <div className="flex items-center border rounded-md ml-auto">
          <button onClick={() => setViewMode("grid")} className={`p-2 transition-colors ${viewMode === "grid" ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"}`} aria-label="Grid view"><LayoutGrid className="h-4 w-4" /></button>
          <button onClick={() => setViewMode("table")} className={`p-2 transition-colors ${viewMode === "table" ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"}`} aria-label="Table view"><List className="h-4 w-4" /></button>
        </div>
      </div>

      {linksLoading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : filteredAndSortedLinks.length === 0 ? (
        <ProjectEmptyState
          filtersActive={filtersActive}
          onClearFilters={() => {
            setSearch("");
            setStatusFilter("all");
            setTagFilter("all");
          }}
          onCreate={() => setLocation(`/create?project=${projectId}`)}
        />
      ) : viewMode === "grid" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {filteredAndSortedLinks.map(link => (
            <LinkGridCard
              key={link.id}
              link={link}
              sparklineData={sparklines?.[link.id]}
              onClick={() => setLocation(`/link/${link.id}/analytics`)}
              onEdit={() => {
                setEditLinkRecord(link);
                setEditLinkOpen(true);
              }}
              onToggleStatus={event => handleToggleStatus(link, event)}
              onDelete={event => {
                event.stopPropagation();
                setDeleteLinkId(link.id);
                setDeleteLinkOpen(true);
              }}
              onQr={event => openQrDialog(link.shortCode, link.domainId, event)}
            />
          ))}
        </div>
      ) : (
        <LinksTable
          links={filteredAndSortedLinks}
          onClickLink={id => setLocation(`/link/${id}/analytics`)}
          onEditLink={link => {
            setEditLinkRecord(link);
            setEditLinkOpen(true);
          }}
          onToggleStatus={handleToggleStatus}
          onDeleteLink={(id, event) => {
            event.stopPropagation();
            setDeleteLinkId(id);
            setDeleteLinkOpen(true);
          }}
          onQr={openQrDialog}
          sortField={sortField}
          sortDir={sortDir}
          onSort={toggleSort}
        />
      )}

      <Dialog open={editProjectOpen} onOpenChange={setEditProjectOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Project</DialogTitle></DialogHeader>
          <form
            onSubmit={event => {
              event.preventDefault();
              updateProject.mutate({ id: projectId, name: editName, description: editDesc || undefined, color: editColor });
            }}
            className="space-y-4 mt-2"
          >
            <div className="space-y-2"><Label>Name</Label><Input value={editName} onChange={event => setEditName(event.target.value)} required /></div>
            <div className="space-y-2"><Label>Description</Label><Textarea value={editDesc} onChange={event => setEditDesc(event.target.value)} /></div>
            <div className="space-y-2">
              <Label>Color</Label>
              <div className="flex gap-2 items-center">
                <input type="color" value={editColor} onChange={event => setEditColor(event.target.value)} className="h-9 w-12 rounded border cursor-pointer" />
                <span className="text-sm text-muted-foreground">{editColor}</span>
              </div>
            </div>
            <Button type="submit" className="w-full" disabled={updateProject.isPending || !editName.trim()}>
              {updateProject.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Save Changes
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteProjectOpen} onOpenChange={setDeleteProjectOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Project</AlertDialogTitle>
            <AlertDialogDescription>
              This project contains <strong>{linkCount}</strong> link{linkCount !== 1 ? "s" : ""}. Choose how to handle them:
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3 my-2">
            <label className="flex items-start gap-3 p-3 border rounded-lg cursor-pointer hover:bg-muted/50 transition-colors">
              <input type="radio" name="deleteMode" value="cascade" checked={deleteMode === "cascade"} onChange={() => setDeleteMode("cascade")} className="mt-0.5" />
              <div><p className="font-medium text-sm">Delete everything</p><p className="text-xs text-muted-foreground">Delete the project and all its links. Short codes will be permanently retired.</p></div>
            </label>
            <label className="flex items-start gap-3 p-3 border rounded-lg cursor-pointer hover:bg-muted/50 transition-colors">
              <input type="radio" name="deleteMode" value="move" checked={deleteMode === "move"} onChange={() => setDeleteMode("move")} className="mt-0.5" />
              <div><p className="font-medium text-sm">Move links, delete project</p><p className="text-xs text-muted-foreground">Links will be moved to Unassigned and remain active.</p></div>
            </label>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteProject.mutate({ id: projectId, mode: deleteMode })} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleteProject.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Delete Project
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <EditLinkDialog
        open={editLinkOpen}
        onOpenChange={setEditLinkOpen}
        link={editLinkRecord}
        projects={projectOptions}
        isPending={updateLink.isPending}
        onSubmit={(payload: EditLinkDialogPayload) => updateLink.mutate(payload)}
      />

      <AlertDialog open={deleteLinkOpen} onOpenChange={setDeleteLinkOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Link</AlertDialogTitle>
            <AlertDialogDescription>This will permanently delete this link and all its click history. The short code will be retired and never reused.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteLinkId && deleteLink.mutate({ id: deleteLinkId })} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete Link</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <QrCodeDialog open={qrOpen} onOpenChange={setQrOpen} url={qrUrl || `${window.location.origin}/r/${qrCode}`} title={qrCode} />
    </AppShell>
  );
}

function ProjectViewSkeleton() {
  return (
    <AppShell>
      <div className="mb-6 animate-pulse">
        <div className="h-4 w-32 rounded bg-muted mb-5" />
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="h-3 w-3 rounded-full bg-muted" />
            <div className="h-8 w-48 rounded bg-muted" />
          </div>
          <div className="flex gap-2">
            <div className="h-9 w-24 rounded bg-muted" />
            <div className="h-9 w-24 rounded bg-muted" />
          </div>
        </div>
      </div>
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="h-24 rounded-lg border bg-card animate-pulse" />
        ))}
      </div>
    </AppShell>
  );
}

function ProjectEmptyState({ filtersActive, onClearFilters, onCreate }: { filtersActive: boolean; onClearFilters: () => void; onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center py-16">
      {filtersActive ? (
        <>
          <p className="text-muted-foreground mb-2">No links match your filters</p>
          <Button variant="outline" size="sm" onClick={onClearFilters}>Clear Filters</Button>
        </>
      ) : (
        <>
          <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center mb-4"><Plus className="h-8 w-8 text-primary" /></div>
          <h3 className="font-semibold text-lg mb-2">No links yet</h3>
          <p className="text-muted-foreground text-center max-w-sm mb-6">Create your first short link to start tracking clicks. Paste any URL and get a trackable short link in seconds.</p>
          <Button onClick={onCreate}><Plus className="h-4 w-4 mr-2" />Create Your First Link</Button>
          <p className="text-xs text-muted-foreground mt-4">Tip: Share your short link on social media or email to see real-time analytics.</p>
        </>
      )}
    </div>
  );
}

function LinksTable({
  links,
  onClickLink,
  onEditLink,
  onToggleStatus,
  onDeleteLink,
  onQr,
  sortField,
  sortDir,
  onSort,
}: {
  links: any[];
  onClickLink: (id: number) => void;
  onEditLink: (link: any) => void;
  onToggleStatus: (link: any, event: MouseEvent) => void;
  onDeleteLink: (id: number, event: MouseEvent) => void;
  onQr: (shortCode: string, domainId: number | null | undefined, event: MouseEvent) => void;
  sortField: SortField;
  sortDir: SortDir;
  onSort: (field: SortField) => void;
}) {
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const baseUrl = window.location.origin;

  const copyLink = (shortCode: string, id: number, event: MouseEvent) => {
    event.stopPropagation();
    navigator.clipboard.writeText(`${baseUrl}/r/${shortCode}`);
    setCopiedId(id);
    toast.success("Link copied!");
    setTimeout(() => setCopiedId(null), 2000);
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="h-3 w-3 ml-1 opacity-40" />;
    return sortDir === "asc" ? <ArrowUp className="h-3 w-3 ml-1" /> : <ArrowDown className="h-3 w-3 ml-1" />;
  };

  const formatDate = (date: string | Date) => new Date(date).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

  return (
    <div className="border rounded-lg overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-muted/50">
          <tr>
            <th className="text-left px-4 py-3 font-medium">Short Link</th>
            <th className="text-left px-4 py-3 font-medium hidden md:table-cell">Destination</th>
            <th className="text-left px-4 py-3 font-medium hidden lg:table-cell">Tags</th>
            <th className="text-right px-4 py-3 font-medium cursor-pointer select-none" onClick={() => onSort("clicks")}><span className="inline-flex items-center">Clicks <SortIcon field="clicks" /></span></th>
            <th className="text-center px-4 py-3 font-medium">Status</th>
            <th className="text-right px-4 py-3 font-medium cursor-pointer select-none hidden sm:table-cell" onClick={() => onSort("createdAt")}><span className="inline-flex items-center">Created <SortIcon field="createdAt" /></span></th>
            <th className="px-4 py-3 font-medium text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {links.map(link => {
            const effectiveStatus = getEffectiveLinkStatus(link);
            return (
              <tr key={link.id} className="hover:bg-muted/30 transition-colors cursor-pointer" onClick={() => onClickLink(link.id)}>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">/r/{link.shortCode}</code>
                    <button onClick={event => copyLink(link.shortCode, link.id, event)} className="text-muted-foreground hover:text-foreground transition-colors">
                      {copiedId === link.id ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                  {link.title && <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-[200px]">{link.title}</p>}
                </td>
                <td className="px-4 py-3 hidden md:table-cell"><span className="text-xs text-muted-foreground truncate max-w-[250px] block">{link.destinationUrl}</span></td>
                <td className="px-4 py-3 hidden lg:table-cell">
                  <div className="flex flex-wrap gap-1">
                    {Array.isArray(link.tags) && link.tags.slice(0, 2).map((tag: string) => <Badge key={tag} variant="secondary" className="text-[10px] px-1.5 py-0">{tag}</Badge>)}
                    {Array.isArray(link.tags) && link.tags.length > 2 && <Badge variant="secondary" className="text-[10px] px-1.5 py-0">+{link.tags.length - 2}</Badge>}
                  </div>
                </td>
                <td className="px-4 py-3 text-right"><span className="font-medium">{link.clickCount.toLocaleString()}</span></td>
                <td className="px-4 py-3 text-center">
                  <button onClick={event => onToggleStatus(link, event)} className="inline-block" title="Toggle paused/active">
                    <Badge variant="secondary" className={`text-xs cursor-pointer border-0 ${getEffectiveStatusClass(effectiveStatus)}`}>{getEffectiveStatusLabel(effectiveStatus)}</Badge>
                  </button>
                </td>
                <td className="px-4 py-3 text-right hidden sm:table-cell">
                  <div>
                    <span className="text-xs text-muted-foreground">{formatDate(link.createdAt)}</span>
                    {link.updatedAt && new Date(link.updatedAt).getTime() - new Date(link.createdAt).getTime() > 60000 && <p className="text-[10px] text-muted-foreground/70">edited {formatDate(link.updatedAt)}</p>}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1 justify-end">
                    <button onClick={event => { event.stopPropagation(); onQr(link.shortCode, link.domainId, event); }} className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"><QrCode className="h-3.5 w-3.5" /></button>
                    <button onClick={event => { event.stopPropagation(); onEditLink(link); }} className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"><Pencil className="h-3.5 w-3.5" /></button>
                    <button onClick={event => onDeleteLink(link.id, event)} className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

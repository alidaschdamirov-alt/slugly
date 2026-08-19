import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import TagInput from "@/components/TagInput";
import { DESTINATION_URL_ERROR, getDestinationUrlError, normalizeDestinationUrl } from "@shared/validation/destination-url";
import { Loader2 } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";

type EditableLink = {
  id: number;
  destinationUrl: string;
  title?: string | null;
  projectId?: number | null;
  tags?: string[] | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  utmTerm?: string | null;
  utmContent?: string | null;
  activeFrom?: number | null;
  expiresAt?: number | null;
};

type ProjectOption = {
  id: number;
  name: string;
  isSystem?: boolean | null;
};

export type EditLinkDialogPayload = {
  id: number;
  destinationUrl: string;
  title?: string;
  projectId?: number | null;
  tags?: string[];
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmTerm?: string;
  utmContent?: string;
  activeFrom?: number | null;
  expiresAt?: number | null;
};

interface EditLinkDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  link: EditableLink | null;
  projects?: ProjectOption[];
  isPending?: boolean;
  onSubmit: (payload: EditLinkDialogPayload) => void;
}

function toLocalDateTimeInput(value?: number | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

export default function EditLinkDialog({
  open,
  onOpenChange,
  link,
  projects = [],
  isPending = false,
  onSubmit,
}: EditLinkDialogProps) {
  const [destinationUrl, setDestinationUrl] = useState("");
  const [destinationError, setDestinationError] = useState("");
  const [title, setTitle] = useState("");
  const [projectId, setProjectId] = useState("none");
  const [tags, setTags] = useState<string[]>([]);
  const [utmSource, setUtmSource] = useState("");
  const [utmMedium, setUtmMedium] = useState("");
  const [utmCampaign, setUtmCampaign] = useState("");
  const [utmTerm, setUtmTerm] = useState("");
  const [utmContent, setUtmContent] = useState("");
  const [activeFrom, setActiveFrom] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [scheduleError, setScheduleError] = useState("");

  useEffect(() => {
    if (!open || !link) return;
    setDestinationUrl(link.destinationUrl || "");
    setDestinationError("");
    setTitle(link.title || "");
    setProjectId(link.projectId ? String(link.projectId) : "none");
    setTags(Array.isArray(link.tags) ? link.tags : []);
    setUtmSource(link.utmSource || "");
    setUtmMedium(link.utmMedium || "");
    setUtmCampaign(link.utmCampaign || "");
    setUtmTerm(link.utmTerm || "");
    setUtmContent(link.utmContent || "");
    setActiveFrom(toLocalDateTimeInput(link.activeFrom));
    setExpiresAt(toLocalDateTimeInput(link.expiresAt));
    setScheduleError("");
  }, [open, link]);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!link) return;

    const urlError = getDestinationUrlError(destinationUrl);
    if (urlError) {
      setDestinationError(urlError || DESTINATION_URL_ERROR);
      return;
    }

    const normalizedUrl = normalizeDestinationUrl(destinationUrl);
    if (!normalizedUrl) {
      setDestinationError(DESTINATION_URL_ERROR);
      return;
    }

    const activeFromTs = activeFrom ? new Date(activeFrom).getTime() : null;
    const expiresAtTs = expiresAt ? new Date(expiresAt).getTime() : null;

    if (activeFromTs && expiresAtTs && activeFromTs >= expiresAtTs) {
      setScheduleError("Active-from date must be before expiry date.");
      return;
    }

    if (normalizedUrl !== destinationUrl) setDestinationUrl(normalizedUrl);

    onSubmit({
      id: link.id,
      destinationUrl: normalizedUrl,
      title: title.trim() || undefined,
      projectId: projectId === "none" ? null : Number(projectId),
      tags: tags.length > 0 ? tags : undefined,
      utmSource: utmSource.trim() || undefined,
      utmMedium: utmMedium.trim() || undefined,
      utmCampaign: utmCampaign.trim() || undefined,
      utmTerm: utmTerm.trim() || undefined,
      utmContent: utmContent.trim() || undefined,
      activeFrom: activeFromTs,
      expiresAt: expiresAtTs,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit Link</DialogTitle>
          <DialogDescription>
            Update destination, project, tags, UTM parameters, and scheduling without losing click history.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-2" noValidate>
          <div className="space-y-2">
            <Label>Destination URL</Label>
            <Input
              value={destinationUrl}
              onChange={event => {
                setDestinationUrl(event.target.value);
                setDestinationError("");
              }}
              onBlur={() => {
                const normalized = normalizeDestinationUrl(destinationUrl);
                if (normalized) setDestinationUrl(normalized);
              }}
              type="url"
              aria-invalid={!!destinationError}
              required
            />
            {destinationError ? (
              <p className="text-xs text-destructive">{destinationError}</p>
            ) : (
              <p className="text-xs text-muted-foreground">Changing the URL preserves all click history.</p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Title</Label>
              <Input value={title} onChange={event => setTitle(event.target.value)} placeholder="Optional title" />
            </div>
            <div className="space-y-2">
              <Label>Project</Label>
              <Select value={projectId} onValueChange={setProjectId}>
                <SelectTrigger><SelectValue placeholder="Select project" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No project</SelectItem>
                  {projects.map(project => (
                    <SelectItem key={project.id} value={String(project.id)}>
                      {project.name}{project.isSystem ? " (system)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Move this link without losing analytics.</p>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Tags</Label>
            <TagInput value={tags} onChange={setTags} placeholder="Add tags..." />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <TextField label="UTM Source" value={utmSource} onChange={setUtmSource} />
            <TextField label="UTM Medium" value={utmMedium} onChange={setUtmMedium} />
            <TextField label="UTM Campaign" value={utmCampaign} onChange={setUtmCampaign} />
            <TextField label="UTM Term" value={utmTerm} onChange={setUtmTerm} />
            <div className="space-y-1.5 col-span-2">
              <Label className="text-xs">UTM Content</Label>
              <Input value={utmContent} onChange={event => setUtmContent(event.target.value)} className="h-9 text-sm" />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Active From</Label>
              <Input
                type="datetime-local"
                value={activeFrom}
                onChange={event => {
                  setActiveFrom(event.target.value);
                  setScheduleError("");
                }}
                className="h-9 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Expires At</Label>
              <Input
                type="datetime-local"
                value={expiresAt}
                onChange={event => {
                  setExpiresAt(event.target.value);
                  setScheduleError("");
                }}
                className="h-9 text-sm"
              />
            </div>
          </div>
          {scheduleError && <p className="text-xs text-destructive">{scheduleError}</p>}

          <Button type="submit" className="w-full" disabled={isPending || !destinationUrl.trim()}>
            {isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Save Changes
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <Input value={value} onChange={event => onChange(event.target.value)} className="h-9 text-sm" />
    </div>
  );
}

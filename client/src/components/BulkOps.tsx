import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useState } from "react";
import { FolderInput, Tag, X, Archive } from "lucide-react";

interface BulkOpsProps {
  selectedIds: number[];
  workspaceId: number;
  onClearSelection: () => void;
  onComplete: () => void;
}

export default function BulkOps({ selectedIds, workspaceId, onClearSelection, onComplete }: BulkOpsProps) {
  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const [tagDialogOpen, setTagDialogOpen] = useState(false);
  const [targetProjectId, setTargetProjectId] = useState<string>("");
  const [tagInput, setTagInput] = useState("");
  const [tagsToAdd, setTagsToAdd] = useState<string[]>([]);

  const { data: projects } = trpc.project.list.useQuery(undefined, { refetchOnWindowFocus: false });

  const moveMutation = trpc.bulk.moveLinks.useMutation({
    onSuccess: (data) => {
      toast.success(`Moved ${data.moved} links`);
      setMoveDialogOpen(false);
      onClearSelection();
      onComplete();
    },
    onError: (err) => toast.error(err.message),
  });

  const tagMutation = trpc.bulk.tagLinks.useMutation({
    onSuccess: (data) => {
      toast.success(`Tagged ${data.updated} links`);
      setTagDialogOpen(false);
      setTagsToAdd([]);
      onClearSelection();
      onComplete();
    },
    onError: (err) => toast.error(err.message),
  });

  const untagMutation = trpc.bulk.untagLinks.useMutation({
    onSuccess: (data) => {
      toast.success(`Removed tags from ${data.updated} links`);
      onClearSelection();
      onComplete();
    },
    onError: (err) => toast.error(err.message),
  });

  if (selectedIds.length === 0) return null;

  return (
    <>
      <div className="flex items-center gap-2 p-3 bg-primary/5 border rounded-lg">
        <Badge variant="secondary" className="font-mono">
          {selectedIds.length} selected
        </Badge>
        <Button variant="outline" size="sm" onClick={() => setMoveDialogOpen(true)}>
          <FolderInput className="mr-1.5 h-3.5 w-3.5" />
          Move
        </Button>
        <Button variant="outline" size="sm" onClick={() => setTagDialogOpen(true)}>
          <Tag className="mr-1.5 h-3.5 w-3.5" />
          Tag
        </Button>
        <Button variant="ghost" size="sm" onClick={onClearSelection} className="ml-auto text-muted-foreground">
          <X className="mr-1 h-3.5 w-3.5" />
          Clear
        </Button>
      </div>

      {/* Move Dialog */}
      <Dialog open={moveDialogOpen} onOpenChange={setMoveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Move {selectedIds.length} links to project</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Select value={targetProjectId} onValueChange={setTargetProjectId}>
              <SelectTrigger>
                <SelectValue placeholder="Select target project" />
              </SelectTrigger>
              <SelectContent>
                {projects?.map(p => (
                  <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              className="w-full"
              disabled={!targetProjectId || moveMutation.isPending}
              onClick={() => moveMutation.mutate({ linkIds: selectedIds, targetProjectId: parseInt(targetProjectId) })}
            >
              {moveMutation.isPending ? "Moving..." : "Move Links"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Tag Dialog */}
      <Dialog open={tagDialogOpen} onOpenChange={setTagDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add tags to {selectedIds.length} links</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex gap-2">
              <Input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                placeholder="Type tag and press Enter"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && tagInput.trim()) {
                    e.preventDefault();
                    if (!tagsToAdd.includes(tagInput.trim())) {
                      setTagsToAdd([...tagsToAdd, tagInput.trim()]);
                    }
                    setTagInput("");
                  }
                }}
              />
            </div>
            {tagsToAdd.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {tagsToAdd.map(t => (
                  <Badge key={t} variant="secondary" className="gap-1">
                    {t}
                    <X className="h-3 w-3 cursor-pointer" onClick={() => setTagsToAdd(tagsToAdd.filter(x => x !== t))} />
                  </Badge>
                ))}
              </div>
            )}
            <Button
              className="w-full"
              disabled={tagsToAdd.length === 0 || tagMutation.isPending}
              onClick={() => tagMutation.mutate({ linkIds: selectedIds, tags: tagsToAdd })}
            >
              {tagMutation.isPending ? "Tagging..." : "Apply Tags"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

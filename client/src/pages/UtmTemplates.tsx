import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useState } from "react";
import { Plus, Pencil, Trash2, Link2 } from "lucide-react";
import AppShell from "@/components/AppShell";

interface TemplateFormData {
  name: string;
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
  utmTerm: string;
  utmContent: string;
}

const emptyForm: TemplateFormData = { name: "", utmSource: "", utmMedium: "", utmCampaign: "", utmTerm: "", utmContent: "" };

export default function UtmTemplates() {
  const { user } = useAuth({ redirectOnUnauthenticated: true });
  const utils = trpc.useUtils();
  const { data: templates, isLoading } = trpc.utmTemplates.list.useQuery(undefined, { refetchOnWindowFocus: false });

  const [form, setForm] = useState<TemplateFormData>(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const createMutation = trpc.utmTemplates.create.useMutation({
    onSuccess: () => {
      toast.success("Template created");
      setDialogOpen(false);
      setForm(emptyForm);
      utils.utmTemplates.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const updateMutation = trpc.utmTemplates.update.useMutation({
    onSuccess: () => {
      toast.success("Template updated");
      setDialogOpen(false);
      setForm(emptyForm);
      setEditingId(null);
      utils.utmTemplates.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMutation = trpc.utmTemplates.delete.useMutation({
    onSuccess: () => {
      toast.success("Template deleted");
      utils.utmTemplates.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    if (editingId) {
      updateMutation.mutate({ id: editingId, ...form });
    } else {
      createMutation.mutate(form);
    }
  };

  const handleEdit = (t: any) => {
    setForm({
      name: t.name,
      utmSource: t.utmSource || "",
      utmMedium: t.utmMedium || "",
      utmCampaign: t.utmCampaign || "",
      utmTerm: t.utmTerm || "",
      utmContent: t.utmContent || "",
    });
    setEditingId(t.id);
    setDialogOpen(true);
  };

  if (!user) return null;

  return (
    <AppShell>
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">UTM Templates</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Save UTM parameter presets for quick link creation.
            </p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) { setForm(emptyForm); setEditingId(null); } }}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                New Template
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingId ? "Edit Template" : "Create Template"}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label>Template Name *</Label>
                  <Input value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Facebook Summer Campaign" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Source</Label>
                    <Input value={form.utmSource} onChange={(e) => setForm(f => ({ ...f, utmSource: e.target.value }))} placeholder="facebook" />
                  </div>
                  <div>
                    <Label>Medium</Label>
                    <Input value={form.utmMedium} onChange={(e) => setForm(f => ({ ...f, utmMedium: e.target.value }))} placeholder="social" />
                  </div>
                  <div>
                    <Label>Campaign</Label>
                    <Input value={form.utmCampaign} onChange={(e) => setForm(f => ({ ...f, utmCampaign: e.target.value }))} placeholder="summer_2026" />
                  </div>
                  <div>
                    <Label>Term</Label>
                    <Input value={form.utmTerm} onChange={(e) => setForm(f => ({ ...f, utmTerm: e.target.value }))} placeholder="optional" />
                  </div>
                  <div className="col-span-2">
                    <Label>Content</Label>
                    <Input value={form.utmContent} onChange={(e) => setForm(f => ({ ...f, utmContent: e.target.value }))} placeholder="optional" />
                  </div>
                </div>
                <Button type="submit" className="w-full" disabled={createMutation.isPending || updateMutation.isPending}>
                  {editingId ? "Update" : "Create"} Template
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">Loading...</div>
        ) : templates && templates.length > 0 ? (
          <div className="space-y-3">
            {templates.map(t => (
              <Card key={t.id}>
                <CardContent className="flex items-center justify-between py-4">
                  <div className="space-y-1">
                    <p className="font-medium">{t.name}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {t.utmSource && <Badge variant="secondary" className="text-xs">source: {t.utmSource}</Badge>}
                      {t.utmMedium && <Badge variant="secondary" className="text-xs">medium: {t.utmMedium}</Badge>}
                      {t.utmCampaign && <Badge variant="secondary" className="text-xs">campaign: {t.utmCampaign}</Badge>}
                      {t.utmTerm && <Badge variant="outline" className="text-xs">term: {t.utmTerm}</Badge>}
                      {t.utmContent && <Badge variant="outline" className="text-xs">content: {t.utmContent}</Badge>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEdit(t)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => deleteMutation.mutate({ id: t.id })}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <Link2 className="h-10 w-10 text-muted-foreground mb-3" />
              <p className="font-medium">No UTM templates yet</p>
              <p className="text-sm text-muted-foreground mt-1">
                Create templates to quickly apply UTM parameters when creating links.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </AppShell>
  );
}

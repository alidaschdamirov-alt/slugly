import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { Download, Loader2, Lock } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

interface CsvExportButtonProps {
  data: any[] | undefined;
  filename: string;
  isLoading?: boolean;
  onFetch?: () => Promise<any[]>;
}

function arrayToCsv(data: any[]): string {
  if (data.length === 0) return "";
  const headers = Object.keys(data[0]);
  const rows = data.map(row =>
    headers.map(h => {
      const val = row[h];
      if (val === null || val === undefined) return "";
      const str = String(val);
      if (str.includes(",") || str.includes('"') || str.includes("\n")) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    }).join(",")
  );
  return [headers.join(","), ...rows].join("\n");
}

export default function CsvExportButton({ data, filename, isLoading, onFetch }: CsvExportButtonProps) {
  const [exporting, setExporting] = useState(false);
  const [, setLocation] = useLocation();
  const { data: billingStatus, isLoading: billingLoading } = trpc.billing.status.useQuery();
  const canExport = billingStatus?.planConfig?.features?.csvExport === true;
  const isLocked = !billingLoading && !canExport;

  const goToBilling = () => {
    toast.info("CSV export requires Pro plan or higher.");
    setLocation("/billing");
  };

  const handleExport = async () => {
    if (isLocked) {
      goToBilling();
      return;
    }

    try {
      setExporting(true);
      let exportData = data;
      if (onFetch) {
        exportData = await onFetch();
      }
      if (!exportData || exportData.length === 0) {
        toast.error("No data to export");
        return;
      }
      const csv = arrayToCsv(exportData);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${filename}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("CSV exported successfully");
    } catch (err: any) {
      if (err.message?.includes("CSV export requires")) {
        goToBilling();
      } else {
        toast.error(err.message || "Export failed");
      }
    } finally {
      setExporting(false);
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleExport}
      disabled={exporting || isLoading || billingLoading}
      className="gap-1.5"
    >
      {exporting || billingLoading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : isLocked ? (
        <Lock className="h-4 w-4" />
      ) : (
        <Download className="h-4 w-4" />
      )}
      {isLocked ? "Upgrade to Export" : "Export CSV"}
      <Badge variant="secondary" className="ml-1 gap-1 px-1.5 py-0 text-[10px]">
        <Lock className="h-2.5 w-2.5" />
        Pro
      </Badge>
    </Button>
  );
}

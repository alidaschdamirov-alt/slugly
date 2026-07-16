import { Button } from "@/components/ui/button";
import { Download, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

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

  const handleExport = async () => {
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
      toast.error(err.message || "Export failed");
    } finally {
      setExporting(false);
    }
  };

  return (
    <Button variant="outline" size="sm" onClick={handleExport} disabled={exporting || isLoading}>
      {exporting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Download className="h-4 w-4 mr-2" />}
      Export CSV
    </Button>
  );
}

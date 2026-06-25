import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useUpload } from "@/contexts/UploadContext";
import { fetchHistory } from "@/services/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { HistoryItem } from "@/types/api";

function formatDate(isoString: string): string {
  return new Date(isoString).toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function History() {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { selectionsCache, restoreItem } = useUpload();
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchHistory()
      .then((data) => {
        if (!cancelled) setItems(data);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load history");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function handleLoad(item: HistoryItem) {
    restoreItem(item);
    navigate("/step1");
  }

  return (
    <section>
      <div className="mb-6">
        <h2 className="text-2xl font-semibold mt-0 mb-1">History</h2>
        <p className="text-fg-muted text-sm m-0">
          Previously uploaded documents and their pipeline configurations.
        </p>
      </div>

      {loading && (
        <div className="bg-surface border border-border rounded-lg p-6 text-center">
          <p className="text-fg-muted">Loading history...</p>
        </div>
      )}

      {!loading && error && (
        <div
          role="alert"
          className="bg-surface border border-danger text-error-text rounded-lg p-4"
        >
          {error}
        </div>
      )}

      {!loading && !error && items.length === 0 && (
        <div className="bg-surface border border-border rounded-lg p-12 text-center">
          <p className="text-fg-muted m-0">
            No uploads yet. Upload a document in Step 1 to get started.
          </p>
        </div>
      )}

      {!loading && !error && items.length > 0 && (
        <div className="overflow-x-auto bg-surface border border-border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Filename</TableHead>
                <TableHead>Uploaded</TableHead>
                <TableHead>Doc Type</TableHead>
                <TableHead>Chunking Strategy</TableHead>
                <TableHead>Phase 2 Providers</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow
                  key={item.doc_id}
                  className="cursor-pointer"
                  onClick={() => handleLoad(item)}
                >
                  <TableCell>
                    <span
                      className="max-w-[200px] truncate block"
                      title={item.filename}
                    >
                      {item.filename}
                    </span>
                  </TableCell>
                  <TableCell className="text-fg-muted whitespace-nowrap">
                    {formatDate(item.uploaded_at)}
                  </TableCell>
                  <TableCell className="text-fg-muted">
                    {item.metadata.doc_type ?? "—"}
                  </TableCell>
                  <TableCell className="text-fg-muted">
                    {item.recommendation?.chunking_strategy ?? "—"}
                  </TableCell>
                  <TableCell>
                    {item.provider_recommendation ? (
                      <span className="text-fg-muted text-sm">
                        {item.provider_recommendation.storage} /{" "}
                        {item.provider_recommendation.embedding}
                        {selectionsCache[item.doc_id] && (
                          <Badge variant="muted" className="ml-2">
                            customised
                          </Badge>
                        )}
                      </span>
                    ) : (
                      <span className="text-fg-muted">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleLoad(item);
                      }}
                    >
                      Load
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import type { ReactNode } from "react";

export interface ColumnDef<T> {
  key: string;
  label: string;
  render?: (row: T) => ReactNode;
  className?: string;
}

interface DataTableProps<T> {
  columns: ColumnDef<T>[];
  rows: T[];
  loading: boolean;
  emptyMessage?: ReactNode;
  skeletonRows?: number;
  getRowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}

export function DataTable<T,>({
  columns,
  rows,
  loading,
  emptyMessage = "No results found.",
  skeletonRows = 5,
  getRowKey,
  onRowClick,
  page,
  totalPages,
  total,
  pageSize,
  onPageChange,
}: DataTableProps<T>) {
  const startItem = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const endItem = Math.min(page * pageSize, total);

  return (
    <>
      <div className="overflow-x-auto bg-surface border border-border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((col) => (
                <TableHead key={col.key} className={col.className}>
                  {col.label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <>
                {Array.from({ length: skeletonRows }).map((_, i) => (
                  <TableRow key={i}>
                    {columns.map((col) => (
                      <TableCell key={col.key}>
                        <div className="h-4 bg-fg-subtle/20 rounded animate-pulse" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </>
            )}
            {!loading && rows.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="text-center py-12 text-fg-muted"
                >
                  {emptyMessage}
                </TableCell>
              </TableRow>
            )}
            {!loading &&
              rows.map((row) => (
                <TableRow
                  key={getRowKey(row)}
                  className={onRowClick ? "cursor-pointer" : undefined}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                >
                  {columns.map((col) => (
                    <TableCell key={col.key} className={col.className}>
                      {col.render
                        ? col.render(row)
                        : String(
                            (row as Record<string, unknown>)[col.key] ?? ""
                          )}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between mt-4 text-sm text-fg-muted">
        <span>
          {total === 0
            ? "No results"
            : `Showing ${startItem}–${endItem} of ${total}`}
        </span>
        <div className="flex items-center gap-3">
          <Button
            variant="secondary"
            size="sm"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
          >
            &lt; Prev
          </Button>
          <span>
            Page {page} / {totalPages}
          </span>
          <Button
            variant="secondary"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
          >
            Next &gt;
          </Button>
        </div>
      </div>
    </>
  );
}

import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { Button, EmptyState, ErrorState, Skeleton } from ".";
import { cn } from "@/services/format";

export interface Column<T> { key: string; header: ReactNode; cell: (row: T) => ReactNode; className?: string }

/** Reusable admin table with loading / empty / error states, optional selection and pagination. */
export function DataTable<T extends { id: string }>({ columns, rows, loading, error, onRetry, emptyTitle = "Nothing here yet", emptyDescription, selectable, selected, onSelect, onRowClick }: {
  columns: Column<T>[]; rows?: T[]; loading?: boolean; error?: unknown; onRetry?: () => void; emptyTitle?: string; emptyDescription?: string;
  selectable?: boolean; selected?: string[]; onSelect?: (ids: string[]) => void; onRowClick?: (row: T) => void;
}) {
  if (error) return <ErrorState error={error} retry={onRetry} />;
  const all = !!rows?.length && rows.every((r) => selected?.includes(r.id));
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-ink/10 bg-ink/[.03] text-xs uppercase tracking-wide text-ink/60">
          <tr>
            {selectable && <th className="w-10 px-4 py-3"><input type="checkbox" aria-label="Select all" checked={all} onChange={(e) => onSelect?.(e.target.checked ? rows!.map((r) => r.id) : [])} /></th>}
            {columns.map((c) => <th key={c.key} className={cn("px-4 py-3 font-semibold", c.className)}>{c.header}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-ink/5">
          {loading && Array.from({ length: 6 }).map((_, i) => <tr key={i}><td className="px-4 py-3" colSpan={columns.length + (selectable ? 1 : 0)}><Skeleton className="h-6 w-full" /></td></tr>)}
          {!loading && rows?.map((r) => (
            <tr key={r.id} className={cn("hover:bg-ink/[.02]", onRowClick && "cursor-pointer")} onClick={() => onRowClick?.(r)}>
              {selectable && <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}><input type="checkbox" aria-label="Select row" checked={selected?.includes(r.id)} onChange={(e) => onSelect?.(e.target.checked ? [...(selected ?? []), r.id] : (selected ?? []).filter((x) => x !== r.id))} /></td>}
              {columns.map((c) => <td key={c.key} className={cn("px-4 py-3 align-middle", c.className)}>{c.cell(r)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
      {!loading && !rows?.length && <EmptyState title={emptyTitle} description={emptyDescription} />}
    </div>
  );
}

export function Pagination({ page, totalPages, total, onPage }: { page: number; totalPages: number; total?: number; onPage: (p: number) => void }) {
  if (totalPages <= 1 && !total) return null;
  return (
    <div className="flex items-center justify-between gap-3 border-t border-ink/10 px-4 py-3 text-sm">
      <span className="text-ink/60">{total != null ? `${total} result${total === 1 ? "" : "s"}` : ""}</span>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page"><ChevronLeft className="h-4 w-4" /></Button>
        <span>Page {page} of {totalPages}</span>
        <Button variant="outline" size="icon" disabled={page >= totalPages} onClick={() => onPage(page + 1)} aria-label="Next page"><ChevronRight className="h-4 w-4" /></Button>
      </div>
    </div>
  );
}

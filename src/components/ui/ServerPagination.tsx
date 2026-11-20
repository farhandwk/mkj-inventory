'use client'

import { ChevronLeft, ChevronRight } from "lucide-react"

type ServerPaginationProps = {
  page: number
  pageSize: number
  totalCount: number
  onPageChange: (nextPage: number) => void
}

export default function ServerPagination({
  page,
  pageSize,
  totalCount,
  onPageChange,
}: ServerPaginationProps) {
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))
  const fromItem = totalCount === 0 ? 0 : (page - 1) * pageSize + 1
  const toItem = Math.min(totalCount, page * pageSize)

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-border text-xs">
      <p className="text-muted-foreground font-medium">
        Menampilkan <strong className="text-foreground">{fromItem}</strong>–<strong className="text-foreground">{toItem}</strong> dari{" "}
        <strong className="text-foreground">{totalCount}</strong> data (Halaman {page} / {totalPages})
      </p>

      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          className="px-3 py-1.5 rounded-xl bg-background border border-border text-foreground font-bold flex items-center gap-1 hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <ChevronLeft size={14} />
          <span>Prev</span>
        </button>
        <button
          type="button"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          className="px-3 py-1.5 rounded-xl bg-background border border-border text-foreground font-bold flex items-center gap-1 hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <span>Next</span>
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  )
}
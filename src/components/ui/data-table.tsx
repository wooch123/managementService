"use client"

import { useState } from "react"
import {
  type ColumnDef,
  type SortingState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table"
import { ArrowDown, ArrowUp, ArrowUpDown, Check, Copy, Download } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[]
  data: TData[]
  emptyText?: string
  pageSize?: number
  showSearch?: boolean
  /** 표 위에 CSV 내려받기 단추를 둔다 — 지금 걸린 검색·정렬이 그대로 반영된 파일이 나온다. */
  showExport?: boolean
  /** 표 위에 복사 단추를 둔다 — 스프레드시트에 그대로 붙여 넣을 수 있는 형식. */
  showCopy?: boolean
  /** 내려받는 파일 이름(확장자 없이). */
  exportName?: string
  /** 행을 누를 수 있게 한다(운영 화면의 목록→상세 선택). 없으면 지금까지처럼 정적인 표다. */
  onRowClick?: (row: TData) => void
  /** 지금 선택된 행인지 — 라우터를 여기서 읽지 않도록 판정만 밖에서 받는다. */
  isRowSelected?: (row: TData) => boolean
}

/**
 * 칸 하나를 글자로.
 *
 * 화면에 보이는 것은 `cell`이 그린 React 노드라 여기서 쓸 수 없다. 원본 값을 쓰되, 날짜처럼
 * 객체로 오는 것만 문자열로 바꾼다 — 내보낸 파일이 화면과 다른 숫자를 담으면 안 되므로
 * 서식(천 단위 쉼표 등)은 **넣지 않는다**. 쉼표가 들어간 숫자는 스프레드시트가 글자로 읽는다.
 */
function cellText(value: unknown): string {
  if (value === null || value === undefined) return ""
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  return String(value)
}

/** 큰따옴표·쉼표·줄바꿈이 든 칸은 감싼다(RFC 4180). */
function csvCell(value: unknown): string {
  const text = cellText(value)
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function DataTable<TData, TValue>({
  columns,
  data,
  emptyText = "데이터가 없습니다",
  pageSize = 10,
  showSearch = false,
  showExport = false,
  showCopy = false,
  exportName = "table",
  onRowClick,
  isRowSelected,
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = useState<SortingState>([])
  const [globalFilter, setGlobalFilter] = useState("")
  const [copied, setCopied] = useState(false)

  const table = useReactTable({
    data,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize } },
  })

  /**
   * 내보내는 것은 **지금 보고 있는 것**이다 — 검색으로 거르고 정렬한 결과 그대로,
   * 다만 쪽 나눔은 무시하고 전부. 화면에 열 줄만 보인다고 열 줄만 받아지면 쓸모가 없다.
   */
  const tabular = () => {
    const visible = table.getVisibleLeafColumns()
    const head = visible.map((c) => {
      const meta = c.columnDef.meta as { exportHeader?: string } | undefined
      return meta?.exportHeader ?? c.id
    })
    const body = table.getSortedRowModel().rows.map((row) => visible.map((c) => row.getValue(c.id)))
    return { head, body }
  }

  const downloadCsv = () => {
    const { head, body } = tabular()
    const csv = [head.map(csvCell).join(","), ...body.map((r) => r.map(csvCell).join(","))].join("\r\n")
    // 엑셀은 BOM이 없으면 UTF-8을 시스템 코드페이지로 읽어 한글이 깨진다.
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = `${exportName}.csv`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const copyAll = async () => {
    const { head, body } = tabular()
    // 스프레드시트에 붙여 넣을 것이라 탭으로 나눈다 — 쉼표는 셀 하나로 들어간다.
    const tsv = [head.join("\t"), ...body.map((r) => r.map(cellText).join("\t"))].join("\n")
    try {
      await navigator.clipboard.writeText(tsv)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // 클립보드를 막아 둔 브라우저 — 알림을 띄우기보다 조용히 아무 일도 하지 않는다.
    }
  }

  const hasToolbar = showSearch || showExport || showCopy

  return (
    <div data-slot="data-table" className="flex flex-col gap-3">
      {hasToolbar && (
        <div className="flex flex-wrap items-center gap-2">
          {showSearch && (
            <Input
              placeholder="검색..."
              value={globalFilter}
              onChange={(e) => table.setGlobalFilter(e.target.value)}
              className="max-w-sm flex-1"
            />
          )}
          <div className="ml-auto flex items-center gap-2">
            {showExport && (
              <Button variant="outline" size="sm" onClick={downloadCsv} disabled={data.length === 0}>
                <Download className="size-3.5" />
                CSV
              </Button>
            )}
            {showCopy && (
              <Button variant="outline" size="sm" onClick={copyAll} disabled={data.length === 0}>
                {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                {copied ? "복사됨" : "복사"}
              </Button>
            )}
          </div>
        </div>
      )}
      <div className="overflow-hidden rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const sortDir = header.column.getIsSorted()
                  return (
                    <TableHead key={header.id}>
                      {header.isPlaceholder ? null : header.column.getCanSort() ? (
                        <button
                          type="button"
                          className="flex items-center gap-1 select-none"
                          onClick={header.column.getToggleSortingHandler()}
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {sortDir === "asc" ? (
                            <ArrowUp className="size-3.5" />
                          ) : sortDir === "desc" ? (
                            <ArrowDown className="size-3.5" />
                          ) : (
                            <ArrowUpDown className="size-3.5 text-muted-foreground/50" />
                          )}
                        </button>
                      ) : (
                        flexRender(header.column.columnDef.header, header.getContext())
                      )}
                    </TableHead>
                  )
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => {
                const selected = isRowSelected?.(row.original) ?? row.getIsSelected()
                return (
                  <TableRow
                    key={row.id}
                    data-state={selected ? "selected" : undefined}
                    // 누를 수 있는 행에만 커서와 hover를 준다 — 반응하지 않는 표에서 손 모양이
                    // 뜨면 눌러도 아무 일이 없는 것처럼 보인다.
                    className={
                      onRowClick
                        ? "cursor-pointer data-[state=selected]:bg-primary/10"
                        : undefined
                    }
                    tabIndex={onRowClick ? 0 : undefined}
                    onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                    onKeyDown={
                      onRowClick
                        ? (e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault()
                              onRowClick(row.original)
                            }
                          }
                        : undefined
                    }
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                )
              })
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center text-muted-foreground"
                >
                  {emptyText}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <div className="flex items-center justify-end gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => table.previousPage()}
          disabled={!table.getCanPreviousPage()}
        >
          이전
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => table.nextPage()}
          disabled={!table.getCanNextPage()}
        >
          다음
        </Button>
      </div>
    </div>
  )
}

export { DataTable }

"use client"

import { useDeferredValue, useState } from "react"
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  type ColumnDef,
  type SortingState,
  useReactTable,
} from "@tanstack/react-table"
import { IconArrowsSort, IconSearch } from "@tabler/icons-react"

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@workspace/ui/components/empty"
import { Input } from "@workspace/ui/components/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { cn } from "@workspace/ui/lib/utils"

type StaffDataTableProps<TData> = {
  columns: Array<ColumnDef<TData>>
  data: TData[]
  emptyDescription: string
  emptyTitle: string
  getRowId?: (row: TData, index: number) => string
  searchPlaceholder: string
  toolbar?: React.ReactNode
}

export function StaffDataTable<TData>({
  columns,
  data,
  emptyDescription,
  emptyTitle,
  getRowId,
  searchPlaceholder,
  toolbar,
}: StaffDataTableProps<TData>) {
  const [search, setSearch] = useState("")
  const [sorting, setSorting] = useState<SortingState>([])
  const deferredSearch = useDeferredValue(search)
  const table = useReactTable({
    columns,
    data,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getRowId,
    getSortedRowModel: getSortedRowModel(),
    globalFilterFn: "includesString",
    onSortingChange: setSorting,
    state: {
      globalFilter: deferredSearch,
      sorting,
    },
  })
  const hasRows = table.getRowModel().rows.length > 0

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <label className="relative w-full max-w-sm">
          <IconSearch className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            onChange={(event) => setSearch(event.target.value)}
            placeholder={searchPlaceholder}
            value={search}
          />
        </label>
        {toolbar}
      </div>

      <div className="rounded-lg border border-border/70">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id} colSpan={header.colSpan}>
                    {header.isPlaceholder ? null : (
                      <button
                        className={cn(
                          "inline-flex items-center gap-1 rounded-md text-left font-medium",
                          header.column.getCanSort()
                            ? "cursor-pointer text-foreground hover:text-primary"
                            : "text-muted-foreground"
                        )}
                        onClick={header.column.getToggleSortingHandler()}
                        type="button"
                      >
                        {flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                        {header.column.getCanSort() ? (
                          <IconArrowsSort className="text-muted-foreground" />
                        ) : null}
                      </button>
                    )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>

          <TableBody>
            {hasRows
              ? table.getRowModel().rows.map((row) => (
                  <TableRow key={row.id}>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell
                        key={cell.id}
                        className="max-w-[18rem] align-top whitespace-normal"
                      >
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext()
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              : (
                  <TableRow>
                    <TableCell className="p-0" colSpan={columns.length}>
                      <Empty className="border-0 rounded-none">
                        <EmptyHeader>
                          <EmptyTitle>{emptyTitle}</EmptyTitle>
                          <EmptyDescription>{emptyDescription}</EmptyDescription>
                        </EmptyHeader>
                      </Empty>
                    </TableCell>
                  </TableRow>
                )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}


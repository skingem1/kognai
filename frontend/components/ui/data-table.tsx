"use client"

import React from 'react'
import { LoadingSpinner } from '../loading-spinner'
import { EmptyState } from '../empty-state'

export interface DataTableProps<T> {
  columns: Array<{
    key: keyof T
    label: string
    render?: (value: T[keyof T], row: T) => React.ReactNode
  }>
  data: T[]
  loading?: boolean
  emptyMessage?: string
  onRowClick?: (row: T) => void
}

export function DataTable<T>({
  columns,
  data,
  loading = false,
  emptyMessage = "No data available",
  onRowClick
}: DataTableProps<T>) {
  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <LoadingSpinner />
      </div>
    )
  }

  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center p-8">
        <EmptyState message={emptyMessage} />
      </div>
    )
  }

  return (
    <div className="rounded-lg border bg-white">
      <table className="w-full">
        <thead>
          <tr className="border-b">
            {columns.map((column) => (
              <th
                key={String(column.key)}
                className="px-4 py-3 text-left text-sm font-medium text-gray-500"
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, rowIndex) => (
            <tr
              key={rowIndex}
              className={`border-b ${onRowClick ? 'cursor-pointer hover:bg-gray-50' : ''}`}
              onClick={() => onRowClick?.(row)}
            >
              {columns.map((column) => {
                const value = row[column.key]
                return (
                  <td
                    key={String(column.key)}
                    className="px-4 py-3 text-sm text-gray-900"
                  >
                    {column.render ? column.render(value, row) : String(value ?? '')}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
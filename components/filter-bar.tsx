'use client'

import { X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  countActiveFilters,
  DEFAULT_FILTERS,
  LENGTH_OPTIONS,
  SORT_OPTIONS,
  UPLOADED_OPTIONS,
  type SearchFilters,
} from '@/lib/filters'

type FilterBarProps = {
  filters: SearchFilters
  onChange: (filters: SearchFilters) => void
  disabled?: boolean
}

export function FilterBar({ filters, onChange, disabled }: FilterBarProps) {
  const activeCount = countActiveFilters(filters)

  return (
    <div className="flex flex-wrap items-center gap-2">
      <FilterSelect
        label="Sort"
        value={filters.sort}
        options={SORT_OPTIONS}
        disabled={disabled}
        onValueChange={(sort) => onChange({ ...filters, sort: sort as SearchFilters['sort'] })}
      />
      <FilterSelect
        label="Uploaded"
        value={filters.uploaded}
        options={UPLOADED_OPTIONS}
        disabled={disabled}
        onValueChange={(uploaded) =>
          onChange({ ...filters, uploaded: uploaded as SearchFilters['uploaded'] })
        }
      />
      <FilterSelect
        label="Length"
        value={filters.length}
        options={LENGTH_OPTIONS}
        disabled={disabled}
        onValueChange={(length) =>
          onChange({ ...filters, length: length as SearchFilters['length'] })
        }
      />

      {activeCount > 0 ? (
        <Button
          variant="ghost"
          size="sm"
          className="h-9 text-muted-foreground"
          onClick={() => onChange(DEFAULT_FILTERS)}
          disabled={disabled}
        >
          <X />
          Reset
        </Button>
      ) : null}
    </div>
  )
}

type FilterSelectProps = {
  label: string
  value: string
  options: readonly { value: string; label: string }[]
  disabled?: boolean
  onValueChange: (value: string) => void
}

function FilterSelect({ label, value, options, disabled, onValueChange }: FilterSelectProps) {
  return (
    <Select value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger className="w-auto min-w-[7.5rem] gap-1.5" aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

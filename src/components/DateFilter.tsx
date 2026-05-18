import * as React from "react"
import { format } from "date-fns"
import { safeFormat } from "@/lib/date-utils"
import { Calendar as CalendarIcon, Filter } from "lucide-react"
import { DateRange } from "react-day-picker"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export type FilterType = "all" | "month" | "custom"

interface DateFilterProps {
  filterType: FilterType
  onFilterTypeChange: (type: FilterType) => void
  dateRange: DateRange | undefined
  onDateRangeChange: (range: DateRange | undefined) => void
  className?: string
}

export function DateFilter({
  filterType,
  onFilterTypeChange,
  dateRange,
  onDateRangeChange,
  className,
}: DateFilterProps) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <Select value={filterType} onValueChange={(value) => onFilterTypeChange(value as FilterType)}>
        <SelectTrigger className="!h-10 w-fit px-3 shrink-0 bg-white border-slate-200 shadow-none justify-start">
          <div className="flex items-center gap-2">
            <Filter className="size-4 shrink-0 text-slate-400" />
            <div className="block">
              <SelectValue placeholder="Filter By" />
            </div>
          </div>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Time</SelectItem>
          <SelectItem value="month">This Month</SelectItem>
          <SelectItem value="custom">Custom Range</SelectItem>
        </SelectContent>
      </Select>

      {filterType === "custom" && (
        <Popover>
          <PopoverTrigger
            render={
              <Button
                id="date"
                variant={"outline"}
                className={cn(
                  "!h-10 w-fit px-3 sm:px-4 justify-start text-left font-normal shrink-0 bg-white border-slate-200 shadow-none",
                  !dateRange && "text-muted-foreground"
                )}
              >
                <CalendarIcon className="h-4 w-4 shrink-0 text-slate-400 mr-2" />
                <span className="inline">
                  {dateRange?.from ? (
                    dateRange.to ? (
                      <>
                        {safeFormat(dateRange.from, "LLL dd, y")} -{" "}
                        {safeFormat(dateRange.to, "LLL dd, y")}
                      </>
                    ) : (
                      safeFormat(dateRange.from, "LLL dd, y")
                    )
                  ) : (
                    "Pick a range"
                  )}
                </span>
              </Button>
            }
          />
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              initialFocus
              mode="range"
              defaultMonth={dateRange?.from}
              selected={dateRange}
              onSelect={onDateRangeChange}
              numberOfMonths={2}
            />
          </PopoverContent>
        </Popover>
      )}
    </div>
  )
}

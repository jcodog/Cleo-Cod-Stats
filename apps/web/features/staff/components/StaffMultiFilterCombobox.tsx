"use client"

import { useRef, useState } from "react"
import { IconX } from "@tabler/icons-react"

import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxItem,
  ComboboxLabel,
  ComboboxList,
  ComboboxChips,
  ComboboxChipsInput,
  useComboboxAnchor,
} from "@workspace/ui/components/combobox"
import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"

export type StaffFilterOption = {
  description?: string
  label: string
  value: string
}

export type StaffFilterGroup = {
  id: string
  label: string
  options: StaffFilterOption[]
}

export type StaffFilterSelection = Record<string, string[]>

type StaffFilterItem = {
  description?: string
  groupId: string
  groupLabel: string
  key: string
  label: string
  value: string
}

function normalizeValues(values: string[]) {
  return Array.from(new Set(values)).sort((left, right) =>
    left.localeCompare(right)
  )
}

function buildFilterItems(groups: StaffFilterGroup[]) {
  return groups.flatMap<StaffFilterItem>((group) =>
    group.options.map((option) => ({
      description: option.description,
      groupId: group.id,
      groupLabel: group.label,
      key: `${group.id}:${option.value}`,
      label: option.label,
      value: option.value,
    }))
  )
}

function normalizeSelection(
  groups: StaffFilterGroup[],
  selection: StaffFilterSelection
) {
  const nextSelection: StaffFilterSelection = {}

  for (const group of groups) {
    const allowedValues = new Set(group.options.map((option) => option.value))
    nextSelection[group.id] = normalizeValues(
      (selection[group.id] ?? []).filter((value) => allowedValues.has(value))
    )
  }

  return nextSelection
}

function buildSelectionFromItems(
  groups: StaffFilterGroup[],
  items: StaffFilterItem[]
) {
  const nextSelection: StaffFilterSelection = Object.fromEntries(
    groups.map((group) => [group.id, [] as string[]])
  )

  for (const item of items) {
    nextSelection[item.groupId] = normalizeValues([
      ...(nextSelection[item.groupId] ?? []),
      item.value,
    ])
  }

  return nextSelection
}

export function countStaffFilterSelections(selection: StaffFilterSelection) {
  return Object.values(selection).reduce((count, values) => {
    return count + values.length
  }, 0)
}

function createEmptySelection(groups: StaffFilterGroup[]) {
  return Object.fromEntries(
    groups.map((group) => [group.id, [] as string[]])
  ) satisfies StaffFilterSelection
}

function removeSelectionValue(args: {
  groupId: string
  groups: StaffFilterGroup[]
  selection: StaffFilterSelection
  value: string
}) {
  const nextSelection = createEmptySelection(args.groups)

  for (const group of args.groups) {
    nextSelection[group.id] = normalizeValues(
      (args.selection[group.id] ?? []).filter((selectedValue) =>
        group.id === args.groupId ? selectedValue !== args.value : true
      )
    )
  }

  return nextSelection
}

export function StaffMultiFilterCombobox({
  emptyLabel,
  groups,
  onChange,
  placeholder,
  value,
}: {
  emptyLabel: string
  groups: StaffFilterGroup[]
  onChange: (selection: StaffFilterSelection) => void
  placeholder: string
  value: StaffFilterSelection
}) {
  const anchorRef = useComboboxAnchor()
  const inputRef = useRef<HTMLInputElement | null>(null)
  const valueButtonRefs = useRef(new Map<string, HTMLButtonElement | null>())
  const [isFocusedWithin, setIsFocusedWithin] = useState(false)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [highlightedItem, setHighlightedItem] = useState<
    StaffFilterItem | undefined
  >(undefined)
  const allItems = buildFilterItems(groups)
  const normalizedSelection = normalizeSelection(groups, value)
  const selectedItems = allItems.filter((item) =>
    normalizedSelection[item.groupId]?.includes(item.value)
  )
  const hasSelections = countStaffFilterSelections(normalizedSelection) > 0
  const normalizedQuery = query.trim().toLowerCase()
  const availableItems = allItems.filter((item) => {
    if (normalizedSelection[item.groupId]?.includes(item.value)) {
      return false
    }

    if (!normalizedQuery) {
      return true
    }

    return (
      item.groupLabel.toLowerCase().includes(normalizedQuery) ||
      item.label.toLowerCase().includes(normalizedQuery) ||
      item.value.toLowerCase().includes(normalizedQuery) ||
      item.description?.toLowerCase().includes(normalizedQuery)
    )
  })
  const groupedAvailableItems = groups
    .map((group) => ({
      id: group.id,
      items: availableItems.filter((item) => item.groupId === group.id),
      label: group.label,
    }))
    .filter((group) => group.items.length > 0)
  const selectedGroups = groups
    .map((group) => ({
      id: group.id,
      items: selectedItems.filter((item) => item.groupId === group.id),
      label: group.label,
    }))
    .filter((group) => group.items.length > 0)
  const flatSelectedItems = selectedGroups.flatMap((group) => group.items)
  const showLeadingHint =
    !isFocusedWithin && query.length === 0 && !hasSelections

  function focusInput() {
    requestAnimationFrame(() => {
      const input = inputRef.current

      if (!input) {
        return
      }

      input.focus()
      const valueLength = input.value.length
      input.setSelectionRange?.(valueLength, valueLength)
    })
  }

  function focusSelectedValue(key: string) {
    requestAnimationFrame(() => {
      valueButtonRefs.current.get(key)?.focus()
    })
  }

  function selectItem(item: StaffFilterItem) {
    setQuery("")
    setOpen(true)
    onChange(buildSelectionFromItems(groups, [...selectedItems, item]))
    focusInput()
  }

  function removeItemAndPreserveFocus(item: StaffFilterItem) {
    const currentIndex = flatSelectedItems.findIndex(
      (selectedItem) => selectedItem.key === item.key
    )
    const fallbackKey =
      flatSelectedItems[currentIndex - 1]?.key ??
      flatSelectedItems[currentIndex + 1]?.key

    onChange(
      removeSelectionValue({
        groupId: item.groupId,
        groups,
        selection: normalizedSelection,
        value: item.value,
      })
    )

    if (fallbackKey) {
      focusSelectedValue(fallbackKey)
      return
    }

    focusInput()
  }

  return (
    <Combobox
      autoComplete="list"
      autoHighlight
      inputValue={query}
      items={availableItems}
      itemToStringLabel={(item: StaffFilterItem) => item.label}
      itemToStringValue={(item: StaffFilterItem) => item.key}
      isItemEqualToValue={(item: StaffFilterItem, value: StaffFilterItem) =>
        item.key === value.key
      }
      loopFocus={false}
      multiple
      onItemHighlighted={(item) => {
        setHighlightedItem(item)
      }}
      onInputValueChange={setQuery}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen)
      }}
      onValueChange={(nextValue) => {
        setQuery("")
        setOpen(true)
        onChange(
          buildSelectionFromItems(
            groups,
            Array.isArray(nextValue) ? nextValue : []
          )
        )
        focusInput()
      }}
      open={open}
      openOnInputClick
      value={selectedItems}
    >
      <div className="relative w-full">
        <ComboboxChips
          className="h-11 w-full cursor-text flex-nowrap items-center justify-start gap-2 overflow-hidden pr-10"
          onBlurCapture={(event) => {
            const nextFocusedElement = event.relatedTarget as Node | null

            if (anchorRef.current?.contains(nextFocusedElement)) {
              return
            }

            setIsFocusedWithin(false)
          }}
          onFocusCapture={() => {
            setIsFocusedWithin(true)
          }}
          onMouseDown={(event) => {
            const target = event.target as HTMLElement

            if (
              target.closest(
                "[data-filter-clear],[data-filter-token],[data-filter-value-remove]"
              )
            ) {
              return
            }

            if (target === inputRef.current) {
              setOpen(true)
              return
            }

            event.preventDefault()
            setOpen(true)
            focusInput()
          }}
          ref={anchorRef}
        >
          <div className="relative min-w-0 flex-1 overflow-hidden">
            <div className="flex min-w-0 items-center gap-2 overflow-x-scroll overflow-y-hidden pr-1 pb-1 [scrollbar-gutter:stable]">
              {hasSelections ? (
                <div className="flex shrink-0 items-center gap-2">
                  {selectedGroups.map((group) => (
                    <span
                      className="inline-flex h-[calc(--spacing(5.25))] shrink-0 items-stretch overflow-hidden rounded-md border border-border/70 text-xs text-foreground"
                      key={group.id}
                    >
                      <span className="inline-flex items-center border-r border-border/70 bg-foreground/10 px-2 font-medium">
                        {group.label}:
                      </span>
                      <span className="inline-flex items-stretch bg-muted">
                        {group.items.map((item, index) => (
                          <span
                            className="inline-flex items-center gap-1 pr-1 pl-2"
                            key={item.key}
                          >
                            {index > 0 ? (
                              <span className="mr-1 h-4 w-px bg-border/70" />
                            ) : null}
                            <button
                              className="inline-flex items-center rounded-sm px-1 text-left transition-colors outline-none focus-visible:bg-background focus-visible:text-foreground"
                              data-filter-token
                              onKeyDown={(event) => {
                                const currentIndex =
                                  flatSelectedItems.findIndex(
                                    (selectedItem) =>
                                      selectedItem.key === item.key
                                  )

                                if (event.key === "ArrowLeft") {
                                  event.preventDefault()
                                  const previousKey =
                                    flatSelectedItems[currentIndex - 1]?.key

                                  if (previousKey) {
                                    focusSelectedValue(previousKey)
                                  }

                                  return
                                }

                                if (event.key === "ArrowRight") {
                                  event.preventDefault()
                                  const nextKey =
                                    flatSelectedItems[currentIndex + 1]?.key

                                  if (nextKey) {
                                    focusSelectedValue(nextKey)
                                    return
                                  }

                                  focusInput()
                                  return
                                }

                                if (
                                  event.key === "Backspace" ||
                                  event.key === "Delete"
                                ) {
                                  event.preventDefault()
                                  removeItemAndPreserveFocus(item)
                                  return
                                }

                                if (event.key === "Enter") {
                                  event.preventDefault()
                                  setOpen(true)
                                  focusInput()
                                  return
                                }

                                if (
                                  event.key.length === 1 &&
                                  !event.altKey &&
                                  !event.ctrlKey &&
                                  !event.metaKey
                                ) {
                                  event.preventDefault()
                                  setOpen(true)
                                  setQuery(
                                    (currentQuery) =>
                                      `${currentQuery}${event.key}`
                                  )
                                  focusInput()
                                }
                              }}
                              ref={(node) => {
                                valueButtonRefs.current.set(item.key, node)
                              }}
                              type="button"
                            >
                              {item.label}
                            </button>
                            <button
                              className="inline-flex size-4 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
                              data-filter-value-remove
                              onClick={(event) => {
                                event.preventDefault()
                                event.stopPropagation()
                                removeItemAndPreserveFocus(item)
                              }}
                              type="button"
                            >
                              <IconX className="size-3" />
                            </button>
                          </span>
                        ))}
                      </span>
                    </span>
                  ))}
                </div>
              ) : null}
              <ComboboxChipsInput
                className={cn(
                  "min-w-0 shrink-0 outline-none",
                  isFocusedWithin || query.length > 0
                    ? hasSelections
                      ? "w-28"
                      : "min-w-full flex-1"
                    : "pointer-events-none w-0 p-0 opacity-0"
                )}
                onFocus={() => {
                  valueButtonRefs.current.forEach((node) => node?.blur())
                  setOpen(true)
                }}
                onKeyDown={(event) => {
                  if (
                    (event.key === "Enter" || event.key === "Tab") &&
                    highlightedItem
                  ) {
                    event.preventDefault()
                    selectItem(highlightedItem)
                    return
                  }

                  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                    setOpen(true)
                  }

                  if (
                    hasSelections &&
                    query.length === 0 &&
                    inputRef.current?.selectionStart === 0 &&
                    inputRef.current?.selectionEnd === 0 &&
                    (event.key === "ArrowLeft" || event.key === "Backspace")
                  ) {
                    event.preventDefault()
                    const lastSelectedKey =
                      flatSelectedItems[flatSelectedItems.length - 1]?.key

                    if (lastSelectedKey) {
                      focusSelectedValue(lastSelectedKey)
                    }
                  }
                }}
                placeholder=""
                ref={inputRef}
              />
            </div>
            {showLeadingHint ? (
              <span className="pointer-events-none absolute inset-y-0 right-0 left-0 flex items-center truncate pr-2 text-sm text-muted-foreground">
                {placeholder}
              </span>
            ) : null}
          </div>
        </ComboboxChips>
        {hasSelections ? (
          <Button
            data-filter-clear
            className="absolute top-1/2 right-1 -translate-y-1/2"
            onClick={() => {
              setQuery("")
              onChange(createEmptySelection(groups))
              focusInput()
            }}
            size="icon-xs"
            type="button"
            variant="ghost"
          >
            <IconX />
          </Button>
        ) : null}
      </div>
      <ComboboxContent anchor={anchorRef} className="min-w-[24rem]">
        <ComboboxList>
          <ComboboxEmpty>{emptyLabel}</ComboboxEmpty>
          {groupedAvailableItems.map((group, index) => (
            <ComboboxGroup
              className={index > 0 ? "mt-4" : undefined}
              key={group.id}
            >
              <ComboboxLabel className="mx-1 mb-1 border-b border-border/70 px-1 pb-2 font-medium text-foreground">
                {group.label}
              </ComboboxLabel>
              {group.items.map((item) => (
                <ComboboxItem key={item.key} value={item}>
                  <div className="flex flex-col">
                    <span>{item.label}</span>
                    {item.description ? (
                      <span className="text-xs text-muted-foreground">
                        {item.description}
                      </span>
                    ) : null}
                  </div>
                </ComboboxItem>
              ))}
            </ComboboxGroup>
          ))}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}

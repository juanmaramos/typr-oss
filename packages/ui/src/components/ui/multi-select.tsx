import * as React from "react";
import { useEffect } from "react";

import { Command as CommandPrimitive, useCommandState } from "cmdk";
import { XIcon } from "lucide-react";

import { cn } from "../../lib/utils";
import { Command, CommandGroup, CommandItem, CommandList } from "./command";

export interface Option {
  value: string;
  label: string;
  disable?: boolean;
  fixed?: boolean;
  [key: string]: string | boolean | undefined;
}

interface GroupOption {
  [key: string]: Option[];
}

interface MultipleSelectorProps {
  value?: Option[];
  defaultOptions?: Option[];
  options?: Option[];
  placeholder?: string;
  loadingIndicator?: React.ReactNode;
  emptyIndicator?: React.ReactNode;
  delay?: number;
  triggerSearchOnFocus?: boolean;
  onSearch?: (value: string) => Promise<Option[]>;
  onSearchSync?: (value: string) => Option[];
  onChange?: (options: Option[]) => void;
  maxSelected?: number;
  onMaxSelected?: (maxLimit: number) => void;
  hidePlaceholderWhenSelected?: boolean;
  disabled?: boolean;
  groupBy?: string;
  className?: string;
  badgeClassName?: string;
  selectFirstItem?: boolean;
  creatable?: boolean;
  commandProps?: React.ComponentPropsWithoutRef<typeof Command>;
  inputProps?: Omit<
    React.ComponentPropsWithoutRef<typeof CommandPrimitive.Input>,
    "value" | "placeholder" | "disabled"
  >;
  hideClearAllButton?: boolean;
  leadingIcon?: React.ReactNode;
  createLabel?: (inputValue: string) => React.ReactNode;
}

export interface MultipleSelectorRef {
  selectedValue: Option[];
  input: HTMLInputElement;
  focus: () => void;
  reset: () => void;
}

export function useDebounce<T>(value: T, delay?: number): T {
  const [debouncedValue, setDebouncedValue] = React.useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay || 500);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}

function transToGroupOption(options: Option[], groupBy?: string): GroupOption {
  if (options.length === 0) {
    return {};
  }

  if (!groupBy) {
    return { "": options };
  }

  const groupOption: GroupOption = {};
  options.forEach((option) => {
    const key = (option[groupBy] as string) || "";
    if (!groupOption[key]) {
      groupOption[key] = [];
    }
    groupOption[key].push(option);
  });

  return groupOption;
}

function removePickedOption(groupOption: GroupOption, picked: Option[]): GroupOption {
  const cloneOption = JSON.parse(JSON.stringify(groupOption)) as GroupOption;

  for (const [key, value] of Object.entries(cloneOption)) {
    cloneOption[key] = value.filter(val => !picked.find(p => p.value === val.value));
  }

  return cloneOption;
}

const CommandEmpty = ({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.Empty>) => {
  const render = useCommandState(state => state.filtered.count === 0);
  if (!render) {
    return null;
  }
  return (
    <div
      className={cn("px-2 py-4 text-center text-sm", className)}
      cmdk-empty=""
      role="presentation"
      {...props}
    />
  );
};

CommandEmpty.displayName = "CommandEmpty";

const MultipleSelector = React.forwardRef<MultipleSelectorRef, MultipleSelectorProps>(({
  value,
  onChange,
  placeholder,
  defaultOptions: arrayDefaultOptions = [],
  options: arrayOptions,
  delay,
  onSearch,
  onSearchSync,
  loadingIndicator,
  emptyIndicator,
  maxSelected = Number.MAX_SAFE_INTEGER,
  onMaxSelected,
  hidePlaceholderWhenSelected,
  disabled,
  groupBy,
  className,
  badgeClassName,
  selectFirstItem = true,
  creatable = false,
  triggerSearchOnFocus = false,
  commandProps,
  inputProps,
  hideClearAllButton = false,
  leadingIcon,
  createLabel,
}, ref) => {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [open, setOpen] = React.useState(false);
  const [onScrollbar, setOnScrollbar] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  const [selected, setSelected] = React.useState<Option[]>(value || []);
  const [options, setOptions] = React.useState<GroupOption>(transToGroupOption(arrayDefaultOptions, groupBy));
  const [inputValue, setInputValue] = React.useState("");
  const debouncedSearchTerm = useDebounce(inputValue, delay || 500);

  React.useImperativeHandle(ref, () => ({
    selectedValue: [...selected],
    input: inputRef.current!,
    focus: () => inputRef.current?.focus(),
    reset: () => setSelected([]),
  }), [selected]);

  const handleClickOutside = (event: MouseEvent | TouchEvent) => {
    if (
      dropdownRef.current
      && !dropdownRef.current.contains(event.target as Node)
      && inputRef.current
      && !inputRef.current.contains(event.target as Node)
    ) {
      setOpen(false);
      inputRef.current.blur();
    }
  };

  const handleUnselect = React.useCallback((option: Option) => {
    const newOptions = selected.filter(s => s.value !== option.value);
    setSelected(newOptions);
    onChange?.(newOptions);
  }, [onChange, selected]);

  const handleKeyDown = React.useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    const input = inputRef.current;
    if (!input) {
      return;
    }

    if (e.key === "Delete" || e.key === "Backspace") {
      if (input.value === "" && selected.length > 0) {
        const lastSelectOption = selected[selected.length - 1];
        if (!lastSelectOption.fixed) {
          handleUnselect(lastSelectOption);
        }
      }
    }

    if (e.key === "Escape") {
      input.blur();
    }
  }, [handleUnselect, selected]);

  useEffect(() => {
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("touchend", handleClickOutside);
    } else {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchend", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchend", handleClickOutside);
    };
  }, [open]);

  useEffect(() => {
    if (value) {
      setSelected(value);
    }
  }, [value]);

  useEffect(() => {
    if (!arrayOptions || onSearch) {
      return;
    }

    const newOption = transToGroupOption(arrayOptions || [], groupBy);
    if (JSON.stringify(newOption) !== JSON.stringify(options)) {
      setOptions(newOption);
    }
  }, [arrayDefaultOptions, arrayOptions, groupBy, onSearch, options]);

  useEffect(() => {
    const doSearchSync = () => {
      const res = onSearchSync?.(debouncedSearchTerm);
      setOptions(transToGroupOption(res || [], groupBy));
    };

    const exec = async () => {
      if (!onSearchSync || !open) {
        return;
      }
      if (triggerSearchOnFocus) {
        doSearchSync();
      }
      if (debouncedSearchTerm) {
        doSearchSync();
      }
    };

    void exec();
  }, [debouncedSearchTerm, groupBy, onSearchSync, open, triggerSearchOnFocus]);

  useEffect(() => {
    const doSearch = async () => {
      setIsLoading(true);
      const res = await onSearch?.(debouncedSearchTerm);
      setOptions(transToGroupOption(res || [], groupBy));
      setIsLoading(false);
    };

    const exec = async () => {
      if (!onSearch || !open) {
        return;
      }
      if (triggerSearchOnFocus) {
        await doSearch();
      }
      if (debouncedSearchTerm) {
        await doSearch();
      }
    };

    void exec();
  }, [debouncedSearchTerm, groupBy, onSearch, open, triggerSearchOnFocus]);

  const CreatableItem = () => {
    if (!creatable) {
      return undefined;
    }

    const normalizedInputValue = inputValue.trim();
    if (!normalizedInputValue) {
      return undefined;
    }

    const hasMatchingOption = Object.values(options).some(group =>
      group.some(option =>
        option.label.toLowerCase() === normalizedInputValue.toLowerCase()
        || option.value.toLowerCase() === normalizedInputValue.toLowerCase()
      )
    );

    const hasMatchingSelected = selected.some(option =>
      option.label.toLowerCase() === normalizedInputValue.toLowerCase()
      || option.value.toLowerCase() === normalizedInputValue.toLowerCase()
    );

    if (
      hasMatchingOption
      || hasMatchingSelected
    ) {
      return undefined;
    }

    const item = (
      <CommandItem
        value={normalizedInputValue}
        className="cursor-pointer"
        onMouseDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onSelect={() => {
          if (selected.length >= maxSelected) {
            onMaxSelected?.(selected.length);
            return;
          }

          setInputValue("");
          const newOptions = [...selected, { value: normalizedInputValue, label: normalizedInputValue }];
          setSelected(newOptions);
          onChange?.(newOptions);
        }}
      >
        {createLabel ? createLabel(normalizedInputValue) : `Create "${normalizedInputValue}"`}
      </CommandItem>
    );

    if (!onSearch && inputValue.length > 0) {
      return item;
    }

    if (onSearch && debouncedSearchTerm.length > 0 && !isLoading) {
      return item;
    }

    return undefined;
  };

  const EmptyItem = React.useCallback(() => {
    if (!emptyIndicator) {
      return undefined;
    }

    if (onSearch && !creatable && Object.keys(options).length === 0) {
      return (
        <CommandItem value="-" disabled>
          {emptyIndicator}
        </CommandItem>
      );
    }

    if (selected.length > 0 && inputValue.trim().length === 0) {
      return undefined;
    }

    return <CommandEmpty>{emptyIndicator}</CommandEmpty>;
  }, [creatable, emptyIndicator, inputValue, onSearch, options, selected.length]);

  const selectables = React.useMemo<GroupOption>(() => removePickedOption(options, selected), [options, selected]);
  const hasSelectableOptions = React.useMemo(
    () => Object.values(selectables).some(group => group.length > 0),
    [selectables],
  );
  const emptyItem = EmptyItem();
  const creatableItem = CreatableItem();
  const shouldShowDropdown = open && (
    isLoading
    || Boolean(emptyItem)
    || Boolean(creatableItem)
    || hasSelectableOptions
  );

  const commandFilter = React.useCallback(() => {
    if (commandProps?.filter) {
      return commandProps.filter;
    }

    if (creatable) {
      return (val: string, search: string) => (val.toLowerCase().includes(search.toLowerCase()) ? 1 : -1);
    }

    return undefined;
  }, [creatable, commandProps?.filter]);

  return (
    <Command
      ref={dropdownRef}
      {...commandProps}
      onKeyDown={(e) => {
        handleKeyDown(e);
        commandProps?.onKeyDown?.(e);
      }}
      className={cn(
        "h-auto overflow-visible rounded-none border-0 bg-transparent shadow-none",
        commandProps?.className,
      )}
      shouldFilter={commandProps?.shouldFilter !== undefined ? commandProps.shouldFilter : !onSearch}
      filter={commandFilter()}
    >
      <div
        className={cn(
          "relative min-h-[38px] rounded-md border border-input text-sm outline-none transition-[color,box-shadow]",
          "focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50",
          "has-disabled:pointer-events-none has-disabled:cursor-not-allowed has-disabled:opacity-50",
          { "cursor-text": !disabled && selected.length !== 0, "p-1": selected.length !== 0 },
          !hideClearAllButton && "pr-9",
          className,
        )}
        onClick={() => {
          if (!disabled) {
            inputRef.current?.focus();
          }
        }}
      >
        <div className="flex flex-wrap items-center gap-1">
          {leadingIcon && (
            <span
              className={cn(
                "pointer-events-none inline-flex items-center text-muted-foreground/80",
                selected.length === 0 ? "px-2.5" : "px-1.5",
              )}
            >
              {leadingIcon}
            </span>
          )}
          {selected.map(option => (
            <div
              key={option.value}
              className={cn(
                "relative inline-flex h-7 cursor-default items-center rounded-md border bg-background pr-7 pl-2 text-xs font-medium text-secondary-foreground transition-all",
                "hover:bg-background disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
                "data-[fixed=true]:pr-2",
                badgeClassName,
              )}
              data-fixed={option.fixed}
              data-disabled={disabled || undefined}
            >
              {option.label}
              <button
                className="absolute -inset-y-px -right-px flex size-7 items-center justify-center rounded-r-md border border-transparent p-0 text-muted-foreground/80 outline-none transition-[color,box-shadow] hover:text-foreground"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleUnselect(option);
                  }
                }}
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onClick={() => handleUnselect(option)}
                aria-label="Remove"
              >
                <XIcon size={14} aria-hidden="true" />
              </button>
            </div>
          ))}

          <CommandPrimitive.Input
            {...inputProps}
            ref={inputRef}
            value={inputValue}
            disabled={disabled}
            onValueChange={(val) => {
              setInputValue(val);
              inputProps?.onValueChange?.(val);
            }}
            onBlur={(event) => {
              if (!onScrollbar) {
                setOpen(false);
              }
              inputProps?.onBlur?.(event);
            }}
            onFocus={(event) => {
              setOpen(true);
              if (triggerSearchOnFocus) {
                void onSearch?.(debouncedSearchTerm);
              }
              inputProps?.onFocus?.(event);
            }}
            placeholder={hidePlaceholderWhenSelected && selected.length !== 0 ? "" : placeholder}
            className={cn(
              "flex-1 bg-transparent outline-none placeholder:text-muted-foreground/70 disabled:cursor-not-allowed",
              {
                "w-full": hidePlaceholderWhenSelected,
                "px-3 py-2": selected.length === 0 && !leadingIcon,
                "py-2": selected.length === 0 && leadingIcon,
                "ml-1": selected.length !== 0,
              },
              inputProps?.className,
            )}
          />

          <button
            type="button"
            onClick={() => {
              const retained = selected.filter(s => s.fixed);
              setSelected(retained);
              onChange?.(retained);
            }}
            className={cn(
              "absolute top-0 right-0 flex size-9 items-center justify-center rounded-md border border-transparent text-muted-foreground/80 outline-none transition-[color,box-shadow] hover:text-foreground",
              (
                hideClearAllButton
                || disabled
                || selected.length < 1
                || selected.filter(s => s.fixed).length === selected.length
              ) && "hidden",
            )}
            aria-label="Clear all"
          >
            <XIcon size={16} aria-hidden="true" />
          </button>
        </div>
      </div>

      {shouldShowDropdown && (
        <div className="relative">
          <div
            className={cn(
              "absolute top-1 z-10 w-full overflow-hidden rounded-md border border-input",
              "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
            )}
            data-state="open"
          >
            <CommandList
              className="bg-popover text-popover-foreground shadow-lg outline-none"
              onMouseLeave={() => setOnScrollbar(false)}
              onMouseEnter={() => setOnScrollbar(true)}
              onMouseUp={() => inputRef.current?.focus()}
            >
              {isLoading
                ? <>{loadingIndicator}</>
                : (
                  <>
                    {emptyItem}
                    {creatableItem}
                    {!selectFirstItem && <CommandItem value="-" className="hidden" />}
                    {Object.entries(selectables).map(([key, dropdowns]) => (
                      <CommandGroup key={key} heading={key} className="h-full overflow-auto">
                        {dropdowns.map(option => (
                          <CommandItem
                            key={option.value}
                            value={option.value}
                            disabled={option.disable}
                            onMouseDown={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                            }}
                            onSelect={() => {
                              if (selected.length >= maxSelected) {
                                onMaxSelected?.(selected.length);
                                return;
                              }

                              setInputValue("");
                              const newOptions = [...selected, option];
                              setSelected(newOptions);
                              onChange?.(newOptions);
                            }}
                            className={cn(
                              "cursor-pointer",
                              option.disable && "pointer-events-none cursor-not-allowed opacity-50",
                            )}
                          >
                            {option.label}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    ))}
                  </>
                )}
            </CommandList>
          </div>
        </div>
      )}
    </Command>
  );
});

MultipleSelector.displayName = "MultipleSelector";

export default MultipleSelector;

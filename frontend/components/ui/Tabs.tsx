"use client";

import { cn } from "@/lib/cn";

export interface TabItem {
  key: string;
  label: string;
  disabled?: boolean;
}

export function Tabs({
  items,
  active,
  onChange,
  className,
}: {
  items: TabItem[];
  active: string;
  onChange: (key: string) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex gap-1 border-b border-line overflow-x-auto", className)} role="tablist">
      {items.map((item) => {
        const selected = item.key === active;
        return (
          <button
            key={item.key}
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(item.key)}
            className={cn(
              "relative px-3 py-2.5 text-sm whitespace-nowrap transition-colors",
              selected ? "text-hi" : "text-muted hover:text-body",
              item.disabled && "text-faint"
            )}
          >
            {item.label}
            {selected && (
              <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-accent" />
            )}
          </button>
        );
      })}
    </div>
  );
}

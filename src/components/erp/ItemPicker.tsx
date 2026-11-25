"use client";

import { useId, useState } from "react";
import type { ItemOption } from "@/lib/erp/types";
import { inputCls } from "./ui";

export function itemLabel(i: Pick<ItemOption, "code" | "name" | "unit">): string {
  return `${i.code} · ${i.name} (${i.unit})`;
}

/**
 * Item search box: native <datalist> over the active items (code, name,
 * unit). Typing an exact label or code selects the item; anything else
 * clears the selection (onChange(null)).
 */
export function ItemPicker({
  items,
  value,
  onChange,
  label,
  disabled,
}: {
  items: ItemOption[];
  value: number | null;
  onChange: (itemId: number | null) => void;
  label: string;
  disabled?: boolean;
}) {
  const listId = useId();
  const selected = items.find((i) => i.id === value);
  const [text, setText] = useState(selected ? itemLabel(selected) : "");
  // Keep the box in sync when the selection changes from outside.
  const [lastValue, setLastValue] = useState(value);
  if (lastValue !== value) {
    setLastValue(value);
    if (selected) setText(itemLabel(selected));
    else if (value === null && text && items.some((i) => itemLabel(i) === text)) setText("");
  }

  return (
    <>
      <input
        type="text"
        aria-label={label}
        list={listId}
        value={text}
        disabled={disabled}
        placeholder="พิมพ์รหัสหรือชื่อพัสดุ"
        className={`${inputCls} min-w-56 ${value === null && text ? "border-amber-500" : ""}`}
        onChange={(e) => {
          const v = e.target.value;
          setText(v);
          const t = v.trim().toLowerCase();
          const match =
            items.find((i) => itemLabel(i) === v) ?? items.find((i) => i.code.toLowerCase() === t) ?? null;
          onChange(match?.id ?? null);
        }}
      />
      <datalist id={listId}>
        {items.map((i) => (
          <option key={i.id} value={itemLabel(i)} />
        ))}
      </datalist>
    </>
  );
}

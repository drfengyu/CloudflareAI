"use client";

import { useState } from "react";
import { X } from "lucide-react";

interface MultiSelectProps {
  value: string[]; // 已选中的值
  options: { id: string; name: string }[]; // 可选项
  onChange: (value: string[]) => void;
  placeholder?: string;
}

export function MultiSelect({ value, options, onChange, placeholder }: MultiSelectProps) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);

  const filtered = options.filter(
    (opt) =>
      opt.name.toLowerCase().includes(search.toLowerCase()) ||
      opt.id.toLowerCase().includes(search.toLowerCase())
  );

  function toggle(id: string) {
    if (value.includes(id)) {
      onChange(value.filter((v) => v !== id));
    } else {
      onChange([...value, id]);
    }
  }

  function remove(id: string) {
    onChange(value.filter((v) => v !== id));
  }

  return (
    <div className="relative">
      {/* 已选中的标签 */}
      {value.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1">
          {value.map((v) => {
            const opt = options.find((o) => o.id === v);
            return (
              <span
                key={v}
                className="flex items-center gap-1 rounded bg-primary/10 px-2 py-1 text-xs"
              >
                {opt?.name || v}
                <button
                  type="button"
                  onClick={() => remove(v)}
                  className="hover:text-danger"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            );
          })}
        </div>
      )}

      {/* 搜索输入 */}
      <input
        type="text"
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder || "搜索模型..."}
        className="h-9 w-full rounded-lg border border-border bg-surface px-3 text-sm outline-none focus:border-primary"
      />

      {/* 下拉列表 */}
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute top-full z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-border bg-surface shadow-lg">
            {filtered.length === 0 ? (
              <p className="p-3 text-sm text-muted-foreground">无匹配结果</p>
            ) : (
              filtered.map((opt) => {
                const selected = value.includes(opt.id);
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => toggle(opt.id)}
                    className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-surface-2 ${
                      selected ? "bg-primary/5" : ""
                    }`}
                  >
                    <span>{opt.name}</span>
                    {selected && <span className="text-primary">✓</span>}
                  </button>
                );
              })
            )}
          </div>
        </>
      )}
    </div>
  );
}

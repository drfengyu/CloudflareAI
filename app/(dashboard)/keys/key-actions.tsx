"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { MoreHorizontal, Edit, Trash2, Ban, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toggleApiKeyAction, deleteApiKeyAction } from "./actions";

interface KeyActionsProps {
  keyId: string;
  status: number;
  onEdit?: () => void;
}

export function KeyActions({ keyId, status, onEdit }: KeyActionsProps) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [dropdownPosition, setDropdownPosition] = useState<"top" | "bottom">("bottom");
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;

      // 如果下方空间不足 150px（菜单高度），且上方空间更多，则向上弹出
      if (spaceBelow < 150 && spaceAbove > spaceBelow) {
        setDropdownPosition("top");
      } else {
        setDropdownPosition("bottom");
      }
    }
  }, [open]);

  function handleToggle() {
    startTransition(async () => {
      const result = await toggleApiKeyAction(keyId);
      if (!result.success) {
        alert(result.error || "操作失败");
      }
    });
    setOpen(false);
  }

  function handleDelete() {
    if (!confirm("确认删除此 API key？")) return;
    startTransition(async () => {
      const result = await deleteApiKeyAction(keyId);
      if (!result.success) {
        alert(result.error || "删除失败");
      }
    });
    setOpen(false);
  }

  return (
    <div className="relative">
      <Button
        ref={buttonRef}
        variant="ghost"
        size="sm"
        onClick={() => setOpen(!open)}
        disabled={isPending}
      >
        <MoreHorizontal className="h-4 w-4" />
      </Button>

      {open && (
        <>
          {/* 背景遮罩，点击关闭 */}
          <div
            className="fixed inset-0 z-10"
            onClick={() => setOpen(false)}
          />

          {/* 菜单 - 根据位置智能弹出 */}
          <div
            className={`absolute right-0 z-20 w-40 rounded-lg border border-border bg-surface shadow-lg ${
              dropdownPosition === "top" ? "bottom-full mb-1" : "top-8"
            }`}
          >
            <button
              onClick={() => {
                onEdit?.();
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surface-2"
            >
              <Edit className="h-4 w-4" />
              编辑
            </button>

            <button
              onClick={handleToggle}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surface-2"
            >
              {status === 1 ? (
                <>
                  <Ban className="h-4 w-4" />
                  禁用
                </>
              ) : (
                <>
                  <Check className="h-4 w-4" />
                  启用
                </>
              )}
            </button>

            <button
              onClick={handleDelete}
              className="flex w-full items-center gap-2 border-t border-border px-3 py-2 text-left text-sm text-danger hover:bg-danger/10"
            >
              <Trash2 className="h-4 w-4" />
              删除
            </button>
          </div>
        </>
      )}
    </div>
  );
}

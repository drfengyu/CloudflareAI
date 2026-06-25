"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { MoreHorizontal, Edit, Trash2, Ban, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toggleApiKeyAction, deleteApiKeyAction } from "./actions";

interface KeyActionsProps {
  keyId: string;
  status: number;
  onEdit?: () => void;
}

const MENU_WIDTH = 160; // w-40
const MENU_HEIGHT = 128; // 三项菜单的近似高度

export function KeyActions({ keyId, status, onEdit }: KeyActionsProps) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // 计算菜单的 fixed 坐标（基于按钮位置），渲染到 body 以脱离表格 overflow 裁剪
  useEffect(() => {
    if (!open || !buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUp = spaceBelow < MENU_HEIGHT && rect.top > spaceBelow;
    const top = openUp ? rect.top - MENU_HEIGHT - 4 : rect.bottom + 4;
    const left = Math.max(8, rect.right - MENU_WIDTH);
    setCoords({ top, left });
  }, [open]);

  // 滚动/缩放时关闭菜单，避免坐标失效后悬浮在错误位置
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
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
        aria-label="更多操作"
        title="更多操作"
      >
        <MoreHorizontal className="h-4 w-4" />
      </Button>

      {open &&
        coords &&
        createPortal(
          <>
            {/* 背景遮罩，点击关闭 */}
            <div className="fixed inset-0 z-50" onClick={() => setOpen(false)} />

            {/* 菜单 - fixed 定位，渲染在 body 顶层 */}
            <div
              className="fixed z-50 w-40 rounded-lg border border-border bg-card shadow-lg"
              style={{ top: coords.top, left: coords.left }}
            >
              <button
                onClick={() => {
                  onEdit?.();
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-secondary"
              >
                <Edit className="h-4 w-4" />
                编辑
              </button>

              <button
                onClick={handleToggle}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-secondary"
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
                className="flex w-full items-center gap-2 border-t border-border px-3 py-2 text-left text-sm text-destructive hover:bg-danger/10"
              >
                <Trash2 className="h-4 w-4" />
                删除
              </button>
            </div>
          </>,
          document.body,
        )}
    </div>
  );
}

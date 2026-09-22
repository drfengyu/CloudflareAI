"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { formatCnWallClock } from "@/lib/date";
import type {
  AnnouncementInput,
  AnnouncementType,
  FaqItem,
} from "@/lib/settings/dashboard-info";
import { updateDashboardInfoSettings } from "./actions";

const TYPE_OPTIONS: { value: AnnouncementType; label: string }[] = [
  { value: "default", label: "默认" },
  { value: "info", label: "进行中" },
  { value: "success", label: "成功" },
  { value: "warning", label: "警告" },
  { value: "error", label: "异常" },
];

const FIELD_CLASS =
  "w-full rounded-lg border border-border bg-card px-3 py-2 text-sm";

/** 表单行：日期用 datetime-local 的 `T` 分隔格式，落库时换回空格。 */
interface AnnouncementRow {
  title: string;
  content: string;
  type: AnnouncementType;
  date: string;
}

interface FaqRow {
  question: string;
  answer: string;
  link: string;
}

interface DashboardInfoFormProps {
  initialSettings: {
    announcements: AnnouncementInput[];
    faq: FaqItem[];
    uptimeEnabled: boolean;
    uptimeApiUrl: string;
  };
}

function toRow(item: AnnouncementInput): AnnouncementRow {
  return {
    title: item.title ?? "",
    content: item.content ?? "",
    type: item.type ?? "default",
    date: (item.date ?? "").replace(" ", "T"),
  };
}

function emptyAnnouncement(): AnnouncementRow {
  return {
    title: "",
    content: "",
    type: "default",
    date: formatCnWallClock(Date.now()).replace(" ", "T"),
  };
}

export function DashboardInfoForm({ initialSettings }: DashboardInfoFormProps) {
  const [announcements, setAnnouncements] = useState(() =>
    initialSettings.announcements.map(toRow),
  );
  const [faq, setFaq] = useState<FaqRow[]>(() =>
    initialSettings.faq.map((f) => ({
      question: f.question,
      answer: f.answer,
      link: f.link ?? "",
    })),
  );
  const [uptimeEnabled, setUptimeEnabled] = useState(initialSettings.uptimeEnabled);
  const [uptimeApiUrl, setUptimeApiUrl] = useState(initialSettings.uptimeApiUrl);
  const [loading, setLoading] = useState(false);

  const patchAnnouncement = (index: number, patch: Partial<AnnouncementRow>) => {
    setAnnouncements((prev) =>
      prev.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    );
  };

  const patchFaq = (index: number, patch: Partial<FaqRow>) => {
    setFaq((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      await updateDashboardInfoSettings({
        announcements: announcements.map<AnnouncementInput>((row) => ({
          title: row.title,
          content: row.content,
          type: row.type,
          date: row.date.replace("T", " "),
        })),
        faq: faq.map<FaqItem>((row) => ({
          question: row.question,
          answer: row.answer,
          link: row.link,
        })),
        uptimeEnabled,
        uptimeApiUrl,
      });
      toast.success("看板信息已保存");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* 系统公告 */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">系统公告</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setAnnouncements((prev) => [...prev, emptyAnnouncement()])}
          >
            <Plus className="mr-1 h-3.5 w-3.5" />
            添加公告
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          看板按发布时间倒序展示最新 20 条；时间为北京时间，整行留空的条目保存时丢弃。
        </p>

        {announcements.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
            暂无公告
          </p>
        ) : (
          announcements.map((row, i) => (
            <div key={i} className="space-y-2 rounded-lg border border-border p-3">
              <div className="grid gap-2 lg:grid-cols-[190px_120px_1fr_auto]">
                <input
                  type="datetime-local"
                  value={row.date}
                  onChange={(e) => patchAnnouncement(i, { date: e.target.value })}
                  className={FIELD_CLASS}
                  required
                />
                <select
                  value={row.type}
                  onChange={(e) =>
                    patchAnnouncement(i, { type: e.target.value as AnnouncementType })
                  }
                  className={FIELD_CLASS}
                >
                  {TYPE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <input
                  value={row.title}
                  onChange={(e) => patchAnnouncement(i, { title: e.target.value })}
                  placeholder="公告标题"
                  className={FIELD_CLASS}
                  maxLength={200}
                  required
                />
                <button
                  type="button"
                  onClick={() =>
                    setAnnouncements((prev) => prev.filter((_, idx) => idx !== i))
                  }
                  title="删除这条公告"
                  className="rounded-lg border border-border p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <textarea
                value={row.content}
                onChange={(e) => patchAnnouncement(i, { content: e.target.value })}
                placeholder="公告正文（可选）"
                rows={2}
                className={FIELD_CLASS}
                maxLength={2000}
              />
            </div>
          ))
        )}
      </div>

      {/* 常见问答 */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">常见问答</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              setFaq((prev) => [...prev, { question: "", answer: "", link: "" }])
            }
          >
            <Plus className="mr-1 h-3.5 w-3.5" />
            添加问答
          </Button>
        </div>

        {faq.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
            暂无问答
          </p>
        ) : (
          faq.map((row, i) => (
            <div key={i} className="space-y-2 rounded-lg border border-border p-3">
              <div className="grid gap-2 lg:grid-cols-[1fr_auto]">
                <input
                  value={row.question}
                  onChange={(e) => patchFaq(i, { question: e.target.value })}
                  placeholder="问题"
                  className={FIELD_CLASS}
                  maxLength={200}
                  required
                />
                <button
                  type="button"
                  onClick={() => setFaq((prev) => prev.filter((_, idx) => idx !== i))}
                  title="删除这条问答"
                  className="rounded-lg border border-border p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <textarea
                value={row.answer}
                onChange={(e) => patchFaq(i, { answer: e.target.value })}
                placeholder="答案"
                rows={2}
                className={FIELD_CLASS}
                maxLength={2000}
                required
              />
              <input
                value={row.link}
                onChange={(e) => patchFaq(i, { link: e.target.value })}
                placeholder="延伸阅读链接（可选，https://…）"
                className={FIELD_CLASS}
              />
            </div>
          ))
        )}
      </div>

      {/* 服务可用性 */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="uptime-enabled"
            checked={uptimeEnabled}
            onChange={(e) => setUptimeEnabled(e.target.checked)}
            className="h-4 w-4 rounded border-border"
          />
          <label htmlFor="uptime-enabled" className="text-sm font-medium">
            启用服务可用性
          </label>
        </div>

        <div>
          <label className={`block text-sm font-medium mb-1 ${uptimeEnabled ? "" : "opacity-50"}`}>
            Uptime 状态页接口地址（可选）
          </label>
          <input
            value={uptimeApiUrl}
            onChange={(e) => setUptimeApiUrl(e.target.value)}
            disabled={!uptimeEnabled}
            placeholder="https://uptime.example.com/api/status2/xxxxxxxx"
            className={`${FIELD_CLASS} disabled:opacity-50`}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            填 Uptime Kuma 状态页的 <code>api/status2/&lt;slug&gt;</code> 地址时按它展示；
            <strong>留空则由服务端并发自检本站端点</strong>（<code>/api/health</code>、
            <code>/v1/chat/completions</code>、<code>/api/session</code>，右侧显示单次耗时）。
            看板卡片在浏览器里按需拉取，上游超时或不可达只影响这张卡片。
          </p>
        </div>
      </div>

      <Button type="submit" disabled={loading}>
        {loading ? "保存中..." : "保存设置"}
      </Button>
    </form>
  );
}

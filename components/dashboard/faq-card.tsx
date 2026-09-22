"use client";

import { useState } from "react";
import { ChevronDown, CircleHelp, ExternalLink } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { FaqItem } from "@/lib/settings/dashboard-info";
import {
  INFO_CARD_BODY_CLASS,
  InfoCardEmpty,
  InfoCardHeader,
} from "./dashboard-info-shell";

/** 常见问答：点击问题展开答案，一次只展开一条。 */
export function FaqCard({
  items,
  className,
}: {
  items: FaqItem[];
  className?: string;
}) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <Card className={className}>
      <InfoCardHeader icon={<CircleHelp className="h-4 w-4" />} title="常见问答" />

      {items.length === 0 ? (
        <InfoCardEmpty
          icon={<CircleHelp className="h-6 w-6" />}
          title="暂无常见问答"
          hint="请联系系统管理员在系统设置中配置常见问答"
        />
      ) : (
        <CardContent className={INFO_CARD_BODY_CLASS}>
          <ul className="space-y-1 pt-3">
            {items.map((item, i) => {
              const open = openIndex === i;
              return (
                <li key={`${item.question}-${i}`} className="border-b border-border/60 pb-2 last:border-0">
                  <button
                    type="button"
                    onClick={() => setOpenIndex(open ? null : i)}
                    aria-expanded={open}
                    className="flex w-full items-center gap-2 text-left"
                  >
                    <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                      {item.question}
                    </span>
                    <ChevronDown
                      className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${
                        open ? "rotate-180" : ""
                      }`}
                    />
                  </button>
                  {open ? (
                    <div className="mt-1 space-y-1.5">
                      <p className="whitespace-pre-line text-xs text-muted-foreground">
                        {item.answer}
                      </p>
                      {item.link ? (
                        <a
                          href={item.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                        >
                          查看详情
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </CardContent>
      )}
    </Card>
  );
}

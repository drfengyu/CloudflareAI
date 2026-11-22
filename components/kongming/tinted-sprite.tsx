"use client";

import { useEffect, useState } from "react";
import { tintSprite, type ModelPalette } from "@/lib/kongming/tint";

function useTinted(src: string | null | undefined, palette: ModelPalette | null | undefined) {
  const [href, setHref] = useState<string | null>(null);
  const key = palette ? `${palette.first?.join(",")}|${palette.second?.join(",")}` : "";

  useEffect(() => {
    setHref(null);
    if (!src || !palette) return;
    let alive = true;
    tintSprite(src, palette)
      .then((value) => {
        if (alive) setHref(value);
      })
      .catch(() => {
        if (alive) setHref(src);
      });
    return () => {
      alive = false;
    };
  }, [src, key, palette]);

  return href ?? src ?? null;
}

export function TintedSprite({
  src,
  palette,
  ...props
}: {
  src: string;
  palette: ModelPalette | null | undefined;
  className?: string;
  alt?: string;
}) {
  const href = useTinted(src, palette);
  return <img src={href ?? src} {...props} alt={props.alt ?? ""} />;
}

export function TintedSvgSprite({
  src,
  palette,
  x,
  y,
  width,
  height,
  clipPath,
  className,
}: {
  src: string;
  palette: ModelPalette | null | undefined;
  x: number;
  y: number;
  width: number;
  height: number;
  clipPath?: string;
  className?: string;
}) {
  const href = useTinted(src, palette);
  return (
    <image
      href={href ?? src}
      x={x}
      y={y}
      width={width}
      height={height}
      clipPath={clipPath}
      className={className}
    />
  );
}

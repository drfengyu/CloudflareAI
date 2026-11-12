import type { ReactNode } from "react";
import type { TrialWaveShape } from "@/lib/trial/dungeon";

/**
 * 试炼回廊的内联 SVG 立绘。
 *
 * 不依赖外部图片资源：每个魔物一种剪影 + 渐变，靠形状与配色区分，
 * 受伤时由外层套 `trial-hurt` 动画，这里只负责画。
 */

export function TrialHeroArt({ hurt }: { hurt: boolean }) {
  return (
    <svg
      viewBox="0 0 120 120"
      className={hurt ? "h-full w-full trial-hurt" : "h-full w-full"}
      aria-hidden
    >
      <defs>
        <linearGradient id="trial-hero-cloak" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#818cf8" />
          <stop offset="100%" stopColor="#312e81" />
        </linearGradient>
        <linearGradient id="trial-hero-blade" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor="#fde68a" />
          <stop offset="100%" stopColor="#f8fafc" />
        </linearGradient>
        <radialGradient id="trial-hero-aura" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#a5b4fc" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#a5b4fc" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="58" cy="62" r="46" fill="url(#trial-hero-aura)" />
      <ellipse cx="58" cy="104" rx="26" ry="6" fill="#0f172a" opacity="0.45" />
      <path d="M34 104 Q36 66 58 58 Q80 66 82 104 Z" fill="url(#trial-hero-cloak)" />
      <path d="M58 26 Q76 30 74 48 Q72 62 58 68 Q44 62 42 48 Q40 30 58 26 Z" fill="#1e1b4b" />
      <path d="M58 26 Q68 30 67 46 L58 52 L49 46 Q48 30 58 26 Z" fill="#4f46a5" opacity="0.8" />
      <circle cx="52" cy="47" r="2.6" fill="#fde68a" />
      <circle cx="64" cy="47" r="2.6" fill="#fde68a" />
      <path d="M58 66 L58 92" stroke="#c7d2fe" strokeWidth="2" opacity="0.5" />
      <g transform="rotate(28 86 60)">
        <rect x="84" y="18" width="4" height="46" rx="2" fill="url(#trial-hero-blade)" />
        <rect x="78" y="62" width="16" height="4" rx="2" fill="#a16207" />
        <rect x="84" y="66" width="4" height="10" rx="2" fill="#78350f" />
      </g>
      <path d="M26 42 l2 6 6 2 -6 2 -2 6 -2 -6 -6 -2 6 -2 Z" fill="#e0e7ff" opacity="0.8" />
      <path d="M96 82 l1.5 4.5 4.5 1.5 -4.5 1.5 -1.5 4.5 -1.5 -4.5 -4.5 -1.5 4.5 -1.5 Z" fill="#c7d2fe" opacity="0.7" />
    </svg>
  );
}

const SHAPE_ART: Record<TrialWaveShape, ReactNode> = {
  mire: (
    <>
      <defs>
        <linearGradient id="trial-mire" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#4ade80" />
          <stop offset="100%" stopColor="#064e3b" />
        </linearGradient>
      </defs>
      <ellipse cx="60" cy="100" rx="30" ry="6" fill="#052e16" opacity="0.5" />
      <path
        d="M24 92 Q20 58 44 44 Q60 36 76 44 Q100 58 96 92 Q88 104 60 104 Q32 104 24 92 Z"
        fill="url(#trial-mire)"
      />
      <path d="M34 42 q2 -12 8 -14 q-2 8 2 12 Z" fill="#4ade80" opacity="0.75" />
      <path d="M78 40 q6 -10 12 -10 q-6 6 -4 14 Z" fill="#4ade80" opacity="0.6" />
      <circle cx="48" cy="72" r="6" fill="#022c22" />
      <circle cx="72" cy="72" r="6" fill="#022c22" />
      <circle cx="50" cy="70" r="1.8" fill="#d9f99d" />
      <circle cx="74" cy="70" r="1.8" fill="#d9f99d" />
      <path d="M52 86 q8 6 16 0" stroke="#022c22" strokeWidth="2.5" fill="none" strokeLinecap="round" />
    </>
  ),
  wisp: (
    <>
      <defs>
        <radialGradient id="trial-wisp" cx="50%" cy="62%" r="55%">
          <stop offset="0%" stopColor="#fef3c7" />
          <stop offset="55%" stopColor="#f59e0b" />
          <stop offset="100%" stopColor="#7c2d12" stopOpacity="0.35" />
        </radialGradient>
      </defs>
      <circle cx="60" cy="62" r="40" fill="#f59e0b" opacity="0.12" />
      <path
        d="M60 22 Q82 44 78 64 Q76 88 60 96 Q44 88 42 64 Q38 44 60 22 Z"
        fill="url(#trial-wisp)"
      />
      <path d="M60 44 Q70 58 67 70 Q64 80 60 84 Q56 80 53 70 Q50 58 60 44 Z" fill="#fffbeb" opacity="0.9" />
      <circle cx="53" cy="66" r="3" fill="#7c2d12" />
      <circle cx="67" cy="66" r="3" fill="#7c2d12" />
      <path d="M54 82 q6 4 12 0" stroke="#7c2d12" strokeWidth="2" fill="none" strokeLinecap="round" />
    </>
  ),
  golem: (
    <>
      <defs>
        <linearGradient id="trial-golem" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#94a3b8" />
          <stop offset="100%" stopColor="#334155" />
        </linearGradient>
      </defs>
      <ellipse cx="60" cy="104" rx="28" ry="5" fill="#0f172a" opacity="0.5" />
      <rect x="34" y="30" width="52" height="62" rx="10" fill="url(#trial-golem)" />
      <rect x="18" y="46" width="16" height="26" rx="6" fill="#475569" />
      <rect x="86" y="46" width="16" height="26" rx="6" fill="#475569" />
      <path d="M42 40 h36" stroke="#64748b" strokeWidth="2" opacity="0.7" />
      <path d="M46 52 l10 8 -10 8" stroke="#1e293b" strokeWidth="2.5" fill="none" />
      <path d="M74 52 l-10 8 10 8" stroke="#1e293b" strokeWidth="2.5" fill="none" />
      <rect x="50" y="72" width="20" height="8" rx="4" fill="#fbbf24" />
      <path d="M38 88 l12 -6" stroke="#1e293b" strokeWidth="2" opacity="0.6" />
      <circle cx="60" cy="24" r="4" fill="#fbbf24" opacity="0.8" />
    </>
  ),
  serpent: (
    <>
      <defs>
        <linearGradient id="trial-serpent" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#a78bfa" />
          <stop offset="100%" stopColor="#4c1d95" />
        </linearGradient>
      </defs>
      <ellipse cx="60" cy="104" rx="26" ry="5" fill="#1e1b4b" opacity="0.5" />
      <path
        d="M40 100 Q92 100 90 74 Q88 50 62 52 Q38 54 40 38 Q42 24 60 24"
        stroke="url(#trial-serpent)"
        strokeWidth="15"
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M40 100 Q92 100 90 74 Q88 50 62 52 Q38 54 40 38 Q42 24 60 24"
        stroke="#c4b5fd"
        strokeWidth="3"
        fill="none"
        strokeLinecap="round"
        opacity="0.45"
      />
      <ellipse cx="62" cy="24" rx="12" ry="9" fill="#5b21b6" />
      <circle cx="57" cy="22" r="2.4" fill="#fef08a" />
      <circle cx="68" cy="22" r="2.4" fill="#fef08a" />
      <path d="M70 30 q6 4 4 10" stroke="#f472b6" strokeWidth="2" fill="none" strokeLinecap="round" />
    </>
  ),
  thorn: (
    <>
      <defs>
        <radialGradient id="trial-thorn" cx="50%" cy="50%" r="55%">
          <stop offset="0%" stopColor="#fb7185" />
          <stop offset="100%" stopColor="#881337" />
        </radialGradient>
      </defs>
      <ellipse cx="60" cy="104" rx="24" ry="5" fill="#4c0519" opacity="0.5" />
      <path
        d="M60 14 L70 36 L94 30 L82 50 L104 62 L80 68 L88 92 L64 80 L60 106 L56 80 L32 92 L40 68 L16 62 L38 50 L26 30 L50 36 Z"
        fill="url(#trial-thorn)"
      />
      <circle cx="60" cy="60" r="18" fill="#4c0519" opacity="0.75" />
      <circle cx="60" cy="60" r="9" fill="#fecdd3" />
      <circle cx="60" cy="60" r="4.5" fill="#7f1d1d" />
      <path d="M42 88 l-6 10 M78 88 l6 10" stroke="#881337" strokeWidth="3" strokeLinecap="round" />
    </>
  ),
  mirror: (
    <>
      <defs>
        <linearGradient id="trial-mirror" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#67e8f9" />
          <stop offset="50%" stopColor="#0ea5e9" />
          <stop offset="100%" stopColor="#0c4a6e" />
        </linearGradient>
      </defs>
      <ellipse cx="60" cy="104" rx="26" ry="5" fill="#082f49" opacity="0.55" />
      <path d="M60 12 L84 46 L60 104 L36 46 Z" fill="url(#trial-mirror)" />
      <path d="M60 12 L60 104" stroke="#e0f2fe" strokeWidth="1.5" opacity="0.55" />
      <path d="M42 46 L78 46" stroke="#e0f2fe" strokeWidth="1.5" opacity="0.4" />
      <path d="M52 34 l-6 12 10 4 -6 14" stroke="#082f49" strokeWidth="2" fill="none" opacity="0.7" />
      <circle cx="60" cy="58" r="7" fill="#082f49" opacity="0.65" />
      <circle cx="60" cy="58" r="3" fill="#e0f2fe" />
    </>
  ),
  warden: (
    <>
      <defs>
        <linearGradient id="trial-warden" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#312e81" />
          <stop offset="100%" stopColor="#020617" />
        </linearGradient>
        <radialGradient id="trial-warden-lamp" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#fef9c3" />
          <stop offset="45%" stopColor="#facc15" />
          <stop offset="100%" stopColor="#facc15" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="86" cy="52" r="24" fill="url(#trial-warden-lamp)" opacity="0.7" />
      <ellipse cx="58" cy="108" rx="32" ry="5" fill="#020617" opacity="0.6" />
      <path d="M30 108 Q32 52 58 40 Q84 52 86 108 Z" fill="url(#trial-warden)" />
      <path d="M58 16 Q74 20 72 38 Q70 52 58 58 Q46 52 44 38 Q42 20 58 16 Z" fill="#0f172a" />
      <path d="M48 40 q4 6 20 0" stroke="#a5b4fc" strokeWidth="2.4" fill="none" strokeLinecap="round" />
      <path d="M48 26 q10 -10 20 0" stroke="#4338ca" strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d="M58 58 L58 96" stroke="#4338ca" strokeWidth="2" opacity="0.6" />
      <rect x="80" y="58" width="10" height="10" rx="2" fill="#facc15" />
      <path d="M80 58 h10" stroke="#78350f" strokeWidth="2" />
      <circle cx="86" cy="48" r="2.5" fill="#fef9c3" />
    </>
  ),
};

export function TrialMonsterArt({ shape, hurt }: { shape: TrialWaveShape; hurt: boolean }) {
  return (
    <svg
      viewBox="0 0 120 120"
      className={hurt ? "h-full w-full trial-hurt" : "h-full w-full"}
      aria-hidden
    >
      {SHAPE_ART[shape] ?? SHAPE_ART.mire}
    </svg>
  );
}

import type { SagaGeneralDef } from "@/lib/trial/saga/types";

/**
 * 武将立绘：全部用 Canvas 几何图形现画，不引用任何外部图片。
 *
 * 每个武将按 id 稳定散列出一套面貌（肤色 / 胡须 / 眉眼 / 头冠），再用各自的
 * 主色画战袍、用 accent 画绦带与盔缨；同一个人每次画出来都一致。
 * 装备会真正改变立绘：武器换成刀 / 枪 / 偃月刀，甲胄从布甲到重铠逐级加厚。
 */

export type PortraitHat =
  | "helmet"
  | "crown"
  | "scholar"
  | "band"
  | "phoenix"
  | "cap"
  | "bun"
  | "scarf";

export type PortraitBeard = "none" | "mustache" | "goatee" | "full" | "bushy" | "long";

export interface PortraitTraits {
  skin: string;
  hat: PortraitHat;
  beard: PortraitBeard;
  robe: string;
  accent: string;
  plume: string;
  fan: boolean;
  bigEars: boolean;
}

export interface PortraitGear {
  weapon?: string | null;
  armor?: string | null;
}

export interface PortraitBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

const SKIN_TONES = ["#e7c6a0", "#dcb389", "#cb9d70", "#b9895f"] as const;

function hashId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}

const SPECIAL: Record<string, Partial<PortraitTraits>> = {
  liubei: { hat: "crown", beard: "goatee", bigEars: true, skin: "#e3bc94" },
  guanyu: { hat: "helmet", beard: "long", skin: "#b2543f", fan: false, plume: "#7f1d1d" },
  zhangfei: { hat: "helmet", beard: "bushy", skin: "#8f6547", plume: "#1f2937" },
  zhaoyun: { hat: "helmet", beard: "none", plume: "#dbeafe" },
  machao: { hat: "helmet", beard: "none", plume: "#e2e8f0" },
  huangzhong: { hat: "helmet", beard: "full", skin: "#cfa07a", plume: "#fde68a" },
  weiyan: { hat: "helmet", beard: "full", plume: "#e9d5ff" },
  zhugeliang: { hat: "scholar", beard: "goatee", fan: true, skin: "#e8cdaa" },
  pangtong: { hat: "scholar", beard: "bushy", fan: true },
  fazheng: { hat: "scholar", beard: "mustache", fan: false },
  lvbu: { hat: "phoenix", beard: "none", plume: "#fbbf24", skin: "#d9b083" },
  caocao: { hat: "crown", beard: "full", skin: "#e0bd97" },
  dongzhuo: { hat: "crown", beard: "bushy", skin: "#c99a6d" },
  yuanshao: { hat: "crown", beard: "full", skin: "#e7c6a0" },
  yuanshu: { hat: "crown", beard: "goatee", skin: "#e2bd93" },
  liuzhang: { hat: "crown", beard: "mustache", skin: "#e5c49d" },
  zhangjiao: { hat: "band", beard: "long", skin: "#cbb08a", plume: "#facc15" },
  zhangbao: { hat: "band", beard: "full", plume: "#facc15" },
  zhangliang: { hat: "band", beard: "mustache", plume: "#facc15" },
  simayi: { hat: "crown", beard: "goatee", fan: false, skin: "#e4c19b" },
  zhangliao: { hat: "helmet", beard: "full", plume: "#c7d2fe" },
  ganning: { hat: "helmet", beard: "bushy", plume: "#fdba74" },
  taishici: { hat: "helmet", beard: "full", plume: "#a5f3fc" },
  huaxiong: { hat: "helmet", beard: "bushy", plume: "#fecaca" },
  zhanghe: { hat: "helmet", beard: "goatee", plume: "#d9f99d" },
  xiahoudun: { hat: "helmet", beard: "full", plume: "#93c5fd" },
  xiahouyuan: { hat: "helmet", beard: "goatee", plume: "#bfdbfe" },
  caoren: { hat: "helmet", beard: "full", plume: "#93c5fd" },
  yanliang: { hat: "helmet", beard: "bushy", plume: "#fecaca" },
  wenchou: { hat: "helmet", beard: "bushy", plume: "#fca5a5" },
  gaolan: { hat: "helmet", beard: "full", plume: "#fcd34d" },
  xuhuang: { hat: "helmet", beard: "full", plume: "#bfdbfe" },
  caohong: { hat: "helmet", beard: "mustache", plume: "#dbeafe" },
  guohuai: { hat: "helmet", beard: "goatee", plume: "#c7d2fe" },
  sunli: { hat: "helmet", beard: "none", plume: "#e0e7ff" },
  jiling: { hat: "helmet", beard: "bushy", plume: "#fde68a" },
  qiaorui: { hat: "helmet", beard: "full", plume: "#fef08a" },
  zhangxun: { hat: "helmet", beard: "mustache", plume: "#fde68a" },
  gaoshun: { hat: "helmet", beard: "full", plume: "#ddd6fe" },
  chengong: { hat: "scholar", beard: "goatee", fan: true },
  caoxing: { hat: "helmet", beard: "none", plume: "#d8b4fe" },
  caimao: { hat: "cap", beard: "full", plume: "#99f6e4" },
  zhangyun: { hat: "cap", beard: "mustache", plume: "#5eead4" },
  liukui: { hat: "helmet", beard: "full", plume: "#d9f99d" },
  lengbao: { hat: "helmet", beard: "bushy", plume: "#ecfccb" },
  zhangren: { hat: "helmet", beard: "goatee", plume: "#fdba74" },
  yanyan: { hat: "helmet", beard: "long", skin: "#cfa07a", plume: "#fcd34d" },
  chengyuanzhi: { hat: "band", beard: "bushy", plume: "#fde68a" },
  dengmao: { hat: "band", beard: "full", plume: "#fef3c7" },
  huangjin_lishi: { hat: "band", beard: "none", plume: "#fde68a" },
  lisu: { hat: "helmet", beard: "goatee", plume: "#e7e5e4" },
  huzhen: { hat: "helmet", beard: "full", plume: "#d6d3d1" },
  chezhou: { hat: "cap", beard: "mustache", plume: "#d9f99d" },
  caobao: { hat: "helmet", beard: "none", plume: "#bef264" },
};

export function portraitTraitsFor(def: SagaGeneralDef): PortraitTraits {
  const roll = hashId(def.id);
  const base: PortraitTraits = {
    skin: SKIN_TONES[Math.floor(roll * SKIN_TONES.length)] ?? SKIN_TONES[0],
    hat: def.intellect >= 88 && def.force < 82 ? "scholar" : "helmet",
    beard:
      def.force >= 90
        ? "full"
        : def.intellect >= 88
          ? "goatee"
          : roll > 0.62
            ? "mustache"
            : "none",
    robe: def.color,
    accent: def.accent,
    plume: def.accent,
    fan: def.intellect >= 92 && def.force < 82,
    bigEars: false,
  };
  return { ...base, ...SPECIAL[def.id] };
}

const ARMOR_TIER: Record<string, 1 | 2 | 3> = {
  cloth: 1,
  leather: 1,
  iron_armor: 2,
  heavy_armor: 3,
};

function armorTier(armor: string | null | undefined): 0 | 1 | 2 | 3 {
  if (!armor) return 0;
  if (armor === "leather") return 1;
  return ARMOR_TIER[armor] ?? 0;
}

function drawWeapon(traits: PortraitTraits, weapon: string | null | undefined): void {
  const shaft = "#4d3a24";
  const steel = "#d8d2c0";
  const darkSteel = "#9aa0a6";
  const kind =
    weapon ??
    (traits.fan ? "fan" : traits.beard === "long" ? "guandao" : "spear");
  if (kind === "fan") return;
  if (kind === "guandao") {
    ctxStroke(shaft, 4, 22, 138, 34, 20);
    ctxFill(steel, () => {
      c.moveTo(34, 20);
      c.quadraticCurveTo(58, 12, 62, 30);
      c.quadraticCurveTo(48, 26, 36, 32);
      c.closePath();
    });
    ctxStroke(traits.accent, 2, 62, 30, 50, 34);
    return;
  }
  if (kind === "blade") {
    ctxStroke(shaft, 4, 24, 140, 34, 42);
    ctxFill(steel, () => {
      c.moveTo(34, 42);
      c.lineTo(52, 22);
      c.lineTo(58, 27);
      c.lineTo(38, 50);
      c.closePath();
    });
    return;
  }
  if (kind === "spear") {
    ctxStroke(shaft, 3, 26, 142, 36, 18);
    ctxFill(steel, () => {
      c.moveTo(36, 18);
      c.lineTo(41, 2);
      c.lineTo(45, 18);
      c.closePath();
    });
    ctxFill(traits.accent, () => {
      c.fillRect(32, 20, 16, 4);
    });
    return;
  }
  if (kind === "iron_sword") {
    ctxStroke(shaft, 5, 20, 118, 32, 56);
    ctxFill(steel, () => {
      c.moveTo(31, 56);
      c.lineTo(46, 28);
      c.lineTo(51, 32);
      c.lineTo(36, 60);
      c.closePath();
    });
    ctxFill(darkSteel, () => {
      c.fillRect(28, 58, 14, 4);
    });
    return;
  }
}

let c: CanvasRenderingContext2D;

function ctxFill(color: string, path: () => void): void {
  c.fillStyle = color;
  c.beginPath();
  path();
  c.fill();
}

function ctxStroke(
  color: string,
  width: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): void {
  c.strokeStyle = color;
  c.lineWidth = width;
  c.lineCap = "round";
  c.beginPath();
  c.moveTo(x1, y1);
  c.lineTo(x2, y2);
  c.stroke();
}

function roundRectPath(x: number, y: number, w: number, h: number, r: number): void {
  const radius = Math.min(r, w / 2, h / 2);
  c.beginPath();
  c.moveTo(x + radius, y);
  c.arcTo(x + w, y, x + w, y + h, radius);
  c.arcTo(x + w, y + h, x, y + h, radius);
  c.arcTo(x, y + h, x, y, radius);
  c.arcTo(x, y, x + w, y, radius);
  c.closePath();
}

function drawFace(traits: PortraitTraits): void {
  // 脖子与脸
  ctxFill(traits.skin, () => {
    c.fillRect(49, 84, 22, 20);
  });
  const face = c.createLinearGradient(38, 38, 82, 96);
  face.addColorStop(0, traits.skin);
  face.addColorStop(1, shade(traits.skin, -18));
  c.fillStyle = face;
  c.beginPath();
  c.ellipse(60, 64, 23, 28, 0, 0, Math.PI * 2);
  c.fill();

  if (traits.bigEars) {
    c.fillStyle = traits.skin;
    c.beginPath();
    c.ellipse(35, 67, 6, 10, -0.2, 0, Math.PI * 2);
    c.ellipse(85, 67, 6, 10, 0.2, 0, Math.PI * 2);
    c.fill();
  }

  // 鬓发
  c.fillStyle = "#241d16";
  c.beginPath();
  c.ellipse(38, 58, 5, 14, 0.12, 0, Math.PI * 2);
  c.ellipse(82, 58, 5, 14, -0.12, 0, Math.PI * 2);
  c.fill();

  // 眉
  const stern = traits.hat === "helmet" || traits.hat === "phoenix";
  c.strokeStyle = "#241d16";
  c.lineWidth = 2.4;
  c.lineCap = "round";
  c.beginPath();
  c.moveTo(46, 55);
  c.lineTo(55, stern ? 52 : 54);
  c.moveTo(74, 55);
  c.lineTo(65, stern ? 52 : 54);
  c.stroke();

  // 眼
  c.fillStyle = "#201a13";
  c.beginPath();
  c.ellipse(51, 61, 3.2, 2.1, 0, 0, Math.PI * 2);
  c.ellipse(69, 61, 3.2, 2.1, 0, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = "rgba(255,255,255,0.7)";
  c.fillRect(52, 60, 1.4, 1.2);
  c.fillRect(70, 60, 1.4, 1.2);

  // 鼻与口
  c.strokeStyle = shade(traits.skin, -38);
  c.lineWidth = 1.4;
  c.beginPath();
  c.moveTo(60, 64);
  c.lineTo(58, 72);
  c.lineTo(62, 72);
  c.stroke();
  c.strokeStyle = "#6e3d33";
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(54, 81);
  c.quadraticCurveTo(60, 84, 66, 81);
  c.stroke();

  drawBeard(traits, shade(traits.skin, -8));
}

function drawBeard(traits: PortraitTraits, base: string): void {
  const hair = "#221b15";
  if (traits.beard === "none") return;
  if (traits.beard === "mustache") {
    c.strokeStyle = hair;
    c.lineWidth = 3.4;
    c.lineCap = "round";
    c.beginPath();
    c.moveTo(52, 78);
    c.quadraticCurveTo(60, 82, 68, 78);
    c.stroke();
    return;
  }
  c.fillStyle = hair;
  if (traits.beard === "goatee") {
    c.beginPath();
    c.moveTo(55, 84);
    c.quadraticCurveTo(60, 92, 65, 84);
    c.quadraticCurveTo(60, 88, 55, 84);
    c.fill();
    c.beginPath();
    c.moveTo(56, 88);
    c.quadraticCurveTo(60, 108, 64, 88);
    c.quadraticCurveTo(60, 94, 56, 88);
    c.fill();
    c.strokeStyle = hair;
    c.lineWidth = 2.4;
    c.beginPath();
    c.moveTo(53, 79);
    c.quadraticCurveTo(60, 83, 67, 79);
    c.stroke();
    return;
  }
  if (traits.beard === "full") {
    c.beginPath();
    c.moveTo(39, 72);
    c.quadraticCurveTo(42, 98, 60, 104);
    c.quadraticCurveTo(78, 98, 81, 72);
    c.quadraticCurveTo(72, 88, 60, 88);
    c.quadraticCurveTo(48, 88, 39, 72);
    c.fill();
    return;
  }
  if (traits.beard === "bushy") {
    c.beginPath();
    c.ellipse(46, 84, 9, 12, 0.25, 0, Math.PI * 2);
    c.ellipse(74, 84, 9, 12, -0.25, 0, Math.PI * 2);
    c.ellipse(60, 96, 14, 12, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = base;
    c.beginPath();
    c.ellipse(60, 84, 7, 5, 0, 0, Math.PI * 2);
    c.fill();
    return;
  }
  // long：关羽式的长髯
  c.beginPath();
  c.moveTo(46, 82);
  c.quadraticCurveTo(42, 112, 54, 132);
  c.quadraticCurveTo(60, 120, 66, 132);
  c.quadraticCurveTo(78, 112, 74, 82);
  c.quadraticCurveTo(60, 94, 46, 82);
  c.fill();
  c.strokeStyle = "rgba(255,255,255,0.16)";
  c.lineWidth = 1;
  for (let i = 0; i < 4; i++) {
    c.beginPath();
    c.moveTo(54 + i * 3, 92);
    c.quadraticCurveTo(52 + i * 4, 112, 56 + i * 3, 124);
    c.stroke();
  }
}

function drawHat(traits: PortraitTraits): void {
  const hair = "#241d16";
  const accent = traits.accent;
  if (traits.hat === "crown") {
    c.fillStyle = hair;
    c.beginPath();
    c.arc(60, 42, 24, Math.PI, 0);
    c.fill();
    c.fillStyle = "#2b2620";
    c.fillRect(34, 38, 52, 9);
    c.fillStyle = "#1b1814";
    c.fillRect(38, 24, 44, 6);
    c.fillStyle = accent;
    for (let i = 0; i < 5; i++) {
      c.beginPath();
      c.arc(44 + i * 8, 35, 2.4, 0, Math.PI * 2);
      c.fill();
    }
    c.strokeStyle = accent;
    c.lineWidth = 1;
    for (let i = 0; i < 5; i++) {
      c.beginPath();
      c.moveTo(44 + i * 8, 40);
      c.lineTo(44 + i * 8, 48);
      c.stroke();
    }
    return;
  }
  if (traits.hat === "band") {
    c.fillStyle = "#d6b23c";
    c.fillRect(34, 38, 52, 10);
    c.beginPath();
    c.moveTo(84, 44);
    c.lineTo(96, 58);
    c.lineTo(88, 58);
    c.closePath();
    c.fill();
    c.fillStyle = "rgba(0,0,0,0.18)";
    c.fillRect(34, 44, 52, 4);
    c.fillStyle = hair;
    c.beginPath();
    c.arc(60, 40, 22, Math.PI, 0);
    c.fill();
    return;
  }
  if (traits.hat === "scholar") {
    c.fillStyle = "#2f3a45";
    c.beginPath();
    c.moveTo(35, 46);
    c.quadraticCurveTo(36, 24, 60, 22);
    c.quadraticCurveTo(84, 24, 85, 46);
    c.lineTo(78, 46);
    c.quadraticCurveTo(76, 34, 60, 33);
    c.quadraticCurveTo(44, 34, 42, 46);
    c.closePath();
    c.fill();
    c.fillStyle = accent;
    c.fillRect(38, 44, 44, 3);
    c.fillStyle = "#2f3a45";
    c.beginPath();
    c.moveTo(82, 40);
    c.lineTo(94, 52);
    c.lineTo(88, 54);
    c.closePath();
    c.fill();
    return;
  }
  if (traits.hat === "cap") {
    c.fillStyle = "#2b2620";
    c.fillRect(38, 36, 44, 9);
    c.beginPath();
    c.moveTo(42, 36);
    c.quadraticCurveTo(60, 22, 78, 36);
    c.closePath();
    c.fill();
    c.fillStyle = accent;
    c.fillRect(38, 43, 44, 3);
    return;
  }
  if (traits.hat === "bun") {
    c.fillStyle = hair;
    c.beginPath();
    c.arc(60, 38, 22, Math.PI, 0);
    c.fill();
    c.beginPath();
    c.arc(60, 22, 9, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = accent;
    c.fillRect(50, 19, 20, 3);
    return;
  }
  if (traits.hat === "scarf") {
    c.fillStyle = traits.robe;
    c.beginPath();
    c.moveTo(34, 48);
    c.quadraticCurveTo(36, 20, 60, 18);
    c.quadraticCurveTo(84, 20, 86, 48);
    c.lineTo(78, 52);
    c.quadraticCurveTo(76, 32, 60, 31);
    c.quadraticCurveTo(44, 32, 42, 52);
    c.closePath();
    c.fill();
    c.fillStyle = "rgba(0,0,0,0.2)";
    c.fillRect(38, 46, 44, 4);
    return;
  }

  // 兜鍪 / 凤翅盔
  const helm = c.createLinearGradient(38, 22, 82, 52);
  helm.addColorStop(0, "#6f6a5e");
  helm.addColorStop(0.5, "#4a453c");
  helm.addColorStop(1, "#2b2822");
  c.fillStyle = helm;
  c.beginPath();
  c.arc(60, 42, 25, Math.PI, 0);
  c.lineTo(85, 48);
  c.lineTo(78, 52);
  c.lineTo(42, 52);
  c.lineTo(35, 48);
  c.closePath();
  c.fill();
  c.fillStyle = "#2b2822";
  c.fillRect(35, 46, 50, 5);
  c.fillStyle = accent;
  c.fillRect(52, 44, 16, 3);
  // 盔缨
  c.fillStyle = traits.plume;
  c.beginPath();
  c.moveTo(60, 18);
  c.quadraticCurveTo(58, 4, 62, 0);
  c.quadraticCurveTo(66, 10, 64, 18);
  c.closePath();
  c.fill();
  if (traits.hat === "phoenix") {
    c.strokeStyle = traits.plume;
    c.lineWidth = 3;
    c.lineCap = "round";
    c.beginPath();
    c.moveTo(56, 24);
    c.quadraticCurveTo(36, 6, 26, 14);
    c.moveTo(64, 24);
    c.quadraticCurveTo(84, 6, 94, 14);
    c.stroke();
  }
  // 护耳
  c.fillStyle = "#3b372f";
  c.fillRect(33, 48, 7, 14);
  c.fillRect(80, 48, 7, 14);
}

function drawArmor(traits: PortraitTraits, tier: 0 | 1 | 2 | 3): void {
  const robe = c.createLinearGradient(30, 96, 90, 150);
  robe.addColorStop(0, traits.robe);
  robe.addColorStop(1, shade(traits.robe, -42));
  c.fillStyle = robe;
  c.beginPath();
  c.moveTo(16, 150);
  c.lineTo(20, 112);
  c.quadraticCurveTo(60, 84, 100, 112);
  c.lineTo(104, 150);
  c.closePath();
  c.fill();

  // 衣襟
  c.fillStyle = "rgba(255,255,255,0.14)";
  c.beginPath();
  c.moveTo(60, 96);
  c.lineTo(44, 150);
  c.lineTo(52, 150);
  c.lineTo(64, 102);
  c.closePath();
  c.fill();
  c.strokeStyle = traits.accent;
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(46, 104);
  c.lineTo(60, 98);
  c.lineTo(74, 104);
  c.stroke();

  if (tier === 0) {
    c.strokeStyle = "rgba(0,0,0,0.18)";
    c.lineWidth = 1.2;
    for (let i = 0; i < 3; i++) {
      c.beginPath();
      c.moveTo(26 + i * 4, 116 + i * 10);
      c.quadraticCurveTo(60, 128 + i * 8, 94 - i * 4, 116 + i * 10);
      c.stroke();
    }
    return;
  }

  const steel = tier >= 2;
  const plate = steel
    ? c.createLinearGradient(30, 98, 90, 132)
    : c.createLinearGradient(30, 98, 90, 132);
  if (steel) {
    plate.addColorStop(0, tier === 3 ? "#6f7378" : "#8b9097");
    plate.addColorStop(0.5, tier === 3 ? "#3f444a" : "#5d6268");
    plate.addColorStop(1, tier === 3 ? "#23262b" : "#353a3f");
  } else {
    plate.addColorStop(0, "#8a5a36");
    plate.addColorStop(1, "#4a2f1b");
  }
  c.fillStyle = plate;
  c.beginPath();
  c.moveTo(20, 116);
  c.quadraticCurveTo(60, 92, 100, 116);
  c.lineTo(102, 136);
  c.quadraticCurveTo(60, 122, 18, 136);
  c.closePath();
  c.fill();

  // 肩吞
  for (const dir of [-1, 1] as const) {
    const sx = 60 + dir * 34;
    c.fillStyle = steel ? (tier === 3 ? "#2a2d31" : "#4b5056") : "#5a3a22";
    c.beginPath();
    c.ellipse(sx, 116, 15, 10, dir * 0.35, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = traits.accent;
    c.beginPath();
    c.arc(sx, 114, tier === 3 ? 5 : 3.4, 0, Math.PI * 2);
    c.fill();
  }
  if (steel) {
    c.strokeStyle = "rgba(230,235,240,0.32)";
    c.lineWidth = 1;
    for (let i = 0; i < 4; i++) {
      c.beginPath();
      c.moveTo(30 + i * 15, 116);
      c.lineTo(30 + i * 15, 136);
      c.stroke();
    }
    c.fillStyle = "rgba(230,235,240,0.5)";
    for (let i = 0; i < 4; i++) {
      c.beginPath();
      c.arc(34 + i * 15, 128, 1.4, 0, Math.PI * 2);
      c.fill();
    }
  } else {
    c.strokeStyle = "rgba(255,220,170,0.35)";
    c.setLineDash([2, 3]);
    c.beginPath();
    c.moveTo(24, 124);
    c.quadraticCurveTo(60, 110, 96, 124);
    c.stroke();
    c.setLineDash([]);
  }
  if (tier === 3) {
    // 重铠的立领与金边
    c.fillStyle = "#1d2024";
    c.beginPath();
    c.moveTo(44, 100);
    c.lineTo(60, 94);
    c.lineTo(76, 100);
    c.lineTo(72, 112);
    c.lineTo(60, 106);
    c.lineTo(48, 112);
    c.closePath();
    c.fill();
    c.strokeStyle = "#c9a15a";
    c.lineWidth = 1.6;
    c.beginPath();
    c.moveTo(44, 100);
    c.lineTo(60, 94);
    c.lineTo(76, 100);
    c.stroke();
  }
}

function drawFan(traits: PortraitTraits): void {
  if (!traits.fan) return;
  c.save();
  c.translate(88, 122);
  c.rotate(-0.35);
  c.fillStyle = "rgba(238,232,214,0.95)";
  c.beginPath();
  c.moveTo(0, 0);
  c.arc(0, 0, 26, -1.9, -0.35);
  c.closePath();
  c.fill();
  c.strokeStyle = "rgba(120,110,90,0.7)";
  c.lineWidth = 1;
  for (let i = 0; i < 5; i++) {
    c.beginPath();
    c.moveTo(0, 0);
    c.lineTo(Math.cos(-1.9 + i * 0.36) * 26, Math.sin(-1.9 + i * 0.36) * 26);
    c.stroke();
  }
  c.fillStyle = "#6b4a2c";
  c.fillRect(-2, -2, 4, 22);
  c.restore();
}

function shade(hex: string, delta: number): string {
  const raw = hex.replace("#", "");
  if (raw.length !== 6) return hex;
  const value = Number.parseInt(raw, 16);
  const r = Math.max(0, Math.min(255, ((value >> 16) & 0xff) + delta));
  const g = Math.max(0, Math.min(255, ((value >> 8) & 0xff) + delta));
  const b = Math.max(0, Math.min(255, (value & 0xff) + delta));
  return `rgb(${r},${g},${b})`;
}

/** 在给定矩形里画一张胸像；所有立绘共用 120×150 的内部坐标。 */
export function paintTraitsPortrait(
  ctx: CanvasRenderingContext2D,
  traits: PortraitTraits,
  gear: PortraitGear,
  box: PortraitBox,
): void {
  c = ctx;
  const scale = Math.min(box.w / 120, box.h / 150);
  ctx.save();
  ctx.translate(box.x + (box.w - 120 * scale) / 2, box.y + (box.h - 150 * scale) / 2);
  ctx.scale(scale, scale);
  ctx.beginPath();
  ctx.rect(0, 0, 120, 150);
  ctx.clip();

  const bg = ctx.createLinearGradient(0, 0, 120, 150);
  bg.addColorStop(0, shade(traits.robe, -36));
  bg.addColorStop(0.62, "#1b1a18");
  bg.addColorStop(1, "#0e0e0d");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 120, 150);

  const glow = ctx.createRadialGradient(60, 56, 6, 60, 62, 70);
  glow.addColorStop(0, `${traits.accent}55`);
  glow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 120, 150);

  // 背后的淡墨圆与山影
  ctx.strokeStyle = "rgba(232,213,171,0.14)";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(60, 56, 42, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = "rgba(0,0,0,0.18)";
  ctx.beginPath();
  ctx.moveTo(0, 150);
  ctx.lineTo(20, 120);
  ctx.lineTo(44, 142);
  ctx.lineTo(72, 112);
  ctx.lineTo(120, 150);
  ctx.closePath();
  ctx.fill();

  drawWeapon(traits, gear.weapon);
  drawArmor(traits, armorTier(gear.armor));
  drawFace(traits);
  drawHat(traits);
  drawFan(traits);

  ctx.strokeStyle = "rgba(202,161,90,0.55)";
  ctx.lineWidth = 1.5;
  roundRectPath(0.75, 0.75, 118.5, 148.5, 10);
  ctx.stroke();
  ctx.restore();
}

export function paintPortrait(
  ctx: CanvasRenderingContext2D,
  def: SagaGeneralDef,
  gear: PortraitGear,
  box: PortraitBox,
): void {
  paintTraitsPortrait(ctx, portraitTraitsFor(def), gear, box);
}

export const NPC_HATS: PortraitHat[] = ["cap", "bun", "scarf", "scholar", "band"];

const NPC_LOOKS: Record<
  string,
  { hat: PortraitHat; robe: string; accent: string; beard: PortraitBeard; skin: string }
> = {
  blacksmith: { hat: "band", robe: "#5b4636", accent: "#d9a05b", beard: "bushy", skin: "#c99568" },
  herbalist: { hat: "bun", robe: "#5f6b4a", accent: "#d7e0a8", beard: "none", skin: "#d7b48c" },
  innkeeper: { hat: "scarf", robe: "#7a4b4b", accent: "#f0c9a0", beard: "none", skin: "#e2bd97" },
  banker: { hat: "cap", robe: "#3f4a5a", accent: "#d9c078", beard: "goatee", skin: "#dcb389" },
  quartermaster: { hat: "cap", robe: "#4a4335", accent: "#c9a15a", beard: "mustache", skin: "#cb9d70" },
  drillmaster: { hat: "scholar", robe: "#4a4a55", accent: "#bfc7d6", beard: "goatee", skin: "#e0bd97" },
  tavernkeeper: { hat: "bun", robe: "#6a5a3c", accent: "#e8d5ab", beard: "full", skin: "#c99a6d" },
  tentkeeper: { hat: "cap", robe: "#3f5245", accent: "#d7c48a", beard: "mustache", skin: "#e3bc94" },
  recordkeeper: { hat: "scholar", robe: "#4b4030", accent: "#d9c9a0", beard: "long", skin: "#cfa07a" },
  villager: { hat: "band", robe: "#6b6250", accent: "#cfc3a0", beard: "mustache", skin: "#cb9d70" },
  taoist: { hat: "scholar", robe: "#4a5a63", accent: "#a8d8d0", beard: "long", skin: "#e0c7a3" },
  boatman: { hat: "bun", robe: "#4f5a48", accent: "#c9b98a", beard: "bushy", skin: "#b9895f" },
};

/** 城里 NPC 的立绘：没有武将数值，只按 id 取一副固定的衣着面相。 */
export function npcTraitsFor(id: string): PortraitTraits {
  const look = NPC_LOOKS[id];
  if (look) {
    return { ...look, plume: look.accent, fan: false, bigEars: false };
  }
  const roll = hashId(id);
  return {
    skin: SKIN_TONES[Math.floor(roll * SKIN_TONES.length)] ?? SKIN_TONES[0],
    hat: NPC_HATS[Math.floor(roll * NPC_HATS.length)] ?? "cap",
    beard: roll > 0.67 ? "mustache" : roll > 0.34 ? "goatee" : "none",
    robe: "#5a5444",
    accent: "#d9c9a0",
    plume: "#d9c9a0",
    fan: false,
    bigEars: false,
  };
}

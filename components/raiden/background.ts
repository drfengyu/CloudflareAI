import type { StageTheme } from "./stages";

/**
 * 程序化纵版卷轴背景。没有任何图片资源：
 * 基础色块/星空/海面预先画进离屏画布，海岸线、楼群、空间站桁架按滚动距离实时绘制。
 */

const W = 480;
const H = 720;

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeBase(theme: StageTheme): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  if (theme === "coast") {
    const sea = ctx.createLinearGradient(0, 0, 0, H);
    sea.addColorStop(0, "#0a3350");
    sea.addColorStop(0.45, "#0a2a47");
    sea.addColorStop(1, "#061a2e");
    ctx.fillStyle = sea;
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "rgba(120, 200, 230, 0.10)";
    ctx.lineWidth = 1;
    for (let y = -12; y < H + 24; y += 26) {
      ctx.beginPath();
      for (let x = 0; x <= W; x += 24) {
        const wave = Math.sin((x + y) * 0.035) * 2.4;
        if (x === 0) ctx.moveTo(x, y + wave);
        else ctx.lineTo(x, y + wave);
      }
      ctx.stroke();
    }
    const glow = ctx.createRadialGradient(W * 0.7, H * 0.16, 20, W * 0.7, H * 0.16, 300);
    glow.addColorStop(0, "rgba(255, 190, 120, 0.16)");
    glow.addColorStop(1, "rgba(255, 190, 120, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);
  } else if (theme === "city") {
    const ground = ctx.createLinearGradient(0, 0, 0, H);
    ground.addColorStop(0, "#120d1a");
    ground.addColorStop(0.5, "#150f1e");
    ground.addColorStop(1, "#0c0911");
    ctx.fillStyle = ground;
    ctx.fillRect(0, 0, W, H);
    for (const x of [56, 240, 424]) {
      ctx.fillStyle = "#0a0810";
      ctx.fillRect(x - 26, 0, 52, H);
      ctx.strokeStyle = "rgba(255, 180, 80, 0.10)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x - 22, 0);
      ctx.lineTo(x - 22, H);
      ctx.moveTo(x + 22, 0);
      ctx.lineTo(x + 22, H);
      ctx.stroke();
    }
  } else {
    const space = ctx.createLinearGradient(0, 0, 0, H);
    space.addColorStop(0, "#03040c");
    space.addColorStop(0.6, "#060819");
    space.addColorStop(1, "#0a0d24");
    ctx.fillStyle = space;
    ctx.fillRect(0, 0, W, H);
    const rand = mulberry32(913);
    for (let i = 0; i < 220; i += 1) {
      const x = rand() * W;
      const y = rand() * H;
      const r = rand() < 0.86 ? 0.6 + rand() * 0.9 : 1.4 + rand() * 1.4;
      const alpha = 0.25 + rand() * 0.7;
      ctx.fillStyle = `rgba(${180 + Math.floor(rand() * 70)}, ${200 + Math.floor(rand() * 55)}, 255, ${alpha})`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    const nebula = ctx.createRadialGradient(W * 0.25, H * 0.28, 10, W * 0.25, H * 0.28, 260);
    nebula.addColorStop(0, "rgba(90, 60, 180, 0.18)");
    nebula.addColorStop(1, "rgba(90, 60, 180, 0)");
    ctx.fillStyle = nebula;
    ctx.fillRect(0, 0, W, H);
  }
  return canvas;
}

function drawCoast(ctx: CanvasRenderingContext2D, scroll: number, time: number): void {
  // 远景岛屿：视差 0.2，缓慢下移。
  const far = scroll * 0.2;
  for (let i = -1; i < 4; i += 1) {
    const y = ((i * 240 + far) % (H + 240)) - 120;
    const x = i % 2 === 0 ? 80 : 360;
    ctx.fillStyle = "rgba(20, 54, 58, 0.55)";
    ctx.beginPath();
    ctx.ellipse(x, y, 74 + (i % 3) * 12, 20, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(40, 90, 70, 0.4)";
    ctx.beginPath();
    ctx.ellipse(x + 10, y - 6, 46, 12, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // 海岸线：用两个正弦叠加，随滚动连续变化，两边对称。
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(side < 0 ? 0 : W, 0);
    for (let y = 0; y <= H + 20; y += 18) {
      const world = y + scroll;
      const edge =
        54 +
        26 * Math.sin(world * 0.0062 + (side < 0 ? 0.4 : 2.6)) +
        13 * Math.sin(world * 0.017 + (side < 0 ? 1.7 : 4.1));
      const x = side < 0 ? edge : W - edge;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(side < 0 ? 0 : W, H + 20);
    ctx.closePath();
    ctx.fillStyle = "#10251c";
    ctx.fill();
    ctx.strokeStyle = "#c9b47c";
    ctx.lineWidth = 7;
    ctx.stroke();
    ctx.strokeStyle = "rgba(70, 150, 110, 0.6)";
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  // 海面反光：随滚动下移的短横线。
  for (let i = 0; i < 26; i += 1) {
    const seed = i * 97.7;
    const y = ((i * 34 + scroll * 0.7) % (H + 40)) - 20;
    const x = (Math.sin(seed) * 0.5 + 0.5) * (W - 60) + 30;
    const len = 10 + (i % 5) * 7;
    ctx.strokeStyle = `rgba(140, 220, 240, ${0.05 + (i % 4) * 0.02})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x - len / 2, y);
    ctx.lineTo(x + len / 2, y);
    ctx.stroke();
  }

  // 沿岸码头/哨塔，跟着海岸线一起滚动。
  for (let k = -1; k < 5; k += 1) {
    const worldY = k * 190 + 40;
    const y = worldY - (scroll % (190 * 2));
    if (y < -60 || y > H + 60) continue;
    for (const side of [-1, 1]) {
      const world = y + scroll;
      const edge =
        54 +
        26 * Math.sin(world * 0.0062 + (side < 0 ? 0.4 : 2.6)) +
        13 * Math.sin(world * 0.017 + (side < 0 ? 1.7 : 4.1));
      const x = side < 0 ? edge - 16 : W - edge + 16;
      ctx.fillStyle = "#1d3328";
      ctx.fillRect(x - 18, y, 36, 12);
      ctx.fillStyle = "#31493a";
      ctx.fillRect(x - 6, y - 16, 12, 16);
      ctx.fillStyle = "rgba(255, 190, 90, 0.8)";
      ctx.fillRect(x - 2, y - 13, 4, 4);
    }
  }

  // 岸防工事：混凝土炮位、探照灯、货柜堆。
  for (let k = -1; k < 4; k += 1) {
    const worldY = k * 260 + 150;
    const y = worldY - (scroll % 520);
    if (y < -80 || y > H + 80) continue;
    for (const side of [-1, 1]) {
      const world = y + scroll;
      const edge =
        54 +
        26 * Math.sin(world * 0.0062 + (side < 0 ? 0.4 : 2.6)) +
        13 * Math.sin(world * 0.017 + (side < 0 ? 1.7 : 4.1));
      const baseX = side < 0 ? edge - 34 : W - edge + 34;
      const rand = mulberry32(Math.floor(worldY) * 13 + (side > 0 ? 7 : 3) + 101);

      ctx.fillStyle = "#2a332c";
      ctx.beginPath();
      ctx.moveTo(baseX - 20, y + 8);
      ctx.lineTo(baseX - 14, y - 8);
      ctx.lineTo(baseX + 14, y - 8);
      ctx.lineTo(baseX + 20, y + 8);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "rgba(150, 180, 150, 0.25)";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = "#0c120f";
      ctx.fillRect(baseX - 9, y - 3, 18, 5);

      ctx.save();
      ctx.translate(baseX + 2, y - 8);
      const aim = Math.sin(world * 0.01 + time * 0.7) * 0.5 - 0.35;
      ctx.rotate(aim);
      ctx.fillStyle = "#435144";
      ctx.fillRect(-2, -16, 4, 16);
      ctx.restore();

      if (rand() > 0.45) {
        ctx.save();
        ctx.translate(baseX - side * 26, y + 2);
        const sweep = Math.sin(time * 0.9 + worldY) * 0.6;
        const beam = ctx.createLinearGradient(
          0,
          0,
          side * Math.cos(sweep) * 120,
          -90 + Math.sin(sweep) * 40,
        );
        beam.addColorStop(0, "rgba(255, 245, 200, 0.16)");
        beam.addColorStop(1, "rgba(255, 245, 200, 0)");
        ctx.fillStyle = beam;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(side * Math.cos(sweep) * 120 - 14, -90 + Math.sin(sweep) * 40);
        ctx.lineTo(side * Math.cos(sweep) * 120 + 14, -90 + Math.sin(sweep) * 40);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "#1a211c";
        ctx.fillRect(-4, -6, 8, 8);
        ctx.fillStyle = "rgba(255, 245, 200, 0.8)";
        ctx.fillRect(-2, -5, 4, 4);
        ctx.restore();
      }

      if (rand() > 0.5) {
        const cw = 13;
        for (let c = 0; c < 3; c += 1) {
          ctx.fillStyle = ["#5a3a2a", "#2f4a44", "#4a4430"][c];
          ctx.fillRect(baseX + side * (24 + c * 3) - cw / 2, y - 6 - c * 8, cw, 7);
        }
      }
    }
  }

  // 巡逻艇与尾流。
  for (let i = 0; i < 3; i += 1) {
    const y = ((i * 260 + scroll * 0.9) % (H + 260)) - 80;
    const x = 150 + (i % 2) * 180;
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = "rgba(30, 55, 60, 0.9)";
    ctx.beginPath();
    ctx.moveTo(-16, -6);
    ctx.lineTo(16, -6);
    ctx.lineTo(10, 6);
    ctx.lineTo(-10, 6);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#1b2f34";
    ctx.fillRect(-4, -14, 8, 9);
    ctx.strokeStyle = "rgba(180, 230, 240, 0.25)";
    ctx.beginPath();
    ctx.moveTo(-22, 8);
    ctx.lineTo(-8, 8);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(22, 10);
    ctx.lineTo(6, 10);
    ctx.stroke();
    ctx.restore();
  }

  // 水面上的细碎波光，随时间闪烁。
  for (let i = 0; i < 14; i += 1) {
    const x = 120 + ((i * 89) % 260);
    const y = ((i * 53 + scroll * 1.3) % H + H) % H;
    const a = 0.12 + 0.08 * Math.sin(time * 3 + i);
    ctx.fillStyle = `rgba(200, 245, 255, ${a})`;
    ctx.fillRect(x, y, 2, 6);
  }
}

function drawCity(ctx: CanvasRenderingContext2D, scroll: number, time: number): void {
  const rows = 8;
  const bandH = 132;
  const offset = scroll % bandH;
  for (let row = -1; row < rows; row += 1) {
    const y = row * bandH + offset;
    const r = ((Math.floor((scroll + row * bandH) / bandH) % 97) + 97) % 97;
    const rand = mulberry32(r * 31 + 7);
    // 左右两片楼群，留出中间与道路。
    for (const side of [-1, 1]) {
      let x = side < 0 ? 82 : 266;
      for (let b = 0; b < 3; b += 1) {
        const w = 28 + rand() * 28;
        const h = 44 + rand() * 58;
        if (x + w > (side < 0 ? 214 : 398)) break;
        const top = y - h;
        ctx.fillStyle = side < 0 ? "#1a1523" : "#191322";
        ctx.fillRect(x, top, w, h + 26);
        ctx.fillStyle = "rgba(255, 190, 90, 0.55)";
        for (let wy = top + 6; wy < y + 10; wy += 9) {
          for (let wx = x + 5; wx < x + w - 5; wx += 8) {
            if (rand() > 0.42) ctx.fillRect(wx, wy, 2.4, 3.2);
          }
        }
        ctx.fillStyle = "rgba(120, 170, 255, 0.10)";
        ctx.fillRect(x, top, w, 3);
        if (rand() > 0.7) {
          const rx = x + w * 0.5;
          ctx.fillStyle = "#2a2433";
          ctx.fillRect(rx - 1, top - 9, 2, 9);
          ctx.strokeStyle = "rgba(180, 200, 255, 0.35)";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.ellipse(rx, top - 10, 5, 2.4, -0.4, 0, Math.PI * 2);
          ctx.stroke();
        }
        x += w + 8;
      }
    }
    // 横向街道与路灯光斑。
    ctx.fillStyle = "rgba(10, 8, 14, 0.55)";
    ctx.fillRect(0, y + 14, W, 22);
    for (let i = 0; i < 6; i += 1) {
      const lx = 60 + i * 72;
      const glow = ctx.createRadialGradient(lx, y + 25, 1, lx, y + 25, 20);
      glow.addColorStop(0, "rgba(255, 170, 80, 0.18)");
      glow.addColorStop(1, "rgba(255, 170, 80, 0)");
      ctx.fillStyle = glow;
      ctx.fillRect(lx - 20, y + 5, 40, 40);
    }
  }

  // 街垒与装甲巡逻车。
  const propBand = 264;
  for (let k = -1; k < 4; k += 1) {
    const worldY = k * propBand + 90;
    const py = worldY - (scroll % propBand);
    if (py < -70 || py > H + 70) continue;
    const rand = mulberry32(Math.floor(worldY) * 17 + 53);
    for (const side of [-1, 1]) {
      const cx = side < 0 ? 116 : 364;
      ctx.save();
      ctx.translate(cx + (rand() - 0.5) * 16, py);
      ctx.fillStyle = "#343a33";
      ctx.fillRect(-22, -3, 44, 7);
      ctx.fillStyle = "rgba(255, 196, 80, 0.65)";
      for (let i = -2; i <= 2; i += 1) ctx.fillRect(i * 8 - 2, -3, 4, 7);
      ctx.fillStyle = "#191d18";
      ctx.fillRect(-6, -11, 12, 8);
      ctx.fillStyle = "#65755d";
      ctx.fillRect(-4, -9, 3, 3);
      ctx.restore();
    }
    const rand2 = mulberry32(Math.floor(worldY) * 29 + 11);
    if (rand2() > 0.35) {
      const vx = rand2() > 0.5 ? 182 : 298;
      ctx.save();
      ctx.translate(vx, py + 30);
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.beginPath();
      ctx.ellipse(2, 3, 20, 12, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#232a20";
      ctx.fillRect(-17, -11, 34, 7);
      ctx.fillRect(-17, 4, 34, 7);
      ctx.fillStyle = "#46523c";
      ctx.fillRect(-15, -7, 30, 12);
      ctx.fillStyle = "#5d6b50";
      ctx.fillRect(-8, -5, 16, 7);
      ctx.fillStyle = "#2b3526";
      ctx.fillRect(-1, 2, 3, 12);
      ctx.fillStyle = "rgba(255, 220, 140, 0.85)";
      ctx.fillRect(-14, 1, 3, 2.4);
      ctx.restore();
    }
    // 屋顶探照灯
    for (const side of [-1, 1]) {
      const bx = side < 0 ? 60 : W - 60;
      const sweep = Math.sin(time * 0.7 + worldY * 0.02) * 0.8;
      const beam = ctx.createLinearGradient(bx, py - 30, bx + side * 80, py + 60);
      beam.addColorStop(0, "rgba(180, 210, 255, 0.12)");
      beam.addColorStop(1, "rgba(180, 210, 255, 0)");
      ctx.fillStyle = beam;
      ctx.beginPath();
      ctx.moveTo(bx, py - 30);
      ctx.lineTo(bx + side * 80 + Math.cos(sweep) * 26, py + 60);
      ctx.lineTo(bx + side * 80 - Math.cos(sweep) * 26, py + 60);
      ctx.closePath();
      ctx.fill();
    }
  }


  ctx.strokeStyle = "rgba(255, 220, 150, 0.22)";
  ctx.lineWidth = 2;
  for (const x of [56, 240, 424]) {
    ctx.setLineDash([18, 26]);
    ctx.lineDashOffset = -scroll;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // 中央大道的霓虹分隔线，缓慢呼吸。
  const pulse = 0.1 + 0.05 * Math.sin(time * 2);
  ctx.strokeStyle = `rgba(255, 90, 160, ${pulse})`;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(240 - 26, 0);
  ctx.lineTo(240 - 26, H);
  ctx.moveTo(240 + 26, 0);
  ctx.lineTo(240 + 26, H);
  ctx.stroke();
}

function drawOrbit(ctx: CanvasRenderingContext2D, scroll: number, time: number): void {
  // 地球弧面固定在右下角，作为远景。
  const planet = ctx.createRadialGradient(430, 690, 40, 430, 690, 300);
  planet.addColorStop(0, "rgba(44, 110, 170, 0.95)");
  planet.addColorStop(0.55, "rgba(18, 62, 110, 0.85)");
  planet.addColorStop(0.8, "rgba(8, 24, 48, 0.6)");
  planet.addColorStop(1, "rgba(8, 20, 40, 0)");
  ctx.fillStyle = planet;
  ctx.beginPath();
  ctx.arc(430, 700, 300, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(120, 200, 255, 0.25)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(430, 700, 288, Math.PI * 1.02, Math.PI * 1.72);
  ctx.stroke();

  // 空间站两侧的桁架与横梁。
  for (const side of [-1, 1]) {
    const baseX = side < 0 ? 26 : W - 26;
    ctx.fillStyle = "rgba(38, 46, 62, 0.9)";
    ctx.fillRect(baseX - 13, 0, 26, H);
    ctx.fillStyle = "rgba(80, 94, 120, 0.65)";
    ctx.fillRect(baseX - 13, 0, 4, H);
    ctx.fillRect(baseX + 9, 0, 4, H);
    for (let k = -1; k < 7; k += 1) {
      const y = ((k * 128 + scroll) % (H + 128)) - 64;
      ctx.fillStyle = "rgba(52, 62, 82, 0.95)";
      ctx.fillRect(baseX - 46, y, 92, 14);
      ctx.fillStyle = "rgba(100, 118, 150, 0.5)";
      ctx.fillRect(baseX - 46, y, 92, 3);
      ctx.fillStyle = "rgba(26, 33, 46, 0.95)";
      ctx.fillRect(baseX - 20, y + 14, 40, 9);
      ctx.fillStyle = "rgba(80, 100, 130, 0.55)";
      ctx.fillRect(baseX - 20, y + 14, 40, 2);
      if (((k % 3) + 3) % 3 === 0) {
        ctx.save();
        ctx.translate(baseX + side * 38, y + 7);
        ctx.rotate((side * Math.PI) / 2);
        ctx.fillStyle = "rgba(44, 56, 74, 0.98)";
        ctx.beginPath();
        ctx.moveTo(-13, -7);
        ctx.lineTo(11, -7);
        ctx.lineTo(15, 0);
        ctx.lineTo(9, 7);
        ctx.lineTo(-13, 7);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = "rgba(120, 170, 220, 0.4)";
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = "rgba(20, 27, 38, 0.95)";
        ctx.fillRect(-2, 6, 4, 12);
        ctx.fillStyle = Math.sin(time * 5 + k) > 0 ? "#ff626e" : "#57202a";
        ctx.beginPath();
        ctx.arc(-6, 0, 2.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      const blink = Math.sin(time * 4 + k + side) > 0.55;
      if (blink) {
        ctx.fillStyle = "rgba(255, 90, 90, 0.9)";
        ctx.beginPath();
        ctx.arc(baseX + side * 36, y + 7, 2.4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // 缓慢漂移的星尘。
  for (let i = 0; i < 24; i += 1) {
    const x = ((i * 137 + time * 6) % W + W) % W;
    const y = ((i * 83 + scroll * 0.35) % (H + 20)) - 10;
    ctx.fillStyle = `rgba(170, 210, 255, ${0.10 + (i % 3) * 0.05})`;
    ctx.fillRect(x, y, 1.4, 8);
  }
}

export interface Backdrop {
  speed: number;
  draw(ctx: CanvasRenderingContext2D, scroll: number, time: number): void;
}

export function createBackdrop(theme: StageTheme): Backdrop {
  const base = makeBase(theme);
  const speed = theme === "coast" ? 74 : theme === "city" ? 92 : 112;
  return {
    speed,
    draw(ctx, scroll, time) {
      if (theme === "orbit") {
        // 星空整体缓慢下移，用循环绘制两份避免接缝。
        const drift = (scroll * 0.18) % H;
        ctx.drawImage(base, 0, drift);
        ctx.drawImage(base, 0, drift - H);
        drawOrbit(ctx, scroll, time);
      } else {
        ctx.drawImage(base, 0, 0);
        if (theme === "coast") drawCoast(ctx, scroll, time);
        else drawCity(ctx, scroll, time);
      }
    },
  };
}

// Dibuja una escena del proyecto en un canvas 2D. Determinista: depende solo de (proyecto, escena, t).
import { clamp } from './model.js';

export const SAFE_FONTS = ['system-ui', 'Georgia', 'Helvetica Neue', 'Arial', 'Trebuchet MS', 'Verdana', 'Times New Roman', 'Courier New'];

const EASE = {
  linear: (t) => t,
  easeIn: (t) => t * t * t,
  easeOut: (t) => 1 - Math.pow(1 - t, 3),
  easeInOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  back: (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
};

export function elementRange(el, scene) {
  const s = el.start || 0;
  const d = el.duration && el.duration > 0 ? el.duration : Math.max(0, scene.duration - s);
  return [s, s + d];
}

function applyAnim(st, type, e, outgoing) {
  const k = outgoing ? -1 : 1;
  switch (type) {
    case 'fade': st.alpha *= clamp(e, 0, 1); break;
    case 'slide-up': st.dy += (1 - e) * 160 * k; break;
    case 'slide-down': st.dy -= (1 - e) * 160 * k; break;
    case 'slide-left': st.dx += (1 - e) * 240 * k; st.alpha *= clamp(e * 2, 0, 1); break;
    case 'slide-right': st.dx -= (1 - e) * 240 * k; st.alpha *= clamp(e * 2, 0, 1); break;
    case 'zoom': st.scale *= 0.5 + 0.5 * e; st.alpha *= clamp(e, 0, 1); break;
    case 'pop': st.scale *= Math.max(0, e); st.alpha *= clamp(e * 3, 0, 1); break;
    default: break;
  }
}

/** Estado animado de un elemento en el tiempo local t (null si no está visible). */
export function animState(el, scene, t) {
  const [a, b] = elementRange(el, scene);
  if (!el.visible || t < a || t >= b) return null;
  const st = { alpha: el.opacity ?? 1, dx: 0, dy: 0, scale: 1, rot: 0 };
  const inn = el.in || {}, out = el.out || {}, loop = el.loop || {};
  if (inn.type && inn.type !== 'none' && inn.duration > 0) {
    const p = clamp((t - a) / inn.duration, 0, 1);
    applyAnim(st, inn.type, (EASE[inn.easing] || EASE.easeOut)(p), false);
  }
  if (out.type && out.type !== 'none' && out.duration > 0) {
    const p = clamp((b - t) / out.duration, 0, 1);
    applyAnim(st, out.type, (EASE[out.easing] || EASE.easeIn)(p), true);
  }
  const sp = (loop.speed ?? 1), am = (loop.amount ?? 1), ph = (t - a) * Math.PI * 2 * sp * 0.5;
  if (loop.type === 'float') st.dy += Math.sin(ph) * 14 * am;
  else if (loop.type === 'pulse') st.scale *= 1 + Math.sin(ph * 2) * 0.04 * am;
  else if (loop.type === 'sway') st.rot += Math.sin(ph) * 4 * am;
  else if (loop.type === 'spin') st.rot += (t - a) * 60 * sp * am;
  return st;
}

function mulberry32(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

function star(ctx, r) {
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const rad = i % 2 === 0 ? r : r * 0.22;
    const ang = (Math.PI / 4) * i - Math.PI / 2;
    ctx.lineTo(Math.cos(ang) * rad, Math.sin(ang) * rad);
  }
  ctx.closePath();
  ctx.fill();
}

function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrapText(ctx, text, maxW) {
  const lines = [];
  for (const para of String(text).split('\n')) {
    let line = '';
    for (const word of para.split(' ')) {
      const test = line ? line + ' ' + word : word;
      if (line && ctx.measureText(test).width > maxW) { lines.push(line); line = word; } else line = test;
    }
    lines.push(line);
  }
  return lines;
}

function drawFit(ctx, img, iw, ih, w, h, fit, flip) {
  if (!iw || !ih) return;
  ctx.save();
  if (flip) ctx.scale(-1, 1);
  if (fit === 'fill') ctx.drawImage(img, -w / 2, -h / 2, w, h);
  else {
    const s = fit === 'cover' ? Math.max(w / iw, h / ih) : Math.min(w / iw, h / ih);
    const dw = iw * s, dh = ih * s;
    if (fit === 'cover') { ctx.beginPath(); ctx.rect(-w / 2, -h / 2, w, h); ctx.clip(); }
    ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
  }
  ctx.restore();
}

/**
 * env: { image(assetId) -> HTMLImageElement|null, video(elId) -> HTMLVideoElement|null }
 * Devuelve un mapa id->{x,y,w,h,rot} con las cajas dibujadas (para selección en el editor).
 */
export function drawScene(ctx, project, scene, t, env, scale = 1) {
  const W = project.meta.width, H = project.meta.height;
  const boxes = {};
  ctx.save();
  ctx.scale(scale, scale);
  ctx.fillStyle = scene.background.color || project.meta.background;
  ctx.fillRect(0, 0, W, H);
  if (scene.background.asset) {
    const img = env.image(scene.background.asset);
    if (img && img.naturalWidth) {
      ctx.save(); ctx.translate(W / 2, H / 2);
      drawFit(ctx, img, img.naturalWidth, img.naturalHeight, W, H, scene.background.fit || 'cover', false);
      ctx.restore();
    }
  }
  for (const el of scene.elements) {
    const st = animState(el, scene, t);
    if (!st) continue;
    ctx.save();
    ctx.globalAlpha = clamp(st.alpha, 0, 1);
    ctx.translate(el.x + st.dx, el.y + st.dy);
    ctx.rotate(((el.rotation || 0) + st.rot) * Math.PI / 180);
    ctx.scale(st.scale, st.scale);
    let w = el.width, h = el.height;
    if (el.type === 'image') {
      const img = env.image(el.asset);
      if (img && img.naturalWidth) drawFit(ctx, img, img.naturalWidth, img.naturalHeight, w, h, el.fit || 'contain', el.flipX);
      else { ctx.strokeStyle = '#c24770'; ctx.setLineDash([12, 10]); ctx.lineWidth = 4; ctx.strokeRect(-w / 2, -h / 2, w, h); }
    } else if (el.type === 'video') {
      const v = env.video(el.id);
      if (v && v.videoWidth) drawFit(ctx, v, v.videoWidth, v.videoHeight, w, h, el.fit || 'cover', false);
      else { ctx.fillStyle = '#222'; ctx.fillRect(-w / 2, -h / 2, w, h); }
    } else if (el.type === 'shape') {
      ctx.fillStyle = el.fill || '#e8a0b8';
      if (el.shape === 'circle') { ctx.beginPath(); ctx.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2); }
      else roundRect(ctx, -w / 2, -h / 2, w, h, el.shape === 'rect' ? 0 : (el.radius ?? 40));
      ctx.fill();
      if (el.stroke && el.stroke.width > 0) { ctx.strokeStyle = el.stroke.color; ctx.lineWidth = el.stroke.width; ctx.stroke(); }
    } else if (el.type === 'text') {
      const fs = el.fontSize || 80;
      ctx.font = `${el.fontWeight || 700} ${fs}px "${el.font || 'system-ui'}", system-ui, sans-serif`;
      ctx.textBaseline = 'middle';
      const lines = wrapText(ctx, el.text || '', w);
      const lh = fs * (el.lineHeight || 1.15);
      h = lh * lines.length;
      el._h = h;
      const align = el.align || 'center';
      ctx.textAlign = align;
      const tx = align === 'left' ? -w / 2 : align === 'right' ? w / 2 : 0;
      if (el.shadow) { ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = 14; ctx.shadowOffsetY = 4; }
      lines.forEach((ln, i) => {
        const y = -h / 2 + lh * (i + 0.5);
        if (el.stroke && el.stroke.width > 0) { ctx.lineJoin = 'round'; ctx.lineWidth = el.stroke.width * 2; ctx.strokeStyle = el.stroke.color; ctx.strokeText(ln, tx, y); }
        ctx.fillStyle = el.color || '#000';
        ctx.fillText(ln, tx, y);
      });
    } else if (el.type === 'effect') {
      if (el.effect === 'sparkles') {
        ctx.fillStyle = el.color || '#fff';
        const rnd = mulberry32((el.seed || 1) * 7919);
        for (let i = 0; i < (el.count || 10); i++) {
          const px = (rnd() - 0.5) * w, py = (rnd() - 0.5) * h, off = rnd(), per = (1.4 + rnd() * 2) / Math.max(0.05, el.speed || 1), sz = (el.size || 30) * (0.5 + rnd() * 0.8);
          const ph = (((t - (el.start || 0)) / per + off) % 1 + 1) % 1;
          const tri = 1 - Math.abs(ph * 2 - 1);
          ctx.save(); ctx.globalAlpha *= tri; ctx.translate(px, py - ph * 40); ctx.rotate(ph * 1.2); star(ctx, sz * (0.4 + tri * 0.6)); ctx.restore();
        }
      }
    }
    ctx.restore();
    boxes[el.id] = { x: el.x + st.dx, y: el.y + st.dy, w: w * st.scale, h: (el.type === 'text' ? h : el.height) * st.scale, rot: ((el.rotation || 0) + st.rot) * Math.PI / 180 };
  }
  ctx.restore();
  return boxes;
}

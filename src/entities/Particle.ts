// ============================================================
// Particle.ts — Highly Optimized Sprite-Pooled Particle Renderer
// ============================================================

import { Container, Sprite, Texture } from 'pixi.js';
import { FACTION_COLORS } from '../types';
import type { ParticleData, Faction } from '../types';

const PARTICLE_1X_RADIUS  = 3;
const PARTICLE_5X_RADIUS  = 7;
const PARTICLE_GLOW_ALPHA = 0.3;
const PARTICLE_5X_GLOW_R  = 12;
const PARTICLE_1X_GLOW_R  = 6;

// ---- Texture Generation (White masks for tinting) ----
function createCircleTexture(radius: number, alpha: number = 1.0, hasRing: boolean = false, centerDot: boolean = false): Texture {
  const canvas = document.createElement('canvas');
  // Add padding for anti-aliasing / rings
  const pad = hasRing ? 4 : 2;
  const size = (radius + pad) * 2;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const center = radius + pad;

  ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
  ctx.beginPath();
  ctx.arc(center, center, radius, 0, Math.PI * 2);
  ctx.fill();

  if (centerDot) {
    ctx.fillStyle = `rgba(0, 0, 0, 0.5)`;
    ctx.beginPath();
    ctx.arc(center, center, 2, 0, Math.PI * 2);
    ctx.fill();
  }

  if (hasRing) {
    ctx.strokeStyle = `rgba(255, 255, 255, 0.45)`;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(center, center, radius + 2.5, 0, Math.PI * 2);
    ctx.stroke();
  }

  return Texture.from(canvas);
}

// Caches for textures
let tex1x: Texture;
let tex5x: Texture;
let texGlow1x: Texture;
let texGlow5x: Texture;

function initTextures() {
  if (tex1x) return;
  tex1x = createCircleTexture(PARTICLE_1X_RADIUS);
  tex5x = createCircleTexture(PARTICLE_5X_RADIUS, 1.0, true, true);
  texGlow1x = createCircleTexture(PARTICLE_1X_GLOW_R, 1.0);
  texGlow5x = createCircleTexture(PARTICLE_5X_GLOW_R, 1.0);
}

interface ParticleSprites {
  core: Sprite;
  glow: Sprite;
}

export class ParticleRenderer {
  private readonly layer: Container;
  private _destroyed = false;

  private pool: ParticleSprites[] = [];
  private activeCount = 0;

  constructor(layer: Container) {
    this.layer = layer;
    initTextures();
  }

  private _getSpritePair(): ParticleSprites {
    if (this.activeCount < this.pool.length) {
      const pair = this.pool[this.activeCount++];
      pair.core.visible = true;
      pair.glow.visible = true;
      return pair;
    }
    
    // Allocate new
    const glow = new Sprite(texGlow1x);
    glow.anchor.set(0.5);
    
    const core = new Sprite(tex1x);
    core.anchor.set(0.5);
    
    // Glow goes behind core
    this.layer.addChild(glow);
    this.layer.addChild(core);
    
    const pair = { core, glow };
    this.pool.push(pair);
    this.activeCount++;
    return pair;
  }

  render(particles: ParticleData[]): void {
    if (this._destroyed) return;
    
    // Reset active count
    this.activeCount = 0;
    
    if (particles.length === 0) {
      this._hideUnused();
      return;
    }

    const time = Date.now() / 1000;

    for (const p of particles) {
      if (!p.alive) continue;

      const pair = this._getSpritePair();
      const color = FACTION_COLORS[p.faction];
      const is5X = p.strength === 5;
      
      // Position
      pair.core.x = p.x;
      pair.core.y = p.y;
      pair.glow.x = p.x;
      pair.glow.y = p.y;

      // Core setup
      pair.core.texture = is5X ? tex5x : tex1x;
      pair.core.tint = color;
      
      if (is5X) {
        const pulse = 0.92 + 0.08 * Math.sin(time * 2.5 + p.id * 0.7);
        pair.core.scale.set(pulse);
      } else {
        pair.core.scale.set(1);
      }

      // Glow setup
      if (p.mode === 'orbiting' || p.mode === 'stationed') {
        pair.glow.visible = false;
      } else {
        pair.glow.visible = true;
        pair.glow.texture = is5X ? texGlow5x : texGlow1x;
        pair.glow.tint = color;
        
        const glowAlpha = is5X
          ? PARTICLE_GLOW_ALPHA * (0.7 + 0.3 * Math.sin(time * 3 + p.id))
          : PARTICLE_GLOW_ALPHA;
        pair.glow.alpha = glowAlpha;
      }
    }

    this._hideUnused();
  }

  private _hideUnused() {
    for (let i = this.activeCount; i < this.pool.length; i++) {
      this.pool[i].core.visible = false;
      this.pool[i].glow.visible = false;
    }
  }

  destroy(): void {
    this._destroyed = true;
    for (const pair of this.pool) {
      pair.core.destroy();
      pair.glow.destroy();
    }
    this.pool = [];
  }
}

// ============================================================
// PropertiesPanel.ts — Level editor right-side properties panel
// Shows editable properties for the currently selected entity.
// ============================================================

import type { PlanetData, BlackHoleData, PlanetDef, Faction, UpgradeLevel } from '../types';
import { FACTION_COLORS_HEX } from '../types';

export class PropertiesPanel {
  private element: HTMLElement;
  onPlanetChange: (planetId: string, changes: Partial<PlanetDef>) => void = () => {};
  onBlackHoleChange: (bhId: string, changes: Partial<BlackHoleData>) => void = () => {};
  onDeleteEntity: (id: string) => void = () => {};

  private currentPlanetId: string | null = null;
  private currentBhId: string | null = null;

  constructor(container: HTMLElement) {
    this.element = this.createElement();
    container.appendChild(this.element);
  }

  private createElement(): HTMLElement {
    const panel = document.createElement('div');
    panel.id = 'editor-props-panel';
    panel.style.cssText = `
      position: absolute;
      top: 0; right: 0;
      width: 220px;
      height: 100%;
      background: rgba(10, 10, 26, 0.85);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border-left: 1px solid rgba(255,255,255,0.08);
      z-index: 30;
      display: none;
      flex-direction: column;
      padding: 12px 10px;
      gap: 12px;
      pointer-events: auto;
      overflow-y: auto;
      font-family: 'Rajdhani', sans-serif;
    `;
    return panel;
  }

  // ── Public API ──────────────────────────────────────────────────

  showPlanet(planet: PlanetData | null): void {
    this.currentPlanetId = null;
    this.currentBhId = null;

    if (!planet) {
      this.hide();
      return;
    }

    this.currentPlanetId = planet.id;
    this.element.innerHTML = '';
    this.element.style.display = 'flex';

    // Header
    this.element.appendChild(this.buildHeader('🪐 Planet', planet.id));

    // Owner / faction
    this.element.appendChild(this.buildLabel('Owner'));
    const factionSelect = this.buildFactionSelect(planet.faction, (f) => {
      if (this.currentPlanetId) {
        this.onPlanetChange(this.currentPlanetId, { faction: f });
      }
    });
    this.element.appendChild(factionSelect);

    // Upgrade level
    this.element.appendChild(this.buildLabel('Upgrade Level'));
    const upgradeRadios = this.buildUpgradeRadios(planet.upgradeLevel, (lvl) => {
      if (this.currentPlanetId) {
        this.onPlanetChange(this.currentPlanetId, { upgradeLevel: lvl });
      }
    });
    this.element.appendChild(upgradeRadios);

    // Starting particles
    this.element.appendChild(this.buildLabel('Starting Particles'));
    const particlesInput = this.buildNumberInput(
      planet.particles,
      0,
      planet.capacity,
      (v) => {
        if (this.currentPlanetId) {
          this.onPlanetChange(this.currentPlanetId, { startingParticles: v });
        }
      }
    );
    this.element.appendChild(particlesInput);

    // Orbiting checkbox + orbit controls
    this.element.appendChild(this.buildLabel('Orbiting'));
    const orbitSection = this.buildOrbitSection(planet, (changes) => {
      if (this.currentPlanetId) {
        this.onPlanetChange(this.currentPlanetId, changes);
      }
    });
    this.element.appendChild(orbitSection);

    // Spacer
    const spacer = document.createElement('div');
    spacer.style.flex = '1';
    this.element.appendChild(spacer);

    // Delete button
    this.element.appendChild(this.buildDeleteBtn());
  }

  showBlackHole(bh: BlackHoleData | null): void {
    this.currentPlanetId = null;
    this.currentBhId = null;

    if (!bh) {
      this.hide();
      return;
    }

    this.currentBhId = bh.id;
    this.element.innerHTML = '';
    this.element.style.display = 'flex';

    // Header
    this.element.appendChild(this.buildHeader('⚫ Black Hole', bh.id));

    // Pull Radius
    this.element.appendChild(this.buildLabel('Pull Radius'));
    const pullRadiusWrapper = document.createElement('div');
    pullRadiusWrapper.style.cssText = 'display:flex; flex-direction:column; gap:4px;';
    const pullRadiusSlider = this.buildSlider(bh.pullRadius, 50, 400, (v) => {
      pullRadiusVal.textContent = String(v);
      if (this.currentBhId) this.onBlackHoleChange(this.currentBhId, { pullRadius: v });
    });
    const pullRadiusVal = document.createElement('span');
    pullRadiusVal.style.cssText = 'font-size:11px; color: rgba(255,255,255,0.5); text-align:right;';
    pullRadiusVal.textContent = String(bh.pullRadius);
    pullRadiusWrapper.appendChild(pullRadiusSlider);
    pullRadiusWrapper.appendChild(pullRadiusVal);
    this.element.appendChild(pullRadiusWrapper);

    // Destruction Radius
    this.element.appendChild(this.buildLabel('Destruction Radius'));
    const destroyWrapper = document.createElement('div');
    destroyWrapper.style.cssText = 'display:flex; flex-direction:column; gap:4px;';
    const destroySlider = this.buildSlider(bh.radius, 10, 120, (v) => {
      destroyVal.textContent = String(v);
      if (this.currentBhId) this.onBlackHoleChange(this.currentBhId, { radius: v });
    });
    const destroyVal = document.createElement('span');
    destroyVal.style.cssText = 'font-size:11px; color: rgba(255,255,255,0.5); text-align:right;';
    destroyVal.textContent = String(bh.radius);
    destroyWrapper.appendChild(destroySlider);
    destroyWrapper.appendChild(destroyVal);
    this.element.appendChild(destroyWrapper);

    // Pull Strength
    this.element.appendChild(this.buildLabel('Pull Strength'));
    const strengthWrapper = document.createElement('div');
    strengthWrapper.style.cssText = 'display:flex; flex-direction:column; gap:4px;';
    const strengthSlider = this.buildSlider(bh.pullStrength * 100, 10, 300, (v) => {
      strengthVal.textContent = (v / 100).toFixed(2);
      if (this.currentBhId) this.onBlackHoleChange(this.currentBhId, { pullStrength: v / 100 });
    });
    const strengthVal = document.createElement('span');
    strengthVal.style.cssText = 'font-size:11px; color: rgba(255,255,255,0.5); text-align:right;';
    strengthVal.textContent = String(bh.pullStrength.toFixed(2));
    strengthWrapper.appendChild(strengthSlider);
    strengthWrapper.appendChild(strengthVal);
    this.element.appendChild(strengthWrapper);

    // Spacer
    const spacer = document.createElement('div');
    spacer.style.flex = '1';
    this.element.appendChild(spacer);

    // Delete
    this.element.appendChild(this.buildDeleteBtn());
  }

  hide(): void {
    this.currentPlanetId = null;
    this.currentBhId = null;
    this.element.style.display = 'none';
  }

  destroy(): void {
    this.element.remove();
  }

  // ── Builders ────────────────────────────────────────────────────

  private buildHeader(title: string, id: string): HTMLElement {
    const header = document.createElement('div');
    header.style.cssText = `
      border-bottom: 1px solid rgba(255,255,255,0.08);
      padding-bottom: 8px;
      margin-bottom: 2px;
    `;
    const titleEl = document.createElement('div');
    titleEl.style.cssText = `
      font-size: 14px;
      font-weight: 700;
      color: rgba(255,255,255,0.85);
      font-family: 'Orbitron', sans-serif;
      letter-spacing: 0.04em;
    `;
    titleEl.textContent = title;
    const idEl = document.createElement('div');
    idEl.style.cssText = 'font-size: 10px; color: rgba(255,255,255,0.3); margin-top: 2px;';
    idEl.textContent = `id: ${id}`;
    header.appendChild(titleEl);
    header.appendChild(idEl);
    return header;
  }

  private buildLabel(text: string): HTMLElement {
    const label = document.createElement('div');
    label.className = 'prop-label';
    label.textContent = text;
    return label;
  }

  private buildFactionSelect(
    current: Faction,
    onChange: (f: Faction) => void
  ): HTMLElement {
    const factions: Array<{ value: Faction; label: string }> = [
      { value: 'player',  label: 'Player'   },
      { value: 'enemy_a', label: 'AI Red'   },
      { value: 'enemy_b', label: 'AI Green' },
      { value: 'neutral', label: 'Neutral'  },
    ];

    const select = document.createElement('select');
    factions.forEach(f => {
      const opt = document.createElement('option');
      opt.value = f.value;
      opt.textContent = f.label;
      if (f.value === current) opt.selected = true;
      select.appendChild(opt);
    });
    select.style.color = FACTION_COLORS_HEX[current];
    select.addEventListener('change', () => {
      const chosen = select.value as Faction;
      select.style.color = FACTION_COLORS_HEX[chosen];
      onChange(chosen);
    });
    return select;
  }

  private buildUpgradeRadios(
    current: UpgradeLevel,
    onChange: (lvl: UpgradeLevel) => void
  ): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'display: flex; gap: 8px;';

    ([1, 2, 3] as UpgradeLevel[]).forEach(lvl => {
      const label = document.createElement('label');
      label.style.cssText = `
        display: flex;
        align-items: center;
        gap: 4px;
        cursor: pointer;
        color: rgba(255,255,255,0.65);
        font-size: 13px;
        font-weight: 600;
      `;
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = 'upgrade-level';
      radio.value = String(lvl);
      radio.checked = lvl === current;
      radio.style.accentColor = '#4fc3f7';
      radio.addEventListener('change', () => { if (radio.checked) onChange(lvl); });
      label.appendChild(radio);
      label.appendChild(document.createTextNode(String(lvl)));
      wrapper.appendChild(label);
    });

    return wrapper;
  }

  private buildNumberInput(
    value: number,
    min: number,
    max: number,
    onChange: (v: number) => void
  ): HTMLElement {
    const input = document.createElement('input');
    input.type = 'number';
    input.min = String(min);
    input.max = String(max);
    input.value = String(Math.round(value));
    input.addEventListener('change', () => {
      const v = Math.max(min, Math.min(max, Number(input.value)));
      input.value = String(v);
      onChange(v);
    });
    return input;
  }

  private buildOrbitSection(
    planet: PlanetData,
    onChange: (changes: Partial<PlanetDef>) => void
  ): HTMLElement {
    const section = document.createElement('div');
    section.style.cssText = 'display: flex; flex-direction: column; gap: 8px;';

    // Checkbox row
    const checkRow = document.createElement('label');
    checkRow.style.cssText = `
      display: flex;
      align-items: center;
      gap: 6px;
      cursor: pointer;
      color: rgba(255,255,255,0.65);
      font-size: 13px;
    `;
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = planet.isOrbiting;
    checkbox.style.accentColor = '#4fc3f7';
    checkRow.appendChild(checkbox);
    checkRow.appendChild(document.createTextNode('Orbiting'));
    section.appendChild(checkRow);

    // Orbit sub-controls
    const orbitControls = document.createElement('div');
    orbitControls.style.cssText = `
      display: ${planet.isOrbiting ? 'flex' : 'none'};
      flex-direction: column;
      gap: 8px;
      padding-left: 8px;
      border-left: 2px solid rgba(79,195,247,0.25);
    `;

    // Orbit Radius slider
    const radiusLabel = this.buildLabel('Orbit Radius');
    orbitControls.appendChild(radiusLabel);
    const radiusWrapper = document.createElement('div');
    radiusWrapper.style.cssText = 'display: flex; flex-direction: column; gap: 4px;';
    const radiusVal = document.createElement('span');
    radiusVal.style.cssText = 'font-size: 11px; color: rgba(255,255,255,0.5); text-align: right;';
    radiusVal.textContent = String(Math.round(planet.orbitRadius ?? 120));
    const radiusSlider = this.buildSlider(planet.orbitRadius ?? 120, 50, 400, (v) => {
      radiusVal.textContent = String(v);
      onChange({ orbitRadius: v });
    });
    radiusWrapper.appendChild(radiusSlider);
    radiusWrapper.appendChild(radiusVal);
    orbitControls.appendChild(radiusWrapper);

    // Orbit Speed slider
    const speedLabel = this.buildLabel('Orbit Speed');
    orbitControls.appendChild(speedLabel);
    const speedWrapper = document.createElement('div');
    speedWrapper.style.cssText = 'display: flex; flex-direction: column; gap: 4px;';
    const speedVal = document.createElement('span');
    speedVal.style.cssText = 'font-size: 11px; color: rgba(255,255,255,0.5); text-align: right;';
    speedVal.textContent = (planet.orbitSpeed ?? 0.3).toFixed(2);
    const speedSlider = this.buildSlider((planet.orbitSpeed ?? 0.3) * 100, 10, 100, (v) => {
      const s = v / 100;
      speedVal.textContent = s.toFixed(2);
      onChange({ orbitSpeed: s });
    });
    speedWrapper.appendChild(speedSlider);
    speedWrapper.appendChild(speedVal);
    orbitControls.appendChild(speedWrapper);

    section.appendChild(orbitControls);

    // Wire checkbox toggle
    checkbox.addEventListener('change', () => {
      orbitControls.style.display = checkbox.checked ? 'flex' : 'none';
      onChange({ isOrbiting: checkbox.checked });
    });

    return section;
  }

  private buildSlider(
    value: number,
    min: number,
    max: number,
    onChange: (v: number) => void
  ): HTMLInputElement {
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = String(min);
    slider.max = String(max);
    slider.value = String(Math.round(value));
    slider.addEventListener('input', () => onChange(Number(slider.value)));
    return slider;
  }

  private buildDeleteBtn(): HTMLElement {
    const btn = document.createElement('button');
    btn.textContent = '🗑  Delete Entity';
    btn.style.cssText = `
      width: 100%;
      padding: 8px 0;
      background: linear-gradient(135deg, #ef4444, #dc2626);
      color: #fff;
      border: none;
      border-radius: 6px;
      font-family: 'Orbitron', sans-serif;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.06em;
      cursor: pointer;
      transition: box-shadow 0.2s;
      margin-top: 4px;
    `;
    btn.addEventListener('mouseenter', () => {
      btn.style.boxShadow = '0 0 14px rgba(239,68,68,0.6)';
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.boxShadow = 'none';
    });
    btn.addEventListener('click', () => {
      const id = this.currentPlanetId ?? this.currentBhId;
      if (id) this.onDeleteEntity(id);
    });
    return btn;
  }
}

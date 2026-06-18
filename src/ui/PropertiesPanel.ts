// ============================================================
// PropertiesPanel.ts — Level editor right-side properties panel
// Shows editable properties for the currently selected entity.
// ============================================================

import type {
  PlanetData, BlackHoleData, PlanetDef, Faction, UpgradeLevel,
  SpeedZoneDef, SpeedZoneData,
  PortalDef, PortalData,
  TrappingBlackHoleDef, TrappingBlackHoleData,
  WhiteHoleData,
} from '../types';
import { FACTION_COLORS_HEX } from '../types';

export class PropertiesPanel {
  private element: HTMLElement;

  // Callbacks
  onPlanetChange:     (planetId: string, changes: Partial<PlanetDef>)            => void = () => {};
  onBlackHoleChange:  (bhId: string, changes: Partial<BlackHoleData>)            => void = () => {};
  onSpeedZoneChange:  (id: string, changes: Partial<SpeedZoneDef>)               => void = () => {};
  onPortalChange:     (id: string, changes: Partial<PortalDef>)                  => void = () => {};
  onTrappingBHChange: (id: string, changes: Partial<TrappingBlackHoleDef>)       => void = () => {};
  onDeleteEntity:     (id: string)                                                => void = () => {};

  // Current selection tracking
  private currentPlanetId:    string | null = null;
  private currentBhId:        string | null = null;
  private currentSpeedZoneId: string | null = null;
  private currentPortalId:    string | null = null;
  private currentTBHId:       string | null = null;
  private currentWhiteHoleId: string | null = null;

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

  private clearCurrentIds(): void {
    this.currentPlanetId    = null;
    this.currentBhId        = null;
    this.currentSpeedZoneId = null;
    this.currentPortalId    = null;
    this.currentTBHId       = null;
    this.currentWhiteHoleId = null;
  }

  showPlanet(planet: PlanetData | null): void {
    this.clearCurrentIds();

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
      planet.health,
      0,
      planet.maxHealth,
      (v) => {
        if (this.currentPlanetId) {
          this.onPlanetChange(this.currentPlanetId, { startingParticles: v });
        }
      }
    );
    this.element.appendChild(particlesInput);

    // Shielded checkbox
    this.element.appendChild(this.buildLabel('Shielded'));
    const shieldSection = this.buildCheckbox(!!planet.isShielded, (val) => {
      if (this.currentPlanetId) {
        this.onPlanetChange(this.currentPlanetId, { isShielded: val });
      }
    });
    this.element.appendChild(shieldSection);

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
    this.element.appendChild(this.buildDeleteBtn(() => this.currentPlanetId));
  }

  showBlackHole(bh: BlackHoleData | null): void {
    this.clearCurrentIds();

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
    const pullRadiusVal = document.createElement('span');
    pullRadiusVal.style.cssText = 'font-size:11px; color: rgba(255,255,255,0.5); text-align:right;';
    pullRadiusVal.textContent = String(bh.pullRadius);
    const pullRadiusSlider = this.buildSlider(bh.pullRadius, 50, 400, (v) => {
      pullRadiusVal.textContent = String(v);
      if (this.currentBhId) this.onBlackHoleChange(this.currentBhId, { pullRadius: v });
    });
    pullRadiusWrapper.appendChild(pullRadiusSlider);
    pullRadiusWrapper.appendChild(pullRadiusVal);
    this.element.appendChild(pullRadiusWrapper);

    // Destruction Radius
    this.element.appendChild(this.buildLabel('Destruction Radius'));
    const destroyWrapper = document.createElement('div');
    destroyWrapper.style.cssText = 'display:flex; flex-direction:column; gap:4px;';
    const destroyVal = document.createElement('span');
    destroyVal.style.cssText = 'font-size:11px; color: rgba(255,255,255,0.5); text-align:right;';
    destroyVal.textContent = String(bh.radius);
    const destroySlider = this.buildSlider(bh.radius, 10, 120, (v) => {
      destroyVal.textContent = String(v);
      if (this.currentBhId) this.onBlackHoleChange(this.currentBhId, { radius: v });
    });
    destroyWrapper.appendChild(destroySlider);
    destroyWrapper.appendChild(destroyVal);
    this.element.appendChild(destroyWrapper);

    // Pull Strength
    this.element.appendChild(this.buildLabel('Pull Strength'));
    const strengthWrapper = document.createElement('div');
    strengthWrapper.style.cssText = 'display:flex; flex-direction:column; gap:4px;';
    const strengthVal = document.createElement('span');
    strengthVal.style.cssText = 'font-size:11px; color: rgba(255,255,255,0.5); text-align:right;';
    strengthVal.textContent = String(bh.pullStrength.toFixed(2));
    const strengthSlider = this.buildSlider(bh.pullStrength * 100, 10, 300, (v) => {
      strengthVal.textContent = (v / 100).toFixed(2);
      if (this.currentBhId) this.onBlackHoleChange(this.currentBhId, { pullStrength: v / 100 });
    });
    strengthWrapper.appendChild(strengthSlider);
    strengthWrapper.appendChild(strengthVal);
    this.element.appendChild(strengthWrapper);

    // Spacer
    const spacer = document.createElement('div');
    spacer.style.flex = '1';
    this.element.appendChild(spacer);

    // Delete
    this.element.appendChild(this.buildDeleteBtn(() => this.currentBhId));
  }

  showSpeedZone(sz: SpeedZoneData): void {
    this.clearCurrentIds();
    this.currentSpeedZoneId = sz.id;
    this.element.innerHTML = '';
    this.element.style.display = 'flex';

    // Header
    this.element.appendChild(this.buildHeader('💨 Speed Zone', sz.id));

    // Type toggle
    this.element.appendChild(this.buildLabel('Type'));
    const typeRow = document.createElement('div');
    typeRow.style.cssText = 'display:flex; gap:6px;';

    const makeTypeBtn = (label: string, value: 'speedup' | 'slowdown', color: string) => {
      const btn = document.createElement('button');
      btn.textContent = label;
      const isActive = sz.type === value;
      btn.style.cssText = `
        flex: 1;
        padding: 5px 0;
        border-radius: 5px;
        border: 1px solid ${color}55;
        background: ${isActive ? color + '33' : 'rgba(255,255,255,0.05)'};
        color: ${isActive ? color : 'rgba(255,255,255,0.5)'};
        font-family: 'Rajdhani', sans-serif;
        font-size: 11px;
        font-weight: 700;
        cursor: pointer;
        transition: background 0.15s;
      `;
      btn.addEventListener('click', () => {
        if (this.currentSpeedZoneId) {
          this.onSpeedZoneChange(this.currentSpeedZoneId, { type: value });
          // Re-render panel with updated state
          this.showSpeedZone({ ...sz, type: value });
        }
      });
      return btn;
    };

    typeRow.appendChild(makeTypeBtn('⚡ Speed Up', 'speedup', '#22c55e'));
    typeRow.appendChild(makeTypeBtn('🐌 Slow Down', 'slowdown', '#ef4444'));
    this.element.appendChild(typeRow);

    // Radius slider
    this.element.appendChild(this.buildLabel('Radius'));
    const radiusWrapper = document.createElement('div');
    radiusWrapper.style.cssText = 'display:flex; flex-direction:column; gap:4px;';
    const radiusVal = document.createElement('span');
    radiusVal.style.cssText = 'font-size:11px; color: rgba(255,255,255,0.5); text-align:right;';
    radiusVal.textContent = String(sz.radius);
    const radiusSlider = this.buildSlider(sz.radius, 50, 400, (v) => {
      radiusVal.textContent = String(v);
      if (this.currentSpeedZoneId) this.onSpeedZoneChange(this.currentSpeedZoneId, { radius: v });
    });
    radiusWrapper.appendChild(radiusSlider);
    radiusWrapper.appendChild(radiusVal);
    this.element.appendChild(radiusWrapper);

    // Spacer
    const spacer = document.createElement('div');
    spacer.style.flex = '1';
    this.element.appendChild(spacer);

    // Delete button
    this.element.appendChild(this.buildDeleteBtn(() => this.currentSpeedZoneId));
  }

  showPortal(portal: PortalData): void {
    this.clearCurrentIds();
    this.currentPortalId = portal.id;
    this.element.innerHTML = '';
    this.element.style.display = 'flex';

    // Header
    this.element.appendChild(this.buildHeader('🌀 Portal', portal.id));

    // Pair ID
    this.element.appendChild(this.buildLabel('Pair ID'));
    const pairInput = document.createElement('input');
    pairInput.type = 'text';
    pairInput.value = portal.pairId;
    pairInput.style.cssText = `
      width: 100%;
      background: rgba(255,255,255,0.07);
      border: 1px solid rgba(255,255,255,0.15);
      border-radius: 4px;
      color: #e0e0e0;
      font-size: 11px;
      font-family: 'monospace';
      padding: 4px 6px;
      outline: none;
      box-sizing: border-box;
    `;
    pairInput.addEventListener('change', () => {
      if (this.currentPortalId) {
        this.onPortalChange(this.currentPortalId, { pairId: pairInput.value.trim() });
      }
    });
    this.element.appendChild(pairInput);

    // Color presets
    this.element.appendChild(this.buildLabel('Color'));
    const PORTAL_COLORS: Array<{ hex: number; label: string }> = [
      { hex: 0x00ff88, label: 'Green'  },
      { hex: 0xff8800, label: 'Orange' },
      { hex: 0xff00ff, label: 'Pink'   },
      { hex: 0x00ffff, label: 'Cyan'   },
      { hex: 0xffff00, label: 'Yellow' },
      { hex: 0xff4444, label: 'Red'    },
    ];
    const swatchRow = document.createElement('div');
    swatchRow.style.cssText = 'display:flex; gap:5px; flex-wrap:wrap;';
    PORTAL_COLORS.forEach(({ hex, label }) => {
      const hexStr = '#' + hex.toString(16).padStart(6, '0');
      const swatch = document.createElement('button');
      swatch.title = label;
      swatch.style.cssText = `
        width: 24px; height: 24px;
        border-radius: 4px;
        border: 2px solid ${portal.color === hex ? '#fff' : 'transparent'};
        background: ${hexStr};
        cursor: pointer;
        transition: border-color 0.15s, transform 0.1s;
      `;
      swatch.addEventListener('mouseenter', () => { swatch.style.transform = 'scale(1.15)'; });
      swatch.addEventListener('mouseleave', () => { swatch.style.transform = 'scale(1)'; });
      swatch.addEventListener('click', () => {
        if (this.currentPortalId) {
          this.onPortalChange(this.currentPortalId, { color: hex });
          this.showPortal({ ...portal, color: hex });
        }
      });
      swatchRow.appendChild(swatch);
    });
    this.element.appendChild(swatchRow);

    // Info text
    const info = this.buildInfoText('Portals with matching Pair ID are linked');
    this.element.appendChild(info);

    // Spacer
    const spacer = document.createElement('div');
    spacer.style.flex = '1';
    this.element.appendChild(spacer);

    // Delete button
    this.element.appendChild(this.buildDeleteBtn(() => this.currentPortalId));
  }

  showTrappingBH(tbh: TrappingBlackHoleData): void {
    this.clearCurrentIds();
    this.currentTBHId = tbh.id;
    this.element.innerHTML = '';
    this.element.style.display = 'flex';

    // Header
    this.element.appendChild(this.buildHeader('🕳️ Trapping Black Hole', tbh.id));

    // Pull Radius slider
    this.element.appendChild(this.buildLabel('Pull Radius'));
    const pullWrapper = document.createElement('div');
    pullWrapper.style.cssText = 'display:flex; flex-direction:column; gap:4px;';
    const pullVal = document.createElement('span');
    pullVal.style.cssText = 'font-size:11px; color: rgba(255,255,255,0.5); text-align:right;';
    pullVal.textContent = String(tbh.pullRadius);
    const pullSlider = this.buildSlider(tbh.pullRadius, 100, 600, (v) => {
      pullVal.textContent = String(v);
      if (this.currentTBHId) this.onTrappingBHChange(this.currentTBHId, { pullRadius: v });
    });
    pullWrapper.appendChild(pullSlider);
    pullWrapper.appendChild(pullVal);
    this.element.appendChild(pullWrapper);

    // Info text
    this.element.appendChild(this.buildInfoText('Particles entering pull radius are drawn to center'));

    // Spacer
    const spacer = document.createElement('div');
    spacer.style.flex = '1';
    this.element.appendChild(spacer);

    // Delete button
    this.element.appendChild(this.buildDeleteBtn(() => this.currentTBHId));
  }

  showWhiteHole(wh: WhiteHoleData): void {
    this.clearCurrentIds();
    this.currentWhiteHoleId = wh.id;
    this.element.innerHTML = '';
    this.element.style.display = 'flex';

    // Header
    this.element.appendChild(this.buildHeader('⭐ White Hole', wh.id));

    // Info texts
    this.element.appendChild(this.buildInfoText('20 particles → 100 particle explosion'));
    this.element.appendChild(this.buildInfoText('Contested by multiple factions → resets'));

    // Spacer
    const spacer = document.createElement('div');
    spacer.style.flex = '1';
    this.element.appendChild(spacer);

    // Delete button
    this.element.appendChild(this.buildDeleteBtn(() => this.currentWhiteHoleId));
  }

  hide(): void {
    this.clearCurrentIds();
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

  private buildInfoText(text: string): HTMLElement {
    const el = document.createElement('div');
    el.style.cssText = `
      font-size: 10px;
      color: rgba(255,255,255,0.38);
      font-family: 'Rajdhani', sans-serif;
      font-style: italic;
      line-height: 1.4;
      padding: 4px 6px;
      background: rgba(255,255,255,0.04);
      border-radius: 4px;
      border-left: 2px solid rgba(255,255,255,0.12);
    `;
    el.textContent = text;
    return el;
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

    // Orbit Shape dropdown
    const shapeLabel = this.buildLabel('Orbit Shape');
    orbitControls.appendChild(shapeLabel);
    const shapeSelect = document.createElement('select');
    shapeSelect.style.cssText = `
      background: rgba(0,0,0,0.5);
      color: white;
      border: 1px solid rgba(255,255,255,0.2);
      padding: 4px;
      font-size: 12px;
      border-radius: 3px;
      outline: none;
    `;
    const optionCircle = document.createElement('option');
    optionCircle.value = 'circle';
    optionCircle.text = 'Circle';
    const optionEllipse = document.createElement('option');
    optionEllipse.value = 'ellipse';
    optionEllipse.text = 'Ellipse';
    shapeSelect.appendChild(optionCircle);
    shapeSelect.appendChild(optionEllipse);
    shapeSelect.value = planet.orbitShape ?? 'circle';
    orbitControls.appendChild(shapeSelect);

    // Orbit Width (X Radius) slider
    const radiusLabel = this.buildLabel('Width (Radius X)');
    orbitControls.appendChild(radiusLabel);
    const radiusWrapper = document.createElement('div');
    radiusWrapper.style.cssText = 'display: flex; flex-direction: column; gap: 4px;';
    const radiusVal = document.createElement('span');
    radiusVal.style.cssText = 'font-size: 11px; color: rgba(255,255,255,0.5); text-align: right;';
    radiusVal.textContent = String(Math.round(planet.orbitRadius ?? 120));
    const radiusSlider = this.buildSlider(planet.orbitRadius ?? 120, 50, 1500, (v) => {
      radiusVal.textContent = String(v);
      onChange({ orbitRadius: v });
    });
    radiusWrapper.appendChild(radiusSlider);
    radiusWrapper.appendChild(radiusVal);
    orbitControls.appendChild(radiusWrapper);

    // Orbit Length (Y Radius) slider
    const radiusYLabel = this.buildLabel('Length (Radius Y)');
    orbitControls.appendChild(radiusYLabel);
    const radiusYWrapper = document.createElement('div');
    radiusYWrapper.style.cssText = 'display: flex; flex-direction: column; gap: 4px;';
    const radiusYVal = document.createElement('span');
    radiusYVal.style.cssText = 'font-size: 11px; color: rgba(255,255,255,0.5); text-align: right;';
    radiusYVal.textContent = String(Math.round(planet.orbitRadiusY ?? planet.orbitRadius ?? 120));
    const radiusYSlider = this.buildSlider(planet.orbitRadiusY ?? planet.orbitRadius ?? 120, 50, 1500, (v) => {
      radiusYVal.textContent = String(v);
      onChange({ orbitRadiusY: v });
    });
    radiusYWrapper.appendChild(radiusYSlider);
    radiusYWrapper.appendChild(radiusYVal);
    orbitControls.appendChild(radiusYWrapper);

    // Toggle Y Radius visibility based on shape
    const updateShapeVisibility = () => {
      const isEllipse = shapeSelect.value === 'ellipse';
      radiusYLabel.style.display = isEllipse ? 'block' : 'none';
      radiusYWrapper.style.display = isEllipse ? 'flex' : 'none';
      radiusLabel.textContent = isEllipse ? 'Width (Radius X)' : 'Diameter (Radius)';
    };
    updateShapeVisibility();
    shapeSelect.addEventListener('change', () => {
      onChange({ orbitShape: shapeSelect.value as 'circle' | 'ellipse' });
      updateShapeVisibility();
    });

    // Orbit Speed slider
    const speedLabel = this.buildLabel('Orbit Speed');
    orbitControls.appendChild(speedLabel);
    const speedWrapper = document.createElement('div');
    speedWrapper.style.cssText = 'display: flex; flex-direction: column; gap: 4px;';
    const speedVal = document.createElement('span');
    speedVal.style.cssText = 'font-size: 11px; color: rgba(255,255,255,0.5); text-align: right;';
    speedVal.textContent = (planet.orbitSpeed ?? 0.3).toFixed(2);
    const speedSlider = this.buildSlider((planet.orbitSpeed ?? 0.3) * 100, 5, 200, (v) => {
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

  private buildCheckbox(checked: boolean, onChange: (val: boolean) => void): HTMLElement {
    const label = document.createElement('label');
    label.style.cssText = `
      display: flex;
      align-items: center;
      gap: 6px;
      cursor: pointer;
      color: rgba(255,255,255,0.65);
      font-size: 13px;
    `;
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = checked;
    checkbox.style.accentColor = '#4fc3f7';
    checkbox.addEventListener('change', () => onChange(checkbox.checked));
    
    label.appendChild(checkbox);
    return label;
  }

  private buildDeleteBtn(getId: () => string | null): HTMLElement {
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
      const id = getId();
      if (id) this.onDeleteEntity(id);
    });
    return btn;
  }
}

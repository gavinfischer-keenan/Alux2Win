// ============================================================
// MainMenuScene.ts — Main menu HTML overlay scene for LUX
// Renders on top of the live PixiJS star-background canvas.
// ============================================================

import { type LevelData, FACTION_COLORS_HEX } from '../types';
import tutorialMovementData    from '../levels/tutorial_movement.json';
import tutorialCommanderData   from '../levels/tutorial_commander.json';
import tutorialNormalData      from '../levels/tutorial_normal.json';
import tutorialPlasmaData      from '../levels/tutorial_plasma.json';
import tutorialAsteroidsData   from '../levels/tutorial_asteroids.json';
import tutorialGammaData       from '../levels/tutorial_gamma.json';
import tutorialSpeedData       from '../levels/tutorial_speed.json';
import tutorialPortalsData     from '../levels/tutorial_portals.json';
import tutorialBlackholesData  from '../levels/tutorial_blackholes.json';
import tutorialWhiteholesData  from '../levels/tutorial_whiteholes.json';
import simpleGridData from '../levels/simple_grid.json';
import plasmaStorm1Data from '../levels/plasma_storm_1.json';
import asteroids1Data from '../levels/asteroids_1.json';
import gammaRays1Data from '../levels/gamma_rays_1.json';
import speedTraps1Data from '../levels/speed_traps_1.json';
import portals1Data from '../levels/portals_1.json';
import blackholes1Data from '../levels/blackholes_1.json';
import whiteholes1Data from '../levels/whiteholes_1.json';
import shielded1Data from '../levels/shielded/level_01.json';
import shielded2Data from '../levels/shielded/level_02.json';
import plasmaStorm2Data from '../levels/plasma_storm_2.json';
import asteroids2Data from '../levels/asteroids_2.json';
import gammaRays2Data from '../levels/gamma_rays_2.json';
import speedTraps2Data from '../levels/speed_traps_2.json';
import takeYourSidesData from '../levels/take_your_sides.json';
import blackholes2Data from '../levels/blackholes_2.json';
import whiteholes2Data from '../levels/whiteholes_2.json';
import shielded3Data from '../levels/shielded/level_03.json';
import tutorialFogOfWarData from '../levels/tutorial_fogofwar.json';

import { SettingsStore } from '../core/SettingsStore';
import type { GameSettings } from '../core/SettingsStore';
import { audioManager } from '../core/AudioManager';
import type { GameSpeed } from '../ui/PauseMenu';
import { LevelStore } from '../core/LevelStore';
import { HighScoreStore } from '../core/HighScoreStore';
import { generateRandomLevel } from '../utils/RandomLevelGenerator';

export class MainMenuScene {
  private element: HTMLElement;
  private settingsPanel: HTMLElement | null = null;
  private systemsPanel: HTMLElement | null = null;
  private _mainCard: HTMLElement | null = null;
  private _scrollContainer: HTMLElement | null = null;
  private rootGalaxies: any[] = [];
  private currentCategoryList: any[] | null = null;

  onPlay: (levelData: LevelData, isTutorial?: boolean, tutorialId?: string) => void = () => {};
  onOpenEditor: () => void = () => {};

  constructor(container: HTMLElement) {
    this.element = this.createMenu();
    container.appendChild(this.element);
  }

  // ── Public API ────────────────────────────────────────────

  show(): void {
    this.element.style.display = 'flex';
    // Ensure the main card is visible (guard against leftover panel transitions)
    if (this._mainCard) {
      this._mainCard.style.opacity = '1';
      this._mainCard.style.transform = 'translateX(0)';
      this._mainCard.style.pointerEvents = 'auto';
    }
    // Close any lingering sub-panels
    if (this.systemsPanel) {
      this.systemsPanel.remove();
      this.systemsPanel = null;
    }
    if (this.settingsPanel) {
      this.settingsPanel.style.display = 'none';
    }
    // Stagger-animate children
    const children = this.element.querySelectorAll<HTMLElement>('.menu-anim-child');
    children.forEach((child, i) => {
      child.style.opacity = '0';
      child.style.transform = 'translateY(16px)';
      setTimeout(() => {
        child.style.transition = 'opacity 0.45s ease, transform 0.45s ease';
        child.style.opacity = '1';
        child.style.transform = 'translateY(0)';
      }, 80 + i * 80);
    });
  }

  hide(): void {
    this.element.style.display = 'none';
  }

  destroy(): void {
    this.element.remove();
  }

  // ── Private ───────────────────────────────────────────────

  private createMenu(): HTMLElement {
    const overlay = document.createElement('div');
    overlay.id = 'main-menu';
    overlay.style.cssText = `
      position: absolute;
      top: 0; left: 0;
      width: 100%; height: 100%;
      display: none;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      z-index: 20;
      pointer-events: auto;
      user-select: none;
      overflow: hidden;
      padding: 20px;
    `;

    // ── Inner card (Container) ──────────────────────────────
    const card = document.createElement('div');
    card.style.cssText = `
      display: flex;
      flex-direction: column;
      gap: 20px;
      padding: 40px;
      background: rgba(0, 0, 10, 0.65);
      backdrop-filter: blur(18px);
      -webkit-backdrop-filter: blur(18px);
      border: 1px solid rgba(79, 195, 247, 0.15);
      border-radius: 24px;
      box-shadow: 0 0 60px rgba(79, 195, 247, 0.08), 0 8px 40px rgba(0,0,0,0.6);
      width: 95vw;
      max-width: 1600px;
      transition: opacity 0.3s ease, transform 0.3s ease;
    `;
    this._mainCard = card;
    overlay.appendChild(card);

    // ── Header (Title & Aux Buttons) ────────────────────────
    const header = document.createElement('div');
    header.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      margin-bottom: 10px;
      flex-wrap: wrap;
      gap: 20px;
    `;
    
    const titleWrapper = document.createElement('div');
    titleWrapper.className = 'menu-anim-child';

    const title = document.createElement('h1');
    title.textContent = 'LUX';
    title.style.cssText = `
      font-family: 'Orbitron', sans-serif;
      font-size: clamp(3rem, 6vw, 4.5rem);
      font-weight: 900;
      color: #4fc3f7;
      letter-spacing: 0.15em;
      line-height: 1;
      animation: title-glow 3s ease-in-out infinite;
      margin: 0;
    `;

    const subtitle = document.createElement('div');
    subtitle.textContent = 'Choose your Galaxy';
    subtitle.style.cssText = `
      font-family: 'Rajdhani', sans-serif;
      font-size: 1.1rem;
      color: rgba(79, 195, 247, 0.55);
      letter-spacing: 0.25em;
      text-transform: uppercase;
      margin-top: 6px;
    `;

    titleWrapper.appendChild(title);
    titleWrapper.appendChild(subtitle);
    header.appendChild(titleWrapper);

    // ── Aux Buttons (Settings, Editor, Import) ──────────────
    const auxContainer = document.createElement('div');
    auxContainer.className = 'menu-anim-child';
    auxContainer.style.cssText = `
      display: flex;
      gap: 12px;
      align-items: center;
    `;

    // Import file input
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.json';
    fileInput.style.display = 'none';
    fileInput.addEventListener('change', () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = JSON.parse(e.target!.result as string) as LevelData;
          this.onPlay(data);
        } catch (err) {
          console.error('Failed to parse level JSON:', err);
          alert('Invalid level JSON file.');
        }
      };
      reader.readAsText(file);
      fileInput.value = '';
    });
    auxContainer.appendChild(fileInput);

    const importBtn = this.createAuxButton('📂 IMPORT', '#b0bec5', () => fileInput.click());
    const editorBtn = this.createAuxButton('🛠 EDITOR', '#f59e0b', () => this.onOpenEditor());
    const settingsBtn = this.createAuxButton('⚙ SETTINGS', '#9575cd', () => this.openSettings());

    auxContainer.appendChild(importBtn);
    auxContainer.appendChild(editorBtn);
    auxContainer.appendChild(settingsBtn);

    header.appendChild(auxContainer);
    card.appendChild(header);

    // ── Grid Galaxy View ───────────────────────
    // Inject a <style> block for custom huge scrollbars
    const styleEl = document.createElement('style');
    styleEl.innerHTML = `
      .galaxy-scroller::-webkit-scrollbar { height: 24px; }
      .galaxy-scroller::-webkit-scrollbar-track { background: rgba(255, 255, 255, 0.05); border-radius: 12px; margin: 0 10px; }
      .galaxy-scroller::-webkit-scrollbar-thumb { background: rgba(79, 195, 247, 0.5); border-radius: 12px; border: 4px solid #000; }
      .galaxy-scroller::-webkit-scrollbar-thumb:hover { background: rgba(79, 195, 247, 0.8); }
    `;
    document.head.appendChild(styleEl);

    const scrollContainer = document.createElement('div');
    scrollContainer.className = 'galaxy-scroller';
    scrollContainer.style.cssText = `
      display: grid;
      grid-template-rows: 260px 260px;
      grid-auto-flow: column;
      grid-auto-columns: 280px;
      gap: 20px 24px;
      overflow-x: auto;
      overflow-y: hidden;
      padding: 10px 10px 30px 10px;
      width: 100%;
    `;
    this._scrollContainer = scrollContainer;

    const customLevels = LevelStore.loadLevels();
    const customGroups: Record<string, LevelData[]> = {};
    customLevels.forEach(level => {
      const cat = level.category || 'Custom';
      if (!customGroups[cat]) customGroups[cat] = [];
      customGroups[cat].push(level);
    });

    const singleHazards = [
      { name: 'Plasma Storms', desc: 'Beware the volatile plasma fields. Units that enter will gradually lose health.', image: '/assets/galaxies/plasma.png',    locked: false, tutorialId: 'plasma',     levels: [tutorialPlasmaData as LevelData, plasmaStorm1Data as LevelData, plasmaStorm2Data as LevelData, ...(customGroups['Plasma Storms'] || [])], isTutorial: false },
      { name: 'Asteroids',     desc: 'Asteroids fly through space killing all they touch except the most developed planets. Big Rock Bad', image: '/assets/galaxies/asteroid.png',  locked: false, tutorialId: 'asteroids',  levels: [tutorialAsteroidsData as LevelData, asteroids1Data as LevelData, asteroids2Data as LevelData, ...(customGroups['Asteroids'] || [])], isTutorial: false },
      { name: 'Gamma Rays',    desc: 'Intense bursts of radiation that frequently sweep the system, destroying caught units and planets.', image: '/assets/galaxies/nebula.png',    locked: false, tutorialId: 'gamma',      levels: [tutorialGammaData as LevelData, gammaRays1Data as LevelData, gammaRays2Data as LevelData, ...(customGroups['Gamma Rays'] || [])], isTutorial: false },
      { name: 'Speed Traps',   desc: 'Vast zones of accelerated space. Use them to launch surprise attacks across the map.', image: '/assets/galaxies/quantum.png',   locked: false, tutorialId: 'speedTraps', levels: [tutorialSpeedData as LevelData, speedTraps1Data as LevelData, speedTraps2Data as LevelData, ...(customGroups['Speed Traps'] || [])], isTutorial: false },
      { name: 'Portals',       desc: 'Instantaneous travel across the system. Send units into one portal to emerge at the exit.', image: '/assets/galaxies/lava.png',      locked: false, tutorialId: 'portals',    levels: [tutorialPortalsData as LevelData, portals1Data as LevelData, ...(customGroups['Portals'] || [])], isTutorial: false },
      { name: 'Black Holes',   desc: 'Relentless gravity wells. They consume all particles that wander too close.', image: '/assets/galaxies/void.png',      locked: false, tutorialId: 'blackholes', levels: [tutorialBlackholesData as LevelData, blackholes1Data as LevelData, blackholes2Data as LevelData, ...(customGroups['Black Holes'] || [])], isTutorial: false },
      { name: 'White Holes',   desc: 'Sending units into the white hole rewards you with a valuable resource bounty.', image: '/assets/galaxies/quantum.png',   locked: false, tutorialId: 'whiteholes', levels: [tutorialWhiteholesData as LevelData, whiteholes1Data as LevelData, whiteholes2Data as LevelData, ...(customGroups['White Holes'] || [])], isTutorial: false },
      { name: 'Shielded Planets', desc: 'Master the art of defense. Shielded planets slowly generate a protective energy barrier over time that absorbs incoming attacks.', image: '/assets/galaxies/normal.png', locked: false, tutorialId: 'shield', levels: [shielded1Data as LevelData, shielded2Data as LevelData, shielded3Data as LevelData, ...(customGroups['Shielded Planets'] || [])], isTutorial: false },
      { name: 'Fog of War',    desc: 'The galaxy is shrouded in darkness. Upgrading your planets expands your limited vision.', image: '/assets/galaxies/nebula.png', locked: false, tutorialId: 'fogofwar', levels: [tutorialFogOfWarData as LevelData, ...(customGroups['Fog of War'] || [])], isTutorial: false },
    ];

    const galaxies = [
      { name: 'Tutorial',      desc: 'Learn the basics of fleet command and cosmic hazards.', image: '/assets/galaxies/tutorial.png',  locked: false, tutorialId: 'commander', levels: [
          tutorialCommanderData as LevelData,
          tutorialNormalData as LevelData,
          tutorialPlasmaData as LevelData,
          tutorialAsteroidsData as LevelData,
          tutorialGammaData as LevelData,
          tutorialSpeedData as LevelData,
          tutorialPortalsData as LevelData,
          tutorialBlackholesData as LevelData,
          tutorialWhiteholesData as LevelData,
          tutorialMovementData as LevelData,
        ], isTutorial: true },
      { name: 'Intro Missions', desc: 'Balanced systems with no extreme anomalies. A true test of strategic fundamentals...but beware black holes.', image: '/assets/galaxies/normal.png',    locked: false, tutorialId: '',     levels: [simpleGridData as LevelData, ...(customGroups['Intro Missions'] || [])], isTutorial: false },
      { name: 'Single Hazard Universes', desc: 'Galaxies featuring exactly one extreme cosmic anomaly to master.', image: '/assets/galaxies/nebula.png', locked: false, tutorialId: '', levels: [], isTutorial: false, subcategories: singleHazards },
      { name: 'Dual Hazard Universes', desc: 'Combine two distinct anomalies for complex strategic challenges.', image: '/assets/galaxies/plasma.png', locked: false, tutorialId: '', levels: [takeYourSidesData as LevelData, ...(customGroups['Dual Hazard Universes'] || [])], isTutorial: false },
      { name: 'Triple Hazard Universes', desc: 'Survive in the most hostile environments the cosmos has to offer.', image: '/assets/galaxies/void.png', locked: false, tutorialId: '', levels: [], isTutorial: false, isPlaceholder: true },
      { name: 'Custom',        desc: 'Explore custom user-generated systems and experimental battlegrounds.', image: '/assets/galaxies/normal.png',    locked: false, tutorialId: '',           levels: customGroups['Custom'] || [], isTutorial: false },
      { name: 'Random',        desc: 'An unpredictable, procedurally generated system. Every battle is unique.', image: '/assets/galaxies/quantum.png',   locked: false, tutorialId: '',           levels: [], isTutorial: false },
    ];

    this.rootGalaxies = galaxies;
    this.renderGalaxyGrid();

    card.appendChild(scrollContainer);

    // ── Version text ───────────────────────────────────────
    const version = document.createElement('div');
    version.className = 'menu-anim-child';
    version.textContent = 'v' + __APP_VERSION__;
    version.style.cssText = `
      font-family: 'Rajdhani', sans-serif;
      font-size: 12px;
      color: rgba(255,255,255,0.2);
      letter-spacing: 0.1em;
      margin-top: 10px;
      text-align: right;
      width: 100%;
    `;
    card.appendChild(version);

    return overlay;
  }

  // ── renderGalaxyGrid ────────────────────────────────────────
  private renderGalaxyGrid(): void {
    if (!this._scrollContainer) return;
    const container = this._scrollContainer;
    container.innerHTML = '';

    const listToRender = this.currentCategoryList || this.rootGalaxies;

    if (this.currentCategoryList) {
      // Add a BACK tile
      const backTile = document.createElement('div');
      backTile.className = 'menu-anim-child';
      backTile.style.cssText = `
        height: 100%;
        background: rgba(255, 255, 255, 0.05);
        border: 1px dashed rgba(255, 255, 255, 0.3);
        border-radius: 16px;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        cursor: pointer;
        transition: transform 0.2s ease, background 0.2s ease;
      `;
      backTile.addEventListener('mouseenter', () => { backTile.style.background = 'rgba(255,255,255,0.1)'; });
      backTile.addEventListener('mouseleave', () => { backTile.style.background = 'rgba(255,255,255,0.05)'; });
      backTile.addEventListener('click', () => {
        audioManager.playClick();
        this.currentCategoryList = null;
        this.renderGalaxyGrid();
      });

      const backText = document.createElement('div');
      backText.textContent = '← BACK';
      backText.style.cssText = `
        font-family: 'Orbitron', sans-serif;
        font-size: 1.5rem;
        font-weight: 800;
        color: rgba(255,255,255,0.8);
      `;
      backTile.appendChild(backText);
      container.appendChild(backTile);
    }

    listToRender.forEach((g) => {
      const tile = document.createElement('div');
      tile.className = 'menu-anim-child';
      
      tile.style.cssText = `
        height: 100%;
        background: rgba(255, 255, 255, 0.03);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 16px;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        cursor: ${(g.locked || g.isPlaceholder) ? 'not-allowed' : 'pointer'};
        transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
        position: relative;
        opacity: ${g.locked ? '0.6' : '1'};
      `;

      // Description Overlay (shown on hover)
      const descOverlay = document.createElement('div');
      descOverlay.style.cssText = `
        position: absolute;
        top: 0; left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 5, 20, 0.85);
        backdrop-filter: blur(6px);
        -webkit-backdrop-filter: blur(6px);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 24px 24px 70px 24px;
        box-sizing: border-box;
        opacity: 0;
        transition: opacity 0.3s ease;
        z-index: 2;
        pointer-events: none;
      `;
      const descText = document.createElement('div');
      descText.textContent = g.desc;
      descText.style.cssText = `
        font-family: 'Rajdhani', sans-serif;
        font-size: 1.15rem;
        font-weight: 600;
        color: #e0f7fa;
        text-align: center;
        line-height: 1.4;
        letter-spacing: 0.05em;
        text-shadow: 0 2px 6px rgba(0,0,0,0.9);
      `;
      descOverlay.appendChild(descText);

      if (!g.locked && !g.isPlaceholder) {
        tile.addEventListener('mouseenter', () => {
          tile.style.transform = 'translateY(-6px)';
          tile.style.boxShadow = '0 12px 24px rgba(79, 195, 247, 0.2)';
          tile.style.borderColor = 'rgba(79, 195, 247, 0.5)';
          descOverlay.style.opacity = '1';
        });
        tile.addEventListener('mouseleave', () => {
          tile.style.transform = 'translateY(0)';
          tile.style.boxShadow = 'none';
          tile.style.borderColor = 'rgba(255, 255, 255, 0.1)';
          descOverlay.style.opacity = '0';
        });
        tile.addEventListener('click', () => {
          audioManager.playClick();
          if (g.subcategories) {
            this.currentCategoryList = g.subcategories;
            this.renderGalaxyGrid();
            return;
          }
          if (g.name === 'Random') {
            const randomLevel = generateRandomLevel();
            this.onPlay(randomLevel, false);
          } else {
            this.openSystemsPanel(g);
          }
        });
      }

      // Thumbnail Image
      const img = document.createElement('img');
      img.src = g.image;
      img.style.cssText = `
        position: absolute;
        top: 0; left: 0;
        width: 100%;
        height: 100%;
        object-fit: cover;
        filter: ${(g.locked || g.isPlaceholder) ? 'grayscale(80%)' : 'none'};
        z-index: 0;
      `;
      tile.appendChild(img);
      tile.appendChild(descOverlay);

      // Bottom Label container (Absolute position to avoid clipping)
      const labelContainer = document.createElement('div');
      labelContainer.style.cssText = `
        position: absolute;
        bottom: 0; left: 0; width: 100%;
        padding: 16px 12px 12px;
        display: flex;
        flex-direction: column;
        justify-content: flex-end;
        align-items: center;
        background: linear-gradient(0deg, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.6) 60%, transparent 100%);
        z-index: 3;
      `;
      
      const titleLabel = document.createElement('div');
      titleLabel.textContent = g.name;
      titleLabel.style.cssText = `
        font-family: 'Orbitron', sans-serif;
        font-size: 1.3rem;
        font-weight: 800;
        color: ${(g.locked || g.isPlaceholder) ? 'rgba(255,255,255,0.5)' : '#4fc3f7'};
        letter-spacing: 0.1em;
        text-shadow: 0px 2px 4px rgba(0,0,0,0.8);
      `;
      labelContainer.appendChild(titleLabel);

      if (g.locked || g.isPlaceholder) {
        const soonLabel = document.createElement('div');
        soonLabel.textContent = 'Coming Soon';
        soonLabel.style.cssText = `
          font-family: 'Rajdhani', sans-serif;
          font-size: 0.85rem;
          color: rgba(255,200,100,0.8);
          letter-spacing: 0.15em;
          margin-top: 4px;
        `;
        
        // Add a giant coming soon badge in the middle
        const giantBadge = document.createElement('div');
        giantBadge.textContent = 'COMING SOON';
        giantBadge.style.cssText = `
          position: absolute;
          top: 50%; left: 50%;
          transform: translate(-50%, -50%) rotate(-10deg);
          background: rgba(200, 40, 40, 0.9);
          border: 2px solid #ffaaaa;
          color: white;
          padding: 8px 16px;
          font-family: 'Orbitron', sans-serif;
          font-size: 1.2rem;
          font-weight: bold;
          border-radius: 8px;
          z-index: 4;
          box-shadow: 0 4px 12px rgba(0,0,0,0.5);
          pointer-events: none;
        `;
        tile.appendChild(giantBadge);
        
        labelContainer.appendChild(soonLabel);
      } else {
        // Bright dots representing active systems
        const dotsContainer = document.createElement('div');
        dotsContainer.style.cssText = 'display: flex; gap: 6px; margin-top: 8px; flex-wrap: wrap; justify-content: center; max-width: 90%;';
        
        const numSystems = g.name === 'Random' ? 1 : (g.levels ? g.levels.length : 0);
        for (let i = 0; i < numSystems; i++) {
          const dot = document.createElement('div');
          dot.style.cssText = `
            width: 8px;
            height: 8px;
            background-color: #4fc3f7;
            border-radius: 50%;
            box-shadow: 0 0 8px #4fc3f7;
          `;
          dotsContainer.appendChild(dot);
        }

        if (numSystems === 0 && !g.subcategories) {
           const noSysLabel = document.createElement('div');
           noSysLabel.textContent = '0 SYSTEMS';
           noSysLabel.style.cssText = `
             font-family: 'Rajdhani', sans-serif;
             font-size: 0.8rem;
             color: rgba(255,255,255,0.4);
             letter-spacing: 0.1em;
             margin-top: 6px;
           `;
           dotsContainer.appendChild(noSysLabel);
        } else if (g.subcategories) {
           const countLabel = document.createElement('div');
           countLabel.textContent = g.subcategories.length + ' HAZARDS';
           countLabel.style.cssText = `
             font-family: 'Rajdhani', sans-serif;
             font-size: 0.8rem;
             color: rgba(100, 255, 100, 0.8);
             letter-spacing: 0.1em;
             margin-top: 6px;
           `;
           dotsContainer.appendChild(countLabel);
        }
        
        labelContainer.appendChild(dotsContainer);
      }

      tile.appendChild(labelContainer);
      container.appendChild(tile);
    });
  }

  // ── Settings panel ────────────────────────────────────────

  private openSettings(): void {
    if (!this.settingsPanel) {
      this.settingsPanel = this.createSettingsPanel();
      this.element.appendChild(this.settingsPanel);
    }

    const card = this._mainCard!;
    const panel = this.settingsPanel;

    // Slide card left + fade out
    card.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
    card.style.opacity = '0';
    card.style.transform = 'translateX(-40px)';
    card.style.pointerEvents = 'none';

    // Show panel, slide in from right
    panel.style.display = 'flex';
    panel.style.opacity = '0';
    panel.style.transform = 'translateX(40px)';
    panel.style.pointerEvents = 'auto';
    // Trigger transition on next frame
    requestAnimationFrame(() => {
      panel.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
      panel.style.opacity = '1';
      panel.style.transform = 'translateX(0)';
    });
  }

  private closeSettings(): void {
    const card = this._mainCard!;
    const panel = this.settingsPanel;
    if (!panel) return;

    // Slide panel out right
    panel.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
    panel.style.opacity = '0';
    panel.style.transform = 'translateX(40px)';
    panel.style.pointerEvents = 'none';

    // Slide card back in
    card.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
    card.style.opacity = '1';
    card.style.transform = 'translateX(0)';
    card.style.pointerEvents = 'auto';

    setTimeout(() => {
      if (panel) panel.style.display = 'none';
    }, 310);
  }

  private createSettingsPanel(): HTMLElement {
    const panel = document.createElement('div');
    panel.style.cssText = `
      position: absolute;
      display: none;
      flex-direction: column;
      align-items: center;
      gap: 14px;
      padding: 36px 48px 28px;
      background: rgba(0, 0, 10, 0.82);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border: 1px solid rgba(149, 117, 205, 0.22);
      border-radius: 20px;
      box-shadow: 0 0 60px rgba(149, 117, 205, 0.07), 0 8px 48px rgba(0,0,0,0.7);
      min-width: 320px;
      max-height: 90vh;
      overflow-y: auto;
      pointer-events: none;
      opacity: 0;
      transform: translateX(40px);
    `;

    const settings = SettingsStore.get();

    // ── Header row ─────────────────────────────────────────
    const header = document.createElement('div');
    header.style.cssText = 'display:flex; align-items:center; width:100%; gap:12px; margin-bottom:4px;';

    const backBtn = document.createElement('button');
    backBtn.textContent = '← BACK';
    backBtn.style.cssText = `
      background: transparent;
      border: 1px solid rgba(149,117,205,0.35);
      border-radius: 6px;
      color: rgba(149,117,205,0.8);
      font-family: 'Orbitron', sans-serif;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.08em;
      cursor: pointer;
      padding: 6px 10px;
      transition: border-color 0.15s, color 0.15s;
      flex-shrink: 0;
    `;
    backBtn.addEventListener('mouseenter', () => {
      backBtn.style.borderColor = 'rgba(149,117,205,0.7)';
      backBtn.style.color = '#b39ddb';
    });
    backBtn.addEventListener('mouseleave', () => {
      backBtn.style.borderColor = 'rgba(149,117,205,0.35)';
      backBtn.style.color = 'rgba(149,117,205,0.8)';
    });
    backBtn.addEventListener('click', () => {
      audioManager.playClick();
      this.closeSettings();
    });

    const panelTitle = document.createElement('div');
    panelTitle.textContent = 'SETTINGS';
    panelTitle.style.cssText = `
      font-family: 'Orbitron', sans-serif;
      font-size: 1.1rem;
      font-weight: 900;
      color: #b39ddb;
      letter-spacing: 0.2em;
      text-shadow: 0 0 16px rgba(149,117,205,0.4);
      flex: 1;
      text-align: center;
    `;

    header.appendChild(backBtn);
    header.appendChild(panelTitle);
    panel.appendChild(header);

    // ── Separator ──────────────────────────────────────────
    const sep = document.createElement('div');
    sep.style.cssText = `
      width: 90%; height: 1px;
      background: linear-gradient(90deg, transparent, rgba(149,117,205,0.35), transparent);
      margin-bottom: 4px;
    `;
    panel.appendChild(sep);

    // ── Game Speed ─────────────────────────────────────────
    panel.appendChild(this._makeSectionLabel('GAME SPEED'));

    const speedRow = document.createElement('div');
    speedRow.style.cssText = 'display:flex; gap:8px; width:100%;';

    const speeds: Array<{ label: string; value: GameSpeed }> = [
      { label: '½×', value: 0.5 },
      { label: '1×', value: 1 },
      { label: '2×', value: 2 },
      { label: '3×', value: 3 },
    ];

    let currentSpeed = settings.gameSpeed;
    const speedBtns = new Map<number, HTMLButtonElement>();

    const applySpeedStyles = (val: number) => {
      speedBtns.forEach((b, v) => {
        const active = v === val;
        b.style.background   = active ? 'rgba(149,117,205,0.25)' : 'rgba(255,255,255,0.06)';
        b.style.borderColor  = active ? 'rgba(149,117,205,0.75)' : 'rgba(255,255,255,0.12)';
        b.style.color        = active ? '#b39ddb'                : 'rgba(255,255,255,0.55)';
        b.style.boxShadow    = active ? '0 0 12px rgba(149,117,205,0.3)' : 'none';
      });
    };

    for (const { label, value } of speeds) {
      const btn = document.createElement('button');
      btn.textContent = label;
      btn.style.cssText = `
        flex: 1;
        padding: 8px 4px;
        background: rgba(255,255,255,0.06);
        border: 1px solid rgba(255,255,255,0.12);
        border-radius: 6px;
        color: rgba(255,255,255,0.55);
        font-family: 'Orbitron', sans-serif;
        font-size: 0.75rem;
        font-weight: 700;
        cursor: pointer;
        transition: background 0.15s, border-color 0.15s, color 0.15s, box-shadow 0.15s;
        letter-spacing: 0.04em;
      `;
      btn.addEventListener('click', () => {
        audioManager.playClick();
        currentSpeed = value;
        SettingsStore.update({ gameSpeed: value as GameSettings['gameSpeed'] });
        applySpeedStyles(value);
      });
      speedBtns.set(value, btn);
      speedRow.appendChild(btn);
    }
    applySpeedStyles(currentSpeed);
    panel.appendChild(speedRow);

    // ── Master Volume ──────────────────────────────────────
    panel.appendChild(this._makeSectionLabel('MASTER VOLUME'));

    const volWrapper = document.createElement('div');
    volWrapper.style.cssText = 'width:100%; display:flex; align-items:center; gap:10px;';

    const volSlider = document.createElement('input');
    volSlider.type = 'range';
    volSlider.min = '0';
    volSlider.max = '100';
    volSlider.value = String(Math.round(settings.masterVolume * 100));
    volSlider.style.cssText = `
      flex: 1;
      -webkit-appearance: none;
      appearance: none;
      height: 4px;
      border-radius: 2px;
      background: rgba(149,117,205,0.35);
      outline: none;
      cursor: pointer;
    `;

    const volLabel = document.createElement('span');
    volLabel.textContent = `${volSlider.value}%`;
    volLabel.style.cssText = `
      font-family: 'Orbitron', sans-serif;
      font-size: 0.7rem;
      color: #b39ddb;
      min-width: 36px;
      text-align: right;
    `;

    volSlider.addEventListener('input', () => {
      const v = Number(volSlider.value) / 100;
      volLabel.textContent = `${volSlider.value}%`;
      SettingsStore.update({ masterVolume: v });
      audioManager.setVolume(v);
    });

    volWrapper.appendChild(volSlider);
    volWrapper.appendChild(volLabel);
    panel.appendChild(volWrapper);

    // ── Game Challenge ─────────────────────────────────────
    panel.appendChild(this._makeSectionLabel('GAME CHALLENGE'));

    const difficultyHint = document.createElement('div');
    difficultyHint.style.cssText = `
      font-family: 'Rajdhani', sans-serif;
      font-size: 0.7rem;
      color: rgba(255,255,255,0.3);
      letter-spacing: 0.05em;
      width: 100%;
      text-align: center;
      margin-top: -4px;
      margin-bottom: 2px;
    `;

    const difficulties: Array<{ label: string; hint: string; value: GameSettings['difficulty']; color: string }> = [
      { label: 'Easy',   hint: 'Passive Turtle AI',          value: 'easy',   color: '#66bb6a' },
      { label: 'Normal', hint: 'Balanced — varies each game', value: 'normal', color: '#ffa726' },
      { label: 'Hard',   hint: 'Unhinged — unpredictable',   value: 'hard',   color: '#ef5350' },
    ];

    const diffRow = document.createElement('div');
    diffRow.style.cssText = 'display:flex; gap:8px; width:100%;';

    let currentDiff = settings.difficulty;
    const diffBtns = new Map<string, HTMLButtonElement>();

    const applyDiffStyles = (val: string) => {
      diffBtns.forEach((b, v) => {
        const diff = difficulties.find(d => d.value === v)!;
        const active = v === val;
        b.style.background  = active ? `${diff.color}33` : 'rgba(255,255,255,0.06)';
        b.style.borderColor = active ? `${diff.color}bb` : 'rgba(255,255,255,0.12)';
        b.style.boxShadow   = active ? `0 0 10px ${diff.color}44` : 'none';
        const hintEl = b.querySelector<HTMLElement>('.diff-hint');
        if (hintEl) hintEl.style.color = active ? `${diff.color}cc` : 'rgba(255,255,255,0.3)';
      });
      const selected = difficulties.find(d => d.value === val);
      if (selected) difficultyHint.textContent = selected.hint;
    };

    for (const { label, value, color } of difficulties) {
      const btn = document.createElement('button');
      btn.style.cssText = `
        flex: 1;
        padding: 10px 4px 8px;
        background: rgba(255,255,255,0.06);
        border: 1px solid rgba(255,255,255,0.12);
        border-radius: 6px;
        color: rgba(255,255,255,0.9);
        font-family: 'Orbitron', sans-serif;
        font-size: 0.75rem;
        font-weight: 700;
        cursor: pointer;
        transition: background 0.15s, border-color 0.15s, box-shadow 0.15s;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 4px;
        letter-spacing: 0.06em;
      `;

      const labelEl = document.createElement('span');
      labelEl.textContent = label;
      btn.appendChild(labelEl);

      btn.addEventListener('click', () => {
        currentDiff = value;
        SettingsStore.update({ difficulty: value });
        applyDiffStyles(value);
      });

      diffBtns.set(value, btn);
      diffRow.appendChild(btn);
    }

    applyDiffStyles(currentDiff);
    panel.appendChild(diffRow);
    panel.appendChild(difficultyHint);

    // ── Color Theme ────────────────────────────────────────
    panel.appendChild(this._makeSectionLabel('COLOR THEME'));

    const themes: Array<{ label: string; value: GameSettings['colorTheme']; color: string; soon: boolean }> = [
      { label: 'Default', value: 'default', color: '#4fc3f7', soon: false },
      { label: 'Nebula',  value: 'nebula',  color: '#b39ddb', soon: true  },
      { label: 'Ice',     value: 'ice',     color: '#81d4fa', soon: true  },
      { label: 'Lava',    value: 'lava',    color: '#ff8a65', soon: true  },
    ];

    const themeRow = document.createElement('div');
    themeRow.style.cssText = 'display:flex; gap:8px; width:100%;';

    let currentTheme = settings.colorTheme;
    const themeBtns = new Map<string, HTMLButtonElement>();

    const applyThemeStyles = (val: string) => {
      themeBtns.forEach((b, v) => {
        const themeData = themes.find(t => t.value === v)!;
        const active = v === val;
        b.style.background  = active ? `${themeData.color}33` : 'rgba(255,255,255,0.06)';
        b.style.borderColor = active ? `${themeData.color}bb` : 'rgba(255,255,255,0.12)';
        b.style.boxShadow   = active ? `0 0 10px ${themeData.color}44` : 'none';
      });
    };

    for (const { label, value, color, soon } of themes) {
      const btn = document.createElement('button');
      btn.style.cssText = `
        flex: 1;
        padding: 10px 4px 6px;
        background: rgba(255,255,255,0.06);
        border: 1px solid rgba(255,255,255,0.12);
        border-radius: 6px;
        cursor: ${soon ? 'not-allowed' : 'pointer'};
        transition: background 0.15s, border-color 0.15s, box-shadow 0.15s;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 4px;
        opacity: ${soon ? '0.6' : '1'};
      `;

      // Color swatch circle
      const swatch = document.createElement('div');
      swatch.style.cssText = `
        width: 18px; height: 18px;
        border-radius: 50%;
        background: ${color};
        box-shadow: 0 0 8px ${color}88;
      `;

      const lblEl = document.createElement('span');
      lblEl.textContent = label;
      lblEl.style.cssText = `
        font-family: 'Rajdhani', sans-serif;
        font-size: 0.72rem;
        font-weight: 700;
        color: rgba(255,255,255,0.6);
      `;

      btn.appendChild(swatch);
      btn.appendChild(lblEl);

      if (soon) {
        const badge = document.createElement('span');
        badge.textContent = 'Soon';
        badge.style.cssText = `
          font-family: 'Rajdhani', sans-serif;
          font-size: 0.6rem;
          color: rgba(255,200,100,0.75);
        `;
        btn.appendChild(badge);
      } else {
        btn.addEventListener('click', () => {
          audioManager.playClick();
          currentTheme = value;
          SettingsStore.update({ colorTheme: value });
          applyThemeStyles(value);
        });
      }

      themeBtns.set(value, btn);
      themeRow.appendChild(btn);
    }
    applyThemeStyles(currentTheme);
    panel.appendChild(themeRow);

    // ── Version text ────────────────────────────────────────
    const version = document.createElement('div');
    version.textContent = 'v0.1.0';
    version.style.cssText = `
      font-family: 'Rajdhani', sans-serif;
      font-size: 11px;
      color: rgba(255,255,255,0.2);
      letter-spacing: 0.1em;
      margin-top: 12px;
    `;
    panel.appendChild(version);

    return panel;
  }

  private _makeSectionLabel(text: string): HTMLElement {
    const lbl = document.createElement('div');
    lbl.textContent = text;
    lbl.style.cssText = `
      font-family: 'Rajdhani', sans-serif;
      font-size: 0.72rem;
      font-weight: 600;
      color: rgba(255,255,255,0.35);
      letter-spacing: 0.14em;
      text-transform: uppercase;
      align-self: flex-start;
      margin-top: 4px;
    `;
    return lbl;
  }

  private createAuxButton(text: string, color: string, onClick: () => void): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.textContent = text;
    btn.style.cssText = `
      padding: 8px 16px;
      background: transparent;
      border: 1px solid ${color}55;
      border-radius: 8px;
      color: ${color};
      font-family: 'Orbitron', sans-serif;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.08em;
      cursor: pointer;
      transition: all 0.2s ease;
    `;
    btn.addEventListener('mouseenter', () => {
      btn.style.background = `${color}22`;
      btn.style.borderColor = `${color}99`;
      btn.style.boxShadow = `0 0 12px ${color}44`;
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.background = 'transparent';
      btn.style.borderColor = `${color}55`;
      btn.style.boxShadow = 'none';
    });
    btn.addEventListener('click', () => {
      audioManager.playClick();
      onClick();
    });
    return btn;
  }

  // ── Systems panel ────────────────────────────────────────

  private openSystemsPanel(galaxy: any): void {
    if (this.systemsPanel) {
      this.systemsPanel.remove();
    }
    this.systemsPanel = this.createSystemsPanel(galaxy);
    this.element.appendChild(this.systemsPanel);

    const card = this._mainCard!;
    const panel = this.systemsPanel;

    // Slide card left + fade out
    card.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
    card.style.opacity = '0';
    card.style.transform = 'translateX(-40px)';
    card.style.pointerEvents = 'none';

    // Show panel, slide in from right
    panel.style.display = 'flex';
    panel.style.opacity = '0';
    panel.style.transform = 'translateX(40px)';
    panel.style.pointerEvents = 'auto';
    
    requestAnimationFrame(() => {
      panel.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
      panel.style.opacity = '1';
      panel.style.transform = 'translateX(0)';
    });
  }

  private closeSystemsPanel(): void {
    const card = this._mainCard!;
    const panel = this.systemsPanel;
    if (!panel) return;

    // Slide panel out right
    panel.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
    panel.style.opacity = '0';
    panel.style.transform = 'translateX(40px)';
    panel.style.pointerEvents = 'none';

    // Slide card back in
    card.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
    card.style.opacity = '1';
    card.style.transform = 'translateX(0)';
    card.style.pointerEvents = 'auto';

    setTimeout(() => {
      if (this.systemsPanel) {
        this.systemsPanel.remove();
        this.systemsPanel = null;
      }
    }, 310);
  }

  private createSystemsPanel(galaxy: any): HTMLElement {
    const panel = document.createElement('div');
    panel.style.cssText = `
      position: absolute;
      display: none;
      flex-direction: column;
      align-items: center;
      gap: 20px;
      padding: 40px;
      background: rgba(0, 0, 12, 0.88);
      backdrop-filter: blur(24px);
      -webkit-backdrop-filter: blur(24px);
      border: 1px solid rgba(79, 195, 247, 0.2);
      border-radius: 24px;
      box-shadow: 0 0 60px rgba(79, 195, 247, 0.1), 0 8px 48px rgba(0,0,0,0.8);
      width: 90%;
      max-width: 1000px;
      max-height: 90vh;
      overflow-y: auto;
      pointer-events: none;
      opacity: 0;
      transform: translateX(40px);
    `;

    // Background Image representing the theme
    const bgImg = document.createElement('div');
    bgImg.style.cssText = `
      position: absolute;
      top: 0; left: 0; right: 0; bottom: 0;
      background-image: url('${galaxy.image}');
      background-size: cover;
      background-position: center;
      opacity: 0.15;
      z-index: -1;
      border-radius: 24px;
      mask-image: linear-gradient(to bottom, black 0%, transparent 100%);
      -webkit-mask-image: linear-gradient(to bottom, black 0%, transparent 100%);
    `;
    panel.appendChild(bgImg);

    // Header
    const header = document.createElement('div');
    header.style.cssText = 'display:flex; align-items:center; width:100%; gap:20px; margin-bottom:10px;';

    const backBtn = document.createElement('button');
    backBtn.textContent = '← BACK';
    backBtn.style.cssText = `
      background: transparent;
      border: 1px solid rgba(79, 195, 247, 0.4);
      border-radius: 8px;
      color: rgba(79, 195, 247, 0.9);
      font-family: 'Orbitron', sans-serif;
      font-size: 14px;
      font-weight: 700;
      letter-spacing: 0.1em;
      cursor: pointer;
      padding: 10px 16px;
      transition: all 0.2s;
    `;
    backBtn.addEventListener('click', () => this.closeSystemsPanel());
    backBtn.addEventListener('mouseenter', () => {
      backBtn.style.background = 'rgba(79, 195, 247, 0.1)';
      backBtn.style.borderColor = 'rgba(79, 195, 247, 0.8)';
    });
    backBtn.addEventListener('mouseleave', () => {
      backBtn.style.background = 'transparent';
      backBtn.style.borderColor = 'rgba(79, 195, 247, 0.4)';
    });

    const title = document.createElement('div');
    title.textContent = `${galaxy.name.toUpperCase()} SYSTEMS`;
    title.style.cssText = `
      font-family: 'Orbitron', sans-serif;
      font-size: 2rem;
      font-weight: 900;
      color: #4fc3f7;
      letter-spacing: 0.15em;
      text-shadow: 0 0 20px rgba(79, 195, 247, 0.5);
      flex: 1;
      text-align: right;
    `;

    header.appendChild(backBtn);
    header.appendChild(title);
    panel.appendChild(header);

    // Grid of systems — branched by galaxy type
    const grid = document.createElement('div');
    grid.style.cssText = `
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
      gap: 20px;
      width: 100%;
    `;

    if (galaxy.name === 'Tutorial') {
      this.buildTutorialSystemTiles(grid, galaxy);
    } else {
      this.buildGenericSystemTiles(grid, galaxy);
    }

    panel.appendChild(grid);

    return panel;
  }

  // ── Tutorial galaxy system grid ─────────────────────────────

  private buildTutorialSystemTiles(grid: HTMLElement, galaxy: any): void {
    const levels = (galaxy.levels ?? []) as LevelData[];

    // Hazard tutorial definitions (indices 1-9 in the galaxy.levels array)
    const hazardTutorials = [
      { tutorialId: 'normal',     icon: '⚔️',  name: 'Strategy',      desc: 'Multi-planet warfare — expand fast, contest the center, press the advantage.',                          levelIndex: 1 },
      { tutorialId: 'plasma',     icon: '🌀',  name: 'Plasma Storms', desc: 'Storms block attacks. Learn to use them as shields and move around them.',                            levelIndex: 2 },
      { tutorialId: 'asteroids',  icon: '☄️',  name: 'Asteroids',     desc: 'Rocks rain down and knock planets down 2 levels. Upgrade fast or lose everything.',                   levelIndex: 3 },
      { tutorialId: 'gamma',      icon: '⚡',  name: 'Gamma Rays',    desc: 'A massive beam sweeps the galaxy. Stay out of its path — or use it to punish the enemy.',             levelIndex: 4 },
      { tutorialId: 'speed',      icon: '💨',  name: 'Speed Zones',   desc: 'Green zones double particle speed. Red zones slow them. Route your fleets for surprise strikes.',     levelIndex: 5 },
      { tutorialId: 'portals',    icon: '🌀',  name: 'Portals',       desc: 'Wormhole pairs teleport particles instantly. Use them to flank from unexpected directions.',          levelIndex: 6 },
      { tutorialId: 'blackholes', icon: '🕳️', name: 'Black Holes',   desc: 'Pull zones trap particles. Route wide and bait enemies into the gravity well.',                       levelIndex: 7 },
      { tutorialId: 'whiteholes', icon: '✨',  name: 'White Holes',   desc: 'Feed 20 particles to trigger a supernova. Charge near enemies for galaxy-wide devastation.',          levelIndex: 8 },
    ];

    // ── Featured Commander Training tile (full-width) ──────────
    const commanderLevel = levels[0] as LevelData | undefined;
    const featuredTile = document.createElement('div');
    featuredTile.style.cssText = `
      grid-column: 1 / -1;
      background: linear-gradient(135deg, rgba(255,215,0,0.08), rgba(255,165,0,0.04));
      border: 1px solid rgba(255, 215, 0, 0.35);
      border-radius: 20px;
      padding: 32px 36px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      cursor: pointer;
      transition: transform 0.2s, box-shadow 0.2s, border-color 0.2s;
      position: relative;
      overflow: hidden;
    `;

    featuredTile.addEventListener('mouseenter', () => {
      featuredTile.style.transform = 'translateY(-4px)';
      featuredTile.style.boxShadow = '0 12px 40px rgba(255,215,0,0.2)';
      featuredTile.style.borderColor = 'rgba(255, 215, 0, 0.7)';
    });
    featuredTile.addEventListener('mouseleave', () => {
      featuredTile.style.transform = 'translateY(0)';
      featuredTile.style.boxShadow = 'none';
      featuredTile.style.borderColor = 'rgba(255, 215, 0, 0.35)';
    });
    if (commanderLevel) {
      featuredTile.addEventListener('click', () => {
        audioManager.playClick();
        this.closeSystemsPanel();
        setTimeout(() => this.onPlay(commanderLevel, true, 'commander'), 320);
      });
    }

    const featuredBadge = document.createElement('div');
    featuredBadge.textContent = '🎓 START HERE';
    featuredBadge.style.cssText = `
      font-family: 'Rajdhani', sans-serif;
      font-size: 0.7rem;
      font-weight: 700;
      color: rgba(255,215,0,0.7);
      letter-spacing: 0.3em;
      text-transform: uppercase;
    `;

    const featuredRow = document.createElement('div');
    featuredRow.style.cssText = 'display: flex; align-items: center; gap: 18px;';

    const featuredIcon = document.createElement('div');
    featuredIcon.textContent = '🚀';
    featuredIcon.style.cssText = 'font-size: 3rem; line-height: 1; filter: drop-shadow(0 0 16px rgba(255,215,0,0.5));';

    const featuredText = document.createElement('div');
    featuredText.style.cssText = 'display: flex; flex-direction: column; gap: 4px;';

    const featuredName = document.createElement('div');
    featuredName.textContent = 'Commander Training';
    featuredName.style.cssText = `
      font-family: 'Orbitron', sans-serif;
      font-size: 1.5rem;
      font-weight: 900;
      color: #ffd700;
      letter-spacing: 0.08em;
      text-shadow: 0 0 20px rgba(255,215,0,0.4);
    `;

    const featuredDesc = document.createElement('div');
    featuredDesc.textContent = 'The complete guide. Learn to select, capture, upgrade, attack, and repair your planets — everything you need to conquer any galaxy.';
    featuredDesc.style.cssText = `
      font-family: 'Rajdhani', sans-serif;
      font-size: 0.95rem;
      color: rgba(255,255,255,0.65);
      line-height: 1.5;
    `;

    featuredText.appendChild(featuredName);
    featuredText.appendChild(featuredDesc);
    featuredRow.appendChild(featuredIcon);
    featuredRow.appendChild(featuredText);

    const featuredCta = document.createElement('div');
    featuredCta.textContent = '▶ BEGIN TRAINING';
    featuredCta.style.cssText = `
      align-self: flex-start;
      font-family: 'Orbitron', sans-serif;
      font-size: 0.8rem;
      font-weight: 700;
      color: rgba(255,215,0,0.9);
      letter-spacing: 0.18em;
      border: 1px solid rgba(255,215,0,0.4);
      border-radius: 8px;
      padding: 8px 18px;
      margin-top: 4px;
    `;

    // Show best times if available
    if (commanderLevel?.id) {
      const top = HighScoreStore.getTop(commanderLevel.id);
      this.buildTopTimesBlock(top, featuredText);
    }

    featuredTile.appendChild(featuredBadge);
    featuredTile.appendChild(featuredRow);
    featuredTile.appendChild(featuredCta);
    grid.appendChild(featuredTile);

    // ── Divider ──────────────────────────────────────────────
    const divider = document.createElement('div');
    divider.style.cssText = `
      grid-column: 1 / -1;
      display: flex;
      align-items: center;
      gap: 16px;
      margin: 4px 0;
    `;
    const divLine1 = document.createElement('div');
    divLine1.style.cssText = 'flex: 1; height: 1px; background: rgba(255,255,255,0.08);';
    const divLabel = document.createElement('div');
    divLabel.textContent = 'HAZARD TUTORIALS';
    divLabel.style.cssText = `
      font-family: 'Rajdhani', sans-serif;
      font-size: 0.68rem;
      font-weight: 700;
      color: rgba(255,255,255,0.25);
      letter-spacing: 0.3em;
      white-space: nowrap;
    `;
    const divLine2 = document.createElement('div');
    divLine2.style.cssText = 'flex: 1; height: 1px; background: rgba(255,255,255,0.08);';
    divider.appendChild(divLine1);
    divider.appendChild(divLabel);
    divider.appendChild(divLine2);
    grid.appendChild(divider);

    // ── Hazard tutorial tiles ────────────────────────────────
    for (const h of hazardTutorials) {
      const level = levels[h.levelIndex] as LevelData | undefined;
      const tile = document.createElement('div');
      tile.style.cssText = `
        background: rgba(79,195,247,0.04);
        border: 1px solid rgba(79,195,247,0.15);
        border-radius: 14px;
        padding: 22px 20px 18px;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
        min-height: 180px;
        cursor: ${level ? 'pointer' : 'not-allowed'};
        transition: transform 0.2s, box-shadow 0.2s, border-color 0.2s;
        opacity: ${level ? '1' : '0.4'};
        position: relative;
        text-align: center;
      `;

      if (level) {
        tile.addEventListener('mouseenter', () => {
          tile.style.transform = 'translateY(-5px)';
          tile.style.boxShadow = '0 8px 28px rgba(79,195,247,0.2)';
          tile.style.borderColor = 'rgba(79,195,247,0.5)';
        });
        tile.addEventListener('mouseleave', () => {
          tile.style.transform = 'translateY(0)';
          tile.style.boxShadow = 'none';
          tile.style.borderColor = 'rgba(79,195,247,0.15)';
        });
        tile.addEventListener('click', () => {
          audioManager.playClick();
          this.closeSystemsPanel();
          setTimeout(() => this.onPlay(level, true, h.tutorialId), 320);
        });
      }

      const badge = document.createElement('div');
      badge.textContent = '🎓 TUTORIAL';
      badge.style.cssText = `
        font-family: 'Rajdhani', sans-serif;
        font-size: 0.62rem;
        font-weight: 700;
        color: rgba(79,195,247,0.5);
        letter-spacing: 0.25em;
      `;

      const iconEl = document.createElement('div');
      iconEl.textContent = h.icon;
      iconEl.style.cssText = 'font-size: 2rem; line-height: 1; margin-top: 2px;';

      const nameEl = document.createElement('div');
      nameEl.textContent = h.name;
      nameEl.style.cssText = `
        font-family: 'Orbitron', sans-serif;
        font-size: 0.95rem;
        font-weight: 800;
        color: #4fc3f7;
        letter-spacing: 0.08em;
        text-shadow: 0 0 10px rgba(79,195,247,0.3);
      `;

      const descEl = document.createElement('div');
      descEl.textContent = h.desc;
      descEl.style.cssText = `
        font-family: 'Rajdhani', sans-serif;
        font-size: 0.78rem;
        color: rgba(255,255,255,0.5);
        line-height: 1.4;
      `;

      tile.appendChild(badge);
      tile.appendChild(iconEl);
      tile.appendChild(nameEl);
      tile.appendChild(descEl);

      if (level?.id) {
        const top = HighScoreStore.getTop(level.id);
        this.buildTopTimesBlock(top, tile);
      }

      const startTag = document.createElement('div');
      startTag.textContent = level ? '▶ START' : 'Coming Soon';
      startTag.style.cssText = `
        margin-top: auto;
        font-family: 'Orbitron', sans-serif;
        font-size: 0.65rem;
        font-weight: 700;
        color: ${level ? 'rgba(79,195,247,0.7)' : 'rgba(255,200,100,0.5)'};
        letter-spacing: 0.15em;
        border: 1px solid ${level ? 'rgba(79,195,247,0.2)' : 'rgba(255,200,100,0.15)'};
        border-radius: 5px;
        padding: 4px 12px;
      `;
      tile.appendChild(startTag);

      grid.appendChild(tile);
    }
  }

  // ── Generic 9-tile system grid (non-Tutorial galaxies) ──────

  private buildGenericSystemTiles(grid: HTMLElement, galaxy: any): void {
    const systemNames = [
      'Alpha Centauri',
      'Sirius Prime',
      'Vega Core',
      'Betelgeuse Anomaly',
      'Rigel Outpost',
      'Orion Nebula',
      'Pleiades Cluster',
      'Andromeda Edge',
      'Void Nexus'
    ];

    const levelsCount = galaxy.levels ? galaxy.levels.length : 0;
    const isCustomGalaxy = galaxy.name === 'Custom';
    const totalTiles = isCustomGalaxy ? levelsCount : Math.max(levelsCount, 9);

    if (totalTiles === 0 && isCustomGalaxy) {
      const emptyMsg = document.createElement('div');
      emptyMsg.textContent = 'No custom systems found. Create one in the Level Editor!';
      emptyMsg.style.cssText = `
        grid-column: 1 / -1;
        text-align: center;
        font-family: 'Rajdhani', sans-serif;
        color: rgba(255,255,255,0.4);
        padding: 40px;
      `;
      grid.appendChild(emptyMsg);
      return;
    }

    for (let i = 0; i < totalTiles; i++) {
      const level = galaxy.levels ? galaxy.levels[i] : null;
      const isLocked = !isCustomGalaxy && !level;
      const tile = document.createElement('div');

      tile.style.cssText = `
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 12px;
        padding: 24px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        min-height: 140px;
        cursor: ${isLocked ? 'not-allowed' : 'pointer'};
        transition: transform 0.2s, box-shadow 0.2s, border-color 0.2s;
        opacity: ${isLocked ? '0.5' : '1'};
        position: relative;
        overflow: hidden;
      `;

      // Is this the first system tile and not Custom? It's a tutorial!
      const isTutorialTile = !isCustomGalaxy && i === 0 && galaxy.tutorialId;

      if (!isLocked) {
        tile.addEventListener('mouseenter', () => {
          tile.style.transform = 'translateY(-4px)';
          tile.style.boxShadow = isTutorialTile
            ? '0 8px 24px rgba(255, 215, 0, 0.25)'
            : '0 8px 24px rgba(79, 195, 247, 0.2)';
          tile.style.borderColor = isTutorialTile
            ? 'rgba(255, 215, 0, 0.7)'
            : 'rgba(79, 195, 247, 0.6)';
        });
        tile.addEventListener('mouseleave', () => {
          tile.style.transform = 'translateY(0)';
          tile.style.boxShadow = 'none';
          tile.style.borderColor = isTutorialTile
            ? 'rgba(255, 215, 0, 0.3)'
            : 'rgba(255, 255, 255, 0.1)';
        });
        tile.addEventListener('click', (e) => {
          if ((e.target as HTMLElement).closest('.delete-custom-btn')) return;
          audioManager.playClick();
          if (level) {
            this.closeSystemsPanel();
            if (isTutorialTile) {
              setTimeout(() => this.onPlay(level, true, galaxy.tutorialId), 320);
            } else {
              setTimeout(() => this.createLevelSetupDialog(level), 320);
            }
          }
        });
      }

      // Tutorial tile gets a gold border
      if (isTutorialTile) {
        tile.style.border = '1px solid rgba(255, 215, 0, 0.3)';
        tile.style.background = 'rgba(255, 215, 0, 0.04)';
      }

      const numLabel = document.createElement('div');
      numLabel.textContent = isCustomGalaxy ? `CUSTOM` : (isTutorialTile ? '🎓 TUTORIAL' : `SYSTEM 0${i + 1}`);
      numLabel.style.cssText = `
        font-family: 'Rajdhani', sans-serif;
        font-size: 0.9rem;
        color: ${isTutorialTile ? 'rgba(255, 215, 0, 0.7)' : 'rgba(255, 255, 255, 0.4)'};
        letter-spacing: 0.2em;
        margin-bottom: 8px;
      `;

      const nameStr = level ? level.name : (systemNames[i] || `System ${i+1}`);
      const nameLabel = document.createElement('div');
      nameLabel.textContent = nameStr;
      nameLabel.style.cssText = `
        font-family: 'Orbitron', sans-serif;
        font-size: 1.1rem;
        font-weight: 700;
        color: ${isLocked ? 'rgba(255, 255, 255, 0.6)' : '#4fc3f7'};
        text-align: center;
        margin-bottom: 8px;
      `;

      tile.appendChild(numLabel);
      tile.appendChild(nameLabel);

      if (level) {
        // Container for map and times side-by-side
        const infoRow = document.createElement('div');
        infoRow.style.cssText = `
          display: flex;
          flex-direction: row;
          width: 100%;
          justify-content: space-around;
          align-items: flex-start;
          gap: 12px;
          margin-top: 4px;
          flex: 1;
        `;

        // Map Column
        const mapContainer = document.createElement('div');
        mapContainer.style.cssText = `
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
        `;
        const mapHeader = document.createElement('div');
        mapHeader.textContent = 'MAP';
        mapHeader.style.cssText = `
          font-family: 'Rajdhani', sans-serif;
          font-size: 0.6rem;
          color: rgba(255,255,255,0.25);
          letter-spacing: 0.2em;
        `;
        const canvas = document.createElement('canvas');
        canvas.width = 100;
        canvas.height = 100;
        canvas.style.cssText = `
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 4px;
          background: rgba(0, 0, 0, 0.3);
        `;
        this.drawMiniMap(level, canvas);
        mapContainer.appendChild(mapHeader);
        mapContainer.appendChild(canvas);
        infoRow.appendChild(mapContainer);

        // Times Column
        const timesContainer = document.createElement('div');
        timesContainer.style.cssText = `
          display: flex;
          flex-direction: column;
          align-items: flex-start;
        `;
        const top = HighScoreStore.getTop(level.id!);
        this.buildTopTimesBlock(top, timesContainer);
        infoRow.appendChild(timesContainer);

        tile.appendChild(infoRow);
      }

      if (isLocked) {
        const lockLabel = document.createElement('div');
        lockLabel.textContent = 'Coming Soon';
        lockLabel.style.cssText = `
          font-family: 'Rajdhani', sans-serif;
          font-size: 0.8rem;
          color: rgba(255, 200, 100, 0.9);
          letter-spacing: 0.15em;
          margin-top: 12px;
          text-transform: uppercase;
        `;
        tile.appendChild(lockLabel);
      }

      if (level && level.isCustom) {
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'delete-custom-btn';
        deleteBtn.textContent = '🗑️';
        deleteBtn.title = 'Delete Custom Level';
        deleteBtn.style.cssText = `
          position: absolute;
          top: 8px;
          right: 8px;
          background: rgba(255, 50, 50, 0.2);
          border: 1px solid rgba(255, 50, 50, 0.4);
          border-radius: 4px;
          color: white;
          cursor: pointer;
          font-size: 12px;
          padding: 4px 6px;
          transition: background 0.2s;
          pointer-events: auto;
        `;
        deleteBtn.addEventListener('mouseenter', () => { deleteBtn.style.background = 'rgba(255, 50, 50, 0.6)'; });
        deleteBtn.addEventListener('mouseleave', () => { deleteBtn.style.background = 'rgba(255, 50, 50, 0.2)'; });
        deleteBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          audioManager.playClick();
          if (confirm(`Delete custom level "${level.name}"?`)) {
            LevelStore.deleteLevel(level.id!);
            tile.remove();
            const idx = galaxy.levels.indexOf(level);
            if (idx >= 0) galaxy.levels.splice(idx, 1);
          }
        });
        tile.appendChild(deleteBtn);
      }

      grid.appendChild(tile);
    }
  }

  private buildTopTimesBlock(top: any[], appendTo: HTMLElement): void {
    const wrapper = document.createElement('div');
    wrapper.style.cssText = `
      margin-top: 6px;
      display: flex;
      flex-direction: column;
      gap: 2px;
    `;

    const header = document.createElement('div');
    header.textContent = 'TIMES';
    header.style.cssText = `
      font-family: 'Rajdhani', sans-serif;
      font-size: 0.6rem;
      color: rgba(255,255,255,0.25);
      letter-spacing: 0.2em;
      margin-bottom: 2px;
    `;
    wrapper.appendChild(header);

    if (top.length === 0) {
      const row = document.createElement('div');
      row.textContent = `1. --:--`;
      row.style.cssText = `
        font-family: 'Rajdhani', sans-serif;
        font-size: 0.65rem;
        font-weight: 400;
        color: rgba(255,255,255,0.2);
        letter-spacing: 0.05em;
      `;
      wrapper.appendChild(row);
    } else {
      const entries = top.slice(0, 5);
      entries.forEach((entry, idx) => {
        const rank = idx + 1;
        const row = document.createElement('div');
        row.textContent = `${rank}. ${HighScoreStore.formatTime(entry.bestTime)}`;
        if (rank === 1) {
          row.style.cssText = `
            font-family: 'Rajdhani', sans-serif;
            font-size: 0.72rem;
            font-weight: 700;
            color: rgba(255,215,0,0.95);
            letter-spacing: 0.05em;
          `;
        } else {
          row.style.cssText = `
            font-family: 'Rajdhani', sans-serif;
            font-size: 0.65rem;
            font-weight: 400;
            color: rgba(255,255,255,0.4);
            letter-spacing: 0.05em;
          `;
        }
        wrapper.appendChild(row);
      });
    }

    appendTo.appendChild(wrapper);
  }

  private drawMiniMap(level: any, canvas: HTMLCanvasElement): void {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    
    // Calculate scale to fit world inside canvas with 10% padding
    const padding = 10;
    const availW = w - padding * 2;
    const availH = h - padding * 2;
    const worldW = level.worldWidth || 2048;
    const worldH = level.worldHeight || 2048;
    
    const scaleX = availW / worldW;
    const scaleY = availH / worldH;
    const scale = Math.min(scaleX, scaleY);
    
    const offsetX = (w - worldW * scale) / 2;
    const offsetY = (h - worldH * scale) / 2;

    // Helper
    const mapX = (wx: number) => offsetX + wx * scale;
    const mapY = (wy: number) => offsetY + wy * scale;

    // Draw elements
    if (level.planets) {
      level.planets.forEach((p: any) => {
        ctx.beginPath();
        // size varies by upgrade level (1..3)
        const radius = Math.max(1, (p.upgradeLevel || 1) * 1.5);
        ctx.arc(mapX(p.x), mapY(p.y), radius, 0, Math.PI * 2);
        
        ctx.fillStyle = FACTION_COLORS_HEX[p.faction as keyof typeof FACTION_COLORS_HEX] || '#9e9e9e';
        ctx.fill();
        
        if (p.isShielded) {
          ctx.beginPath();
          ctx.arc(mapX(p.x), mapY(p.y), radius + 1.5, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(100, 255, 255, 0.5)';
          ctx.stroke();
        }
      });
    }

    if (level.blackHoles) {
      level.blackHoles.forEach((bh: any) => {
        ctx.beginPath();
        ctx.arc(mapX(bh.x), mapY(bh.y), 3, 0, Math.PI * 2);
        ctx.fillStyle = '#673ab7'; // purple
        ctx.fill();
      });
    }

    if (level.whiteHoles) {
      level.whiteHoles.forEach((wh: any) => {
        ctx.beginPath();
        ctx.arc(mapX(wh.x), mapY(wh.y), 3, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
      });
    }

    if (level.asteroids) {
      level.asteroids.forEach((ast: any) => {
        ctx.beginPath();
        ctx.arc(mapX(ast.x), mapY(ast.y), 2, 0, Math.PI * 2);
        ctx.fillStyle = '#795548'; // brown
        ctx.fill();
      });
    }

    if (level.portals) {
      level.portals.forEach((pt: any) => {
        ctx.beginPath();
        ctx.arc(mapX(pt.x), mapY(pt.y), 2.5, 0, Math.PI * 2);
        ctx.fillStyle = '#ff9800'; // orange
        ctx.fill();
      });
    }
  }

  // ── Level Setup Dialog ────────────────────────────────────────

  private createLevelSetupDialog(level: LevelData): void {
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: absolute;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0, 0, 0, 0.85);
      backdrop-filter: blur(8px);
      z-index: 1000;
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0;
      transition: opacity 0.3s ease;
    `;

    const dialog = document.createElement('div');
    dialog.style.cssText = `
      background: rgba(10, 15, 30, 0.95);
      border: 1px solid rgba(79, 195, 247, 0.4);
      border-radius: 16px;
      padding: 32px;
      width: 400px;
      display: flex;
      flex-direction: column;
      gap: 24px;
      box-shadow: 0 16px 48px rgba(0,0,0,0.8), 0 0 24px rgba(79, 195, 247, 0.1);
      transform: translateY(20px);
      transition: transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
    `;

    // Title
    const title = document.createElement('div');
    title.textContent = 'SYSTEM DEPLOYMENT';
    title.style.cssText = `
      font-family: 'Orbitron', sans-serif;
      font-size: 1.4rem;
      font-weight: 800;
      color: #4fc3f7;
      text-align: center;
      letter-spacing: 0.1em;
    `;
    dialog.appendChild(title);

    // Difficulty Section
    const diffSection = document.createElement('div');
    diffSection.style.cssText = 'display: flex; flex-direction: column; gap: 8px;';
    const diffLabel = document.createElement('label');
    diffLabel.textContent = 'DIFFICULTY';
    diffLabel.style.cssText = `
      font-family: 'Rajdhani', sans-serif;
      font-size: 0.9rem;
      color: rgba(255,255,255,0.6);
      letter-spacing: 0.1em;
    `;
    diffSection.appendChild(diffLabel);

    const diffRow = document.createElement('div');
    diffRow.style.cssText = 'display: flex; gap: 8px;';
    const diffOptions = ['easy', 'normal', 'hard'];
    let selectedDiff = SettingsStore.get().difficulty;

    const diffBtns: HTMLElement[] = [];
    diffOptions.forEach(d => {
      const btn = document.createElement('button');
      btn.textContent = d.toUpperCase();
      btn.style.cssText = `
        flex: 1;
        background: ${selectedDiff === d ? 'rgba(79, 195, 247, 0.2)' : 'transparent'};
        border: 1px solid ${selectedDiff === d ? '#4fc3f7' : 'rgba(255,255,255,0.2)'};
        color: ${selectedDiff === d ? '#ffffff' : 'rgba(255,255,255,0.6)'};
        padding: 10px;
        border-radius: 6px;
        font-family: 'Orbitron', sans-serif;
        font-size: 0.85rem;
        cursor: pointer;
        transition: all 0.2s;
      `;
      btn.onclick = () => {
        selectedDiff = d as any;
        diffBtns.forEach(b => {
          b.style.background = 'transparent';
          b.style.borderColor = 'rgba(255,255,255,0.2)';
          b.style.color = 'rgba(255,255,255,0.6)';
        });
        btn.style.background = 'rgba(79, 195, 247, 0.2)';
        btn.style.borderColor = '#4fc3f7';
        btn.style.color = '#ffffff';
        audioManager.playClick();
      };
      diffBtns.push(btn);
      diffRow.appendChild(btn);
    });
    diffSection.appendChild(diffRow);
    dialog.appendChild(diffSection);

    // Enemy Count Section
    const enemyFactions = new Set<string>();
    level.planets.forEach(p => {
      if (p.faction.startsWith('enemy')) enemyFactions.add(p.faction);
    });
    const maxEnemies = enemyFactions.size;
    let selectedEnemies = maxEnemies;

    const enemiesSection = document.createElement('div');
    enemiesSection.style.cssText = 'display: flex; flex-direction: column; gap: 8px;';
    const enemiesLabel = document.createElement('label');
    enemiesLabel.textContent = 'NUMBER OF ENEMIES';
    enemiesLabel.style.cssText = `
      font-family: 'Rajdhani', sans-serif;
      font-size: 0.9rem;
      color: rgba(255,255,255,0.6);
      letter-spacing: 0.1em;
    `;
    enemiesSection.appendChild(enemiesLabel);

    if (maxEnemies === 0) {
      const naText = document.createElement('div');
      naText.textContent = 'N/A';
      naText.style.cssText = "font-family: 'Orbitron'; color: rgba(255,255,255,0.4); font-size: 0.9rem;";
      enemiesSection.appendChild(naText);
    } else {
      const enRow = document.createElement('div');
      enRow.style.cssText = 'display: flex; gap: 8px;';
      const enBtns: HTMLElement[] = [];
      for (let i = 1; i <= maxEnemies; i++) {
        const btn = document.createElement('button');
        btn.textContent = i.toString();
        const isSelected = selectedEnemies === i;
        btn.style.cssText = `
          flex: 1;
          background: ${isSelected ? 'rgba(255, 82, 82, 0.2)' : 'transparent'};
          border: 1px solid ${isSelected ? '#ff5252' : 'rgba(255,255,255,0.2)'};
          color: ${isSelected ? '#ffffff' : 'rgba(255,255,255,0.6)'};
          padding: 10px;
          border-radius: 6px;
          font-family: 'Orbitron', sans-serif;
          font-size: 0.9rem;
          cursor: pointer;
          transition: all 0.2s;
        `;
        btn.onclick = () => {
          selectedEnemies = i;
          enBtns.forEach((b, idx) => {
            const isSelf = idx + 1 === i;
            b.style.background = isSelf ? 'rgba(255, 82, 82, 0.2)' : 'transparent';
            b.style.borderColor = isSelf ? '#ff5252' : 'rgba(255,255,255,0.2)';
            b.style.color = isSelf ? '#ffffff' : 'rgba(255,255,255,0.6)';
          });
          audioManager.playClick();
        };
        enBtns.push(btn);
        enRow.appendChild(btn);
      }
      enemiesSection.appendChild(enRow);
    }
    dialog.appendChild(enemiesSection);

    // Actions
    const actionRow = document.createElement('div');
    actionRow.style.cssText = 'display: flex; gap: 12px; margin-top: 12px;';

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'CANCEL';
    cancelBtn.style.cssText = `
      flex: 1;
      background: transparent;
      border: 1px solid rgba(255,255,255,0.3);
      color: white;
      padding: 12px;
      border-radius: 8px;
      font-family: 'Orbitron', sans-serif;
      cursor: pointer;
      font-size: 0.9rem;
      transition: background 0.2s;
    `;
    cancelBtn.onclick = () => {
      audioManager.playClick();
      overlay.style.opacity = '0';
      setTimeout(() => overlay.remove(), 300);
    };

    const startBtn = document.createElement('button');
    startBtn.textContent = 'LAUNCH';
    startBtn.style.cssText = `
      flex: 2;
      background: rgba(79, 195, 247, 0.2);
      border: 1px solid #4fc3f7;
      color: #4fc3f7;
      padding: 12px;
      border-radius: 8px;
      font-family: 'Orbitron', sans-serif;
      font-weight: 700;
      cursor: pointer;
      font-size: 1rem;
      letter-spacing: 0.1em;
      transition: all 0.2s;
      box-shadow: 0 0 16px rgba(79, 195, 247, 0.2);
    `;
    startBtn.onmouseenter = () => {
      startBtn.style.background = 'rgba(79, 195, 247, 0.4)';
      startBtn.style.boxShadow = '0 0 24px rgba(79, 195, 247, 0.4)';
    };
    startBtn.onmouseleave = () => {
      startBtn.style.background = 'rgba(79, 195, 247, 0.2)';
      startBtn.style.boxShadow = '0 0 16px rgba(79, 195, 247, 0.2)';
    };

    startBtn.onclick = () => {
      audioManager.playClick();
      overlay.style.opacity = '0';
      
      // Update Settings
      SettingsStore.update({ difficulty: selectedDiff });
      
      // Prune enemies
      const clonedLevel = JSON.parse(JSON.stringify(level)) as LevelData;
      if (maxEnemies > 0 && selectedEnemies < maxEnemies) {
        const factionsArray = Array.from(enemyFactions);
        // Shuffle
        for (let i = factionsArray.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [factionsArray[i], factionsArray[j]] = [factionsArray[j], factionsArray[i]];
        }
        const factionsToKeep = new Set(factionsArray.slice(0, selectedEnemies));
        
        // Neutralize removed factions
        clonedLevel.planets.forEach(p => {
          if (p.faction.startsWith('enemy') && !factionsToKeep.has(p.faction)) {
            p.faction = 'neutral';
          }
        });
      }

      setTimeout(() => {
        overlay.remove();
        this.onPlay(clonedLevel, false);
      }, 300);
    };

    actionRow.appendChild(cancelBtn);
    actionRow.appendChild(startBtn);
    dialog.appendChild(actionRow);

    overlay.appendChild(dialog);
    this.element.appendChild(overlay);

    // Animate in
    requestAnimationFrame(() => {
      overlay.style.opacity = '1';
      dialog.style.transform = 'translateY(0)';
    });
  }
}

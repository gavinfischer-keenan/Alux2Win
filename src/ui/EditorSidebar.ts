// ============================================================
// EditorSidebar.ts — Level editor left tool palette
// ============================================================

export type EditorTool =
  | 'select'
  | 'place_planet'
  | 'place_blackhole'
  | 'place_speedzone'
  | 'place_portal'
  | 'place_trappingbh'
  | 'place_whitehole'
  | 'delete';

interface ToolDef {
  id: EditorTool;
  icon: string;
  label: string;
  title: string;
}

const TOOLS: ToolDef[] = [
  { id: 'select',           icon: '↖',  label: 'SEL',  title: 'Select / Move (S)' },
  { id: 'place_planet',     icon: '🪐', label: 'PLT',  title: 'Place Planet (P)' },
  { id: 'place_blackhole',  icon: '⚫', label: 'BH',   title: 'Place Black Hole (B)' },
  { id: 'place_speedzone',  icon: '💨', label: 'SPD',  title: 'Place Speed Zone (Z)' },
  { id: 'place_portal',     icon: '🌀', label: 'PRT',  title: 'Place Portal (O)' },
  { id: 'place_trappingbh', icon: '🕳️', label: 'TBH',  title: 'Place Trapping Black Hole (T)' },
  { id: 'place_whitehole',  icon: '⭐', label: 'WH',   title: 'Place White Hole (H)' },
  { id: 'delete',           icon: '🗑️', label: 'DEL',  title: 'Delete Entity (X)' },
];

export class EditorSidebar {
  private element: HTMLElement;
  activeTool: EditorTool = 'select';
  onToolChange: (tool: EditorTool) => void = () => {};
  onTestLevel: () => void = () => {};
  onSaveLevel: () => void = () => {};
  onLoadLevel: () => void = () => {};
  onBack: () => void = () => {};
  onLevelNameChange: (name: string) => void = () => {};

  private toolButtons: Map<EditorTool, HTMLElement> = new Map();
  private nameInput!: HTMLInputElement;

  constructor(container: HTMLElement) {
    this.element = this.createElement();
    container.appendChild(this.element);
    this.bindKeyboard();
  }

  private createElement(): HTMLElement {
    const sidebar = document.createElement('div');
    sidebar.id = 'editor-sidebar';
    sidebar.style.cssText = `
      position: absolute;
      top: 0; left: 0;
      width: 64px;
      height: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      background: rgba(10, 10, 26, 0.85);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border-right: 1px solid rgba(255,255,255,0.08);
      z-index: 30;
      padding: 8px 0;
      gap: 4px;
      pointer-events: auto;
    `;

    // ── Back button (top) ───────────────────────────────────
    const backBtn = this.createIconBtn('←', 'Back to Menu', '#78909c');
    backBtn.style.marginBottom = '8px';
    backBtn.addEventListener('click', () => this.onBack());
    sidebar.appendChild(backBtn);

    // ── Divider ─────────────────────────────────────────────
    sidebar.appendChild(this.createDivider());

    // ── Tool buttons ─────────────────────────────────────────
    TOOLS.forEach(tool => {
      const btn = this.createToolBtn(tool);
      this.toolButtons.set(tool.id, btn);
      sidebar.appendChild(btn);
    });

    // ── Spacer ───────────────────────────────────────────────
    const spacer = document.createElement('div');
    spacer.style.flex = '1';
    sidebar.appendChild(spacer);

    // ── Level name input ──────────────────────────────────────
    const nameWrapper = document.createElement('div');
    nameWrapper.style.cssText = `
      display: flex;
      flex-direction: column;
      align-items: center;
      width: 100%;
      padding: 0 6px;
      margin-bottom: 6px;
    `;
    const nameLabel = document.createElement('div');
    nameLabel.style.cssText = `
      font-size: 8px;
      color: rgba(255,255,255,0.35);
      text-transform: uppercase;
      letter-spacing: 0.06em;
      font-family: 'Rajdhani', sans-serif;
      margin-bottom: 4px;
    `;
    nameLabel.textContent = 'NAME';
    this.nameInput = document.createElement('input');
    this.nameInput.type = 'text';
    this.nameInput.placeholder = 'Level';
    this.nameInput.maxLength = 24;
    this.nameInput.style.cssText = `
      width: 100%;
      background: rgba(255,255,255,0.07);
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 4px;
      color: #e0e0e0;
      font-size: 9px;
      font-family: 'Rajdhani', sans-serif;
      padding: 3px 4px;
      text-align: center;
      outline: none;
    `;
    this.nameInput.addEventListener('input', () => this.onLevelNameChange(this.nameInput.value));
    nameWrapper.appendChild(nameLabel);
    nameWrapper.appendChild(this.nameInput);
    sidebar.appendChild(nameWrapper);

    sidebar.appendChild(this.createDivider());

    // ── Save Level button ────────────────────────────────────
    const saveBtn = this.createIconBtn('💾', 'Save Level', '#4fc3f7');
    saveBtn.addEventListener('click', () => this.onSaveLevel());
    sidebar.appendChild(saveBtn);

    // ── Load Level button ────────────────────────────────────
    const loadBtn = this.createIconBtn('📂', 'Load Level', '#fbc02d');
    loadBtn.addEventListener('click', () => this.onLoadLevel());
    sidebar.appendChild(loadBtn);

    // ── Test Level button ────────────────────────────────────
    const testBtn = this.createIconBtn('▶', 'Test Level', '#22c55e');
    testBtn.style.marginBottom = '6px';
    testBtn.addEventListener('click', () => this.onTestLevel());
    sidebar.appendChild(testBtn);

    this.refreshActiveState();
    return sidebar;
  }

  private createToolBtn(tool: ToolDef): HTMLElement {
    const btn = document.createElement('button');
    btn.title = tool.title;
    btn.style.cssText = `
      width: 48px;
      height: 48px;
      border-radius: 8px;
      border: 1px solid rgba(255,255,255,0.08);
      background: rgba(255,255,255,0.04);
      color: rgba(255,255,255,0.65);
      cursor: pointer;
      font-size: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background 0.15s, border-color 0.15s, box-shadow 0.15s;
      flex-direction: column;
      gap: 1px;
      flex-shrink: 0;
    `;

    const iconSpan = document.createElement('span');
    iconSpan.textContent = tool.icon;
    iconSpan.style.lineHeight = '1';
    iconSpan.style.fontSize = '18px';
    btn.appendChild(iconSpan);

    const labelSpan = document.createElement('span');
    labelSpan.textContent = tool.label;
    labelSpan.style.cssText = `
      font-size: 7px;
      font-family: 'Orbitron', sans-serif;
      letter-spacing: 0.04em;
      color: rgba(255,255,255,0.4);
      line-height: 1;
    `;
    btn.appendChild(labelSpan);

    btn.addEventListener('click', () => {
      this.setActiveTool(tool.id);
    });

    return btn;
  }

  private createIconBtn(icon: string, title: string, color: string): HTMLElement {
    const btn = document.createElement('button');
    btn.title = title;
    btn.textContent = icon;
    btn.style.cssText = `
      width: 44px;
      height: 44px;
      border-radius: 8px;
      border: 1px solid ${color}33;
      background: rgba(255,255,255,0.04);
      color: ${color};
      cursor: pointer;
      font-size: 18px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      transition: background 0.15s, box-shadow 0.15s;
    `;
    btn.addEventListener('mouseenter', () => {
      btn.style.background = `${color}22`;
      btn.style.boxShadow = `0 0 10px ${color}55`;
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.background = 'rgba(255,255,255,0.04)';
      btn.style.boxShadow = 'none';
    });
    return btn;
  }

  private createDivider(): HTMLElement {
    const d = document.createElement('div');
    d.style.cssText = `
      width: 36px;
      height: 1px;
      background: rgba(255,255,255,0.08);
      margin: 4px 0;
      flex-shrink: 0;
    `;
    return d;
  }

  private refreshActiveState(): void {
    this.toolButtons.forEach((btn, toolId) => {
      if (toolId === this.activeTool) {
        btn.style.background = 'rgba(79,195,247,0.18)';
        btn.style.borderColor = 'rgba(79,195,247,0.55)';
        btn.style.boxShadow = '0 0 10px rgba(79,195,247,0.35)';
        btn.style.color = '#4fc3f7';
      } else {
        btn.style.background = 'rgba(255,255,255,0.04)';
        btn.style.borderColor = 'rgba(255,255,255,0.08)';
        btn.style.boxShadow = 'none';
        btn.style.color = 'rgba(255,255,255,0.65)';
      }
    });
  }

  private bindKeyboard(): void {
    this._keyHandler = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return;
      switch (e.key.toLowerCase()) {
        case 's': this.setActiveTool('select');           break;
        case 'p': this.setActiveTool('place_planet');     break;
        case 'b': this.setActiveTool('place_blackhole');  break;
        case 'z': this.setActiveTool('place_speedzone');  break;
        case 'o': this.setActiveTool('place_portal');     break;
        case 't': this.setActiveTool('place_trappingbh'); break;
        case 'h': this.setActiveTool('place_whitehole');  break;
        case 'x': case 'delete': this.setActiveTool('delete'); break;
      }
    };
    window.addEventListener('keydown', this._keyHandler);
  }

  private _keyHandler!: (e: KeyboardEvent) => void;

  setActiveTool(tool: EditorTool): void {
    this.activeTool = tool;
    this.refreshActiveState();
    this.onToolChange(tool);
  }

  setLevelName(name: string): void {
    if (this.nameInput) {
      this.nameInput.value = name;
    }
    this.onLevelNameChange(name);
  }

  destroy(): void {
    window.removeEventListener('keydown', this._keyHandler);
    this.element.remove();
  }
}

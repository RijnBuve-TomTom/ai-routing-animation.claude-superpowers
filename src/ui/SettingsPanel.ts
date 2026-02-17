import { StateManager } from '../core/StateManager.js';
import { RoutingMode } from '../core/types.js';
import { FileBrowser } from './FileBrowser.js';

export class SettingsPanel {
  private container: HTMLElement;
  private isDragging: boolean = false;
  private dragOffset: { x: number; y: number } = { x: 0, y: 0 };

  constructor(private stateManager: StateManager) {
    this.container = document.getElementById('settings-panel')!;
    this.render();
    this.setupDragging();
    this.setupStateListeners();
    this.loadPosition();
  }

  private render(): void {
    this.container.innerHTML = `
      <div id="settings-panel-header">
        OSM Routing Animation
      </div>

      <div class="settings-section">
        <h3>Map Selection</h3>
        <div id="file-browser-container"></div>
      </div>

      <div class="settings-section">
        <h3>Routing Mode</h3>
        <div class="mode-buttons">
          <button class="mode-button active" data-mode="car">Car</button>
          <button class="mode-button" data-mode="bicycle">Bicycle</button>
          <button class="mode-button" data-mode="pedestrian">Pedestrian</button>
        </div>
      </div>

      <div class="settings-section">
        <h3>Animation Speed</h3>
        <label>
          <input type="range" id="speed-slider" min="1" max="10" value="5">
          <span id="speed-value">5</span>
        </label>
      </div>

      <div class="settings-section">
        <div class="checkbox-container">
          <input type="checkbox" id="osm-tiles-toggle" checked>
          <label for="osm-tiles-toggle">Show OSM Tiles (50%)</label>
        </div>
      </div>

      <div class="settings-section">
        <button class="theme-toggle" id="theme-toggle">
          Toggle Theme
        </button>
      </div>

      <div class="settings-section">
        <div class="status-display" id="status-display">
          Ready
        </div>
      </div>
    `;

    // Initialize FileBrowser
    const fileBrowserContainer = this.container.querySelector('#file-browser-container')!;
    new FileBrowser(fileBrowserContainer as HTMLElement, this.stateManager);

    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    // Mode buttons
    const modeButtons = this.container.querySelectorAll('.mode-button');
    modeButtons.forEach(button => {
      button.addEventListener('click', () => {
        const mode = (button as HTMLElement).dataset.mode as RoutingMode;
        modeButtons.forEach(b => b.classList.remove('active'));
        button.classList.add('active');
        this.stateManager.setState({ routingMode: mode });
      });
    });

    // Speed slider
    const speedSlider = this.container.querySelector('#speed-slider') as HTMLInputElement;
    const speedValue = this.container.querySelector('#speed-value')!;
    speedSlider.addEventListener('input', () => {
      const speed = parseInt(speedSlider.value);
      speedValue.textContent = speed.toString();
      this.stateManager.setState({ animationSpeed: speed });
    });

    // OSM tiles toggle
    const osmTilesToggle = this.container.querySelector('#osm-tiles-toggle') as HTMLInputElement;
    osmTilesToggle.addEventListener('change', () => {
      this.stateManager.setState({ showOSMTiles: osmTilesToggle.checked });
    });

    // Theme toggle
    const themeToggle = this.container.querySelector('#theme-toggle')!;
    themeToggle.addEventListener('click', () => {
      const currentTheme = this.stateManager.getState().theme;
      const newTheme = currentTheme === 'light' ? 'dark' : 'light';
      this.stateManager.setState({ theme: newTheme });
    });
  }

  private setupStateListeners(): void {
    this.stateManager.subscribe('state-changed', (state) => {
      const statusDisplay = this.container.querySelector('#status-display')!;

      if (state.isLoading) {
        statusDisplay.textContent = 'Loading map...';
        statusDisplay.className = 'status-display loading';
      } else if (state.isAnimating) {
        statusDisplay.textContent = 'Calculating route...';
        statusDisplay.className = 'status-display loading';
      } else {
        statusDisplay.textContent = 'Ready';
        statusDisplay.className = 'status-display success';
      }
    });

    this.stateManager.subscribe('theme-changed', (theme) => {
      document.documentElement.setAttribute('data-theme', theme);
    });

    this.stateManager.subscribe('error', (error) => {
      const statusDisplay = this.container.querySelector('#status-display')!;
      statusDisplay.textContent = error.message || 'An error occurred';
      statusDisplay.className = 'status-display error';
    });
  }

  private setupDragging(): void {
    const header = this.container.querySelector('#settings-panel-header') as HTMLElement;

    header.addEventListener('pointerdown', (e) => {
      this.isDragging = true;
      const rect = this.container.getBoundingClientRect();
      this.dragOffset = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
      header.setPointerCapture(e.pointerId);
    });

    header.addEventListener('pointermove', (e) => {
      if (!this.isDragging) return;

      const x = e.clientX - this.dragOffset.x;
      const y = e.clientY - this.dragOffset.y;

      // Constrain to viewport
      const maxX = window.innerWidth - this.container.offsetWidth;
      const maxY = window.innerHeight - this.container.offsetHeight;
      const constrainedX = Math.max(0, Math.min(x, maxX));
      const constrainedY = Math.max(0, Math.min(y, maxY));

      this.container.style.left = `${constrainedX}px`;
      this.container.style.top = `${constrainedY}px`;
      this.container.style.right = 'auto';
    });

    header.addEventListener('pointerup', (e) => {
      this.isDragging = false;
      header.releasePointerCapture(e.pointerId);
      this.savePosition();
    });
  }

  private savePosition(): void {
    const rect = this.container.getBoundingClientRect();
    localStorage.setItem('settings-panel-position', JSON.stringify({
      left: rect.left,
      top: rect.top,
    }));
  }

  private loadPosition(): void {
    const saved = localStorage.getItem('settings-panel-position');
    if (saved) {
      try {
        const { left, top } = JSON.parse(saved);
        this.container.style.left = `${left}px`;
        this.container.style.top = `${top}px`;
        this.container.style.right = 'auto';
      } catch (e) {
        console.error('Failed to load saved position:', e);
      }
    }
  }
}

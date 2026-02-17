import { StateManager } from './core/StateManager.js';
import { OSMParser } from './data/OSMParser.js';
import { RoadNetwork } from './data/RoadNetwork.js';
import { MapMatcher } from './routing/MapMatcher.js';
import { AStarRouter } from './routing/AStarRouter.js';
import { MapRenderer } from './map/MapRenderer.js';
import { AnimationController } from './map/AnimationController.js';
import { SettingsPanel } from './ui/SettingsPanel.js';
import { LatLng, SnappedPoint } from './core/types.js';

class Application {
  private stateManager: StateManager;
  private osmParser: OSMParser;
  private roadNetwork: RoadNetwork;
  private mapMatcher: MapMatcher | null = null;
  private aStarRouter: AStarRouter | null = null;
  private mapRenderer: MapRenderer;
  private animationController: AnimationController | null = null;
  private settingsPanel: SettingsPanel;

  private snappedOrigin: SnappedPoint | null = null;
  private snappedDestination: SnappedPoint | null = null;

  constructor() {
    this.stateManager = new StateManager();
    this.osmParser = new OSMParser();
    this.roadNetwork = new RoadNetwork();
    this.mapRenderer = new MapRenderer();
    this.settingsPanel = new SettingsPanel(this.stateManager);

    this.initializeMap();
    this.setupEventListeners();
  }

  private initializeMap(): void {
    try {
      this.mapRenderer.initialize('map');
      this.mapRenderer.onClick((lngLat) => this.handleMapClick(lngLat));
    } catch (error) {
      this.stateManager.emit('error', { message: 'Failed to initialize map. Check Mapbox token.' });
      console.error(error);
    }
  }

  private setupEventListeners(): void {
    // File selection
    this.stateManager.subscribe('file-selected', async (filename) => {
      try {
        const parsed = await this.osmParser.parseFile(filename);
        this.roadNetwork.buildFromOSM(parsed);
        this.mapRenderer.loadOSMData(this.roadNetwork);

        this.mapMatcher = new MapMatcher(this.roadNetwork);
        this.aStarRouter = new AStarRouter(this.roadNetwork);
        this.animationController = new AnimationController(
          this.mapRenderer,
          this.roadNetwork,
          this.stateManager
        );

        this.stateManager.setState({
          isLoading: false,
          origin: null,
          destination: null,
        });
        this.snappedOrigin = null;
        this.snappedDestination = null;
        this.mapRenderer.clearMarkers();
        this.mapRenderer.clearExploredNodes();
        this.mapRenderer.clearBestPath();
      } catch (error) {
        this.stateManager.setState({ isLoading: false });
        this.stateManager.emit('error', {
          message: `Failed to load map: ${(error as Error).message}`
        });
        console.error(error);
      }
    });

    // Routing mode change
    this.stateManager.subscribe('mode-changed', () => {
      if (this.snappedOrigin && this.snappedDestination) {
        this.recalculateRoute();
      }
    });

    // Animation speed change
    this.stateManager.subscribe('animation-speed-changed', (speed) => {
      if (this.animationController) {
        this.animationController.setSpeed(speed);
      }
    });

    // OSM tiles toggle
    this.stateManager.subscribe('state-changed', (state) => {
      if (state.showOSMTiles !== undefined) {
        this.mapRenderer.setOSMTilesVisible(state.showOSMTiles);
      }
    });
  }

  private handleMapClick(lngLat: LatLng): void {
    if (!this.mapMatcher || !this.aStarRouter || !this.animationController) {
      this.stateManager.emit('error', { message: 'Please load a map first' });
      return;
    }

    const state = this.stateManager.getState();
    const snapped = this.mapMatcher.snapToRoad(lngLat, state.routingMode);

    if (!snapped) {
      this.stateManager.emit('error', { message: 'Click closer to a road' });
      return;
    }

    if (!state.origin) {
      // Set origin
      this.snappedOrigin = snapped;
      this.stateManager.setState({ origin: snapped.location });
      this.mapRenderer.addMarker(snapped.location, 'origin');
    } else if (!state.destination) {
      // Set destination and calculate route
      this.snappedDestination = snapped;
      this.stateManager.setState({ destination: snapped.location });
      this.mapRenderer.addMarker(snapped.location, 'destination');
      this.calculateRoute();
    } else {
      // Reset and set new origin
      this.mapRenderer.clearMarkers();
      this.mapRenderer.clearExploredNodes();
      this.mapRenderer.clearBestPath();
      this.snappedOrigin = snapped;
      this.snappedDestination = null;
      this.stateManager.setState({
        origin: snapped.location,
        destination: null,
      });
      this.mapRenderer.addMarker(snapped.location, 'origin');
    }
  }

  private calculateRoute(): void {
    if (!this.snappedOrigin || !this.snappedDestination ||
        !this.aStarRouter || !this.animationController) {
      return;
    }

    const state = this.stateManager.getState();
    this.stateManager.emit('routing-started', null);

    this.mapRenderer.clearExploredNodes();
    this.mapRenderer.clearBestPath();

    const generator = this.aStarRouter.findRoute(
      this.snappedOrigin,
      this.snappedDestination,
      state.routingMode
    );

    this.animationController.start(generator, state.animationSpeed);
  }

  private recalculateRoute(): void {
    if (!this.snappedOrigin || !this.snappedDestination || !this.mapMatcher) {
      return;
    }

    const state = this.stateManager.getState();

    // Re-snap both points to valid roads for new mode
    const newOrigin = this.mapMatcher.snapToRoad(
      this.snappedOrigin.location,
      state.routingMode
    );
    const newDestination = this.mapMatcher.snapToRoad(
      this.snappedDestination.location,
      state.routingMode
    );

    if (!newOrigin || !newDestination) {
      this.stateManager.emit('error', {
        message: 'Points not valid for this routing mode'
      });
      return;
    }

    this.snappedOrigin = newOrigin;
    this.snappedDestination = newDestination;

    // Update markers if positions changed
    this.mapRenderer.clearMarkers();
    this.mapRenderer.addMarker(newOrigin.location, 'origin');
    this.mapRenderer.addMarker(newDestination.location, 'destination');

    this.calculateRoute();
  }
}

// Initialize application
new Application();

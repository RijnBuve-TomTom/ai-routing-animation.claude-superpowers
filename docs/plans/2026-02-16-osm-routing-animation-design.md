# OSM A* Routing Animation - Design Document

**Date:** 2026-02-16
**Project:** TypeScript OSM Routing Visualization
**Technology Stack:** Vanilla TypeScript, Vite, Mapbox GL JS, pako

## Overview

An interactive web application that visualizes A* pathfinding on OpenStreetMap data. Users select OSM files, choose routing modes (car/bicycle/pedestrian), and watch animated route calculations with step-by-step exploration visualization.

## Requirements

- Load gzipped OSM XML files from `public/maps/` directory
- Parse and render OSM road networks on Mapbox GL JS
- Calculate routes using A* algorithm with mode-specific constraints
- Animate route exploration (blue lines) with final path highlighted (red line)
- Support three routing modes: car, bicycle, pedestrian
- Respect one-way restrictions for cars only
- Map matching: snap clicks to nearest road segments
- Draggable, semi-transparent settings panel with light/dark themes
- User-controllable animation speed (1-10)
- Optional OSM tile background at 50% opacity

## Architecture

### High-Level Structure

Modular class-based architecture with clear separation of concerns:

1. **Data Layer** - `OSMParser` and `RoadNetwork` handle file parsing and graph construction
2. **Routing Layer** - `AStarRouter` and `MapMatcher` implement pathfinding and point snapping
3. **Visualization Layer** - `MapRenderer` and `AnimationController` handle map display and animation
4. **UI Layer** - `SettingsPanel` and `FileBrowser` provide user interface
5. **State Layer** - `StateManager` coordinates components via observer pattern

**Communication:** UI interactions → StateManager → components observe changes → trigger actions

### Project Structure

```
src/
├── core/
│   ├── StateManager.ts      # Observer pattern for state management
│   └── types.ts             # Shared TypeScript interfaces
├── data/
│   ├── OSMParser.ts         # Parse .osm.gz files
│   └── RoadNetwork.ts       # Graph structure with bidirectional edges
├── routing/
│   ├── AStarRouter.ts       # Generator-based A* implementation
│   └── MapMatcher.ts        # Point-to-segment snapping
├── map/
│   ├── MapRenderer.ts       # Mapbox GL JS wrapper
│   └── AnimationController.ts  # Animation playback control
├── ui/
│   ├── SettingsPanel.ts     # Draggable panel with controls
│   └── FileBrowser.ts       # OSM file selector
└── main.ts                  # Application initialization
```

## Component Details

### StateManager

Central state store implementing observer pattern for reactive updates.

**State Properties:**
```typescript
{
  selectedFile: string | null
  routingMode: 'car' | 'bicycle' | 'pedestrian'
  origin: LatLng | null
  destination: LatLng | null
  animationSpeed: number  // 1-10
  showOSMTiles: boolean
  theme: 'light' | 'dark'
  isAnimating: boolean
}
```

**Key Methods:**
- `subscribe(event: string, callback: Function)` - Register observers
- `emit(event: string, data: any)` - Notify subscribers
- `setState(updates: Partial<State>)` - Update state and trigger events

### OSMParser

Parses gzipped OSM XML files into structured data.

**Responsibilities:**
- Decompress `.osm.gz` files using pako
- Parse XML with DOMParser to extract nodes and ways
- Filter ways by routing mode compatibility
- Extract relevant OSM tags (highway type, oneway, maxspeed, etc.)

**Data Structures:**
```typescript
interface Node {
  id: string
  lat: number
  lon: number
}

interface Way {
  id: string
  nodeIds: string[]
  tags: Map<string, string>
}

interface ParsedOSM {
  nodes: Map<string, Node>
  ways: Way[]
}
```

**Key Methods:**
- `async parseFile(filename: string): Promise<ParsedOSM>`
- `decompress(buffer: ArrayBuffer): string`
- `parseXML(xml: string): ParsedOSM`
- `filterWaysByMode(ways: Way[], mode: RoutingMode): Way[]`

### RoadNetwork

Builds graph structure optimized for A* routing with bidirectional adjacency lists.

**Graph Construction:**
- Parses OSM ways to create directed edges
- Bidirectional edges for two-way streets
- Unidirectional edges for one-way streets (enforced for car mode only)
- Edge metadata: `{ targetNodeId, cost, wayId, isOneway, validModes[] }`
- Cost calculation: distance / speed (time-based routing)

**Speed Mappings (km/h):**
- motorway: 120, trunk: 100, primary: 80, secondary: 70, tertiary: 60
- residential: 40, unclassified: 50, service: 20, living_street: 10
- cycleway: 20 (bike only), footway/path: 5 (pedestrian only)
- Bicycles: fixed 20 km/h, Pedestrians: fixed 5 km/h

**Key Methods:**
- `buildFromOSM(parsed: ParsedOSM): void` - Construct graph from parsed data
- `getNeighbors(nodeId: string, mode: RoutingMode): Edge[]` - Get valid edges for mode
- `getEdgeCost(from: string, to: string, mode: RoutingMode): number` - Calculate travel time
- `getSpeedLimit(wayTags: Map<string, string>): number` - Map highway type to speed

### MapMatcher

Snaps user-clicked points to nearest valid road segments with interpolation.

**Algorithm:**
- Search within radius (e.g., 50m) for nearby road segments
- Calculate perpendicular distance from point to each segment
- Find closest point on closest segment (interpolation between nodes)
- Validate segment is valid for current routing mode

**Key Methods:**
- `snapToRoad(point: LatLng, mode: RoutingMode): SnappedPoint`
- `findNearestSegment(point: LatLng, maxRadius: number): Segment`
- `interpolatePoint(point: LatLng, segment: Segment): LatLng`

**Return Type:**
```typescript
interface SnappedPoint {
  location: LatLng
  nodeIds: [string, string]  // Segment endpoints
  interpolation: number      // 0-1 position on segment
}
```

### AStarRouter

Implements A* pathfinding as a generator for step-by-step animation.

**Generator Pattern:**
```typescript
*findRoute(
  origin: SnappedPoint,
  dest: SnappedPoint,
  mode: RoutingMode
): Generator<RouteStep>
```

**Yields:**
- `{ type: 'explore', nodeId, gScore, fScore }` - Node being examined
- `{ type: 'path-update', path: nodeId[] }` - Current best path changed
- `{ type: 'complete', path: nodeId[], totalCost }` - Final result

**Algorithm Details:**
- Heuristic: Haversine distance / expected speed for mode
- Priority queue (binary heap) for open set
- Closed set tracking visited nodes
- Parent pointers for path reconstruction
- Temporary edges for snapped points (interpolated positions)

**Edge Filtering:**
- Cars: respect one-way restrictions
- Bicycles/Pedestrians: ignore one-way restrictions, use all edges

### MapRenderer

Manages Mapbox GL JS map instance and custom visualization layers.

**Layer Structure (bottom to top):**
1. OSM tile layer (optional, 50% opacity)
2. Parsed road network layer (gray lines)
3. Explored nodes layer (blue lines, updated incrementally)
4. Best path layer (thick red line, always on top)
5. Origin/destination markers

**Key Methods:**
- `initialize(container: HTMLElement): void` - Setup Mapbox instance
- `loadOSMData(network: RoadNetwork): void` - Render road network as GeoJSON
- `updateExploredNodes(nodeIds: string[]): void` - Add blue exploration lines
- `updateBestPath(path: string[]): void` - Draw thick red route
- `setOSMTilesVisible(visible: boolean): void` - Toggle background tiles
- `addMarker(location: LatLng, type: 'origin' | 'destination'): void`

**Performance Optimization:**
- GeoJSON sources for efficient bulk updates
- Incremental updates during animation (append-only for explored nodes)
- Layer ordering ensures red path always visible

### AnimationController

Controls animation playback of routing steps from generator.

**Responsibilities:**
- Consume A* generator at user-controlled speed
- Update MapRenderer with each step
- Provide playback controls (pause/resume/stop)
- Handle speed changes during animation

**Key Methods:**
- `start(generator: Generator<RouteStep>, speed: number): void`
- `pause(): void`, `resume(): void`, `stop(): void`
- `setSpeed(speed: number): void` - Adjust frame delay

**Animation Loop:**
- Uses `requestAnimationFrame` for smooth rendering
- Speed mapping: 1→500ms delay, 10→10ms delay (logarithmic scale)
- Consumes one generator step per delay interval
- Updates MapRenderer for each explore/path-update step
- Emits progress events to StateManager

### FileBrowser

Displays and handles selection of OSM files from `public/maps/`.

**Implementation:**
- Reads `public/maps/index.json` for available files
- Renders as dropdown or list in settings panel
- On selection: emits event to StateManager
- Shows file size information (optional)

### SettingsPanel

Draggable floating panel containing all user controls.

**UI Elements:**
- File selector (FileBrowser component)
- Routing mode buttons (Car / Bicycle / Pedestrian)
- Animation speed slider (1-10 with labels)
- OSM tiles toggle checkbox
- Theme toggle button (Light / Dark)
- Status display ("Routing...", "Ready", error messages)

**Draggable Implementation:**
- Panel header captures `pointerdown` to initiate drag
- Track `pointermove` for position updates
- `pointerup` ends drag interaction
- CSS `transform: translate()` for positioning
- Position persisted to localStorage

**Theme System:**
- CSS variables for colors: `--bg-color`, `--text-color`, `--panel-bg`, etc.
- `data-theme="light|dark"` attribute on root element
- Light theme: white/gray backgrounds, dark text
- Dark theme: dark backgrounds (#1e1e1e), light text
- Semi-transparent panel: `rgba(255,255,255,0.9)` / `rgba(30,30,30,0.9)`

**Layout:**
- Fixed position, initially centered
- z-index above map, below modals
- Collapsible sections for cleaner UI
- Responsive sizing for mobile

### Main Application

Orchestrates initialization and coordinates all components.

**Initialization Flow:**
1. Create StateManager instance
2. Initialize MapRenderer with container element
3. Setup SettingsPanel with event listeners
4. Create FileBrowser and load available files
5. Register state observers on all components
6. Setup map click handler
7. Load initial file if specified in URL params

**Event Coordination:**
- File selected → parse OSM → build network → render
- Map clicked → snap point → update origin/destination → route if both set
- Routing mode changed → re-snap points → recalculate route
- Animation speed changed → update AnimationController
- Theme changed → update CSS variables

## Data Flow

### Initialization
1. Main creates StateManager, MapRenderer, SettingsPanel, FileBrowser
2. FileBrowser reads `public/maps/index.json`
3. Map initialized with Mapbox GL JS, click listener registered

### File Selection
1. User selects OSM file → FileBrowser updates StateManager
2. StateManager emits `'file-selected'` event
3. Main observes event → OSMParser.parseFile()
4. Parser decompresses, extracts nodes/ways
5. RoadNetwork.buildFromOSM() constructs graph
6. MapRenderer.loadOSMData() renders road network
7. StateManager updates loading state

### Routing
1. User clicks map (first click=origin, second=destination)
2. MapRenderer captures coordinates
3. MapMatcher.snapToRoad() finds nearest valid segment
4. StateManager updates origin/destination
5. When both points set → AStarRouter.findRoute()
6. Main passes generator to AnimationController.start()
7. AnimationController iterates:
   - 'explore' step → MapRenderer.updateExploredNodes()
   - 'path-update' step → MapRenderer.updateBestPath()
   - Timing controlled by speed setting
8. On completion → StateManager updates isAnimating=false

### Mode Change
1. User clicks routing mode button
2. StateManager emits `'mode-changed'`
3. Main re-snaps origin/destination with MapMatcher (new mode)
4. If snap locations change → update markers
5. Clear previous route visualization
6. Trigger new route calculation

### Animation Control
- Speed slider → StateManager → AnimationController adjusts delay
- Tiles toggle → StateManager → MapRenderer updates layer visibility
- Theme toggle → StateManager → SettingsPanel updates CSS variables

## Error Handling

### File Loading Errors
- **File not found:** Display error in status, allow re-selection
- **Decompression failure:** Catch pako errors, show "Invalid or corrupted file"
- **Parse errors:** Validate OSM XML structure, specific error messages
- **Empty data:** Check parsed result has nodes/ways, warn user

### Routing Errors
- **No path found:** Display "No route available for this mode"
- **Snap failure:** Show "Click closer to a road" if point too far
- **Invalid mode:** Warn if no valid roads exist for mode in area
- **Disconnected graph:** Show "Points not connected" if separate components

### Map Rendering Errors
- **Mapbox init failure:** Catch GL errors, show browser requirements
- **Layer update errors:** Try-catch wrappers, log without crashing
- **Memory issues:** Warn if node/way count exceeds threshold

### UI Errors
- **Drag boundaries:** Constrain panel to viewport bounds
- **Invalid speed:** Clamp to 1-10 range
- **State corruption:** Validate state updates, reject invalid values

**Error Display Strategy:**
- Toast notifications for transient errors
- Persistent status in SettingsPanel for blocking errors
- Console logging with verbose flag for debugging

## Testing Strategy

### Unit Tests
- **StateManager:** Subscribe/emit/setState logic, multiple subscribers
- **OSMParser:** Fixture OSM files, verify node/way extraction
- **RoadNetwork:** Graph construction, edge filtering, speed calculations
- **MapMatcher:** Point-to-segment projection with known coordinates
- **AStarRouter:** Small test graphs, verify optimal paths and yields

### Integration Tests
- **File loading:** OSMParser → RoadNetwork → MapRenderer pipeline
- **Routing:** Click → MapMatcher → AStarRouter → AnimationController
- **Mode switching:** Verify re-snapping and re-routing behavior
- **State propagation:** State changes trigger correct component updates

### Manual Testing Scenarios
1. Load leiden.osm.gz, verify road network renders correctly
2. Car mode: route between points, verify one-way restrictions honored
3. Bicycle mode: verify route changes (ignores one-ways)
4. Adjust animation speed, verify timing changes smoothly
5. Toggle OSM tiles, verify 50% opacity background appears/disappears
6. Drag settings panel, reload page, verify position persists
7. Toggle theme, verify all UI elements update correctly
8. Test on mobile/touch device, verify pointer interactions work

### Performance Testing
- Measure parse time for leiden.osm.gz (~21MB)
- Profile A* performance with long routes (1000+ nodes)
- Check animation frame rate during complex visualizations
- Memory usage monitoring with large road networks

## Technology Justification

### Mapbox GL JS
- WebGL-based rendering for smooth animation performance
- Excellent layer management for complex visualizations
- Good GeoJSON support for dynamic updates
- Vector tiles for clean map rendering

### Vanilla TypeScript + Vite
- No framework overhead for focused application
- Full control over DOM manipulation
- Excellent TypeScript support and type checking
- Fast development experience with Vite HMR

### pako
- Mature, reliable gzip decompression
- Works in browser environment
- Good performance for large files

### Generator Pattern for A*
- Clean separation of algorithm and visualization
- Flexible animation control (pause/resume/speed)
- Memory efficient (yields steps incrementally)
- Easy to test algorithm independently

### Observer Pattern for State
- Loose coupling between components
- Easy to add new observers
- Clear unidirectional data flow
- Simple implementation without libraries

## Future Enhancements

- Route alternatives (Nth best path)
- Turn-by-turn navigation instructions
- Elevation data and hill penalties
- Traffic simulation and time-of-day routing
- Export routes as GPX/GeoJSON
- Route comparison between modes
- Mobile app wrapper (Capacitor)
- Multi-destination route optimization

## Conclusion

This design provides a robust, maintainable architecture for OSM routing visualization. The modular class-based structure with observer pattern enables clear separation of concerns while maintaining loose coupling. The generator-based A* implementation provides flexible animation control, and the Mapbox GL JS foundation ensures smooth, performant rendering even with complex road networks.

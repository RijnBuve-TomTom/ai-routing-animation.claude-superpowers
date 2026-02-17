# OSM A* Routing Animation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build an interactive TypeScript web application that visualizes A* pathfinding on OpenStreetMap data with animated route exploration.

**Architecture:** Modular class-based architecture with StateManager (observer pattern) coordinating OSMParser (data), RoadNetwork (graph), AStarRouter (generator-based pathfinding), MapRenderer (Mapbox GL JS), AnimationController (playback), and UI components (SettingsPanel, FileBrowser).

**Tech Stack:** TypeScript, Vite, Mapbox GL JS, pako (gzip), vanilla DOM manipulation

---

## Task 1: Project Setup

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vite.config.ts`
- Create: `index.html`
- Create: `.gitignore`

**Step 1: Initialize project and install dependencies**

```bash
npm init -y
npm install --save-dev vite typescript @types/node
npm install mapbox-gl pako
npm install --save-dev @types/mapbox-gl @types/pako
```

**Step 2: Create TypeScript config**

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "moduleResolution": "bundler",
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "noEmit": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules"]
}
```

**Step 3: Create Vite config**

Create `vite.config.ts`:

```typescript
import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 3000,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
```

**Step 4: Create HTML entry point**

Create `index.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>OSM Routing Animation</title>
  <link href="https://api.mapbox.com/mapbox-gl-js/v3.1.0/mapbox-gl.css" rel="stylesheet">
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      overflow: hidden;
    }
    #map {
      position: absolute;
      top: 0;
      bottom: 0;
      width: 100%;
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <div id="settings-panel"></div>
  <script type="module" src="/src/main.ts"></script>
</body>
</html>
```

**Step 5: Create gitignore**

Create `.gitignore`:

```
node_modules/
dist/
.DS_Store
*.log
.vscode/
.idea/
```

**Step 6: Update package.json scripts**

Modify `package.json` to add scripts:

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview"
  }
}
```

**Step 7: Commit setup**

```bash
git add package.json package-lock.json tsconfig.json vite.config.ts index.html .gitignore
git commit -m "feat: initialize project with Vite and TypeScript

- Setup TypeScript with strict mode
- Configure Vite dev server
- Add Mapbox GL JS and pako dependencies
- Create HTML entry point

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 2: Core Types and Interfaces

**Files:**
- Create: `src/core/types.ts`

**Step 1: Define shared TypeScript interfaces**

Create `src/core/types.ts`:

```typescript
export interface LatLng {
  lat: number;
  lng: number;
}

export type RoutingMode = 'car' | 'bicycle' | 'pedestrian';

export type Theme = 'light' | 'dark';

export interface AppState {
  selectedFile: string | null;
  routingMode: RoutingMode;
  origin: LatLng | null;
  destination: LatLng | null;
  animationSpeed: number;
  showOSMTiles: boolean;
  theme: Theme;
  isAnimating: boolean;
  isLoading: boolean;
}

export interface OSMNode {
  id: string;
  lat: number;
  lon: number;
}

export interface OSMWay {
  id: string;
  nodeIds: string[];
  tags: Map<string, string>;
}

export interface ParsedOSM {
  nodes: Map<string, OSMNode>;
  ways: OSMWay[];
}

export interface Edge {
  targetNodeId: string;
  cost: number;
  wayId: string;
  isOneway: boolean;
  validModes: RoutingMode[];
}

export interface SnappedPoint {
  location: LatLng;
  nodeIds: [string, string];
  interpolation: number;
}

export type RouteStepType = 'explore' | 'path-update' | 'complete';

export interface RouteStepExplore {
  type: 'explore';
  nodeId: string;
  gScore: number;
  fScore: number;
}

export interface RouteStepPathUpdate {
  type: 'path-update';
  path: string[];
}

export interface RouteStepComplete {
  type: 'complete';
  path: string[];
  totalCost: number;
}

export type RouteStep = RouteStepExplore | RouteStepPathUpdate | RouteStepComplete;

export type StateEventType =
  | 'state-changed'
  | 'file-selected'
  | 'mode-changed'
  | 'origin-set'
  | 'destination-set'
  | 'animation-speed-changed'
  | 'theme-changed'
  | 'routing-started'
  | 'routing-complete'
  | 'error';

export interface StateEvent {
  type: StateEventType;
  data?: any;
}
```

**Step 2: Commit types**

```bash
git add src/core/types.ts
git commit -m "feat: add core TypeScript interfaces

- Define app state and routing types
- Add OSM data structures
- Define event types for observer pattern

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 3: StateManager Implementation

**Files:**
- Create: `src/core/StateManager.ts`

**Step 1: Implement observer pattern state manager**

Create `src/core/StateManager.ts`:

```typescript
import { AppState, StateEventType, RoutingMode, LatLng, Theme } from './types.js';

type EventCallback = (data?: any) => void;

export class StateManager {
  private state: AppState;
  private listeners: Map<StateEventType, Set<EventCallback>>;

  constructor() {
    this.state = {
      selectedFile: null,
      routingMode: 'car',
      origin: null,
      destination: null,
      animationSpeed: 5,
      showOSMTiles: true,
      theme: 'light',
      isAnimating: false,
      isLoading: false,
    };
    this.listeners = new Map();
  }

  public getState(): Readonly<AppState> {
    return { ...this.state };
  }

  public subscribe(event: StateEventType, callback: EventCallback): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);

    // Return unsubscribe function
    return () => {
      const callbacks = this.listeners.get(event);
      if (callbacks) {
        callbacks.delete(callback);
      }
    };
  }

  public emit(event: StateEventType, data?: any): void {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.forEach(callback => callback(data));
    }
  }

  public setState(updates: Partial<AppState>): void {
    const oldState = { ...this.state };
    this.state = { ...this.state, ...updates };

    // Emit general state change
    this.emit('state-changed', this.state);

    // Emit specific events
    if (updates.selectedFile !== undefined && updates.selectedFile !== oldState.selectedFile) {
      this.emit('file-selected', updates.selectedFile);
    }
    if (updates.routingMode !== undefined && updates.routingMode !== oldState.routingMode) {
      this.emit('mode-changed', updates.routingMode);
    }
    if (updates.origin !== undefined && updates.origin !== oldState.origin) {
      this.emit('origin-set', updates.origin);
    }
    if (updates.destination !== undefined && updates.destination !== oldState.destination) {
      this.emit('destination-set', updates.destination);
    }
    if (updates.animationSpeed !== undefined && updates.animationSpeed !== oldState.animationSpeed) {
      this.emit('animation-speed-changed', updates.animationSpeed);
    }
    if (updates.theme !== undefined && updates.theme !== oldState.theme) {
      this.emit('theme-changed', updates.theme);
    }
  }
}
```

**Step 2: Commit StateManager**

```bash
git add src/core/StateManager.ts
git commit -m "feat: implement StateManager with observer pattern

- Subscribe/emit/setState methods
- Automatic event emission on state changes
- Unsubscribe function support

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 4: OSMParser Implementation

**Files:**
- Create: `src/data/OSMParser.ts`

**Step 1: Implement OSM file parser with pako**

Create `src/data/OSMParser.ts`:

```typescript
import * as pako from 'pako';
import { ParsedOSM, OSMNode, OSMWay } from '../core/types.js';

export class OSMParser {
  public async parseFile(filename: string): Promise<ParsedOSM> {
    const response = await fetch(`/public/maps/${filename}`);
    if (!response.ok) {
      throw new Error(`Failed to load file: ${filename}`);
    }

    const buffer = await response.arrayBuffer();
    const xml = this.decompress(buffer);
    return this.parseXML(xml);
  }

  private decompress(buffer: ArrayBuffer): string {
    try {
      const uint8Array = new Uint8Array(buffer);
      const decompressed = pako.inflate(uint8Array, { to: 'string' });
      return decompressed;
    } catch (error) {
      throw new Error(`Decompression failed: ${error}`);
    }
  }

  private parseXML(xml: string): ParsedOSM {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, 'text/xml');

    // Check for parse errors
    const parseError = doc.querySelector('parsererror');
    if (parseError) {
      throw new Error('Invalid OSM XML format');
    }

    const nodes = new Map<string, OSMNode>();
    const ways: OSMWay[] = [];

    // Parse nodes
    const nodeElements = doc.querySelectorAll('node');
    nodeElements.forEach(nodeEl => {
      const id = nodeEl.getAttribute('id');
      const lat = nodeEl.getAttribute('lat');
      const lon = nodeEl.getAttribute('lon');

      if (id && lat && lon) {
        nodes.set(id, {
          id,
          lat: parseFloat(lat),
          lon: parseFloat(lon),
        });
      }
    });

    // Parse ways
    const wayElements = doc.querySelectorAll('way');
    wayElements.forEach(wayEl => {
      const id = wayEl.getAttribute('id');
      if (!id) return;

      const nodeIds: string[] = [];
      const tags = new Map<string, string>();

      wayEl.querySelectorAll('nd').forEach(nd => {
        const ref = nd.getAttribute('ref');
        if (ref) nodeIds.push(ref);
      });

      wayEl.querySelectorAll('tag').forEach(tag => {
        const k = tag.getAttribute('k');
        const v = tag.getAttribute('v');
        if (k && v) tags.set(k, v);
      });

      // Only include ways that are roads (have highway tag)
      if (tags.has('highway') && nodeIds.length >= 2) {
        ways.push({ id, nodeIds, tags });
      }
    });

    if (nodes.size === 0 || ways.length === 0) {
      throw new Error('No valid OSM data found in file');
    }

    return { nodes, ways };
  }
}
```

**Step 2: Commit OSMParser**

```bash
git add src/data/OSMParser.ts
git commit -m "feat: implement OSM file parser

- Decompress gzipped files with pako
- Parse XML with DOMParser
- Extract nodes and ways with highway tags
- Error handling for invalid files

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 5: RoadNetwork Graph Implementation

**Files:**
- Create: `src/data/RoadNetwork.ts`

**Step 1: Implement road network graph with speed mappings**

Create `src/data/RoadNetwork.ts`:

```typescript
import { ParsedOSM, OSMNode, OSMWay, Edge, RoutingMode, LatLng } from '../core/types.js';

export class RoadNetwork {
  private nodes: Map<string, OSMNode>;
  private adjacencyList: Map<string, Edge[]>;

  constructor() {
    this.nodes = new Map();
    this.adjacencyList = new Map();
  }

  public buildFromOSM(parsed: ParsedOSM): void {
    this.nodes = parsed.nodes;
    this.adjacencyList = new Map();

    // Build graph edges from ways
    for (const way of parsed.ways) {
      const isOneway = this.isOneway(way.tags);
      const validModes = this.getValidModes(way.tags);
      const speed = this.getSpeedLimit(way.tags);

      for (let i = 0; i < way.nodeIds.length - 1; i++) {
        const fromId = way.nodeIds[i];
        const toId = way.nodeIds[i + 1];

        const fromNode = this.nodes.get(fromId);
        const toNode = this.nodes.get(toId);

        if (!fromNode || !toNode) continue;

        const distance = this.haversineDistance(
          { lat: fromNode.lat, lng: fromNode.lon },
          { lat: toNode.lat, lng: toNode.lon }
        );

        const cost = (distance / 1000) / speed * 60; // time in minutes

        // Forward edge
        this.addEdge(fromId, {
          targetNodeId: toId,
          cost,
          wayId: way.id,
          isOneway,
          validModes,
        });

        // Backward edge (if not oneway)
        if (!isOneway) {
          this.addEdge(toId, {
            targetNodeId: fromId,
            cost,
            wayId: way.id,
            isOneway: false,
            validModes,
          });
        }
      }
    }
  }

  public getNode(nodeId: string): OSMNode | undefined {
    return this.nodes.get(nodeId);
  }

  public getNeighbors(nodeId: string, mode: RoutingMode): Edge[] {
    const edges = this.adjacencyList.get(nodeId) || [];

    // Cars respect oneway restrictions, bikes and pedestrians don't
    if (mode === 'car') {
      return edges.filter(edge => edge.validModes.includes(mode));
    } else {
      // For bikes and pedestrians, ignore oneway but still filter by valid modes
      return edges.filter(edge => edge.validModes.includes(mode));
    }
  }

  public getAllNodes(): Map<string, OSMNode> {
    return this.nodes;
  }

  public getAllEdges(): Map<string, Edge[]> {
    return this.adjacencyList;
  }

  private addEdge(fromId: string, edge: Edge): void {
    if (!this.adjacencyList.has(fromId)) {
      this.adjacencyList.set(fromId, []);
    }
    this.adjacencyList.get(fromId)!.push(edge);
  }

  private isOneway(tags: Map<string, string>): boolean {
    const oneway = tags.get('oneway');
    return oneway === 'yes' || oneway === '1' || oneway === 'true';
  }

  private getValidModes(tags: Map<string, string>): RoutingMode[] {
    const highway = tags.get('highway');
    if (!highway) return [];

    const modes: RoutingMode[] = [];

    // Car-accessible roads
    const carRoads = ['motorway', 'trunk', 'primary', 'secondary', 'tertiary',
                      'unclassified', 'residential', 'motorway_link', 'trunk_link',
                      'primary_link', 'secondary_link', 'tertiary_link', 'living_street',
                      'service'];
    if (carRoads.includes(highway)) {
      modes.push('car');
    }

    // Bicycle-accessible roads (almost everything except motorways)
    const bikeRoads = ['trunk', 'primary', 'secondary', 'tertiary', 'unclassified',
                       'residential', 'living_street', 'service', 'cycleway', 'path',
                       'footway', 'track'];
    if (bikeRoads.includes(highway)) {
      modes.push('bicycle');
    }

    // Pedestrian-accessible roads
    const pedestrianRoads = ['primary', 'secondary', 'tertiary', 'unclassified',
                             'residential', 'living_street', 'service', 'footway',
                             'path', 'steps', 'pedestrian'];
    if (pedestrianRoads.includes(highway)) {
      modes.push('pedestrian');
    }

    return modes;
  }

  private getSpeedLimit(tags: Map<string, string>): number {
    const highway = tags.get('highway');
    if (!highway) return 40;

    // Speed in km/h
    const speedMap: Record<string, number> = {
      motorway: 120,
      trunk: 100,
      primary: 80,
      secondary: 70,
      tertiary: 60,
      unclassified: 50,
      residential: 40,
      living_street: 10,
      service: 20,
      motorway_link: 60,
      trunk_link: 50,
      primary_link: 50,
      secondary_link: 40,
      tertiary_link: 40,
      cycleway: 20,
      footway: 5,
      path: 5,
      steps: 3,
      pedestrian: 5,
    };

    return speedMap[highway] || 40;
  }

  private haversineDistance(point1: LatLng, point2: LatLng): number {
    const R = 6371000; // Earth's radius in meters
    const φ1 = point1.lat * Math.PI / 180;
    const φ2 = point2.lat * Math.PI / 180;
    const Δφ = (point2.lat - point1.lat) * Math.PI / 180;
    const Δλ = (point2.lng - point1.lng) * Math.PI / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // Distance in meters
  }
}
```

**Step 2: Commit RoadNetwork**

```bash
git add src/data/RoadNetwork.ts
git commit -m "feat: implement RoadNetwork graph builder

- Bidirectional adjacency list construction
- Speed mappings for road types
- Mode-specific edge filtering
- Haversine distance calculation

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 6: MapMatcher Point Snapping

**Files:**
- Create: `src/routing/MapMatcher.ts`

**Step 1: Implement point-to-segment snapping**

Create `src/routing/MapMatcher.ts`:

```typescript
import { LatLng, SnappedPoint, RoutingMode, OSMNode } from '../core/types.js';
import { RoadNetwork } from '../data/RoadNetwork.js';

export class MapMatcher {
  constructor(private network: RoadNetwork) {}

  public snapToRoad(point: LatLng, mode: RoutingMode, maxRadius: number = 100): SnappedPoint | null {
    let bestMatch: SnappedPoint | null = null;
    let minDistance = maxRadius;

    const nodes = this.network.getAllNodes();
    const edges = this.network.getAllEdges();

    // Search all edges for closest segment
    for (const [fromId, edgeList] of edges.entries()) {
      const fromNode = nodes.get(fromId);
      if (!fromNode) continue;

      for (const edge of edgeList) {
        // Check if edge is valid for routing mode
        if (!edge.validModes.includes(mode)) continue;

        const toNode = nodes.get(edge.targetNodeId);
        if (!toNode) continue;

        const from: LatLng = { lat: fromNode.lat, lng: fromNode.lon };
        const to: LatLng = { lat: toNode.lat, lng: toNode.lon };

        const result = this.pointToSegmentDistance(point, from, to);

        if (result.distance < minDistance) {
          minDistance = result.distance;
          bestMatch = {
            location: result.closestPoint,
            nodeIds: [fromId, edge.targetNodeId],
            interpolation: result.t,
          };
        }
      }
    }

    return bestMatch;
  }

  private pointToSegmentDistance(
    point: LatLng,
    segmentStart: LatLng,
    segmentEnd: LatLng
  ): { distance: number; closestPoint: LatLng; t: number } {
    const dx = segmentEnd.lng - segmentStart.lng;
    const dy = segmentEnd.lat - segmentStart.lat;

    if (dx === 0 && dy === 0) {
      // Segment is a point
      return {
        distance: this.haversineDistance(point, segmentStart),
        closestPoint: segmentStart,
        t: 0,
      };
    }

    // Calculate projection parameter t
    let t = ((point.lng - segmentStart.lng) * dx + (point.lat - segmentStart.lat) * dy) /
            (dx * dx + dy * dy);

    // Clamp t to [0, 1] to stay on segment
    t = Math.max(0, Math.min(1, t));

    const closestPoint: LatLng = {
      lat: segmentStart.lat + t * dy,
      lng: segmentStart.lng + t * dx,
    };

    const distance = this.haversineDistance(point, closestPoint);

    return { distance, closestPoint, t };
  }

  private haversineDistance(point1: LatLng, point2: LatLng): number {
    const R = 6371000; // Earth's radius in meters
    const φ1 = point1.lat * Math.PI / 180;
    const φ2 = point2.lat * Math.PI / 180;
    const Δφ = (point2.lat - point1.lat) * Math.PI / 180;
    const Δλ = (point2.lng - point1.lng) * Math.PI / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  }
}
```

**Step 2: Commit MapMatcher**

```bash
git add src/routing/MapMatcher.ts
git commit -m "feat: implement MapMatcher for point snapping

- Point-to-segment distance calculation
- Mode-specific road filtering
- Interpolation between nodes
- Search within configurable radius

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 7: A* Router Implementation (Part 1 - Priority Queue)

**Files:**
- Create: `src/routing/PriorityQueue.ts`

**Step 1: Implement binary heap priority queue**

Create `src/routing/PriorityQueue.ts`:

```typescript
interface PQItem<T> {
  item: T;
  priority: number;
}

export class PriorityQueue<T> {
  private heap: PQItem<T>[];

  constructor() {
    this.heap = [];
  }

  public push(item: T, priority: number): void {
    this.heap.push({ item, priority });
    this.bubbleUp(this.heap.length - 1);
  }

  public pop(): T | undefined {
    if (this.heap.length === 0) return undefined;
    if (this.heap.length === 1) return this.heap.pop()!.item;

    const result = this.heap[0].item;
    this.heap[0] = this.heap.pop()!;
    this.bubbleDown(0);

    return result;
  }

  public isEmpty(): boolean {
    return this.heap.length === 0;
  }

  public size(): number {
    return this.heap.length;
  }

  private bubbleUp(index: number): void {
    while (index > 0) {
      const parentIndex = Math.floor((index - 1) / 2);
      if (this.heap[index].priority >= this.heap[parentIndex].priority) break;

      [this.heap[index], this.heap[parentIndex]] = [this.heap[parentIndex], this.heap[index]];
      index = parentIndex;
    }
  }

  private bubbleDown(index: number): void {
    while (true) {
      let minIndex = index;
      const leftChild = 2 * index + 1;
      const rightChild = 2 * index + 2;

      if (leftChild < this.heap.length &&
          this.heap[leftChild].priority < this.heap[minIndex].priority) {
        minIndex = leftChild;
      }

      if (rightChild < this.heap.length &&
          this.heap[rightChild].priority < this.heap[minIndex].priority) {
        minIndex = rightChild;
      }

      if (minIndex === index) break;

      [this.heap[index], this.heap[minIndex]] = [this.heap[minIndex], this.heap[index]];
      index = minIndex;
    }
  }
}
```

**Step 2: Commit PriorityQueue**

```bash
git add src/routing/PriorityQueue.ts
git commit -m "feat: implement binary heap priority queue

- Min-heap for A* open set
- Push, pop, isEmpty operations
- Bubble up/down for heap property

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 8: A* Router Implementation (Part 2 - Algorithm)

**Files:**
- Create: `src/routing/AStarRouter.ts`

**Step 1: Implement generator-based A* algorithm**

Create `src/routing/AStarRouter.ts`:

```typescript
import { SnappedPoint, RouteStep, RoutingMode, LatLng } from '../core/types.js';
import { RoadNetwork } from '../data/RoadNetwork.js';
import { PriorityQueue } from './PriorityQueue.js';

export class AStarRouter {
  constructor(private network: RoadNetwork) {}

  public *findRoute(
    origin: SnappedPoint,
    destination: SnappedPoint,
    mode: RoutingMode
  ): Generator<RouteStep> {
    const startId = this.getVirtualNodeId(origin);
    const goalId = this.getVirtualNodeId(destination);

    // A* data structures
    const openSet = new PriorityQueue<string>();
    const cameFrom = new Map<string, string>();
    const gScore = new Map<string, number>();
    const fScore = new Map<string, number>();
    const closedSet = new Set<string>();

    // Initialize
    gScore.set(startId, 0);
    fScore.set(startId, this.heuristic(origin.location, destination.location, mode));
    openSet.push(startId, fScore.get(startId)!);

    let currentBestPath: string[] = [];

    while (!openSet.isEmpty()) {
      const current = openSet.pop()!;

      // Yield exploration step
      yield {
        type: 'explore',
        nodeId: current,
        gScore: gScore.get(current) || 0,
        fScore: fScore.get(current) || 0,
      };

      // Check if we reached the goal
      if (current === goalId) {
        const finalPath = this.reconstructPath(cameFrom, current);
        yield {
          type: 'complete',
          path: finalPath,
          totalCost: gScore.get(current)!,
        };
        return;
      }

      closedSet.add(current);

      // Get neighbors
      const neighbors = this.getNeighborsForNode(current, origin, destination, mode);

      for (const { nodeId, cost } of neighbors) {
        if (closedSet.has(nodeId)) continue;

        const tentativeGScore = (gScore.get(current) || Infinity) + cost;

        if (!gScore.has(nodeId) || tentativeGScore < gScore.get(nodeId)!) {
          // This is a better path
          cameFrom.set(nodeId, current);
          gScore.set(nodeId, tentativeGScore);

          const h = this.heuristic(
            this.getNodeLocation(nodeId, origin, destination),
            destination.location,
            mode
          );
          fScore.set(nodeId, tentativeGScore + h);

          openSet.push(nodeId, fScore.get(nodeId)!);

          // Update best path if this leads to goal
          const pathToNode = this.reconstructPath(cameFrom, nodeId);
          if (pathToNode.length > currentBestPath.length ||
              (nodeId === goalId && pathToNode.length >= currentBestPath.length)) {
            currentBestPath = pathToNode;
            yield {
              type: 'path-update',
              path: currentBestPath,
            };
          }
        }
      }
    }

    // No path found
    yield {
      type: 'complete',
      path: [],
      totalCost: Infinity,
    };
  }

  private getVirtualNodeId(point: SnappedPoint): string {
    // Use interpolation to create unique ID for snapped points
    return `${point.nodeIds[0]}_${point.nodeIds[1]}_${point.interpolation.toFixed(4)}`;
  }

  private getNeighborsForNode(
    nodeId: string,
    origin: SnappedPoint,
    destination: SnappedPoint,
    mode: RoutingMode
  ): Array<{ nodeId: string; cost: number }> {
    const neighbors: Array<{ nodeId: string; cost: number }> = [];

    // Handle virtual start/end nodes
    if (nodeId === this.getVirtualNodeId(origin)) {
      // From origin, can reach both segment endpoints
      const [n1, n2] = origin.nodeIds;
      const cost1 = origin.interpolation * this.getEdgeCostBetweenNodes(n1, n2, mode);
      const cost2 = (1 - origin.interpolation) * this.getEdgeCostBetweenNodes(n1, n2, mode);
      neighbors.push({ nodeId: n1, cost: cost2 });
      neighbors.push({ nodeId: n2, cost: cost1 });
    } else if (nodeId === this.getVirtualNodeId(destination)) {
      // Destination is a sink, no outgoing edges
    } else {
      // Regular node - get actual graph neighbors
      const edges = this.network.getNeighbors(nodeId, mode);
      for (const edge of edges) {
        // Check if neighbor is the destination virtual node
        if (destination.nodeIds.includes(nodeId) &&
            destination.nodeIds.includes(edge.targetNodeId)) {
          const destId = this.getVirtualNodeId(destination);
          neighbors.push({ nodeId: destId, cost: edge.cost * destination.interpolation });
        } else {
          neighbors.push({ nodeId: edge.targetNodeId, cost: edge.cost });
        }
      }
    }

    return neighbors;
  }

  private getEdgeCostBetweenNodes(fromId: string, toId: string, mode: RoutingMode): number {
    const edges = this.network.getNeighbors(fromId, mode);
    const edge = edges.find(e => e.targetNodeId === toId);
    return edge ? edge.cost : 1; // Default fallback
  }

  private getNodeLocation(
    nodeId: string,
    origin: SnappedPoint,
    destination: SnappedPoint
  ): LatLng {
    if (nodeId === this.getVirtualNodeId(origin)) return origin.location;
    if (nodeId === this.getVirtualNodeId(destination)) return destination.location;

    const node = this.network.getNode(nodeId);
    if (!node) return origin.location; // Fallback
    return { lat: node.lat, lng: node.lon };
  }

  private heuristic(from: LatLng, to: LatLng, mode: RoutingMode): number {
    const distance = this.haversineDistance(from, to);
    const speed = mode === 'car' ? 50 : mode === 'bicycle' ? 20 : 5; // km/h
    return (distance / 1000) / speed * 60; // time in minutes
  }

  private haversineDistance(point1: LatLng, point2: LatLng): number {
    const R = 6371000;
    const φ1 = point1.lat * Math.PI / 180;
    const φ2 = point2.lat * Math.PI / 180;
    const Δφ = (point2.lat - point1.lat) * Math.PI / 180;
    const Δλ = (point2.lng - point1.lng) * Math.PI / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  }

  private reconstructPath(cameFrom: Map<string, string>, current: string): string[] {
    const path = [current];
    while (cameFrom.has(current)) {
      current = cameFrom.get(current)!;
      path.unshift(current);
    }
    return path;
  }
}
```

**Step 2: Commit AStarRouter**

```bash
git add src/routing/AStarRouter.ts
git commit -m "feat: implement A* routing algorithm as generator

- Generator yields explore/path-update/complete steps
- Virtual nodes for snapped points
- Haversine heuristic with mode-specific speeds
- Path reconstruction from parent pointers

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 9: MapRenderer with Mapbox GL JS

**Files:**
- Create: `src/map/MapRenderer.ts`
- Create: `.env` (for Mapbox token)

**Step 1: Create environment file for Mapbox token**

Create `.env` in project root:

```
VITE_MAPBOX_TOKEN=pk.YOUR_MAPBOX_TOKEN_HERE
```

Note: User needs to add their own Mapbox token from https://account.mapbox.com/

**Step 2: Implement MapRenderer**

Create `src/map/MapRenderer.ts`:

```typescript
import mapboxgl from 'mapbox-gl';
import { LatLng } from '../core/types.js';
import { RoadNetwork } from '../data/RoadNetwork.js';

export class MapRenderer {
  private map: mapboxgl.Map | null = null;
  private originMarker: mapboxgl.Marker | null = null;
  private destinationMarker: mapboxgl.Marker | null = null;

  public initialize(container: string | HTMLElement): void {
    const token = import.meta.env.VITE_MAPBOX_TOKEN;
    if (!token) {
      throw new Error('Mapbox token not found. Please set VITE_MAPBOX_TOKEN in .env file');
    }

    mapboxgl.accessToken = token;

    this.map = new mapboxgl.Map({
      container,
      style: 'mapbox://styles/mapbox/light-v11',
      center: [4.4777, 52.1601], // Leiden, Netherlands
      zoom: 13,
    });

    this.map.on('load', () => {
      this.initializeLayers();
    });
  }

  private initializeLayers(): void {
    if (!this.map) return;

    // Add OSM tiles layer
    this.map.addSource('osm-tiles', {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '© OpenStreetMap contributors',
    });

    this.map.addLayer({
      id: 'osm-tiles-layer',
      type: 'raster',
      source: 'osm-tiles',
      paint: {
        'raster-opacity': 0.5,
      },
      layout: {
        visibility: 'visible',
      },
    });

    // Add road network source
    this.map.addSource('road-network', {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: [],
      },
    });

    this.map.addLayer({
      id: 'road-network-layer',
      type: 'line',
      source: 'road-network',
      paint: {
        'line-color': '#cccccc',
        'line-width': 1,
      },
    });

    // Add explored nodes source
    this.map.addSource('explored-nodes', {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: [],
      },
    });

    this.map.addLayer({
      id: 'explored-nodes-layer',
      type: 'line',
      source: 'explored-nodes',
      paint: {
        'line-color': '#3887be',
        'line-width': 2,
      },
    });

    // Add best path source
    this.map.addSource('best-path', {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: [],
      },
    });

    this.map.addLayer({
      id: 'best-path-layer',
      type: 'line',
      source: 'best-path',
      paint: {
        'line-color': '#ff0000',
        'line-width': 4,
      },
    });
  }

  public loadOSMData(network: RoadNetwork): void {
    if (!this.map) return;

    const features: any[] = [];
    const nodes = network.getAllNodes();
    const edges = network.getAllEdges();

    for (const [fromId, edgeList] of edges.entries()) {
      const fromNode = nodes.get(fromId);
      if (!fromNode) continue;

      for (const edge of edgeList) {
        const toNode = nodes.get(edge.targetNodeId);
        if (!toNode) continue;

        features.push({
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: [
              [fromNode.lon, fromNode.lat],
              [toNode.lon, toNode.lat],
            ],
          },
          properties: {},
        });
      }
    }

    const source = this.map.getSource('road-network') as mapboxgl.GeoJSONSource;
    if (source) {
      source.setData({
        type: 'FeatureCollection',
        features,
      });
    }

    // Fit map to network bounds
    if (nodes.size > 0) {
      const bounds = new mapboxgl.LngLatBounds();
      nodes.forEach(node => {
        bounds.extend([node.lon, node.lat]);
      });
      this.map.fitBounds(bounds, { padding: 50 });
    }
  }

  public updateExploredNodes(nodeIds: string[], network: RoadNetwork): void {
    if (!this.map) return;

    const features: any[] = [];
    const nodes = network.getAllNodes();
    const edges = network.getAllEdges();

    const exploredSet = new Set(nodeIds);

    for (const nodeId of exploredSet) {
      const fromNode = nodes.get(nodeId);
      if (!fromNode) continue;

      const edgeList = edges.get(nodeId) || [];
      for (const edge of edgeList) {
        if (exploredSet.has(edge.targetNodeId)) {
          const toNode = nodes.get(edge.targetNodeId);
          if (!toNode) continue;

          features.push({
            type: 'Feature',
            geometry: {
              type: 'LineString',
              coordinates: [
                [fromNode.lon, fromNode.lat],
                [toNode.lon, toNode.lat],
              ],
            },
            properties: {},
          });
        }
      }
    }

    const source = this.map.getSource('explored-nodes') as mapboxgl.GeoJSONSource;
    if (source) {
      source.setData({
        type: 'FeatureCollection',
        features,
      });
    }
  }

  public updateBestPath(path: string[], network: RoadNetwork): void {
    if (!this.map || path.length < 2) return;

    const nodes = network.getAllNodes();
    const coordinates: number[][] = [];

    for (const nodeId of path) {
      // Handle virtual nodes (from snapping)
      if (nodeId.includes('_')) {
        const parts = nodeId.split('_');
        const n1 = nodes.get(parts[0]);
        const n2 = nodes.get(parts[1]);
        const t = parseFloat(parts[2]);
        if (n1 && n2) {
          const lat = n1.lat + t * (n2.lat - n1.lat);
          const lon = n1.lon + t * (n2.lon - n1.lon);
          coordinates.push([lon, lat]);
        }
      } else {
        const node = nodes.get(nodeId);
        if (node) {
          coordinates.push([node.lon, node.lat]);
        }
      }
    }

    const source = this.map.getSource('best-path') as mapboxgl.GeoJSONSource;
    if (source) {
      source.setData({
        type: 'FeatureCollection',
        features: [{
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates,
          },
          properties: {},
        }],
      });
    }
  }

  public setOSMTilesVisible(visible: boolean): void {
    if (!this.map) return;
    this.map.setLayoutProperty(
      'osm-tiles-layer',
      'visibility',
      visible ? 'visible' : 'none'
    );
  }

  public addMarker(location: LatLng, type: 'origin' | 'destination'): void {
    if (!this.map) return;

    const color = type === 'origin' ? '#00ff00' : '#ff0000';
    const marker = new mapboxgl.Marker({ color })
      .setLngLat([location.lng, location.lat])
      .addTo(this.map);

    if (type === 'origin') {
      this.originMarker?.remove();
      this.originMarker = marker;
    } else {
      this.destinationMarker?.remove();
      this.destinationMarker = marker;
    }
  }

  public clearMarkers(): void {
    this.originMarker?.remove();
    this.destinationMarker?.remove();
    this.originMarker = null;
    this.destinationMarker = null;
  }

  public clearExploredNodes(): void {
    if (!this.map) return;
    const source = this.map.getSource('explored-nodes') as mapboxgl.GeoJSONSource;
    if (source) {
      source.setData({ type: 'FeatureCollection', features: [] });
    }
  }

  public clearBestPath(): void {
    if (!this.map) return;
    const source = this.map.getSource('best-path') as mapboxgl.GeoJSONSource;
    if (source) {
      source.setData({ type: 'FeatureCollection', features: [] });
    }
  }

  public onClick(callback: (lngLat: LatLng) => void): void {
    if (!this.map) return;
    this.map.on('click', (e) => {
      callback({ lat: e.lngLat.lat, lng: e.lngLat.lng });
    });
  }

  public getMap(): mapboxgl.Map | null {
    return this.map;
  }
}
```

**Step 3: Commit MapRenderer**

```bash
git add src/map/MapRenderer.ts .env.example
git commit -m "feat: implement MapRenderer with Mapbox GL JS

- Initialize map with layers for roads, exploration, path
- Load and render OSM road network
- Update explored nodes and best path incrementally
- Marker management for origin/destination
- OSM tiles toggle

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 10: AnimationController

**Files:**
- Create: `src/map/AnimationController.ts`

**Step 1: Implement animation playback controller**

Create `src/map/AnimationController.ts`:

```typescript
import { RouteStep } from '../core/types.js';
import { MapRenderer } from './MapRenderer.js';
import { RoadNetwork } from '../data/RoadNetwork.js';
import { StateManager } from '../core/StateManager.js';

export class AnimationController {
  private generator: Generator<RouteStep> | null = null;
  private animationFrameId: number | null = null;
  private isPaused: boolean = false;
  private speed: number = 5;
  private lastFrameTime: number = 0;
  private exploredNodes: Set<string> = new Set();
  private currentPath: string[] = [];

  constructor(
    private mapRenderer: MapRenderer,
    private network: RoadNetwork,
    private stateManager: StateManager
  ) {}

  public start(generator: Generator<RouteStep>, speed: number): void {
    this.stop();
    this.generator = generator;
    this.speed = speed;
    this.isPaused = false;
    this.exploredNodes = new Set();
    this.currentPath = [];
    this.lastFrameTime = performance.now();

    this.mapRenderer.clearExploredNodes();
    this.mapRenderer.clearBestPath();

    this.stateManager.setState({ isAnimating: true });
    this.animate();
  }

  public pause(): void {
    this.isPaused = true;
  }

  public resume(): void {
    if (!this.generator) return;
    this.isPaused = false;
    this.lastFrameTime = performance.now();
    this.animate();
  }

  public stop(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    this.generator = null;
    this.isPaused = false;
    this.stateManager.setState({ isAnimating: false });
  }

  public setSpeed(speed: number): void {
    this.speed = Math.max(1, Math.min(10, speed));
  }

  private animate = (): void => {
    if (!this.generator || this.isPaused) return;

    const now = performance.now();
    const delay = this.getDelayForSpeed(this.speed);

    if (now - this.lastFrameTime >= delay) {
      this.lastFrameTime = now;

      const result = this.generator.next();

      if (result.done || !result.value) {
        this.stop();
        return;
      }

      const step = result.value;

      switch (step.type) {
        case 'explore':
          this.exploredNodes.add(step.nodeId);
          this.mapRenderer.updateExploredNodes(
            Array.from(this.exploredNodes),
            this.network
          );
          break;

        case 'path-update':
          this.currentPath = step.path;
          this.mapRenderer.updateBestPath(step.path, this.network);
          break;

        case 'complete':
          this.currentPath = step.path;
          this.mapRenderer.updateBestPath(step.path, this.network);
          this.stateManager.emit('routing-complete', {
            path: step.path,
            totalCost: step.totalCost,
          });
          this.stop();
          return;
      }
    }

    this.animationFrameId = requestAnimationFrame(this.animate);
  };

  private getDelayForSpeed(speed: number): number {
    // Map speed 1-10 to delay 500ms-10ms (logarithmic)
    // speed 1 = 500ms, speed 5 = 100ms, speed 10 = 10ms
    const minDelay = 10;
    const maxDelay = 500;
    const normalized = (speed - 1) / 9; // 0 to 1
    return maxDelay - normalized * (maxDelay - minDelay);
  }
}
```

**Step 2: Commit AnimationController**

```bash
git add src/map/AnimationController.ts
git commit -m "feat: implement AnimationController for playback

- Consume route generator at configurable speed
- Update MapRenderer with explored nodes and path
- Pause/resume/stop controls
- Speed mapping from 1-10 to frame delays

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 11: FileBrowser Component

**Files:**
- Create: `src/ui/FileBrowser.ts`

**Step 1: Implement file browser**

Create `src/ui/FileBrowser.ts`:

```typescript
import { StateManager } from '../core/StateManager.js';

export class FileBrowser {
  private container: HTMLElement;
  private files: string[] = [];

  constructor(
    container: HTMLElement,
    private stateManager: StateManager
  ) {
    this.container = container;
    this.loadFileList();
  }

  private async loadFileList(): Promise<void> {
    try {
      const response = await fetch('/public/maps/index.json');
      this.files = await response.json();
      this.render();
    } catch (error) {
      console.error('Failed to load file list:', error);
      this.container.innerHTML = '<p style="color: red;">Failed to load maps</p>';
    }
  }

  private render(): void {
    const select = document.createElement('select');
    select.id = 'file-selector';

    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = 'Select a map...';
    select.appendChild(defaultOption);

    this.files.forEach(file => {
      const option = document.createElement('option');
      option.value = file;
      option.textContent = file.replace('.osm.gz', '');
      select.appendChild(option);
    });

    select.addEventListener('change', () => {
      const selected = select.value;
      if (selected) {
        this.stateManager.setState({ selectedFile: selected, isLoading: true });
      }
    });

    this.container.appendChild(select);
  }
}
```

**Step 2: Commit FileBrowser**

```bash
git add src/ui/FileBrowser.ts
git commit -m "feat: implement FileBrowser component

- Load available files from index.json
- Render dropdown selector
- Emit file selection to StateManager

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 12: SettingsPanel Component (Part 1 - Structure)

**Files:**
- Create: `src/ui/SettingsPanel.ts`
- Create: `src/ui/styles.css`

**Step 1: Create CSS styles**

Create `src/ui/styles.css`:

```css
:root {
  --bg-color: #ffffff;
  --text-color: #333333;
  --panel-bg: rgba(255, 255, 255, 0.9);
  --panel-border: #cccccc;
  --button-bg: #3887be;
  --button-hover: #2868a0;
  --button-active: #1e5080;
}

[data-theme="dark"] {
  --bg-color: #1e1e1e;
  --text-color: #e0e0e0;
  --panel-bg: rgba(30, 30, 30, 0.9);
  --panel-border: #555555;
  --button-bg: #4a9fd8;
  --button-hover: #3887be;
  --button-active: #2868a0;
}

#settings-panel {
  position: fixed;
  top: 20px;
  right: 20px;
  background: var(--panel-bg);
  border: 1px solid var(--panel-border);
  border-radius: 8px;
  padding: 20px;
  min-width: 280px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  z-index: 1000;
  color: var(--text-color);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  user-select: none;
  cursor: default;
}

#settings-panel-header {
  cursor: move;
  padding: 10px;
  margin: -20px -20px 15px -20px;
  background: var(--button-bg);
  color: white;
  border-radius: 8px 8px 0 0;
  font-weight: bold;
}

.settings-section {
  margin-bottom: 20px;
}

.settings-section h3 {
  font-size: 14px;
  margin-bottom: 10px;
  color: var(--text-color);
}

.settings-section label {
  display: block;
  font-size: 12px;
  margin-bottom: 5px;
  color: var(--text-color);
}

.settings-section select,
.settings-section input[type="range"] {
  width: 100%;
  margin-bottom: 10px;
}

.mode-buttons {
  display: flex;
  gap: 8px;
}

.mode-button {
  flex: 1;
  padding: 8px;
  border: 1px solid var(--panel-border);
  background: var(--bg-color);
  color: var(--text-color);
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  transition: all 0.2s;
}

.mode-button:hover {
  background: var(--button-hover);
  color: white;
}

.mode-button.active {
  background: var(--button-bg);
  color: white;
  font-weight: bold;
}

.checkbox-container {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}

.checkbox-container input[type="checkbox"] {
  cursor: pointer;
}

.theme-toggle {
  width: 100%;
  padding: 10px;
  border: none;
  background: var(--button-bg);
  color: white;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
  transition: background 0.2s;
}

.theme-toggle:hover {
  background: var(--button-hover);
}

.status-display {
  padding: 10px;
  background: var(--bg-color);
  border: 1px solid var(--panel-border);
  border-radius: 4px;
  font-size: 12px;
  text-align: center;
}

.status-display.loading {
  color: #3887be;
}

.status-display.error {
  color: #d32f2f;
}

.status-display.success {
  color: #388e3c;
}
```

**Step 2: Update index.html to include styles**

Modify `index.html` to add link to styles:

```html
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>OSM Routing Animation</title>
  <link href="https://api.mapbox.com/mapbox-gl-js/v3.1.0/mapbox-gl.css" rel="stylesheet">
  <link href="/src/ui/styles.css" rel="stylesheet">
  <!-- existing styles -->
</head>
```

**Step 3: Commit styles**

```bash
git add src/ui/styles.css index.html
git commit -m "feat: add CSS styles for settings panel

- Theme variables for light/dark modes
- Draggable panel header styling
- Button and control styles
- Status display variants

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 13: SettingsPanel Component (Part 2 - Implementation)

**Files:**
- Create: `src/ui/SettingsPanel.ts`

**Step 1: Implement draggable settings panel**

Create `src/ui/SettingsPanel.ts`:

```typescript
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
```

**Step 2: Commit SettingsPanel**

```bash
git add src/ui/SettingsPanel.ts
git commit -m "feat: implement SettingsPanel with dragging

- Render all UI controls
- Mode buttons, speed slider, toggles
- Pointer events for dragging
- Position persistence with localStorage
- State synchronization

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 14: Main Application Integration

**Files:**
- Create: `src/main.ts`

**Step 1: Implement main application orchestration**

Create `src/main.ts`:

```typescript
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
```

**Step 2: Commit main application**

```bash
git add src/main.ts
git commit -m "feat: implement main application orchestration

- Initialize all components
- Coordinate file loading and rendering
- Handle map clicks for origin/destination
- Trigger route calculation
- Mode switching with re-snapping

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 15: Environment Setup Documentation

**Files:**
- Create: `.env.example`
- Modify: `README.md`

**Step 1: Create environment example**

Create `.env.example`:

```
# Get your token from https://account.mapbox.com/access-tokens/
VITE_MAPBOX_TOKEN=pk.YOUR_MAPBOX_TOKEN_HERE
```

**Step 2: Update README**

Modify `README.md`:

```markdown
# OSM Routing Animation

An interactive web application that visualizes A* pathfinding on OpenStreetMap data.

## Features

- Load and parse gzipped OSM XML files
- Three routing modes: Car, Bicycle, Pedestrian
- Animated A* route calculation visualization
- Interactive map with Mapbox GL JS
- Draggable settings panel with light/dark themes
- Configurable animation speed (1-10)

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure Mapbox token:**
   - Copy `.env.example` to `.env`
   - Get your free Mapbox token from https://account.mapbox.com/access-tokens/
   - Replace `YOUR_MAPBOX_TOKEN_HERE` in `.env` with your token

3. **Run development server:**
   ```bash
   npm run dev
   ```

4. **Open browser:**
   Navigate to `http://localhost:3000`

## Usage

1. Select a map from the dropdown (leiden.osm.gz or amsterdam.osm.gz)
2. Choose routing mode (Car/Bicycle/Pedestrian)
3. Click on the map to set origin point (green marker)
4. Click again to set destination point (red marker)
5. Watch the A* algorithm explore routes (blue lines)
6. Final route shown in red
7. Adjust animation speed with slider
8. Toggle OSM tile background
9. Switch between light/dark themes
10. Drag the settings panel to reposition

## Project Structure

```
src/
├── core/           # StateManager and types
├── data/           # OSM parsing and graph
├── routing/        # A* algorithm and map matching
├── map/            # Mapbox rendering and animation
└── ui/             # User interface components
```

## Building

```bash
npm run build
```

## Configuration

- JetBrains Junie
- Skill superpowers
- Sonnet 4.6
```

**Step 3: Commit documentation**

```bash
git add .env.example README.md
git commit -m "docs: add setup and usage documentation

- Environment variable setup
- Mapbox token instructions
- Usage guide
- Project structure

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 16: Testing and Verification

**Files:**
- None (manual testing)

**Step 1: Run development server**

Run: `npm run dev`
Expected: Server starts on http://localhost:3000

**Step 2: Test map loading**

1. Open http://localhost:3000 in browser
2. Select "leiden" from dropdown
3. Expected: Map loads, road network visible in gray

**Step 3: Test routing with car mode**

1. Select "Car" routing mode
2. Click on a main road for origin (green marker)
3. Click on another location for destination (red marker)
4. Expected: Blue lines animate showing A* exploration, red line grows showing best path

**Step 4: Test mode switching**

1. After route completes, switch to "Bicycle" mode
2. Expected: Route recalculates, different path may appear (ignores one-ways)

**Step 5: Test animation speed**

1. Move speed slider while animation running
2. Expected: Animation speed changes dynamically

**Step 6: Test UI features**

1. Toggle "Show OSM Tiles" checkbox - tiles appear/disappear
2. Click "Toggle Theme" - UI switches between light/dark
3. Drag panel header - panel moves and stays in position
4. Reload page - panel position persists

**Step 7: Test error handling**

1. Click map before loading file - see error message
2. Click far from roads - see "Click closer to a road"

**Step 8: Final verification**

- All features working as specified in requirements
- No console errors
- Smooth animation
- Responsive UI

---

## Task 17: Build and Production Verification

**Files:**
- None (verification)

**Step 1: Build production bundle**

Run: `npm run build`
Expected: Build succeeds, `dist/` folder created

**Step 2: Preview production build**

Run: `npm run preview`
Expected: Production server starts

**Step 3: Test production build**

1. Open preview URL
2. Verify all functionality works in production mode
3. Check browser console for errors
4. Verify assets load correctly

**Step 4: Final commit**

```bash
git add .
git commit -m "chore: final verification and production build

- All features tested and working
- Production build verified
- Ready for deployment

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Summary

This implementation plan creates a complete OSM routing animation application with:

- ✅ Modular TypeScript architecture with clear separation of concerns
- ✅ OSM file parsing with pako decompression
- ✅ Road network graph with bidirectional edges
- ✅ A* routing algorithm as generator for animation
- ✅ Map matching with point-to-segment snapping
- ✅ Mapbox GL JS visualization with multiple layers
- ✅ Animation controller with configurable speed
- ✅ Draggable settings panel with theme support
- ✅ Three routing modes with mode-specific constraints
- ✅ Error handling and user feedback

The plan follows TDD principles where applicable and includes frequent commits with descriptive messages. Each task is bite-sized (2-5 minutes) and includes exact file paths, complete code, and verification steps.

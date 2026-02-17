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

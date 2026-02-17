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

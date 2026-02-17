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

      // Skip if already visited (can happen with duplicate priority queue entries)
      if (closedSet.has(current)) continue;

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

      for (const { nodeId, cost} of neighbors) {
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
      // interpolation 0.0 = at n1, interpolation 1.0 = at n2
      const [n1, n2] = origin.nodeIds;
      const fullCost = this.getEdgeCostBetweenNodes(n1, n2, mode);
      const costToN1 = origin.interpolation * fullCost; // Distance back to n1
      const costToN2 = (1 - origin.interpolation) * fullCost; // Distance forward to n2
      neighbors.push({ nodeId: n1, cost: costToN1 });
      neighbors.push({ nodeId: n2, cost: costToN2 });
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
          // Calculate which fraction of the edge to use based on direction
          const [n1, n2] = destination.nodeIds;
          let fraction: number;
          if (nodeId === n1 && edge.targetNodeId === n2) {
            // Going from n1 toward n2, use interpolation fraction
            fraction = destination.interpolation;
          } else if (nodeId === n2 && edge.targetNodeId === n1) {
            // Going from n2 toward n1, use (1 - interpolation) fraction
            fraction = 1 - destination.interpolation;
          } else {
            fraction = 0.5; // Fallback, shouldn't happen
          }
          neighbors.push({ nodeId: destId, cost: edge.cost * fraction });
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
    if (!edge) {
      // Try reverse direction
      const reverseEdges = this.network.getNeighbors(toId, mode);
      const reverseEdge = reverseEdges.find(e => e.targetNodeId === fromId);
      return reverseEdge ? reverseEdge.cost : Infinity;
    }
    return edge.cost;
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

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

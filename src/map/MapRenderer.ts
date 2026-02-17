import maplibregl from 'maplibre-gl';
import { LatLng } from '../core/types.js';
import { RoadNetwork } from '../data/RoadNetwork.js';

export class MapRenderer {
  private map: maplibregl.Map | null = null;
  private originMarker: maplibregl.Marker | null = null;
  private destinationMarker: maplibregl.Marker | null = null;

  public initialize(container: string | HTMLElement): void {
    this.map = new maplibregl.Map({
      container,
      style: {
        version: 8,
        sources: {
          'osm-raster': {
            type: 'raster',
            tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
            tileSize: 256,
            attribution: '© OpenStreetMap contributors'
          }
        },
        layers: [{
          id: 'osm-raster-layer',
          type: 'raster',
          source: 'osm-raster',
          minzoom: 0,
          maxzoom: 22
        }]
      },
      center: [4.4777, 52.1601], // Leiden, Netherlands
      zoom: 13,
    });

    this.map.on('load', () => {
      this.initializeLayers();
    });
  }

  private initializeLayers(): void {
    if (!this.map) return;

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

    const source = this.map.getSource('road-network') as maplibregl.GeoJSONSource;
    if (source) {
      source.setData({
        type: 'FeatureCollection',
        features,
      });
    }

    // Fit map to network bounds
    if (nodes.size > 0) {
      const bounds = new maplibregl.LngLatBounds();
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

    const source = this.map.getSource('explored-nodes') as maplibregl.GeoJSONSource;
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

    const source = this.map.getSource('best-path') as maplibregl.GeoJSONSource;
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
      'osm-raster-layer',
      'visibility',
      visible ? 'visible' : 'none'
    );
  }

  public addMarker(location: LatLng, type: 'origin' | 'destination'): void {
    if (!this.map) return;

    const color = type === 'origin' ? '#00ff00' : '#ff0000';
    const marker = new maplibregl.Marker({ color })
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
    const source = this.map.getSource('explored-nodes') as maplibregl.GeoJSONSource;
    if (source) {
      source.setData({ type: 'FeatureCollection', features: [] });
    }
  }

  public clearBestPath(): void {
    if (!this.map) return;
    const source = this.map.getSource('best-path') as maplibregl.GeoJSONSource;
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

  public getMap(): maplibregl.Map | null {
    return this.map;
  }
}

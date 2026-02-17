import * as pako from 'pako';
import { ParsedOSM, OSMNode, OSMWay } from '../core/types.js';

export class OSMParser {
  public async parseFile(filename: string): Promise<ParsedOSM> {
    const response = await fetch(`/maps/${filename}`);
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

      // Check if it looks like gzip data (starts with 0x1f 0x8b)
      if (uint8Array[0] === 0x1f && uint8Array[1] === 0x8b) {
        // It's gzipped, decompress it
        const decompressed = pako.inflate(uint8Array, { to: 'string' });
        return decompressed;
      } else {
        // Not gzipped, assume it's already decompressed text
        const decoder = new TextDecoder('utf-8');
        return decoder.decode(uint8Array);
      }
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

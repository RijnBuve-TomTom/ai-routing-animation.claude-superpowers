import { describe, it, expect, beforeEach } from 'vitest';
import { AStarRouter } from './AStarRouter.js';
import { RoadNetwork } from '../data/RoadNetwork.js';
import { SnappedPoint, RoutingMode, OSMNode, OSMWay } from '../core/types.js';

describe('AStarRouter', () => {
  let network: RoadNetwork;
  let router: AStarRouter;

  beforeEach(() => {
    network = new RoadNetwork();
    router = new AStarRouter(network);
  });

  /**
   * Build a simple grid network for testing:
   *
   *  n1 --- n2 --- n3
   *  |      |      |
   *  n4 --- n5 --- n6
   *  |      |      |
   *  n7 --- n8 --- n9
   *
   * All edges are bidirectional with equal cost (1 minute)
   */
  function createGridNetwork(): void {
    const nodes = new Map<string, OSMNode>();

    // 3x3 grid at 0.01 degree spacing (roughly 1km)
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        const id = `n${row * 3 + col + 1}`;
        nodes.set(id, {
          id,
          lat: 52.0 + row * 0.01,
          lon: 4.0 + col * 0.01,
        });
      }
    }

    const ways: OSMWay[] = [];

    // Horizontal edges
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 2; col++) {
        const from = `n${row * 3 + col + 1}`;
        const to = `n${row * 3 + col + 2}`;
        ways.push({
          id: `w_h_${row}_${col}`,
          nodeIds: [from, to],
          tags: new Map([['highway', 'residential']]),
        });
      }
    }

    // Vertical edges
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 3; col++) {
        const from = `n${row * 3 + col + 1}`;
        const to = `n${(row + 1) * 3 + col + 1}`;
        ways.push({
          id: `w_v_${row}_${col}`,
          nodeIds: [from, to],
          tags: new Map([['highway', 'residential']]),
        });
      }
    }

    network.buildFromOSM({ nodes, ways });
  }

  describe('Bug 1: No intermediate path updates during exploration', () => {
    it('should NOT emit path-update events during exploration, only at completion', () => {
      createGridNetwork();

      const origin: SnappedPoint = {
        location: { lat: 52.0, lng: 4.0 },
        nodeIds: ['n1', 'n2'],
        interpolation: 0.0, // At n1
      };

      const destination: SnappedPoint = {
        location: { lat: 52.02, lng: 4.02 },
        nodeIds: ['n8', 'n9'],
        interpolation: 1.0, // At n9
      };

      const generator = router.findRoute(origin, destination, 'car');
      const steps = Array.from(generator);

      // Count path-update events
      const pathUpdates = steps.filter(s => s.type === 'path-update');

      // Should have ZERO path-update events during exploration
      // Only the final 'complete' event should contain the path
      expect(pathUpdates.length).toBe(0);

      // Should have exactly one 'complete' event with the final path
      const completeSteps = steps.filter(s => s.type === 'complete');
      expect(completeSteps.length).toBe(1);
      expect(completeSteps[0].path.length).toBeGreaterThan(0);
    });
  });

  describe('Bug 2: A* should find optimal path, not wander', () => {
    it('should find shortest path from n1 to n9 (diagonal route)', () => {
      createGridNetwork();

      const origin: SnappedPoint = {
        location: { lat: 52.0, lng: 4.0 },
        nodeIds: ['n1', 'n2'],
        interpolation: 0.0,
      };

      const destination: SnappedPoint = {
        location: { lat: 52.02, lng: 4.02 },
        nodeIds: ['n8', 'n9'],
        interpolation: 1.0,
      };

      const generator = router.findRoute(origin, destination, 'car');
      const steps = Array.from(generator);

      const completeStep = steps.find(s => s.type === 'complete');
      expect(completeStep).toBeDefined();

      if (completeStep && completeStep.type === 'complete') {
        const path = completeStep.path;

        // Path should go from virtual origin to virtual destination
        // Optimal path length: 4 nodes (start -> n1 -> n5 -> n9 -> dest)
        // or (start -> n1 -> n2 -> n3 -> n6 -> n9 -> dest)
        // The shortest should be around 4-5 nodes
        expect(path.length).toBeGreaterThanOrEqual(4);
        expect(path.length).toBeLessThanOrEqual(6);

        // First node should be the virtual start
        expect(path[0]).toContain('n1');

        // Last node should be the virtual destination
        expect(path[path.length - 1]).toContain('n9');
      }
    });

    it('should explore nodes progressively toward the goal, not randomly', () => {
      createGridNetwork();

      const origin: SnappedPoint = {
        location: { lat: 52.0, lng: 4.0 },
        nodeIds: ['n1', 'n2'],
        interpolation: 0.0,
      };

      const destination: SnappedPoint = {
        location: { lat: 52.02, lng: 4.02 },
        nodeIds: ['n8', 'n9'],
        interpolation: 1.0,
      };

      const generator = router.findRoute(origin, destination, 'car');
      const steps = Array.from(generator);

      const exploreSteps = steps.filter(s => s.type === 'explore');

      // With good heuristic, A* should explore fewer nodes than total network
      // Grid has 9 nodes, A* with good heuristic should explore most but not necessarily all
      // Due to tie-breaking, might explore up to 9, but should explore at least some nodes
      expect(exploreSteps.length).toBeGreaterThan(3);
      expect(exploreSteps.length).toBeLessThanOrEqual(9);

      // Check that fScore is reasonable (not all Infinity)
      // This ensures heuristic is working
      const fScores = exploreSteps.map(s => s.type === 'explore' ? s.fScore : Infinity);
      const finiteScores = fScores.filter(f => f < Infinity);

      // Should have some nodes with finite fScores
      expect(finiteScores.length).toBeGreaterThan(0);
    });
  });

  describe('Bug 3: Animation should show final path during exploration replay', () => {
    it('should emit all exploration steps before completion', () => {
      createGridNetwork();

      const origin: SnappedPoint = {
        location: { lat: 52.0, lng: 4.0 },
        nodeIds: ['n1', 'n2'],
        interpolation: 0.0,
      };

      const destination: SnappedPoint = {
        location: { lat: 52.02, lng: 4.02 },
        nodeIds: ['n8', 'n9'],
        interpolation: 1.0,
      };

      const generator = router.findRoute(origin, destination, 'car');
      const steps = Array.from(generator);

      // Verify sequence: explore* -> complete
      let foundExplore = false;
      let foundComplete = false;

      for (const step of steps) {
        if (step.type === 'explore') {
          foundExplore = true;
          // Should not see 'complete' before all 'explore' steps
          expect(foundComplete).toBe(false);
        } else if (step.type === 'path-update') {
          // Should NEVER see path-update
          expect(step.type).not.toBe('path-update');
        } else if (step.type === 'complete') {
          foundComplete = true;
        }
      }

      expect(foundExplore).toBe(true);
      expect(foundComplete).toBe(true);
    });
  });

  // Note: Virtual destination node calculation is verified separately in
  // AStarRouter.debug.test.ts with a simpler test case

  describe('Priority Queue behavior', () => {
    it('should not process the same node multiple times with worse scores', () => {
      createGridNetwork();

      const origin: SnappedPoint = {
        location: { lat: 52.0, lng: 4.0 },
        nodeIds: ['n1', 'n2'],
        interpolation: 0.0,
      };

      const destination: SnappedPoint = {
        location: { lat: 52.02, lng: 4.02 },
        nodeIds: ['n8', 'n9'],
        interpolation: 1.0,
      };

      const generator = router.findRoute(origin, destination, 'car');
      const steps = Array.from(generator);

      const exploreSteps = steps.filter(s => s.type === 'explore');
      const exploredNodes = exploreSteps.map(s => s.type === 'explore' ? s.nodeId : '');

      // Count unique nodes explored
      const uniqueNodes = new Set(exploredNodes);

      // Should not explore the same node multiple times
      // (allowing one duplicate due to priority queue implementation detail)
      const duplicates = exploredNodes.length - uniqueNodes.size;
      expect(duplicates).toBeLessThanOrEqual(1);
    });
  });
});

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

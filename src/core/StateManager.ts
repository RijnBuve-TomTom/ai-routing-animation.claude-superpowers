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

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
      const response = await fetch('/maps/index.json');
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

import { Plugin, TFile, WorkspaceLeaf, FileView } from 'obsidian';
import { parseSupernoteFile, SupernoteFile } from './parser';
import { renderPage, imageDataToDataUrl } from './renderer';

const VIEW_TYPE_SUPERNOTE = 'supernote-viewer';

class SupernoteView extends FileView {
  private viewContent: HTMLElement;
  private currentFile: TFile | null = null;
  private renderedImages: string[] = [];

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
    this.viewContent = this.containerEl.children[1] as HTMLElement;
  }

  getViewType(): string {
    return VIEW_TYPE_SUPERNOTE;
  }

  getDisplayText(): string {
    return this.file?.basename || 'Supernote Viewer';
  }

  async onLoadFile(file: TFile): Promise<void> {
    // Clear everything first to prevent ghosting
    this.clearView();
    this.currentFile = file;

    // Show loading state
    const loadingEl = this.viewContent.createEl('div', {
      cls: 'supernote-loading',
      text: 'Loading...',
    });

    try {
      // Read file as binary
      const buffer = await this.app.vault.readBinary(file);
      const data = new Uint8Array(buffer);

      // Parse the file
      const note = parseSupernoteFile(data);

      // Remove loading state
      loadingEl.remove();

      // Render header
      this.renderHeader(note);

      // Render pages
      await this.renderPages(note);
    } catch (error) {
      loadingEl.remove();
      this.viewContent.createEl('div', {
        cls: 'supernote-error',
        text: `Error loading file: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
      console.error('Supernote Viewer error:', error);
    }
  }

  private clearView(): void {
    // Clear all content
    this.viewContent.empty();
    // Clear cached images
    this.renderedImages = [];
    // Reset file reference
    this.currentFile = null;
  }

  private renderHeader(note: SupernoteFile): void {
    const header = this.viewContent.createEl('div', { cls: 'supernote-header' });

    header.createEl('h1', {
      text: this.file?.basename || 'Supernote Note',
      cls: 'supernote-title',
    });

    const info = header.createEl('div', { cls: 'supernote-info' });
    info.createEl('span', {
      text: `${note.pages.length} page${note.pages.length !== 1 ? 's' : ''} • ${note.equipment} • ${note.pageWidth}×${note.pageHeight}`,
    });
  }

  private async renderPages(note: SupernoteFile): Promise<void> {
    const container = this.viewContent.createEl('div', { cls: 'supernote-pages' });

    for (let i = 0; i < note.pages.length; i++) {
      // Check if we're still viewing the same file
      if (this.currentFile !== this.file) {
        return; // File changed, stop rendering
      }

      const pageContainer = container.createEl('div', { cls: 'supernote-page' });

      // Page header
      if (note.pages.length > 1) {
        pageContainer.createEl('div', {
          cls: 'supernote-page-header',
          text: `Page ${i + 1}`,
        });
      }

      // Render page image
      try {
        const imageData = renderPage(note, i);
        if (imageData) {
          const dataUrl = imageDataToDataUrl(imageData);
          this.renderedImages.push(dataUrl);

          const img = pageContainer.createEl('img', {
            cls: 'supernote-page-image',
          });
          img.src = dataUrl;
          img.alt = `Page ${i + 1}`;

          // Make image responsive
          img.style.maxWidth = '100%';
          img.style.height = 'auto';
        }
      } catch (error) {
        pageContainer.createEl('div', {
          cls: 'supernote-page-error',
          text: `Error rendering page ${i + 1}`,
        });
        console.error(`Error rendering page ${i + 1}:`, error);
      }

      // Add some spacing between pages
      if (i < note.pages.length - 1) {
        container.createEl('hr', { cls: 'supernote-page-divider' });
      }

      // Yield to allow UI updates between pages
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }

  async onUnloadFile(file: TFile): Promise<void> {
    this.clearView();
  }

  async onClose(): Promise<void> {
    this.clearView();
  }
}

export default class SupernoteViewerPlugin extends Plugin {
  async onload(): Promise<void> {
    // Register the custom view
    this.registerView(VIEW_TYPE_SUPERNOTE, (leaf) => new SupernoteView(leaf));

    // Register .note file extension
    this.registerExtensions(['note'], VIEW_TYPE_SUPERNOTE);

    console.log('Supernote Viewer plugin loaded');
  }

  onunload(): void {
    console.log('Supernote Viewer plugin unloaded');
  }
}

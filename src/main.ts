import { Plugin, TFile, WorkspaceLeaf, FileView, Menu } from 'obsidian';
import { parseSupernoteFile, SupernoteFile } from './parser';
import { renderPage, imageDataToDataUrl } from './renderer';

const VIEW_TYPE_SUPERNOTE = 'supernote-viewer';

type ViewMode = 'single' | 'two-page-odd' | 'two-page-even';
type FitMode = 'width' | 'height';

class SupernoteView extends FileView {
  private viewContent: HTMLElement;
  private currentFile: TFile | null = null;
  private renderedImages: string[] = [];

  // View settings
  private viewMode: ViewMode = 'single';
  private fitMode: FitMode = 'width';
  private zoomLevel: number = 100;
  private currentPage: number = 1;
  private totalPages: number = 0;
  private pagesContainer: HTMLElement | null = null;
  private pageElements: HTMLElement[] = [];

  // Toolbar elements
  private pageDisplay: HTMLElement | null = null;

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
    this.clearView();
    this.currentFile = file;

    const loadingEl = this.viewContent.createEl('div', {
      cls: 'supernote-loading',
      text: 'Loading...',
    });

    try {
      const buffer = await this.app.vault.readBinary(file);
      const data = new Uint8Array(buffer);
      const note = parseSupernoteFile(data);

      this.totalPages = note.pages.length;
      this.currentPage = 1;

      loadingEl.remove();

      // Render toolbar in the native style
      this.renderToolbar();

      // Render pages
      await this.renderPages(note);

      // Setup scroll observer for page tracking
      this.setupScrollObserver();

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
    this.viewContent.empty();
    this.renderedImages = [];
    this.currentFile = null;
    this.pagesContainer = null;
    this.pageElements = [];
    this.pageDisplay = null;
    this.zoomLevel = 100;
    this.currentPage = 1;
  }

  private renderToolbar(): void {
    const toolbar = this.viewContent.createEl('div', { cls: 'supernote-toolbar' });

    // Left section: Page navigation
    const navSection = toolbar.createEl('div', { cls: 'supernote-toolbar-section' });

    // Previous page button
    const prevBtn = navSection.createEl('button', {
      cls: 'supernote-toolbar-btn clickable-icon',
      attr: { 'aria-label': 'Previous page' },
    });
    prevBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"></polyline></svg>';
    prevBtn.addEventListener('click', () => this.goToPrevPage());

    // Next page button
    const nextBtn = navSection.createEl('button', {
      cls: 'supernote-toolbar-btn clickable-icon',
      attr: { 'aria-label': 'Next page' },
    });
    nextBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>';
    nextBtn.addEventListener('click', () => this.goToNextPage());

    // Page display
    this.pageDisplay = navSection.createEl('span', {
      cls: 'supernote-page-display',
      text: `${this.currentPage} of ${this.totalPages}`,
    });

    // Middle section: Zoom controls
    const zoomSection = toolbar.createEl('div', { cls: 'supernote-toolbar-section' });

    // Zoom out button
    const zoomOutBtn = zoomSection.createEl('button', {
      cls: 'supernote-toolbar-btn clickable-icon',
      attr: { 'aria-label': 'Zoom out' },
    });
    zoomOutBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line><line x1="8" y1="11" x2="14" y2="11"></line></svg>';
    zoomOutBtn.addEventListener('click', () => this.zoomOut());

    // Zoom in button
    const zoomInBtn = zoomSection.createEl('button', {
      cls: 'supernote-toolbar-btn clickable-icon',
      attr: { 'aria-label': 'Zoom in' },
    });
    zoomInBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line><line x1="11" y1="8" x2="11" y2="14"></line><line x1="8" y1="11" x2="14" y2="11"></line></svg>';
    zoomInBtn.addEventListener('click', () => this.zoomIn());

    // Right section: View options dropdown
    const optionsSection = toolbar.createEl('div', { cls: 'supernote-toolbar-section' });

    const optionsBtn = optionsSection.createEl('button', {
      cls: 'supernote-toolbar-btn clickable-icon',
      attr: { 'aria-label': 'View options' },
    });
    optionsBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>';
    optionsBtn.addEventListener('click', (e) => this.showOptionsMenu(e));
  }

  private showOptionsMenu(e: MouseEvent): void {
    const menu = new Menu();

    // Fit options
    menu.addItem((item) => {
      item.setTitle('Fit width');
      item.setChecked(this.fitMode === 'width');
      item.onClick(() => {
        this.fitMode = 'width';
        this.applyViewSettings();
      });
    });

    menu.addItem((item) => {
      item.setTitle('Fit height');
      item.setChecked(this.fitMode === 'height');
      item.onClick(() => {
        this.fitMode = 'height';
        this.applyViewSettings();
      });
    });

    menu.addSeparator();

    // View mode options
    menu.addItem((item) => {
      item.setTitle('Single page');
      item.setChecked(this.viewMode === 'single');
      item.onClick(() => {
        this.viewMode = 'single';
        this.applyViewSettings();
      });
    });

    menu.addItem((item) => {
      item.setTitle('Two-page (odd)');
      item.setChecked(this.viewMode === 'two-page-odd');
      item.onClick(() => {
        this.viewMode = 'two-page-odd';
        this.applyViewSettings();
      });
    });

    menu.addItem((item) => {
      item.setTitle('Two-page (even)');
      item.setChecked(this.viewMode === 'two-page-even');
      item.onClick(() => {
        this.viewMode = 'two-page-even';
        this.applyViewSettings();
      });
    });

    menu.showAtMouseEvent(e);
  }

  private goToPrevPage(): void {
    if (this.currentPage > 1) {
      this.currentPage--;
      this.scrollToPage(this.currentPage);
      this.updatePageDisplay();
    }
  }

  private goToNextPage(): void {
    if (this.currentPage < this.totalPages) {
      this.currentPage++;
      this.scrollToPage(this.currentPage);
      this.updatePageDisplay();
    }
  }

  private scrollToPage(pageNum: number): void {
    const pageEl = this.pageElements[pageNum - 1];
    if (pageEl) {
      pageEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  private updatePageDisplay(): void {
    if (this.pageDisplay) {
      this.pageDisplay.setText(`${this.currentPage} of ${this.totalPages}`);
    }
  }

  private zoomIn(): void {
    if (this.zoomLevel < 200) {
      this.zoomLevel += 25;
      this.applyZoom();
    }
  }

  private zoomOut(): void {
    if (this.zoomLevel > 50) {
      this.zoomLevel -= 25;
      this.applyZoom();
    }
  }

  private applyZoom(): void {
    if (this.pagesContainer) {
      this.pagesContainer.style.setProperty('--zoom-level', `${this.zoomLevel}%`);
    }
  }

  private applyViewSettings(): void {
    if (!this.pagesContainer) return;

    // Update view mode class
    this.pagesContainer.removeClass('view-single', 'view-two-page-odd', 'view-two-page-even');
    this.pagesContainer.addClass(`view-${this.viewMode}`);

    // Update fit mode class
    this.pagesContainer.removeClass('fit-width', 'fit-height');
    this.pagesContainer.addClass(`fit-${this.fitMode}`);
  }

  private setupScrollObserver(): void {
    if (!this.pagesContainer) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio > 0.5) {
            const pageIndex = this.pageElements.indexOf(entry.target as HTMLElement);
            if (pageIndex !== -1) {
              this.currentPage = pageIndex + 1;
              this.updatePageDisplay();
            }
          }
        }
      },
      {
        root: this.viewContent,
        threshold: 0.5,
      }
    );

    this.pageElements.forEach((el) => observer.observe(el));
  }

  private async renderPages(note: SupernoteFile): Promise<void> {
    this.pagesContainer = this.viewContent.createEl('div', {
      cls: `supernote-pages view-${this.viewMode} fit-${this.fitMode}`
    });
    this.pagesContainer.style.setProperty('--zoom-level', `${this.zoomLevel}%`);

    for (let i = 0; i < note.pages.length; i++) {
      if (this.currentFile !== this.file) {
        return;
      }

      const pageContainer = this.pagesContainer.createEl('div', { cls: 'supernote-page' });
      this.pageElements.push(pageContainer);

      // Page number badge
      pageContainer.createEl('div', {
        cls: 'supernote-page-number',
        text: `${i + 1}`,
      });

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
        }
      } catch (error) {
        pageContainer.createEl('div', {
          cls: 'supernote-page-error',
          text: `Error rendering page ${i + 1}`,
        });
        console.error(`Error rendering page ${i + 1}:`, error);
      }

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
    this.registerView(VIEW_TYPE_SUPERNOTE, (leaf) => new SupernoteView(leaf));
    this.registerExtensions(['note'], VIEW_TYPE_SUPERNOTE);
    console.log('Supernote Viewer plugin loaded');
  }

  onunload(): void {
    console.log('Supernote Viewer plugin unloaded');
  }
}

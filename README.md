# Supernote for Obsidian

View your Supernote handwritten notes directly in Obsidian. No conversion needed, no external apps required.

![Obsidian](https://img.shields.io/badge/Obsidian-v1.0.0+-purple)
![License](https://img.shields.io/badge/license-MIT-blue)

## Screenshots

![Two-page view showing handwritten notes](images/img-1.jpg)

![Thumbnail sidebar for easy page navigation](images/thumbnail-sidebar.jpg)

![Dark mode with theme adaptation](images/adapt-to-theme.jpg)

## Features

- **Native .note rendering** - Opens Supernote files directly, no conversion needed
- **Thumbnail sidebar** - Resizable panel for quick page navigation
- **View modes** - Single page or two-page spread
- **Fit options** - Fit to width or height
- **Zoom controls** - Zoom in/out with level persistence
- **Page memory** - Remembers your position in each file
- **Dark mode** - Automatic theme adaptation with toggle option
- **Auto-refresh** - Updates when files sync from your device
- **Caching** - Fast loading for previously viewed notes

## Installation

### From Community Plugins

1. Open Obsidian Settings → Community Plugins
2. Disable Restricted Mode, click Browse
3. Search for "Supernote", install and enable

### Manual Installation

1. Download `main.js`, `manifest.json`, `styles.css` from [Releases](https://github.com/HelloKashif/obsidian-supernote/releases)
2. Create `.obsidian/plugins/obsidian-supernote/` in your vault
3. Copy the files there and enable in Settings

## Usage

1. Sync your `.note` files to your Obsidian vault (via Supernote Cloud, Dropbox, or USB)
2. Click any `.note` file to open it
3. Use the toolbar to navigate, zoom, and adjust view options

### Controls

| Control | Action |
|---------|--------|
| Grid icon | Toggle thumbnail sidebar |
| Up/Down arrows | Previous/next page |
| Page number | Jump to specific page |
| +/- buttons | Zoom in/out |
| Dropdown | View options (fit mode, layout, theme) |

## FAQ

**Q: Can I edit notes in Obsidian?**
A: Currently view-only. The Supernote format is proprietary.

**Q: Can I convert .note files?**
A: Use [supernote-tool](https://github.com/jya-dev/supernote-tool) for conversions.

**Q: Will my text be searchable?**
A: Not yet. Pages render as images.

## License

MIT - see [LICENSE](LICENSE)

## Credits

File format parsing based on [supernote-tool](https://github.com/jya-dev/supernote-tool).

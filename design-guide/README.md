# Design Guide Generator

Generate pixel-perfect design guides from any website URL with automated extraction of design tokens, CSS styles, and screenshots.

## Features

- 📸 **Screenshot Capture** - Viewport and full-page screenshots
- 🎨 **Color Extraction** - Comprehensive color palette analysis
- 📝 **Typography Analysis** - Font families, sizes, weights, and line heights
- 📐 **Layout & Spacing** - Margin, padding, gap, and border radius extraction
- 💅 **CSS Extraction** - All stylesheets and inline styles
- 📊 **Computed Styles** - Detailed element-by-element style analysis
- 📋 **Design Documentation** - Comprehensive markdown design guide

## Installation

```bash
# Install dependencies
uv sync

# Install Playwright browsers
playwright install chromium
```

## Usage

### Basic Usage

```bash
uv run main.py --url https://example.com
```

### Custom Output Directory

```bash
uv run main.py --url https://stripe.com --output ./stripe-design
```

### Custom Viewport Size

```bash
uv run main.py --url https://github.com --viewport-width 1920 --viewport-height 1080
```

## Options

- `--url, -u` - Website URL to analyze (required)
- `--output, -o` - Output directory (default: `./output`)
- `--viewport-width` - Viewport width in pixels (default: 1600)
- `--viewport-height` - Viewport height in pixels (default: 1200)

## Output

The tool generates the following files in the output directory:

```
output/
├── design-guide.md           # Comprehensive design documentation
├── viewport_screenshot.png   # Viewport screenshot
├── fullpage_screenshot.png   # Full page screenshot
├── extracted.html            # Original HTML structure
├── extracted.css             # All CSS styles
└── computed_styles.json      # Computed element styles
```

## Design Guide Contents

The generated `design-guide.md` includes:

1. **Color Palette** - Text, background, and border colors
2. **Typography** - Fonts, sizes, weights, line heights
3. **Layout & Spacing** - Margins, paddings, gaps, border radius
4. **Design Principles** - Extracted patterns and recommendations
5. **Implementation Notes** - Tips for pixel-perfect recreation

## Example Workflow

### Analyzing a Website

```bash
# Extract design from Stripe
uv run main.py --url https://stripe.com --output ./stripe-design

# Review the design guide
cat ./stripe-design/design-guide.md

# Examine extracted CSS
cat ./stripe-design/extracted.css
```

### Pixel-Perfect Recreation

1. **Extract design information**
   ```bash
   uv run main.py --url https://example.com
   ```

2. **Review the design guide** - Study design tokens and patterns

3. **Build HTML** - Create `/tmp/test.html` using the design tokens

4. **Compare** - Take screenshots and compare with originals

5. **Iterate** - Refine until pixel-perfect

6. **Document learnings** - Update design guide with findings

## Dependencies

- **click** - CLI framework
- **playwright** - Browser automation for screenshots
- **beautifulsoup4** - HTML parsing
- **cssutils** - CSS parsing and analysis
- **pillow** - Image processing

## Requirements

- Python 3.12 or higher
- uv package manager
- Chromium browser (installed via Playwright)

## Claude Code Integration

This tool is designed as a Claude Code skill. When used in Claude Code:

1. Claude will navigate to the skill directory
2. Install dependencies automatically
3. Run the extraction
4. Analyze the results
5. Optionally use Playwright MCP for advanced captures
6. Generate pixel-perfect HTML recreations
7. Deliver final assets to `./design-guide/output/`

## Advanced Features

### Playwright MCP Integration

When running in Claude Code with Playwright MCP:

- Interactive page exploration before capture
- Multiple viewport sizes (desktop, tablet, mobile)
- Dynamic content interaction
- State capture (hover, active, focus states)

### Pixel-Perfect Recreation

The tool supports an iterative workflow:

1. Extract → 2. Build → 3. Compare → 4. Refine → 5. Document

Each iteration improves accuracy and captures nuances.

## Tips

- **Desktop sites**: Use 1600x1200 or 1920x1080 viewport
- **Mobile sites**: Use 375x812 viewport
- **SPAs**: Wait for full page load before capture
- **Multiple pages**: Analyze homepage, product pages, etc.
- **Iterate**: Refine the design guide after recreation

## License

MIT

## Author

Generated using Claude Code skill framework

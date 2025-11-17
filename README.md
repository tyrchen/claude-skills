# Claude Skills Collection

A collection of powerful skills for Claude Code that enhance AI capabilities with specialized tools for image generation and design system analysis.

## Available Skills

### 1. AI Image Generation (`ai-image`)

Generate high-quality AI images using OpenAI's gpt-image-1 model with customizable styles and artistic themes.

**Key Features:**
- Multiple aspect ratios (vertical, horizontal, square)
- Artistic themes (Studio Ghibli, futuristic, Pixar, oil painting, Chinese painting)
- High-resolution output (up to 4096x4096 pixels)
- Base64 encoded image generation

**Use Cases:**
- Create custom artwork from text descriptions
- Generate images with specific artistic styles
- Produce marketing visuals
- Create concept art and illustrations

**Quick Start:**
```bash
cd ai-image
uv run main.py --prompt "a serene mountain landscape" --style horizontal --theme oil-paint
```

**Requirements:**
- OpenAI API key with gpt-image-1 access
- Organization verification on OpenAI platform

[Full Documentation](./ai-image/README.md) | [Skill Details](./ai-image/SKILL.md)

---

### 2. Design Guide Generator (`design-guide`)

Extract comprehensive design language from any website including colors, typography, animations, interactive states, and component patterns. Creates pixel-perfect design guides with responsive screenshots.

**Key Features:**
- Complete color palette extraction (text, background, borders, shadows, gradients)
- Typography system analysis (font families, sizes, weights, line heights)
- Interactive state capture (hover effects, transitions, animations)
- Component pattern recognition (buttons, cards, forms, navigation)
- Responsive design testing (mobile, tablet, desktop)
- UX pattern analysis (accessibility features, interaction patterns)
- Visual effects extraction (shadows, filters, transforms)
- Automated screenshot generation at multiple breakpoints

**Use Cases:**
- Analyze competitor website designs
- Create design system documentation
- Reverse-engineer design patterns
- Build pixel-perfect recreations
- Extract component libraries
- Understand UX interaction patterns

**Quick Start:**
```bash
cd design-guide
uv run main.py --url https://stripe.com --output ./stripe-design
```

**Requirements:**
- Playwright with Chromium browser
- No API keys needed (fully local)

**Output Includes:**
- Comprehensive design guide (Markdown)
- Full-page and viewport screenshots
- Interactive hover state captures
- Responsive design screenshots (3 breakpoints)
- Complete HTML and CSS source files
- Structured design data (JSON)

[Full Documentation](./design-guide/README.md) | [Skill Details](./design-guide/SKILL.md)

---

## Installation

Each skill is self-contained with its own dependencies. Navigate to the skill directory and install:

```bash
# For ai-image
cd ai-image
uv sync

# For design-guide
cd design-guide
uv sync
playwright install chromium
```

## Usage with Claude Code

These skills are designed to be invoked by Claude Code when relevant tasks are detected:

- **Image Generation**: Automatically triggered when users request image creation or mention artistic styles
- **Design Analysis**: Automatically triggered when users ask about website design, design systems, or want to analyze/recreate websites

## Project Structure

```
claude-skills/
├── ai-image/
│   ├── main.py
│   ├── SKILL.md
│   └── README.md
├── design-guide/
│   ├── main.py
│   ├── SKILL.md
│   └── README.md
└── README.md
```

## Contributing

When adding new skills:
1. Create a dedicated directory for the skill
2. Include `SKILL.md` with skill metadata and instructions for Claude
3. Include `README.md` with user-facing documentation
4. Update this main README with the new skill details

## License

MIT

# AI Image Generation Skill

A Claude Code skill for generating high-quality AI images using OpenAI's **gpt-image-1** model with customizable aspect ratios and artistic themes.

## Features

- Generate images from text prompts using OpenAI's latest gpt-image-1 model
- Choose from multiple aspect ratios (vertical, horizontal, square)
- Apply different artistic themes (Studio Ghibli, futuristic, Pixar, oil painting, Chinese painting)
- Customizable output location
- High-quality image generation up to 4096x4096 pixels
- Base64 image handling for reliable downloads

## Installation

This is a Claude Code skill. To use it:

1. Ensure you have [uv](https://github.com/astral-sh/uv) installed
2. Clone or place this skill in your project
3. Set your OpenAI API key:

```bash
export OPENAI_API_KEY='your-api-key-here'
```

Note: Using gpt-image-1 requires organization verification on [platform.openai.com](https://platform.openai.com).

## Usage

### Basic Usage

```bash
uv run main.py --prompt "a cat sitting on a tree"
```

### With Style and Theme

```bash
uv run main.py --prompt "a sunset over mountains" --style horizontal --theme oil-paint --output ./sunset.png
```

### More Examples

```bash
# Futuristic portrait
uv run main.py --prompt "a robot in a city" --style vertical --theme futuristic --output ./robot.png

# Studio Ghibli landscape
uv run main.py --prompt "a magical forest with spirits" --style horizontal --theme ghibli --output ./forest.png

# Pixar-style character
uv run main.py --prompt "a friendly dragon" --style square --theme pixar --output ./dragon.png
```

## Options

- `--prompt`: Text description of the image to generate (required)
- `--style`: Image aspect ratio (default: square)
  - `vertical`: 1024x1536 pixels (portrait)
  - `horizontal`: 1536x1024 pixels (landscape)
  - `square`: 1024x1024 pixels
- `--theme`: Artistic theme (optional)
  - `ghibli`: Studio Ghibli animation style
  - `futuristic`: Sci-fi with sleek designs and neon lights
  - `pixar`: Vibrant 3D animation style
  - `oil-paint`: Classical oil painting with textures
  - `chinese-paint`: Traditional Chinese ink painting
- `--output`: Output file path (default: ./generated_image.png)

## Technical Details

- **Model**: OpenAI gpt-image-1 (released April 2025)
- **Supported Sizes**: 1024x1024, 1024x1536, 1536x1024
- **Maximum Resolution**: Up to 4096x4096 pixels
- **Response Format**: Base64 encoded images (b64_json)
- **Dependencies**: openai>=2.7.1

## Pricing

Usage is priced per token:
- Text tokens: $5 per million
- Image input tokens: $10 per million
- Image output tokens: $40 per million

Approximate costs per generated image:
- Low quality square: ~$0.02
- Medium quality square: ~$0.07
- High quality square: ~$0.19

## Troubleshooting

### API Key Not Set

If you see "Error: OPENAI_API_KEY environment variable not set":

```bash
export OPENAI_API_KEY='your-api-key-here'
```

### Organization Not Verified

gpt-image-1 requires organization verification. Visit [platform.openai.com](https://platform.openai.com) and complete the verification process in your account settings.

### Invalid Size Error

Ensure you're using one of the supported aspect ratios: `vertical`, `horizontal`, or `square`.

## License

This skill is provided as-is for use with Claude Code.

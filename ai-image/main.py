#!/usr/bin/env python3
"""
AI Image Generation Skill
Generate images using OpenAI's gpt-image-1 model with customizable styles and themes.
"""

import os
import sys
import base64
from pathlib import Path
import click
from openai import OpenAI


# Image style configurations (aspect ratio)
# gpt-image-1 supports: 1024x1024, 1024x1536, 1536x1024, or "auto"
STYLES = {
    "vertical": "1024x1536",
    "horizontal": "1536x1024",
    "square": "1024x1024"
}

# Theme descriptions for prompt engineering
THEMES = {
    "ghibli": "in the style of Studio Ghibli animation, whimsical and dreamlike with soft colors and hand-drawn aesthetic",
    "futuristic": "in a futuristic sci-fi style with sleek designs, neon lights, and advanced technology",
    "pixar": "in Pixar animation style with vibrant colors, expressive characters, and polished 3D rendering",
    "oil-paint": "as an oil painting with rich textures, visible brushstrokes, and classical artistic composition",
    "chinese-paint": "in traditional Chinese ink painting style with delicate brushwork, minimalist composition, and ethereal atmosphere"
}


def enhance_prompt(prompt: str, theme: str = None) -> str:
    """Enhance the user prompt with theme description if specified."""
    if theme and theme in THEMES:
        return f"{prompt}, {THEMES[theme]}"
    return prompt


def generate_image(prompt: str, style: str, theme: str, output: str):
    """Generate an image using OpenAI's gpt-image-1 model."""

    # Check for API key
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        click.echo(click.style("Error: OPENAI_API_KEY environment variable not set", fg="red"), err=True)
        click.echo("Please set your OpenAI API key: export OPENAI_API_KEY='your-key-here'", err=True)
        sys.exit(1)

    # Initialize OpenAI client
    client = OpenAI(api_key=api_key)

    # Enhance prompt with theme
    enhanced_prompt = enhance_prompt(prompt, theme)
    size = STYLES[style]

    click.echo(click.style("Generating image...", fg="cyan"))
    click.echo(f"Prompt: {enhanced_prompt}")
    click.echo(f"Size: {size}")

    try:
        # Generate image using gpt-image-1
        # Note: gpt-image-1 returns b64_json format, not URLs
        response = client.images.generate(
            model="gpt-image-1",
            prompt=enhanced_prompt,
            size=size,
            n=1,
        )

        # Get the base64 encoded image
        # gpt-image-1 returns images as base64 encoded data
        if hasattr(response.data[0], 'b64_json') and response.data[0].b64_json:
            image_data = base64.b64decode(response.data[0].b64_json)
        elif hasattr(response.data[0], 'url') and response.data[0].url:
            # Fallback to URL if b64_json is not available
            import httpx
            image_data = httpx.get(response.data[0].url).content
        else:
            raise Exception("No image data received from API")

        # Ensure output directory exists
        output_path = Path(output)
        output_path.parent.mkdir(parents=True, exist_ok=True)

        # Save the image
        with open(output_path, "wb") as f:
            f.write(image_data)

        click.echo()
        click.echo(click.style("✓ Image generated successfully!", fg="green", bold=True))
        click.echo(f"Saved to: {click.style(str(output_path.absolute()), fg='blue')}")

        # Print the revised prompt if the model modified it
        if hasattr(response.data[0], 'revised_prompt') and response.data[0].revised_prompt:
            click.echo()
            click.echo(click.style("Revised prompt:", fg="yellow"))
            click.echo(response.data[0].revised_prompt)

    except Exception as e:
        click.echo(click.style(f"Error generating image: {str(e)}", fg="red"), err=True)
        sys.exit(1)


@click.command()
@click.option(
    "--prompt", "-p",
    required=True,
    help="Text description of the image to generate"
)
@click.option(
    "--style", "-s",
    type=click.Choice(list(STYLES.keys()), case_sensitive=False),
    default="square",
    show_default=True,
    help="Image aspect ratio"
)
@click.option(
    "--theme", "-t",
    type=click.Choice(list(THEMES.keys()), case_sensitive=False),
    help="Artistic theme to apply"
)
@click.option(
    "--output", "-o",
    default="./generated_image.png",
    type=click.Path(),
    show_default=True,
    help="Output file path"
)
def main(prompt, style, theme, output):
    """
    Generate AI images using OpenAI's gpt-image-1 model.

    \b
    Examples:
      python main.py -p "a cat sitting on a tree"
      python main.py -p "a sunset over mountains" -s horizontal -t oil-paint
      python main.py -p "a robot in a city" -s vertical -t futuristic -o robot.png

    \b
    Available styles: vertical, horizontal, square
    Available themes: ghibli, futuristic, pixar, oil-paint, chinese-paint
    """
    generate_image(prompt=prompt, style=style, theme=theme, output=output)


if __name__ == "__main__":
    main()

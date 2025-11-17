#!/usr/bin/env python3
"""
Design Guide Generator Skill - Enhanced Edition
Extract comprehensive design language including colors, typography, animations,
interactions, shadows, and UI/UX patterns from websites.
"""

import os
import sys
import json
import re
from pathlib import Path
from typing import Dict, List, Any, Optional
import click
from playwright.sync_api import sync_playwright, Page
from bs4 import BeautifulSoup
import cssutils
import logging

# Suppress cssutils warnings
cssutils.log.setLevel(logging.CRITICAL)


class DesignExtractor:
    """Extract comprehensive design language from a website."""

    def __init__(self, url: str, viewport_width: int = 1600, viewport_height: int = 1200):
        self.url = url
        self.viewport_width = viewport_width
        self.viewport_height = viewport_height
        self.html_content = ""
        self.css_content = ""
        self.computed_styles = {}

    def extract_all(self, output_dir: Path) -> Dict[str, Any]:
        """Extract all design information from the URL."""
        click.echo(click.style(f"🎨 Extracting comprehensive design from: {self.url}", fg="cyan", bold=True))

        with sync_playwright() as p:
            browser = p.chromium.launch()
            context = browser.new_context(
                viewport={'width': self.viewport_width, 'height': self.viewport_height}
            )
            page = context.new_page()

            # Navigate to URL
            click.echo("📄 Loading page...")
            page.goto(self.url, wait_until="networkidle")
            page.wait_for_timeout(2000)  # Extra time for animations

            # Take base screenshots
            click.echo("📸 Taking screenshots...")
            viewport_screenshot = output_dir / "viewport_screenshot.png"
            fullpage_screenshot = output_dir / "fullpage_screenshot.png"
            page.screenshot(path=str(viewport_screenshot))
            page.screenshot(path=str(fullpage_screenshot), full_page=True)

            # Extract HTML
            click.echo("🔍 Extracting HTML structure...")
            self.html_content = page.content()

            # Extract all CSS
            click.echo("💅 Extracting CSS styles...")
            self.css_content = self._extract_css(page)

            # Extract computed styles
            click.echo("🎯 Computing element styles...")
            self.computed_styles = self._extract_computed_styles(page)

            # Extract interactive states
            click.echo("⚡ Capturing interactive states...")
            interactive_states = self._capture_interactive_states(page, output_dir)

            # Extract color palette
            click.echo("🎨 Analyzing color palette...")
            colors = self._extract_colors(page)

            # Extract typography
            click.echo("📝 Analyzing typography...")
            typography = self._extract_typography(page)

            # Extract spacing and layout
            click.echo("📐 Analyzing layout and spacing...")
            layout = self._extract_layout(page)

            # Extract animations and transitions
            click.echo("✨ Detecting animations and transitions...")
            animations = self._extract_animations(page)

            # Extract shadows and effects
            click.echo("🌟 Extracting shadows and visual effects...")
            effects = self._extract_effects(page)

            # Extract component patterns
            click.echo("🧩 Identifying component patterns...")
            components = self._identify_components(page)

            # Extract UX patterns
            click.echo("🎭 Analyzing UX patterns...")
            ux_patterns = self._analyze_ux_patterns(page)

            # Extract responsive breakpoints
            click.echo("📱 Testing responsive behavior...")
            responsive = self._test_responsive(page, output_dir)

            browser.close()

        # Compile all data
        data = {
            'url': self.url,
            'viewport': {'width': self.viewport_width, 'height': self.viewport_height},
            'colors': colors,
            'typography': typography,
            'layout': layout,
            'animations': animations,
            'effects': effects,
            'interactive_states': interactive_states,
            'components': components,
            'ux_patterns': ux_patterns,
            'responsive': responsive,
            'screenshots': {
                'viewport': str(viewport_screenshot),
                'fullpage': str(fullpage_screenshot)
            }
        }

        # Save all extracted data
        click.echo("💾 Saving extracted data...")
        (output_dir / "extracted.html").write_text(self.html_content, encoding='utf-8')
        (output_dir / "extracted.css").write_text(self.css_content, encoding='utf-8')
        (output_dir / "computed_styles.json").write_text(
            json.dumps(self.computed_styles, indent=2),
            encoding='utf-8'
        )
        (output_dir / "design_data.json").write_text(
            json.dumps(data, indent=2),
            encoding='utf-8'
        )

        return data

    def _extract_css(self, page: Page) -> str:
        """Extract all CSS from the page."""
        css_links = page.query_selector_all('link[rel="stylesheet"]')
        inline_styles = page.query_selector_all('style')

        css_content = []

        # Extract inline styles
        for style in inline_styles:
            content = page.evaluate('(element) => element.textContent', style)
            if content:
                css_content.append(f"/* Inline Style */\n{content}")

        # Extract linked stylesheets
        for link in css_links:
            href = page.evaluate('(element) => element.href', link)
            try:
                response = page.request.get(href)
                if response.ok:
                    css_content.append(f"/* From: {href} */\n{response.text()}")
            except Exception as e:
                click.echo(f"⚠️  Could not fetch {href}: {e}", err=True)

        return '\n\n'.join(css_content)

    def _extract_computed_styles(self, page: Page) -> Dict[str, Any]:
        """Extract computed styles for key elements."""
        script = """
        () => {
            const elements = document.querySelectorAll('*');
            const styles = {};
            const seenSelectors = new Set();

            elements.forEach((el, idx) => {
                const computed = window.getComputedStyle(el);
                const tagName = el.tagName.toLowerCase();
                const id = el.id ? '#' + el.id : '';
                const classes = el.className ? '.' + Array.from(el.classList).join('.') : '';

                let selector = tagName + id + classes;
                if (seenSelectors.has(selector)) {
                    selector += '_' + idx;
                }
                seenSelectors.add(selector);

                styles[selector] = {
                    // Typography
                    fontFamily: computed.fontFamily,
                    fontSize: computed.fontSize,
                    fontWeight: computed.fontWeight,
                    lineHeight: computed.lineHeight,
                    letterSpacing: computed.letterSpacing,
                    textAlign: computed.textAlign,
                    textTransform: computed.textTransform,

                    // Colors
                    color: computed.color,
                    backgroundColor: computed.backgroundColor,

                    // Box Model
                    margin: computed.margin,
                    padding: computed.padding,
                    border: computed.border,
                    borderRadius: computed.borderRadius,

                    // Layout
                    display: computed.display,
                    position: computed.position,
                    width: computed.width,
                    height: computed.height,
                    maxWidth: computed.maxWidth,
                    minWidth: computed.minWidth,

                    // Flexbox/Grid
                    flexDirection: computed.flexDirection,
                    justifyContent: computed.justifyContent,
                    alignItems: computed.alignItems,
                    gap: computed.gap,
                    gridTemplateColumns: computed.gridTemplateColumns,

                    // Visual Effects
                    boxShadow: computed.boxShadow,
                    textShadow: computed.textShadow,
                    opacity: computed.opacity,
                    filter: computed.filter,
                    transform: computed.transform,

                    // Transitions & Animations
                    transition: computed.transition,
                    animation: computed.animation,

                    // Other
                    cursor: computed.cursor,
                    overflow: computed.overflow,
                    zIndex: computed.zIndex
                };
            });

            return styles;
        }
        """
        return page.evaluate(script)

    def _capture_interactive_states(self, page: Page, output_dir: Path) -> Dict[str, Any]:
        """Capture hover, focus, and active states of interactive elements."""
        script = """
        () => {
            const interactive = document.querySelectorAll('a, button, input, select, textarea, [onclick], [tabindex]');
            const states = [];

            interactive.forEach((el, idx) => {
                const computed = window.getComputedStyle(el);
                const rect = el.getBoundingClientRect();

                if (rect.width > 0 && rect.height > 0) {
                    const selector = el.tagName.toLowerCase() +
                                   (el.id ? '#' + el.id : '') +
                                   (el.className ? '.' + Array.from(el.classList).slice(0, 3).join('.') : '');

                    states.push({
                        selector: selector,
                        index: idx,
                        position: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
                        default: {
                            backgroundColor: computed.backgroundColor,
                            color: computed.color,
                            borderColor: computed.borderColor,
                            boxShadow: computed.boxShadow,
                            transform: computed.transform,
                            opacity: computed.opacity,
                            cursor: computed.cursor,
                            transition: computed.transition
                        }
                    });
                }
            });

            return states;
        }
        """

        interactive_elements = page.evaluate(script)

        # Capture hover states for first 10 visible interactive elements
        hover_states = []
        for i, elem in enumerate(interactive_elements[:10]):
            try:
                # Find element by position
                x = elem['position']['left'] + elem['position']['width'] / 2
                y = elem['position']['top'] + elem['position']['height'] / 2

                # Hover over element
                page.mouse.move(x, y)
                page.wait_for_timeout(300)

                # Capture hover state
                hover_script = f"""
                (x, y) => {{
                    const el = document.elementFromPoint(x, y);
                    if (el) {{
                        const computed = window.getComputedStyle(el);
                        return {{
                            backgroundColor: computed.backgroundColor,
                            color: computed.color,
                            borderColor: computed.borderColor,
                            boxShadow: computed.boxShadow,
                            transform: computed.transform,
                            opacity: computed.opacity
                        }};
                    }}
                    return null;
                }}
                """
                hover_state = page.evaluate(hover_script, x, y)

                if hover_state:
                    hover_states.append({
                        'selector': elem['selector'],
                        'hover': hover_state,
                        'default': elem['default']
                    })

            except Exception as e:
                continue

        # Take screenshot with hover state
        if hover_states:
            page.screenshot(path=str(output_dir / "interactive_hover.png"))

        return {
            'all_interactive': interactive_elements,
            'hover_samples': hover_states
        }

    def _extract_colors(self, page: Page) -> Dict[str, List[str]]:
        """Extract comprehensive color palette."""
        script = """
        () => {
            const colors = {
                text: new Set(),
                background: new Set(),
                border: new Set(),
                shadow: new Set(),
                gradients: []
            };

            document.querySelectorAll('*').forEach(el => {
                const computed = window.getComputedStyle(el);

                // Text colors
                if (computed.color && computed.color !== 'rgba(0, 0, 0, 0)') {
                    colors.text.add(computed.color);
                }

                // Background colors and gradients
                if (computed.backgroundColor && computed.backgroundColor !== 'rgba(0, 0, 0, 0)') {
                    colors.background.add(computed.backgroundColor);
                }
                if (computed.backgroundImage && computed.backgroundImage !== 'none') {
                    if (computed.backgroundImage.includes('gradient')) {
                        colors.gradients.push(computed.backgroundImage);
                    }
                }

                // Border colors
                if (computed.borderColor && computed.borderColor !== 'rgba(0, 0, 0, 0)') {
                    colors.border.add(computed.borderColor);
                }

                // Shadow colors
                if (computed.boxShadow && computed.boxShadow !== 'none') {
                    // Extract colors from box-shadow
                    const shadowColors = computed.boxShadow.match(/rgba?\\([^)]+\\)/g);
                    if (shadowColors) {
                        shadowColors.forEach(c => colors.shadow.add(c));
                    }
                }
            });

            return {
                textColors: Array.from(colors.text),
                backgroundColors: Array.from(colors.background),
                borderColors: Array.from(colors.border),
                shadowColors: Array.from(colors.shadow),
                gradients: [...new Set(colors.gradients)]
            };
        }
        """
        return page.evaluate(script)

    def _extract_typography(self, page: Page) -> Dict[str, Any]:
        """Extract comprehensive typography system."""
        script = """
        () => {
            const typography = {
                fonts: new Set(),
                sizes: new Set(),
                weights: new Set(),
                lineHeights: new Set(),
                letterSpacings: new Set(),
                textTransforms: new Set(),
                headings: {},
                body: {}
            };

            // Extract from all text elements
            document.querySelectorAll('h1, h2, h3, h4, h5, h6, p, a, span, button, li, label').forEach(el => {
                const computed = window.getComputedStyle(el);
                typography.fonts.add(computed.fontFamily);
                typography.sizes.add(computed.fontSize);
                typography.weights.add(computed.fontWeight);
                typography.lineHeights.add(computed.lineHeight);
                typography.letterSpacings.add(computed.letterSpacing);
                if (computed.textTransform !== 'none') {
                    typography.textTransforms.add(computed.textTransform);
                }
            });

            // Extract heading hierarchy
            ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].forEach(tag => {
                const el = document.querySelector(tag);
                if (el) {
                    const computed = window.getComputedStyle(el);
                    typography.headings[tag] = {
                        fontSize: computed.fontSize,
                        fontWeight: computed.fontWeight,
                        lineHeight: computed.lineHeight,
                        letterSpacing: computed.letterSpacing,
                        marginTop: computed.marginTop,
                        marginBottom: computed.marginBottom,
                        color: computed.color
                    };
                }
            });

            // Extract body text
            const body = document.querySelector('p') || document.querySelector('body');
            if (body) {
                const computed = window.getComputedStyle(body);
                typography.body = {
                    fontSize: computed.fontSize,
                    fontWeight: computed.fontWeight,
                    lineHeight: computed.lineHeight,
                    letterSpacing: computed.letterSpacing,
                    color: computed.color
                };
            }

            return {
                fonts: Array.from(typography.fonts),
                sizes: Array.from(typography.sizes).sort((a, b) => parseFloat(a) - parseFloat(b)),
                weights: Array.from(typography.weights).sort(),
                lineHeights: Array.from(typography.lineHeights).sort(),
                letterSpacings: Array.from(typography.letterSpacings),
                textTransforms: Array.from(typography.textTransforms),
                headings: typography.headings,
                body: typography.body
            };
        }
        """
        return page.evaluate(script)

    def _extract_layout(self, page: Page) -> Dict[str, Any]:
        """Extract layout and spacing system."""
        script = """
        () => {
            const layout = {
                margins: new Set(),
                paddings: new Set(),
                gaps: new Set(),
                borderRadii: new Set(),
                maxWidths: new Set(),
                containers: []
            };

            document.querySelectorAll('*').forEach(el => {
                const computed = window.getComputedStyle(el);

                ['marginTop', 'marginRight', 'marginBottom', 'marginLeft'].forEach(prop => {
                    if (computed[prop] !== '0px') layout.margins.add(computed[prop]);
                });

                ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft'].forEach(prop => {
                    if (computed[prop] !== '0px') layout.paddings.add(computed[prop]);
                });

                if (computed.gap !== 'normal' && computed.gap !== '0px') layout.gaps.add(computed.gap);
                if (computed.borderRadius !== '0px') layout.borderRadii.add(computed.borderRadius);
                if (computed.maxWidth !== 'none') layout.maxWidths.add(computed.maxWidth);

                // Identify container patterns
                if (computed.maxWidth !== 'none' && computed.marginLeft === 'auto' && computed.marginRight === 'auto') {
                    const rect = el.getBoundingClientRect();
                    if (rect.width > 500) {
                        layout.containers.push({
                            maxWidth: computed.maxWidth,
                            padding: computed.padding,
                            width: rect.width + 'px'
                        });
                    }
                }
            });

            return {
                margins: Array.from(layout.margins).sort((a, b) => parseFloat(a) - parseFloat(b)),
                paddings: Array.from(layout.paddings).sort((a, b) => parseFloat(a) - parseFloat(b)),
                gaps: Array.from(layout.gaps).sort((a, b) => parseFloat(a) - parseFloat(b)),
                borderRadii: Array.from(layout.borderRadii).sort((a, b) => parseFloat(a) - parseFloat(b)),
                maxWidths: Array.from(layout.maxWidths),
                containers: layout.containers.slice(0, 5)
            };
        }
        """
        return page.evaluate(script)

    def _extract_animations(self, page: Page) -> Dict[str, Any]:
        """Extract animations and transitions."""
        script = """
        () => {
            const animations = {
                transitions: new Set(),
                keyframes: [],
                animatedElements: []
            };

            document.querySelectorAll('*').forEach((el, idx) => {
                const computed = window.getComputedStyle(el);

                if (computed.transition !== 'all 0s ease 0s' && computed.transition !== 'none') {
                    animations.transitions.add(computed.transition);
                }

                if (computed.animation !== 'none') {
                    const rect = el.getBoundingClientRect();
                    if (rect.width > 0 && rect.height > 0) {
                        animations.animatedElements.push({
                            selector: el.tagName.toLowerCase() + (el.className ? '.' + Array.from(el.classList).join('.') : ''),
                            animation: computed.animation
                        });
                    }
                }
            });

            // Extract keyframes from stylesheets
            for (const sheet of document.styleSheets) {
                try {
                    for (const rule of sheet.cssRules) {
                        if (rule.type === CSSRule.KEYFRAMES_RULE) {
                            animations.keyframes.push({
                                name: rule.name,
                                rules: Array.from(rule.cssRules).map(r => r.cssText)
                            });
                        }
                    }
                } catch (e) {
                    // CORS restrictions
                }
            }

            return {
                transitions: Array.from(animations.transitions),
                keyframes: animations.keyframes,
                animatedElements: animations.animatedElements.slice(0, 10)
            };
        }
        """
        return page.evaluate(script)

    def _extract_effects(self, page: Page) -> Dict[str, Any]:
        """Extract visual effects like shadows, filters, transforms."""
        script = """
        () => {
            const effects = {
                boxShadows: new Set(),
                textShadows: new Set(),
                filters: new Set(),
                transforms: new Set(),
                opacities: new Set()
            };

            document.querySelectorAll('*').forEach(el => {
                const computed = window.getComputedStyle(el);

                if (computed.boxShadow !== 'none') {
                    effects.boxShadows.add(computed.boxShadow);
                }
                if (computed.textShadow !== 'none') {
                    effects.textShadows.add(computed.textShadow);
                }
                if (computed.filter !== 'none') {
                    effects.filters.add(computed.filter);
                }
                if (computed.transform !== 'none') {
                    effects.transforms.add(computed.transform);
                }
                if (computed.opacity !== '1') {
                    effects.opacities.add(computed.opacity);
                }
            });

            return {
                boxShadows: Array.from(effects.boxShadows),
                textShadows: Array.from(effects.textShadows),
                filters: Array.from(effects.filters),
                transforms: Array.from(effects.transforms),
                opacities: Array.from(effects.opacities).sort()
            };
        }
        """
        return page.evaluate(script)

    def _identify_components(self, page: Page) -> Dict[str, Any]:
        """Identify common UI components and patterns."""
        script = """
        () => {
            const components = {
                buttons: [],
                cards: [],
                navbars: [],
                forms: [],
                modals: [],
                badges: [],
                alerts: []
            };

            // Buttons
            document.querySelectorAll('button, [role="button"], a.btn, a.button, input[type="button"], input[type="submit"]').forEach((el, idx) => {
                if (idx < 5) {
                    const computed = window.getComputedStyle(el);
                    components.buttons.push({
                        text: el.textContent.trim().substring(0, 30),
                        styles: {
                            backgroundColor: computed.backgroundColor,
                            color: computed.color,
                            padding: computed.padding,
                            borderRadius: computed.borderRadius,
                            border: computed.border,
                            fontSize: computed.fontSize,
                            fontWeight: computed.fontWeight
                        }
                    });
                }
            });

            // Cards (common patterns)
            document.querySelectorAll('[class*="card"], .article, article, [class*="post"]').forEach((el, idx) => {
                if (idx < 3) {
                    const computed = window.getComputedStyle(el);
                    const rect = el.getBoundingClientRect();
                    if (rect.width > 200 && rect.height > 100) {
                        components.cards.push({
                            styles: {
                                backgroundColor: computed.backgroundColor,
                                borderRadius: computed.borderRadius,
                                boxShadow: computed.boxShadow,
                                padding: computed.padding,
                                border: computed.border
                            }
                        });
                    }
                }
            });

            // Navigation
            document.querySelectorAll('nav, [role="navigation"], header nav').forEach((el, idx) => {
                if (idx < 2) {
                    const computed = window.getComputedStyle(el);
                    components.navbars.push({
                        styles: {
                            backgroundColor: computed.backgroundColor,
                            height: computed.height,
                            position: computed.position,
                            boxShadow: computed.boxShadow,
                            padding: computed.padding
                        }
                    });
                }
            });

            // Forms
            document.querySelectorAll('form, input, select, textarea').forEach((el, idx) => {
                if (idx < 5) {
                    const computed = window.getComputedStyle(el);
                    components.forms.push({
                        type: el.tagName.toLowerCase(),
                        styles: {
                            backgroundColor: computed.backgroundColor,
                            border: computed.border,
                            borderRadius: computed.borderRadius,
                            padding: computed.padding,
                            fontSize: computed.fontSize
                        }
                    });
                }
            });

            return components;
        }
        """
        return page.evaluate(script)

    def _analyze_ux_patterns(self, page: Page) -> Dict[str, Any]:
        """Analyze UX patterns and behaviors."""
        script = """
        () => {
            const patterns = {
                scrollBehavior: window.getComputedStyle(document.documentElement).scrollBehavior,
                focusVisible: [],
                cursorStyles: new Set(),
                interactiveElements: 0,
                accessibilityFeatures: {
                    ariaLabels: document.querySelectorAll('[aria-label]').length,
                    ariaDescriptions: document.querySelectorAll('[aria-describedby]').length,
                    roles: document.querySelectorAll('[role]').length,
                    alts: document.querySelectorAll('img[alt]').length
                }
            };

            // Cursor styles
            document.querySelectorAll('*').forEach(el => {
                const cursor = window.getComputedStyle(el).cursor;
                if (cursor !== 'auto') {
                    patterns.cursorStyles.add(cursor);
                }
            });

            // Interactive elements count
            patterns.interactiveElements = document.querySelectorAll('a, button, input, select, textarea, [onclick], [tabindex]').length;

            // Check for sticky elements
            patterns.stickyElements = [];
            document.querySelectorAll('*').forEach(el => {
                const position = window.getComputedStyle(el).position;
                if (position === 'sticky' || position === 'fixed') {
                    patterns.stickyElements.push({
                        tagName: el.tagName.toLowerCase(),
                        position: position,
                        top: window.getComputedStyle(el).top,
                        zIndex: window.getComputedStyle(el).zIndex
                    });
                }
            });

            return {
                ...patterns,
                cursorStyles: Array.from(patterns.cursorStyles),
                stickyElements: patterns.stickyElements.slice(0, 5)
            };
        }
        """
        return page.evaluate(script)

    def _test_responsive(self, page: Page, output_dir: Path) -> Dict[str, Any]:
        """Test responsive behavior at different breakpoints."""
        breakpoints = [
            {'name': 'mobile', 'width': 375, 'height': 812},
            {'name': 'tablet', 'width': 768, 'height': 1024},
            {'name': 'desktop', 'width': 1920, 'height': 1080}
        ]

        responsive_data = {}

        for bp in breakpoints:
            page.set_viewport_size({'width': bp['width'], 'height': bp['height']})
            page.wait_for_timeout(500)

            # Take screenshot
            screenshot_path = output_dir / f"responsive_{bp['name']}.png"
            page.screenshot(path=str(screenshot_path))

            # Get layout info at this breakpoint
            layout_script = """
            () => {
                const body = document.body;
                const html = document.documentElement;
                return {
                    viewportWidth: window.innerWidth,
                    viewportHeight: window.innerHeight,
                    scrollHeight: Math.max(body.scrollHeight, html.scrollHeight),
                    bodyWidth: body.getBoundingClientRect().width
                };
            }
            """
            responsive_data[bp['name']] = {
                'viewport': bp,
                'layout': page.evaluate(layout_script),
                'screenshot': str(screenshot_path)
            }

        # Reset to original viewport
        page.set_viewport_size({'width': self.viewport_width, 'height': self.viewport_height})

        return responsive_data


def generate_design_guide(data: Dict[str, Any], output_dir: Path) -> str:
    """Generate comprehensive design guide with all extracted patterns."""

    guide = f"""# Comprehensive Design Guide

**Source URL:** {data['url']}
**Generated:** Automated comprehensive extraction
**Viewport:** {data['viewport']['width']}x{data['viewport']['height']}

---

## 📸 Visual Assets

### Screenshots
- **Desktop Viewport:** `{Path(data['screenshots']['viewport']).name}`
- **Full Page:** `{Path(data['screenshots']['fullpage']).name}`
- **Interactive States:** `interactive_hover.png`

### Responsive Screenshots
"""

    for device, info in data.get('responsive', {}).items():
        guide += f"- **{device.title()} ({info['viewport']['width']}x{info['viewport']['height']}):** `responsive_{device}.png`\n"

    # Color System
    guide += "\n---\n\n## 🎨 Color System\n\n"
    guide += "### Primary Colors\n\n"
    guide += "```css\n:root {\n"

    # Text colors
    guide += "  /* Text Colors */\n"
    for i, color in enumerate(data['colors']['textColors'][:5], 1):
        guide += f"  --text-{i}: {color};\n"

    # Background colors
    guide += "\n  /* Background Colors */\n"
    for i, color in enumerate(data['colors']['backgroundColors'][:5], 1):
        guide += f"  --bg-{i}: {color};\n"

    # Border colors
    guide += "\n  /* Border Colors */\n"
    for i, color in enumerate(data['colors']['borderColors'][:5], 1):
        guide += f"  --border-{i}: {color};\n"

    guide += "}\n```\n\n"

    # Gradients
    if data['colors'].get('gradients'):
        guide += "### Gradients\n\n"
        for i, gradient in enumerate(data['colors']['gradients'][:5], 1):
            guide += f"{i}. `{gradient}`\n"
        guide += "\n"

    # Shadow colors
    if data['colors'].get('shadowColors'):
        guide += "### Shadow Colors\n\n"
        for color in data['colors']['shadowColors'][:5]:
            guide += f"- `{color}`\n"
        guide += "\n"

    # Typography
    guide += "---\n\n## 📝 Typography System\n\n"
    guide += "### Font Stack\n\n"
    guide += "```css\n:root {\n"
    for i, font in enumerate(data['typography']['fonts'][:3], 1):
        guide += f"  --font-{i}: {font};\n"
    guide += "}\n```\n\n"

    # Type scale
    guide += "### Type Scale\n\n"
    guide += "```css\n:root {\n"
    for i, size in enumerate(data['typography']['sizes'][:10], 1):
        guide += f"  --text-{i}: {size};\n"
    guide += "}\n```\n\n"

    # Heading hierarchy
    if data['typography'].get('headings'):
        guide += "### Heading Hierarchy\n\n"
        guide += "| Element | Font Size | Weight | Line Height | Letter Spacing |\n"
        guide += "|---------|-----------|--------|-------------|----------------|\n"
        for tag, styles in data['typography']['headings'].items():
            guide += f"| {tag} | {styles.get('fontSize', 'N/A')} | {styles.get('fontWeight', 'N/A')} | {styles.get('lineHeight', 'N/A')} | {styles.get('letterSpacing', 'N/A')} |\n"
        guide += "\n"

    # Font weights
    guide += "### Font Weights\n\n"
    for weight in data['typography']['weights']:
        guide += f"- `{weight}`\n"
    guide += "\n"

    # Spacing & Layout
    guide += "---\n\n## 📐 Spacing & Layout\n\n"
    guide += "### Spacing Scale\n\n"
    guide += "```css\n:root {\n"

    # Margins
    guide += "  /* Margins */\n"
    for i, margin in enumerate(data['layout']['margins'][:10], 1):
        guide += f"  --margin-{i}: {margin};\n"

    # Paddings
    guide += "\n  /* Paddings */\n"
    for i, padding in enumerate(data['layout']['paddings'][:10], 1):
        guide += f"  --padding-{i}: {padding};\n"

    # Gaps
    if data['layout'].get('gaps'):
        guide += "\n  /* Gaps (Flexbox/Grid) */\n"
        for i, gap in enumerate(data['layout']['gaps'][:5], 1):
            guide += f"  --gap-{i}: {gap};\n"

    guide += "}\n```\n\n"

    # Border radius
    if data['layout'].get('borderRadii'):
        guide += "### Border Radius\n\n"
        guide += "```css\n:root {\n"
        for i, radius in enumerate(data['layout']['borderRadii'][:8], 1):
            guide += f"  --radius-{i}: {radius};\n"
        guide += "}\n```\n\n"

    # Container patterns
    if data['layout'].get('containers'):
        guide += "### Container Patterns\n\n"
        for i, container in enumerate(data['layout']['containers'], 1):
            guide += f"{i}. **Max Width:** `{container['maxWidth']}`, **Padding:** `{container['padding']}`\n"
        guide += "\n"

    # Visual Effects
    guide += "---\n\n## 🌟 Visual Effects\n\n"

    # Box shadows
    if data['effects'].get('boxShadows'):
        guide += "### Box Shadows\n\n"
        guide += "```css\n"
        for i, shadow in enumerate(data['effects']['boxShadows'][:5], 1):
            guide += f"/* Shadow {i} */\nbox-shadow: {shadow};\n\n"
        guide += "```\n\n"

    # Filters
    if data['effects'].get('filters'):
        guide += "### Filters\n\n"
        for filter_val in data['effects']['filters'][:5]:
            guide += f"- `{filter_val}`\n"
        guide += "\n"

    # Opacities
    if data['effects'].get('opacities'):
        guide += "### Opacity Values\n\n"
        for opacity in data['effects']['opacities'][:8]:
            guide += f"- `{opacity}`\n"
        guide += "\n"

    # Animations & Transitions
    guide += "---\n\n## ✨ Animations & Transitions\n\n"

    # Transitions
    if data['animations'].get('transitions'):
        guide += "### Transitions\n\n"
        guide += "```css\n"
        for i, transition in enumerate(data['animations']['transitions'][:8], 1):
            guide += f"/* Transition {i} */\ntransition: {transition};\n\n"
        guide += "```\n\n"

    # Keyframe animations
    if data['animations'].get('keyframes'):
        guide += "### Keyframe Animations\n\n"
        for kf in data['animations']['keyframes'][:3]:
            guide += f"#### @keyframes {kf['name']}\n\n"
            guide += "```css\n"
            for rule in kf['rules'][:5]:
                guide += f"{rule}\n"
            guide += "```\n\n"

    # Interactive States
    guide += "---\n\n## ⚡ Interactive States\n\n"

    if data['interactive_states'].get('hover_samples'):
        guide += "### Hover Effects\n\n"
        guide += "Captured hover states for interactive elements:\n\n"
        for i, state in enumerate(data['interactive_states']['hover_samples'][:5], 1):
            guide += f"#### {i}. `{state['selector']}`\n\n"
            guide += "**Default State:**\n"
            guide += f"- Background: `{state['default']['backgroundColor']}`\n"
            guide += f"- Color: `{state['default']['color']}`\n"
            guide += f"- Transform: `{state['default']['transform']}`\n"
            guide += f"- Box Shadow: `{state['default']['boxShadow']}`\n\n"
            guide += "**Hover State:**\n"
            guide += f"- Background: `{state['hover']['backgroundColor']}`\n"
            guide += f"- Color: `{state['hover']['color']}`\n"
            guide += f"- Transform: `{state['hover']['transform']}`\n"
            guide += f"- Box Shadow: `{state['hover']['boxShadow']}`\n\n"

    # Component Patterns
    guide += "---\n\n## 🧩 Component Patterns\n\n"

    # Buttons
    if data['components'].get('buttons'):
        guide += "### Buttons\n\n"
        for i, btn in enumerate(data['components']['buttons'][:3], 1):
            guide += f"#### Button {i}: \"{btn['text']}\"\n\n"
            guide += "```css\n"
            guide += f"background-color: {btn['styles']['backgroundColor']};\n"
            guide += f"color: {btn['styles']['color']};\n"
            guide += f"padding: {btn['styles']['padding']};\n"
            guide += f"border-radius: {btn['styles']['borderRadius']};\n"
            guide += f"border: {btn['styles']['border']};\n"
            guide += f"font-size: {btn['styles']['fontSize']};\n"
            guide += f"font-weight: {btn['styles']['fontWeight']};\n"
            guide += "```\n\n"

    # Cards
    if data['components'].get('cards'):
        guide += "### Cards\n\n"
        for i, card in enumerate(data['components']['cards'][:3], 1):
            guide += f"#### Card Pattern {i}\n\n"
            guide += "```css\n"
            guide += f"background-color: {card['styles']['backgroundColor']};\n"
            guide += f"border-radius: {card['styles']['borderRadius']};\n"
            guide += f"box-shadow: {card['styles']['boxShadow']};\n"
            guide += f"padding: {card['styles']['padding']};\n"
            guide += "```\n\n"

    # UX Patterns
    guide += "---\n\n## 🎭 UX Patterns\n\n"

    guide += f"### Interaction Metrics\n\n"
    guide += f"- **Interactive Elements:** {data['ux_patterns'].get('interactiveElements', 0)}\n"
    guide += f"- **Scroll Behavior:** `{data['ux_patterns'].get('scrollBehavior', 'auto')}`\n"
    guide += f"- **Cursor Styles Used:** {', '.join([f'`{c}`' for c in data['ux_patterns'].get('cursorStyles', [])])}\n\n"

    # Accessibility
    if data['ux_patterns'].get('accessibilityFeatures'):
        guide += "### Accessibility Features\n\n"
        features = data['ux_patterns']['accessibilityFeatures']
        guide += f"- ARIA Labels: {features.get('ariaLabels', 0)}\n"
        guide += f"- ARIA Descriptions: {features.get('ariaDescriptions', 0)}\n"
        guide += f"- Role Attributes: {features.get('roles', 0)}\n"
        guide += f"- Image Alt Texts: {features.get('alts', 0)}\n\n"

    # Sticky elements
    if data['ux_patterns'].get('stickyElements'):
        guide += "### Sticky/Fixed Elements\n\n"
        for elem in data['ux_patterns']['stickyElements']:
            guide += f"- `{elem['tagName']}` - Position: `{elem['position']}`, Top: `{elem['top']}`, Z-Index: `{elem['zIndex']}`\n"
        guide += "\n"

    # Responsive Patterns
    guide += "---\n\n## 📱 Responsive Design\n\n"

    for device, info in data.get('responsive', {}).items():
        guide += f"### {device.title()} ({info['viewport']['width']}x{info['viewport']['height']})\n\n"
        guide += f"- Viewport: {info['layout']['viewportWidth']}x{info['layout']['viewportHeight']}\n"
        guide += f"- Scroll Height: {info['layout']['scrollHeight']}px\n"
        guide += f"- Body Width: {info['layout']['bodyWidth']}px\n"
        guide += f"- Screenshot: `{Path(info['screenshot']).name}`\n\n"

    # Implementation Guide
    guide += "---\n\n## 🚀 Implementation Recommendations\n\n"
    guide += """
### Step 1: Define Design Tokens

Create a comprehensive token system using CSS custom properties:

```css
:root {
  /* Use the color, typography, and spacing values above */
}
```

### Step 2: Implement Component Patterns

Use the extracted component styles for buttons, cards, forms, etc.

### Step 3: Apply Interactive States

Implement hover, focus, and active states as documented above.

### Step 4: Add Animations

Apply the transitions and keyframe animations for smooth interactions.

### Step 5: Ensure Responsive Behavior

Use the responsive patterns to create mobile-first, adaptive layouts.

### Step 6: Test Accessibility

Follow the accessibility patterns identified in the analysis.

---

## 📚 Files Reference

- `design-guide.md` - This comprehensive guide
- `design_data.json` - Complete raw data
- `extracted.html` - Original HTML
- `extracted.css` - All CSS styles
- `computed_styles.json` - Computed styles for every element
- `interactive_hover.png` - Hover state captures
- `responsive_*.png` - Responsive screenshots

---

**Last Updated:** {click.style('Auto-generated', fg='cyan')}
**Extraction Completeness:** {click.style('Comprehensive', fg='green')}
"""

    return guide


@click.command()
@click.option(
    "--url", "-u",
    required=True,
    help="URL of the website to analyze"
)
@click.option(
    "--output", "-o",
    default="./output",
    type=click.Path(),
    show_default=True,
    help="Output directory for design guide and assets"
)
@click.option(
    "--viewport-width",
    default=1600,
    type=int,
    show_default=True,
    help="Viewport width for screenshots"
)
@click.option(
    "--viewport-height",
    default=1200,
    type=int,
    show_default=True,
    help="Viewport height for screenshots"
)
def main(url, output, viewport_width, viewport_height):
    """
    Generate a comprehensive design guide from a website URL.

    Extracts complete design language including:
    - Colors, gradients, shadows
    - Typography hierarchy
    - Layout and spacing system
    - Animations and transitions
    - Interactive states (hover, focus)
    - Component patterns (buttons, cards, forms)
    - UX patterns and accessibility
    - Responsive behavior

    \b
    Example:
      python main.py --url https://stripe.com
      python main.py -u https://github.com -o ./github-design
    """

    output_dir = Path(output)
    output_dir.mkdir(parents=True, exist_ok=True)

    try:
        # Extract comprehensive design information
        extractor = DesignExtractor(url, viewport_width, viewport_height)
        data = extractor.extract_all(output_dir)

        # Generate comprehensive design guide
        click.echo()
        click.echo(click.style("📝 Generating comprehensive design guide...", fg="cyan", bold=True))
        guide_content = generate_design_guide(data, output_dir)

        # Save design guide
        guide_path = output_dir / "design-guide.md"
        guide_path.write_text(guide_content, encoding='utf-8')

        click.echo()
        click.echo(click.style("✅ Comprehensive design guide generated!", fg="green", bold=True))
        click.echo()
        click.echo(f"📁 Output directory: {click.style(str(output_dir.absolute()), fg='blue', bold=True)}")
        click.echo(f"📄 Design guide: {click.style(str(guide_path.name), fg='blue')}")
        click.echo(f"📊 Design data: {click.style('design_data.json', fg='blue')}")
        click.echo(f"📸 Screenshots: {click.style('viewport, fullpage, responsive (mobile/tablet/desktop), hover states', fg='blue')}")
        click.echo(f"📦 Extracted files: {click.style('HTML, CSS, computed styles', fg='blue')}")
        click.echo()
        click.echo(click.style("💡 Tip:", fg="yellow") + " View all assets with: cd " + str(output_dir) + " && python3 -m http.server 8080")

    except Exception as e:
        click.echo()
        click.echo(click.style(f"❌ Error: {str(e)}", fg="red", bold=True), err=True)
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()

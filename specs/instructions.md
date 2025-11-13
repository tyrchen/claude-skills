# Instructions

## script to extract info from a website

Use uv/click/playwright to build a python script that can generate below info from a url:

- the screenshot of the url
- the extracted css style for the page
- the extracted html structure for the page

put the code under ./design-guide.

## build the pixel perfect design guide skill

## pixel perfect design guidelines

Explore claude code skill from official documentation and examples. Think ultra hard and build a claude skill under ./design-guide/SKILL.md that can generate a pixel perfect design based on a url of a website. Requirement:

The skill shall:

- call the script using `uv run main.py extract <url> -o /tmp/<name from url>`
- based on the html content,css style and screenshot, generate a pixel perfect html page to mimic the original website under ./<name>-generated.html.
- load the html page via `uv run main.py serve <path to <name>-generated.html>` and take screenshot of the page using `uv run main.py screenshot <url to <name>-generated.html> -o /tmp/<name from url>/generated.png`.
- compare the screenshot with the original website. If the screenshot is not pixel perfect, iterate the process until it is pixel perfect.
- Then analyze the generated html page, think ultra hard and generate a "./<xxx>-design-guide.md" file that describes the design in detail. It should include all the design thinking behind it and the color scheme, fonts, animations, etc. that others could understand and replicate the design.

## extract function update

Read the code under ./design-guide carefully, think ultra hard and update the extract functionality:

- take screenshot of the viewport size 1200x900 of the page. Then scroll down and take another screenshot of viewport, repeat this process until the page is scrolled to the bottom.
- extract the non repeated key html elements (e.g. navigation, hero, main content, footer, etc.), along with computed css style for each element. Store them separately in *.html (combined html and css).

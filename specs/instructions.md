# Instructions

## script to extract info from a website

Use uv/click/playwright to build a python script that can generate below info from a url:

- the screenshot of the url
- the extracted css style for the page
- the extracted html structure for the page

put the code under ./design-guide.

## build the pixel perfect design guide skill

Explore claude code skill from official documentation and examples. Think ultra hard and build a claude skill under ./design-guide/SKILL.md that can generate a pixel perfect design based on a url of a website. Requirement:

The skill shall:

- retrieve the url and its css style
- (if possible) call playwright mcp to take screenshot of the url (viewport size 1600x1200) and the full page screenshot.
- based on the screenshot and css style, generate a md file design-guide.md to clearly describe the design tokens and the design principles.
- Then try to rebuild the web page (/tmp/test.html) of the url using the design guide. Compare it with the screenshot. Iterate until it is pixel perfect to the original website.
- Review the generated html page, think ultra hard and improve the design-guide.md file.
- deliver the final design-guide.md file and the html page under ./design-guide/output/

## improve the skill

Current SKILL.md is too simple to capture the core design language of the website. Improve the skill to capture the core design language including the color scheme, fonts, animations, hover / shadow effects etc. Use playwright to play with the url and explore its UI/UX patterns that others could understand and replicate the design.

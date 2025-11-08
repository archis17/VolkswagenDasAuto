# PWA Icons Creation Guide

To create the required PWA icons, you can use any image editor or online tool:

## Required Icons:
1. **icon-192.png** - 192x192 pixels
2. **icon-512.png** - 512x512 pixels

## Recommended Tools:
- Online: https://realfavicongenerator.net/
- Online: https://www.pwabuilder.com/imageGenerator
- Or use any image editor (GIMP, Photoshop, etc.)

## Design Suggestions:
- Use the Hazard Eye logo or a road safety themed icon
- Use colors: #3498db (blue) and #2ecc71 (green)
- Ensure icons are square and have transparent or solid background
- Make sure icons are clear and recognizable at small sizes

## Quick Command (if you have ImageMagick):
```bash
# Convert an existing logo to PWA icons
convert logo.png -resize 192x192 public/icon-192.png
convert logo.png -resize 512x512 public/icon-512.png
```

For now, you can use placeholder icons or create simple colored squares as temporary icons.

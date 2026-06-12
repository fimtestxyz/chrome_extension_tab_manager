#!/usr/bin/env python3
"""Generate extension icons using Pillow"""

from PIL import Image, ImageDraw
import os

# Create icons directory if it doesn't exist
icons_dir = "/Volumes/wwk_nvme/Users/wwkoon/.openclaw/workspace/chrome_extension_tab_manager/assets/icons"
os.makedirs(icons_dir, exist_ok=True)

def create_icon(size):
    """Create a tab workspace icon"""
    # Create image with transparent background
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Colors
    primary_color = (66, 133, 244)  # Google Blue #4285F4

    # Calculate grid layout (2x2 squares with gaps)
    padding = size // 8
    gap = size // 16
    square_size = (size - 2 * padding - gap) // 2

    # Draw 4 rounded squares in a grid
    positions = [
        (padding, padding),  # Top-left
        (padding + square_size + gap, padding),  # Top-right
        (padding, padding + square_size + gap),  # Bottom-left
        (padding + square_size + gap, padding + square_size + gap)  # Bottom-right
    ]

    corner_radius = max(2, size // 16)

    for x, y in positions:
        # Draw rounded rectangle
        draw.rounded_rectangle(
            [x, y, x + square_size, y + square_size],
            radius=corner_radius,
            fill=primary_color
        )

    return img

# Generate icons in required sizes
sizes = [16, 32, 48, 128]

for size in sizes:
    icon = create_icon(size)
    icon.save(f"{icons_dir}/icon-{size}.png", "PNG")
    print(f"✓ Created icon-{size}.png")

print("\n✅ All icons generated successfully!")

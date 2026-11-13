#!/usr/bin/env python3
"""Extract PHOSPHOR's matched generated keycaps from the retained RGBA atlas.

Requires Pillow. Run without arguments from either the development repository
or the exported GitHub Pages repository. This only performs deterministic asset
extraction/downsampling; it does not regenerate or repaint the image.
"""
from argparse import ArgumentParser
from hashlib import sha256
from pathlib import Path

from PIL import Image

SOURCE_SHA256 = "8118ef6614546e8d04f9b86a112e5bae57f0d5756cacc3e56a55f90c1b27d170"
SOURCE_SIZE = (1774, 887)
# All five square crops contain the complete cap perimeter with a clear margin.
# Enter preserves its full tall perimeter; generated alpha is never replaced.
CROPS = {
    "esc": (23, 23, 439, 439),
    "up": (460, 23, 876, 439),
    "left": (23, 456, 439, 872),
    "down": (460, 456, 876, 872),
    "right": (897, 456, 1313, 872),
    "enter": (1331, 23, 1749, 871),
}


def main():
    root = Path(__file__).resolve().parents[1]
    parser = ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path, nargs="?", default=root / "assets" / "key-atlas.png")
    parser.add_argument("--output", type=Path, default=root / "dist" if (root / "dist").is_dir() else root)
    args = parser.parse_args()
    if sha256(args.source.read_bytes()).hexdigest() != SOURCE_SHA256:
        parser.error("Atlas checksum differs. Use assets/key-atlas.png from this source version.")
    source = Image.open(args.source)
    if source.size != SOURCE_SIZE or source.mode != "RGBA":
        parser.error("Expected the original 1774 x 887 RGBA generated atlas.")
    args.output.mkdir(parents=True, exist_ok=True)
    for name, box in CROPS.items():
        # Normalize the five 1U faces to one scale. Enter is 2.0625 units high,
        # matching the two-row touch cluster and its small key gap.
        size = (384, 792 if name == "enter" else 384)
        destination = args.output / f"key-{name}.webp"
        cap = source.crop(box).resize(size, Image.Resampling.LANCZOS)
        cap.save(destination, lossless=True, method=6)
        print(f"{destination.name}: {size[0]} x {size[1]}, {destination.stat().st_size} bytes")


if __name__ == "__main__":
    main()

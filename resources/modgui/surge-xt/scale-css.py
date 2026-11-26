#!/usr/bin/env python3
"""Scale every pixel size in the Surge XT panel stylesheet.

usage: scale-css.py <in.css> <out.css> <factor>

The stylesheet is written for factor 1.0. 1px lines (borders) and 0 are kept as they are so the
thin lines stay crisp; everything else (sizes, paddings, fonts, radii) is multiplied.
"""
import re, sys


def main():
    src, dst, factor = sys.argv[1], sys.argv[2], float(sys.argv[3])
    css = open(src, encoding="utf-8").read()

    def scale(m):
        v = float(m.group(1))
        if v in (0.0, 1.0):
            return m.group(0)
        out = round(v * factor)
        return "%dpx" % (out if out else 1)

    css = re.sub(r"(?<![\w.#-])(-?\d+(?:\.\d+)?)px", scale, css)
    open(dst, "w", encoding="utf-8").write(css)


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Fill the patch list (factory, then 3rd party) into the Surge XT MOD panel javascript.

usage: gen-patchlist.py <resources/data dir> <javascript template> <output js>

The ordering MUST match SurgeSynthProcessor::buildModPatchList(): factory patches, then 3rd party patches, each sorted by
their path below their folder, bytewise after ASCII-lowercasing.
"""
import html, json, os, re, sys


def ascii_lower(s):
    return "".join(chr(ord(c) + 32) if "A" <= c <= "Z" else c for c in s)


ENTRY = re.compile(r'<entry i="(\d+)"[^>]*? label="([^"]*)"')


def macro_labels(path):
    """The 8 macro names stored in the patch, or None when none of them was renamed."""
    try:
        with open(path, "rb") as f:
            data = f.read().decode("latin-1")
    except OSError:
        return None
    a = data.find("<customcontroller>")
    b = data.find("</customcontroller>", a)
    if a < 0 or b < 0:
        return None
    labels = ["-"] * 8
    for m in ENTRY.finditer(data[a:b]):
        i = int(m.group(1))
        if i < 8:
            labels[i] = html.unescape(m.group(2))
    if all(l in ("-", "") for l in labels):
        return None
    try:  # the file is utf-8, we read it as latin-1
        labels = [l.encode("latin-1").decode("utf-8") for l in labels]
    except (UnicodeEncodeError, UnicodeDecodeError):
        pass
    return labels


def main():
    data_dir, template, out = sys.argv[1:4]
    patches = []
    for group, prefix in (("patches_factory", ""), ("patches_3rdparty", "3rd party / ")):
        root = os.path.join(data_dir, group)
        rels = []
        for dp, _dn, fns in os.walk(root):
            for fn in fns:
                if fn.lower().endswith(".fxp"):
                    rels.append(os.path.relpath(os.path.join(dp, fn), root).replace(os.sep, "/"))
        rels.sort(key=lambda r: ascii_lower(r).encode("utf-8"))
        for r in rels:
            cat, _, name = r.rpartition("/")
            entry = [prefix + (cat or "Root"), name[:-4]]
            labels = macro_labels(os.path.join(root, r))
            if labels:
                entry.append(labels)
            patches.append(entry)
    with open(template, encoding="utf-8") as f:
        js = f.read()
    js = js.replace("/*__PATCHES__*/[]", json.dumps(patches, ensure_ascii=False, separators=(",", ":")))
    with open(out, "w", encoding="utf-8") as f:
        f.write(js)
    print("wrote %s (%d patches)" % (out, len(patches)))


if __name__ == "__main__":
    main()

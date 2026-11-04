"""Read-only PNG geometry/alpha/hash inspection; never modifies image pixels."""
from pathlib import Path
from PIL import Image
import hashlib, json, sys
root = Path(sys.argv[1])
report = {}
for path in sorted(root.glob('*.png')):
    im = Image.open(path)
    alpha = im.getchannel('A') if im.mode == 'RGBA' else None
    bbox = alpha.point(lambda a: 255 if a > 16 else 0).getbbox() if alpha else (0, 0, *im.size)
    report[path.stem] = dict(size=list(im.size), mode=im.mode, bbox=bbox,
        alphaRange=alpha.getextrema() if alpha else None,
        sha256=hashlib.sha256(path.read_bytes()).hexdigest())
print(json.dumps(report, indent=2))

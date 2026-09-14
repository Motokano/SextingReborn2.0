"""Read-only PNG measurements; writes JSON metadata, never modifies image pixels."""
import json
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parents[1]
folder = root / 'assets/map/isometric/player-atlas-v1'
states = []
for page in range(16):
    path = folder / f'L{page:02}.png'
    im = Image.open(path)
    assert im.mode == 'RGBA', path
    w, h = im.size
    alpha = im.getchannel('A').tobytes()
    seen = bytearray(w*h)
    components = []
    for start, a in enumerate(alpha):
        if a < 200 or seen[start]:
            continue
        seen[start] = 1
        stack = [start]
        points = []
        while stack:
            p = stack.pop()
            points.append(p)
            x, y = p % w, p // w
            for q in ([p-1] if x else []) + ([p+1] if x+1<w else []) + ([p-w] if y else []) + ([p+w] if y+1<h else []):
                if not seen[q] and alpha[q] >= 200:
                    seen[q] = 1
                    stack.append(q)
        if len(points) > 10000:
            xs = [p % w for p in points]
            ys = [p // w for p in points]
            components.append((min(xs),min(ys),max(xs)+1,max(ys)+1,points))
    assert len(components) == 8, (path,len(components))
    components.sort(key=lambda c:c[1])
    ordered = sorted(components[:4],key=lambda c:c[0])+sorted(components[4:],key=lambda c:c[0])
    for upper,(x,y,r,b,points) in enumerate(ordered):
        rows = {}
        for p in points:
            px, py = p % w, p // w
            if py >= b-(b-y)*0.22:
                lo,hi = rows.get(py,(px,px))
                rows[py] = min(lo,px),max(hi,px)
        lo,hi = max(rows.values(),key=lambda span:span[1]-span[0])
        left,top = max(0,x-3),max(0,y-3)
        right,bottom = min(w,r+3),min(h,b+3)
        states.append({'id':f'D{page*8+upper:03}','mask':page*8+upper,'file':path.name,'crop':[left,top,right-left,bottom-top], 'baseWidth':hi-lo+1,'anchor':[round((lo+hi+1)/2-left,2),b-top]})
    print(path.name,[(c[0],c[1],c[2],c[3]) for c in ordered])
data={'version':1,'source':'../pose-atlas-v1','purpose':'Display crop and base alignment only; never skeleton data','displayBaseWidth':46,'states':states}
(folder/'manifest.json').write_text(json.dumps(data,indent=2),encoding='utf-8')

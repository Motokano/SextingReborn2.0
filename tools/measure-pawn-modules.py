"""Measure connected opaque components; output metadata and SVG crop wrappers only."""
import json
from pathlib import Path
from PIL import Image
root=Path(__file__).resolve().parents[1]/'reference/pawn-kit-v1/hero'
im=Image.open(root/'parts.png')
assert im.mode=='RGBA'
w,h=im.size
a=im.getchannel('A').tobytes(); seen=bytearray(w*h); groups=[]
for start,v in enumerate(a):
    if v<200 or seen[start]: continue
    seen[start]=1; stack=[start]; pts=[]
    while stack:
        p=stack.pop();pts.append(p);x,y=p%w,p//w
        for q in ([p-1] if x else [])+([p+1] if x+1<w else [])+([p-w] if y else [])+([p+w] if y+1<h else []):
            if not seen[q] and a[q]>=200: seen[q]=1;stack.append(q)
    if len(pts)>4000:
        xs=[p%w for p in pts];ys=[p//w for p in pts]
        groups.append([min(xs),min(ys),max(xs)+1,max(ys)+1])
assert len(groups)==16,len(groups)
groups.sort(key=lambda c:(c[1]+c[3])/2)
ordered=[]
for row in range(4):ordered+=sorted(groups[row*4:row*4+4],key=lambda c:c[0])
ids=['head','chest','abdomen','base','rUpperArm','rForearm','rPalm','lUpperArm','lForearm','lPalm','rThigh','rShin','rSole','lThigh','lShin','lSole']
names=['头发与脸','胸部与衣领','腹部与衣摆','底座','右上臂','右前臂与袖口','右手','左上臂','左前臂与袖口','左手','右大腿','右小腿','右鞋','左大腿','左小腿','左鞋']
modules=[]
for id,name,(x,y,r,b) in zip(ids,names,ordered):
    x=max(0,x-2);y=max(0,y-2);r=min(w,r+2);b=min(h,b+2)
    group=id if id in ['head','chest','abdomen','base'] else ('l' if id[0]=='l' else 'r')+('hand' if any(s in id for s in ['Arm','Forearm','Palm']) else 'foot')
    m={'id':id,'name':name,'part':group,'image':'parts.png','crop':[x,y,r-x,b-y],'wrapper':'parts/'+id+'.svg'}
    if id in ['chest','abdomen']:m.update(mode='segment',width=18 if id=='chest' else 16,start=[.5,.88],end=[.5,.12])
    elif id=='head':m.update(mode='head',width=23,height=22,pivot=[.5,.5])
    elif id=='base':m.update(mode='base',width=44,height=9,pivot=[.5,.36])
    elif 'Palm' in id:m.update(mode='point',width=5.5,height=6,pivot=[.5,.65])
    elif 'Sole' in id:m.update(mode='point',width=10,height=6,pivot=[.5,.7])
    else:m.update(mode='segment',width=8.5 if any(s in id for s in ['Thigh','Shin']) else 7,start=[.5,.12],end=[.5,.88])
    modules.append(m)
    (root/m['wrapper']).write_text(f'<svg xmlns="http://www.w3.org/2000/svg" width="{r-x}" height="{b-y}" viewBox="{x} {y} {r-x} {b-y}"><image href="../parts.png" width="{w}" height="{h}"/></svg>',encoding='utf-8')
data={'id':'office-hero-modular-v1','status':'first assembly candidate; appearance requires review','rig':'../rig/skeleton.json','poses':'../rig/poses.json','policy':'Appearance dimensions and texture anchors only. Never override pose matrices or solve from images.','modules':modules,'injuries':{'head':{'uv':[.33,.65]},'chest':{'uv':[.65,.6]},'abdomen':{'uv':[.6,.55]}}}
(root/'skin.json').write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8')
print([(m['id'],m['crop']) for m in modules])

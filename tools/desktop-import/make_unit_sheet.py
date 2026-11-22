from PIL import Image, ImageDraw, ImageFont
import os
D=r"C:\Users\Drfen\Doubao\chats\2026-11-22\new-chat\cloudai-work\public\game-assets\kongming\units"
files=sorted([f for f in os.listdir(D) if f.lower().endswith('.png')], key=lambda x:x.lower())
cw,ch=150,100
cols=10; rows=(len(files)+cols-1)//cols
sheet=Image.new('RGBA',(cols*cw,rows*ch),(24,26,30,255))
d=ImageDraw.Draw(sheet)
for i,f in enumerate(files):
    im=Image.open(os.path.join(D,f)).convert('RGBA')
    # first frame 69x69
    fr=im.crop((0,0,min(69,im.width),min(69,im.height)))
    fr=fr.resize((69*2,69*2), Image.NEAREST)
    x=(i%cols)*cw; y=(i//cols)*ch
    sheet.alpha_composite(fr,(x+8,y+6))
    d.text((x+8,y+78),f.replace('.png',''),fill=(255,230,180,255))
sheet.save(r"C:\Users\Drfen\Doubao\chats\2026-11-22\new-chat\cloudai-work\tmp_unit_sheet.png")
print(len(files), sheet.size)

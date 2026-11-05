#!/usr/bin/env python3
"""Generate a tiny synthetic PPTX using only the standard library. No user documents."""
import io
import sys
import zipfile

P = 'http://schemas.openxmlformats.org/presentationml/2006/main'
A = 'http://schemas.openxmlformats.org/drawingml/2006/main'
R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
REL = 'http://schemas.openxmlformats.org/package/2006/relationships'
parts = {}

def rels(entries):
    return f'<Relationships xmlns="{REL}">' + ''.join(
        f'<Relationship Id="{rid}" Type="{R}/{kind}" Target="{target}"/>'
        for rid, kind, target in entries) + '</Relationships>'

def group():
    return '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>'

parts['_rels/.rels'] = rels([('rId1', 'officeDocument', 'ppt/presentation.xml')])
parts['ppt/presentation.xml'] = f'<p:presentation xmlns:p="{P}" xmlns:a="{A}" xmlns:r="{R}"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst><p:sldId id="256" r:id="rId2"/><p:sldId id="257" r:id="rId3"/></p:sldIdLst><p:sldSz cx="12192000" cy="6858000"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>'
parts['ppt/_rels/presentation.xml.rels'] = rels([('rId1', 'slideMaster', 'slideMasters/slideMaster1.xml'), ('rId2', 'slide', 'slides/slide1.xml'), ('rId3', 'slide', 'slides/slide2.xml')])
parts['ppt/slideMasters/slideMaster1.xml'] = f'<p:sldMaster xmlns:p="{P}" xmlns:a="{A}" xmlns:r="{R}"><p:cSld><p:spTree>{group()}</p:spTree></p:cSld><p:clrMap accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" bg1="lt1" bg2="lt2" folHlink="folHlink" hlink="hlink" tx1="dk1" tx2="dk2"/><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst></p:sldMaster>'
parts['ppt/slideMasters/_rels/slideMaster1.xml.rels'] = rels([('rId1', 'slideLayout', '../slideLayouts/slideLayout1.xml'), ('rId2', 'theme', '../theme/theme1.xml')])
parts['ppt/slideLayouts/slideLayout1.xml'] = f'<p:sldLayout xmlns:p="{P}" xmlns:a="{A}" xmlns:r="{R}" type="blank" preserve="1"><p:cSld name="Blank"><p:spTree>{group()}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>'
parts['ppt/slideLayouts/_rels/slideLayout1.xml.rels'] = rels([('rId1', 'slideMaster', '../slideMasters/slideMaster1.xml')])
colors = {'dk1':'101010','lt1':'FFFFFF','dk2':'223344','lt2':'EEEEEE','accent1':'FF0000','accent2':'00FF00','accent3':'0000FF','accent4':'FFFF00','accent5':'00FFFF','accent6':'FF00FF','hlink':'0000FF','folHlink':'800080'}
color_xml = ''.join(f'<a:{key}><a:srgbClr val="{value}"/></a:{key}>' for key, value in colors.items())
parts['ppt/theme/theme1.xml'] = f'<a:theme xmlns:a="{A}" name="Synthetic"><a:themeElements><a:clrScheme name="Synthetic">{color_xml}</a:clrScheme><a:fontScheme name="Synthetic"><a:majorFont><a:latin typeface="Arial"/><a:ea typeface=""/><a:cs typeface=""/><a:font script="Jpan" typeface="Yu Mincho"/></a:majorFont><a:minorFont><a:latin typeface="Arial"/><a:ea typeface=""/><a:cs typeface=""/><a:font script="Jpan" typeface="MS Gothic"/></a:minorFont></a:fontScheme><a:fmtScheme name="Synthetic"><a:fillStyleLst/><a:lnStyleLst/><a:effectStyleLst/><a:bgFillStyleLst/></a:fmtScheme></a:themeElements></a:theme>'
for i, bg in enumerate(['FFFFFF', '237A57'], 1):
    # A white cover and green second slide expose the old forced-dark/guessed-fill patch.
    text = f'<p:sp><p:nvSpPr><p:cNvPr id="2" name="Synthetic text"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="600000" y="600000"/><a:ext cx="10000000" cy="1500000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US" sz="3000"><a:solidFill><a:srgbClr val="{("111111" if i == 1 else "FFFFFF")}"/></a:solidFill><a:latin typeface="Arial"/></a:rPr><a:t>SYNTHETIC SLIDE {i}</a:t></a:r><a:endParaRPr lang="en-US"/></a:p></p:txBody></p:sp>'
    background = '' if i == 1 else f'<p:bg><p:bgPr><a:solidFill><a:srgbClr val="{bg}"/></a:solidFill></p:bgPr></p:bg>'
    parts[f'ppt/slides/slide{i}.xml'] = f'<p:sld xmlns:p="{P}" xmlns:a="{A}" xmlns:r="{R}"><p:cSld>{background}<p:spTree>{group()}{text}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>'
    parts[f'ppt/slides/_rels/slide{i}.xml.rels'] = rels([('rId1', 'slideLayout', '../slideLayouts/slideLayout1.xml')])
content_types = {'ppt/presentation.xml':'presentation.main','ppt/slideMasters/slideMaster1.xml':'slideMaster','ppt/slideLayouts/slideLayout1.xml':'slideLayout','ppt/slides/slide1.xml':'slide','ppt/slides/slide2.xml':'slide'}
parts['[Content_Types].xml'] = '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' + ''.join(f'<Override PartName="/{name}" ContentType="application/vnd.openxmlformats-officedocument.presentationml.{kind}+xml"/>' for name,kind in content_types.items()) + '<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/></Types>'
if '--japanese' in sys.argv:
    for i in (1, 2):
        name = f'ppt/slides/slide{i}.xml'
        face = '游ゴシック Bold' if i == 1 else '游ゴシック'
        parts[name] = parts[name].replace('typeface="Arial"', f'typeface="{face}"')
        parts[name] = parts[name].replace('lang="en-US" sz="3000"', f'lang="ja-JP" sz="3000" b="{1 if i == 1 else 0}"')
        parts[name] = parts[name].replace(f'SYNTHETIC SLIDE {i}', f'日本語の発表資料 ABC DNA 2026年 {i}')

output = io.BytesIO()
with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED) as z:
    for name, content in parts.items():
        z.writestr(name, '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' + content)
sys.stdout.buffer.write(output.getvalue())

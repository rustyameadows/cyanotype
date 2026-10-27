import { processPixels, sheetGeometry, variantGrid, mmToPx, mmToPt } from './engine.js';

export function canvas(width, height) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(width)); c.height = Math.max(1, Math.round(height));
  return c;
}
export function imageDimensions(source, settings) {
  return settings.rotation % 180 ? [source.height, source.width] : [source.width, source.height];
}
export function renderImage(source, settings, curve, mode, maxEdge = 1200) {
  const [sw, sh] = imageDimensions(source, settings), ratio = maxEdge / Math.max(sw, sh);
  const c = canvas(sw * ratio, sh * ratio), ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
  ctx.save(); ctx.translate(c.width/2, c.height/2);
  ctx.scale(settings.mirror ? -1 : 1, settings.flip ? -1 : 1);
  ctx.rotate(settings.rotation * Math.PI / 180);
  ctx.drawImage(source, -source.width*ratio/2, -source.height*ratio/2, source.width*ratio, source.height*ratio);
  ctx.restore();
  if (mode !== 'original') {
    const pixels = ctx.getImageData(0, 0, c.width, c.height);
    pixels.data.set(processPixels(pixels.data, c.width, settings, curve, mode));
    ctx.putImageData(pixels, 0, 0);
  }
  return c;
}
export function drawContained(ctx, image, x, y, w, h) {
  const scale = Math.min(w/image.width, h/image.height);
  const dw = image.width*scale, dh = image.height*scale;
  ctx.drawImage(image, x+(w-dw)/2, y+(h-dh)/2, dw, dh);
}
export const adjustmentLabel = (key, value) => `${key[0].toUpperCase()+key.slice(1)} ${value > 0 ? '+' : ''}${Number(value.toFixed(key==='exposure'?2:1))}${key==='exposure'?' EV':''}`;

export function renderSheet(source, settings, curve, config, paper, mode, dpi, title) {
  const [w, h] = paper, c = canvas(mmToPx(w,dpi),mmToPx(h,dpi)), ctx = c.getContext('2d');
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0,0,c.width,c.height);
  const g = sheetGeometry(w,h,config), variants = variantGrid(settings,config), scale = dpi/25.4;
  ctx.save(); ctx.scale(scale,scale); ctx.fillStyle='#222';
  if(config.labels){ctx.font='2.7px sans-serif';ctx.fillText(title.toUpperCase().slice(0,50),g.margin,g.margin+3);ctx.font='2px sans-serif';ctx.fillStyle='#555';ctx.fillText(`CYANOTYPE / ${mode==='proof'?'SIMULATED PROOF':mode.toUpperCase()} / ${variants.length} STUDIES`,g.margin,g.margin+7);}
  const cells = [];
  for(const v of variants){
    const x=g.originX+(v.index-1)%g.columns*(g.cellWidth+g.gap), y=g.margin+g.header+Math.floor((v.index-1)/g.columns)*(g.cellHeight+g.gap);
    const ih=g.cellHeight-g.label;
    const img=renderImage(source,v.settings,curve,mode,Math.ceil(Math.max(g.cellWidth,ih)*scale));
    drawContained(ctx,img,x,y,g.cellWidth,ih);
    if(config.guides){ctx.strokeStyle='#777';ctx.lineWidth=.15;const l=2;for(const [cx,cy,dx,dy] of [[x,y,-1,-1],[x+g.cellWidth,y,1,-1],[x,y+ih,-1,1],[x+g.cellWidth,y+ih,1,1]]){ctx.beginPath();ctx.moveTo(cx+dx*.5,cy);ctx.lineTo(cx+dx*l,cy);ctx.moveTo(cx,cy+dy*.5);ctx.lineTo(cx,cy+dy*l);ctx.stroke();}}
    if(config.labels){ctx.fillStyle='#333';ctx.font='1.8px sans-serif';const label=`${String(v.index).padStart(2,'0')}  /  ${v.values.map(([k,val])=>adjustmentLabel(k,val)).join(' · ')}`;ctx.fillText(label,x,y+ih+3.7,g.cellWidth);}
    cells.push({x:x/w,y:y/h,w:g.cellWidth/w,h:ih/h,variant:v});
  }
  ctx.restore();return {canvas:c,cells};
}

export function renderPrint(source, settings, curve, options) {
  const [w,h]=options.paper, width=mmToPx(w,options.dpi),height=mmToPx(h,options.dpi);
  if(width*height>36_000_000)throw Error('This page is too large at that resolution. Choose a lower DPI or smaller paper (maximum 36 megapixels).');
  const printSettings={...settings,invert:options.polarity==='negative'};
  if(options.kind==='sheet')return renderSheet(source,printSettings,curve,options.sheet,options.paper,'negative',options.dpi,options.title).canvas;
  const c=canvas(width,height),ctx=c.getContext('2d'),[sw,sh]=imageDimensions(source,settings);
  const iw=options.imageWidth,ih=iw*sh/sw;
  if(iw>w-10||ih>h-10)throw Error('The image does not fit with a 5 mm print margin. Reduce the image width or choose larger paper.');
  const img=renderImage(source,printSettings,curve,'negative',Math.ceil(Math.max(iw,ih)/25.4*options.dpi));
  ctx.fillStyle='white';ctx.fillRect(0,0,width,height);
  ctx.drawImage(img,(width-iw/25.4*options.dpi)/2,(height-ih/25.4*options.dpi)/2,iw/25.4*options.dpi,ih/25.4*options.dpi);
  return c;
}

const encode = s => new TextEncoder().encode(s);
const blobOf = (c,type,quality) => new Promise((resolve,reject)=>c.toBlob(b=>b?resolve(b):reject(Error('Could not encode the print file. Try a lower resolution.')),type,quality));
export async function pdfBlob(c,paper) {
  const jpeg = new Uint8Array(await (await blobOf(c,'image/jpeg',1)).arrayBuffer());
  const w=mmToPt(paper[0]).toFixed(4), h=mmToPt(paper[1]).toFixed(4);
  const stream=`q\n${w} 0 0 ${h} 0 0 cm\n/Im0 Do\nQ\n`;
  const objects=[
    encode('<< /Type /Catalog /Pages 2 0 R >>'),
    encode('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'),
    encode(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`),
    [encode(`<< /Type /XObject /Subtype /Image /Width ${c.width} /Height ${c.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`),jpeg,encode('\nendstream')],
    encode(`<< /Length ${encode(stream).length} >>\nstream\n${stream}endstream`)
  ];
  const parts=[encode('%PDF-1.4\n% cyanotype print\n')],offsets=[0];let position=parts[0].length;
  objects.forEach((obj,i)=>{offsets.push(position);const pieces=[encode(`${i+1} 0 obj\n`),...(Array.isArray(obj)?obj:[obj]),encode('\nendobj\n')];pieces.forEach(p=>{parts.push(p);position+=p.length;});});
  const xref=position;
  parts.push(encode(`xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`));
  return new Blob(parts,{type:'application/pdf'});
}
export function crc32(bytes) {
  let crc=0xffffffff;
  for(const byte of bytes){crc^=byte;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}
  return (crc^0xffffffff)>>>0;
}
export async function pngBlob(c,dpi) {
  const data=new Uint8Array(await (await blobOf(c,'image/png')).arrayBuffer());
  const phys=new Uint8Array(21),view=new DataView(phys.buffer);
  view.setUint32(0,9);phys.set(encode('pHYs'),4);view.setUint32(8,Math.round(dpi/0.0254));view.setUint32(12,Math.round(dpi/0.0254));phys[16]=1;view.setUint32(17,crc32(phys.subarray(4,17)));
  const parts=[data.slice(0,8)];let pos=8;
  while(pos<data.length){const length=new DataView(data.buffer,data.byteOffset+pos,4).getUint32(0),chunk=data.slice(pos,pos+length+12),type=new TextDecoder().decode(chunk.subarray(4,8));if(type!=='pHYs')parts.push(chunk);if(type==='IHDR')parts.push(phys);pos+=length+12;}
  return new Blob(parts,{type:'image/png'});
}
export function download(blob,filename) {
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
}

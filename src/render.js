import { processPixels, sheetGeometry, sampleRegion, variantGrid, mmToPx, mmToPt } from './engine.js';

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
export const adjustmentLabel = (key, value) => `${key[0].toUpperCase()+key.slice(1)} ${value > 0 ? '+' : ''}${Number(value.toFixed(key==='exposure'?2:1))}${key==='exposure'?' EV':''}`;

export function renderRegion(source,settings,curve,mode,region,printWidth,dpi) {
  const [w,h]=imageDimensions(source,settings),scale=printWidth/w*dpi/25.4;
  const c=canvas(region.w*scale,region.h*scale),ctx=c.getContext('2d',{willReadFrequently:true});
  ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);
  ctx.save();ctx.scale(c.width/region.w,c.height/region.h);ctx.translate(-region.x,-region.y);
  ctx.translate(w/2,h/2);ctx.scale(settings.mirror?-1:1,settings.flip?-1:1);ctx.rotate(settings.rotation*Math.PI/180);
  ctx.drawImage(source,-source.width/2,-source.height/2);ctx.restore();
  if(mode!=='original'){
    const pixels=ctx.getImageData(0,0,c.width,c.height);
    pixels.data.set(processPixels(pixels.data,c.width,settings,curve,mode,{x:Math.round(region.x*scale),y:Math.round(region.y*scale)}));
    ctx.putImageData(pixels,0,0);
  }
  return c;
}

export function renderSheet(source, settings, curve, config, mode='negative', dpi=150) {
  const g=sheetGeometry(config),[w,h]=imageDimensions(source,settings),region=sampleRegion(w,h,config);
  const c=canvas(mmToPx(g.width,dpi),mmToPx(g.height,dpi)),ctx=c.getContext('2d');
  ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);
  const cells=[];
  for(const v of variantGrid(settings,config)){
    const col=(v.index-1)%g.columns,row=Math.floor((v.index-1)/g.columns);
    const x=col*(g.cellWidth+g.divider),y=row*(g.cellHeight+g.divider);
    const left=mmToPx(x,dpi),top=mmToPx(y,dpi),right=mmToPx(x+g.cellWidth,dpi),bottom=mmToPx(y+g.cellHeight,dpi);
    const image=renderRegion(source,v.settings,curve,mode,region,config.printWidth,dpi);
    ctx.drawImage(image,left,top,right-left,bottom-top);
    cells.push({x:x/g.width,y:y/g.height,w:g.cellWidth/g.width,h:g.cellHeight/g.height,variant:v});
  }
  return {canvas:c,cells,geometry:g};
}

export function renderPrint(source, settings, curve, options) {
  const [sw,sh]=imageDimensions(source,settings),g=sheetGeometry(options.sheet);
  const dimensions=options.kind==='sheet'?[g.width,g.height]:[options.sheet.printWidth,options.sheet.printWidth*sh/sw];
  const width=mmToPx(dimensions[0],options.dpi),height=mmToPx(dimensions[1],options.dpi);
  if(width*height>36_000_000)throw Error('Export exceeds 36 megapixels. Reduce the size or DPI.');
  const printSettings={...settings,invert:options.polarity==='negative'};
  if(options.kind==='sheet')return renderSheet(source,printSettings,curve,options.sheet,'negative',options.dpi).canvas;
  return renderRegion(source,printSettings,curve,'negative',{x:0,y:0,w:sw,h:sh},options.sheet.printWidth,options.dpi);
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

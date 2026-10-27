export const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
export const DEFAULTS = Object.freeze({ exposure: 0, contrast: 10, shadows: 0, highlights: 0, grain: 0, invert: true, mirror: false, flip: false, rotation: 0 });
export const CURVES = {
  linear: [[0, 0], [64, 64], [128, 128], [192, 192], [255, 255]],
  soft: [[0, 12], [64, 73], [128, 133], [192, 189], [255, 246]],
  contrast: [[0, 0], [64, 45], [128, 128], [192, 212], [255, 255]],
};
export const mmToPx = (mm, dpi) => Math.round(mm / 25.4 * dpi);
export const mmToPt = mm => mm / 25.4 * 72;
export const SHEET_DEFAULTS = Object.freeze({layout:'strip',axis:'contrast',step:15,axis2:'grain',step2:20,printWidth:150,tileWidth:50,tileHeight:50,divider:0.1,cropX:0.5,cropY:0.5});
export const PAPER_SIZES = Object.freeze({
  letter: {label:'Letter · 8.5 × 11 in',size:[215.9,279.4]},
  tabloid: {label:'Tabloid · 11 × 17 in',size:[279.4,431.8]},
  legal: {label:'Legal · 8.5 × 14 in',size:[215.9,355.6]},
  superB: {label:'Super B · 13 × 19 in',size:[330.2,482.6]},
  photo4x6: {label:'4 × 6 in',size:[101.6,152.4]},
  photo5x7: {label:'5 × 7 in',size:[127,177.8]},
  photo8x10: {label:'8 × 10 in',size:[203.2,254]},
  photo11x14: {label:'11 × 14 in',size:[279.4,355.6]},
  a5: {label:'A5 · 148 × 210 mm',size:[148,210]},
  a4: {label:'A4 · 210 × 297 mm',size:[210,297]},
  a3: {label:'A3 · 297 × 420 mm',size:[297,420]},
});

// Page placement never changes the artwork's physical print dimensions.
export function pageLayout(artwork, paperId='artwork', orientation='portrait') {
  if(!Array.isArray(artwork)||artwork.length!==2||artwork.some(n=>!Number.isFinite(n)||n<=0))throw Error('Invalid print dimensions.');
  if(!['portrait','landscape'].includes(orientation))throw Error('Invalid page orientation.');
  let paper=[...artwork];
  if(paperId!=='artwork'){
    if(!Object.hasOwn(PAPER_SIZES,paperId))throw Error('Choose a valid paper size.');
    paper=[...PAPER_SIZES[paperId].size];
    if(orientation==='landscape')paper.reverse();
  }
  const x=(paper[0]-artwork[0])/2,y=(paper[1]-artwork[1])/2;
  const fits=artwork[0]<=paper[0]+1e-7&&artwork[1]<=paper[1]+1e-7;
  return {paper,artwork:[...artwork],x,y,fits};
}

// Shape-preserving cubic interpolation avoids ringing between curve handles.
export function curveLut(points) {
  const p = points.map(v => [...v]).sort((a, b) => a[0] - b[0]);
  const d = p.slice(1).map((v, i) => (v[1] - p[i][1]) / Math.max(0.001, v[0] - p[i][0]));
  const m = [d[0], ...d.slice(1).map((v, i) => d[i] * v <= 0 ? 0 : 2 / (1 / d[i] + 1 / v)), d.at(-1)];
  return Uint8Array.from({ length: 256 }, (_, x) => {
    let i = 0;
    while (i < p.length - 2 && x > p[i + 1][0]) i++;
    const h = p[i + 1][0] - p[i][0], t = clamp((x - p[i][0]) / h);
    const y = (2*t**3-3*t**2+1)*p[i][1] + (t**3-2*t**2+t)*h*m[i] + (-2*t**3+3*t**2)*p[i+1][1] + (t**3-t**2)*h*m[i+1];
    return Math.round(clamp(y, 0, 255));
  });
}

export function noise(x, y) {
  let n = Math.imul(x + 1, 374761393) ^ Math.imul(y + 1, 668265263);
  n = Math.imul(n ^ n >>> 13, 1274126177);
  return ((n ^ n >>> 16) >>> 0) / 4294967295 - 0.5;
}

export function toneLut(settings, points) {
  const curve = curveLut(points);
  const factor = (100 + settings.contrast) / Math.max(1, 100 - settings.contrast);
  return Float32Array.from({ length: 256 }, (_, i) => {
    let v = i / 255 * 2 ** settings.exposure;
    v = (v - 0.5) * factor + 0.5;
    v = clamp(v);
    v = clamp(v + settings.shadows / 250 * (1 - v) ** 3 + settings.highlights / 250 * v ** 3);
    return curve[Math.round(v * 255)] / 255;
  });
}

export function processPixels(data, width, settings, points, mode = 'negative', offset = {x:0,y:0}) {
  const out = new Uint8ClampedArray(data.length), lut = toneLut(settings, points);
  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3] / 255;
    const gray = Math.round((0.2126 * data[i] + 0.7152 * data[i+1] + 0.0722 * data[i+2]) * alpha + 255 * (1-alpha));
    let v = clamp(lut[gray] + noise((i/4)%width+offset.x, Math.floor(i/4/width)+offset.y) * settings.grain / 100);
    if (settings.invert) v = 1 - v;
    if (mode === 'proof') {
      // White inkjet pixels are clear film: more light reaches the coating.
      const density = v ** 0.85;
      out[i] = 245 + (17-245)*density;
      out[i+1] = 243 + (63-243)*density;
      out[i+2] = 231 + (113-231)*density;
    } else { out[i] = out[i+1] = out[i+2] = Math.round(v * 255); }
    out[i+3] = 255;
  }
  return out;
}

export function variantGrid(settings, config) {
  const count = config.layout === 'strip' ? 4 : config.layout === 'grid6' ? 6 : 9;
  const cols = config.layout === 'strip' ? 1 : 3, rows = count / cols;
  const valuesFor = (key, n, step) => {
    const min = key === 'grain' ? 0 : key === 'exposure' ? -2 : key === 'contrast' ? -80 : -100;
    const max = key === 'grain' ? 60 : key === 'exposure' ? 2 : key === 'contrast' ? 80 : 100;
    const actualStep = Math.min(step, (max-min)/(n-1));
    const start = clamp(settings[key] - (n-1)/2*actualStep, min, max-(n-1)*actualStep);
    return Array.from({length:n},(_,i)=>Math.round((start+i*actualStep)*1000)/1000);
  };
  const twoAxes = config.layout !== 'strip' && config.axis2 !== 'none';
  const horizontal = valuesFor(config.axis, twoAxes ? cols : count, config.step);
  const vertical = twoAxes ? valuesFor(config.axis2, rows, config.step2) : null;
  return Array.from({ length: count }, (_, i) => {
    const col = i % cols, row = Math.floor(i / cols);
    const s = { ...settings, [config.axis]: horizontal[twoAxes ? col : i] };
    const values = [[config.axis, s[config.axis]]];
    if (twoAxes) {
      s[config.axis2] = vertical[row];
      values.push([config.axis2, s[config.axis2]]);
    }
    return { index: i + 1, settings: s, values };
  });
}

export function sheetGeometry(config) {
  const columns = config.layout === 'strip' ? 1 : 3;
  const rows = config.layout === 'strip' ? 4 : config.layout === 'grid6' ? 2 : 3;
  const cellWidth = Number(config.tileWidth), cellHeight = Number(config.tileHeight), divider = Number(config.divider);
  if (![cellWidth,cellHeight,divider].every(Number.isFinite) || cellWidth<1 || cellHeight<1 || divider<0 || divider>0.25) throw Error('Invalid sample dimensions or divider.');
  return {columns,rows,cellWidth,cellHeight,divider,width:columns*cellWidth+(columns-1)*divider,height:rows*cellHeight+(rows-1)*divider};
}

// A test is a window into the full-size print, never a fitted thumbnail.
export function sampleRegion(imageWidth, imageHeight, config) {
  const printWidth=Number(config.printWidth), printHeight=printWidth*imageHeight/imageWidth;
  if (!Number.isFinite(printWidth)||printWidth<=0||config.tileWidth>printWidth+1e-8||config.tileHeight>printHeight+1e-8) throw Error('The sample must fit within the print dimensions.');
  const w=config.tileWidth/printWidth*imageWidth,h=config.tileHeight/printHeight*imageHeight;
  const x=clamp(config.cropX*imageWidth-w/2,0,Math.max(0,imageWidth-w));
  const y=clamp(config.cropY*imageHeight-h/2,0,Math.max(0,imageHeight-h));
  return {x,y,w,h,printWidth,printHeight};
}

// Feathered clone stamping works on the original color image, before tone mapping.
export function cloneStamp(target, snapshot, width, height, x, y, sx, sy, radius, opacity = 1) {
  for (let py = Math.max(0, Math.floor(y-radius)); py <= Math.min(height-1, y+radius); py++) {
    for (let px = Math.max(0, Math.floor(x-radius)); px <= Math.min(width-1, x+radius); px++) {
      const distance = Math.hypot(px-x, py-y) / radius;
      if (distance >= 1) continue;
      const sampleX = Math.round(sx + px-x), sampleY = Math.round(sy + py-y);
      if (sampleX < 0 || sampleX >= width || sampleY < 0 || sampleY >= height) continue;
      const a = (1 - distance ** 2) ** 2 * opacity, to = (py*width+px)*4, from = (sampleY*width+sampleX)*4;
      for (let c = 0; c < 3; c++) target[to+c] = target[to+c]*(1-a) + snapshot[from+c]*a;
      target[to+3] = 255;
    }
  }
}

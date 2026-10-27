import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, CURVES, SHEET_DEFAULTS, PAPER_SIZES, pageLayout, curveLut, processPixels, variantGrid, mmToPx, mmToPt, sheetGeometry, sampleRegion, cloneStamp } from '../src/engine.js';
import { adjustmentLabel } from '../src/render.js';
test('linear curves preserve every gray value', () => { assert.deepEqual([...curveLut(CURVES.linear)], Array.from({length:256},(_,i)=>i)); });
test('a print negative reverses black and white; proof restores print polarity', () => {
  const pixels = new Uint8ClampedArray([0,0,0,255,255,255,255,255]);
  const settings = {...DEFAULTS,contrast:0};
  const negative = processPixels(pixels,2,settings,CURVES.linear);
  assert.equal(negative[0],255); assert.equal(negative[4],0);
  const proof = processPixels(pixels,2,settings,CURVES.linear,'proof');
  assert.equal(proof[0],17); assert.equal(proof[4],245);
});
test('transparent image pixels export as opaque white before inversion', () => {
  assert.equal(processPixels(new Uint8ClampedArray([0,0,0,0]),1,{...DEFAULTS,invert:false},CURVES.linear)[0],255);
});
test('paper sizing uses actual inches and 72 point PDF units', () => { assert.equal(mmToPx(215.9,300),2550); assert.equal(mmToPx(279.4,300),3300); assert.ok(Math.abs(mmToPt(215.9)-612)<1e-8); });
test('standard paper presets have correct physical and raster sizes', () => {
  assert.deepEqual(PAPER_SIZES.letter.size.map(n=>mmToPx(n,300)),[2550,3300]);
  assert.deepEqual(PAPER_SIZES.tabloid.size.map(n=>mmToPx(n,300)),[3300,5100]);
  assert.deepEqual(PAPER_SIZES.photo4x6.size.map(n=>mmToPx(n,300)),[1200,1800]);
  assert.deepEqual(PAPER_SIZES.photo5x7.size.map(n=>mmToPx(n,300)),[1500,2100]);
  assert.deepEqual(PAPER_SIZES.photo8x10.size.map(n=>mmToPx(n,300)),[2400,3000]);
});
test('placing on paper centers the artwork without changing print dimensions', () => {
  const art=[150,225],layout=pageLayout(art,'letter');
  assert.deepEqual(layout.artwork,art);assert.deepEqual(layout.paper,[215.9,279.4]);
  assert.ok(Math.abs(layout.x-32.95)<1e-8);assert.ok(Math.abs(layout.y-27.2)<1e-8);assert.equal(layout.fits,true);
});
test('landscape changes the page orientation without rotating or resizing artwork', () => {
  const layout=pageLayout([225,150],'letter','landscape');
  assert.deepEqual(layout.paper,[279.4,215.9]);assert.deepEqual(layout.artwork,[225,150]);assert.equal(layout.fits,true);
  assert.equal(pageLayout([225,150],'letter','portrait').fits,false);
});
test('oversized artwork is flagged instead of silently fitted onto smaller paper', () => {
  const layout=pageLayout([150,225],'photo4x6');
  assert.equal(layout.fits,false);assert.deepEqual(layout.artwork,[150,225]);
  assert.ok(layout.x<0&&layout.y<0);
});
test('exact-size exports preserve the existing continuous-strip dimensions', () => {
  const g=sheetGeometry(SHEET_DEFAULTS),art=[g.width,g.height],layout=pageLayout(art,'artwork','landscape');
  assert.deepEqual(layout.paper,art);assert.equal(layout.x,0);assert.equal(layout.y,0);assert.equal(layout.fits,true);
});
test('paper placement tolerates unit-conversion rounding at an exact edge', () => {
  assert.equal(pageLayout([8.5*25.4,11*25.4],'letter').fits,true);
  assert.throws(()=>pageLayout([NaN,10],'letter'));
  assert.throws(()=>pageLayout([10,10],'unknown'));
});
test('contact grid varies both axes independently around the base', () => {
  const v = variantGrid({...DEFAULTS,contrast:20,grain:20},{layout:'grid9',axis:'contrast',axis2:'grain',step:10,step2:10});
  assert.equal(v.length,9); assert.equal(v[0].settings.contrast,10); assert.equal(v[0].settings.grain,10);
  assert.equal(v[4].settings.contrast,20); assert.equal(v[4].settings.grain,20); assert.equal(v[8].settings.contrast,30);
});
test('four-up strip shifts into bounds to keep distinct grain steps', () => {
  const v = variantGrid({...DEFAULTS,grain:0},{layout:'strip',axis:'grain',step:10});
  assert.deepEqual(v.map(s=>s.settings.grain),[0,10,20,30]);
});
test('large step sizes are spread across the available range without duplicates', () => {
  const v = variantGrid({...DEFAULTS,grain:60},{layout:'grid9',axis:'grain',axis2:'none',step:40});
  assert.equal(new Set(v.map(s=>s.settings.grain)).size,9);
  assert.equal(v[0].settings.grain,0);assert.equal(v[8].settings.grain,60);
});
test('variation readouts preserve fractional exposure and contrast settings', () => {
  assert.equal(adjustmentLabel('exposure',.025),'Exposure +0.025 EV');
  assert.equal(adjustmentLabel('contrast',2.5),'Contrast +2.5');
});
test('a strip contains only four touching samples and hairline dividers', () => {
  const g=sheetGeometry(SHEET_DEFAULTS);
  assert.equal(g.width,50);assert.equal(g.height,200.3);assert.equal(g.rows,4);assert.equal(g.divider,.1);
});
test('grids have no headers, margins, or label bands, including old saved options', () => {
  const g=sheetGeometry({...SHEET_DEFAULTS,layout:'grid6',labels:true,margin:12,gap:5});
  assert.equal(g.width,150.2);assert.equal(g.height,100.1);
  assert.equal(g.cellWidth,50);assert.equal(g.cellHeight,50);
});
test('zero-divider grids are completely contiguous', () => {
  const g=sheetGeometry({...SHEET_DEFAULTS,layout:'grid9',divider:0});
  assert.equal(g.width,150);assert.equal(g.height,150);
});
test('wide gutters are rejected rather than silently reintroduced', () => {
  assert.throws(()=>sheetGeometry({...SHEET_DEFAULTS,divider:5}));
});
test('samples crop at the final print scale', () => {
  const region=sampleRegion(1000,1500,{...SHEET_DEFAULTS,printWidth:200});
  assert.deepEqual(region,{x:375,y:625,w:250,h:250,printWidth:200,printHeight:300});
});
test('doubling print size increases magnification instead of shrinking the full image into a tile', () => {
  const region=sampleRegion(1000,1500,{...SHEET_DEFAULTS,printWidth:400});
  assert.equal(region.w,125);assert.equal(region.h,125);
});
test('sample position stays inside the print at its edges', () => {
  const top=sampleRegion(1000,1500,{...SHEET_DEFAULTS,printWidth:200,cropX:0,cropY:0});
  assert.equal(top.x,0);assert.equal(top.y,0);
  const bottom=sampleRegion(1000,1500,{...SHEET_DEFAULTS,printWidth:200,cropX:1,cropY:1});
  assert.equal(bottom.x+bottom.w,1000);assert.equal(bottom.y+bottom.h,1500);
});
test('the full image appears only when the sample matches the actual print dimensions', () => {
  const region=sampleRegion(1000,1500,{...SHEET_DEFAULTS,printWidth:200,tileWidth:200,tileHeight:300});
  assert.equal(region.x,0);assert.equal(region.y,0);assert.equal(region.w,1000);assert.equal(region.h,1500);
  assert.throws(()=>sampleRegion(1000,1500,{...SHEET_DEFAULTS,printWidth:20}));
});
test('clone stamp samples a separate source and feathers brush edges', () => {
  const pixels = new Uint8ClampedArray(7*7*4).fill(255); pixels[(1*7+1)*4]=0;
  const original = pixels.slice(); cloneStamp(pixels,original,7,7,4,4,1,1,2);
  assert.equal(pixels[(4*7+4)*4],0); assert.equal(pixels[(4*7+6)*4],255); assert.equal(original[(4*7+4)*4],255);
});

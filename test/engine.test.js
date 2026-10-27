import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, CURVES, curveLut, processPixels, variantGrid, mmToPx, mmToPt, sheetGeometry, cloneStamp } from '../src/engine.js';
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
test('sheet layout rejects dimensions that would clip cells', () => { assert.throws(()=>sheetGeometry(50,50,{layout:'grid9',margin:20,gap:5,labels:true})); });
test('the four-up strip is centered with a consistent 70 mm column', () => {
  const g=sheetGeometry(215.9,279.4,{layout:'strip',margin:12,gap:5,labels:true});
  assert.equal(g.cellWidth,70); assert.equal(g.originX,(215.9-70)/2); assert.equal(g.rows,4);
});
test('clone stamp samples a separate source and feathers brush edges', () => {
  const pixels = new Uint8ClampedArray(7*7*4).fill(255); pixels[(1*7+1)*4]=0;
  const original = pixels.slice(); cloneStamp(pixels,original,7,7,4,4,1,1,2);
  assert.equal(pixels[(4*7+4)*4],0); assert.equal(pixels[(4*7+6)*4],255); assert.equal(original[(4*7+4)*4],255);
});

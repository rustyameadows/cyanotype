import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, CURVES, SHEET_DEFAULTS } from '../src/engine.js';
import { openSessionStore, validateSession } from '../src/session.js';

const state=()=>({version:1,sourceName:'photo.png',settings:{...DEFAULTS},curve:structuredClone(CURVES.linear),sheet:{...SHEET_DEFAULTS},sourceIsOriginal:true});

test('saved state preserves fractional edits, orientation, and contact-sheet scale',()=>{
  const saved=state();saved.settings.exposure=.025;saved.settings.rotation=90;saved.settings.mirror=true;
  saved.sheet.printWidth=203.2;saved.sheet.cropX=.75;saved.sheet.layout='grid9';
  assert.deepEqual(validateSession(structuredClone(saved)),saved);
});
test('unsupported or incomplete saved data is rejected',()=>{
  assert.throws(()=>validateSession(null));assert.throws(()=>validateSession({version:1}));
  assert.throws(()=>validateSession({...state(),version:2}));
});
test('corrupt saved adjustments do not reach the image processor',()=>{
  for(const [key,value]of [['exposure',NaN],['contrast',101],['rotation',45],['invert','false']]){
    const saved=state();saved.settings[key]=value;assert.throws(()=>validateSession(saved));
  }
});
test('invalid curves cannot break session recovery',()=>{
  const saved=state();saved.curve[2][0]=saved.curve[1][0];assert.throws(()=>validateSession(saved));
  saved.curve=structuredClone(CURVES.linear);saved.curve[4][1]=Infinity;assert.throws(()=>validateSession(saved));
});
test('invalid print geometry and crop positions are rejected',()=>{
  for(const [key,value]of [['printWidth',0],['cropX',2],['tileWidth',0],['divider',10],['axis','unknown'],['step',NaN]]){
    const saved=state();saved.sheet[key]=value;assert.throws(()=>validateSession(saved));
  }
});
test('unavailable browser storage reports a recoverable error',async()=>{
  await assert.rejects(openSessionStore(null),/storage is unavailable/);
});

import { DEFAULTS, CURVES, SHEET_DEFAULTS, PAPER_SIZES, pageLayout, clamp, curveLut, variantGrid, sheetGeometry, sampleRegion, cloneStamp, mmToPx } from './engine.js';
import { canvas, renderImage, renderRegion, imageDimensions, renderSheet, printDimensions, renderExport, adjustmentLabel, pdfBlob, pngBlob, download } from './render.js';
import { openSessionStore, validateSession } from './session.js';

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const clone = value => structuredClone(value);
let settings = {...DEFAULTS}, curve = clone(CURVES.linear), sheet = {...SHEET_DEFAULTS};
let source=null, original=null, sourceName='', view='lab', mode='negative', tool='adjust', unit='mm';
let undoStack=[], redoStack=[], renderFrame=0, zoom=1, compare=false, selectedVariant=null, busy=false, toastTimer;
let clonePoint=null, sourcePicking=false, painting=false, strokeSnapshot=null, strokeData=null, strokeAnchor=null, lastPoint=null;
const sliderDefs=[['exposure','Exposure',-2,2,.05],['contrast','Contrast',-80,80,1],['shadows','Shadows',-100,100,1],['highlights','Highlights',-100,100,1],['grain','Grain',0,60,1]];

function toast(message,error=false) {
  clearTimeout(toastTimer); $('#toast').textContent=message;
  $('#toast').classList.toggle('error',error); $('#toast').hidden=false;
  toastTimer=setTimeout(()=>$('#toast').hidden=true,5000);
}
function capture(){return {settings:{...settings},curve:clone(curve),sheet:{...sheet},source,unit};}
function remember() {
  if(!source)return;
  undoStack.push(capture()); if(undoStack.length>30)undoStack.shift();
  const unique=[...new Set(undoStack.map(s=>s.source))];
  if(unique.length>5)undoStack=undoStack.filter(s=>s.source!==unique[0]);
  redoStack=[]; updateHistory();
}
function clearClone(){clonePoint=null;sourcePicking=false;$('#clone-marker').hidden=true;$('#clone-status').textContent='Alt-click to sample.';}
function restore(state){settings={...state.settings};curve=clone(state.curve);sheet={...state.sheet};source=state.source;unit=state.unit;clearClone();syncControls();scheduleRender();}
function undo(){if(!undoStack.length)return;redoStack.push(capture());restore(undoStack.pop());updateHistory();}
function redo(){if(!redoStack.length)return;undoStack.push(capture());restore(redoStack.pop());updateHistory();}
function updateHistory(){$('#undo').disabled=!undoStack.length;$('#redo').disabled=!redoStack.length;}
function rangePaint(input){input.style.setProperty('--range-progress',`${(Number(input.value)-Number(input.min))/(Number(input.max)-Number(input.min))*100}%`);}
function numberLabel(key,value){return `${value>0&&key!=='grain'?'+':''}${Number(value.toFixed(3))}${key==='exposure'?' EV':''}`;}
const displayMM = mm => Number((mm/(unit==='in'?25.4:1)).toFixed(unit==='in'?3:1));
const fromUnit = number => number*(unit==='in'?25.4:1);
const formatMM = number => Number(number.toFixed(2));

$('#sliders').innerHTML=sliderDefs.map(([key,label,min,max,step])=>`<div class="range-control"><label class="range-label" for="${key}">${label}<output id="${key}-value">${numberLabel(key,settings[key])}</output></label><input id="${key}" type="range" min="${min}" max="${max}" step="${step}" value="${settings[key]}"/></div>`).join('');
for(const [key] of sliderDefs) {
  const el=$(`#${key}`);
  el.addEventListener('pointerdown',remember);
  el.addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight','Home','End','PageUp','PageDown'].includes(e.key)&&!e.repeat)remember();});
  el.addEventListener('input',()=>{settings[key]=Number(el.value);$(`#${key}-value`).textContent=numberLabel(key,settings[key]);rangePaint(el);scheduleRender();});
  el.addEventListener('dblclick',()=>{remember();settings[key]=DEFAULTS[key];syncControls();scheduleRender();});
}
function constrainSample() {
  if(!source)return;
  const [w,h]=imageDimensions(source,settings);
  sheet.tileWidth=Math.min(sheet.tileWidth,sheet.printWidth);
  sheet.tileHeight=Math.min(sheet.tileHeight,sheet.printWidth*h/w);
}
function syncControls() {
  for(const [key,,,,step]of sliderDefs){const input=$(`#${key}`);input.step=Math.abs(settings[key]/step-Math.round(settings[key]/step))>1e-6?.001:step;input.value=settings[key];$(`#${key}-value`).textContent=numberLabel(key,settings[key]);}
  $('#invert').checked=settings.invert;
  $('#mirror').setAttribute('aria-pressed',settings.mirror);$('#flip').setAttribute('aria-pressed',settings.flip);
  $('#curve-preset').value=Object.keys(CURVES).find(key=>JSON.stringify(CURVES[key])===JSON.stringify(curve))||'custom';
  $('#dimension-unit').value=unit;$('#sample-unit').textContent=unit;
  if(source) {
    constrainSample();
    const [w,h]=imageDimensions(source,settings);
    $('#source-name').textContent=sourceName;$('#source-dimensions').textContent=`${w.toLocaleString()} × ${h.toLocaleString()} px`;
    $('#print-width').value=displayMM(sheet.printWidth);$('#print-height').value=displayMM(sheet.printWidth*h/w);
    $('#sample-width').value=displayMM(sheet.tileWidth);$('#sample-height').value=displayMM(sheet.tileHeight);
    $('#sample-width').max=displayMM(sheet.printWidth);$('#sample-height').max=displayMM(sheet.printWidth*h/w);
    $('#sample-scale').textContent=`100% of ${displayMM(sheet.printWidth)} × ${displayMM(sheet.printWidth*h/w)} ${unit}`;
  }
  for(const id of ['print-width','print-height','sample-width','sample-height']){$(`#${id}`).step=unit==='in'?.01:.1;$(`#${id}`).min=unit==='in'?.01:.1;}
  $('#variation-axis').value=sheet.axis;$('#variation-axis2').value=sheet.axis2;$('#sheet-divider').value=sheet.divider;
  $$('.layout-option').forEach(b=>b.classList.toggle('active',b.dataset.layout===sheet.layout));
  syncSteps();$$('input[type=range]').forEach(rangePaint);updateView();drawCurve();
}
function syncSteps() {
  for(const n of ['', '2']) {
    const axis=n?sheet.axis2:sheet.axis,el=$(`#variation-step${n}`),key=`step${n}`;
    el.min=axis==='exposure'?.05:1;el.max=axis==='exposure'?1:40;el.step=axis==='exposure'?.05:1;el.value=sheet[key];
    $(`#variation-step${n}-value`).textContent=axis==='exposure'?`${Number(sheet[key]).toFixed(2)} EV`:sheet[key];rangePaint(el);
  }
  $('#second-axis').hidden=sheet.layout==='strip';
  $('label[for=variation-axis]').textContent=sheet.layout==='strip'?'Frames':'Columns';
  $('#variation-step2').disabled=sheet.axis2==='none';
}
function updateView() {
  $('#empty-state').hidden=!!source;$('#app-header').hidden=!source;$('#app-layout').hidden=!source;
  $$('.main-tab').forEach(b=>{b.classList.toggle('active',b.dataset.view===view);b.setAttribute('aria-current',b.dataset.view===view?'page':'false');});
  $('#lab-controls').hidden=view!=='lab';$('#sheet-controls').hidden=view!=='sheet';
  $('#adjust-controls').hidden=tool!=='adjust';$('#retouch-controls').hidden=tool!=='retouch';
  $('#image-mount').hidden=view==='sheet';$('#sheet-preview').hidden=view!=='sheet';$('#variant-list').hidden=view!=='sheet';
  $$('[data-tool]').forEach(b=>b.classList.toggle('active',b.dataset.tool===tool));
  $$('.preview-modes button').forEach(b=>{b.classList.toggle('active',b.dataset.mode===mode&&!compare);b.setAttribute('aria-pressed',b.dataset.mode===mode&&!compare);});
  $('#compare').setAttribute('aria-pressed',compare);$('#image-holder').style.cursor=tool==='retouch'?'crosshair':'';
  if(tool!=='retouch'){$('#clone-marker').hidden=true;$('#brush-cursor').hidden=true;}
}
function setView(next){if(next!==view)$('#export-kind').value=next==='sheet'?'sheet':'image';view=next;zoom=1;updateView();scheduleRender();}
$$('.main-tab').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.view)));
$$('[data-tool]').forEach(b=>b.addEventListener('click',()=>{tool=b.dataset.tool;updateView();}));
$$('[data-mode]').forEach(b=>b.addEventListener('click',()=>{mode=b.dataset.mode;compare=false;updateView();scheduleRender();}));
$('#compare').addEventListener('click',()=>{compare=!compare;updateView();scheduleRender();});
$('#undo').addEventListener('click',undo);$('#redo').addEventListener('click',redo);
$('#invert').addEventListener('change',e=>{remember();settings.invert=e.target.checked;$('#export-polarity').value=settings.invert?'negative':'positive';updateView();scheduleRender();});
for(const key of ['mirror','flip'])$(`#${key}`).addEventListener('click',()=>{remember();settings[key]=!settings[key];clearClone();syncControls();scheduleRender();});
$('#rotate').addEventListener('click',()=>{remember();settings.rotation=(settings.rotation+90)%360;clearClone();syncControls();scheduleRender();});
$('#curve-preset').addEventListener('change',e=>{if(!CURVES[e.target.value])return;remember();curve=clone(CURVES[e.target.value]);drawCurve();scheduleRender();});
$('#reset-all').addEventListener('click',()=>{remember();settings={...DEFAULTS};curve=clone(CURVES.linear);clearClone();syncControls();scheduleRender();});
$('#dimension-unit').addEventListener('change',e=>{unit=e.target.value;syncControls();scheduleRender();});
for(const dimension of ['width','height'])$('#print-'+dimension).addEventListener('change',e=>{
  if(!source)return;const value=fromUnit(Number(e.target.value));if(!Number.isFinite(value)||value<=0){syncControls();return;}
  remember();const [w,h]=imageDimensions(source,settings);sheet.printWidth=clamp(dimension==='height'?value*w/h:value,10,2000);syncControls();scheduleRender();
});
for(const dimension of ['width','height'])$('#sample-'+dimension).addEventListener('change',e=>{
  const value=fromUnit(Number(e.target.value));if(!Number.isFinite(value)||value<=0){syncControls();return;}
  remember();sheet[dimension==='width'?'tileWidth':'tileHeight']=Math.max(.1,value);syncControls();scheduleRender();
});

function scheduleRender(){if(renderFrame)return;renderFrame=requestAnimationFrame(()=>{renderFrame=0;try{render();}catch(e){toast(e.message,true);}});}
function render() {
  if(!source)return;const actualMode=compare?'original':mode;
  if(view==='lab') {
    const image=renderImage(source,settings,curve,actualMode,Math.min(1400,Math.max(source.width,source.height)));
    const target=$('#preview-canvas');target.width=image.width;target.height=image.height;target.getContext('2d').drawImage(image,0,0);
    const [w,h]=imageDimensions(source,settings);$('#work-meta').textContent=`${displayMM(sheet.printWidth)} × ${displayMM(sheet.printWidth*h/w)} ${unit}`;
  } else {
    const result=renderSheet(source,settings,curve,sheet,actualMode,150),parent=$('#sheet-preview');parent.replaceChildren(result.canvas);$('#variant-list').replaceChildren();
    for(const cell of result.cells) {
      const description=cell.variant.values.map(([k,v])=>adjustmentLabel(k,v));
      const b=document.createElement('button');b.className='sheet-hit';b.style.cssText=`left:${cell.x*100}%;top:${cell.y*100}%;width:${cell.w*100}%;height:${cell.h*100}%`;
      b.setAttribute('aria-label',`${cell.variant.index}: ${description.join(', ')}`);b.addEventListener('click',()=>openVariant(cell.variant));parent.append(b);
      const row=document.createElement('button');row.className='variant-row';const number=document.createElement('b');number.textContent=cell.variant.index;
      const label=document.createElement('span');description.forEach((text,i)=>{if(i)label.append(document.createElement('br'));label.append(text);});row.append(number,label);row.addEventListener('click',()=>openVariant(cell.variant));$('#variant-list').append(row);
    }
    $('#work-meta').textContent=`${displayMM(result.geometry.width)} × ${displayMM(result.geometry.height)} ${unit} · 100% print scale`;
    drawCropPicker();
  }
  fitPreview();drawCurve();saveSession();
}
function fitPreview() {
  if(!source)return;const area=$('#canvas-viewport'),maxW=area.clientWidth-48,maxH=area.clientHeight-48;if(maxW<=0||maxH<=0)return;
  let w,h,target;
  if(view==='lab'){[w,h]=imageDimensions(source,settings);target=$('#image-mount');}
  else{const g=sheetGeometry(sheet);w=g.width;h=g.height;target=$('#sheet-preview');}
  const scale=Math.min(maxW/w,maxH/h);target.style.width=`${w*scale}px`;target.style.height=`${h*scale}px`;
  $('#canvas-center').style.transform=`scale(${zoom})`;$('#zoom-label').textContent=zoom===1?'Fit':`${Math.round(zoom*100)}%`;
}
$('#zoom-in').addEventListener('click',()=>{zoom=clamp(zoom+.25,.5,3);fitPreview();});$('#zoom-out').addEventListener('click',()=>{zoom=clamp(zoom-.25,.5,3);fitPreview();});$('#zoom-fit').addEventListener('click',()=>{zoom=1;fitPreview();});
new ResizeObserver(fitPreview).observe($('#canvas-viewport'));

function drawCurve(){
  const focusedHandle = document.activeElement?.closest('#curve-handles [data-index]')?.dataset.index;
  const histCanvas=$('#curve-canvas'),ctx=histCanvas.getContext('2d');ctx.clearRect(0,0,512,288);
  ctx.strokeStyle=getComputedStyle(document.documentElement).getPropertyValue('--grid-line').trim();ctx.lineWidth=1;for(let i=1;i<4;i++){ctx.beginPath();ctx.moveTo(i*128,0);ctx.lineTo(i*128,260);ctx.moveTo(0,i*65);ctx.lineTo(512,i*65);ctx.stroke();}
  if(source){const c=canvas(128,128);c.getContext('2d').drawImage(source,0,0,128,128);const pixels=c.getContext('2d').getImageData(0,0,128,128).data,hist=Array(64).fill(0);for(let i=0;i<pixels.length;i+=4)hist[Math.min(63,Math.floor((pixels[i]*.2126+pixels[i+1]*.7152+pixels[i+2]*.0722)/4))]++;const max=Math.max(...hist);ctx.fillStyle='#000';ctx.beginPath();ctx.moveTo(16,248);hist.forEach((v,i)=>ctx.lineTo(16+i/63*480,248-v/max*170));ctx.lineTo(496,248);ctx.closePath();ctx.fill();}
  const lut=curveLut(curve);$('#curve-line').setAttribute('d',[...lut].filter((_,i)=>i%3===0||i===255).map((v,i)=>`${i?'L':'M'}${Math.min(255,i*3)/255*256},${144-v/255*144}`).join(' '));
  $('#curve-underlay').setAttribute('d',$('#curve-line').getAttribute('d'));
  const handles=$('#curve-handles');handles.replaceChildren();curve.forEach(([x,y],i)=>{const c=document.createElementNS('http://www.w3.org/2000/svg','circle');c.setAttribute('cx',x/255*256);c.setAttribute('cy',144-y/255*144);c.setAttribute('r','3.2');c.dataset.index=i;c.setAttribute('tabindex','0');c.setAttribute('role','slider');c.setAttribute('aria-label',`Curve point ${i+1} output`);c.setAttribute('aria-valuemin','0');c.setAttribute('aria-valuemax','255');c.setAttribute('aria-valuenow',y);c.addEventListener('keydown',e=>{if(!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key))return;e.preventDefault();remember();if(e.key==='ArrowUp'||e.key==='ArrowDown')curve[i][1]=clamp(y+(e.key==='ArrowUp'?3:-3),0,255);else if(i>0&&i<curve.length-1)curve[i][0]=clamp(x+(e.key==='ArrowRight'?3:-3),curve[i-1][0]+5,curve[i+1][0]-5);$('#curve-preset').value='custom';drawCurve();$(`#curve-handles [data-index="${i}"]`).focus();scheduleRender();});handles.append(c);});
  if(focusedHandle!==undefined)$(`#curve-handles [data-index="${focusedHandle}"]`)?.focus({preventScroll:true});
}
let curveDrag=null;
$('#curve-editor').addEventListener('pointerdown',e=>{if(!e.target.dataset.index)return;remember();curveDrag=Number(e.target.dataset.index);$('#curve-editor').setPointerCapture(e.pointerId);e.preventDefault();});
$('#curve-editor').addEventListener('pointermove',e=>{if(curveDrag===null)return;const rect=$('#curve-editor').getBoundingClientRect(),i=curveDrag,x=(e.clientX-rect.left)/rect.width*255,y=255-(e.clientY-rect.top)/rect.height*255;curve[i]=[i===0?0:i===curve.length-1?255:Math.round(clamp(x,curve[i-1][0]+5,curve[i+1][0]-5)),Math.round(clamp(y,0,255))];$('#curve-preset').value='custom';drawCurve();scheduleRender();});
$('#curve-editor').addEventListener('pointerup',()=>{if(curveDrag!==null){curveDrag=null;}});$('#curve-editor').addEventListener('pointercancel',()=>curveDrag=null);


function imagePoint(e){const rect=$('#preview-canvas').getBoundingClientRect();let nx=(e.clientX-rect.left)/rect.width-.5,ny=(e.clientY-rect.top)/rect.height-.5;if(settings.mirror)nx=-nx;if(settings.flip)ny=-ny;const [w,h]=imageDimensions(source,settings);let x=nx*w,y=ny*h;const r=-settings.rotation*Math.PI/180;return{x:x*Math.cos(r)-y*Math.sin(r)+source.width/2,y:x*Math.sin(r)+y*Math.cos(r)+source.height/2};}
function displayPoint(p){let x=p.x-source.width/2,y=p.y-source.height/2,r=settings.rotation*Math.PI/180;[x,y]=[x*Math.cos(r)-y*Math.sin(r),x*Math.sin(r)+y*Math.cos(r)];if(settings.mirror)x=-x;if(settings.flip)y=-y;const [w,h]=imageDimensions(source,settings);return{x:x/w+.5,y:y/h+.5};}
function paintAt(p){const radius=Number($('#brush-size').value)/2,opacity=Number($('#brush-opacity').value)/100;const sx=clonePoint.x+p.x-strokeAnchor.x,sy=clonePoint.y+p.y-strokeAnchor.y;cloneStamp(strokeData.data,strokeSnapshot,source.width,source.height,p.x,p.y,sx,sy,radius,opacity);}
function brushMove(e){if(tool!=='retouch'||view!=='lab')return;const holder=$('#image-holder'),rect=holder.getBoundingClientRect(),p=imagePoint(e),cursor=$('#brush-cursor');const [w]=imageDimensions(source,settings);const size=Number($('#brush-size').value)/w*rect.width;cursor.hidden=false;cursor.style.cssText=`left:${(e.clientX-rect.left)/rect.width*100}%;top:${(e.clientY-rect.top)/rect.height*100}%;width:${size}px;height:${size}px`;
  if(painting){const distance=Math.hypot(p.x-lastPoint.x,p.y-lastPoint.y),steps=Math.max(1,Math.ceil(distance/Math.max(1,Number($('#brush-size').value)/5)));for(let i=1;i<=steps;i++)paintAt({x:lastPoint.x+(p.x-lastPoint.x)*i/steps,y:lastPoint.y+(p.y-lastPoint.y)*i/steps});lastPoint=p;source.getContext('2d').putImageData(strokeData,0,0);scheduleRender();}
}
$('#image-holder').addEventListener('pointermove',brushMove);
$('#image-holder').addEventListener('pointerdown',e=>{if(tool!=='retouch'||view!=='lab'||!source)return;e.preventDefault();const p=imagePoint(e);if(e.altKey||sourcePicking){clonePoint=p;sourcePicking=false;const dp=displayPoint(p);$('#clone-marker').hidden=false;$('#clone-marker').style.left=`${dp.x*100}%`;$('#clone-marker').style.top=`${dp.y*100}%`;$('#clone-status').textContent='Source selected.';$('#pick-source').textContent='Sample source';return;}if(!clonePoint){toast('Alt-click to sample.');return;}remember();source=copyCanvas(source);strokeData=source.getContext('2d',{willReadFrequently:true}).getImageData(0,0,source.width,source.height);strokeSnapshot=strokeData.data.slice();strokeAnchor=p;lastPoint=p;painting=true;$('#image-holder').setPointerCapture(e.pointerId);paintAt(p);source.getContext('2d').putImageData(strokeData,0,0);scheduleRender();});
async function endStroke(){if(!painting)return;painting=false;strokeSnapshot=null;strokeData=null;}
$('#image-holder').addEventListener('pointerup',endStroke);$('#image-holder').addEventListener('pointercancel',endStroke);$('#image-holder').addEventListener('pointerleave',()=>{if(!painting)$('#brush-cursor').hidden=true;});
$('#pick-source').addEventListener('click',()=>{sourcePicking=true;$('#clone-status').textContent='Click to sample.';});
for(const key of ['size','opacity'])$(`#brush-${key}`).addEventListener('input',e=>{$(`#brush-${key}-value`).textContent=`${e.target.value}${key==='size'?' px':'%'}`;rangePaint(e.target);});
$('#clear-retouch').addEventListener('click',()=>{if(source===original){return;}remember();source=original;clonePoint=null;$('#clone-marker').hidden=true;scheduleRender();});


function drawCropPicker() {
  if(!source)return;const [w,h]=imageDimensions(source,settings),region=sampleRegion(w,h,sheet);
  const image=renderImage(source,settings,curve,'original',360),c=$('#crop-canvas');c.width=image.width;c.height=image.height;c.getContext('2d').drawImage(image,0,0);
  const scale=Math.min(($('#controls').clientWidth-40)/w,148/h),wrapper=$('#crop-image');wrapper.style.width=`${w*scale}px`;wrapper.style.height=`${h*scale}px`;
  $('#crop-box').style.cssText=`left:${region.x/w*100}%;top:${region.y/h*100}%;width:${region.w/w*100}%;height:${region.h/h*100}%`;
  $('#crop-picker').setAttribute('aria-valuenow',Math.round(sheet.cropX*100));
  $('#crop-picker').setAttribute('aria-valuetext',`${Math.round((region.x+region.w/2)/w*100)}% across, ${Math.round((region.y+region.h/2)/h*100)}% down`);
}
let cropDragging=false;
function moveCrop(e) {
  const rect=$('#crop-image').getBoundingClientRect();
  sheet.cropX=clamp((e.clientX-rect.left)/rect.width);sheet.cropY=clamp((e.clientY-rect.top)/rect.height);scheduleRender();
}
$('#crop-picker').addEventListener('pointerdown',e=>{if(!source)return;e.preventDefault();remember();cropDragging=true;$('#crop-picker').setPointerCapture(e.pointerId);moveCrop(e);});
$('#crop-picker').addEventListener('pointermove',e=>{if(cropDragging)moveCrop(e);});
$('#crop-picker').addEventListener('pointerup',()=>cropDragging=false);$('#crop-picker').addEventListener('pointercancel',()=>cropDragging=false);
$('#crop-picker').addEventListener('keydown',e=>{if(!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key))return;e.preventDefault();remember();if(e.key==='ArrowLeft'||e.key==='ArrowRight')sheet.cropX=clamp(sheet.cropX+(e.key==='ArrowRight'?.02:-.02));else sheet.cropY=clamp(sheet.cropY+(e.key==='ArrowDown'?.02:-.02));scheduleRender();});
$$('[data-layout]').forEach(b=>b.addEventListener('click',()=>{remember();sheet.layout=b.dataset.layout;syncControls();scheduleRender();}));
for(const [id,key]of [['variation-axis','axis'],['variation-axis2','axis2']])$(`#${id}`).addEventListener('change',e=>{
  remember();sheet[key]=e.target.value;const other=key==='axis'?'axis2':'axis';
  if(sheet[key]===sheet[other])sheet[other]=key==='axis'?'none':(sheet.axis2==='contrast'?'grain':'contrast');
  sheet[key==='axis'?'step':'step2']=e.target.value==='exposure'?.25:e.target.value==='grain'?20:15;syncControls();scheduleRender();
});
for(const n of ['', '2']) {
  const el=$(`#variation-step${n}`);el.addEventListener('pointerdown',remember);
  el.addEventListener('keydown',e=>{if(e.key.startsWith('Arrow')&&!e.repeat)remember();});
  el.addEventListener('input',()=>{sheet[`step${n}`]=Number(el.value);syncSteps();scheduleRender();});
}
$('#sheet-divider').addEventListener('change',e=>{remember();sheet.divider=Number(e.target.value);scheduleRender();});
function openVariant(v) {
  selectedVariant=v;$('#variation-title').textContent=`Test ${v.index}`;
  $('#variation-description').textContent=v.values.map(([key,value])=>adjustmentLabel(key,value)).join(' · ');
  const [w,h]=imageDimensions(source,settings),region=sampleRegion(w,h,sheet);
  const image=renderRegion(source,v.settings,curve,mode,region,sheet.printWidth,200),c=$('#variation-canvas');
  c.width=image.width;c.height=image.height;c.getContext('2d').drawImage(image,0,0);$('#variation-dialog').showModal();
}
$('#apply-variation').addEventListener('click',()=>{if(!selectedVariant)return;remember();settings={...selectedVariant.settings};tool='adjust';view='lab';$('#export-kind').value='image';syncControls();scheduleRender();$('#variation-dialog').close();});

for(const [id,paper]of Object.entries(PAPER_SIZES)){
  const option=document.createElement('option');option.value=id;option.textContent=paper.label;$('#export-paper').append(option);
}
const exactSizeOption=document.createElement('option');exactSizeOption.value='artwork';exactSizeOption.textContent='Image / sheet size';$('#export-paper').append(exactSizeOption);
function exportOptions(){return{kind:$('#export-kind').value,dpi:Number($('#export-dpi').value),polarity:$('#export-polarity').value,paper:$('#export-paper').value,orientation:$('#export-orientation').value,sheet:{...sheet}};}
function exportPlacement(options){return pageLayout(printDimensions(source,settings,options),options.paper,options.orientation);}
let exportPreviewFrame=0;
function exportSummary() {
  if(!source)return;const o=exportOptions(),layout=exportPlacement(o);
  $('#export-orientation').disabled=o.paper==='artwork';
  $('#export-summary').textContent=`${o.kind==='sheet'?'Sheet':'Image'}: ${layout.artwork.map(formatMM).join(' × ')} mm\nPage: ${layout.paper.map(formatMM).join(' × ')} mm\n${layout.paper.map(n=>mmToPx(n,o.dpi)).join(' × ')} px · ${o.dpi} DPI`;
  const tooLarge=mmToPx(layout.paper[0],o.dpi)*mmToPx(layout.paper[1],o.dpi)>36_000_000;
  const error=!layout.fits?'Doesn’t fit at 100%. Choose larger paper or change Print size.':tooLarge?'Page exceeds 36 megapixels. Choose a lower DPI.':'';
  $('#export-error').textContent=error;$('#export-error').hidden=!error;$('#download-export').disabled=!!error||busy;
  if(!exportPreviewFrame)exportPreviewFrame=requestAnimationFrame(()=>{exportPreviewFrame=0;drawExportPreview();});
}
function drawExportPreview(){
  if(!source||!$('#export-dialog').open)return;
  try{
    const options=exportOptions(),layout=exportPlacement(options);
    const dpi=Math.min(96,750/Math.max(...layout.paper,...layout.artwork)*25.4);
    const preview=renderExport(source,settings,curve,{...options,dpi},{allowOverflow:true}),target=$('#export-preview');
    target.width=preview.width;target.height=preview.height;target.getContext('2d').drawImage(preview,0,0);
    target.classList.toggle('does-not-fit',!layout.fits);fitExportPreview();
  }catch(e){$('#export-error').textContent=e.message;$('#export-error').hidden=false;$('#download-export').disabled=true;}
}
function fitExportPreview(){
  const stage=$('#export-preview-stage'),target=$('#export-preview');if(!target.width||!stage.clientWidth)return;
  const scale=Math.min((stage.clientWidth-40)/target.width,(stage.clientHeight-40)/target.height);
  target.style.width=`${target.width*scale}px`;target.style.height=`${target.height*scale}px`;
}
new ResizeObserver(fitExportPreview).observe($('#export-preview-stage'));
$$('.export-open').forEach(b=>b.addEventListener('click',()=>{if(!source)return;$('#export-dialog').showModal();exportSummary();}));
$$('#export-dialog select').forEach(el=>el.addEventListener('change',exportSummary));
$('#download-export').addEventListener('click',async()=>{
  if(busy||!source)return;busy=true;const button=$('#download-export');button.disabled=true;button.querySelector('span').textContent='Exporting…';$('#export-error').hidden=true;
  try {
    const o=exportOptions(),layout=exportPlacement(o);await new Promise(r=>setTimeout(r,30));
    const output=renderExport(source,settings,curve,o),format=$('#export-format').value;
    const blob=await(format==='pdf'?pdfBlob(output,layout.paper):pngBlob(output,o.dpi));
    const basename=sourceName.replace(/\.[^.]+$/,'').replace(/[^a-z0-9_-]/gi,'-')||'image';
    download(blob,`${basename}-${o.kind==='sheet'?'tests':'image'}-${o.paper}-${o.polarity}-${o.dpi}dpi.${format}`);
  } catch(e){$('#export-error').textContent=e.message;$('#export-error').hidden=false;}
  finally{
    busy=false;button.querySelector('span').textContent='Download';
    if(source){const options=exportOptions(),layout=exportPlacement(options);button.disabled=!layout.fits||mmToPx(layout.paper[0],options.dpi)*mmToPx(layout.paper[1],options.dpi)>36_000_000;}
  }
});

// Images and edits stay on this device, with the current workspace in IndexedDB.
let loadGeneration=0;
async function decodeImage(file) {
  return new Promise((resolve,reject)=>{
    const image=new Image(),url=URL.createObjectURL(file);
    image.onload=()=>{URL.revokeObjectURL(url);resolve(image);};
    image.onerror=()=>{URL.revokeObjectURL(url);reject(Error('Could not open this image.'));};image.src=url;
  });
}
function imageCanvas(image,notify=true) {
  const factor=Math.min(1,6000/Math.max(image.width,image.height),Math.sqrt(24_000_000/(image.width*image.height)));
  const c=canvas(image.width*factor,image.height*factor),ctx=c.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,c.width,c.height);ctx.drawImage(image,0,0,c.width,c.height);
  if(factor<1&&notify)toast(`Resized to ${c.width} × ${c.height} px.`);return c;
}
function copyCanvas(c){const out=canvas(c.width,c.height);out.getContext('2d').drawImage(c,0,0);return out;}
async function loadFile(file) {
  if(!file)return;const generation=++loadGeneration;
  if(!/^image\/(jpeg|png|webp|avif|bmp|x-ms-bmp)$/i.test(file.type)&&!/^.*\.(png|jpe?g|webp|avif|bmp)$/i.test(file.name)){toast('Choose a JPEG, PNG, WebP, AVIF, or BMP.',true);return;}
  try {
    const image=await decodeImage(file);if(generation!==loadGeneration)return;
    $('#export-dialog').close();$('#export-preview').width=1;$('#export-preview').height=1;
    source=original=imageCanvas(image);imageBlobs.set(original,Promise.resolve(file));sessionRevision++;
    sourceName=file.name;settings={...DEFAULTS};curve=clone(CURVES.linear);sheet={...SHEET_DEFAULTS};$('#export-kind').value='image';$('#export-polarity').value='negative';
    undoStack=[];redoStack=[];clearClone();view='lab';mode='negative';tool='adjust';zoom=1;compare=false;
    syncControls();updateHistory();scheduleRender();saveSession();
  } catch(e){toast(e.message,true);}
}
$$('.upload-trigger').forEach(b=>b.addEventListener('click',()=>$('#image-input').click()));
$('#image-input').addEventListener('change',e=>{loadFile(e.target.files[0]);e.target.value='';});
$('#close-image').addEventListener('click',()=>{
  loadGeneration++;sessionRevision++;source=null;original=null;sourceName='';undoStack=[];redoStack=[];selectedVariant=null;clearClone();
  for(const id of ['preview-canvas','variation-canvas','crop-canvas','export-preview']){const c=$('#'+id);c.width=1;c.height=1;}
  $('#sheet-preview').replaceChildren();$('#variant-list').replaceChildren();$('#source-name').textContent='';$('#source-dimensions').textContent='';updateHistory();updateView();
  pendingSession={revision:sessionRevision,state:null};void writeSession();
});
let dragDepth=0;
window.addEventListener('dragenter',e=>{if(e.dataTransfer?.types.includes('Files')){e.preventDefault();dragDepth++;$('#drop-overlay').hidden=false;}});
window.addEventListener('dragover',e=>{if(e.dataTransfer?.types.includes('Files'))e.preventDefault();});
window.addEventListener('dragleave',()=>{if(--dragDepth<=0){dragDepth=0;$('#drop-overlay').hidden=true;}});
window.addEventListener('drop',e=>{e.preventDefault();dragDepth=0;$('#drop-overlay').hidden=true;loadFile(e.dataTransfer?.files[0]);});
$$('[data-close]').forEach(b=>b.addEventListener('click',()=>$(`#${b.dataset.close}`).close()));
$$('dialog').forEach(d=>d.addEventListener('click',e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();}}));
window.addEventListener('keydown',e=>{
  if(!source||$('dialog[open]'))return;
  if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='z'){e.preventDefault();e.shiftKey?redo():undo();return;}
  if(['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName))return;
  if(e.key==='\\'&&!e.repeat){compare=true;updateView();scheduleRender();}
});
window.addEventListener('keyup',e=>{if(e.key==='\\'){compare=false;updateView();scheduleRender();}});
window.addEventListener('blur',()=>{if(compare){compare=false;updateView();scheduleRender();}});

const exportFields=['export-kind','export-paper','export-orientation','export-format','export-dpi','export-polarity'];
const imageBlobs=new WeakMap();
let sessionRevision=0,restoringSession=true,writingSession=false,pendingSession=null;
let savedSource=null,savedOriginal=null,savedSignature='',saveErrorShown=false;
const sessionStore=openSessionStore().catch(()=>null);

function sessionState(){
  return {version:1,sourceName,settings:{...settings},curve:clone(curve),sheet:{...sheet},sourceIsOriginal:source===original,
    view,mode,tool,unit,zoom,brush:{size:Number($('#brush-size').value),opacity:Number($('#brush-opacity').value)},
    export:Object.fromEntries(exportFields.map(id=>[id,$('#'+id).value]))};
}
function imageBlob(image){
  if(!imageBlobs.has(image))imageBlobs.set(image,new Promise((resolve,reject)=>image.toBlob(blob=>blob?resolve(blob):reject(Error('Could not save image data.')),'image/png')));
  return imageBlobs.get(image);
}
function saveSession(){
  if(restoringSession||!source||painting)return;
  const state=sessionState(),signature=JSON.stringify(state);
  if(!writingSession&&!pendingSession&&source===savedSource&&original===savedOriginal&&signature===savedSignature)return;
  pendingSession={revision:sessionRevision,state,source,original,signature};void writeSession();
}
async function writeSession(){
  if(writingSession)return;writingSession=true;
  try{
    const store=await sessionStore;
    if(!store)throw Error('Browser storage is unavailable.');
    while(pendingSession){
      const snapshot=pendingSession;pendingSession=null;
      if(!snapshot.state){await store.clear();savedSource=savedOriginal=null;savedSignature='';continue;}
      const images={};
      if(snapshot.original!==savedOriginal)images.original=await imageBlob(snapshot.original);
      if(snapshot.source!==snapshot.original&&snapshot.source!==savedSource)images.edited=await imageBlob(snapshot.source);
      if(snapshot.revision!==sessionRevision)continue;
      await store.write(snapshot.state,images);
      savedSource=snapshot.source;savedOriginal=snapshot.original;savedSignature=snapshot.signature;saveErrorShown=false;
    }
  }catch{
    pendingSession=null;
    if(source&&!saveErrorShown){saveErrorShown=true;toast('Browser storage couldn’t save this image. Refresh may lose changes.',true);}
  }finally{writingSession=false;}
}
async function restoreSession(){
  const generation=loadGeneration;
  try{
    const store=await sessionStore;if(!store)return;
    const saved=await store.read();if(!saved||generation!==loadGeneration)return;
    const state=validateSession(saved.state);
    if(!(saved.original instanceof Blob)||(!state.sourceIsOriginal&&!(saved.edited instanceof Blob)))throw Error('Missing saved image.');
    const originalImage=await decodeImage(saved.original),editedImage=state.sourceIsOriginal?null:await decodeImage(saved.edited);
    if(generation!==loadGeneration)return;
    original=imageCanvas(originalImage,false);source=editedImage?imageCanvas(editedImage,false):original;
    if(source.width!==original.width||source.height!==original.height)throw Error('Inconsistent saved image.');
    imageBlobs.set(original,Promise.resolve(saved.original));if(editedImage)imageBlobs.set(source,Promise.resolve(saved.edited));
    sourceName=state.sourceName;settings={...state.settings};curve=clone(state.curve);sheet={...state.sheet};
    view=['lab','sheet'].includes(state.view)?state.view:'lab';mode=['original','negative','proof'].includes(state.mode)?state.mode:'negative';
    tool=state.tool==='retouch'?'retouch':'adjust';unit=state.unit==='in'?'in':'mm';zoom=Number.isFinite(state.zoom)?clamp(state.zoom,.5,3):1;
    $('#brush-size').value=state.brush?.size||40;$('#brush-opacity').value=state.brush?.opacity||100;
    $('#brush-size-value').textContent=$('#brush-size').value+' px';$('#brush-opacity-value').textContent=$('#brush-opacity').value+'%';
    for(const id of exportFields){const value=state.export?.[id];if([...$('#'+id).options].some(option=>option.value===value))$('#'+id).value=value;}
    savedSource=source;savedOriginal=original;savedSignature=JSON.stringify(state);
    clearClone();syncControls();updateHistory();scheduleRender();
  }catch{
    if(generation===loadGeneration){source=original=null;updateView();toast('Couldn’t restore the saved image. Open it again.',true);}
  }finally{restoringSession=false;if(source)saveSession();}
}
for(const event of ['input','change','click','pointerup','pointercancel','keyup'])document.addEventListener(event,()=>queueMicrotask(saveSession));
window.addEventListener('pagehide',saveSession);
syncControls();void restoreSession();

import { SHEET_DEFAULTS } from './engine.js';

const ranges = { exposure:[-2,2], contrast:[-80,80], shadows:[-100,100], highlights:[-100,100], grain:[0,60] };

export function validateSession(state) {
  if(state?.version!==1||typeof state.sourceName!=='string'||!state.settings||!state.sheet)throw Error('Invalid saved session.');
  for(const [key,[min,max]]of Object.entries(ranges)){
    const value=state.settings[key];if(!Number.isFinite(value)||value<min||value>max)throw Error('Invalid saved adjustment.');
  }
  if(![0,90,180,270].includes(state.settings.rotation))throw Error('Invalid saved rotation.');
  if(['invert','mirror','flip'].some(key=>typeof state.settings[key]!=='boolean'))throw Error('Invalid saved orientation.');
  if(!Array.isArray(state.curve)||state.curve.length!==5||state.curve.some((p,i)=>!Array.isArray(p)||p.length!==2||p.some(v=>!Number.isFinite(v)||v<0||v>255)||(i&&p[0]<=state.curve[i-1][0]))||state.curve[0][0]!==0||state.curve[4][0]!==255)throw Error('Invalid saved curve.');
  const sheet=state.sheet;
  if(!['strip','grid6','grid9'].includes(sheet.layout)||!Object.hasOwn(ranges,sheet.axis)||(sheet.axis2!=='none'&&!Object.hasOwn(ranges,sheet.axis2)))throw Error('Invalid saved layout.');
  for(const key of Object.keys(SHEET_DEFAULTS).filter(key=>typeof SHEET_DEFAULTS[key]==='number'))if(!Number.isFinite(sheet[key]))throw Error('Invalid saved dimensions.');
  if(sheet.printWidth<10||sheet.printWidth>2000||sheet.tileWidth<=0||sheet.tileHeight<=0||sheet.tileWidth>2000||sheet.tileHeight>100000||sheet.divider<0||sheet.divider>.25||sheet.cropX<0||sheet.cropX>1||sheet.cropY<0||sheet.cropY>1||sheet.step<=0||sheet.step>40||sheet.step2<=0||sheet.step2>40)throw Error('Invalid saved dimensions.');
  return state;
}

const completed = transaction => new Promise((resolve,reject)=>{
  transaction.oncomplete=()=>resolve();
  transaction.onabort=transaction.onerror=()=>reject(transaction.error||Error('Browser storage is unavailable.'));
});

// One current workspace in browser storage. No files, remote requests, or library.
export async function openSessionStore(factory=globalThis.indexedDB) {
  if(!factory)throw Error('Browser storage is unavailable.');
  const db=await new Promise((resolve,reject)=>{
    const request=factory.open('image-prep',1);
    request.onupgradeneeded=()=>request.result.createObjectStore('session');
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error);
    request.onblocked=()=>reject(Error('Browser storage is busy.'));
  });
  db.onversionchange=()=>db.close();
  return {
    async read(){
      const transaction=db.transaction('session','readonly'),store=transaction.objectStore('session');
      const get=key=>new Promise((resolve,reject)=>{const request=store.get(key);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
      const [state,original,edited]=await Promise.all(['state','original','edited'].map(get));
      return state?{state,original,edited}:null;
    },
    write(state,images={}){
      const transaction=db.transaction('session','readwrite'),store=transaction.objectStore('session'),done=completed(transaction);
      try{
        if(images.original)store.put(images.original,'original');
        if(images.edited)store.put(images.edited,'edited');
        if(state.sourceIsOriginal)store.delete('edited');
        store.put(state,'state');
      }catch(error){transaction.abort();return done.catch(()=>{throw error;});}
      return done;
    },
    clear(){
      const transaction=db.transaction('session','readwrite'),done=completed(transaction);
      transaction.objectStore('session').clear();return done;
    },
    close(){db.close();},
  };
}

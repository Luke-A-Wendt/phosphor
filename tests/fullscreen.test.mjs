import test from 'node:test';
import assert from 'node:assert/strict';
import {FullscreenController} from '../fullscreen.js';

function fixture({supported=true,lock='allow',eventBeforeResolve=true,exitEventBeforeResolve=true}={}){
  let now=0,mode='menu',backCalls=0,homeCalls=0,requestCalls=0,exitCalls=0,lockCalls=0,focusCalls=0,requestOptions;
  const listeners=new Map(),classes=new Set(),notices=[];
  const view={performance:{now:()=>now},requestAnimationFrame:fn=>fn(),screen:{orientation:{lock:async()=>{},unlock(){}}},navigator:{keyboard:{async lock(keys){lockCalls++;assert.deepEqual(keys,['Escape']);if(lock==='deny')throw new Error('Denied');},unlock(){}}}};
  if(lock==='missing')delete view.navigator.keyboard;
  const doc={defaultView:view,fullscreenElement:null,querySelector:()=>null,addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name),async exitFullscreen(){exitCalls++;doc.fullscreenElement=null;if(exitEventBeforeResolve)emit();}};
  const element={ownerDocument:doc,classList:{add:c=>classes.add(c),remove:c=>classes.delete(c),contains:c=>classes.has(c)}};
  const emit=()=>listeners.get('fullscreenchange')?.();
  if(supported)element.requestFullscreen=async options=>{requestCalls++;requestOptions=options;doc.fullscreenElement=element;if(eventBeforeResolve)emit();};
  const controller=new FullscreenController({element,getMode:()=>mode,onBack:()=>{mode=mode==='test'?'settings':'menu';backCalls++;},onExit:()=>{mode='home';homeCalls++;},onNotice:n=>notices.push(n),focusElement:{focus(){focusCalls++;}},isMobile:()=>false});
  return {controller,doc,element,notices,emit,setMode:v=>mode=v,getMode:()=>mode,advance:ms=>now+=ms,browserExit(){doc.fullscreenElement=null;emit();},stats:()=>({backCalls,homeCalls,requestCalls,exitCalls,lockCalls,focusCalls,requestOptions})};
}
const settle=()=>new Promise(resolve=>setImmediate(resolve));

test('native fullscreen: game Escape returns to menu, root Escape exits home once',async()=>{
  const f=fixture();await f.controller.enter();await settle();
  assert.deepEqual(f.stats().requestOptions,{navigationUI:'hide',keyboardLock:'browser'});
  assert.equal(f.stats().lockCalls,1);assert.equal(f.controller.keyboardLocked,true);
  f.setMode('game');await f.controller.escape();
  assert.equal(f.getMode(),'menu');assert.equal(f.controller.native,true);assert.equal(f.stats().exitCalls,0);
  f.advance(100);await f.controller.escape();
  assert.equal(f.controller.isImmersive(),false);assert.equal(f.stats().exitCalls,1);assert.ok(f.stats().focusCalls>0);
  assert.equal(f.getMode(),'home');assert.equal(f.stats().homeCalls,1);
});

test('reserved Escape arriving before fullscreenchange retains expanded menu',async()=>{
  const f=fixture({lock:'deny'});await f.controller.enter();await settle();f.setMode('game');
  await f.controller.escape();f.browserExit();
  assert.equal(f.getMode(),'menu');assert.equal(f.controller.native,false);assert.equal(f.controller.expanded,true);
  assert.equal(f.stats().backCalls,1);assert.equal(f.stats().requestCalls,1,'must not auto-reenter native fullscreen');
  f.advance(200);await f.controller.escape();assert.equal(f.controller.isImmersive(),false);
});

test('reserved Escape arriving after fullscreenchange is not counted twice',async()=>{
  const f=fixture({lock:'missing'});await f.controller.enter();f.setMode('game');f.browserExit();
  assert.equal(f.getMode(),'menu');assert.equal(f.controller.expanded,true);
  await f.controller.escape();assert.equal(f.controller.expanded,true,'same key must not exit the expanded root');
  f.advance(200);await f.controller.escape();assert.equal(f.controller.expanded,false);
});

test('explicit exit never creates an expanded fallback and exits home once',async()=>{
  const f=fixture();await f.controller.enter();f.setMode('game');await f.controller.toggle();
  assert.equal(f.controller.isImmersive(),false);assert.equal(f.stats().exitCalls,1);assert.equal(f.stats().backCalls,0);
  assert.equal(f.getMode(),'home');assert.equal(f.stats().homeCalls,1);
});

test('fullscreen denial uses honest expanded view with two Escape levels',async()=>{
  const f=fixture({supported:false});await f.controller.enter();
  assert.equal(f.controller.native,false);assert.equal(f.controller.expanded,true);assert.match(f.notices.at(-1),/cannot hide/);
  f.setMode('game');await f.controller.escape();assert.equal(f.getMode(),'menu');assert.equal(f.controller.expanded,true);
  await f.controller.escape();assert.equal(f.controller.expanded,false);assert.equal(f.getMode(),'home');assert.equal(f.stats().homeCalls,1);
});

test('fullscreen event after request resolution does not request lock twice',async()=>{
  const f=fixture({eventBeforeResolve:false});await f.controller.enter();f.emit();await settle();
  assert.equal(f.stats().lockCalls,1);assert.equal(f.controller.native,true);
});

test('browser exits fullscreen from root without retaining an expanded view',async()=>{
  const f=fixture();await f.controller.enter();f.browserExit();assert.equal(f.controller.isImmersive(),false);
  assert.equal(f.getMode(),'home');assert.equal(f.stats().homeCalls,1);
});

test('holding Escape does not count as another app back action',async()=>{
  const f=fixture();await f.controller.enter();f.setMode('game');await f.controller.escape();
  await f.controller.escape({repeat:true});assert.equal(f.controller.native,true);assert.equal(f.stats().exitCalls,0);
});

test('test display goes back through settings and root before exiting home',async()=>{
  const f=fixture();await f.controller.enter();f.setMode('test');await f.controller.escape();
  assert.equal(f.getMode(),'settings');assert.equal(f.controller.native,true);
  await f.controller.escape();assert.equal(f.getMode(),'menu');assert.equal(f.controller.native,true);
  await f.controller.escape();assert.equal(f.controller.native,false);assert.equal(f.getMode(),'home');
  assert.equal(f.stats().backCalls,2);assert.equal(f.stats().homeCalls,1);
});

test('test keydown before native exit preserves settings without a second back',async()=>{
  const f=fixture({lock:'deny'});await f.controller.enter();f.setMode('test');
  await f.controller.escape();f.browserExit();
  assert.equal(f.getMode(),'settings');assert.equal(f.controller.expanded,true);assert.equal(f.stats().backCalls,1);
  // The first key was already handled, so the next press is valid immediately.
  await f.controller.escape();assert.equal(f.getMode(),'menu');assert.equal(f.stats().backCalls,2);
  await f.controller.escape();assert.equal(f.getMode(),'home');assert.equal(f.stats().homeCalls,1);
});

test('test native exit before keydown preserves settings without a second back',async()=>{
  const f=fixture({lock:'missing'});await f.controller.enter();f.setMode('test');f.browserExit();
  await f.controller.escape();
  assert.equal(f.getMode(),'settings');assert.equal(f.controller.expanded,true);assert.equal(f.stats().backCalls,1);
  f.advance(200);await f.controller.escape();assert.equal(f.getMode(),'menu');
  await f.controller.escape();assert.equal(f.getMode(),'home');assert.equal(f.stats().homeCalls,1);
});

test('a delayed fullscreen exit event cannot reset the home page twice',async()=>{
  const f=fixture({exitEventBeforeResolve:false});await f.controller.enter();await f.controller.leave();
  assert.equal(f.getMode(),'home');assert.equal(f.stats().homeCalls,1);
  f.emit();assert.equal(f.stats().homeCalls,1);assert.equal(f.controller.expanded,false);
});

test('Escape at home does nothing and a new session can exit home again',async()=>{
  const f=fixture();f.setMode('home');await f.controller.escape();assert.equal(f.stats().homeCalls,0);
  f.setMode('menu');await f.controller.enter();await f.controller.escape();
  assert.equal(f.stats().homeCalls,1);
  f.setMode('menu');await f.controller.enter();await f.controller.escape();
  assert.equal(f.stats().homeCalls,2);
});

test('leaving a pending entry exits any late native fullscreen result',async()=>{
  const f=fixture();let resolveRequest;
  f.element.requestFullscreen=()=>new Promise(resolve=>{resolveRequest=()=>{f.doc.fullscreenElement=f.element;f.emit();resolve();};});
  const pending=f.controller.enter();await f.controller.escape();
  assert.equal(f.getMode(),'home');resolveRequest();await pending;await settle();
  assert.equal(f.controller.isImmersive(),false);assert.equal(f.stats().homeCalls,1);assert.equal(f.stats().exitCalls,1);
});

test('late keyboard permission from an old session cannot unlock a new one',async()=>{
  const f=fixture();let resolveOld,unlocks=0;
  const keyboard=f.doc.defaultView.navigator.keyboard;
  keyboard.lock=()=>new Promise(resolve=>{resolveOld=resolve;});
  keyboard.unlock=()=>{unlocks++;};
  await f.controller.enter();await f.controller.leave();
  keyboard.lock=async()=>{};
  await f.controller.enter();await settle();
  assert.equal(f.controller.keyboardLocked,true);
  const before=unlocks;resolveOld();await settle();
  assert.equal(f.controller.keyboardLocked,true);assert.equal(unlocks,before);
});

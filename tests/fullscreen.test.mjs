import test from 'node:test';
import assert from 'node:assert/strict';
import {FullscreenController} from '../fullscreen.js';

function fixture({supported=true,lock='allow',eventBeforeResolve=true,exitEventBeforeResolve=true,beforeExit,mobile=false}={}){
  let now=0,mode='menu',backCalls=0,homeCalls=0,requestCalls=0,exitCalls=0,lockCalls=0,focusCalls=0,requestOptions,orientationLocks=0,orientationUnlocks=0;
  const listeners=new Map(),classes=new Set(),notices=[];
  const view={performance:{now:()=>now},requestAnimationFrame:fn=>fn(),screen:{orientation:{lock:async()=>{orientationLocks++;},unlock(){orientationUnlocks++;}}},navigator:{keyboard:{async lock(keys){lockCalls++;assert.deepEqual(keys,['Escape']);if(lock==='deny')throw new Error('Denied');},unlock(){}}}};
  if(lock==='missing')delete view.navigator.keyboard;
  const doc={defaultView:view,fullscreenElement:null,querySelector:()=>null,addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name),async exitFullscreen(){exitCalls++;doc.fullscreenElement=null;if(exitEventBeforeResolve)emit();}};
  const element={ownerDocument:doc,classList:{add:c=>classes.add(c),remove:c=>classes.delete(c),contains:c=>classes.has(c)}};
  const emit=()=>listeners.get('fullscreenchange')?.();
  if(supported)element.requestFullscreen=async options=>{requestCalls++;requestOptions=options;doc.fullscreenElement=element;if(eventBeforeResolve)emit();};
  const controller=new FullscreenController({element,getMode:()=>mode,onBack:()=>{mode=mode==='test'?'settings':'menu';backCalls++;},onExit:()=>{mode='home';homeCalls++;},beforeExit,onNotice:n=>notices.push(n),focusElement:{focus(){focusCalls++;}},isMobile:()=>mobile});
  return {controller,doc,element,notices,emit,setMode:v=>mode=v,getMode:()=>mode,advance:ms=>now+=ms,browserExit(){doc.fullscreenElement=null;emit();},stats:()=>({backCalls,homeCalls,requestCalls,exitCalls,lockCalls,focusCalls,requestOptions,orientationLocks,orientationUnlocks})};
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

test('beforeExit preserves native fullscreen for one pending power-off animation',async()=>{
  let finish,calls=0;
  const f=fixture({beforeExit:()=>{calls++;f.setMode('closing');return new Promise(resolve=>{finish=resolve;});}});
  await f.controller.enter();
  const first=f.controller.leave(),second=f.controller.leave();
  assert.equal(first,second);assert.equal(calls,1);assert.equal(f.controller.native,true);
  assert.equal(f.stats().homeCalls,0);assert.equal(f.stats().exitCalls,0);
  await f.controller.escape();assert.equal(calls,1);assert.equal(f.stats().backCalls,0,'closing is not a child screen');
  finish();await first;
  assert.equal(f.controller.native,false);assert.equal(f.stats().homeCalls,1);assert.equal(f.stats().exitCalls,1);
});

test('root Escape awaits power-off but child navigation never starts it',async()=>{
  let finish,calls=0;
  const f=fixture({beforeExit:()=>{calls++;return new Promise(resolve=>{finish=resolve;});}});
  await f.controller.enter();f.setMode('test');
  await f.controller.escape();await f.controller.escape();
  assert.equal(f.getMode(),'menu');assert.equal(calls,0);
  const pending=f.controller.escape();assert.equal(calls,1);assert.equal(f.controller.native,true);
  finish();await pending;assert.equal(f.getMode(),'home');
});

test('forced native exit bypasses power-off and exits home immediately',async()=>{
  let calls=0;
  const f=fixture({beforeExit:async()=>{calls++;}});
  await f.controller.enter();f.browserExit();
  assert.equal(calls,0);assert.equal(f.getMode(),'home');assert.equal(f.stats().homeCalls,1);
});

test('forced native exit during power-off delivers onExit only once',async()=>{
  let finish;
  const f=fixture({beforeExit:()=>{f.setMode('closing');return new Promise(resolve=>{finish=resolve;});}});
  await f.controller.enter();const pending=f.controller.leave();f.browserExit();
  assert.equal(f.getMode(),'home');assert.equal(f.stats().homeCalls,1);assert.equal(f.controller.expanded,false);
  finish();await pending;
  assert.equal(f.stats().homeCalls,1);assert.equal(f.stats().exitCalls,0);
});

test('expanded view remains visible until its power-off promise completes',async()=>{
  let finish;
  const f=fixture({supported:false,beforeExit:()=>new Promise(resolve=>{finish=resolve;})});
  await f.controller.enter();const pending=f.controller.leave();
  assert.equal(f.controller.expanded,true);assert.equal(f.stats().homeCalls,0);
  finish();await pending;assert.equal(f.controller.expanded,false);assert.equal(f.stats().homeCalls,1);
});

test('an older power-off cannot close a session opened after forced native exit',async()=>{
  let finish;
  const f=fixture({beforeExit:()=>{f.setMode('closing');return new Promise(resolve=>{finish=resolve;});}});
  await f.controller.enter();const oldExit=f.controller.leave();f.browserExit();
  f.setMode('menu');await f.controller.enter();finish();await oldExit;
  assert.equal(f.controller.native,true);assert.equal(f.getMode(),'menu');assert.equal(f.stats().homeCalls,1);
});

test('omitting beforeExit preserves immediate onExit timing',async()=>{
  const f=fixture();await f.controller.enter();const pending=f.controller.leave();
  assert.equal(f.getMode(),'home');assert.equal(f.stats().homeCalls,1);
  await pending;
});

test('a failed power-off animation does not trap the user in fullscreen',async()=>{
  const f=fixture({beforeExit:async()=>{throw new Error('Animation failed');}});
  await f.controller.enter();await f.controller.leave();
  assert.equal(f.controller.native,false);assert.equal(f.getMode(),'home');assert.equal(f.stats().homeCalls,1);
});

test('mobile exit can cancel a pending orientation request while preserving the power-off screen',async()=>{
  let oriented,finish;
  const f=fixture({mobile:true,lock:'missing',beforeExit:()=>{f.setMode('closing');return new Promise(resolve=>{finish=resolve;});}});
  f.doc.defaultView.screen.orientation.lock=()=>new Promise(resolve=>{oriented=resolve;});
  const entering=f.controller.enter();await settle();
  assert.equal(f.controller.native,true);assert.equal(f.controller.pending,true,'orientation still blocks a ready fullscreen presentation');
  const leaving=f.controller.escape();assert.equal(f.getMode(),'closing');assert.equal(f.stats().exitCalls,0);assert.equal(f.stats().orientationUnlocks,0);
  oriented();await entering;assert.equal(f.controller.native,true);assert.equal(f.getMode(),'closing');
  finish();await leaving;assert.equal(f.getMode(),'home');assert.equal(f.stats().homeCalls,1);assert.equal(f.stats().orientationUnlocks,1);assert.equal(f.controller.pending,false);
});

test('a late mobile fullscreen entry during shutdown does not acquire locks or skip the animation',async()=>{
  let entered,finish;
  const f=fixture({mobile:true,beforeExit:()=>{f.setMode('closing');return new Promise(resolve=>{finish=resolve;});}});
  f.element.requestFullscreen=()=>new Promise(resolve=>{entered=()=>{f.doc.fullscreenElement=f.element;f.emit();resolve();};});
  const entering=f.controller.enter(),leaving=f.controller.escape();
  assert.equal(f.getMode(),'closing');entered();await entering;await settle();
  assert.equal(f.controller.native,true);assert.equal(f.stats().homeCalls,0);assert.equal(f.stats().exitCalls,0);assert.equal(f.stats().lockCalls,0);assert.equal(f.stats().orientationLocks,0);
  finish();await leaving;assert.equal(f.getMode(),'home');assert.equal(f.controller.native,false);assert.equal(f.stats().exitCalls,1);assert.equal(f.stats().homeCalls,1);
});

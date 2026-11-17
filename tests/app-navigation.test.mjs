import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createGame,GAME_INFO,pixelText} from '../games.js';
import {FullscreenController} from '../fullscreen.js';
import {normalizeSettings} from '../display-settings.js';
import {SettingsScreen} from '../settings-screen.js';
import {drawControls,CONTROLS_DESCRIPTION} from '../controls-screen.js';
import {drawCalibration,TEST_PATTERNS} from '../calibration.js';
import {drawRoot,drawLaunch,GAME_HINTS} from '../interface.js';
import {movementCodes,InputState,MenuNavigation} from '../controls.js';
import {AudioEngine} from '../audio.js';
import {TouchKeys} from '../touch-keys.js';
import {PowerSequence,POWER_ON_SECONDS,POWER_OFF_SECONDS} from '../power-sequence.js';
import {solveViewportLayout} from '../viewport-layout.js';

class Events {
 constructor(){this.listeners=new Map();}
 addEventListener(type,fn){if(!this.listeners.has(type))this.listeners.set(type,[]);this.listeners.get(type).push(fn);}
 removeEventListener(type,fn){this.listeners.set(type,(this.listeners.get(type)||[]).filter(x=>x!==fn));}
 dispatch(type,event={}){event.preventDefault??=()=>{};for(const fn of this.listeners.get(type)||[])fn(event);}
}
class AudioParam {
 constructor(value=0){this.value=value;}
 setValueAtTime(value){assert.ok(Number.isFinite(value));this.value=value;}
 linearRampToValueAtTime(value){this.setValueAtTime(value);}
 exponentialRampToValueAtTime(value){assert.ok(value>0);this.setValueAtTime(value);}
 setTargetAtTime(value){this.setValueAtTime(value);}
 cancelScheduledValues(){}
}
class AudioNode {
 constructor(kind){this.kind=kind;this.connections=[];for(const key of ['frequency','gain','Q','threshold','knee','ratio','attack','release'])this[key]=new AudioParam(key==='gain'?1:0);}
 connect(node){this.connections.push(node);return node;}
 disconnect(){this.connections=[];}
 start(time=0){this.started=time;}
 stop(time=0){this.stopped=time;}
}
class AudioContext extends Events {
 constructor(){super();this.currentTime=0;this.sampleRate=24000;this.state='suspended';this.nodes=[];this.destination={};this.resumes=0;}
 node(kind){const node=new AudioNode(kind);this.nodes.push(node);return node;}
 createGain(){return this.node('gain');}createOscillator(){return this.node('osc');}createBiquadFilter(){return this.node('filter');}createBufferSource(){return this.node('noise');}createDynamicsCompressor(){return this.node('compressor');}
 createBuffer(_channels,count,rate){const data=new Float32Array(count);return {getChannelData:()=>data,duration:count/rate};}
 async resume(){this.resumes++;await Promise.resolve();this.state='running';this.dispatch('statechange');this.onstatechange?.();}
 async close(){this.state='closed';}
 advance(dt){if(this.state!=='running')return;this.currentTime+=dt;for(const node of this.nodes)if(!node.ended&&node.stopped!==undefined&&node.stopped<=this.currentTime){node.ended=true;node.onended?.();}}
 connected(source,seen=new Set()){if(source===this.destination)return true;if(seen.has(source))return false;seen.add(source);return source.connections?.some(node=>this.connected(node,seen))||false;}
}
function harness({mobile=false,width=800,height=400,viewport={},safeArea={},reducedMotion=false,hidden=false,pendingOrientation=false,pendingFullscreen=false}={}){
 const doc=new Events(),win=new Events(),elements=new Map(),storage=new Map(),raf=[];
 const audioContext=new AudioContext(),voices=[],soundEvents=[],renderedPowers=[];
 class TestAudioEngine extends AudioEngine {
  constructor(){super({contextFactory:()=>audioContext,random:()=>.5});}
  _track(...args){const voice=super._track(...args);voices.push(voice);return voice;}
  gameSound(id,event){soundEvents.push({id,event,time:audioContext.currentTime});return super.gameSound(id,event);}
 }
 let focus=null,destroyed=0,historyDepth=0,now=0,pointTarget=null,resizeCount=0,resolveFullscreen=null,keyboardLocks=0,orientationLocks=0;
 const context2d=()=>new Proxy({},{get(target,key){return key in target?target[key]:(..._args)=>{};},set(target,key,val){target[key]=val;return true;}});
 class Element extends Events{
  constructor(id=''){super();this.id=id;this.ownerDocument=doc;this.hidden=false;this.disabled=false;this.dataset={};this.attributes={};this.ctx=context2d();const classes=new Set(),styles=new Map();this.classList={add:k=>classes.add(k),remove:k=>classes.delete(k),contains:k=>classes.has(k),toggle:(k,on)=>{if(on===undefined)on=!classes.has(k);if(on)classes.add(k);else classes.delete(k);return on;}};this.style={setProperty:(key,value)=>styles.set(key,String(value)),getPropertyValue:key=>styles.get(key)||''};}
  setAttribute(k,v){this.attributes[k]=v;}
  focus(){if(!this.disabled&&!this.hidden)focus=this.id;}
  getContext(){return this.ctx;}
  setPointerCapture(){}
  closest(selector){return selector==='[data-key]'&&this.dataset.key?this:null;}
  contains(element){return this===element||this.id==='touch-controls'&&Boolean(element?.dataset.key);}
  querySelectorAll(selector){return selector==='[data-key]'?[...elements.values()].filter(e=>e.dataset.key):[];}
  getBoundingClientRect(){return {left:0,top:0,width:100,height:100};}
 }
 const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
 for(const [,id] of html.matchAll(/id="([^"]+)"/g))elements.set(id,new Element(id));
 for(const [,id,key] of html.matchAll(/<button[^>]*id="([^"]+)"[^>]*data-key="([^"]+)"/g))elements.get(id).dataset.key=key;
 elements.get('arcade').hidden=true;elements.get('arcade').dataset.mode='home';
 doc.querySelector=selector=>selector==='dialog[open]'?null:elements.get(selector.slice(1))||null;
 doc.elementFromPoint=()=>pointTarget;doc.createElement=()=>new Element();doc.hidden=hidden;doc.fullscreenElement=null;doc.defaultView=win;
 const app=elements.get('arcade');
 app.requestFullscreen=async()=>{
  const complete=()=>{doc.fullscreenElement=app;doc.dispatch('fullscreenchange');};
  if(pendingFullscreen)await new Promise(resolve=>{resolveFullscreen=()=>{complete();resolve();};});else complete();
 };
 doc.exitFullscreen=async()=>{doc.fullscreenElement=null;doc.dispatch('fullscreenchange');};
 win.innerHeight=height;win.innerWidth=width;win.performance={now:()=>now};
 win.getComputedStyle=element=>({getPropertyValue:key=>key.startsWith('--safe-')?String(safeArea[key.slice(7)]??0)+'px':element.style.getPropertyValue(key)});
 win.navigator={keyboard:{lock:async()=>{keyboardLocks++;},unlock(){}}};win.screen={orientation:{lock:async()=>{orientationLocks++;if(pendingOrientation)await new Promise(()=>{});},unlock(){}}};
 win.requestAnimationFrame=fn=>raf.push(fn);win.visualViewport=viewport===null?null:Object.assign(new Events(),{width,height,offsetLeft:0,offsetTop:0},viewport);
 const history={pushState(){historyDepth++;},back(){historyDepth--;queueMicrotask(()=>win.dispatch('popstate'));}};
 const media=new Map();
 function matchMedia(query){if(!media.has(query)){const entry=new Events();entry.matches=query==='(any-pointer: coarse)'?mobile:query==='(prefers-reduced-motion: reduce)'?reducedMotion:false;media.set(query,entry);}return media.get(query);}
 class CRTStub{constructor(canvas){this.canvas=canvas;this.backend='WebGL test stub';}setOptions(o){this.options={...o};}setPower(p){this.power={...p};}resize(){resizeCount++;}render(){renderedPowers.push({...this.power});}destroy(){destroyed++;}}
 const sandbox={document:doc,window:win,navigator:win.navigator,screen:win.screen,history,matchMedia,requestAnimationFrame:win.requestAnimationFrame,localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)},console,Date,createGame,GAME_INFO,pixelText,CRTDisplay:CRTStub,FullscreenController,normalizeSettings,SettingsScreen,drawControls,CONTROLS_DESCRIPTION,drawCalibration,TEST_PATTERNS,drawRoot,drawLaunch,GAME_HINTS,movementCodes,InputState,MenuNavigation,AudioEngine:TestAudioEngine,TouchKeys,PowerSequence,solveViewportLayout};
 const context=vm.createContext(sandbox);
 const source=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'');
 vm.runInContext('"use strict";\n'+source,context,{filename:'app.js'});
 const run=code=>vm.runInContext(code,context);
 const tick=()=>run('tick(1/120);draw();');
 const keyDown=code=>doc.dispatch('keydown',{code,repeat:false,target:elements.get('screen')});
 const keyUp=code=>doc.dispatch('keyup',{code,target:elements.get('screen')});
 const key=code=>{keyDown(code);tick();keyUp(code);tick();};
 const settle=()=>new Promise(resolve=>setImmediate(resolve));
 const advance=async(seconds)=>{for(let n=0;n<Math.ceil(seconds*60);n++){now+=1000/60;audioContext.advance(1/60);run('frame('+now+');');await Promise.resolve();}await settle();};
 const advanceAtRate=async(seconds,fps=60)=>{let remaining=seconds;while(remaining>1e-9){const dt=Math.min(remaining,1/fps);remaining-=dt;now+=dt*1000;audioContext.advance(dt);run('frame('+now+');');await Promise.resolve();}await settle();};
 const finishClose=async()=>{await settle();if(app.dataset.mode==='closing')await advance(POWER_OFF_SECONDS+.1);};
 return {elements,doc,win,media,history,run,tick,key,keyDown,keyUp,settle,advance,advanceAtRate,audioContext,voices,soundEvents,renderedPowers,mode:()=>app.dataset.mode,destroyed:()=>destroyed,resized:()=>resizeCount,focus:()=>focus,depth:()=>historyDepth,locks:()=>({keyboard:keyboardLocks,orientation:orientationLocks}),
  async launch({warm=true}={}){elements.get('open-phosphor').dispatch('click');await settle();await advance(warm?POWER_ON_SECONDS+.1:1/60);},
  async resolveFullscreen(){assert.ok(resolveFullscreen,'a fullscreen request is pending');resolveFullscreen();await settle();},
  async escape({finish=true}={}){doc.dispatch('keydown',{code:'Escape',repeat:false,target:elements.get('screen')});if(finish)await finishClose();else await settle();},
  async back({finish=true}={}){history.back();if(finish)await finishClose();else await settle();},
  touchDown(id,pointerId=1){pointTarget=elements.get(id);elements.get('touch-controls').dispatch('pointerdown',{target:pointTarget,pointerId,button:0});},
  touchUp(pointerId=1){elements.get('touch-controls').dispatch('pointerup',{pointerId});},
  touchCancel(pointerId=1){elements.get('touch-controls').dispatch('pointercancel',{pointerId});},
  async mobileBack(){elements.get('touch-controls').dispatch('pointerdown',{target:elements.get('menu-back'),pointerId:90,button:0});await finishClose();}
 };
}

test('mobile layout switches immediately, preserves keys and Escape, and resets on exit',async()=>{
 for(const [width,height] of [[780,312],[312,780]]){
  const h=harness({mobile:true,width,height});await h.launch();
  const style=h.elements.get('arcade').style;
  const geometry=()=>Object.fromEntries(['screen-x','screen-y','screen-width','screen-height','key-size','key-gap','escape-x','escape-y','arrows-x','enter-x','enter-height'].map(key=>[key,style.getPropertyValue('--'+key)]));
  const original=geometry(),keys=['key-up','key-left','key-down','key-right','action','menu-back'].map(id=>h.elements.get(id));
  h.key('ArrowUp');h.key('Enter');assert.equal(h.mode(),'settings');
  h.run("settings.index=settings.rows.findIndex(row=>row.key==='arrowsRight')");
  // Use the actual touch action key to move the controls while it is pressed.
  h.touchDown('action');h.tick();assert.equal(h.run('options.arrowsRight'),true);
  assert.ok(h.elements.get('action').classList.contains('held'));
  h.touchUp();h.tick();assert.equal(h.elements.get('action').classList.contains('held'),false);
  assert.equal(h.run('input.down.size'),0);
  const swapped=geometry();
  for(const key of Object.keys(original).filter(key=>!['screen-x','arrows-x','enter-x'].includes(key)))assert.equal(swapped[key],original[key],key);
  assert.equal(swapped['enter-x'],original['arrows-x']);
  assert.ok(parseFloat(swapped['screen-x'])<parseFloat(original['screen-x']));
  assert.ok(parseFloat(swapped['arrows-x'])>parseFloat(swapped['screen-x']));
  h.win.visualViewport.dispatch('resize');assert.deepEqual(geometry(),swapped);
  await h.mobileBack();assert.equal(h.mode(),'menu');
  const before=h.run('menu.index'),voicesBefore=h.voices.length;
  h.touchDown('key-down');h.tick();assert.equal(h.run('menu.index'),(before+1)%(GAME_INFO.length+1));
  assert.ok(h.elements.get('key-down').classList.contains('held'));assert.ok(h.voices.length>voicesBefore,'the same keyboard sound handler runs');
  h.touchUp();h.tick();assert.equal(h.elements.get('key-down').classList.contains('held'),false);
  h.touchDown('action');h.tick();h.touchUp();h.tick();assert.equal(h.mode(),'game');
  await h.mobileBack();assert.equal(h.mode(),'menu');assert.deepEqual(geometry(),swapped);
  for(const key of keys)assert.equal(h.elements.get(key.id),key,'existing key elements are retained');
  await h.mobileBack();assert.equal(h.mode(),'home');assert.equal(h.run('options.arrowsRight'),false);assert.deepEqual(geometry(),original);
 }
});

test('launch starts only the root menu; game and settings navigation clear held input',async()=>{
 const h=harness();assert.equal(h.mode(),'home');assert.equal(h.elements.get('launcher').hidden,false);assert.equal(h.elements.get('arcade').hidden,true);
 await h.launch();assert.equal(h.mode(),'menu');assert.equal(h.elements.get('launcher').hidden,true);assert.equal(h.elements.get('arcade').hidden,false);assert.equal(h.depth(),1);
 h.key('Space');assert.equal(h.mode(),'game');assert.equal(h.run('game.status'),'playing');assert.equal(h.run('input.down.size'),0);assert.equal(h.run('input.pressed.size'),0);
 await h.escape();assert.equal(h.mode(),'menu');assert.ok(h.doc.fullscreenElement,'first Escape retains native fullscreen with lock');
 h.key('ArrowUp');h.key('Space');assert.equal(h.mode(),'settings');assert.equal(h.run('input.down.size'),0);
 h.run("settings.index=settings.rows.findIndex(row=>row.key==='ambient')");h.key('ArrowRight');assert.ok(h.run('options.ambient')>normalizeSettings().ambient);
 await h.escape();assert.equal(h.mode(),'menu');assert.ok(h.run('options.ambient')>normalizeSettings().ambient,'settings persist within this launch');
 await h.escape();assert.equal(h.mode(),'home');assert.equal(h.elements.get('arcade').hidden,true);assert.equal(h.elements.get('launcher').hidden,false);assert.equal(h.elements.get('open-phosphor').disabled,false);assert.equal(h.focus(),'open-phosphor','launcher regains keyboard focus after history cleanup');assert.equal(h.destroyed(),1);assert.equal(h.doc.fullscreenElement,null);assert.equal(h.depth(),0);assert.equal(h.run('options.ambient'),normalizeSettings().ambient);
 await h.launch();assert.equal(h.mode(),'menu');assert.equal(h.run('settings.index'),0);assert.equal(h.run('options.ambient'),normalizeSettings().ambient);
});

test('calibration returns to in-screen settings, then menu, then launcher',async()=>{
 const h=harness();await h.launch();h.key('ArrowUp');h.key('Space');assert.equal(h.mode(),'settings');
 h.run("settings.index=settings.rows.findIndex(row=>row.key==='test')");h.key('Space');assert.equal(h.mode(),'test');
 h.key('Space');assert.equal(h.run('testPattern'),1);
 await h.escape();assert.equal(h.mode(),'settings');assert.match(h.run('settings.selectionLabel'),/DISPLAY TEST/);
 await h.escape();assert.equal(h.mode(),'menu');await h.escape();assert.equal(h.mode(),'home');assert.equal(h.run('testPattern'),0);
});

test('mobile ESC and history Back follow the same navigation levels without leaving stale history',async()=>{
 const h=harness({mobile:true});await h.launch();h.key('Space');assert.equal(h.mode(),'game');
 await h.mobileBack();assert.equal(h.mode(),'menu');
 h.key('ArrowUp');h.key('Space');h.run("settings.index=settings.rows.findIndex(row=>row.key==='test')");h.key('Space');assert.equal(h.mode(),'test');
 await h.back();assert.equal(h.mode(),'settings');assert.equal(h.depth(),1);
 await h.back();assert.equal(h.mode(),'menu');assert.equal(h.depth(),1);
 await h.back();assert.equal(h.mode(),'home');assert.equal(h.depth(),0);assert.equal(h.elements.get('arcade').hidden,true);
});

test('mobile portrait opens directly and key cancellation clears touch input',async()=>{
 const h=harness({mobile:true});h.media.get('(orientation: portrait)').matches=true;h.win.dispatch('resize');assert.equal(h.run('blocked'),false);
 await h.launch();assert.equal(h.run('blocked'),false);
 h.media.get('(orientation: portrait)').matches=false;h.win.dispatch('resize');await h.advance(POWER_ON_SECONDS+.1);h.key('Space');assert.equal(h.mode(),'game');
 h.touchDown('key-right');assert.ok(h.run("input.down.has('ArrowRight')"));assert.ok(h.elements.get('key-right').classList.contains('held'));
 h.touchCancel();assert.equal(h.run('input.down.size'),0);assert.equal(h.elements.get('key-right').classList.contains('held'),false);
});

test('startup blocks game input, then Enter starts a game and shutdown completes before hiding the screen',async()=>{
 const h=harness();await h.launch({warm:false});
 assert.equal(h.run('power.phase'),'starting');assert.equal(h.run('sound.powered'),true);
 h.key('Enter');assert.equal(h.mode(),'menu','startup consumes no action');
 await h.advance(POWER_ON_SECONDS+.1);assert.equal(h.run('power.phase'),'on');assert.equal(h.mode(),'menu','no stale startup action');
 h.key('Enter');assert.equal(h.mode(),'game');assert.equal(h.run('sound.scene'),'tetris');assert.equal(h.run('sound.active'),true);
 await h.escape();assert.equal(h.mode(),'menu');assert.equal(h.run('sound.active'),false);
 await h.escape({finish:false});assert.equal(h.mode(),'closing');assert.equal(h.run('power.phase'),'stopping');assert.equal(h.elements.get('arcade').hidden,false);assert.equal(h.destroyed(),0);
 await h.advance(POWER_OFF_SECONDS+.1);assert.equal(h.mode(),'home');assert.equal(h.run('power.phase'),'off');assert.equal(h.run('sound.powered'),false);assert.equal(h.destroyed(),1);
});

test('mobile keys permit simultaneous steering and action; audio settings update the engine and reset on reopening',async()=>{
 const h=harness({mobile:true});await h.launch();h.key('Enter');
 h.touchDown('key-left',1);h.touchDown('action',2);
 assert.ok(h.run("input.down.has('ArrowLeft')&&input.down.has('Space')"));
 h.touchCancel(1);assert.equal(h.run("input.down.has('ArrowLeft')"),false);assert.ok(h.run("input.down.has('Space')"));
 h.touchUp(2);assert.equal(h.run('input.down.size'),0);
 await h.mobileBack();h.key('ArrowUp');h.key('Enter');assert.equal(h.mode(),'settings');
 h.run("settings.index=settings.rows.findIndex(row=>row.key==='musicVolume')");assert.match(h.run('settings.selectionLabel'),/^MUSIC:/);
 h.key('ArrowLeft');assert.ok(h.run('options.musicVolume')<normalizeSettings().musicVolume);assert.ok(h.run('options.musicVolume')>0);assert.equal(h.run('sound.options.musicVolume'),h.run('options.musicVolume'));
 await h.mobileBack();await h.mobileBack();assert.equal(h.mode(),'home');
 await h.launch();assert.equal(h.run('sound.options.musicVolume'),normalizeSettings().musicVolume);
});

test('hardware Back during startup cancels cleanly and does not reopen a late game',async()=>{
 const h=harness({mobile:true});await h.launch({warm:false});await h.back();
 assert.equal(h.mode(),'home');assert.equal(h.depth(),0);assert.equal(h.run('power.phase'),'off');
 await h.advance(1.5);assert.equal(h.mode(),'home');assert.equal(h.doc.fullscreenElement,null);
});

test('hardware Back during an already requested shutdown does not cause an extra history back',async()=>{
 const h=harness({mobile:true});await h.launch();await h.escape({finish:false});assert.equal(h.mode(),'closing');
 await h.back({finish:false});assert.equal(h.depth(),0);
 await h.advance(POWER_OFF_SECONDS+.1);assert.equal(h.mode(),'home');assert.equal(h.depth(),0,'shutdown must not pop history a second time');
});

test('three launches replay monitor on and off audio, including stale visibility and interrupted contexts',async()=>{
 const h=harness();
 for(let cycle=0;cycle<3;cycle++){
  if(cycle===1){h.doc.hidden=true;h.doc.dispatch('visibilitychange');h.doc.hidden=false;}
  if(cycle===2)h.audioContext.state='interrupted';
  const begin=h.voices.length,resumes=h.audioContext.resumes;
  await h.launch({warm:false});
  assert.equal(h.run('sound.hidden'),false,'launch refreshes visibility even without a visibilitychange event');
  assert.equal(h.audioContext.state,'running');
  if(cycle!==1)assert.ok(h.audioContext.resumes>resumes,'gesture resumes initial or interrupted audio');
  const on=h.voices.slice(begin).filter(v=>v.tag==='monitor');
  assert.ok(on.some(v=>v.source.kind==='osc')&&on.some(v=>v.source.kind==='noise'),'every launch synthesizes the monitor startup');
  assert.ok(on.every(v=>h.audioContext.connected(v.source)),'startup sources reach the output');
  assert.ok(h.run('sound.loops.length')>0,'monitor hum restarts');
  await h.advance(POWER_ON_SECONDS+.1);
  const beforeOff=h.voices.length;await h.escape({finish:false});
  const off=h.voices.slice(beforeOff).filter(v=>v.tag==='monitor');
  assert.ok(off.some(v=>v.source.kind==='osc')&&off.some(v=>v.source.kind==='noise'),'every close synthesizes shutdown');
  assert.ok(off.every(v=>h.audioContext.connected(v.source)),'shutdown sources reach the output');
  assert.equal(h.run('sound.loops.length'),0);await h.advance(POWER_OFF_SECONDS+.1);
  assert.equal(h.mode(),'home');assert.equal(h.run('sound.voices.size'),0,'finished sessions leave no active transient sources');assert.equal(h.depth(),0);
 }
 assert.equal(h.destroyed(),3);
});

test('keyboard and touch gestures recover suspended and interrupted audio in a running session',async()=>{
 const h=harness({mobile:true});await h.launch();
 for(const state of ['suspended','interrupted']){
  h.audioContext.state=state;const resumes=h.audioContext.resumes,start=h.voices.length;
  h.key('ArrowDown');await h.settle();
  assert.equal(h.audioContext.state,'running');assert.ok(h.audioContext.resumes>resumes);
  assert.ok(h.voices.slice(start).some(v=>v.tag==='keyboard'&&h.audioContext.connected(v.source)),'the recovery key itself still sounds');
 }
 h.doc.hidden=true;h.doc.dispatch('visibilitychange');h.doc.hidden=false;h.audioContext.state='interrupted';
 const start=h.voices.length;
 h.touchDown('key-up');await h.settle();h.touchUp();
 assert.equal(h.run('sound.hidden'),false);assert.equal(h.audioContext.state,'running');assert.ok(h.run('sound.loops.length')>0);
 assert.ok(h.voices.slice(start).some(v=>v.tag==='keyboard'&&h.audioContext.connected(v.source)),'the recovery touch itself still sounds');
});

test('actual Lander input generates thrust and crash audio after reopening the app',async()=>{
 const h=harness();await h.launch();await h.escape();await h.launch();
 for(let n=0;n<GAME_INFO.findIndex(game=>game.id==='lander');n++)h.key('ArrowDown');
 h.key('Space');assert.equal(h.run('game.id'),'lander');assert.equal(h.run('game.status'),'playing');
 await h.advance(.5);
 h.keyDown('Space');await h.advance(.2);h.keyUp('Space');
 assert.ok(h.run('game.ship.fuel')<100);assert.equal(h.run('game.thrust'),true);
 const thrust=h.run("sound.continuous.get('thrust')");
 assert.ok(thrust?.source.loop&&h.audioContext.connected(thrust.source),'holding thrust produces a continuous connected engine voice');
 await h.advance(.12);assert.equal(h.run("sound.continuous.has('thrust')"),false);assert.equal(h.audioContext.connected(thrust.source),false,'release disposes the engine source after its short fade');
 const crashStart=h.voices.length;
 for(let n=0;n<70&&h.run('game.phase')==='flight';n++)await h.advance(.1);
 assert.equal(h.run('game.phase'),'crashed');assert.ok(h.soundEvents.some(e=>e.id==='lander'&&e.event==='lose'));
 assert.ok(h.voices.slice(crashStart).some(v=>v.tag==='game'&&v.source.kind==='noise'&&h.audioContext.connected(v.source)),'collision tick produces a connected crash tail');
 h.key('Space');h.keyDown('Space');await h.advance(.1);
 const restarted=h.run("sound.continuous.get('thrust')");assert.ok(restarted);
 h.win.dispatch('blur');await h.advance(.1);assert.equal(h.run('paused'),true);assert.equal(h.run("sound.continuous.has('thrust')"),false);assert.equal(h.audioContext.connected(restarted.source),false,'pausing clears an engine that was still held');
 h.key('Space');h.keyDown('Space');await h.advance(.1);assert.ok(h.run("sound.continuous.has('thrust')"));
 await h.escape();await h.advance(.1);assert.equal(h.mode(),'menu');assert.equal(h.run('sound.continuous.size'),0,'returning to menu clears continuous effects');
});

test('actual Tanks aiming and fire inputs generate shell and impact audio',async()=>{
 const h=harness();await h.launch();
 for(let n=0;n<GAME_INFO.findIndex(game=>game.id==='tanks');n++)h.key('ArrowDown');
 h.key('Space');assert.equal(h.run('game.id'),'tanks');await h.advance(.5);
 h.keyDown('ArrowRight');await h.advance(.85);h.keyUp('ArrowRight');
 h.keyDown('ArrowDown');await h.advance(.4);h.keyUp('ArrowDown');
 h.audioContext.state='interrupted';const fireStart=h.voices.length;h.key('Space');await h.settle();assert.ok(h.run('game.shot'));
 assert.ok(h.soundEvents.some(e=>e.id==='tanks'&&e.event==='shoot'));
 assert.ok(h.voices.slice(fireStart).some(v=>v.tag==='game'&&v.source.kind==='noise'&&h.audioContext.connected(v.source)),'firing input produces the cannon sound');
 const impactStart=h.voices.length;
 for(let n=0;n<80&&!h.run('game.blast');n++)await h.advance(.05);
 assert.ok(h.run('game.blast'),'controlled short shot strikes the terrain');await h.advance(1/60);
 assert.ok(h.soundEvents.some(e=>e.id==='tanks'&&e.event==='hit'));
 assert.ok(h.voices.slice(impactStart).some(v=>v.tag==='game'&&v.source.kind==='noise'&&h.audioContext.connected(v.source)),'shell impact produces a connected explosion voice');
});

test('Invaders movement drives connected march audio and pausing stops both',async()=>{
 const h=harness();await h.launch();
 for(let n=0;n<GAME_INFO.findIndex(game=>game.id==='invaders');n++)h.key('ArrowDown');
 h.key('Space');assert.equal(h.run('game.id'),'invaders');
 let steps=0;
 for(let frame=0;frame<100;frame++){
  const before=h.run('game.aliens[0].x+":"+game.aliens[0].y'),eventStart=h.soundEvents.length,voiceStart=h.voices.length;
  await h.advance(1/60);
  const moved=before!==h.run('game.aliens[0].x+":"+game.aliens[0].y');
  const march=h.soundEvents.slice(eventStart).filter(event=>event.id==='invaders'&&event.event==='march');
  assert.equal(march.length,Number(moved));
  if(moved){steps++;assert.ok(h.voices.slice(voiceStart).some(voice=>voice.tag==='game'&&h.audioContext.connected(voice.source)),'formation event reaches the audio graph');}
 }
 assert.ok(steps>=3);h.win.dispatch('blur');
 const eventCount=h.soundEvents.length,position=h.run('game.aliens[0].x+":"+game.aliens[0].y');
 await h.advance(.6);assert.equal(h.soundEvents.length,eventCount);assert.equal(h.run('game.aliens[0].x+":"+game.aliens[0].y'),position);
 assert.equal(h.run('sound.active'),false);
});

test('launcher identifies click or tap on first load and responds to input-device changes',()=>{
 for(const mobile of [false,true]){
  const h=harness({mobile});
  const label=()=>h.elements.get('launch-label').textContent.toUpperCase();
  const accessible=()=>h.elements.get('open-phosphor').attributes['aria-label'].toUpperCase();
  assert.equal(label(),mobile?'TAP HERE':'CLICK HERE');assert.equal(accessible(),label());
  h.media.get('(any-pointer: coarse)').matches=!mobile;h.media.get('(any-pointer: coarse)').dispatch('change');
  assert.equal(label(),mobile?'CLICK HERE':'TAP HERE');assert.equal(accessible(),label());assert.equal(h.mode(),'home');assert.equal(h.depth(),0);
 }
});

test('visual viewport dimensions and offsets update both launcher and arcade before and after opening',async()=>{
 const h=harness({mobile:true,width:900,height:400,viewport:{width:780,height:312,offsetLeft:11,offsetTop:27}});
 function check(width,height,left,top){for(const id of ['launcher','arcade']){
  const style=h.elements.get(id).style;
  for(const [key,value] of Object.entries({width,height,left,top}))assert.equal(style.getPropertyValue('--view-'+key),value+'px',id+' tracks visible viewport '+key);
 }}
 check(780,312,11,27);assert.equal(h.resized(),0,'home layout does not initialize or resize a renderer');
 Object.assign(h.win.visualViewport,{width:760,height:330,offsetLeft:7,offsetTop:14});h.win.visualViewport.dispatch('resize');check(760,330,7,14);
 Object.assign(h.win.visualViewport,{offsetLeft:3,offsetTop:9});h.win.visualViewport.dispatch('scroll');check(760,330,3,9);
 await h.launch();const before=h.resized();
 Object.assign(h.win.visualViewport,{width:780,height:360,offsetLeft:0,offsetTop:0});h.win.visualViewport.dispatch('resize');check(780,360,0,0);assert.ok(h.resized()>before,'visible renderer follows browser-bar resizing');
 await h.escape();assert.equal(h.mode(),'home');check(780,360,0,0);
});

test('without visualViewport the app uses inner dimensions and keeps zero viewport offsets',()=>{
 const h=harness({width:780,height:360,viewport:null});
 for(const [width,height] of [[780,360],[740,320]]){
  h.win.innerWidth=width;h.win.innerHeight=height;h.win.dispatch('resize');
  for(const id of ['launcher','arcade']){
   const style=h.elements.get(id).style;
   assert.equal(style.getPropertyValue('--view-width'),width+'px');assert.equal(style.getPropertyValue('--view-height'),height+'px');assert.equal(style.getPropertyValue('--view-left'),'0px');assert.equal(style.getPropertyValue('--view-top'),'0px');
  }
 }
});

test('S9 viewport applies full-height glass and larger keys, then respects safe-area changes',()=>{
 const safeArea={},h=harness({mobile:true,width:780,height:312,safeArea});
 const value=key=>parseFloat(h.elements.get('arcade').style.getPropertyValue('--'+key));
 const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-8,`${actual} differs from ${expected}`);
 near(value('screen-height'),312);near(value('screen-width'),416);near(value('screen-y'),0);near(value('key-size'),81.5);near(value('key-gap'),5);
 near(value('escape-x'),6);near(value('escape-y'),6);near(value('arrows-x'),6);near(value('arrows-y'),138);near(value('enter-height'),168);
 near(value('screen-x')-(value('arrows-x')+3*value('key-size')+2*value('key-gap')),8);
 near(value('enter-x')-(value('screen-x')+value('screen-width')),8);
 Object.assign(safeArea,{left:28,right:4,top:3,bottom:9});Object.assign(h.win.visualViewport,{width:900,height:400});h.win.visualViewport.dispatch('resize');
 near(value('screen-height'),388);near(value('screen-width'),388*4/3);near(value('screen-y'),3);
 near(value('escape-x'),34);near(value('escape-y'),9);assert.ok(value('enter-x')+value('key-size')<=896);
 assert.equal(h.mode(),'home');assert.equal(h.resized(),0);
});

test('desktop geometry centers the 4:3 glass without mobile key space',()=>{
 const h=harness({width:1440,height:900}),style=h.elements.get('arcade').style;
 assert.equal(style.getPropertyValue('--screen-x'),'120px');assert.equal(style.getPropertyValue('--screen-y'),'0px');assert.equal(style.getPropertyValue('--screen-width'),'1200px');assert.equal(style.getPropertyValue('--screen-height'),'900px');assert.equal(style.getPropertyValue('--key-size'),'0px');
});

test('a corner activation opens once and startup discards action input',async()=>{
 const h=harness({mobile:true,width:780,height:312}),button=h.elements.get('open-phosphor');
 button.dispatch('click',{clientX:1,clientY:1,target:button,detail:1});button.dispatch('click',{clientX:779,clientY:311,target:button,detail:1});await h.settle();
 assert.equal(h.mode(),'menu');assert.equal(h.depth(),1,'repeated launcher events create only one session');assert.equal(h.run('game'),null);
 h.touchDown('action');h.key('Enter');h.touchUp();await h.advance(POWER_ON_SECONDS+.1);
 assert.equal(h.mode(),'menu');assert.equal(h.run('input.down.size'),0);assert.equal(h.run('input.pressed.size'),0);assert.equal(h.run('game'),null);
});

test('mobile portrait runs startup immediately without a rotation gate',async()=>{
 const h=harness({mobile:true});h.media.get('(orientation: portrait)').matches=true;
 await h.launch({warm:false});await h.advance(.8);
 assert.equal(h.run('power.phase'),'starting');assert.ok(h.run('power.state.level')>0);assert.equal(h.run('sound.powered'),true);
 await h.advance(POWER_ON_SECONDS);assert.equal(h.run('power.phase'),'on');assert.equal(h.mode(),'menu');
 h.key('Space');assert.equal(h.mode(),'game');
});

test('startup waits for the pending native fullscreen transition before consuming warmup time',async()=>{
 const h=harness({mobile:true,pendingFullscreen:true});await h.launch({warm:false});await h.advance(POWER_ON_SECONDS+1);
 assert.equal(h.run('fullscreen.pending'),true);assert.equal(h.run('power.time'),0);assert.equal(h.run('sound.powered'),false);assert.equal(h.doc.fullscreenElement,null);
 await h.resolveFullscreen();await h.advance(.7);
 assert.equal(h.run('fullscreen.pending'),false);assert.equal(h.doc.fullscreenElement,h.elements.get('arcade'));assert.equal(h.run('power.phase'),'starting');assert.ok(h.run('power.time')>.6&&h.run('power.time')<.8);
 await h.advance(POWER_ON_SECONDS);assert.equal(h.run('power.phase'),'on');assert.deepEqual(h.locks(),{keyboard:1,orientation:1});
});

test('a hidden page pauses an unfinished startup and resumes the remaining sequence',async()=>{
 const h=harness({mobile:true});await h.launch({warm:false});await h.advance(.65);const before=h.run('power.time'),level=h.run('power.state.level');
 h.doc.hidden=true;h.doc.dispatch('visibilitychange');await h.advance(POWER_ON_SECONDS+1);
 assert.equal(h.run('power.phase'),'starting');assert.equal(h.run('power.time'),before);assert.equal(h.run('power.state.level'),level);
 h.doc.hidden=false;h.doc.dispatch('visibilitychange');await h.advance(.25);
 assert.equal(h.run('power.phase'),'starting');assert.ok(h.run('power.time')>before&&h.run('power.time')<before+.3);assert.ok(h.run('power.state.level')>level);
 await h.advance(POWER_ON_SECONDS);assert.equal(h.run('power.phase'),'on');
});

test('mobile root ESC retains the native screen through its line and spot shutdown',async()=>{
 const h=harness({mobile:true});await h.launch();const start=h.renderedPowers.length;
 h.touchDown('menu-back');await h.settle();assert.equal(h.mode(),'closing');
 await h.advance(POWER_OFF_SECONDS*.7);
 assert.equal(h.mode(),'closing');assert.equal(h.elements.get('arcade').hidden,false);assert.equal(h.destroyed(),0);assert.equal(h.doc.fullscreenElement,h.elements.get('arcade'));
 const visible=h.renderedPowers.slice(start);
 assert.ok(visible.some(power=>power.level>0&&power.vertical<.12&&power.horizontal>.6),'shutdown sends a visible horizontal line to the renderer');
 assert.ok(visible.some(power=>power.spot>0),'shutdown keeps its afterglow visible before leaving');
 await h.advance(POWER_OFF_SECONDS);
 assert.equal(h.mode(),'home');assert.equal(h.elements.get('arcade').hidden,true);assert.equal(h.doc.fullscreenElement,null);assert.equal(h.destroyed(),1);
});

test('Back can cancel a portrait startup with fullscreen still pending, without late locks or reentry',async()=>{
 const h=harness({mobile:true,pendingFullscreen:true});h.media.get('(orientation: portrait)').matches=true;
 await h.launch({warm:false});await h.back({finish:false});
 assert.equal(h.mode(),'closing');
 await h.advance(POWER_OFF_SECONDS+.1);assert.equal(h.mode(),'home');assert.equal(h.depth(),0);assert.deepEqual(h.locks(),{keyboard:0,orientation:0});
 await h.resolveFullscreen();await h.advance(.1);
 assert.equal(h.mode(),'home');assert.equal(h.doc.fullscreenElement,null);assert.deepEqual(h.locks(),{keyboard:0,orientation:0});assert.equal(h.destroyed(),1);
});

test('reduced-motion mode preserves a visible startup and shutdown fade without collapsing geometry',async()=>{
 const h=harness({mobile:true,reducedMotion:true});h.run('options.reducedMotion=true');await h.launch({warm:false});await h.advance(POWER_ON_SECONDS*.6);
 assert.equal(h.run('power.phase'),'starting');assert.ok(h.run('power.state.level')>0&&h.run('power.state.level')<1);
 await h.advance(POWER_ON_SECONDS);const start=h.renderedPowers.length;
 h.touchDown('menu-back');await h.settle();await h.advance(POWER_OFF_SECONDS*.5);
 assert.equal(h.mode(),'closing');assert.equal(h.elements.get('arcade').hidden,false);assert.ok(h.run('power.state.level')>0&&h.run('power.state.level')<1);
 for(const power of h.renderedPowers.slice(start)){assert.equal(power.vertical,1);assert.equal(power.horizontal,1);assert.equal(power.spot,0);}
 await h.advance(POWER_OFF_SECONDS);assert.equal(h.mode(),'home');
});

 test('visible native fullscreen starts even when mobile orientation lock never settles',async()=>{
 const h=harness({mobile:true,pendingOrientation:true});await h.launch({warm:false});
 assert.equal(h.run('fullscreen.native'),true);assert.equal(h.run('fullscreen.pending'),true);
 await h.advance(POWER_ON_SECONDS+.1);assert.equal(h.run('power.phase'),'on');assert.equal(h.run('sound.powered'),true);
 h.key('Space');assert.equal(h.mode(),'game');
 });

test('visible warmup accepts keyboard and touch menu navigation before full brightness',async()=>{
 for(const mobile of [false,true]){
 const h=harness({mobile});await h.launch({warm:false});await h.advance(.7);
 assert.equal(h.run('power.phase'),'starting');assert.ok(h.run('power.state.level')>0);
 const before=h.run('menu.index');
 if(mobile){h.touchDown('key-down');await h.advance(.03);h.touchUp();}else h.key('ArrowDown');
 assert.equal(h.run('menu.index'),before+1);
 h.key('Space');assert.equal(h.mode(),'game');assert.equal(h.run('power.phase'),'starting');
 }
});

test('upright mobile uses a sideways landscape stage and restores it on rotation',()=>{
 const h=harness({mobile:true,width:360,height:780});const app=h.elements.get('arcade');
 assert.equal(app.dataset.sideways,'true');assert.equal(app.style.getPropertyValue('--stage-width'),'780px');assert.equal(app.style.getPropertyValue('--stage-height'),'360px');
 h.win.innerWidth=780;h.win.innerHeight=360;h.win.visualViewport.width=780;h.win.visualViewport.height=360;h.win.dispatch('resize');
 assert.equal(app.dataset.sideways,'false');
});

test('desktop and mobile tint changes survive child navigation and reset on exit',async()=>{
 for(const mobile of [false,true]){
 const h=harness({mobile});await h.launch();h.key('ArrowUp');h.key('Enter');assert.equal(h.mode(),'settings');
 h.key('ArrowDown');assert.match(h.run('settings.selectionLabel'),/^TINT:/);
 h.key('ArrowRight');assert.equal(h.run('options.tint'),195);
 await h.escape();assert.equal(h.mode(),'menu');assert.equal(h.run('options.tint'),195);
 await h.escape();assert.equal(h.mode(),'home');assert.equal(h.run('options.tint'),190);
 }
});


test('visible power timing matches wall time at 10, 30, 60 and 120 FPS',async()=>{
 for(const fps of [10,30,60,120]){
 const desktop=harness(),mobile=harness({mobile:true});
 await desktop.launch({warm:false});await mobile.launch({warm:false});
 await desktop.advanceAtRate(.8,60);await mobile.advanceAtRate(.8,fps);
 assert.ok(Math.abs(desktop.run('power.time')-mobile.run('power.time'))<1e-8,'warm-up is not stretched at '+fps+' FPS');
 for(const key of ['level','vertical','horizontal','focus','bend'])assert.ok(Math.abs(desktop.run('power.state.'+key)-mobile.run('power.state.'+key))<1e-8,key+' uses the same timeline at '+fps+' FPS');
 await desktop.advanceAtRate(POWER_ON_SECONDS,60);await mobile.advanceAtRate(POWER_ON_SECONDS,fps);
 assert.equal(desktop.run('power.phase'),'on');assert.equal(mobile.run('power.phase'),'on');
 await desktop.escape({finish:false});await mobile.escape({finish:false});
 await desktop.advanceAtRate(POWER_OFF_SECONDS*.45,60);await mobile.advanceAtRate(POWER_OFF_SECONDS*.45,fps);
 assert.equal(mobile.mode(),'closing');
 assert.ok(Math.abs(desktop.run('power.time')-mobile.run('power.time'))<1e-8,'collapse follows elapsed time at '+fps+' FPS');
 await desktop.advanceAtRate(POWER_OFF_SECONDS*.55+.05,60);await mobile.advanceAtRate(POWER_OFF_SECONDS*.55+.05,fps);
 assert.equal(desktop.mode(),'home');assert.equal(mobile.mode(),'home');
 }
});

test('first visible frame anchors warm-up after a long pending fullscreen interval',async()=>{
 const h=harness({mobile:true,pendingFullscreen:true});await h.launch({warm:false});
 await h.advanceAtRate(5,10);assert.equal(h.run('power.time'),0);assert.equal(h.run('sound.powered'),false);
 await h.resolveFullscreen();await h.advanceAtRate(.5,2);
 assert.equal(h.run('power.time'),0,'the interval before the first visible frame is not counted');assert.equal(h.run('sound.powered'),true);
 await h.advanceAtRate(.5,30);assert.ok(Math.abs(h.run('power.time')-.5)<1e-8);
});

test('desktop and mobile start with identical power effects regardless of device motion preference',async()=>{
 const snapshots=[];
 for(const mobile of [false,true]){
  const h=harness({mobile,reducedMotion:mobile});await h.launch({warm:false});await h.advance(.7);
  assert.equal(h.run('options.reducedMotion'),false);const starting=h.run('power.state');
  await h.advance(POWER_ON_SECONDS);await h.escape({finish:false});await h.advance(.45);
  snapshots.push(JSON.stringify({starting,stopping:h.run('power.state')}));
 }
 assert.equal(snapshots[0],snapshots[1]);
});


test('desktop key input is silent while mobile retains keyboard sounds and its slider',async()=>{
 for(const mobile of [false,true]){
  const h=harness({mobile});await h.launch();
  const start=h.voices.length;
  h.key('ArrowDown');h.key('Enter');await h.escape();
  assert.equal(h.voices.slice(start).some(v=>v.tag==='keyboard'),mobile);
  assert.equal(h.run("settings.rows.some(row=>row.key==='keyboardVolume')"),mobile);
 }
});


test('launcher uses the CRT renderer with green defaults on black and keeps it separate from game power',async()=>{
 const h=harness();await h.advance(.1);
 assert.equal(h.run('launchSource.width'),256);assert.equal(h.run('launchSource.height'),192);
 assert.equal(h.run('launchRenderer.options.tint'),190);
 assert.equal(h.run('launchRenderer.options.blackBackground'),true);
 assert.equal(h.run('launchRenderer.options.ambient'),0);
 assert.equal(h.run('launchRenderer.options.bloom'),normalizeSettings().bloom);
 await h.launch();assert.equal(h.run('launchRenderer===renderer'),false);
 await h.escape();assert.equal(h.mode(),'home');await h.advance(.1);
 assert.equal(h.run('launchRenderer.options.tint'),190);
});


test('Q backs through game, settings and calibration; E activates and releases like Enter',async()=>{
 const h=harness();await h.launch();h.key('KeyE');assert.equal(h.mode(),'game');
 h.key('KeyQ');await h.settle();assert.equal(h.mode(),'menu');
 h.key('ArrowUp');h.key('KeyE');assert.equal(h.mode(),'settings');
 h.run("settings.index=settings.rows.findIndex(row=>row.key==='test')");h.key('KeyE');assert.equal(h.mode(),'test');
 h.key('KeyQ');await h.settle();assert.equal(h.mode(),'settings');
 h.key('KeyQ');await h.settle();assert.equal(h.mode(),'menu');
 assert.equal(h.run('input.down.size'),0);
 h.key('KeyQ');await h.advance(POWER_OFF_SECONDS+.1);assert.equal(h.mode(),'home');
});


test('desktop controls diagram is nested under settings and shows held physical keys without gameplay',async()=>{
 const h=harness();await h.launch();h.key('ArrowUp');h.key('Enter');
 h.run("settings.index=settings.rows.findIndex(row=>row.key==='controls')");
 const selected=h.run('settings.index');h.key('Enter');assert.equal(h.mode(),'controls');
 assert.match(h.elements.get('screen').attributes['aria-label'],/numpad Enter/);
 for(const code of ['KeyW','ArrowLeft','Space','Enter','NumpadEnter','KeyE']){
  h.keyDown(code);h.tick();assert.equal(h.mode(),'controls');
  assert.equal(h.run("input.sources.has('keyboard-"+code+"')"),true);
  h.keyUp(code);h.tick();assert.equal(h.run('input.down.size'),0);
 }
 assert.equal(h.run('game'),null);
 h.key('KeyQ');assert.equal(h.mode(),'settings');assert.equal(h.run('settings.index'),selected);
 assert.equal(h.doc.fullscreenElement,h.elements.get('arcade'));
 h.key('Enter');assert.equal(h.mode(),'controls');await h.escape();assert.equal(h.mode(),'settings');
 await h.escape();assert.equal(h.mode(),'menu');
});

test('controls is hidden on mobile and closes back to settings if input mode changes',async()=>{
 const mobile=harness({mobile:true});await mobile.launch();
 assert.equal(mobile.run("settings.rows.some(row=>row.key==='controls')"),false);
 mobile.run('showControls()');assert.equal(mobile.mode(),'menu');
 const h=harness();await h.launch();h.run('openSettings();showControls()');assert.equal(h.mode(),'controls');
 const media=h.media.get('(any-pointer: coarse)');media.matches=true;media.dispatch('change');
 assert.equal(h.mode(),'settings');assert.equal(h.run("settings.rows.some(row=>row.key==='controls')"),false);
});

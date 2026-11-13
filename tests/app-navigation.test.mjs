import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createGame,GAME_INFO,pixelText} from '../games.js';
import {FullscreenController} from '../fullscreen.js';
import {normalizeSettings} from '../display-settings.js';
import {SettingsScreen} from '../settings-screen.js';
import {drawCalibration,TEST_PATTERNS} from '../calibration.js';
import {drawRoot,drawLaunch,GAME_HINTS} from '../interface.js';
import {movementCodes,joystickDirections,InputState,MenuNavigation} from '../controls.js';

class Events {
 constructor(){this.listeners=new Map();}
 addEventListener(type,fn){if(!this.listeners.has(type))this.listeners.set(type,[]);this.listeners.get(type).push(fn);}
 removeEventListener(type,fn){this.listeners.set(type,(this.listeners.get(type)||[]).filter(x=>x!==fn));}
 dispatch(type,event={}){event.preventDefault??=()=>{};for(const fn of this.listeners.get(type)||[])fn(event);}
}
function harness({mobile=false}={}){
 const doc=new Events(),win=new Events(),elements=new Map(),storage=new Map(),raf=[];
 let focus=null,destroyed=0,historyDepth=0;
 const context2d=()=>new Proxy({},{get(target,key){return key in target?target[key]:(..._args)=>{};},set(target,key,val){target[key]=val;return true;}});
 class Element extends Events{
  constructor(id=''){super();this.id=id;this.ownerDocument=doc;this.hidden=false;this.disabled=false;this.dataset={};this.attributes={};this.ctx=context2d();const classes=new Set();this.classList={add:k=>classes.add(k),remove:k=>classes.delete(k),contains:k=>classes.has(k)};this.style={setProperty(){}};}
  setAttribute(k,v){this.attributes[k]=v;}
  focus(){focus=this.id;}
  getContext(){return this.ctx;}
  setPointerCapture(){}
  getBoundingClientRect(){return {left:0,top:0,width:100,height:100};}
 }
 const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
 for(const [,id] of html.matchAll(/id="([^"]+)"/g))elements.set(id,new Element(id));
 elements.get('arcade').hidden=true;elements.get('arcade').dataset.mode='home';
 doc.querySelector=selector=>selector==='dialog[open]'?null:elements.get(selector.slice(1))||null;
 doc.createElement=()=>new Element();doc.hidden=false;doc.fullscreenElement=null;doc.defaultView=win;
 const app=elements.get('arcade');
 app.requestFullscreen=async()=>{doc.fullscreenElement=app;doc.dispatch('fullscreenchange');};
 doc.exitFullscreen=async()=>{doc.fullscreenElement=null;doc.dispatch('fullscreenchange');};
 win.innerHeight=400;win.innerWidth=800;win.performance={now:()=>1000};
 win.navigator={keyboard:{lock:async()=>{},unlock(){}}};win.screen={orientation:{lock:async()=>{},unlock(){}}};
 win.requestAnimationFrame=fn=>raf.push(fn);win.visualViewport=new Events();win.visualViewport.height=400;
 const history={pushState(){historyDepth++;},back(){historyDepth--;queueMicrotask(()=>win.dispatch('popstate'));}};
 const media=new Map();
 function matchMedia(query){if(!media.has(query)){const entry=new Events();entry.matches=query==='(any-pointer: coarse)'?mobile:false;media.set(query,entry);}return media.get(query);}
 class CRTStub{constructor(canvas){this.canvas=canvas;this.backend='WebGL test stub';}setOptions(o){this.options={...o};}resize(){}render(){}destroy(){destroyed++;}}
 const sandbox={document:doc,window:win,navigator:win.navigator,screen:win.screen,history,matchMedia,requestAnimationFrame:win.requestAnimationFrame,localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)},console,Date,createGame,GAME_INFO,pixelText,CRTDisplay:CRTStub,FullscreenController,normalizeSettings,SettingsScreen,drawCalibration,TEST_PATTERNS,drawRoot,drawLaunch,GAME_HINTS,movementCodes,joystickDirections,InputState,MenuNavigation};
 const context=vm.createContext(sandbox);
 const source=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'');
 vm.runInContext('"use strict";\n'+source,context,{filename:'app.js'});
 const run=code=>vm.runInContext(code,context);
 const tick=()=>run('tick(1/120);draw();');
 const key=code=>{doc.dispatch('keydown',{code,repeat:false,target:elements.get('screen')});tick();doc.dispatch('keyup',{code,target:elements.get('screen')});tick();};
 const settle=()=>new Promise(resolve=>setImmediate(resolve));
 return {elements,doc,win,media,history,run,tick,key,settle,mode:()=>app.dataset.mode,destroyed:()=>destroyed,focus:()=>focus,depth:()=>historyDepth,
  async launch(){elements.get('open-phosphor').dispatch('click');await settle();},
  async escape(){doc.dispatch('keydown',{code:'Escape',repeat:false,target:elements.get('screen')});await settle();},
  async back(){history.back();await settle();},
  async mobileBack(){elements.get('menu-back').dispatch('click');await settle();}
 };
}

test('launch starts only the root menu; game and settings navigation clear held input',async()=>{
 const h=harness();assert.equal(h.mode(),'home');assert.equal(h.elements.get('launcher').hidden,false);assert.equal(h.elements.get('arcade').hidden,true);
 await h.launch();assert.equal(h.mode(),'menu');assert.equal(h.elements.get('launcher').hidden,true);assert.equal(h.elements.get('arcade').hidden,false);assert.equal(h.depth(),1);
 h.key('Space');assert.equal(h.mode(),'game');assert.equal(h.run('game.status'),'playing');assert.equal(h.run('input.down.size'),0);assert.equal(h.run('input.pressed.size'),0);
 await h.escape();assert.equal(h.mode(),'menu');assert.ok(h.doc.fullscreenElement,'first Escape retains native fullscreen with lock');
 h.key('ArrowUp');h.key('Space');assert.equal(h.mode(),'settings');assert.equal(h.run('input.down.size'),0);
 h.key('ArrowRight');assert.ok(h.run('options.ambient')>normalizeSettings().ambient);
 await h.escape();assert.equal(h.mode(),'menu');assert.ok(h.run('options.ambient')>normalizeSettings().ambient,'settings persist within this launch');
 await h.escape();assert.equal(h.mode(),'home');assert.equal(h.elements.get('arcade').hidden,true);assert.equal(h.elements.get('launcher').hidden,false);assert.equal(h.elements.get('open-phosphor').disabled,false);assert.equal(h.destroyed(),1);assert.equal(h.doc.fullscreenElement,null);assert.equal(h.depth(),0);assert.equal(h.run('options.ambient'),normalizeSettings().ambient);
 await h.launch();assert.equal(h.mode(),'menu');assert.equal(h.run('settings.index'),0);assert.equal(h.run('options.ambient'),normalizeSettings().ambient);
});

test('calibration returns to in-screen settings, then menu, then launcher',async()=>{
 const h=harness();await h.launch();h.key('ArrowUp');h.key('Space');assert.equal(h.mode(),'settings');
 h.key('ArrowUp');h.key('ArrowUp');h.key('Space');assert.equal(h.mode(),'test');
 h.key('Space');assert.equal(h.run('testPattern'),1);
 await h.escape();assert.equal(h.mode(),'settings');assert.match(h.run('settings.selectionLabel'),/DISPLAY TEST/);
 await h.escape();assert.equal(h.mode(),'menu');await h.escape();assert.equal(h.mode(),'home');assert.equal(h.run('testPattern'),0);
});

test('mobile ESC and history Back follow the same navigation levels without leaving stale history',async()=>{
 const h=harness({mobile:true});await h.launch();h.key('Space');assert.equal(h.mode(),'game');
 await h.mobileBack();assert.equal(h.mode(),'menu');
 h.key('ArrowUp');h.key('Space');h.key('ArrowUp');h.key('ArrowUp');h.key('Space');assert.equal(h.mode(),'test');
 await h.back();assert.equal(h.mode(),'settings');assert.equal(h.depth(),1);
 await h.back();assert.equal(h.mode(),'menu');assert.equal(h.depth(),1);
 await h.back();assert.equal(h.mode(),'home');assert.equal(h.depth(),0);assert.equal(h.elements.get('arcade').hidden,true);
});

test('mobile portrait blocks gameplay only after launch and recentering clears touch input',async()=>{
 const h=harness({mobile:true});h.media.get('(orientation: portrait)').matches=true;h.win.dispatch('resize');assert.equal(h.run('blocked'),false);
 await h.launch();assert.equal(h.run('blocked'),true);assert.equal(h.elements.get('rotate').hidden,false);
 h.key('Space');assert.equal(h.mode(),'menu');
 h.media.get('(orientation: portrait)').matches=false;h.win.dispatch('resize');h.key('Space');assert.equal(h.mode(),'game');
 h.elements.get('joystick').dispatch('pointerdown',{pointerId:1,clientX:90,clientY:50});assert.ok(h.run("input.down.has('ArrowRight')"));
 h.elements.get('joystick').dispatch('pointercancel',{pointerId:1});assert.equal(h.run('input.down.size'),0);
});

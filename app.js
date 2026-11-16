import {AudioEngine} from './audio.js';
import {TouchKeys} from './touch-keys.js';
import {PowerSequence} from './power-sequence.js';
import {createGame,GAME_INFO,pixelText} from './games.js';
import {CRTDisplay} from './crt.js';
import {FullscreenController} from './fullscreen.js';
import {normalizeSettings} from './display-settings.js';
import {SettingsScreen} from './settings-screen.js';
import {drawControls,CONTROLS_DESCRIPTION} from './controls-screen.js';
import {drawCalibration,TEST_PATTERNS} from './calibration.js';
import {drawRoot,drawLaunch,GAME_HINTS} from './interface.js';
import {movementCodes,InputState,MenuNavigation} from './controls.js';
import {solveViewportLayout} from './viewport-layout.js';

const $=s=>document.querySelector(s);
const app=$('#arcade'),launcher=$('#launcher'),launchButton=$('#open-phosphor');
const source=document.createElement('canvas');source.width=256;source.height=192;
const ctx=source.getContext('2d',{alpha:false});ctx.imageSmoothingEnabled=false;
let canvas=$('#screen'),renderer=null,launchRenderer=null;
const launchSource=document.createElement('canvas');launchSource.width=256;launchSource.height=192;
const MENU_ITEMS=[...GAME_INFO,{id:'settings',name:'Settings'}];
const input=new InputState(),menu=new MenuNavigation(MENU_ITEMS.length);
const coarse=matchMedia('(any-pointer: coarse)'),portrait=matchMedia('(orientation: portrait)');
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
// Use the same default power sequence on every device; Stable Display remains
// an explicit in-monitor setting rather than a device-dependent startup choice.
const defaults=()=>normalizeSettings({reducedMotion:false});
let options=defaults(),game=null,mode='home',paused=false,blocked=false,testPattern=0;
let powerWasVisible=false;
let clock=0,last=0,accumulator=0,drawClock=0,lastSelection=-1,lastSetting='';
let historyEntry=false,historyTransition=false,handlingHistory=false;
const historyToken='phosphor-'+Date.now();
let best={};try{const saved=JSON.parse(localStorage.getItem('phosphor-best-v1'));if(saved&&typeof saved==='object')best=saved;}catch{}
const sound=new AudioEngine(),power=new PowerSequence({reducedMotion:options.reducedMotion});
let touchKeys=null,closeResolve=null,closePromise=null,nativeExitSeen=false,powerSoundPending=false;
input.sound=event=>sound.gameSound(game?.id,event);
const settings=new SettingsScreen({mobile:coarse.matches,options,defaults:defaults(),onChange:next=>{
 const layoutChanged=next.arrowsRight!==options.arrowsRight;
 options=normalizeSettings(next,reducedMotion);renderer?.setOptions(options);sound.setOptions(options);power.reducedMotion=options.reducedMotion;
 if(layoutChanged)updateOrientation();
},onTest:showTest,onControls:showControls,onDegauss:()=>{if(renderer?.degauss?.()){sound.degauss();}}});

function wakeAudio(){sound.setHidden(Boolean(document.hidden));return document.hidden?Promise.resolve(false):sound.unlock();}
function clearInput(){input.clear();menu.release();settings.release();touchKeys?.clear();}
function announce(text){$('#status').textContent=text;}
function syncInterface(){
 app.dataset.mode=mode;
 const labels={home:'Open Phosphor',closing:'Powering off',menu:'PHOSPHOR menu. '+MENU_ITEMS[menu.index].name+'. Up and down select, Enter opens, Escape goes back.',settings:'Settings. '+settings.selectionLabel+'. Up and down select, left and right adjust, Enter activates, Escape goes back.',controls:CONTROLS_DESCRIPTION,test:'Calibration. Enter changes the test, Escape returns to settings.',game:game?game.id+'. '+GAME_HINTS[game.id]+'. Escape returns to menu.':''};
 canvas.setAttribute('aria-label',labels[mode]);
 $('#menu-back').setAttribute('aria-label',['test','controls'].includes(mode)?'Back to settings':mode==='menu'?'Exit Phosphor':'Back to menu');
 announce(labels[mode]);
}
function updateOrientation(){
 settings.setMobile(coarse.matches);
 if(mode==='controls'&&coarse.matches)openSettings();
 const viewport=window.visualViewport;
 const width=viewport?.width>0?viewport.width:window.innerWidth;
 const height=viewport?.height>0?viewport.height:window.innerHeight;
 const left=Number.isFinite(viewport?.offsetLeft)?viewport.offsetLeft:0;
 const top=Number.isFinite(viewport?.offsetTop)?viewport.offsetTop:0;
 for(const surface of [app,launcher])for(const [name,value] of Object.entries({width,height,left,top}))surface.style.setProperty('--view-'+name,value+'px');
 const style=window.getComputedStyle?.(app);
 const inset=side=>Math.max(0,parseFloat(style?.getPropertyValue('--safe-'+side))||0);
 const sideways=coarse.matches&&height>width;
 app.dataset.sideways=String(sideways);
 const stageWidth=sideways?height:width,stageHeight=sideways?width:height;
 app.style.setProperty('--stage-width',stageWidth+'px');app.style.setProperty('--stage-height',stageHeight+'px');
 const layout=solveViewportLayout({width:stageWidth,height:stageHeight,touch:coarse.matches,arrowsRight:options.arrowsRight,leftInset:inset(sideways?'top':'left'),rightInset:inset(sideways?'bottom':'right'),topInset:inset(sideways?'right':'top'),bottomInset:inset(sideways?'left':'bottom')});
 for(const name of ['screen','arrows','enter','escape'])for(const [field,value] of Object.entries(layout[name]))app.style.setProperty('--'+name+'-'+field,value+'px');
 app.style.setProperty('--key-size',layout.keySize+'px');app.style.setProperty('--key-gap',layout.keyGap+'px');
 const launchLabel=(coarse.matches?'Tap':'Click')+' here';
 launchButton.setAttribute('aria-label',launchLabel);$('#launch-label').textContent=launchLabel.toUpperCase();
 drawLaunch(launchSource.getContext('2d'),coarse.matches);if(mode==='home')launchRenderer?.resize();
 if(mode!=='home')renderer?.resize();
}
function ensureRenderer(){
 if(renderer)return;
 try{renderer=new CRTDisplay(canvas,source);canvas=renderer.canvas;renderer.setOptions(options);renderer.setPower(power.state);canvas.onpointerdown=()=>canvas.focus({preventScroll:true});$('#fatal').hidden=true;}
 catch(error){$('#fatal').hidden=false;console.error(error);}
}
function addHistoryEntry(){
 try{history.pushState({phosphorSession:historyToken},'');historyEntry=true;}catch{}
}
function returnHome(){
 mode='home';powerWasVisible=false;game=null;paused=false;powerSoundPending=false;sound.setScene(null,false);closePromise=null;closeResolve=null;nativeExitSeen=false;clearInput();menu.index=0;testPattern=0;
 options=defaults();settings.setOptions(options);settings.index=0;
 renderer?.destroy();renderer=null;
 app.hidden=true;launcher.hidden=false;app.classList.remove('immersive');
 last=0;accumulator=0;drawClock=0;lastSelection=-1;lastSetting='';
 updateOrientation();syncInterface();
 if(historyEntry&&!handlingHistory){historyEntry=false;historyTransition=true;launchButton.disabled=true;history.back();}
 launchButton.focus({preventScroll:true});
}
function toMenu(){sound.setScene(null,false);mode='menu';game=null;paused=false;clearInput();lastSelection=-1;syncInterface();}
function openSettings(){sound.setScene(null,false);mode='settings';game=null;paused=false;clearInput();lastSetting='';settings.setOptions(options);syncInterface();}
function showTest(){mode='test';clearInput();syncInterface();}
function showControls(){if(coarse.matches)return;mode='controls';clearInput();syncInterface();}
function goBack(){if(mode==='test'||mode==='controls')openSettings();else if(mode==='game'||mode==='settings')toMenu();}
function beginClose(){
 if(closePromise)return closePromise;
 clearInput();sound.setScene(null,false);if(!powerSoundPending)sound.powerOff();powerSoundPending=false;power.startOff();
 mode='closing';updateOrientation();syncInterface();
 closePromise=new Promise(resolve=>{closeResolve=resolve;});return closePromise;
}
function onFullscreenExit(){
 void wakeAudio();
 nativeExitSeen=true;
 if(power.phase==='off')returnHome();else void beginClose();
}
const fullscreen=new FullscreenController({element:app,getMode:()=>mode,onBack:goBack,onExit:onFullscreenExit,beforeExit:beginClose,onChange:syncInterface,onResize:updateOrientation,focusElement:()=>mode==='home'?launchButton:canvas,isMobile:()=>coarse.matches,onNotice:announce});
function requestBack(){if(mode==='home'||mode==='closing')return;void wakeAudio();clearInput();void fullscreen.escape();}
touchKeys=new TouchKeys({root:$('#touch-controls'),input,isEnabled:key=>mode!=='home'&&mode!=='closing'&&(key==='Escape'||(!blocked&&!powerInputBlocked())),onEscape:requestBack,onPress:key=>{void wakeAudio();if(coarse.matches)sound.keyDown(key);}});
function openPhosphor(){
 if(mode!=='home'||historyTransition)return;
 sound.setOptions(options);void wakeAudio();powerSoundPending=true;power.reducedMotion=options.reducedMotion;power.startOn();nativeExitSeen=false;
 launcher.hidden=true;app.hidden=false;toMenu();addHistoryEntry();updateOrientation();
 // Request while the click still has transient activation, before GPU setup.
 void fullscreen.enter();ensureRenderer();draw();renderer?.resize();canvas.focus({preventScroll:true});
}
launchButton.addEventListener('click',openPhosphor);
window.addEventListener('popstate',async()=>{
 if(historyTransition){historyTransition=false;launchButton.disabled=false;launchButton.focus({preventScroll:true});return;}
 if(mode==='closing'){historyEntry=false;return;}
 if(mode==='home')return;
 historyEntry=false;handlingHistory=true;clearInput();
 try{await fullscreen.escape();}finally{handlingHistory=false;}
 if(mode!=='home')addHistoryEntry();
});
function startSelected(){
 const selected=MENU_ITEMS[menu.index];
 if(selected.id==='settings'){openSettings();return;}
 game=createGame(selected.id);sound.setScene(game.id,true);game.update(0,{down:new Set(),pressed:new Set(['Space']),pointer:{active:false},sound:event=>sound.gameSound(game.id,event)});
 mode='game';paused=false;clearInput();syncInterface();
}
document.addEventListener('keydown',e=>{
 if(e.ctrlKey||e.metaKey||e.altKey||mode==='home')return;
 if(e.code==='Escape'||e.code==='KeyQ'){e.preventDefault();if(!e.repeat){void wakeAudio();if(coarse.matches)sound.keyDown('Escape');touchKeys.setPhysical(e.code,true);requestBack();}return;}
 const key=movementCodes[e.code];if(!key||blocked||powerInputBlocked()||mode==='closing')return;
 e.preventDefault();if(e.repeat)return;void wakeAudio();if(coarse.matches)sound.keyDown(e.code);touchKeys.setPhysical(e.code,true);input.set('keyboard-'+e.code,[key]);
});
document.addEventListener('keyup',e=>{touchKeys.setPhysical(e.code,false);if(movementCodes[e.code]){input.release('keyboard-'+e.code);if(mode!=='home')e.preventDefault();}});
window.addEventListener('blur',()=>{sound.setScene(null,false);clearInput();if(mode==='game')paused=true;});
window.addEventListener('focus',()=>{if(mode!=='home')void wakeAudio();});
document.addEventListener('visibilitychange',()=>{sound.setHidden(document.hidden);if(!document.hidden&&mode!=='home')void wakeAudio();clearInput();if(document.hidden&&mode==='game')paused=true;last=0;powerWasVisible=false;});
function draw(){
 ctx.setTransform(1,0,0,1,0,0);ctx.globalAlpha=1;ctx.imageSmoothingEnabled=false;
 if(mode==='menu'){drawRoot(ctx,MENU_ITEMS,menu.index,coarse.matches);return;}
 if(mode==='settings'){settings.render(ctx,coarse.matches);return;}
 if(mode==='controls'){drawControls(ctx,new Set([...input.sources.keys()].filter(key=>key.startsWith('keyboard-')).map(key=>key.slice(9))));return;}
 if(mode==='test'){drawCalibration(ctx,clock,testPattern,coarse.matches);return;}
 if(mode!=='game')return;
 game.render(ctx);
 if(paused){ctx.fillStyle='rgba(0,0,0,.88)';ctx.fillRect(56,73,144,44);pixelText(ctx,'PAUSED',128,82,2,.9,'center');pixelText(ctx,'ENTER TO RESUME',128,103,1,.6,'center');}
}
function powerInputBlocked(){return power.phase==='stopping'||power.phase==='off'||(power.phase==='starting'&&power.state.level<=.001);}
function tick(dt){
 if(blocked||powerInputBlocked()||mode==='closing')return;
 if(mode==='menu'){
  menu.update(dt,input);
  if(menu.index!==lastSelection){lastSelection=menu.index;syncInterface();}
  if(input.pressed.has('Space'))startSelected();
 }else if(mode==='settings'){
  settings.update(dt,input);
  if(mode==='settings'&&lastSetting!==settings.selectionLabel){lastSetting=settings.selectionLabel;syncInterface();}
 }else if(mode==='test'){if(input.pressed.has('Space'))testPattern=(testPattern+1)%TEST_PATTERNS.length;}
 else if(mode==='game'){
  if(paused){if(input.pressed.has('Space')){paused=false;clearInput();}}
  else{game.update(dt,input);if(game.score>(best[game.id]||0)){best[game.id]=game.score;try{localStorage.setItem('phosphor-best-v1',JSON.stringify(best));}catch{}}}
 }
 input.pressed.clear();
}
function frame(ms){
 if(mode==='home'){
  if(!document.hidden){
   if(!launchRenderer){launchRenderer=new CRTDisplay($('#launch-mark'),launchSource);launchRenderer.setOptions({...defaults(),ambient:0,reflection:0,environment:'none',blackBackground:true});}
   launchRenderer.render(ms/1000,1/60);
  }
  last=0;powerWasVisible=false;requestAnimationFrame(frame);return;
 }
 const now=ms/1000,elapsed=last?Math.max(0,now-last):1/60,dt=Math.min(elapsed,.05);last=now;clock+=dt;
 // Mobile fullscreen transitions can conceal the
 // display for seconds. Do not consume warm-up behind those surfaces.
 const powerVisible=Boolean(renderer)&&!blocked&&!document.hidden&&(!fullscreen.pending||fullscreen.native);
 if(power.phase!=='starting'||powerVisible){
  if(power.phase==='starting'&&powerSoundPending){sound.powerOn();powerSoundPending=false;}
  // Power follows wall time so dropped mobile frames cannot stretch it away
  // from Web Audio. Anchor the first visible startup frame after any wait.
  power.update(power.phase==='starting'&&!powerWasVisible?0:elapsed);
 }
 powerWasVisible=powerVisible;
 renderer?.setPower(power.state);
 const audible=mode==='game'&&!paused&&!blocked&&!document.hidden;
 sound.setScene(mode==='game'?game?.id:null,audible);sound.update(game,audible,dt);
 accumulator=Math.min(accumulator+dt,.1);drawClock+=dt;
 while(accumulator>=1/120){tick(1/120);accumulator-=1/120;}
 if(drawClock>=1/60){draw();drawClock%=1/60;}
 try{renderer?.render(clock,dt);}catch(error){console.error(error);$('#fatal').hidden=false;}
 if(mode==='closing'&&power.phase==='off'){const resolve=closeResolve;closeResolve=null;if(nativeExitSeen)returnHome();resolve?.();}
 requestAnimationFrame(frame);
}
window.addEventListener('resize',updateOrientation);window.visualViewport?.addEventListener('resize',updateOrientation);window.visualViewport?.addEventListener('scroll',updateOrientation);
coarse.addEventListener('change',updateOrientation);portrait.addEventListener('change',updateOrientation);
updateOrientation();syncInterface();launchButton.focus({preventScroll:true});requestAnimationFrame(frame);

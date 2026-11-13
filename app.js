import {createGame,GAME_INFO,pixelText} from './games.js';
import {CRTDisplay} from './crt.js';
import {FullscreenController} from './fullscreen.js';
import {normalizeSettings} from './display-settings.js';
import {SettingsScreen} from './settings-screen.js';
import {drawCalibration,TEST_PATTERNS} from './calibration.js';
import {drawRoot,drawLaunch,GAME_HINTS} from './interface.js';
import {movementCodes,joystickDirections,InputState,MenuNavigation} from './controls.js';

const $=s=>document.querySelector(s);
const app=$('#arcade'),launcher=$('#launcher'),launchButton=$('#open-phosphor');
const source=document.createElement('canvas');source.width=256;source.height=192;
const ctx=source.getContext('2d',{alpha:false});ctx.imageSmoothingEnabled=false;
let canvas=$('#screen'),renderer=null;
const MENU_ITEMS=[...GAME_INFO,{id:'settings',name:'Display settings'}];
const input=new InputState(),menu=new MenuNavigation(MENU_ITEMS.length);
const coarse=matchMedia('(any-pointer: coarse)'),portrait=matchMedia('(orientation: portrait)');
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
const defaults=()=>normalizeSettings({},reducedMotion);
let options=defaults(),game=null,mode='home',paused=false,blocked=false,testPattern=0;
let clock=0,last=0,accumulator=0,drawClock=0,lastSelection=-1,lastSetting='';
let historyEntry=false,historyTransition=false,handlingHistory=false;
const historyToken='phosphor-'+Date.now();
let best={};try{const saved=JSON.parse(localStorage.getItem('phosphor-best-v1'));if(saved&&typeof saved==='object')best=saved;}catch{}
const stick=$('#joystick'),action=$('#action');let stickPointer=null,actionPointer=null;
const settings=new SettingsScreen({options,defaults:defaults(),onChange:next=>{options=normalizeSettings(next,reducedMotion);renderer?.setOptions(options);},onTest:showTest});

function resetStick(){stickPointer=null;stick.classList.remove('active');stick.style.setProperty('--stick-x','0px');stick.style.setProperty('--stick-y','0px');input.release('joystick');}
function clearInput(){input.clear();menu.release();settings.release();resetStick();actionPointer=null;action.classList.remove('held');}
function announce(text){$('#status').textContent=text;}
function syncInterface(){
 app.dataset.mode=mode;
 const labels={home:'Open Phosphor',menu:'PHOSPHOR menu. '+MENU_ITEMS[menu.index].name+'. Up and down select, Space opens, Escape goes back.',settings:'Display settings. '+settings.selectionLabel+'. Up and down select, left and right adjust, Space activates, Escape goes back.',test:'Calibration. Space changes the test, Escape returns to settings.',game:game?game.id+'. '+GAME_HINTS[game.id]+'. Escape returns to menu.':''};
 canvas.setAttribute('aria-label',labels[mode]);
 $('#menu-back').setAttribute('aria-label',mode==='test'?'Back to settings':mode==='menu'?'Exit Phosphor':'Back to menu');
 announce(labels[mode]);
}
function updateOrientation(){
 app.style.setProperty('--view-height',(window.visualViewport?.height||window.innerHeight)+'px');
 const wasBlocked=blocked;blocked=mode!=='home'&&coarse.matches&&portrait.matches;
 $('#rotate').hidden=!blocked;app.dataset.blocked=String(blocked);
 if(blocked&&!wasBlocked){clearInput();if(mode==='game')paused=true;}
 if(mode!=='home')renderer?.resize();
}
function ensureRenderer(){
 if(renderer)return;
 try{renderer=new CRTDisplay(canvas,source);canvas=renderer.canvas;renderer.setOptions(options);canvas.onpointerdown=()=>canvas.focus({preventScroll:true});$('#fatal').hidden=true;}
 catch(error){$('#fatal').hidden=false;console.error(error);}
}
function addHistoryEntry(){
 try{history.pushState({phosphorSession:historyToken},'');historyEntry=true;}catch{}
}
function returnHome(){
 mode='home';game=null;paused=false;clearInput();menu.index=0;testPattern=0;
 options=defaults();settings.setOptions(options);settings.index=0;
 renderer?.destroy();renderer=null;
 app.hidden=true;launcher.hidden=false;app.classList.remove('immersive');
 last=0;accumulator=0;drawClock=0;lastSelection=-1;lastSetting='';
 updateOrientation();syncInterface();
 if(historyEntry&&!handlingHistory){historyEntry=false;historyTransition=true;launchButton.disabled=true;history.back();}
 launchButton.focus({preventScroll:true});
}
function toMenu(){mode='menu';game=null;paused=false;clearInput();lastSelection=-1;syncInterface();}
function openSettings(){mode='settings';game=null;paused=false;clearInput();lastSetting='';settings.setOptions(options);syncInterface();}
function showTest(){mode='test';clearInput();syncInterface();}
function goBack(){if(mode==='test')openSettings();else if(mode==='game'||mode==='settings')toMenu();}
const fullscreen=new FullscreenController({element:app,getMode:()=>mode,onBack:goBack,onExit:returnHome,onChange:syncInterface,onResize:updateOrientation,focusElement:()=>mode==='home'?launchButton:canvas,isMobile:()=>coarse.matches,onNotice:announce});
function openPhosphor(){
 if(mode!=='home'||historyTransition)return;
 launcher.hidden=true;app.hidden=false;toMenu();addHistoryEntry();updateOrientation();
 // Request while the click still has transient activation, before GPU setup.
 void fullscreen.enter();ensureRenderer();draw();renderer?.resize();canvas.focus({preventScroll:true});
}
launchButton.addEventListener('click',openPhosphor);
$('#menu-back').addEventListener('click',()=>{clearInput();void fullscreen.escape();});
window.addEventListener('popstate',async()=>{
 if(historyTransition){historyTransition=false;launchButton.disabled=false;return;}
 if(mode==='home')return;
 historyEntry=false;handlingHistory=true;clearInput();
 try{await fullscreen.escape();}finally{handlingHistory=false;}
 if(mode!=='home')addHistoryEntry();
});
function startSelected(){
 const selected=MENU_ITEMS[menu.index];
 if(selected.id==='settings'){openSettings();return;}
 game=createGame(selected.id);game.update(0,{down:new Set(),pressed:new Set(['Space']),pointer:{active:false},sound:()=>{}});
 mode='game';paused=false;clearInput();syncInterface();
}
document.addEventListener('keydown',e=>{
 if(e.ctrlKey||e.metaKey||e.altKey||mode==='home')return;
 if(e.code==='Escape'){e.preventDefault();if(!e.repeat){clearInput();void fullscreen.escape();}return;}
 const key=movementCodes[e.code];if(!key||blocked)return;
 e.preventDefault();if(e.repeat)return;input.set('keyboard-'+e.code,[key]);
});
document.addEventListener('keyup',e=>{if(movementCodes[e.code]){input.release('keyboard-'+e.code);if(mode!=='home')e.preventDefault();}});
window.addEventListener('blur',()=>{clearInput();if(mode==='game')paused=true;});
document.addEventListener('visibilitychange',()=>{clearInput();if(document.hidden&&mode==='game')paused=true;last=0;});
function moveStick(e){
 const r=stick.getBoundingClientRect(),radius=r.width*.34;
 let x=(e.clientX-r.left-r.width/2)/radius,y=(e.clientY-r.top-r.height/2)/radius;
 const length=Math.hypot(x,y);if(length>1){x/=length;y/=length;}
 stick.style.setProperty('--stick-x',x*radius+'px');stick.style.setProperty('--stick-y',y*radius+'px');
 input.set('joystick',joystickDirections(x,y));
}
stick.addEventListener('pointerdown',e=>{if(blocked||mode==='home'||stickPointer!==null)return;e.preventDefault();stickPointer=e.pointerId;stick.setPointerCapture(e.pointerId);stick.classList.add('active');moveStick(e);});
stick.addEventListener('pointermove',e=>{if(e.pointerId===stickPointer){e.preventDefault();moveStick(e);}});
for(const event of ['pointerup','pointercancel','lostpointercapture'])stick.addEventListener(event,e=>{if(e.pointerId===stickPointer)resetStick();});
action.addEventListener('pointerdown',e=>{if(blocked||mode==='home'||actionPointer!==null)return;e.preventDefault();actionPointer=e.pointerId;action.setPointerCapture(e.pointerId);action.classList.add('held');input.set('action',['Space']);});
for(const event of ['pointerup','pointercancel','lostpointercapture'])action.addEventListener(event,e=>{if(e.pointerId===actionPointer){input.release('action');actionPointer=null;action.classList.remove('held');}});
function draw(){
 ctx.setTransform(1,0,0,1,0,0);ctx.globalAlpha=1;ctx.imageSmoothingEnabled=false;
 if(mode==='menu'){drawRoot(ctx,MENU_ITEMS,menu.index,coarse.matches);return;}
 if(mode==='settings'){settings.render(ctx,coarse.matches);return;}
 if(mode==='test'){drawCalibration(ctx,clock,testPattern,coarse.matches);return;}
 if(mode!=='game')return;
 game.render(ctx);
 if(paused){ctx.fillStyle='rgba(0,0,0,.88)';ctx.fillRect(56,73,144,44);pixelText(ctx,'PAUSED',128,82,2,.9,'center');pixelText(ctx,coarse.matches?'BUTTON TO RESUME':'SPACE TO RESUME',128,103,1,.6,'center');}
}
function tick(dt){
 if(blocked)return;
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
 if(mode==='home'){last=0;requestAnimationFrame(frame);return;}
 const now=ms/1000,dt=last?Math.max(0,Math.min(now-last,.05)):1/60;last=now;clock+=dt;
 accumulator=Math.min(accumulator+dt,.1);drawClock+=dt;
 while(accumulator>=1/120){tick(1/120);accumulator-=1/120;}
 if(drawClock>=1/60){draw();drawClock%=1/60;}
 try{renderer?.render(clock,dt);}catch(error){console.error(error);$('#fatal').hidden=false;}
 requestAnimationFrame(frame);
}
window.addEventListener('resize',updateOrientation);window.visualViewport?.addEventListener('resize',updateOrientation);
coarse.addEventListener('change',updateOrientation);portrait.addEventListener('change',updateOrientation);
drawLaunch($('#launch-mark').getContext('2d'));syncInterface();launchButton.focus({preventScroll:true});requestAnimationFrame(frame);

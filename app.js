import {createGame,GAME_INFO,pixelText} from './games.js';
import {CRTDisplay} from './crt.js';

const $=s=>document.querySelector(s);
let canvas=$('#screen');
const source=document.createElement('canvas');
source.width=160; source.height=192;
const ctx=source.getContext('2d',{alpha:false});
ctx.imageSmoothingEnabled=false;
let renderer;
try { renderer=new CRTDisplay(canvas,source); canvas=renderer.canvas; }
catch(error){ $('#fatal').hidden=false; console.error(error); }
const safeRead=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}};
const safeSave=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value));}catch{}};
const defaults={brightness:1,persistence:1,bloom:1,curvature:1,glass:1,scanlines:1,reducedMotion:matchMedia('(prefers-reduced-motion: reduce)').matches};
let options={...defaults,...safeRead('phosphor-display-v1',{})};
const best=safeRead('phosphor-best-v1',{});
renderer?.setOptions(options);
const input={down:new Set(),pressed:new Set(),pointer:{x:80,y:96,active:false},sound:()=>{}};
let selected='pong',game=createGame(selected),paused=false,pattern=false,lastStatus='',lastScore=-1;
let accumulator=0,last=0,elapsed=0,drawAccumulator=0;
const keyAliases={KeyA:'ArrowLeft',KeyD:'ArrowRight',KeyW:'ArrowUp',KeyS:'ArrowDown'};
const keyFor=key=>keyAliases[key]||key;
const controlMap={
 tetris:[['← →','move'],['↑','rotate'],['↓','soft drop'],['SPACE','drop']],
 pong:[['↑ ↓','move'],['SPACE','serve']],
 breakout:[['← →','move'],['SPACE','launch']],
 asteroids:[['← →','turn'],['↑','thrust'],['SPACE','fire']],
 invaders:[['← →','move'],['SPACE','fire']],
 'space-invaders':[['← →','move'],['SPACE','fire']],
 spaceinvaders:[['← →','move'],['SPACE','fire']]
};
const descriptions={tetris:'Find the space. Leave nothing behind.',pong:'A single point of light. Keep it in play.',breakout:'One paddle. One ball. Every brick.',asteroids:'Drift into the dark. Make a little space.',invaders:'Hold the line. One pixel at a time.','space-invaders':'Hold the line. One pixel at a time.',spaceinvaders:'Hold the line. One pixel at a time.'};
const actionLabels={tetris:'DROP',pong:'SERVE',breakout:'LAUNCH',asteroids:'FIRE',invaders:'FIRE','space-invaders':'FIRE',spaceinvaders:'FIRE'};
function clearInput(){input.down.clear();input.pressed.clear();input.pointer.active=false;document.querySelectorAll('.held').forEach(b=>b.classList.remove('held'));}
function select(id){
 selected=id;game=createGame(id);paused=false;lastStatus='';lastScore=-1;clearInput();
 document.querySelectorAll('#game-nav button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.game===id)));
 $('#game-description').textContent=descriptions[id]||GAME_INFO.find(g=>g.id===id)?.description||'';
 $('#instructions').replaceChildren(...(controlMap[id]||[]).map(([key,label])=>{const span=document.createElement('span'),kbd=document.createElement('kbd');kbd.textContent=key;span.append(kbd,document.createTextNode(label));return span;}));
 $('#touch-action').textContent=actionLabels[id]||'PLAY';
 const name=GAME_INFO.find(g=>g.id===id)?.name||id;
 canvas.setAttribute('aria-label',name+'. 160 by 192 green phosphor display. Space to start. '+(controlMap[id]||[]).map(x=>x.join(' ')).join(', '));
 updateStatus();
}
GAME_INFO.forEach((info,i)=>{const b=document.createElement('button');b.dataset.game=info.id;b.setAttribute('aria-pressed','false');const n=document.createElement('span');n.className='number';n.textContent=String(i+1).padStart(2,'0');b.append(n,document.createTextNode(info.name.toUpperCase()));b.addEventListener('click',()=>{select(info.id);canvas.focus({preventScroll:true});});$('#game-nav').append(b);});
function isReady(){return /ready|over|won|win|lost/i.test(game.status);}
function updateStatus(){
 const state=String(game.status),score=Number(game.score)||0;
 if(score>(best[selected]||0)){best[selected]=score;safeSave('phosphor-best-v1',best);}
 if(state!==lastStatus||score!==lastScore){$('#high-score').innerHTML='BEST <b>'+String(best[selected]||0).padStart(4,'0')+'</b>';lastScore=score;
 if(state!==lastStatus){$('#status').textContent=(GAME_INFO.find(g=>g.id===selected)?.name||selected)+': '+state;lastStatus=state;}}
 $('#play-label').textContent=pattern?'Playing test pattern':paused?'Resume':isReady()?(/ready/i.test(state)?'Start game':'Play again'):'Pause';
 $('#play').disabled=pattern;
}
function press(code){const key=keyFor(code);if(key.startsWith('Arrow'))input.pointer.active=false;if(!input.down.has(key))input.pressed.add(key);input.down.add(key);}
function release(code){input.down.delete(keyFor(code));}
function play(){if(pattern)return;if(isReady()){paused=false;input.pressed.add('Space');}else paused=!paused;updateStatus();canvas.focus({preventScroll:true});}
$('#play').onclick=play;
$('#restart').onclick=()=>{game.restart();paused=false;clearInput();updateStatus();canvas.focus({preventScroll:true});};
async function fullscreen(){try{if(document.fullscreenElement)await document.exitFullscreen();else await $('#screen-wrap').requestFullscreen();canvas.focus({preventScroll:true});}catch{$('#status').textContent='Fullscreen is unavailable in this browser.';}}
$('#fullscreen').onclick=fullscreen;
document.addEventListener('fullscreenchange',()=>{renderer?.resize();$('#fullscreen').setAttribute('aria-label',document.fullscreenElement?'Exit fullscreen':'Fullscreen display');});
document.addEventListener('keydown',e=>{
 if($('#settings').open)return;
 if(e.code==='Tab'||e.metaKey||e.ctrlKey||e.altKey)return;
 if(/^Digit[1-5]$/.test(e.code)){select(GAME_INFO[Number(e.code.slice(-1))-1].id);e.preventDefault();return;}
 if(['KeyP','Escape'].includes(e.code)){if(!e.repeat&&!isReady())play();e.preventDefault();return;}
 if(e.code==='KeyR'){if(!e.repeat){game.restart();paused=false;clearInput();updateStatus();}e.preventDefault();return;}
 if(e.code==='KeyF'){if(!e.repeat)fullscreen();e.preventDefault();return;}
 if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Space','Enter','KeyW','KeyA','KeyS','KeyD','KeyZ','KeyX'].includes(e.code)){
   if(e.target instanceof HTMLButtonElement&&['Space','Enter'].includes(e.code))return;
   e.preventDefault();if(paused&&(e.code==='Space'||e.code==='Enter')){paused=false;updateStatus();return;}press(e.code);
 }
});
document.addEventListener('keyup',e=>release(e.code));
window.addEventListener('blur',()=>{clearInput();if(!isReady())paused=true;updateStatus();});
document.addEventListener('visibilitychange',()=>{if(document.hidden){clearInput();if(!isReady())paused=true;}last=0;updateStatus();});
canvas.addEventListener('pointermove',e=>{const r=canvas.getBoundingClientRect();input.pointer.x=Math.max(0,Math.min(159,(e.clientX-r.left)/r.width*160));input.pointer.y=Math.max(0,Math.min(191,(e.clientY-r.top)/r.height*192));input.pointer.active=true;});
canvas.addEventListener('pointerleave',()=>input.pointer.active=false);
canvas.addEventListener('pointerdown',e=>{canvas.focus({preventScroll:true});if(isReady()||paused)play();else if(selected==='breakout')input.pressed.add('Space');});
document.querySelectorAll('[data-key]').forEach(button=>{
 const end=()=>{release(button.dataset.key);button.classList.remove('held');};
 button.addEventListener('pointerdown',e=>{e.preventDefault();button.setPointerCapture(e.pointerId);if(paused){paused=false;updateStatus();}press(button.dataset.key);button.classList.add('held');});
 button.addEventListener('pointerup',end);button.addEventListener('pointercancel',end);button.addEventListener('lostpointercapture',end);
});
const sliderInfo=[['brightness','Beam intensity'],['persistence','Phosphor afterglow'],['bloom','Light scatter'],['scanlines','Scanline definition'],['curvature','Screen curvature'],['glass','Glass & reflections']];
sliderInfo.forEach(([name,label])=>{const row=document.createElement('div');row.className='slider-row';const l=document.createElement('label');l.htmlFor='setting-'+name;l.textContent=label;const output=document.createElement('output');output.id='value-'+name;output.textContent=Math.round(options[name]*100)+'%';l.append(output);const input=document.createElement('input');Object.assign(input,{type:'range',id:'setting-'+name,min:'0',max:'2',step:'.05',value:String(options[name])});if(name==='brightness')input.min='.3';input.addEventListener('input',()=>{options[name]=Number(input.value);output.textContent=Math.round(options[name]*100)+'%';renderer?.setOptions(options);safeSave('phosphor-display-v1',options);});row.append(l,input);$('#sliders').append(row);});
$('#reduced-motion').checked=options.reducedMotion;
$('#reduced-motion').onchange=e=>{options.reducedMotion=e.target.checked;renderer?.setOptions(options);safeSave('phosphor-display-v1',options);};
$('#test-pattern').onchange=e=>{pattern=e.target.checked;updateStatus();};
$('#reset-display').onclick=()=>{options={...defaults};sliderInfo.forEach(([key])=>{$('#setting-'+key).value=options[key];$('#value-'+key).textContent='100%';});$('#reduced-motion').checked=options.reducedMotion;renderer?.setOptions(options);safeSave('phosphor-display-v1',options);};
$('#settings-open').onclick=()=>{clearInput();if(!isReady())paused=true;$('#settings').showModal();updateStatus();};
$('#settings-close').onclick=()=>{$('#settings').close();canvas.focus({preventScroll:true});};
$('#settings').addEventListener('click',e=>{const r=$('#settings').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)$('#settings').close();});
function drawPattern(t){
 ctx.fillStyle='#000';ctx.fillRect(0,0,160,192);
 ctx.strokeStyle='#373737';ctx.lineWidth=1;
 for(let x=8;x<160;x+=12)ctx.fillRect(x,24,1,139);
 ctx.fillStyle='#333';for(let x=8;x<160;x+=12)ctx.fillRect(x,25,1,137);
 for(let y=25;y<=163;y+=12)ctx.fillRect(8,y,144,1);
 pixelText(ctx,'PHOSPHOR',80,8,1,1,'center');pixelText(ctx,'160 X 192',80,178,1,.65,'center');
 ctx.fillStyle='#b0b0b0';ctx.fillRect(8,164,144,1);
 for(let i=0;i<8;i++){ctx.fillStyle=`rgb(${(i+1)*31},${(i+1)*31},${(i+1)*31})`;ctx.fillRect(12+i*17,125,13,16);}
 const x=12+(t*27)%136;ctx.fillStyle='#fff';ctx.fillRect(Math.floor(x),42,1,58);
 ctx.beginPath();ctx.arc(80,83,35,0,Math.PI*2);ctx.strokeStyle='#888';ctx.stroke();
 ctx.fillStyle='#ddd';for(let i=0;i<6;i++)ctx.fillRect(18,147+i*2,124,1);
}
function draw(){
 ctx.setTransform(1,0,0,1,0,0);ctx.globalAlpha=1;ctx.fillStyle='#000';ctx.fillRect(0,0,160,192);ctx.imageSmoothingEnabled=false;
 if(pattern)drawPattern(elapsed);else{game.render(ctx);if(paused){ctx.fillStyle='rgba(0,0,0,.78)';ctx.fillRect(25,78,110,35);pixelText(ctx,'PAUSED',80,84,1,1,'center');pixelText(ctx,'SPACE TO RESUME',80,99,1,.65,'center');}}
}
let labelUpdated=false;
function frame(ms){
 const time=ms/1000,dt=last?Math.min(time-last,.05):1/60;last=time;elapsed+=dt;
 accumulator=Math.min(accumulator+dt,.1);drawAccumulator+=dt;
 while(accumulator>=1/120){if(!paused&&!pattern&&!$('#settings').open)game.update(1/120,input);input.pressed.clear();accumulator-=1/120;}
 if(drawAccumulator>=1/60){draw();drawAccumulator%=1/60;updateStatus();}
 try{renderer?.render(time,dt);}catch(error){console.error(error);$('#fatal').hidden=false;return;}
 if(!labelUpdated&&renderer){$('#renderer-label').textContent=renderer.backend.toUpperCase()+' / GREEN PHOSPHOR';labelUpdated=true;}
 requestAnimationFrame(frame);
}
window.addEventListener('resize',()=>renderer?.resize());
select(selected);draw();requestAnimationFrame(frame);

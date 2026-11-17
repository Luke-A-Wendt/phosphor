import test from 'node:test';
import assert from 'node:assert/strict';
import {SettingsScreen} from '../settings-screen.js';
import {InputState} from '../controls.js';
import {DISPLAY_DEFAULTS} from '../display-settings.js';

function harness(options=DISPLAY_DEFAULTS){
 const changes=[];let tests=0;
 const screen=new SettingsScreen({mobile:true,options,onChange:next=>changes.push(next),onTest:()=>tests++});
 const input=new InputState();
 const frame=(dt=1/120)=>{screen.update(dt,input);input.pressed.clear();};
 const tap=key=>{input.set('test',[key]);input.release('test');frame();frame();};
 return {screen,input,frame,tap,changes,get tests(){return tests;}};
}

test('settings preserve short joystick taps and repeat held adjustments after a delay',()=>{
 const h=harness();h.screen.index=4;h.tap('ArrowRight');assert.equal(h.screen.options.ambient,.85);
 h.input.set('stick',['ArrowRight']);h.frame();assert.equal(h.screen.options.ambient,.9);
 for(let n=0;n<30;n++)h.frame();assert.equal(h.screen.options.ambient,.9);
 for(let n=0;n<30;n++)h.frame();assert.ok(h.screen.options.ambient>.9);
 h.input.clear();h.screen.release();h.frame();const value=h.screen.options.ambient;
 for(let n=0;n<60;n++)h.frame();assert.equal(h.screen.options.ambient,value);
 h.tap('ArrowDown');assert.equal(h.screen.index,5);h.tap('ArrowLeft');assert.equal(h.screen.options.reflection,1.1);
});

test('numeric bounds, opposite directions, and diagonal navigation are safe',()=>{
 const h=harness({...DISPLAY_DEFAULTS,ambient:0});h.screen.index=3;h.tap('ArrowLeft');assert.equal(h.screen.options.ambient,0);
 h.screen.setOptions({...DISPLAY_DEFAULTS,ambient:2});h.tap('ArrowRight');assert.equal(h.screen.options.ambient,2);
 h.input.set('stick',['ArrowLeft','ArrowRight']);h.frame();assert.equal(h.screen.options.ambient,2);
 h.input.clear();h.frame();h.input.set('stick',['ArrowDown','ArrowRight']);h.frame();
 assert.equal(h.screen.index,4);assert.equal(h.screen.options.reflection,DISPLAY_DEFAULTS.reflection);
});

test('environment and stable display use directions and the single action button',()=>{
 const h=harness();h.screen.index=3;assert.equal(h.screen.index,3);
 h.tap('ArrowLeft');assert.equal(h.screen.options.environment,'none');
 h.tap('ArrowLeft');assert.equal(h.screen.options.environment,'mixed');
 h.tap('Space');assert.equal(h.screen.options.environment,'none');
 for(let n=0;n<9;n++)h.tap('ArrowDown');assert.equal(h.screen.index,12);
 h.tap('ArrowRight');assert.equal(h.screen.options.reducedMotion,true);
 h.tap('Space');assert.equal(h.screen.options.reducedMotion,false);
 h.tap('ArrowRight');h.tap('ArrowLeft');assert.equal(h.screen.options.reducedMotion,false);
});

test('test is only activated from its row and reset uses supplied session defaults',()=>{
 const h=harness();h.tap('ArrowDown');h.tap('Space');assert.equal(h.tests,0);
 h.tap('ArrowUp');assert.equal(h.screen.index,0);
 h.tap('ArrowRight');assert.equal(h.tests,0);
 h.tap('Space');assert.equal(h.tests,1);assert.equal(h.screen.index,0);
 h.screen.index=h.screen.rows.findIndex(row=>row.key==='reset');h.tap('Space');assert.deepEqual(h.screen.options,DISPLAY_DEFAULTS);
 assert.notEqual(h.changes.at(-1),DISPLAY_DEFAULTS);
 const custom=new SettingsScreen({defaults:{...DISPLAY_DEFAULTS,reducedMotion:true}});
 const input={down:new Set(),pressed:new Set(['ArrowUp'])};custom.update(.01,input);
 custom.update(.01,{down:new Set(),pressed:new Set(['Space'])});assert.equal(custom.options.reducedMotion,true);
});

test('all settings remain legible inside the 256 by 192 monochrome raster',()=>{
 const h=harness();let rectangles=0;
 const ctx={fillStyle:'#000',fillRect(x,y,w,height){
  rectangles++;assert.ok([x,y,w,height].every(Number.isFinite));assert.ok(x>=0&&y>=0&&x+w<=256&&y+height<=192);
  const rgb=this.fillStyle.match(/^rgb\((\d+),(\d+),(\d+)\)$/);assert.ok(rgb);assert.equal(rgb[1],rgb[2]);assert.equal(rgb[2],rgb[3]);
 }};
 for(let row=0;row<h.screen.rows.length;row++){h.screen.render(ctx,row%2===0);assert.ok(h.screen.selectionLabel.length);h.tap('ArrowDown');}
 assert.ok(rectangles>1000);assert.equal(h.screen.index,0);
});

test('resetting selection restores the top row and releases held menu adjustment',()=>{
 const h=harness();h.screen.index=100;assert.equal(h.screen.index,h.screen.rows.length-1);assert.equal(h.screen.top,h.screen.rows.length-7);
 h.screen.index=4.9;assert.equal(h.screen.index,4);assert.equal(h.screen.top,4);
 h.screen.index=-2;assert.equal(h.screen.index,0);assert.equal(h.screen.top,0);
 h.screen.index=NaN;assert.equal(h.screen.index,0);
 h.input.set('stick',['ArrowRight']);h.frame();assert.equal(h.screen.adjustDirection,1);
 h.screen.index=0;assert.equal(h.screen.adjustDirection,0);assert.equal(h.screen.adjustClock,0);
});


test('four sound sliders are independent, bounded to silence/full volume, and reset with the session',()=>{
 const h=harness();const keys=['musicVolume','gameVolume','keyboardVolume','monitorVolume'];
 for(let i=0;i<keys.length;i++){
  const key=keys[i];h.screen.index=h.screen.rows.findIndex(row=>row.key===key);const original={...h.screen.options};
  h.tap('ArrowRight');assert.equal(h.screen.options[key],Math.min(1,Math.round((original[key]+.05)*100)/100));
  for(const other of keys.filter(k=>k!==key))assert.equal(h.screen.options[other],original[other]);
  h.screen.setOptions({...h.screen.options,[key]:0});h.tap('ArrowLeft');assert.equal(h.screen.options[key],0);
  h.screen.setOptions({...h.screen.options,[key]:1});h.tap('ArrowRight');assert.equal(h.screen.options[key],1);
 }
 h.screen.index=h.screen.rows.findIndex(row=>row.key==='reset');h.tap('Space');assert.deepEqual(h.screen.options,DISPLAY_DEFAULTS);
});

test('tint slider changes immediately through the hue wheel and reset restores green',()=>{
 const h=harness();h.screen.index=1;assert.equal(h.screen.selectionLabel,'TINT: 190 DEG');
 h.tap('ArrowRight');assert.equal(h.screen.options.tint,195);assert.equal(h.changes.at(-1).tint,195);
 h.tap('ArrowLeft');assert.equal(h.screen.options.tint,190);assert.equal(h.tests,0);
 h.screen.setOptions({...h.screen.options,tint:0});h.tap('ArrowLeft');assert.equal(h.screen.options.tint,0);
 h.screen.setOptions({...h.screen.options,tint:355});h.tap('ArrowRight');assert.equal(h.screen.options.tint,360);
 h.tap('ArrowRight');assert.equal(h.screen.options.tint,360);
 h.tap('Space');assert.equal(h.tests,0,'tint action never opens the display test');
 h.screen.index=0;h.tap('Space');assert.equal(h.tests,1);
 h.screen.index=h.screen.rows.findIndex(row=>row.key==='reset');h.tap('Space');assert.equal(h.screen.options.tint,190);
});

test('sound labels, mobile visibility and display test order match the settings layout',()=>{
 for(const mobile of [false,true]){
  const screen=new SettingsScreen({mobile}),keys=screen.rows.map(r=>r.key);
  assert.equal(screen.selectionLabel,'DISPLAY TEST');
  const tail=['musicVolume','gameVolume','monitorVolume',...(mobile?['keyboardVolume','arrowsRight']:[]),'reset'];
  assert.deepEqual(keys.slice(-tail.length),tail);
  assert.equal(keys.includes('keyboardVolume'),mobile);
  assert.equal(keys.includes('arrowsRight'),mobile);
  assert.deepEqual(keys.slice(0,4),['test','tint','monitorBorder','environment']);
  if(mobile){screen.index=keys.indexOf('keyboardVolume');assert.equal(screen.selectionLabel,'KEYBOARD SOUNDS: 50%');}
  screen.setMobile(!mobile);assert.equal(screen.rows.some(r=>r.key==='keyboardVolume'),!mobile);
  assert.ok(screen.index<screen.rows.length);assert.equal(screen.navigation.count,screen.rows.length);
 }
});


test('mobile arrow side supports left/right adjustment, action toggle, and reset',()=>{
 const h=harness();h.screen.index=h.screen.rows.findIndex(row=>row.key==='arrowsRight');
 assert.equal(h.screen.selectionLabel,'ARROW KEYS: LEFT');
 h.tap('ArrowRight');assert.equal(h.screen.selectionLabel,'ARROW KEYS: RIGHT');
 h.tap('ArrowLeft');assert.equal(h.screen.selectionLabel,'ARROW KEYS: LEFT');
 h.tap('Space');assert.equal(h.screen.options.arrowsRight,true);
 h.tap('Space');assert.equal(h.screen.options.arrowsRight,false);
 h.tap('ArrowRight');h.screen.index=h.screen.rows.findIndex(row=>row.key==='reset');h.tap('Space');
 assert.equal(h.screen.options.arrowsRight,false);
});

test('degauss is an action and keeps settings open without changing their values',()=>{
 let pulses=0;const screen=new SettingsScreen({onDegauss:()=>pulses++});
 screen.index=screen.rows.findIndex(row=>row.key==='degauss');const before={...screen.options};
 screen.adjust(1);assert.equal(pulses,0);screen.activate();assert.equal(pulses,1);
 assert.equal(screen.selectionLabel,'DEGAUSS');assert.deepEqual(screen.options,before);
});


test('curvature and glass depth reach 200 percent and clamp there',()=>{
 const h=harness();
 for(const key of ['curvature','glass']){
  h.screen.index=h.screen.rows.findIndex(row=>row.key===key);
  h.screen.setOptions({...h.screen.options,[key]:1.95});h.tap('ArrowRight');
  assert.equal(h.screen.options[key],2);assert.match(h.screen.selectionLabel,/200%/);
  h.tap('ArrowRight');assert.equal(h.screen.options[key],2);
 }
});

test('monitor border toggles immediately and resets to on',()=>{
 const h=harness();h.screen.index=h.screen.rows.findIndex(row=>row.key==='monitorBorder');
 assert.equal(h.screen.selectionLabel,'MONITOR BORDER: ON');
 h.tap('ArrowLeft');assert.equal(h.changes.at(-1).monitorBorder,false);
 h.tap('Space');assert.equal(h.screen.options.monitorBorder,true);
 h.tap('Space');assert.equal(h.screen.options.monitorBorder,false);
 h.screen.index=h.screen.rows.findIndex(row=>row.key==='reset');h.tap('Space');
 assert.equal(h.screen.options.monitorBorder,true);
});


test('controls action is browser-only, opens once and preserves settings values',()=>{
 let opened=0;const screen=new SettingsScreen({onControls:()=>opened++});
 screen.index=screen.rows.findIndex(row=>row.key==='controls');const before={...screen.options};
 screen.adjust(1);assert.equal(opened,0);screen.activate();assert.equal(opened,1);
 assert.deepEqual(screen.options,before);assert.equal(screen.selectionLabel,'CONTROLS');
 screen.setMobile(true);assert.equal(screen.rows.some(row=>row.key==='controls'),false);
 screen.setMobile(false);assert.equal(screen.rows.filter(row=>row.key==='controls').length,1);
});

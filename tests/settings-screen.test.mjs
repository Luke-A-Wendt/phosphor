import test from 'node:test';
import assert from 'node:assert/strict';
import {SettingsScreen} from '../settings-screen.js';
import {InputState} from '../controls.js';
import {DISPLAY_DEFAULTS} from '../display-settings.js';

function harness(options=DISPLAY_DEFAULTS){
 const changes=[];let tests=0;
 const screen=new SettingsScreen({options,onChange:next=>changes.push(next),onTest:()=>tests++});
 const input=new InputState();
 const frame=(dt=1/120)=>{screen.update(dt,input);input.pressed.clear();};
 const tap=key=>{input.set('test',[key]);input.release('test');frame();frame();};
 return {screen,input,frame,tap,changes,get tests(){return tests;}};
}

test('settings preserve short joystick taps and repeat held adjustments after a delay',()=>{
 const h=harness();h.tap('ArrowRight');assert.equal(h.screen.options.ambient,.4);
 h.input.set('stick',['ArrowRight']);h.frame();assert.equal(h.screen.options.ambient,.45);
 for(let n=0;n<30;n++)h.frame();assert.equal(h.screen.options.ambient,.45);
 for(let n=0;n<30;n++)h.frame();assert.ok(h.screen.options.ambient>.45);
 h.input.clear();h.screen.release();h.frame();const value=h.screen.options.ambient;
 for(let n=0;n<60;n++)h.frame();assert.equal(h.screen.options.ambient,value);
 h.tap('ArrowDown');assert.equal(h.screen.index,1);h.tap('ArrowLeft');assert.equal(h.screen.options.reflection,.4);
});

test('numeric bounds, opposite directions, and diagonal navigation are safe',()=>{
 const h=harness({...DISPLAY_DEFAULTS,ambient:0});h.tap('ArrowLeft');assert.equal(h.screen.options.ambient,0);
 h.screen.setOptions({...DISPLAY_DEFAULTS,ambient:2});h.tap('ArrowRight');assert.equal(h.screen.options.ambient,2);
 h.input.set('stick',['ArrowLeft','ArrowRight']);h.frame();assert.equal(h.screen.options.ambient,2);
 h.input.clear();h.frame();h.input.set('stick',['ArrowDown','ArrowRight']);h.frame();
 assert.equal(h.screen.index,1);assert.equal(h.screen.options.reflection,DISPLAY_DEFAULTS.reflection);
});

test('environment and stable display use directions and the single action button',()=>{
 const h=harness();h.tap('ArrowDown');h.tap('ArrowDown');assert.equal(h.screen.index,2);
 h.tap('ArrowLeft');assert.equal(h.screen.options.environment,'none');
 h.tap('ArrowLeft');assert.equal(h.screen.options.environment,'mixed');
 h.tap('Space');assert.equal(h.screen.options.environment,'none');
 for(let n=0;n<7;n++)h.tap('ArrowDown');assert.equal(h.screen.index,9);
 h.tap('ArrowRight');assert.equal(h.screen.options.reducedMotion,true);
 h.tap('Space');assert.equal(h.screen.options.reducedMotion,false);
 h.tap('ArrowRight');h.tap('ArrowLeft');assert.equal(h.screen.options.reducedMotion,false);
});

test('test is only activated from its row and reset uses supplied session defaults',()=>{
 const h=harness();h.tap('Space');assert.equal(h.tests,0);
 for(let n=0;n<10;n++)h.tap('ArrowDown');assert.equal(h.screen.index,10);
 h.tap('ArrowRight');assert.equal(h.tests,0);
 h.tap('Space');assert.equal(h.tests,1);assert.equal(h.screen.index,10);
 h.tap('ArrowDown');h.tap('Space');assert.deepEqual(h.screen.options,DISPLAY_DEFAULTS);
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
 for(let row=0;row<12;row++){h.screen.render(ctx,row%2===0);assert.ok(h.screen.selectionLabel.length);h.tap('ArrowDown');}
 assert.ok(rectangles>1000);assert.equal(h.screen.index,0);
});

test('resetting selection restores the top row and releases held menu adjustment',()=>{
 const h=harness();h.screen.index=100;assert.equal(h.screen.index,11);assert.equal(h.screen.top,5);
 h.screen.index=4.9;assert.equal(h.screen.index,4);assert.equal(h.screen.top,4);
 h.screen.index=-2;assert.equal(h.screen.index,0);assert.equal(h.screen.top,0);
 h.screen.index=NaN;assert.equal(h.screen.index,0);
 h.input.set('stick',['ArrowRight']);h.frame();assert.equal(h.screen.adjustDirection,1);
 h.screen.index=0;assert.equal(h.screen.adjustDirection,0);assert.equal(h.screen.adjustClock,0);
});

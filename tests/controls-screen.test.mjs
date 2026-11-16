import test from 'node:test';
import assert from 'node:assert/strict';
import {movementCodes} from '../controls.js';
import {CONTROL_KEYS,CONTROLS_DESCRIPTION,drawControls} from '../controls-screen.js';

function render(held=new Set()){
 const pixels=new Uint8Array(256*192),calls=[];
 const ctx={fillStyle:'',fillRect(x,y,w,h){
  calls.push({x,y,w,h});
  const value=Number(this.fillStyle.match(/\d+/)[0]);
  for(let yy=y;yy<y+h;yy++)for(let xx=x;xx<x+w;xx++)pixels[yy*256+xx]=value;
 }};
 drawControls(ctx,held);return {pixels,calls};
}

test('keyboard diagram documents every mapped physical key and both back aliases',()=>{
 assert.deepEqual(CONTROL_KEYS.map(key=>key.code).sort(),[...Object.keys(movementCodes),'Escape','KeyQ'].sort());
 assert.equal(new Set(CONTROL_KEYS.map(key=>key.code)).size,CONTROL_KEYS.length);
 for(const key of CONTROL_KEYS){
  const expected=key.code==='Escape'||key.code==='KeyQ'?'back':movementCodes[key.code]==='Space'?'action':'move';
  assert.equal(key.group,expected,key.code);
 }
 assert.match(CONTROLS_DESCRIPTION,/numpad Enter/);assert.match(CONTROLS_DESCRIPTION,/Escape or Q returns to Settings/);
});

test('keyboard caps and their labels are within the phosphor safe area and do not overlap',()=>{
 for(const key of CONTROL_KEYS){
  assert.ok(key.x>=18&&key.y>=44&&key.x+key.w<=238&&key.y+key.h<=129);
  if(!key.arrow)assert.ok(key.label.length*4-1<=key.w-4,key.label+' fits its cap');
  for(const other of CONTROL_KEYS){
   if(other===key)continue;
   assert.ok(key.x+key.w<=other.x||other.x+other.w<=key.x||key.y+key.h<=other.y||other.y+other.h<=key.y,key.code+' overlaps '+other.code);
  }
 }
 for(const call of render().calls){
  for(const value of Object.values(call))assert.ok(Number.isInteger(value));
  assert.ok(call.x>=0&&call.y>=0&&call.x+call.w<=256&&call.y+call.h<=192);
 }
});

test('physical presses highlight only their own cap, including Enter aliases',()=>{
 const idle=render().pixels;
 for(const key of CONTROL_KEYS){
  const active=render(new Set([key.code])).pixels;
  let changed=0;
  for(let y=0;y<192;y++)for(let x=0;x<256;x++)if(idle[y*256+x]!==active[y*256+x]){
   changed++;assert.ok(x>=key.x&&x<key.x+key.w&&y>=key.y&&y<=key.y+key.h,key.code+' changes only its cap');
  }
  assert.ok(changed>20,key.code+' visibly lights');
 }
 assert.deepEqual(render(new Set(['KeyZ'])).pixels,idle);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {PowerSequence,POWER_ON_SECONDS,POWER_OFF_SECONDS} from '../power-sequence.js';

const fullyOn=power=>{power.startOn();power.update(POWER_ON_SECONDS);};
test('slower thermal warmup has a dark heater interval and monotonic finite emission',()=>{
 const power=new PowerSequence();assert.equal(power.phase,'off');assert.equal(power.busy,false);
 power.startOn();assert.equal(power.update(.08).level,0);let last=0;
 for(let i=0;i<250;i++){
  const state=power.update(1/120);
  for(const value of Object.values(state))assert.ok(Number.isFinite(value)&&value>=0&&value<=1);
  assert.ok(state.level>=last);last=state.level;assert.ok(state.vertical>=.965);
 }
 assert.equal(POWER_ON_SECONDS,2);assert.equal(power.phase,'on');assert.equal(power.busy,false);
 assert.deepEqual(power.state,{level:1,vertical:1,horizontal:1,spot:0,bend:0,focus:0});
 const cold=new PowerSequence();cold.startOn();assert.ok(cold.update(.4).level<.1);assert.ok(cold.update(.8).level>.7);assert.equal(cold.phase,'starting');
});
test('slower shutdown loses vertical drive before horizontal while beam current decays',()=>{
 const power=new PowerSequence();fullyOn(power);power.startOff();
 const early=power.update(.45);assert.ok(early.vertical<.08);assert.equal(early.horizontal,1);assert.ok(early.level<.5&&early.level>.4);
 const middle=power.update(.95);assert.ok(middle.horizontal<.02);assert.ok(middle.spot>0);assert.ok(middle.level<early.level);
 assert.equal(power.phase,'stopping');power.update(.2);assert.equal(power.phase,'stopping');
 const final=power.update(.21);assert.equal(POWER_OFF_SECONDS,1.8);assert.equal(power.phase,'off');assert.equal(final.level,0);assert.equal(final.spot,0);
});
test('reduced motion retains full deflection and fades without a spot',()=>{
 const power=new PowerSequence({reducedMotion:true});power.startOn();
 for(let i=0;i<210;i++){const s=power.update(.01);assert.equal(s.vertical,1);assert.equal(s.horizontal,1);assert.equal(s.spot,0);assert.equal(s.bend,0);assert.equal(s.focus,0);}
 power.startOff();let last=1;
 for(let i=0;i<181;i++){const s=power.update(.01);assert.equal(s.vertical,1);assert.equal(s.horizontal,1);assert.equal(s.spot,0);assert.equal(s.bend,0);assert.equal(s.focus,0);assert.ok(s.level<=last);last=s.level;}
 assert.equal(power.phase,'off');
});
test('invalid deltas cannot corrupt power and restart creates a clean warmup',()=>{
 const power=new PowerSequence();power.startOff();assert.equal(power.phase,'off');power.startOn();
 for(const dt of [NaN,Infinity,-1,0])assert.equal(power.update(dt).level,0);
 power.update(.6);power.startOff();power.update(POWER_OFF_SECONDS);power.startOn();assert.equal(power.state.level,0);assert.equal(power.phase,'starting');
});
test('interrupting warmup never flashes brighter and retains current deflection',()=>{
 for(const reducedMotion of [false,true])for(const warmup of [0,.08,.3,.9,1.8]){
  const power=new PowerSequence({reducedMotion});power.startOn();power.update(warmup);
  const before=power.state;assert.deepEqual(power.startOff(),{...before,spot:0});
  let last=before.level;
  for(let i=0;i<181;i++){
   const state=power.update(.01);assert.ok(state.level<=last);
   assert.ok(state.spot<=before.level*.12);last=state.level;
   if(i===12)assert.deepEqual(power.startOff(),state,'repeated stop is idempotent');
  }
  assert.equal(power.phase,'off');assert.equal(power.state.spot,0);
 }
});
test('supply-current and deflection decay stay monotonic before the final off state',()=>{
 const power=new PowerSequence();fullyOn(power);power.startOff();let previous=power.state;
 for(let i=0;i<179;i++){
  const state=power.update(.01);
  assert.ok(state.level<=previous.level);assert.ok(state.vertical<=previous.vertical);assert.ok(state.horizontal<=previous.horizontal);
  previous=state;
 }
 assert.ok(previous.spot<.001);assert.equal(previous.level,0);
});

test('focus settles during warmup and bowed deflection accompanies shutdown',()=>{
 const power=new PowerSequence();power.startOn();const cold=power.state;
 const warming=power.update(.5);assert.ok(warming.focus<cold.focus);assert.ok(warming.bend<cold.bend);assert.ok(warming.level>0);
 power.update(POWER_ON_SECONDS);power.startOff();const initial=power.state;
 assert.equal(initial.bend,0);assert.equal(initial.focus,0);
 const bowed=power.update(.25);assert.ok(bowed.bend>.015&&bowed.bend<.03);assert.ok(bowed.focus>.3&&bowed.focus<.5);
 const converged=power.update(.7);assert.ok(converged.bend<bowed.bend);assert.ok(converged.vertical<.01);assert.ok(converged.horizontal>.1);
 power.update(POWER_OFF_SECONDS);assert.equal(power.state.bend,0);assert.equal(power.state.focus,0);
});

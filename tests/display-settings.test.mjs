import test from 'node:test';
import assert from 'node:assert/strict';
import {DISPLAY_DEFAULTS,ENVIRONMENTS,normalizeSettings} from '../display-settings.js';
import {TEST_PATTERNS,drawCalibration} from '../calibration.js';
import {phosphorColors,colorCSS} from '../phosphor-color.js';

const numericKeys=['brightness','persistence','bloom','scanlines','curvature','glass','ambient','reflection'];

test('missing or invalid stored settings fall back to independent usable defaults',()=>{
  for(const saved of [undefined,null,false,'bad settings',23]){
    const result=normalizeSettings(saved,true);
    assert.equal(result.reducedMotion,true);
    for(const key of numericKeys)assert.equal(result[key],DISPLAY_DEFAULTS[key]);
    assert.equal(result.environment,'diffuse');
  }
  const copy=normalizeSettings();copy.brightness=0;copy.environment='none';
  assert.equal(normalizeSettings().brightness,1.75);
  assert.equal(normalizeSettings().environment,'diffuse');
});

test('numeric settings are bounded and non-finite or string values cannot corrupt the renderer',()=>{
  const below=normalizeSettings(Object.fromEntries(numericKeys.map(k=>[k,-10])));
  assert.equal(below.brightness,.3);
  for(const k of numericKeys.filter(k=>k!=='brightness'))assert.equal(below[k],0);
  const above=normalizeSettings(Object.fromEntries(numericKeys.map(k=>[k,100])));
  for(const k of numericKeys)assert.equal(above[k],2);
  for(const invalid of [NaN,Infinity,-Infinity,'1.5',null]){
    const settings=normalizeSettings(Object.fromEntries(numericKeys.map(k=>[k,invalid])));
    for(const k of numericKeys)assert.equal(settings[k],DISPLAY_DEFAULTS[k]);
  }
});

test('all environment presets and explicit motion preferences survive JSON storage round trips',()=>{
  for(const environment of ENVIRONMENTS){
    const preferences={environment,ambient:.7,reflection:1.4,glass:.9,reducedMotion:false};
    const restored=normalizeSettings(JSON.parse(JSON.stringify(preferences)),true);
    for(const [k,v] of Object.entries(preferences))assert.equal(restored[k],v);
  }
  assert.equal(normalizeSettings({environment:'unrecognized'}).environment,'diffuse');
  assert.equal(normalizeSettings({reducedMotion:'false'},true).reducedMotion,true);
  assert.equal(normalizeSettings({reducedMotion:true},false).reducedMotion,true);
});

test('each calibration pattern draws a finite monochrome landscape raster',()=>{
  for(let pattern=0;pattern<TEST_PATTERNS.length;pattern++){
    for(const time of [0,1.37,60]){
      let draws=0;
      const ctx={fillStyle:'#000',strokeStyle:'#000',lineWidth:1,
        fillRect(x,y,w,h){
          draws++;assert.ok([x,y,w,h].every(Number.isFinite));assert.ok(w>=0&&h>=0);
          assert.ok(x>=0&&y>=0&&x+w<=256&&y+h<=192,'pattern remains in source bounds');
          if(this.fillStyle.startsWith('rgb(')){const rgb=this.fillStyle.match(/\d+/g);assert.equal(rgb[0],rgb[1]);assert.equal(rgb[1],rgb[2]);}
        },
        beginPath(){},arc(...args){assert.ok(args.every(Number.isFinite));},stroke(){}
      };
      drawCalibration(ctx,time,pattern);assert.ok(draws>100);
    }
  }
});


test('sound defaults preserve calibrated volume and all sound values clamp independently to zero through one',()=>{
 const expected={musicVolume:1,gameVolume:1,keyboardVolume:.5,monitorVolume:.5};
 for(const [key,value] of Object.entries(expected)){
  assert.equal(normalizeSettings()[key],value);
  assert.equal(normalizeSettings({[key]:-1})[key],0);
  assert.equal(normalizeSettings({[key]:5})[key],1);
  for(const invalid of [NaN,Infinity,'0.5',null])assert.equal(normalizeSettings({[key]:invalid})[key],value);
 }
 const copied=normalizeSettings(expected);copied.musicVolume=0;assert.equal(DISPLAY_DEFAULTS.musicVolume,1);
 const mixed=normalizeSettings({musicVolume:0,gameVolume:.8,keyboardVolume:0,monitorVolume:.1,brightness:1.73});
 assert.equal(mixed.musicVolume,0);assert.equal(mixed.gameVolume,.8);assert.equal(mixed.keyboardVolume,0);assert.equal(mixed.monitorVolume,.1);assert.equal(mixed.brightness,1.73);
});

test('tint is bounded across the complete hue wheel and invalid values restore the original green',()=>{
 assert.equal(DISPLAY_DEFAULTS.tint,125);
 assert.equal(normalizeSettings({tint:-50}).tint,0);
 assert.equal(normalizeSettings({tint:500}).tint,360);
 for(const invalid of [NaN,Infinity,-Infinity,'240',null])assert.equal(normalizeSettings({tint:invalid}).tint,125);
 assert.equal(normalizeSettings(JSON.parse(JSON.stringify({tint:240}))).tint,240);
 const green=phosphorColors(125);
 assert.deepEqual(green.spectrum,[.035,1,.115]);assert.deepEqual(green.glass,[.20,.72,.30]);assert.deepEqual(green.coating,[.10,.70,.24]);
 assert.deepEqual(green.beam,[37,229,92]);assert.deepEqual(green.room,[55,90,62]);assert.deepEqual(green.page,[3,7,5]);
 assert.equal(colorCSS(green.beam),'rgba(37,229,92,1)');
 for(const [hue,channel] of [[0,0],[120,1],[240,2]]){
  const color=phosphorColors(hue).spectrum;assert.equal(color[channel],Math.max(...color));assert.ok(color[channel]>.95);
 }
 for(let hue=0;hue<=360;hue+=5){
  const colors=phosphorColors(hue);
  for(const key of ['spectrum','glass','coating'])assert.ok(colors[key].every(v=>Number.isFinite(v)&&v>=0&&v<=1));
  for(const key of ['beam','line','core','spot','ambient','room','page'])assert.ok(colors[key].every(v=>Number.isFinite(v)&&v>=0&&v<=255));
 }
 assert.deepEqual(phosphorColors(0),phosphorColors(360));
});


test('mobile arrow side defaults left and only accepts explicit booleans',()=>{
 assert.equal(DISPLAY_DEFAULTS.arrowsRight,false);
 for(const invalid of [undefined,null,0,1,'true','right',{}])assert.equal(normalizeSettings({arrowsRight:invalid}).arrowsRight,false);
 assert.equal(normalizeSettings({arrowsRight:true}).arrowsRight,true);
 assert.equal(normalizeSettings({arrowsRight:false}).arrowsRight,false);
});

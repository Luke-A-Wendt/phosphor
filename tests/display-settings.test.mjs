import test from 'node:test';
import assert from 'node:assert/strict';
import {DISPLAY_DEFAULTS,ENVIRONMENTS,normalizeSettings} from '../display-settings.js';
import {TEST_PATTERNS,drawCalibration} from '../calibration.js';

const numericKeys=['brightness','persistence','bloom','scanlines','curvature','glass','ambient','reflection'];

test('missing or invalid stored settings fall back to independent usable defaults',()=>{
  for(const saved of [undefined,null,false,'bad settings',23]){
    const result=normalizeSettings(saved,true);
    assert.equal(result.reducedMotion,true);
    for(const key of numericKeys)assert.equal(result[key],DISPLAY_DEFAULTS[key]);
    assert.equal(result.environment,'diffuse');
  }
  const copy=normalizeSettings();copy.brightness=0;copy.environment='none';
  assert.equal(normalizeSettings().brightness,1.08);
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

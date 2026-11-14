import test from 'node:test';
import assert from 'node:assert/strict';
import {phosphorColors,colorCSS} from '../phosphor-color.js';
import {CRTDisplay} from '../crt.js';

function renderFallback(power,tint=125,signal=0){
 const calls=[],stack=[];
 const ctx={globalAlpha:1,globalCompositeOperation:'source-over',transform:[1,1],
  save(){stack.push({globalAlpha:this.globalAlpha,globalCompositeOperation:this.globalCompositeOperation,transform:[...this.transform]});},
  restore(){Object.assign(this,stack.pop());},
  translate(){},scale(x,y){this.transform=[x,y];},beginPath(){},roundRect(){},clip(){},
  drawImage(...args){calls.push({args,kind:'image',alpha:this.globalAlpha,transform:[...this.transform]});},
  fillRect(){calls.push({kind:'fill',color:this.fillStyle,alpha:this.globalAlpha,transform:[...this.transform],op:this.globalCompositeOperation});},
  createLinearGradient(){return {kind:'line',stops:[],addColorStop(...p){this.stops.push(p);}};},
  createRadialGradient(){return {kind:'spot',stops:[],addColorStop(...p){this.stops.push(p);}};}
 };
 const buffer={fillRect(){},drawImage(){},getImageData(){return {data:new Uint8ClampedArray(256*192*4).fill(signal)};}};
 CRTDisplay.prototype._renderFallback.call({fallback:ctx,_fallbackContext:buffer,_fallbackBuffer:{},source:{},canvas:{width:800,height:600},power,options:{tint,persistence:1,bloom:1,brightness:1,scanlines:1,ambient:1,environment:'none',reflection:0}},1/60);
 return calls;
}

test('Canvas fallback visibly changes phosphor emission during warmup without weakening its green tint',()=>{
 for(const level of [0,.2,.7,1]){
  const calls=renderFallback({level,horizontal:1,vertical:1,spot:0});
  assert.deepEqual(calls.filter(c=>c.kind==='image').map(c=>c.alpha),[.35*level,level]);
  const tint=calls.find(c=>c.color==='rgba(37,229,92,1)');assert.equal(tint.op,'multiply');assert.equal(tint.alpha,1,'phosphor stays green at dim warm-up levels');
 }
});

test('Canvas shutdown compresses emission and draws line/spot while ambient glass remains unscaled',()=>{
 const calls=renderFallback({level:.3,horizontal:.2,vertical:.01,spot:.05});
 for(const image of calls.filter(c=>c.kind==='image'))assert.deepEqual(image.transform,[.2,.01]);
 assert.ok(calls.some(c=>c.color?.kind==='line'));
 assert.ok(calls.some(c=>c.color?.kind==='spot'));
 const coating=calls.find(c=>typeof c.color==='string'&&c.color.startsWith('rgba(11,30,16,'));
 assert.deepEqual(coating.transform,[1,1]);assert.equal(coating.alpha,1);
});

test('fallback tint reaches beam, collapsed line and spot, including bent shutdown',()=>{
 for(const tint of [0,60,240,300]){
  const colors=phosphorColors(tint),calls=renderFallback({level:.3,horizontal:.5,vertical:.03,spot:.06,bend:.015,focus:.4},tint);
  assert.ok(calls.some(c=>c.color===colorCSS(colors.beam)&&c.op==='multiply'));
  assert.ok(calls.some(c=>c.color?.kind==='line'&&c.color.stops.some(([,v])=>v.startsWith(colorCSS(colors.core).split(',1)')[0]))));
  assert.ok(calls.some(c=>c.color?.kind==='spot'&&c.color.stops.some(([,v])=>v===colorCSS(colors.spot,.18))));
  assert.equal(calls.filter(c=>c.kind==='image').length,128,'two layers across sixty-four bowed columns');
  for(const call of calls.filter(c=>c.kind==='image'))assert.ok(call.args.slice(1).every(Number.isFinite));
 }
});

test('live renderer options accept tint changes and restore the green default',()=>{
 const renderer={options:{tint:125}};
 CRTDisplay.prototype.setOptions.call(renderer,{tint:240});assert.equal(renderer.options.tint,240);
 CRTDisplay.prototype.setOptions.call(renderer,{tint:900});assert.equal(renderer.options.tint,360);
 CRTDisplay.prototype.setOptions.call(renderer,{tint:125});assert.equal(renderer.options.tint,125);
});

test('fallback collapsed line follows source energy instead of fixed mobile brightness',()=>{
 const power={level:.4,horizontal:.7,vertical:.01,spot:0,bend:.02,focus:.3};
 const alpha=calls=>Math.max(...calls.filter(c=>c.color?.kind==='line').flatMap(c=>c.color.stops.map(([,color])=>Number(color.slice(color.lastIndexOf(',')+1,-1)))));
 const dark=alpha(renderFallback(power,125,0)),lit=alpha(renderFallback(power,125,200));
 assert.ok(lit>dark*10,'bright raster concentrates more energy than a black one');
 assert.ok(lit<1&&dark>=0,'concentration remains bounded');
});

function targetHarness(byteTargets=false,rejectFloat=false){
 const formats=[],cleared=[];let currentFormat,currentFbo;
 const gl={TEXTURE_2D:1,TEXTURE_MIN_FILTER:2,TEXTURE_MAG_FILTER:3,LINEAR:4,NEAREST:5,TEXTURE_WRAP_S:6,TEXTURE_WRAP_T:7,CLAMP_TO_EDGE:8,RGBA16F:9,RGBA8:10,RGBA:11,HALF_FLOAT:12,UNSIGNED_BYTE:13,FRAMEBUFFER:14,COLOR_ATTACHMENT0:15,FRAMEBUFFER_COMPLETE:16,COLOR_BUFFER_BIT:17,
 createTexture:()=>({}),createFramebuffer:()=>({}),bindTexture(){},texParameteri(){},bindFramebuffer(_target,fbo){currentFbo=fbo;},framebufferTexture2D(){},viewport(){},clearColor(){},clear(){cleared.push(currentFbo);},deleteTexture(){},deleteFramebuffer(){},
 texImage2D(...args){currentFormat=args[2];formats.push([args[2],args[7]]);},
 checkFramebufferStatus(){return rejectFloat&&currentFormat===this.RGBA16F?0:this.FRAMEBUFFER_COMPLETE;}};
 const renderer={gl,_byteTargets:byteTargets,_targets:[]};return {renderer,gl,formats,cleared};
}
test('mobile encoded targets use RGBA8 and advertised-but-broken float targets retry without dropping optics',()=>{
 const bytes=targetHarness(true);CRTDisplay.prototype._target.call(bytes.renderer,256,192,false);
 assert.deepEqual(bytes.formats,[[bytes.gl.RGBA8,bytes.gl.UNSIGNED_BYTE]]);
 const retry=targetHarness(false,true);const oldState={fbo:{old:true}};retry.renderer._targets.push(oldState);const target=CRTDisplay.prototype._target.call(retry.renderer,800,600);
 assert.deepEqual(retry.formats,[[retry.gl.RGBA16F,retry.gl.HALF_FLOAT],[retry.gl.RGBA8,retry.gl.UNSIGNED_BYTE]]);
 assert.equal(retry.renderer._byteTargets,true);assert.equal(retry.renderer._targets[1],target);assert.ok(retry.cleared.includes(oldState.fbo),'old float-state energy is cleared before encoded decoding');
 assert.match(retry.renderer._backend,/layered glass/);
});

test('every encoded pipeline pass receives the same buffer mode',()=>{
 for(const byte of [false,true]){
  const uniforms=[],gl={useProgram(){},bindFramebuffer(){},viewport(){},drawArrays(){},uniform1f(location,value){uniforms.push([location,value]);}};
  CRTDisplay.prototype._pass.call({gl,_byteTargets:byte,canvas:{width:800,height:600}},{p:{},uniforms:{bufferMode:'mode'}},null,{});
  assert.deepEqual(uniforms,[['mode',byte?1:0]]);
 }
});

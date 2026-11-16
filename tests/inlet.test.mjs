import test from 'node:test';
import assert from 'node:assert/strict';
import {sampleInletLight,sampleInletBounce,inletLightColor,inletMaterialColor,drawInletFallback} from '../inlet.js';

const width=64,height=48;
function image(fill=()=>0){const data=new Uint8ClampedArray(width*height*4);for(let y=0;y<height;y++)for(let x=0;x<width;x++){const i=(y*width+x)*4;data[i]=data[i+1]=data[i+2]=fill(x/width,y/height);data[i+3]=255;}return data;}
const sample=(data,edge,along,power={level:1},options={})=>sampleInletLight(data,width,height,edge,along,options,power);

test('nearby phosphor brightens its own inlet edge instead of creating a uniform frame',()=>{
 const data=image((x,y)=>x>.12&&x<.38&&y<.13?255:0);
 const local=sample(data,'top',.25),far=sample(data,'top',.8),opposite=sample(data,'bottom',.25);
 assert.ok(local>.25);assert.ok(local>far*10);assert.equal(opposite,0);
 const mirrored=image((x,y)=>x>.62&&x<.88&&y>.87?255:0);
 assert.ok(sample(mirrored,'bottom',.75)>.25);assert.equal(sample(mirrored,'top',.75),0);
});

test('black phosphor and power-off produce no reflected emission; brightness and power scale it',()=>{
 const black=image(),white=image(()=>255);
 for(const edge of ['top','bottom','left','right']){
  assert.equal(sample(black,edge,.5),0);assert.equal(sample(white,edge,.5,{level:0}),0);
  const full=sample(white,edge,.5),half=sample(white,edge,.5,{level:.5});
  assert.ok(Math.abs(half/full-.5)<1e-9);
  assert.ok(Math.abs(sample(white,edge,.5,{level:1},{brightness:2})/full-2)<1e-9);
 }
});

test('collapsed deflection no longer lights the top and bottom like an expanded image',()=>{
 const white=image(()=>255),collapsed={level:1,horizontal:1,vertical:.01};
 assert.equal(sample(white,'top',.5,collapsed),0);assert.equal(sample(white,'bottom',.5,collapsed),0);
 assert.ok(sample(white,'left',.5,collapsed)>0);
});

test('reflected color follows phosphor tint and zero energy remains black',()=>{
 assert.deepEqual(inletLightColor(0,125),[0,0,0]);
 const green=inletLightColor(.05,125),red=inletLightColor(.05,0),blue=inletLightColor(.05,240);
 assert.ok(green[1]>green[0]&&green[1]>green[2]);assert.ok(red[0]>red[1]&&red[0]>red[2]);assert.ok(blue[2]>blue[0]&&blue[2]>blue[1]);
 for(const tint of [0,125,240,360])for(const value of inletLightColor(.2,tint))assert.ok(value>=0&&value<=255&&Number.isFinite(value));
});

test('the launcher bypasses inlet allocation and drawing entirely',()=>{
 const cache={};const poison=new Proxy({},{get(){throw new Error('must not access the launcher canvas');}});
 assert.equal(drawInletFallback(poison,poison,poison,{blackBackground:true},{},cache),cache);
});

test('fallback insets the existing image without resizing the output and reuses its caches',()=>{
 const calls=[],created=[],rectangles=[],joins=[];
 const gradient=()=>({addColorStop(){}});
 const makeContext=()=>({globalCompositeOperation:'source-over',
  save(){},restore(){},setTransform(){},fillRect(){},fill(){},beginPath(){},roundRect(...args){rectangles.push(args);},clip(){},stroke(){},translate(){},scale(){},
  moveTo(x,y){joins.push([x,y]);},lineTo(x,y){joins.at(-1).push(x,y);},
  drawImage(...args){calls.push(args);},createLinearGradient:gradient,createRadialGradient:gradient,
  getImageData:()=>({data:image(()=>128)})});
 const doc={createElement(){const canvas={width:0,height:0,ownerDocument:doc,getContext:()=>makeContext()};created.push(canvas);return canvas;}};
 const rendered={width:800,height:600,ownerDocument:doc},phosphor={width:256,height:192,ownerDocument:doc};
 const ctx=makeContext(),options={tint:125,ambient:1.5,curvature:.75,brightness:1.75};
 const cache=drawInletFallback(ctx,rendered,phosphor,options,{level:1});
 assert.equal(created.length,2);assert.equal(rendered.width,800);assert.equal(rendered.height,600);
 assert.ok(calls.some(args=>args[0]===cache.copy&&args.slice(1).join(',')==='32,24,736,552'));
 assert.ok(Math.abs(rectangles[0][4]-600/2*.045)<1e-9,'outer corners remain sharply molded');
 assert.ok(Math.abs(rectangles[1][4]-600/2*.052*.92)<1e-9,'inner corners match the new glass aperture');
 assert.equal(joins.length,4);assert.ok(joins.every(join=>join.length===4&&join.every(Number.isFinite)));
 assert.equal(drawInletFallback(ctx,rendered,phosphor,options,{level:1},cache),cache);assert.equal(created.length,2);
});


test('matte inlet has a planar slope, narrow contact, raised edge and dark outer chamfer',()=>{
 assert.deepEqual(inletMaterialColor(.5,0),[0,0,0]);
 const inner=inletMaterialColor(0,1.5),face=inletMaterialColor(.5,1.5),shoulder=inletMaterialColor(1,1.5);
 assert.deepEqual(inner,[0,0,0]);assert.ok(face.every(value=>value>=18&&value<=26));
 assert.ok(shoulder[1]<face[1]);assert.ok(face[1]-face[2]<4,'material is restrained olive-gray, not a fixed green emitter');
 for(const t of [.12,.68])assert.ok(inletMaterialColor(t,1.5).every((value,index)=>Math.abs(value-face[index])<1e-6),'main face remains planar rather than rounded');
 assert.ok(inletMaterialColor(.04,1.5)[1]<face[1],'contact shadow stays close to the glass');
 assert.ok(inletMaterialColor(.80,1.5)[1]>face[1],'narrow outer ledge catches room light');
});


test('the screen interior contributes a weaker broad bounce and still respects power and darkness',()=>{
 const center=image((x,y)=>x>.3&&x<.7&&y>.3&&y<.7?255:0),black=image();
 const bounce=(data,power={level:1})=>sampleInletBounce(data,width,height,'top',.5,{},power);
 assert.ok(bounce(center)>0);assert.ok(bounce(center)<sample(image(()=>255),'top',.5));
 assert.equal(bounce(black),0);assert.equal(bounce(center,{level:0}),0);
});

test('disabled monitor border bypasses Canvas drawing and allocations',()=>{
 const cache={};const poison=new Proxy({},{get(){throw new Error('border must be bypassed');}});
 assert.equal(drawInletFallback(poison,poison,poison,{monitorBorder:false},{},cache),cache);
});

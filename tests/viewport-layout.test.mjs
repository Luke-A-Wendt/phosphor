import test from 'node:test';
import assert from 'node:assert/strict';
import {solveViewportLayout} from '../viewport-layout.js';

const near=(actual,expected,message)=>assert.ok(Math.abs(actual-expected)<1e-8,message||`${actual} differs from ${expected}`);
function within(rect,width,height){
 for(const value of Object.values(rect))assert.ok(Number.isFinite(value));
 assert.ok(rect.x>=-1e-8&&rect.y>=-1e-8&&rect.width>=0&&rect.height>=0);
 assert.ok(rect.x+rect.width<=width+1e-8&&rect.y+rect.height<=height+1e-8);
}
function verify(layout){
 const {width,height}=layout.viewport;
 for(const key of ['screen','arrows','enter','escape'])within(layout[key],width,height);
 near(layout.screen.width*3,layout.screen.height*4,'the CRT stays 4:3');
 if(layout.keySize>0){
  const [left,right]=[layout.arrows,layout.enter].sort((a,b)=>a.x-b.x);
  near(layout.screen.x-left.x-left.width,layout.screenGap);
  near(right.x-layout.screen.x-layout.screen.width,layout.screenGap);
  assert.ok(layout.escape.y+layout.escape.height<=layout.arrows.y+1e-8,'Escape has its own vertical space');
  near(layout.arrows.y,layout.enter.y);near(layout.arrows.height,layout.enter.height);
 }
}

test('S9 browser viewport fills height and spends spare width on larger keys, not wide gaps',()=>{
 const layout=solveViewportLayout({width:780,height:312,touch:true});verify(layout);
 near(layout.screen.height,312);near(layout.screen.width,416);
 near(layout.keySize,81.5);near(layout.screenGap,8);
 near(layout.arrows.x,6);near(layout.enter.x+layout.enter.width,774);
 assert.ok(layout.screen.x+layout.screen.width/2>390,'the CRT shifts right for the wider arrow cluster');
});

test('right-hand arrows swap positions without resizing keys or CRT, moving Escape, or changing clearances',()=>{
 const viewports=[{width:780,height:312},{width:740,height:360},{width:640,height:360},{width:1024,height:768},{width:1600,height:400},{width:900,height:400,leftInset:28,rightInset:4,topInset:3,bottomInset:9}];
 for(const viewport of viewports){
  const original=solveViewportLayout({...viewport,touch:true});
  assert.deepEqual(solveViewportLayout({...viewport,touch:true,arrowsRight:false}),original);
  const swapped=solveViewportLayout({...viewport,touch:true,arrowsRight:true});verify(swapped);
  assert.deepEqual(swapped.escape,original.escape,'Escape stays exactly where it was');
  for(const field of ['keySize','keyGap','screenGap'])assert.equal(swapped[field],original[field]);
  for(const key of ['screen','arrows','enter'])for(const field of ['y','width','height'])assert.equal(swapped[key][field],original[key][field]);
  near(swapped.enter.x,original.arrows.x);
  near(swapped.arrows.x+swapped.arrows.width,original.enter.x+original.enter.width);
  near(original.screen.x-swapped.screen.x,original.arrows.width-original.enter.width);
  const midpoint=(original.arrows.x+original.enter.x+original.enter.width)/2;
  assert.ok(swapped.screen.x+swapped.screen.width/2<midpoint);
  assert.deepEqual(solveViewportLayout({...viewport,arrowsRight:true}),solveViewportLayout(viewport),'desktop is unchanged');
 }
});

test('full height is retained while a narrower landscape still fits touch targets',()=>{
 const layout=solveViewportLayout({width:740,height:360,touch:true});verify(layout);
 near(layout.screen.height,360);near(layout.keySize,55.5);near(layout.screenGap,8);
});

test('on narrow landscape and tablets the keys remain usable and the CRT contains to fit',()=>{
 for(const [width,height] of [[640,360],[568,320],[1024,768],[844,390],[390,844]]){
  const layout=solveViewportLayout({width,height,touch:true});verify(layout);
  assert.ok(layout.keySize>=44);assert.ok(layout.screen.height<=height);
  assert.ok(layout.screen.width>0);
 }
});

test('ultrawide layouts keep tight equal glass clearances and place spare width outside the controls',()=>{
 const layout=solveViewportLayout({width:1600,height:400,touch:true});verify(layout);
 near(layout.screen.height,400);near(layout.screenGap,8);
 assert.ok(layout.keySize>100);assert.ok(layout.arrows.x>100);
 near(layout.arrows.x,1600-layout.enter.x-layout.enter.width);
});

test('safe areas shift the composition without stealing height twice or making the gaps unequal',()=>{
 const layout=solveViewportLayout({width:900,height:400,leftInset:28,rightInset:4,topInset:3,bottomInset:9,touch:true});verify(layout);
 near(layout.screen.height,388);near(layout.screen.y,3);
 assert.ok(layout.arrows.x>=28&&layout.enter.x+layout.enter.width<=896);
 assert.ok(layout.escape.y>=3&&layout.arrows.y+layout.arrows.height<=391);
 near(layout.arrows.x-28,896-layout.enter.x-layout.enter.width);
});

test('desktop contains and centers a 4:3 CRT without reserving mobile controls',()=>{
 for(const [width,height] of [[1440,900],[600,900],[256,192]]){
  const layout=solveViewportLayout({width,height});verify(layout);
  near(layout.screen.x+layout.screen.width/2,width/2);near(layout.screen.y+layout.screen.height/2,height/2);
  assert.equal(layout.keySize,0);assert.equal(layout.arrows.width,0);
 }
});

test('zero, invalid, extreme insets and tiny viewports stay finite and do not overlap the viewport edges',()=>{
 for(const options of [{},{width:0,height:0,touch:true},{width:NaN,height:Infinity,touch:true},{width:-1,height:100,touch:true},{width:100,height:40,touch:true},{width:20,height:10,touch:true},{width:300,height:180,leftInset:400,rightInset:800,topInset:600,bottomInset:500,touch:true}]){
  verify(solveViewportLayout(options));
 }
});

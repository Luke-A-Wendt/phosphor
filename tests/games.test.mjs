import assert from 'node:assert/strict';
import test from 'node:test';
import {createGame,GAME_INFO,pixelText} from '../games.js';
const input=(keys=[],pressed=[])=>({down:new Set(keys),pressed:new Set(pressed),pointer:{active:false,x:80,y:100},sound:()=>{}});
const canvas={fillStyle:'#000',fillRect(...values){assert.ok(values.every(Number.isFinite),'finite raster coordinates');assert.ok(values[2]>=0&&values[3]>=0,'nonnegative dimensions');if(this.fillStyle.startsWith('rgb')){const channels=this.fillStyle.match(/\d+/g);assert.equal(channels[0],channels[1]);assert.equal(channels[1],channels[2]);}}};
for(const info of GAME_INFO){const game=createGame(info.id);assert.equal(game.status,'ready');game.render(canvas);game.update(1/60,input(['Space'],['Space']));assert.equal(game.status,'playing');for(let f=0;f<3600;f++){const keys=['Space',f%240<120?'ArrowLeft':'ArrowRight'];if(f%180<90)keys.push('ArrowUp');game.update(1/60,input(keys,f%45===0?['Space','ArrowUp']:[]));game.render(canvas);assert.ok(Number.isFinite(game.score));if(['over','won'].includes(game.status)){game.update(1/60,input(['Space'],['Space']));assert.equal(game.status,'playing');}}game.restart();assert.equal(game.score,0);assert.equal(game.status,'ready');}
// The outer Start button emits a one-tick press without a held key.
for (const info of GAME_INFO) {
 const game=createGame(info.id);
 game.update(1/120,input([],['Space']));
 assert.equal(game.status,'playing',info.id+' starts from button');
 assert.equal(game.score,0,info.id+' start does not also trigger a scored action');
 game.update(1/120,input());
 assert.equal(game.status,'playing');
 game.status='over';game._score=123;
 game.update(1/120,input([],['Space']));
 assert.equal(game.status,'playing',info.id+' restarts after loss');
 assert.equal(game.score,0,info.id+' restart resets score');
}
const t=createGame('tetris');t.status='playing';t.board[19]=Array(10).fill(1);t.board[19][4]=0;t.shape=[[1]];t.x=4;t.y=19;t.update(1/60,input([],['Space']));assert.equal(t.clearing.length,1);t.update(.2,input());assert.equal(t.lines,1);assert.equal(t.score,100);assert.equal(t.board.length,20);
const p=createGame('pong');p.status='playing';p.waiting=false;p._score=6;p.ball={x:257,y:90,vx:50,vy:0};p.update(1/60,input());assert.equal(p.score,7);assert.equal(p.status,'won');
const b=createGame('breakout');b.status='playing';b.waiting=false;b.bricks=[{x:70,y:40,w:16,h:7,row:0,alive:true}];b.ball={x:78,y:49,vx:0,vy:-70};b.update(.04,input());assert.equal(b.score,50);assert.equal(b.level,2);assert.equal(b.waiting,true);
const a=createGame('asteroids');a.status='playing';a.rocks=[];a.addRock(30,30,3,0,0);a.bullets=[{x:30,y:30,vx:0,vy:0,life:1}];a.update(.01,input());assert.equal(a.rocks.length,2);assert.ok(a.rocks.every(r=>r.size===2));assert.equal(a.score,20);
const v=createGame('invaders');v.status='playing';v.aliens.forEach(x=>x.alive=false);v.update(.01,input());assert.equal(v.wave,2);assert.equal(v.aliens.length,44);
pixelText(canvas,'ALL 8 GAMES / 256 X 192',128,80,1,.5,'center');
console.log('Passed: eight-game 60-second smoke simulations, monochrome raster validation, start/restart, Tetris line clear, Pong win, Breakout level, Asteroids split, Invaders wave.');

// The landscape fields are native coordinates, not an upscaled portrait game.
const widePong=createGame('pong');widePong.status='playing';widePong.waiting=false;widePong.ball={x:200,y:100,vx:50,vy:0};widePong.update(1/120,input());assert.equal(widePong.score,0);assert.ok(widePong.ball.x>200);
const wideBreakout=createGame('breakout');assert.equal(wideBreakout.bricks.length,50);assert.ok(Math.max(...wideBreakout.bricks.map(b=>b.x+b.w))>230);wideBreakout.status='playing';wideBreakout.px=220;wideBreakout.update(.1,input(['ArrowRight']));assert.equal(wideBreakout.px,229);
const wideAsteroids=createGame('asteroids');wideAsteroids.status='playing';wideAsteroids.rocks=[];wideAsteroids.addRock(40,40,3,0,0);Object.assign(wideAsteroids.ship,{x:255.9,vx:50,vy:0,inv:10});wideAsteroids.update(.01,input());assert.ok(wideAsteroids.ship.x<1,'ship wraps at landscape right edge');
const wideInvaders=createGame('invaders');assert.equal(wideInvaders.aliens.length,44);assert.ok(Math.max(...wideInvaders.aliens.map(a=>a.x))>210);wideInvaders.status='playing';wideInvaders.px=239;wideInvaders.update(.1,input(['ArrowRight']));assert.equal(wideInvaders.px,240);assert.equal(new Set(wideInvaders.shelters.map(p=>Math.floor((p.x-34)/56))).size,4);
for(const info of GAME_INFO){const game=createGame(info.id);game.update(1/60,input([],['Enter']));assert.equal(game.status,'ready','only the action button starts a game');}
console.log('Passed: native landscape fields, expanded formation and cover, right-edge wrapping, and Space-only starts.');

test('Invaders emits exactly one march cue per formation step, with no idle or terminal beat',()=>{
 const game=createGame('invaders'),events=[],i=input();i.sound=event=>events.push(event);
 game.update(.1,i);assert.deepEqual(events,[],'ready screen is silent');
 game.status='playing';game.fireClock=Infinity;
 for(let frame=0;frame<180;frame++){
  const first=game.aliens[0],before=[first.x,first.y],count=events.filter(event=>event==='march').length;
  game.update(1/120,i);
  const moved=first.x!==before[0]||first.y!==before[1];
  assert.equal(events.filter(event=>event==='march').length-count,Number(moved),'formation motion and sound stay coupled');
 }
 assert.ok(events.filter(event=>event==='march').length>=3);
 events.length=0;game.aliens.forEach(alien=>alien.alive=false);game.stepClock=10;game.update(.01,i);
 assert.ok(events.includes('clear'));assert.ok(!events.includes('march'),'cleared formations do not emit a phantom step');
 events.length=0;game.aliens.forEach(alien=>alien.y=163);game.stepClock=10;game.update(.01,i);
 assert.equal(game.status,'over');assert.ok(events.includes('lose'));assert.ok(!events.includes('march'),'defeat stops the march');
});

test('Invaders march cadence follows faster movement with fewer aliens and later waves',()=>{
 function duration({count=44,wave=1}={}){
  const game=createGame('invaders');game.status='playing';game.wave=wave;game.fireClock=Infinity;
  game.aliens.forEach((alien,n)=>{alien.alive=n<count;});
  let beats=0,elapsed=0;const i=input();i.sound=event=>{if(event==='march')beats++;};
  while(beats<5&&elapsed<5){game.update(1/120,i);elapsed+=1/120;}
  assert.equal(beats,5);return elapsed;
 }
 const initial=duration();
 assert.ok(duration({count:11})<initial*.5,'survivors speed up the movement and sound together');
 assert.ok(duration({wave:3})<initial,'later waves retain the faster tempo');
});


test('all eight game labels are one word while persistent game IDs stay unchanged',()=>{
 assert.deepEqual(GAME_INFO.map(game=>game.name),['Tetris','Pong','Breakout','Asteroids','Invaders','Snake','Lander','Tanks']);
 assert.deepEqual(GAME_INFO.map(game=>game.id),['tetris','pong','breakout','asteroids','invaders','snake','lander','tanks']);
});

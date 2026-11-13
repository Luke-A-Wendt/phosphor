import test from 'node:test';
import assert from 'node:assert/strict';
import {EXTRA_GAME_INFO,createExtraGame} from '../extra-games.js';
import {pixelText} from '../games.js';

const input=(down=[],pressed=[])=>({down:new Set(down),pressed:new Set(pressed),sound:()=>{}});
const create=id=>createExtraGame(id,pixelText);
const start=game=>{game.update(0,input([],['Space']));assert.equal(game.status,'playing');};
const seeded=fn=>{const old=Math.random;let state=987654321;Math.random=()=>{state=(1664525*state+1013904223)>>>0;return state/4294967296;};try{return fn();}finally{Math.random=old;}};
const raster={fillStyle:'#000',fillRect(x,y,w,h){assert.ok([x,y,w,h].every(Number.isFinite),'finite raster geometry');assert.ok(x>=0&&y>=0&&w>=0&&h>=0&&x+w<=256&&y+h<=192,'source-bounded raster geometry');if(this.fillStyle.startsWith('rgb')){const channels=this.fillStyle.match(/\d+/g).map(Number);assert.equal(channels[0],channels[1]);assert.equal(channels[1],channels[2]);}}};

test('new games honor one-button starts and terminal restarts without a scored action',()=>seeded(()=>{
 assert.deepEqual(EXTRA_GAME_INFO.map(g=>g.id),['snake','lander','tanks']);
 for(const info of EXTRA_GAME_INFO){const game=create(info.id);assert.equal(game.status,'ready');game.update(.01,input([],['Enter']));assert.equal(game.status,'ready');start(game);assert.equal(game.score,0);assert.equal(game.shot??null,null);game.status='over';game._score=123;start(game);assert.equal(game.score,0);game.restart();assert.equal(game.status,'ready');}
}));

test('Snake eats, grows, avoids occupied food, and cannot reverse into itself',()=>seeded(()=>{
 const snake=create('snake');start(snake);snake.food={x:13,y:12};snake.advance(input());assert.equal(snake.score,10);assert.equal(snake.body.length,6);assert.ok(!snake.body.some(p=>p.x===snake.food.x&&p.y===snake.food.y));
 snake.turn(input(['ArrowLeft'],['ArrowLeft']));assert.equal(snake.queued,null);snake.advance(input());assert.deepEqual(snake.body[0],{x:14,y:12});assert.equal(snake.status,'playing');
 snake.turn(input([],['ArrowUp']));snake.advance(input());assert.deepEqual(snake.body[0],{x:14,y:11});
 snake.body=[{x:0,y:2},{x:1,y:2}];snake.dir={x:-1,y:0};snake.advance(input());assert.equal(snake.status,'over');
}));

test('Snake allows moving into a vacating tail but detects solid body collisions',()=>{
 const snake=create('snake');start(snake);snake.body=[{x:2,y:2},{x:2,y:3},{x:1,y:3},{x:1,y:2}];snake.dir={x:-1,y:0};snake.food={x:30,y:20};snake.advance(input());assert.equal(snake.status,'playing');assert.deepEqual(snake.body[0],{x:1,y:2});
 snake.body=[{x:2,y:2},{x:2,y:3},{x:1,y:3},{x:1,y:2},{x:0,y:2}];snake.advance(input());assert.equal(snake.status,'over');
 snake.restart();snake.status='playing';snake.body=Array.from({length:snake.cols*snake.rows},(_,n)=>({x:n%snake.cols,y:Math.floor(n/snake.cols)}));snake.placeFood();assert.equal(snake.status,'won');assert.equal(snake.food,null);
});

test('Snake action boost accelerates travel without dropping direction taps',()=>{
 const normal=create('snake'),boost=create('snake');start(normal);start(boost);normal.food=boost.food={x:30,y:20};normal.update(.15,input());boost.update(.15,input(['Space']));assert.ok(boost.body[0].x>normal.body[0].x);
 const tapped=create('snake');start(tapped);tapped.food={x:30,y:20};tapped.update(.01,input([],['ArrowUp']));tapped.update(.15,input());assert.equal(tapped.body[0].y,11);
});

test('Tanks bounds aim and power, then resolves shots into alternating turns',()=>seeded(()=>{
 const tanks=create('tanks');start(tanks);tanks.update(10,input(['ArrowLeft','ArrowUp']));assert.equal(tanks.angle,80);assert.equal(tanks.power,100);tanks.update(10,input(['ArrowRight','ArrowDown']));assert.equal(tanks.angle,10);assert.equal(tanks.power,15);
 tanks.angle=50;tanks.power=62;tanks.update(.01,input([],['Space']));assert.ok(tanks.shot);assert.equal(tanks.shot.side,0);
 let sawCPU=false,sawPlayerAgain=false;for(let n=0;n<3600&&tanks.status==='playing';n++){tanks.update(1/120,input());if(tanks.shot?.side===1)sawCPU=true;if(sawCPU&&tanks.turn===0&&!tanks.shot){sawPlayerAgain=true;break;}}
 assert.ok(sawCPU,'computer fires after player shot');assert.ok(sawPlayerAgain,'control returns to player after computer shot');
}));

test('Tanks impacts damage tanks, excavate terrain, and award a victory',()=>seeded(()=>{
 const tanks=create('tanks');start(tanks);const enemy=tanks.tanks[1],x=enemy.x,y=enemy.y-3,before=tanks.terrain[x];tanks.shot={side:0};tanks.impact(x,y,1);assert.equal(enemy.hp,20);assert.equal(tanks.score,80);assert.ok(tanks.terrain[x]>before);assert.ok(tanks.terrain.every(h=>h<=185));assert.equal(enemy.y,tanks.ground(x));
 tanks.shot={side:0};tanks.impact(enemy.x,enemy.y-3,1);assert.equal(enemy.hp,0);assert.equal(tanks.status,'won');assert.equal(tanks.score,250);
}));

test('Tanks opening shots need calibration while actual impacts improve later aim',()=>seeded(()=>{
 const scenarios=160,errors=[0,0,0],directHits=[0,0,0];
 for(let scenario=0;scenario<scenarios;scenario++){
  const tanks=create('tanks');start(tanks);
  for(let turn=0;turn<3;turn++){
   // Keep each duel alive for comparison, retaining real crater changes and
   // changing wind as normal rounds do. No trajectory prediction trains the AI.
   tanks.tanks.forEach(tank=>tank.hp=1000);tanks.status='playing';tanks.wait=0;tanks.blast=null;
   if(turn)tanks.wind=-3+Math.random()*6;
   const aim=tanks.chooseAim();assert.ok(Number.isFinite(aim.angle)&&Number.isFinite(aim.power));
   assert.ok(aim.angle>=10&&aim.angle<=80&&aim.power>=15&&aim.power<=100);
   assert.ok(tanks.fire(1,aim.angle,aim.power));
   for(let frame=0;frame<1400&&tanks.shot;frame++)tanks.update(1/120,input());
   assert.equal(tanks.shot,null);assert.ok(tanks.aiObservation,'only a resolved real shell supplies calibration');
   errors[turn]+=Math.abs(tanks.aiObservation.x-tanks.tanks[0].x);
   if(1000-tanks.tanks[0].hp===80)directHits[turn]++;
  }
 }
 assert.ok(directHits[0]>0,'an opening shot can still hit by chance');
 assert.ok(directHits[0]<scenarios*.35,'most opening shots need calibration');
 assert.ok(directHits[1]>directHits[0]*1.4,'feedback makes the second shot more competitive');
 assert.ok(directHits[2]>directHits[0]*1.7,'later calibrated shots can win the duel');
 assert.ok(errors[1]<errors[0]*.65&&errors[2]<errors[0]*.5,'observed impacts improve range despite changing wind and terrain');
}));

test('Tanks calibration ignores previews and player shots, records offscreen misses, and resets each duel',()=>seeded(()=>{
 const tanks=create('tanks');start(tanks);
 for(let n=0;n<4;n++)tanks.chooseAim();
 assert.equal(tanks.aiObservation,null);assert.equal(tanks.aiShots,0);
 tanks.shot={side:0};tanks.impact(128,150);assert.equal(tanks.aiObservation,null,'the player cannot calibrate the opponent');
 tanks.wait=0;tanks.blast=null;const aim=tanks.chooseAim();tanks.fire(1,aim.angle,aim.power);
 assert.equal(tanks.aiShots,1);assert.equal(tanks.fire(1,aim.angle,aim.power),false);assert.equal(tanks.aiShots,1,'blocked fire does not count');
 tanks.shot.x=255;tanks.update(1/120,input());
 assert.equal(tanks.shot,null);assert.equal(tanks.wait,.5);assert.ok(tanks.aiObservation.x>254,'a shell leaving the screen still teaches range');
 const corrected=tanks.chooseAim();assert.ok(Number.isFinite(corrected.angle)&&Number.isFinite(corrected.power));
 tanks.restart();assert.equal(tanks.aiShots,0);assert.equal(tanks.aiObservation,null);assert.equal(tanks.aiAim,null);
}));

test('Lander and Tanks use their one-word names in the HUD and ready screen',()=>{
 for(const [id,name] of [['lander','LANDER'],['tanks','TANKS']]){
  const labels=[],game=createExtraGame(id,(_ctx,label)=>labels.push(String(label)));
  game.render(raster);assert.ok(labels.filter(label=>label===name).length>=2);
  assert.ok(!labels.some(label=>/LUNAR LANDER|SCORCHED TANKS/.test(label)));
 }
});

test('Lander rewards a gentle level landing and advances to a narrower pad',()=>{
 const lander=create('lander');start(lander);const width=lander.pad.right-lander.pad.left;
 Object.assign(lander.ship,{x:(lander.pad.left+lander.pad.right)/2,y:lander.pad.y-7-.1,vx:0,vy:5,angle:0,fuel:60});
 lander.update(.04,input());assert.equal(lander.phase,'landed');assert.equal(lander.score,220);assert.equal(lander.lives,3);
 lander.update(.01,input([],['Space']));assert.equal(lander.level,2);assert.equal(lander.phase,'flight');assert.equal(lander.ship.fuel,100);assert.ok(lander.pad.right-lander.pad.left<width);assert.equal(lander.score,220);
});

test('Lander rejects speed, tilt, horizontal drift, and feet outside the pad',()=>{
 const lander=create('lander');start(lander);const center=(lander.pad.left+lander.pad.right)/2;
 Object.assign(lander.ship,{x:center,y:lander.pad.y-7-.1,vx:0,vy:25,angle:0});lander.update(.04,input());assert.equal(lander.phase,'crashed');assert.equal(lander.lives,2);assert.equal(lander.score,0);
 lander.update(.01,input([],['Space']));assert.equal(lander.phase,'flight');assert.equal(lander.level,1);
 Object.assign(lander.ship,{x:center,y:lander.pad.y-7,vx:0,vy:5,angle:.4});assert.equal(lander.canLand(),false);lander.ship.angle=0;lander.ship.vx=10;assert.equal(lander.canLand(),false);
 lander.ship.vx=0;lander.ship.x=lander.pad.left+2;assert.equal(lander.canLand(),false);lander.ship.x=center;assert.equal(lander.canLand(),true);
 lander.lives=1;lander.ship.vy=30;lander.touchdown(input());assert.equal(lander.status,'over');assert.equal(lander.lives,0);
});

test('Lander thrust consumes fuel, gravity resumes empty, and tilt stays bounded',()=>{
 const lander=create('lander');start(lander);lander.ship.y=90;lander.ship.fuel=1;lander.update(.1,input(['Space']));assert.ok(lander.ship.vy<0);assert.ok(lander.ship.fuel<1);
 lander.ship.fuel=0;lander.ship.vy=0;lander.update(.1,input(['Space']));assert.ok(lander.ship.vy>0);assert.equal(lander.ship.fuel,0);
 lander.ship.y=60;lander.update(1,input(['ArrowRight','Space']));assert.equal(lander.ship.angle,1.15);
});

test('Lander exposes thrust only during a burn and ends it on release, fuel loss, landing or crash',()=>{
 const lander=create('lander'),events=[],i=input(['Space']);i.sound=event=>events.push(event);start(lander);
 lander.update(.02,i);assert.equal(lander.thrust,true);
 lander.update(.02,input());assert.equal(lander.thrust,false,'release cuts the audio drive signal');
 lander.ship.fuel=0;lander.update(.02,i);assert.equal(lander.thrust,false,'an empty tank produces no engine signal');
 for(const [speed,phase,event] of [[5,'landed','score'],[30,'crashed','lose']]){
  lander.resetShip();Object.assign(lander.ship,{x:(lander.pad.left+lander.pad.right)/2,y:lander.pad.y-7-.01,vx:0,vy:speed,angle:0});
  events.length=0;lander.update(.02,i);
  assert.equal(lander.phase,phase);assert.equal(lander.thrust,false,'touchdown cuts the audio drive even while thrust remains held');assert.deepEqual(events,[event]);
  lander.update(.1,i);assert.equal(lander.thrust,false);assert.deepEqual(events,[event],'terminal feedback is emitted once');
 }
});

test('Tanks emits one firing event per shell and exposes one stable impact for the audio observer',()=>seeded(()=>{
 const tanks=create('tanks'),events=[],i=input([],['Space']);i.sound=event=>events.push(event);start(tanks);
 tanks.angle=20;tanks.power=48;tanks.wind=0;tanks.update(1/120,i);
 assert.deepEqual(events,['shoot']);assert.ok(tanks.shot);
 for(let frame=0;frame<1000&&!tanks.blast;frame++)tanks.update(1/120,i);
 assert.ok(tanks.blast,'a short shell strikes the terrain');assert.deepEqual(events,['shoot'],'repeated action cannot fire over an active shell');
 const blast=tanks.blast;tanks.update(.1,input());assert.equal(tanks.blast,blast,'impact identity remains stable to suppress repeated sound');
 tanks.update(.6,input());assert.equal(tanks.blast,null,'impact expires after its visual tail');
}));

test('new game simulations render finite monochrome geometry inside the raster',()=>seeded(()=>{
 for(const info of EXTRA_GAME_INFO){const game=create(info.id);game.render(raster);start(game);for(let frame=0;frame<2400;frame++){
  const down=[frame%240<120?'ArrowLeft':'ArrowRight'];if(frame%180<100)down.push('Space','ArrowUp');game.update(1/60,input(down,frame%60===0?['Space']:[]));
  if(frame%8===0)game.render(raster);assert.ok(Number.isFinite(game.score));if(['over','won'].includes(game.status))start(game);
 }game.render(raster);}
}));

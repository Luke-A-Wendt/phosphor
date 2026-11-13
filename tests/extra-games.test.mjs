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

test('Tanks computer can aim at the opponent using its actual ballistics',()=>seeded(()=>{
 const tanks=create('tanks');start(tanks);tanks.wind=0;const aim=tanks.chooseAim();const impact=tanks.predict(aim.angle,aim.power);assert.ok(!impact.miss);assert.ok(Math.abs(impact.x-tanks.tanks[0].x)<35,'CPU shot approaches player with deliberate error');
}));

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

test('new game simulations render finite monochrome geometry inside the raster',()=>seeded(()=>{
 for(const info of EXTRA_GAME_INFO){const game=create(info.id);game.render(raster);start(game);for(let frame=0;frame<2400;frame++){
  const down=[frame%240<120?'ArrowLeft':'ArrowRight'];if(frame%180<100)down.push('Space','ArrowUp');game.update(1/60,input(down,frame%60===0?['Space']:[]));
  if(frame%8===0)game.render(raster);assert.ok(Number.isFinite(game.score));if(['over','won'].includes(game.status))start(game);
 }game.render(raster);}
}));

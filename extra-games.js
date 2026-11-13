/* Original minimal homages, drawn into the same 256 × 192 monochrome raster. */
export const EXTRA_GAME_INFO=[
 {id:'snake',name:'Snake',description:'One growing line. Leave room to turn.',controls:'ARROWS MOVE / SPACE BOOST'},
 {id:'lander',name:'Lunar Lander',description:'A little thrust. A gentle landing.',controls:'LEFT RIGHT TILT / SPACE THRUST'},
 {id:'tanks',name:'Scorched Tanks',description:'One hill. Two tanks. Make your shot count.',controls:'LEFT RIGHT AIM / UP DOWN POWER / SPACE FIRE'}
];
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const rnd=(a,b)=>a+Math.random()*(b-a);
const held=(input,...codes)=>codes.some(c=>input.down?.has(c));
const hit=(input,...codes)=>codes.some(c=>input.pressed?.has(c));
const color=v=>{const n=Math.round(clamp(v,0,1)*255);return `rgb(${n},${n},${n})`;};
function rect(c,x,y,w,h,v=1){
 const x0=Math.max(0,Math.round(x)),y0=Math.max(0,Math.round(y));
 const x1=Math.min(256,Math.round(x+w)),y1=Math.min(192,Math.round(y+h));
 if(x1<=x0||y1<=y0)return;c.fillStyle=color(v);c.fillRect(x0,y0,x1-x0,y1-y0);
}
function line(c,x0,y0,x1,y1,v=1){
 x0=Math.round(x0);y0=Math.round(y0);x1=Math.round(x1);y1=Math.round(y1);
 const dx=Math.abs(x1-x0),sx=x0<x1?1:-1,dy=-Math.abs(y1-y0),sy=y0<y1?1:-1;let e=dx+dy;
 for(let n=0;n<1024;n++){rect(c,x0,y0,1,1,v);if(x0===x1&&y0===y1)break;const e2=2*e;if(e2>=dy){e+=dy;x0+=sx;}if(e2<=dx){e+=dx;y0+=sy;}}
}
function clear(c){c.fillStyle='#000';c.fillRect(0,0,256,192);}
function hud(c,left,right,text){text(c,left,14,9,1,.85);text(c,right,242,9,1,.85,'right');rect(c,14,19,228,1,.17);}
function overlay(c,title,sub='PRESS SPACE',extra='',text){
 rect(c,34,70,188,49,0);rect(c,34,70,188,1,.35);rect(c,34,118,188,1,.35);
 text(c,title,128,80,1,1,'center');text(c,sub,128,94,1,.7,'center');if(extra)text(c,extra,128,107,1,.4,'center');
}
class Base{
 constructor(id,text){this.id=id;this.text=text;this.status='ready';this._score=0;this.time=0;}
 get score(){return this._score;}
 startGate(dt,input){this.time+=dt;if(['ready','over','won'].includes(this.status)){if(hit(input,'Space')){if(this.status!=='ready')this.restart();this.status='playing';this.onStart?.();input.sound?.('start');}return true;}return false;}
 terminalOverlay(c,title){if(this.status==='ready')overlay(c,title,'PRESS SPACE','ESC BACK',this.text);else if(this.status==='over')overlay(c,'GAME OVER','SPACE TO RESTART','',this.text);else if(this.status==='won')overlay(c,'YOU WIN','SPACE TO RESTART','',this.text);}
}

class Snake extends Base{
 constructor(text){super('snake',text);this.cols=38;this.rows=24;this.restart();}
 restart(){this.status='ready';this._score=0;this.time=0;this.body=Array.from({length:5},(_,n)=>({x:12-n,y:12}));this.dir={x:1,y:0};this.queued=null;this.stepClock=0;this.placeFood();}
 placeFood(){const occupied=new Set(this.body.map(p=>p.y*this.cols+p.x)),free=[];for(let y=0;y<this.rows;y++)for(let x=0;x<this.cols;x++)if(!occupied.has(y*this.cols+x))free.push({x,y});if(!free.length){this.status='won';this.food=null;return;}this.food=free[Math.floor(Math.random()*free.length)];}
 turn(input){
  if(this.queued)return;
  const choices=[['ArrowUp','KeyW',0,-1],['ArrowDown','KeyS',0,1],['ArrowLeft','KeyA',-1,0],['ArrowRight','KeyD',1,0]];
  const valid=d=>d[2]!==-this.dir.x||d[3]!==-this.dir.y;
  let choice=choices.find(d=>valid(d)&&hit(input,d[0],d[1])&&(d[2]!==this.dir.x||d[3]!==this.dir.y));
  // Keep the current heading when a diagonal stick includes it. Otherwise
  // use one cardinal axis; a queued turn is consumed only at the next cell.
  if(!choice&&!choices.some(d=>d[2]===this.dir.x&&d[3]===this.dir.y&&held(input,d[0],d[1])))choice=choices.find(d=>valid(d)&&held(input,d[0],d[1]));
  if(choice)this.queued={x:choice[2],y:choice[3]};
 }
 advance(input){
  if(this.queued){this.dir=this.queued;this.queued=null;}
  const head={x:this.body[0].x+this.dir.x,y:this.body[0].y+this.dir.y},grows=this.food&&head.x===this.food.x&&head.y===this.food.y;
  const collisionBody=grows?this.body:this.body.slice(0,-1);
  if(head.x<0||head.x>=this.cols||head.y<0||head.y>=this.rows||collisionBody.some(p=>p.x===head.x&&p.y===head.y)){this.status='over';input.sound?.('lose');return;}
  this.body.unshift(head);if(grows){this._score+=10;this.placeFood();input.sound?.('score');}else this.body.pop();
 }
 update(dt,input){if(this.startGate(dt,input))return;this.turn(input);this.stepClock+=dt;const normal=Math.max(.07,.155-(this.body.length-5)*.0025),interval=held(input,'Space')?Math.min(.075,normal):normal;while(this.stepClock>=interval&&this.status==='playing'){this.stepClock-=interval;this.advance(input);}}
 render(c){
  clear(c);hud(c,'SNAKE',String(this._score).padStart(5,'0'),this.text);
  line(c,12,27,243,27,.22);line(c,12,174,243,174,.22);line(c,12,27,12,174,.22);line(c,243,27,243,174,.22);
  this.body.forEach((p,n)=>rect(c,14+p.x*6,29+p.y*6,5,5,n===0?.98:Math.max(.4,.72-n*.002)));
  const head=this.body[0],x=14+head.x*6,y=29+head.y*6;
  if(this.dir.x){rect(c,x+(this.dir.x>0?3:1),y+1,1,1,.12);rect(c,x+(this.dir.x>0?3:1),y+3,1,1,.12);}else{rect(c,x+1,y+(this.dir.y>0?3:1),1,1,.12);rect(c,x+3,y+(this.dir.y>0?3:1),1,1,.12);}
  if(this.food){const fx=14+this.food.x*6,fy=29+this.food.y*6;rect(c,fx+1,fy+1,3,3,.9);rect(c,fx+2,fy,1,1,.45);rect(c,fx,fy+2,1,1,.45);rect(c,fx+4,fy+2,1,1,.45);rect(c,fx+2,fy+4,1,1,.45);}
  this.text(c,'ARROWS MOVE / SPACE BOOST',128,181,1,.42,'center');this.terminalOverlay(c,'SNAKE');
 }
}

class Lander extends Base {
 constructor(text){super('lander',text);this.restart();}
 restart(){this.status='ready';this._score=0;this.level=1;this.lives=3;this.time=0;this.makeTerrain();this.resetShip();}
 makeTerrain(){
  const centers=[172,82,158,104],center=centers[(this.level-1)%centers.length],width=Math.max(26,38-(this.level-1)*2);
  this.pad={left:Math.round(center-width/2),right:Math.round(center+width/2),y:151};
  this.terrain=Array.from({length:256},(_,x)=>Math.round(150+10*Math.sin(x*.043+this.level*.7)+5*Math.sin(x*.107)));
  for(let x=0;x<256;x++){
   const distance=x<this.pad.left?this.pad.left-x:x>this.pad.right?x-this.pad.right:0;
   if(distance<15)this.terrain[x]=Math.round(this.pad.y+(this.terrain[x]-this.pad.y)*Math.min(1,distance/15));
  }
 }
 resetShip(){const center=(this.pad.left+this.pad.right)/2;this.ship={x:center+(center>128?-49:49),y:43,vx:0,vy:0,angle:0,fuel:100};this.phase='flight';this.thrust=false;this.crashPoint=null;}
 groundAt(x){const p=clamp(x,0,255),j=Math.floor(p),k=Math.min(255,j+1);return this.terrain[j]+(this.terrain[k]-this.terrain[j])*(p-j);}
 point(x,y){const s=this.ship,co=Math.cos(s.angle),si=Math.sin(s.angle);return {x:s.x+x*co-y*si,y:s.y+x*si+y*co};}
 feet(){return [-7,-3,3,7].map(x=>this.point(x,7));}
 touchesGround(){return [[-3,-5],[3,-5],[-3,1],[3,1],[-7,7],[-3,7],[3,7],[7,7]].some(([x,y])=>{const p=this.point(x,y);return p.y>=this.groundAt(p.x);});}
 canLand(){const s=this.ship;return this.feet().every(p=>p.x>=this.pad.left+1&&p.x<=this.pad.right-1)&&Math.abs(s.angle)<=.2&&Math.abs(s.vx)<=8&&s.vy>=-1&&s.vy<=13;}
 touchdown(i){
  const s=this.ship;this.thrust=false;
  if(this.canLand()){
   this.phase='landed';s.y=this.pad.y-7;s.angle=0;s.vx=0;s.vy=0;
   this._score+=100*this.level+Math.round(s.fuel)*2;i.sound?.('score');
  }else{
   this.phase='crashed';this.crashPoint={x:s.x,y:Math.min(170,s.y)};this.lives--;s.vx=0;s.vy=0;
   if(this.lives<=0)this.status='over';i.sound?.('lose');
  }
 }
 update(dt,i){
  if(this.startGate(dt,i))return;
  if(this.phase!=='flight'){
   if(hit(i,'Space')){if(this.phase==='landed'){this.level++;this.makeTerrain();}this.resetShip();}return;
  }
  const s=this.ship,dir=Number(held(i,'ArrowRight','KeyD'))-Number(held(i,'ArrowLeft','KeyA'));
  const duration=Math.max(0,Math.min(dt,1)),steps=Math.max(1,Math.ceil(duration*120)),h=duration/steps;
  for(let n=0;n<steps&&this.phase==='flight';n++){
   s.angle=clamp(s.angle+dir*1.6*h,-1.15,1.15);
   this.thrust=held(i,'Space','ArrowUp','KeyW')&&s.fuel>0;
   const burn=this.thrust?Math.min(h,s.fuel/8):0;
   if(burn>0){s.vx+=Math.sin(s.angle)*32*burn;s.vy-=Math.cos(s.angle)*32*burn;s.fuel=Math.max(0,s.fuel-8*burn);}
   s.vy+=(12+Math.min(2,(this.level-1)*.25))*h;
   s.x+=s.vx*h;s.y+=s.vy*h;
   if(s.x<13||s.x>243){s.x=clamp(s.x,13,243);s.vx*=-.15;}
   if(s.y<32){s.y=32;s.vy=Math.max(0,s.vy);}
   if(this.touchesGround())this.touchdown(i);
  }
 }
 render(c){
  clear(c);hud(c,'LUNAR LANDER',String(this._score).padStart(6,'0'),this.text);
  this.text(c,'FUEL '+Math.ceil(this.ship.fuel),16,27,1,.5);rect(c,16,35,48,1,.16);rect(c,16,35,48*this.ship.fuel/100,1,.65);
  this.text(c,'V '+Math.abs(this.ship.vy).toFixed(1)+' H '+Math.abs(this.ship.vx).toFixed(1),240,27,1,.55,'right');
  this.text(c,'LIVES '+this.lives,16,43,1,.35);this.text(c,'LAND V<13 H<8',240,38,1,.3,'right');
  for(let n=0;n<19;n++){const x=18+(n*67)%218,y=52+(n*31)%65;rect(c,x,y,1,1,.12+(n%3)*.04);}
  for(let x=8;x<248;x++){line(c,x,this.terrain[x],x+1,this.terrain[x+1],.46);if(x%7===0)line(c,x,this.terrain[x]+4,x,175,.055);}
  line(c,this.pad.left,this.pad.y,this.pad.right,this.pad.y,.95);line(c,this.pad.left,this.pad.y-3,this.pad.left,this.pad.y+2,.75);line(c,this.pad.right,this.pad.y-3,this.pad.right,this.pad.y+2,.75);
  this.text(c,'PAD '+this.level,(this.pad.left+this.pad.right)/2,this.pad.y+8,1,.5,'center');
  if(this.phase!=='crashed'){
   const p=(x,y)=>{const v=this.point(x,y);return [v.x,v.y];};
   line(c,...p(-3,-5),...p(3,-5),.9);line(c,...p(3,-5),...p(4,1),.9);line(c,...p(4,1),...p(-4,1),.9);line(c,...p(-4,1),...p(-3,-5),.9);
   line(c,...p(-3,1),...p(-5,7),.8);line(c,...p(3,1),...p(5,7),.8);line(c,...p(-7,7),...p(-3,7),.9);line(c,...p(3,7),...p(7,7),.9);
   if(this.thrust&&this.status==='playing'){const length=6+Math.floor(this.time*30)%3;line(c,...p(-2,3),...p(0,length),.8);line(c,...p(0,length),...p(2,3),.8);}
  }else if(this.crashPoint){
   for(let n=0;n<9;n++){const a=n*Math.PI*2/9,r=7+(n%3)*2;line(c,clamp(this.crashPoint.x+Math.cos(a)*4,8,247),clamp(this.crashPoint.y+Math.sin(a)*4,24,176),clamp(this.crashPoint.x+Math.cos(a)*r,8,247),clamp(this.crashPoint.y+Math.sin(a)*r,24,176),.6);}
  }
  this.text(c,'LEFT RIGHT TURN / SPACE THRUST',128,183,1,.4,'center');
  if(this.phase==='landed')overlay(c,'SOFT LANDING','SPACE NEXT LANDING','FUEL BONUS AWARDED',this.text);
  else if(this.phase==='crashed'&&this.status==='playing')overlay(c,'HARD LANDING','SPACE RETRY','KEEP LEVEL AND SLOW',this.text);
  this.terminalOverlay(c,'LUNAR LANDER');
 }
}

class Tanks extends Base {
 constructor(text){super('tanks',text);this.restart();}
 restart(){
  this.status='ready';this._score=0;this.time=0;this.turn=0;this.round=1;this.angle=50;this.power=62;
  this.wind=rnd(-3,3);this.gravity=22;this.shot=null;this.blast=null;this.wait=0;this.aiDelay=0;this.trail=[];
  const phase=rnd(0,Math.PI*2);
  this.terrain=Array.from({length:256},(_,x)=>Math.round(149+Math.sin(x*.026+phase)*12+Math.sin(x*.071+phase*.7)*5));
  this.tanks=[{x:30,y:0,hp:100,angle:50,power:62},{x:225,y:0,hp:100,angle:52,power:62}];
  for(const tank of this.tanks){const h=this.terrain[tank.x];for(let x=tank.x-9;x<=tank.x+9;x++)this.terrain[x]=h;tank.y=h;}
 }
 ground(x){return this.terrain[clamp(Math.floor(x),0,255)];}
 velocity(angle,power,side){const a=angle*Math.PI/180,speed=power*1.12;return {vx:Math.cos(a)*speed*(side===0?1:-1),vy:-Math.sin(a)*speed};}
 muzzle(side,angle){const tank=this.tanks[side],a=angle*Math.PI/180;return {x:tank.x+Math.cos(a)*9*(side===0?1:-1),y:tank.y-5-Math.sin(a)*9};}
 fire(side,angle,power){
  if(this.shot||this.wait>0||this.status!=='playing')return false;
  const origin=this.muzzle(side,angle),velocity=this.velocity(angle,power,side);
  this.tanks[side].angle=angle;this.tanks[side].power=power;
  this.shot={...origin,...velocity,side,age:0};this.trail=[];return true;
 }
 // Both the live shell and the computer's aim use the same acceleration and terrain.
 stepShell(shell,dt){
  const oldX=shell.x,oldY=shell.y;
  shell.x+=shell.vx*dt+.5*this.wind*dt*dt;shell.y+=shell.vy*dt+.5*this.gravity*dt*dt;
  shell.vx+=this.wind*dt;shell.vy+=this.gravity*dt;shell.age+=dt;
  if(shell.x<1||shell.x>254||shell.age>9)return {miss:true,x:clamp(shell.x,1,254),y:shell.y};
  for(let side=0;side<2;side++){
   const tank=this.tanks[side];
   if(shell.age>.12&&Math.abs(shell.x-tank.x)<=6&&shell.y>=tank.y-7&&shell.y<=tank.y+1)return {x:shell.x,y:shell.y,direct:side};
  }
  if(shell.y>=this.ground(shell.x)){
   let low=0,high=1;
   for(let n=0;n<12;n++){const mid=(low+high)/2,x=oldX+(shell.x-oldX)*mid,y=oldY+(shell.y-oldY)*mid;if(y>=this.ground(x))high=mid;else low=mid;}
   return {x:oldX+(shell.x-oldX)*high,y:oldY+(shell.y-oldY)*high};
  }
  return null;
 }
 predict(angle,power){
  const shell={...this.muzzle(1,angle),...this.velocity(angle,power,1),age:0,side:1};
  for(let n=0;n<1080;n++){const hit=this.stepShell(shell,1/120);if(hit)return hit;}
  return {miss:true,x:shell.x,y:shell.y};
 }
 chooseAim(){
  const target=this.tanks[0];let best={distance:Infinity,angle:50,power:62};
  for(let angle=26;angle<=76;angle+=5)for(let power=35;power<=95;power+=3){
   const hit=this.predict(angle,power);if(hit.miss)continue;
   const distance=Math.hypot(hit.x-target.x,hit.y-(target.y-3));if(distance<best.distance)best={distance,angle,power};
  }
  return {angle:clamp(best.angle+rnd(-2.1,2.1),10,80),power:clamp(best.power+rnd(-2.8,2.8),15,100)};
 }
 impact(x,y,direct=-1){
  const owner=this.shot?.side??this.turn;
  for(let side=0;side<2;side++){
   const tank=this.tanks[side],distance=Math.hypot(tank.x-x,tank.y-3-y);
   const damage=side===direct?80:Math.round(70*Math.max(0,1-distance/24));
   const taken=Math.min(tank.hp,damage);tank.hp=Math.max(0,tank.hp-damage);
   if(side===1&&owner===0)this._score+=taken;
  }
  const radius=15;
  for(let xx=Math.max(0,Math.floor(x-radius));xx<=Math.min(255,Math.ceil(x+radius));xx++){
   const dx=xx-x;if(Math.abs(dx)<=radius)this.terrain[xx]=Math.min(185,Math.max(this.terrain[xx],Math.round(y+Math.sqrt(radius*radius-dx*dx))));
  }
  for(const tank of this.tanks)tank.y=this.ground(tank.x);
  this.blast={x,y,age:0,radius};this.shot=null;this.wait=.8;
  if(this.tanks[0].hp<=0)this.status='over';else if(this.tanks[1].hp<=0){this.status='won';this._score+=150;}
 }
 endMiss(){this.shot=null;this.wait=.5;}
 update(dt,i){
  if(this.startGate(dt,i))return;
  if(this.blast){this.blast.age+=dt;if(this.blast.age>.65)this.blast=null;}
  if(this.shot){
   let remaining=Math.min(dt,.15);
   while(remaining>0&&this.shot){const step=Math.min(remaining,1/120),shell=this.shot;remaining-=step;
    const hit=this.stepShell(shell,step);
    if(hit){if(hit.miss)this.endMiss();else this.impact(hit.x,hit.y,hit.direct);}
   }
   if(this.shot){this.trail.push({x:this.shot.x,y:this.shot.y});if(this.trail.length>24)this.trail.shift();}
   return;
  }
  if(this.wait>0){this.wait-=dt;if(this.wait<=0){this.wait=0;this.turn=1-this.turn;if(this.turn===0){this.round++;this.wind=rnd(-3,3);}else this.aiDelay=.7;}return;}
  if(this.turn===1){this.aiDelay-=dt;if(this.aiDelay<=0){const aim=this.chooseAim();this.fire(1,aim.angle,aim.power);i.sound?.('shoot');}return;}
  this.angle=clamp(this.angle+(Number(held(i,'ArrowLeft','KeyA'))-Number(held(i,'ArrowRight','KeyD')))*36*dt,10,80);
  this.power=clamp(this.power+(Number(held(i,'ArrowUp','KeyW'))-Number(held(i,'ArrowDown','KeyS')))*32*dt,15,100);
  this.tanks[0].angle=this.angle;this.tanks[0].power=this.power;
  if(hit(i,'Space')&&this.fire(0,this.angle,this.power))i.sound?.('shoot');
 }
 render(c){
  clear(c);hud(c,'SCORCHED TANKS',String(this._score).padStart(5,'0'),this.text);
  this.text(c,'YOU '+this.tanks[0].hp,16,27,1,.8);this.text(c,'CPU '+this.tanks[1].hp,240,27,1,.55,'right');
  this.text(c,'WIND '+(this.wind<0?'< ':'> ')+Math.abs(this.wind).toFixed(1),128,27,1,.35,'center');
  for(let x=8;x<248;x++){
   const y=this.terrain[x];rect(c,x,y,1,1,.48);
   // Sparse strata leave the landscape dark and retain the line-scan character.
   if(x%4===0)for(let yy=y+5;yy<185;yy+=6)rect(c,x,yy,1,1,.075);
  }
  for(let side=0;side<2;side++){
   const tank=this.tanks[side],v=side===0?.95:.55,tip=this.muzzle(side,tank.angle);
   rect(c,tank.x-5,tank.y-3,11,3,v);rect(c,tank.x-3,tank.y-6,6,3,v);
   line(c,tank.x,tank.y-5,tip.x,tip.y,v);rect(c,tank.x-6,tank.y,13,1,v*.65);
   if(tank.hp<=0){line(c,tank.x-7,tank.y-10,tank.x+7,tank.y,.5);line(c,tank.x+7,tank.y-10,tank.x-7,tank.y,.5);}
  }
  this.trail.forEach((p,n)=>{if(p.x>8&&p.x<248&&p.y>36&&p.y<185)rect(c,p.x,p.y,1,1,.06+.22*n/this.trail.length);});
  if(this.shot&&this.shot.y>36&&this.shot.y<185)rect(c,this.shot.x,this.shot.y,2,2,1);
  if(this.blast){const b=this.blast,r=Math.max(1,b.radius*Math.sin(Math.min(1,b.age/.65)*Math.PI));for(let n=0;n<20;n++){const a=n*Math.PI/10,x=b.x+Math.cos(a)*r,y=b.y+Math.sin(a)*r;if(x>=8&&x<248&&y>=36&&y<186)rect(c,x,y,1,1,.85*(1-b.age/.65));}}
  this.text(c,'AIM '+Math.round(this.angle),16,43,1,.6);this.text(c,'POWER '+Math.round(this.power),240,43,1,.6,'right');
  const caption=this.shot?'SHELL IN FLIGHT':this.wait>0?'':this.turn===0?'LEFT RIGHT AIM / UP DOWN POWER':'COMPUTER AIMING';
  this.text(c,caption,128,174,1,.45,'center');
  this.text(c,this.turn===0&&!this.shot&&this.wait<=0?'SPACE FIRE':'ROUND '+this.round,128,183,1,.32,'center');
  this.terminalOverlay(c,'SCORCHED TANKS');
 }
}


export function createExtraGame(id,pixelText){switch(id){case 'snake':return new Snake(pixelText);case 'lander':return new Lander(pixelText);case 'tanks':return new Tanks(pixelText);default:throw new Error(`Unknown game: ${id}`);}}

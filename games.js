/* Original, minimal homages. Every pixel is drawn into a 160 × 192 monochrome raster. */
export const GAME_INFO = [
  { id:'tetris', name:'Tetris', description:'Ten columns. Seven shapes. Keep the stack alive.', controls:'← → MOVE · ↑ ROTATE · ↓ SOFT DROP · SPACE DROP' },
  { id:'pong', name:'Pong', description:'One paddle. One opponent. First to seven.', controls:'↑ ↓ MOVE · SPACE SERVE · FIRST TO 7' },
  { id:'breakout', name:'Breakout', description:'Clear the wall. Keep the light in play.', controls:'← → MOVE · SPACE LAUNCH · OR MOVE POINTER' },
  { id:'asteroids', name:'Asteroids', description:'A small ship in a field of drifting rock.', controls:'← → TURN · ↑ THRUST · SPACE FIRE' },
  { id:'invaders', name:'Space Invaders', description:'Hold the line against the descending formation.', controls:'← → MOVE · SPACE FIRE' }
];

const FONT={
 A:['010','101','111','101','101'],B:['110','101','110','101','110'],C:['011','100','100','100','011'],D:['110','101','101','101','110'],E:['111','100','110','100','111'],F:['111','100','110','100','100'],G:['011','100','101','101','011'],H:['101','101','111','101','101'],I:['111','010','010','010','111'],J:['001','001','001','101','010'],K:['101','101','110','101','101'],L:['100','100','100','100','111'],M:['101','111','111','101','101'],N:['101','111','111','111','101'],O:['010','101','101','101','010'],P:['110','101','110','100','100'],Q:['010','101','101','111','011'],R:['110','101','110','101','101'],S:['011','100','010','001','110'],T:['111','010','010','010','010'],U:['101','101','101','101','111'],V:['101','101','101','101','010'],W:['101','101','111','111','101'],X:['101','101','010','101','101'],Y:['101','101','010','010','010'],Z:['111','001','010','100','111'],
 '0':['111','101','101','101','111'],'1':['010','110','010','010','111'],'2':['110','001','010','100','111'],'3':['110','001','010','001','110'],'4':['101','101','111','001','001'],'5':['111','100','110','001','110'],'6':['011','100','111','101','111'],'7':['111','001','010','010','010'],'8':['111','101','111','101','111'],'9':['111','101','111','001','110'],
 ':':['000','010','000','010','000'],'.':['000','000','000','000','010'],'-':['000','000','111','000','000'],'/':['001','001','010','100','100'],'!':['010','010','010','000','010'],'?':['110','001','010','000','010'],'+':['000','010','111','010','000'],'<':['001','010','100','010','001'],'>':['100','010','001','010','100'],'=':['000','111','000','111','000'],' ':['000','000','000','000','000']
};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const rnd=(a,b)=>a+Math.random()*(b-a);
const held=(i,...codes)=>codes.some(c=>i.down?.has(c));
const hit=(i,...codes)=>codes.some(c=>i.pressed?.has(c));
const color=v=>{const n=Math.round(clamp(v,0,1)*255);return `rgb(${n},${n},${n})`;};
function rect(c,x,y,w,h,v=1){c.fillStyle=color(v);c.fillRect(Math.round(x),Math.round(y),Math.round(w),Math.round(h));}
function line(c,x0,y0,x1,y1,v=1){x0=Math.round(x0);y0=Math.round(y0);x1=Math.round(x1);y1=Math.round(y1);const dx=Math.abs(x1-x0),sx=x0<x1?1:-1,dy=-Math.abs(y1-y0),sy=y0<y1?1:-1;let e=dx+dy;c.fillStyle=color(v);for(let n=0;n<1000;n++){c.fillRect(x0,y0,1,1);if(x0===x1&&y0===y1)break;const e2=2*e;if(e2>=dy){e+=dy;x0+=sx;}if(e2<=dx){e+=dx;y0+=sy;}}}
export function pixelText(c,text,x,y,scale=1,intensity=1,align='left'){
 text=String(text).toUpperCase();const width=text.length*4*scale-scale;
 if(align==='center')x-=width/2;else if(align==='right')x-=width;
 c.fillStyle=color(intensity);for(const ch of text){const glyph=FONT[ch]||FONT['?'];for(let r=0;r<5;r++)for(let col=0;col<3;col++)if(glyph[r][col]==='1')c.fillRect(Math.round(x+col*scale),Math.round(y+r*scale),scale,scale);x+=4*scale;}
}
function clear(c){c.fillStyle='#000';c.fillRect(0,0,160,192);}
function hud(c,left,right){pixelText(c,left,6,5,1,.85);pixelText(c,right,154,5,1,.85,'right');rect(c,6,14,148,1,.16);}
function overlay(c,title,sub='PRESS SPACE',extra=''){
 rect(c,8,72,144,45,0);rect(c,8,72,144,1,.35);rect(c,8,116,144,1,.35);
 pixelText(c,title,80,82,1,1,'center');pixelText(c,sub,80,96,1,.7,'center');if(extra)pixelText(c,extra,80,107,1,.4,'center');
}
function sprite(c,rows,x,y,s=1,v=1){rows.forEach((r,yy)=>[...r].forEach((p,xx)=>{if(p==='1')rect(c,x+xx*s,y+yy*s,s,s,v);}));}
class Base {
 constructor(id){this.id=id;this.status='ready';this._score=0;this.time=0;}
 get score(){return this._score;}
 startGate(dt,i){this.time+=dt;if(this.status==='ready'||this.status==='over'||this.status==='won'){if(hit(i,'Space','Enter')){if(this.status!=='ready')this.restart();this.status='playing';this.onStart?.();i.sound?.('start');}return true;}return false;}
 terminalOverlay(c,title){if(this.status==='ready')overlay(c,title,'PRESS SPACE','ENTER ALSO STARTS');else if(this.status==='over')overlay(c,'GAME OVER','SPACE TO RESTART');else if(this.status==='won')overlay(c,'YOU WIN','SPACE TO RESTART');}
}

const SHAPES=[[[1,1,1,1]],[[1,1],[1,1]],[[0,1,0],[1,1,1]],[[1,0,0],[1,1,1]],[[0,0,1],[1,1,1]],[[0,1,1],[1,1,0]],[[1,1,0],[0,1,1]]];
class Tetris extends Base{
 constructor(){super('tetris');this.restart();}
 restart(){this.status='ready';this._score=0;this.lines=0;this.level=1;this.board=Array.from({length:20},()=>Array(10).fill(0));this.bag=[];this.queue=[this.take(),this.take(),this.take()];this.dropClock=0;this.moveClock=0;this.lastDir=0;this.clearClock=0;this.clearing=[];this.spawn();}
 take(){if(!this.bag.length){this.bag=[0,1,2,3,4,5,6];for(let j=6;j>0;j--){const k=Math.floor(Math.random()*(j+1));[this.bag[j],this.bag[k]]=[this.bag[k],this.bag[j]];}}return this.bag.pop();}
 spawn(){this.shape=SHAPES[this.queue.shift()].map(r=>r.slice());this.queue.push(this.take());this.x=Math.floor((10-this.shape[0].length)/2);this.y=-1;this.dropClock=0;if(this.collision(this.shape,this.x,this.y))this.status='over';}
 collision(s,x,y){return s.some((r,yy)=>r.some((v,xx)=>v&&(x+xx<0||x+xx>=10||y+yy>=20||(y+yy>=0&&this.board[y+yy][x+xx]))));}
 rotate(dir){const s=dir>0?this.shape[0].map((_,x)=>this.shape.map(row=>row[x]).reverse()):this.shape[0].map((_,x)=>this.shape.map(row=>row[this.shape[0].length-1-x]));for(const [dx,dy] of [[0,0],[-1,0],[1,0],[-2,0],[2,0],[0,-1],[0,-2]])if(!this.collision(s,this.x+dx,this.y+dy)){this.shape=s;this.x+=dx;this.y+=dy;return true;}return false;}
 lock(i){let above=false;this.shape.forEach((r,yy)=>r.forEach((v,xx)=>{if(v){if(this.y+yy<0)above=true;else this.board[this.y+yy][this.x+xx]=1;}}));if(above){this.status='over';i.sound?.('lose');return;}this.clearing=[];this.board.forEach((r,y)=>{if(r.every(Boolean))this.clearing.push(y);});if(this.clearing.length){this.clearClock=.18;i.sound?.('clear');}else{this.spawn();i.sound?.('hit');}}
 descend(i,soft=false){if(!this.collision(this.shape,this.x,this.y+1)){this.y++;if(soft)this._score++;return true;}this.lock(i);return false;}
 update(dt,i){if(this.startGate(dt,i))return;if(this.clearClock>0){this.clearClock-=dt;if(this.clearClock<=0){this.clearClock=0;const n=this.clearing.length;this.board=this.board.filter((_,y)=>!this.clearing.includes(y));while(this.board.length<20)this.board.unshift(Array(10).fill(0));this._score+=[0,100,300,500,800][n]*this.level;this.lines+=n;this.level=1+Math.floor(this.lines/10);this.clearing=[];this.spawn();}return;}
 const dir=Number(held(i,'ArrowRight','KeyD'))-Number(held(i,'ArrowLeft','KeyA'));if(dir!==this.lastDir){this.moveClock=0;this.lastDir=dir;if(dir&&!this.collision(this.shape,this.x+dir,this.y))this.x+=dir;}else if(dir){this.moveClock+=dt;if(this.moveClock>.15){this.moveClock-=.055;if(!this.collision(this.shape,this.x+dir,this.y))this.x+=dir;}}
 if(hit(i,'ArrowUp','KeyW','KeyX')){if(this.rotate(1))i.sound?.('tick');}if(hit(i,'KeyZ'))this.rotate(-1);
 if(hit(i,'Space')){while(!this.collision(this.shape,this.x,this.y+1)){this.y++;this._score+=2;}this.lock(i);return;}
 const soft=held(i,'ArrowDown','KeyS');this.dropClock+=dt;const interval=soft?.045:Math.max(.085,.7*Math.pow(.82,this.level-1));if(this.dropClock>=interval){this.dropClock-=interval;this.descend(i,soft);}}
 render(c){clear(c);hud(c,'TETRIS',String(this._score).padStart(6,'0'));const ox=20,oy=28,cell=7;rect(c,ox-2,oy-2,1,144,.28);rect(c,ox+70,oy-2,1,144,.28);rect(c,ox-2,oy+140,73,1,.3);
 const block=(x,y,v)=>{if(y>=0){rect(c,ox+x*cell,oy+y*cell,6,6,v);rect(c,ox+x*cell+1,oy+y*cell+1,4,1,Math.min(1,v+.15));}};
 this.board.forEach((r,y)=>r.forEach((v,x)=>{if(v)block(x,y,this.clearing.includes(y)?(.4+.6*Math.abs(Math.sin(this.time*38))):.72);}));
 if(this.clearClock<=0){let gy=this.y;while(!this.collision(this.shape,this.x,gy+1))gy++;this.shape.forEach((r,y)=>r.forEach((v,x)=>{if(v)block(this.x+x,gy+y,.13);}));this.shape.forEach((r,y)=>r.forEach((v,x)=>{if(v)block(this.x+x,this.y+y,.95);}));}
 pixelText(c,'NEXT',105,30,1,.5);this.queue.forEach((id,n)=>{SHAPES[id].forEach((r,y)=>r.forEach((v,x)=>{if(v)rect(c,105+x*5,42+n*24+y*5,4,4,.65-n*.1);}));});pixelText(c,'LINES',105,124,1,.45);pixelText(c,this.lines,105,134,1,.9);pixelText(c,'LEVEL',105,151,1,.45);pixelText(c,this.level,105,161,1,.9);pixelText(c,'STACK / CLEAR / REPEAT',80,182,1,.3,'center');this.terminalOverlay(c,'TETRIS');}
}

class Pong extends Base{
 constructor(){super('pong');this.restart();}
 restart(){this.status='ready';this._score=0;this.enemyScore=0;this.py=104;this.ay=104;this.pv=0;this.ball={x:80,y:104,vx:0,vy:0};this.waiting=true;this.serveDir=Math.random()<.5?-1:1;this.aiClock=0;this.target=104;}
 onStart(){this.serve();}
 serve(){this.waiting=false;this.ball={x:80,y:104,vx:this.serveDir*57,vy:rnd(-23,23)};}
 update(dt,i){if(this.startGate(dt,i))return;const old=this.py;this.py=clamp(this.py+(Number(held(i,'ArrowDown','KeyS'))-Number(held(i,'ArrowUp','KeyW')))*105*dt,32,174);if(i.pointer?.active)this.py=clamp(i.pointer.y,32,174);this.pv=(this.py-old)/Math.max(.001,dt);
 this.aiClock-=dt;if(this.aiClock<=0){this.aiClock=.12;this.target=this.ball.vx>0?this.ball.y+Math.sin(this.time*2.1)*10:104;}this.ay+=clamp(this.target-this.ay,-65*dt,65*dt);this.ay=clamp(this.ay,32,174);
 if(this.waiting){if(hit(i,'Space','Enter'))this.serve();return;}const b=this.ball;for(let n=0;n<3;n++){b.x+=b.vx*dt/3;b.y+=b.vy*dt/3;if(b.y<20){b.y=20;b.vy=Math.abs(b.vy);i.sound?.('tick');}if(b.y>187){b.y=187;b.vy=-Math.abs(b.vy);i.sound?.('tick');}
 if(b.vx<0&&b.x<=13&&b.x>=7&&Math.abs(b.y-this.py)<17){const angle=clamp((b.y-this.py)/16,-1,1)*.9;const speed=Math.min(110,Math.hypot(b.vx,b.vy)+4);b.x=13;b.vx=Math.cos(angle)*speed;b.vy=Math.sin(angle)*speed+this.pv*.12;i.sound?.('hit');}
 if(b.vx>0&&b.x>=147&&b.x<=153&&Math.abs(b.y-this.ay)<17){const angle=clamp((b.y-this.ay)/16,-1,1)*.9;const speed=Math.min(110,Math.hypot(b.vx,b.vy)+4);b.x=147;b.vx=-Math.cos(angle)*speed;b.vy=Math.sin(angle)*speed;i.sound?.('hit');}
 if(b.x<0||b.x>160){if(b.x>160){this._score++;this.serveDir=-1;}else{this.enemyScore++;this.serveDir=1;}this.waiting=true;this.ball={x:80,y:104,vx:0,vy:0};i.sound?.('score');if(this._score>=7)this.status='won';else if(this.enemyScore>=7)this.status='over';break;}}}
 render(c){clear(c);hud(c,'PONG','FIRST TO 7');for(let y=20;y<189;y+=8)rect(c,79,y,1,3,.18);pixelText(c,this._score,58,25,2,.8,'center');pixelText(c,this.enemyScore,102,25,2,.8,'center');rect(c,9,this.py-15,3,30,.95);rect(c,148,this.ay-15,3,30,.7);rect(c,this.ball.x-1,this.ball.y-1,3,3,1);if(this.waiting&&this.status==='playing')pixelText(c,'SPACE TO SERVE',80,124,1,.6,'center');this.terminalOverlay(c,'PONG');}
}

class Breakout extends Base{
 constructor(){super('breakout');this.restart();}
 restart(){this.status='ready';this._score=0;this.lives=3;this.level=1;this.px=80;this.makeBricks();this.resetBall();}
 makeBricks(){this.bricks=[];for(let y=0;y<5;y++)for(let x=0;x<8;x++)this.bricks.push({x:9+x*18,y:31+y*10,w:16,h:7,alive:true,row:y});}
 resetBall(){this.waiting=true;this.ball={x:this.px,y:170,vx:0,vy:0};}
 onStart(){this.launch();}
 launch(){this.waiting=false;const speed=62+Math.min(28,(this.level-1)*6);this.ball.vx=speed*.38*(Math.random()<.5?-1:1);this.ball.vy=-speed*.925;}
 update(dt,i){if(this.startGate(dt,i))return;this.px=clamp(this.px+(Number(held(i,'ArrowRight','KeyD'))-Number(held(i,'ArrowLeft','KeyA')))*110*dt,19,141);if(i.pointer?.active)this.px=clamp(i.pointer.x,19,141);
 if(this.waiting){this.ball.x=this.px;if(hit(i,'Space','Enter'))this.launch();return;}const b=this.ball;
 for(let s=0;s<4;s++){const oldX=b.x,oldY=b.y;b.x+=b.vx*dt/4;b.y+=b.vy*dt/4;if(b.x<5){b.x=5;b.vx=Math.abs(b.vx);i.sound?.('tick');}if(b.x>155){b.x=155;b.vx=-Math.abs(b.vx);i.sound?.('tick');}if(b.y<19){b.y=19;b.vy=Math.abs(b.vy);i.sound?.('tick');}
 if(b.vy>0&&oldY<=173&&b.y>=173&&Math.abs(b.x-this.px)<18){const angle=clamp((b.x-this.px)/17,-1,1)*1.08;const speed=Math.min(112,Math.hypot(b.vx,b.vy)+1);b.y=172;b.vx=Math.sin(angle)*speed;b.vy=-Math.cos(angle)*speed;i.sound?.('hit');}
 for(const brick of this.bricks){if(!brick.alive)continue;if(b.x+1.5>=brick.x&&b.x-1.5<=brick.x+brick.w&&b.y+1.5>=brick.y&&b.y-1.5<=brick.y+brick.h){brick.alive=false;this._score+=(5-brick.row)*10;if(oldY+1.5<=brick.y||oldY-1.5>=brick.y+brick.h)b.vy*=-1;else b.vx*=-1;b.x=oldX;b.y=oldY;i.sound?.('hit');break;}}
 if(b.y>195){this.lives--;i.sound?.('lose');if(this.lives<=0)this.status='over';else this.resetBall();break;}}
 if(!this.bricks.some(b=>b.alive)){this.level++;this.makeBricks();this.resetBall();i.sound?.('clear');}}
 render(c){clear(c);hud(c,'BREAKOUT',String(this._score).padStart(5,'0'));rect(c,2,18,1,173,.12);rect(c,157,18,1,173,.12);this.bricks.forEach(b=>{if(b.alive)rect(c,b.x,b.y,b.w,b.h,.95-b.row*.12);});rect(c,this.px-16,176,32,3,.95);rect(c,this.ball.x-1,this.ball.y-1,3,3,1);pixelText(c,'L'+this.level,6,184,1,.5);pixelText(c,'LIVES '+this.lives,154,184,1,.5,'right');if(this.waiting&&this.status==='playing')pixelText(c,'SPACE TO LAUNCH',80,119,1,.65,'center');this.terminalOverlay(c,'BREAKOUT');}
}

const wrap=(v,low,high)=>low+((v-low)%(high-low)+(high-low))%(high-low);
class Asteroids extends Base{
 constructor(){super('asteroids');this.restart();}
 restart(){this.status='ready';this._score=0;this.lives=3;this.wave=1;this.bullets=[];this.particles=[];this.rocks=[];this.shotClock=0;this.ship={x:80,y:105,vx:0,vy:0,a:-Math.PI/2,inv:2};this.addWave();}
 addRock(x,y,size,vx,vy){const radius=[0,4,8,14][size];this.rocks.push({x,y,size,r:radius,vx:vx??rnd(-14,14),vy:vy??rnd(-14,14),a:rnd(0,6.28),spin:rnd(-.6,.6),shape:Array.from({length:9},()=>rnd(.65,1.15))});}
 addWave(){for(let n=0;n<Math.min(7,2+this.wave);n++){const side=Math.random()<.5;this.addRock(side?rnd(0,160):(Math.random()<.5?4:156),side?(Math.random()<.5?22:185):rnd(20,188),3,rnd(-15,15)*(1+this.wave*.1),rnd(-15,15)*(1+this.wave*.1));}}
 burst(x,y,n=9){for(let j=0;j<n;j++){const a=rnd(0,Math.PI*2),speed=rnd(8,35);this.particles.push({x,y,vx:Math.cos(a)*speed,vy:Math.sin(a)*speed,life:rnd(.2,.6)});}}
 update(dt,i){if(this.startGate(dt,i))return;const s=this.ship;s.inv-=dt;s.a+=(Number(held(i,'ArrowRight','KeyD'))-Number(held(i,'ArrowLeft','KeyA')))*3.8*dt;this.thrust=held(i,'ArrowUp','KeyW');if(this.thrust){s.vx+=Math.cos(s.a)*58*dt;s.vy+=Math.sin(s.a)*58*dt;}const speed=Math.hypot(s.vx,s.vy);if(speed>70){s.vx*=70/speed;s.vy*=70/speed;}s.vx*=Math.exp(-.11*dt);s.vy*=Math.exp(-.11*dt);s.x=wrap(s.x+s.vx*dt,0,160);s.y=wrap(s.y+s.vy*dt,17,192);
 this.shotClock-=dt;if(held(i,'Space')&&this.shotClock<=0){this.shotClock=.18;this.bullets.push({x:s.x+Math.cos(s.a)*7,y:s.y+Math.sin(s.a)*7,vx:Math.cos(s.a)*120+s.vx*.4,vy:Math.sin(s.a)*120+s.vy*.4,life:1.15});i.sound?.('shoot');}
 for(const r of this.rocks){r.x=wrap(r.x+r.vx*dt,-r.r,160+r.r);r.y=wrap(r.y+r.vy*dt,17-r.r,192+r.r);r.a+=r.spin*dt;}
 const born=[];for(const b of this.bullets){b.x=wrap(b.x+b.vx*dt,0,160);b.y=wrap(b.y+b.vy*dt,17,192);b.life-=dt;for(const r of this.rocks){if(r.dead)continue;if(Math.hypot(b.x-r.x,b.y-r.y)<r.r*.88){r.dead=true;b.life=0;this._score+=[0,100,50,20][r.size];this.burst(r.x,r.y);i.sound?.('hit');if(r.size>1)for(let k=0;k<2;k++){const a=rnd(0,6.28);born.push([r.x,r.y,r.size-1,r.vx+Math.cos(a)*18,r.vy+Math.sin(a)*18]);}break;}}}
 this.rocks=this.rocks.filter(r=>!r.dead);born.forEach(r=>this.addRock(...r));this.bullets=this.bullets.filter(b=>b.life>0);
 if(s.inv<=0&&this.rocks.some(r=>Math.hypot(r.x-s.x,r.y-s.y)<r.r*.75+3)){this.lives--;this.burst(s.x,s.y,18);i.sound?.('lose');if(this.lives<=0)this.status='over';else{Object.assign(s,{x:80,y:105,vx:0,vy:0,inv:2.5});}}
 this.particles.forEach(p=>{p.x+=p.vx*dt;p.y+=p.vy*dt;p.life-=dt;});this.particles=this.particles.filter(p=>p.life>0);if(!this.rocks.length){this.wave++;this.addWave();s.inv=Math.max(s.inv,1.5);i.sound?.('clear');}}
 render(c){clear(c);hud(c,'ASTEROIDS',String(this._score).padStart(6,'0'));this.rocks.forEach(r=>{let prev=null,first=null;r.shape.forEach((f,j)=>{const a=r.a+j/r.shape.length*Math.PI*2,pt=[r.x+Math.cos(a)*r.r*f,r.y+Math.sin(a)*r.r*f];if(prev)line(c,...prev,...pt,.65);else first=pt;prev=pt;});line(c,...prev,...first,.65);});this.bullets.forEach(b=>rect(c,b.x,b.y,1,2,1));this.particles.forEach(p=>rect(c,p.x,p.y,1,1,Math.min(1,p.life*2)));
 const s=this.ship;if(s.inv<=0||Math.floor(this.time*10)%2===0){const point=(a,r)=>[s.x+Math.cos(s.a+a)*r,s.y+Math.sin(s.a+a)*r],nose=point(0,7),left=point(2.5,5),tail=point(Math.PI,2),right=point(-2.5,5);line(c,...nose,...left,1);line(c,...left,...tail,1);line(c,...tail,...right,1);line(c,...right,...nose,1);if(this.thrust&&this.status==='playing'){const flame=point(Math.PI,8+Math.sin(this.time*44)*2);line(c,...tail,...flame,.8);}}
 pixelText(c,'WAVE '+this.wave,6,184,1,.4);pixelText(c,'LIVES '+this.lives,154,184,1,.4,'right');this.terminalOverlay(c,'ASTEROIDS');}
}

const ALIENS=[['001100','011110','111111','101101','001100','010010'],['010010','101101','111111','011110','010010','100001'],['001100','011110','111111','110011','111111','010010']];
class Invaders extends Base{
 constructor(){super('invaders');this.restart();}
 restart(){this.status='ready';this._score=0;this.lives=3;this.wave=1;this.px=80;this.bullets=[];this.enemyShots=[];this.particles=[];this.cooldown=0;this.inv=0;this.makeWave();}
 makeWave(){this.aliens=[];for(let row=0;row<4;row++)for(let col=0;col<8;col++)this.aliens.push({x:15+col*17,y:28+row*12,row,col,alive:true});this.dir=1;this.stepClock=0;this.fireClock=1.1;this.enemyShots=[];this.bullets=[];this.shelters=[];for(let s=0;s<3;s++)for(let y=0;y<10;y++)for(let x=0;x<20;x++){if((y<2&&(x<3-y||x>16+y))||(y>=6&&x>=7&&x<=12))continue;this.shelters.push({x:21+s*49+x,y:145+y});}this.ufo={x:-20,active:false};this.ufoClock=rnd(12,19);}
 update(dt,i){if(this.startGate(dt,i))return;this.inv-=dt;this.px=clamp(this.px+(Number(held(i,'ArrowRight','KeyD'))-Number(held(i,'ArrowLeft','KeyA')))*70*dt,9,151);this.cooldown-=dt;if(held(i,'Space')&&this.cooldown<=0&&this.bullets.length<2){this.cooldown=.3;this.bullets.push({x:this.px,y:171,dead:false});i.sound?.('shoot');}
 const alive=this.aliens.filter(a=>a.alive);this.stepClock+=dt;const stepInterval=Math.max(.065,.44*(alive.length/32)/Math.sqrt(this.wave));if(this.stepClock>=stepInterval){this.stepClock-=stepInterval;const edge=alive.some(a=>a.x+this.dir*2<5||a.x+this.dir*2>148);if(edge){this.dir*=-1;alive.forEach(a=>a.y+=5);}else alive.forEach(a=>a.x+=this.dir*2);if(alive.some(a=>a.y>=163)){this.status='over';i.sound?.('lose');}}
 this.fireClock-=dt;if(this.fireClock<=0&&alive.length){this.fireClock=rnd(.4,1.05)/Math.min(2,1+this.wave*.15);const cols=[...new Set(alive.map(a=>a.col))];const col=cols[Math.floor(Math.random()*cols.length)];const shooter=alive.filter(a=>a.col===col).sort((a,b)=>b.y-a.y)[0];this.enemyShots.push({x:shooter.x+3,y:shooter.y+6});}
 this.ufoClock-=dt;if(!this.ufo.active&&this.ufoClock<=0){this.ufo={x:-14,active:true};this.ufoClock=rnd(13,20);}if(this.ufo.active){this.ufo.x+=25*dt;if(this.ufo.x>172)this.ufo.active=false;}
 const erode=(x,y)=>{const touched=this.shelters.some(p=>Math.abs(p.x-x)<2&&Math.abs(p.y-y)<3);if(touched)this.shelters=this.shelters.filter(p=>Math.hypot(p.x-x,p.y-y)>3.1);return touched;};
 for(const b of this.bullets){const prev=b.y;b.y-=115*dt;if(erode(b.x,b.y)){b.dead=true;continue;}for(const a of alive){if(a.alive&&b.x>=a.x-1&&b.x<=a.x+6&&b.y<=a.y+7&&prev>=a.y){a.alive=false;b.dead=true;this._score+=(4-a.row)*10;this.particles.push({x:a.x+3,y:a.y+3,life:.2});i.sound?.('hit');break;}}if(this.ufo.active&&b.y<25&&b.y>15&&Math.abs(b.x-(this.ufo.x+6))<8){this.ufo.active=false;b.dead=true;this._score+=100;i.sound?.('score');}}
 this.bullets=this.bullets.filter(b=>!b.dead&&b.y>15);
 for(const b of this.enemyShots){b.y+=(44+Math.min(35,this.wave*5))*dt;if(erode(b.x,b.y)){b.dead=true;continue;}if(this.inv<=0&&b.y>=170&&b.y<=181&&Math.abs(b.x-this.px)<7){b.dead=true;this.lives--;this.inv=1.6;this.px=80;i.sound?.('lose');if(this.lives<=0)this.status='over';}}
 this.enemyShots=this.enemyShots.filter(b=>!b.dead&&b.y<190);this.particles.forEach(p=>p.life-=dt);this.particles=this.particles.filter(p=>p.life>0);
 // Invaders erase cover as they march through it.
 this.shelters=this.shelters.filter(p=>!alive.some(a=>a.alive&&p.x>=a.x&&p.x<=a.x+6&&p.y>=a.y&&p.y<=a.y+6));
 if(!this.aliens.some(a=>a.alive)&&this.status==='playing'){this.wave++;this.makeWave();this.inv=1;i.sound?.('clear');}}
 render(c){clear(c);hud(c,'INVADERS',String(this._score).padStart(6,'0'));this.aliens.forEach(a=>{if(a.alive){const rows=ALIENS[a.row%3];sprite(c,Math.floor(this.time*3)%2?rows:rows.map((r,j)=>j===5?(r==='010010'?'100001':'010010'):r),a.x,a.y,1,.95-a.row*.12);}});this.shelters.forEach(p=>rect(c,p.x,p.y,1,1,.5));this.bullets.forEach(b=>rect(c,b.x,b.y,1,4,1));this.enemyShots.forEach(b=>{rect(c,b.x,b.y,1,3,.8);rect(c,b.x+(Math.floor(this.time*16)%2?1:-1),b.y+2,1,2,.65);});if(this.ufo.active)sprite(c,['0001111000','0111111110','1111111111','0101001010'],this.ufo.x,19,1,.8);this.particles.forEach(p=>{line(c,p.x-4,p.y-4,p.x+4,p.y+4,p.life*4);line(c,p.x+4,p.y-4,p.x-4,p.y+4,p.life*4);});if(this.inv<=0||Math.floor(this.time*9)%2===0)sprite(c,['00000100000','00001110000','01111111110','11111111111','11111111111','11111111111'],this.px-5,172,1,1);rect(c,5,181,150,1,.2);pixelText(c,'WAVE '+this.wave,6,186,1,.45);pixelText(c,'LIVES '+this.lives,154,186,1,.45,'right');this.terminalOverlay(c,'SPACE INVADERS');}
}

export function createGame(id){switch(id){case 'tetris':return new Tetris();case 'pong':return new Pong();case 'breakout':return new Breakout();case 'asteroids':return new Asteroids();case 'invaders':case 'space-invaders':return new Invaders();default:throw new Error(`Unknown game: ${id}`);}}

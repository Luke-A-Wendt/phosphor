import {pixelText} from './games.js';
export const GAME_HINTS={
 tetris:'LEFT RIGHT MOVE / UP ROTATE / SPACE DROP',
 pong:'UP DOWN MOVE / SPACE SERVE',
 breakout:'LEFT RIGHT MOVE / SPACE LAUNCH',
 asteroids:'LEFT RIGHT TURN / UP THRUST / SPACE FIRE',
 invaders:'LEFT RIGHT MOVE / SPACE FIRE',
 snake:'DIRECTIONS STEER / HOLD SPACE BOOST',
 lander:'LEFT RIGHT TILT / SPACE THRUST',
 tanks:'LEFT RIGHT AIM / UP DOWN POWER / SPACE FIRE',
 settings:'ADJUST THE LIGHT AND GLASS'
};
export function drawRoot(ctx,items,index,touch=false){
 ctx.fillStyle='#000';ctx.fillRect(0,0,256,192);
 pixelText(ctx,'PHOSPHOR',128,13,3,.94,'center');
 ctx.fillStyle='#292929';ctx.fillRect(53,34,150,1);
 items.forEach((item,i)=>{
  const y=43+i*12,selected=i===index;
  if(selected){ctx.fillStyle='#101010';ctx.fillRect(52,y-3,152,11);pixelText(ctx,'>',57,y,1,.9);pixelText(ctx,'<',196,y,1,.9);}
  pixelText(ctx,item.name,128,y,1,selected?.98:.43,'center');
 });
 pixelText(ctx,GAME_HINTS[items[index].id]||'',128,155,1,.32,'center');
 ctx.fillStyle='#202020';ctx.fillRect(53,165,150,1);
 pixelText(ctx,touch?'STICK SELECT / BUTTON PLAY':'UP DOWN SELECT / SPACE PLAY',128,171,1,.42,'center');
 pixelText(ctx,'ESC BACK',128,181,1,.42,'center');
}
export function drawLaunch(ctx){
 ctx.clearRect(0,0,192,48);
 pixelText(ctx,'OPEN PHOSPHOR',96,17,3,1,'center');
 ctx.globalCompositeOperation='source-in';ctx.fillStyle='#66ff84';ctx.fillRect(0,0,192,48);ctx.globalCompositeOperation='source-over';
}

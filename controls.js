// Pure input helpers shared by keyboard, virtual stick and controller tests.
export const movementCodes={KeyW:'ArrowUp',KeyA:'ArrowLeft',KeyS:'ArrowDown',KeyD:'ArrowRight',ArrowUp:'ArrowUp',ArrowLeft:'ArrowLeft',ArrowDown:'ArrowDown',ArrowRight:'ArrowRight',Space:'Space',KeyE:'Space',Enter:'Space',NumpadEnter:'Space'};
export function joystickDirections(x,y){
  if(Math.hypot(x,y)<.24)return [];
  const keys=[];
  if(Math.abs(x)>.3&&Math.abs(x)>=Math.abs(y)*.45)keys.push(x>0?'ArrowRight':'ArrowLeft');
  if(Math.abs(y)>.3&&Math.abs(y)>=Math.abs(x)*.45)keys.push(y>0?'ArrowDown':'ArrowUp');
  return keys;
}
export class InputState {
  constructor(){this.sources=new Map();this.down=new Set();this.pressed=new Set();this.pointer={active:false};this.sound=()=>{};}
  set(name,keys){this.sources.set(name,new Set(keys));const next=new Set([...this.sources.values()].flatMap(s=>[...s]));for(const k of next)if(!this.down.has(k))this.pressed.add(k);this.down=next;}
  release(name){this.sources.delete(name);this.down=new Set([...this.sources.values()].flatMap(s=>[...s]));}
  clear(){this.sources.clear();this.down.clear();this.pressed.clear();}
}
export class MenuNavigation {
  constructor(count){this.count=count;this.index=0;this.direction=0;this.timer=0;}
  update(dt,input){
    const down=input.down.has('ArrowDown'),up=input.down.has('ArrowUp');
    const dir=down||up?Number(down)-Number(up):Number(input.pressed.has('ArrowDown'))-Number(input.pressed.has('ArrowUp'));
    if(dir!==this.direction){this.direction=dir;this.timer=.33;if(dir)this.index=(this.index+dir+this.count)%this.count;}
    else if(dir){this.timer-=dt;if(this.timer<=0){this.index=(this.index+dir+this.count)%this.count;this.timer+=.14;}}
    return this.index;
  }
  release(){this.direction=0;this.timer=0;}
}

import test from 'node:test';
import assert from 'node:assert/strict';
import {TouchKeys} from '../touch-keys.js';
import {InputState} from '../controls.js';

function harness(){
 const input=new InputState(),sounds=[],captures=[],events=new Map();let exits=0,enabled=true,hit=null;
 const buttons=new Map(['Escape','ArrowUp','ArrowLeft','ArrowDown','ArrowRight','Space'].map(key=>{
  const classes=new Set(),attributes={};const b={dataset:{key},classList:{toggle(name,on){if(on)classes.add(name);else classes.delete(name);},contains:name=>classes.has(name)},setAttribute:(name,value)=>attributes[name]=value,closest(){return this;},attributes};return[key,b];
 }));
 const root={querySelectorAll:()=>buttons.values(),contains:b=>[...buttons.values()].includes(b),ownerDocument:{elementFromPoint:()=>hit},addEventListener:(name,fn)=>events.set(name,fn),removeEventListener:name=>events.delete(name),setPointerCapture:id=>captures.push(id)};
 const keys=new TouchKeys({root,input,onPress:key=>sounds.push(key),onEscape:()=>exits++,isEnabled:()=>enabled});
 const send=(name,key='ArrowUp',pointerId=1,extra={})=>events.get(name)?.({target:buttons.get(key),pointerId,button:0,clientX:0,clientY:0,preventDefault(){},...extra});
 return{keys,input,sounds,buttons,events,captures,send,exits:()=>exits,setEnabled:value=>enabled=value,point:key=>hit=buttons.get(key)||null};
}

test('arrow and action pointers work together and sound only on depression',()=>{
 const h=harness();h.send('pointerdown','ArrowLeft',1);h.send('pointerdown','Space',2);
 assert.deepEqual([...h.input.down].sort(),['ArrowLeft','Space']);assert.deepEqual(h.sounds,['ArrowLeft','Space']);assert.equal(h.buttons.get('Space').attributes['aria-pressed'],'true');
 h.send('pointerdown','Space',2);assert.equal(h.sounds.length,2);
 h.send('pointerup','ArrowLeft',1);assert.deepEqual([...h.input.down],['Space']);assert.equal(h.buttons.get('ArrowLeft').classList.contains('held'),false);
 h.send('pointerup','Space',2);assert.equal(h.input.down.size,0);
});

test('sliding an arrow finger releases the old direction through gaps and re-enters',()=>{
 const h=harness();h.send('pointerdown','ArrowUp');h.point('ArrowRight');h.send('pointermove');
 assert.deepEqual([...h.input.down],['ArrowRight']);assert.deepEqual(h.sounds,['ArrowUp','ArrowRight']);
 h.point(null);h.send('pointermove');assert.equal(h.input.down.size,0);assert.equal(h.buttons.get('ArrowRight').classList.contains('held'),false);
 h.point('ArrowDown');h.send('pointermove');assert.deepEqual([...h.input.down],['ArrowDown']);
 h.point('Space');h.send('pointermove');assert.equal(h.input.down.size,0,'arrow sliding cannot trigger action');
});

test('cancel, capture loss, clear and competing sources cannot leave keys held',()=>{
 const h=harness();h.input.set('keyboard',['ArrowUp']);h.send('pointerdown','ArrowUp',1);h.send('pointerdown','ArrowUp',2);
 assert.equal(h.sounds.length,1);h.send('pointercancel','ArrowUp',1);assert.ok(h.input.down.has('ArrowUp'));
 h.send('lostpointercapture','ArrowUp',2);assert.ok(h.input.down.has('ArrowUp'),'independent keyboard stays held');
 h.send('pointerdown','Space',3);h.keys.clear();assert.deepEqual([...h.input.down],['ArrowUp']);assert.ok([...h.buttons.values()].every(b=>!b.classList.contains('held')));
});

test('Escape fires once, touch click does not repeat, and assistive click preserves taps',()=>{
 const h=harness();h.send('pointerdown','Escape');assert.equal(h.exits(),1);assert.equal(h.input.down.size,0);
 h.send('pointerup','Escape');h.send('click','Escape',1,{detail:1});assert.equal(h.exits(),1);
 h.send('click','Escape',1,{detail:0});assert.equal(h.exits(),2);
 h.send('click','Space',1,{detail:0});assert.ok(h.input.pressed.has('Space'));assert.equal(h.input.down.size,0);
 h.setEnabled(false);h.send('pointerdown','ArrowUp');assert.equal(h.input.down.size,0);
});

test('physical aliases paint one key until all matching keys release; destroy unbinds',()=>{
 const h=harness();h.keys.setPhysical('Enter',true);h.keys.setPhysical('Space',true);h.keys.setPhysical('Enter',false);
 assert.equal(h.buttons.get('Space').classList.contains('held'),true);h.keys.setPhysical('Space',false);assert.equal(h.buttons.get('Space').classList.contains('held'),false);
 h.keys.setPhysical('KeyW',true);assert.equal(h.buttons.get('ArrowUp').classList.contains('held'),true);h.keys.destroy();assert.equal(h.events.size,0);assert.equal(h.buttons.get('ArrowUp').classList.contains('held'),false);
});

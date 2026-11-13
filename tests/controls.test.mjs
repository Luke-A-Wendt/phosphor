import test from 'node:test';
import assert from 'node:assert/strict';
import {InputState,MenuNavigation,joystickDirections,movementCodes} from '../controls.js';

const sorted=s=>[...s].sort();

test('only movement keys and the single action are mapped',()=>{
  for(const [letter,direction] of [['KeyW','ArrowUp'],['KeyA','ArrowLeft'],['KeyS','ArrowDown'],['KeyD','ArrowRight']])assert.equal(movementCodes[letter],direction);
  assert.equal(movementCodes.Space,'Space');
  assert.equal(movementCodes.Enter,'Space');assert.equal(movementCodes.NumpadEnter,'Space');
  for(const removed of ['KeyP','KeyR','KeyF','KeyZ','KeyX'])assert.equal(movementCodes[removed],undefined);
});

test('releasing one input does not release another held source',()=>{
  const state=new InputState();
  state.set('keyboard',['ArrowLeft']);state.set('stick',['ArrowLeft']);state.set('button',['Space']);
  assert.deepEqual(sorted(state.down),['ArrowLeft','Space']);
  state.release('stick');assert.ok(state.down.has('ArrowLeft'));
  state.release('keyboard');assert.deepEqual(sorted(state.down),['Space']);
  state.release('button');assert.equal(state.down.size,0);
});

test('held inputs do not create repeated action edges; a new press does',()=>{
  const state=new InputState();state.set('action',['Space']);assert.ok(state.pressed.has('Space'));
  state.pressed.clear();state.set('action',['Space']);assert.equal(state.pressed.size,0);
  state.release('action');state.set('action',['Space']);assert.ok(state.pressed.has('Space'));
  state.clear();assert.equal(state.down.size,0);assert.equal(state.pressed.size,0);assert.equal(state.sources.size,0);
});

test('a tap shorter than a simulation tick still preserves the action edge',()=>{
  const state=new InputState();state.set('action',['Space']);state.release('action');
  assert.equal(state.down.size,0);assert.ok(state.pressed.has('Space'));
});

test('joystick centers cleanly, has a dead zone, and supports cardinal and diagonal motion',()=>{
  assert.deepEqual(joystickDirections(0,0),[]);
  assert.deepEqual(joystickDirections(.1,-.1),[]);
  assert.deepEqual(joystickDirections(1,.1),['ArrowRight']);
  assert.deepEqual(joystickDirections(-1,.1),['ArrowLeft']);
  assert.deepEqual(joystickDirections(.1,-1),['ArrowUp']);
  assert.deepEqual(joystickDirections(.1,1),['ArrowDown']);
  assert.deepEqual(joystickDirections(.7,-.7),['ArrowRight','ArrowUp']);
  assert.deepEqual(joystickDirections(-.7,.7),['ArrowLeft','ArrowDown']);
  const state=new InputState();state.set('stick',joystickDirections(.7,-.7));state.set('stick',joystickDirections(0,0));assert.equal(state.down.size,0);
});

test('menu steps immediately, waits before repeating, and wraps in both directions',()=>{
  const state=new InputState(),menu=new MenuNavigation(5);
  state.set('stick',['ArrowDown']);assert.equal(menu.update(1/120,state),1);
  for(let i=0;i<30;i++)menu.update(1/120,state);
  assert.equal(menu.index,1,'no repeat before the initial delay');
  for(let i=0;i<11;i++)menu.update(1/120,state);
  assert.equal(menu.index,2,'held direction repeats after the delay');
  state.release('stick');menu.update(1/120,state);
  menu.index=0;state.set('stick',['ArrowUp']);assert.equal(menu.update(1/120,state),4);
  state.release('stick');menu.update(1/120,state);state.set('stick',['ArrowDown']);assert.equal(menu.update(1/120,state),0);
});

test('opposing directions cancel and clearing input prevents stale menu movement',()=>{
  const state=new InputState(),menu=new MenuNavigation(5);
  state.set('keyboard',['ArrowUp']);state.set('stick',['ArrowDown']);assert.equal(menu.update(1/120,state),0);
  state.clear();menu.release();for(let i=0;i<120;i++)menu.update(1/120,state);assert.equal(menu.index,0);
});

test('menu accepts a direction tap that ends before a simulation tick',()=>{
  const input=new InputState(),menu=new MenuNavigation(5);
  input.set('tap',['ArrowDown']);input.release('tap');
  assert.equal(menu.update(1/120,input),1);
  input.pressed.clear();assert.equal(menu.update(1/120,input),1);
});

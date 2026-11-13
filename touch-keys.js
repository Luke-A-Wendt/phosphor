import {movementCodes} from './controls.js';

/** Independent pointer sources allow steering and firing together without stuck keys. */
export class TouchKeys {
 constructor({root,input,onEscape=()=>{},onPress=()=>{},isEnabled=()=>true}){
  this.root=root;this.input=input;this.onEscape=onEscape;this.onPress=onPress;this.isEnabled=isEnabled;
  this.buttons=[...root.querySelectorAll('[data-key]')];this.pointers=new Map();this.physical=new Map();this.listeners=[];
  for(const [event,handler] of Object.entries({pointerdown:e=>this.down(e),pointermove:e=>this.move(e),pointerup:e=>this.release(e.pointerId),pointercancel:e=>this.release(e.pointerId),lostpointercapture:e=>this.release(e.pointerId),click:e=>this.click(e),contextmenu:e=>e.preventDefault()})){
   root.addEventListener(event,handler);this.listeners.push([event,handler]);
  }
 }
 buttonAt(node){const button=node?.closest?.('[data-key]');return button&&this.root.contains(button)?button:null;}
 source(id){return 'touch-key-'+id;}
 paint(){
  const down=new Set([...this.pointers.values()].map(p=>p.key).filter(Boolean));
  for(const key of this.physical.values())down.add(key);
  for(const button of this.buttons){const held=down.has(button.dataset.key);button.classList.toggle('held',held);button.setAttribute('aria-pressed',String(held));}
 }
 press(id,key,origin=key){
  if(!this.isEnabled(key))return;
  const wasDown=[...this.pointers.values()].some(p=>p.key===key)||[...this.physical.values()].includes(key);
  this.pointers.set(id,{key,origin});
  if(key!=='Escape')this.input.set(this.source(id),[key]);
  this.paint();if(!wasDown)this.onPress(key);
  if(key==='Escape'){
   this.onEscape();
   // Navigation releases inputs immediately. A brief mechanical stroke can still
   // be seen on screens that remain visible, without retaining a logical key.
   const button=this.buttons.find(b=>b.dataset.key==='Escape');
   (button?.querySelector?.('.key-photo')||button)?.animate?.([{transform:'scale(.975)'},{transform:'scale(.975)',offset:.55},{transform:'scale(1)'}],{duration:110,easing:'ease-out'});
  }
 }
 down(e){
  if(e.button!==undefined&&e.button!==0)return;
  const button=this.buttonAt(e.target);if(!button||this.pointers.has(e.pointerId)||!this.isEnabled(button.dataset.key))return;
  e.preventDefault();this.root.setPointerCapture?.(e.pointerId);this.press(e.pointerId,button.dataset.key);
 }
 move(e){
  const current=this.pointers.get(e.pointerId);if(!current||!current.origin.startsWith('Arrow'))return;
  const button=this.buttonAt(this.root.ownerDocument.elementFromPoint(e.clientX,e.clientY));
  const key=button?.dataset.key?.startsWith('Arrow')?button.dataset.key:null;
  if(key===current.key)return;
  e.preventDefault();this.input.release(this.source(e.pointerId));
  // Retain the origin while moving through key gaps so the finger can re-enter.
  this.pointers.set(e.pointerId,{key:null,origin:current.origin});
  this.paint();if(key)this.press(e.pointerId,key,current.origin);
 }
 release(id){if(!this.pointers.has(id))return;this.input.release(this.source(id));this.pointers.delete(id);this.paint();}
 click(e){
  e.preventDefault();
  // Touch creates a subsequent click; only assistive activation without a
  // pointer should create a new action here.
  if(e.detail!==0)return;
  const button=this.buttonAt(e.target);if(!button||!this.isEnabled(button.dataset.key))return;
  this.press('assistive',button.dataset.key);this.release('assistive');
 }
 setPhysical(code,down){const key=code==='Escape'?'Escape':movementCodes[code];if(!key)return;if(down)this.physical.set(code,key);else this.physical.delete(code);this.paint();}
 clear(){for(const id of this.pointers.keys())this.input.release(this.source(id));this.pointers.clear();this.physical.clear();this.paint();}
 destroy(){this.clear();for(const [event,handler] of this.listeners)this.root.removeEventListener(event,handler);this.listeners=[];}
}

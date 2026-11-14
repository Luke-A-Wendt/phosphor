import {pixelText} from './games.js';
import {MenuNavigation} from './controls.js';
import {DISPLAY_DEFAULTS,ENVIRONMENTS,normalizeSettings} from './display-settings.js';

const ENVIRONMENT_LABELS={none:'OFF',diffuse:'SOFT ROOM',window:'DAYLIGHT',studio:'DESK LIGHT',observer:'OBSERVER',mixed:'MIXED LIGHT'};
const ROWS=[
 {key:'test',label:'DISPLAY TEST',note:'GRID / FOCUS / MOTION',type:'action'},
 {key:'tint',label:'TINT',note:'MONOCHROME HUE / GREEN 125 DEG',max:360,step:5},
 {key:'environment',label:'ENVIRONMENT',note:'SOFT LIGHT AROUND THE GLASS',type:'environment'},
 {key:'ambient',label:'AMBIENT LIGHT',note:'DARK ROOM < > LIT ROOM'},
 {key:'reflection',label:'REFLECTION',note:'ENVIRONMENTAL GLARE'},
 {key:'brightness',label:'BEAM INTENSITY',note:'PHOSPHOR EXCITATION'},
 {key:'persistence',label:'AFTERGLOW',note:'PHOSPHOR DECAY TIME'},
 {key:'bloom',label:'LIGHT SCATTER',note:'GLOW AROUND BRIGHT PIXELS'},
 {key:'scanlines',label:'SCANLINES',note:'SEPARATION OF RASTER LINES'},
 {key:'curvature',label:'CURVATURE',max:2,note:'CURVED SCREEN GEOMETRY'},
 {key:'glass',label:'GLASS DEPTH',max:2,note:'GLASS THICKNESS AND REFRACTION'},
 {key:'reducedMotion',label:'STABLE DISPLAY',note:'REDUCES RASTER FLUCTUATION',type:'boolean'},
 {key:'degauss',label:'DEGAUSS',note:'DEMAGNETIZE / ENTER TO ACTIVATE',type:'action'},
 {key:'musicVolume',label:'MUSIC',note:'GAME MUSIC / ZERO MUTES',max:1},
 {key:'gameVolume',label:'GAME SOUNDS',note:'GAME EFFECTS / ZERO MUTES',max:1},
 {key:'monitorVolume',label:'MONITOR SOUNDS',note:'CRT POWER AND HUM / ZERO MUTES',max:1},
 {key:'keyboardVolume',label:'KEYBOARD SOUNDS',mobileOnly:true,note:'KEY DEPRESSIONS / ZERO MUTES',max:1},
 {key:'arrowsRight',label:'ARROW KEYS',note:'CHOOSE LEFT OR RIGHT THUMB',type:'boolean',mobileOnly:true},
 {key:'reset',label:'RESET SETTINGS',note:'RESTORE THE DEFAULT DISPLAY',type:'action'},
];
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const fill=(ctx,x,y,w,h,intensity)=>{const value=Math.round(intensity*255);ctx.fillStyle=`rgb(${value},${value},${value})`;ctx.fillRect(x,y,w,h);};

/** Keyboard and joystick operated settings, drawn into the same phosphor raster. */
export class SettingsScreen {
 constructor({mobile=false,options=DISPLAY_DEFAULTS,onChange=()=>{},onTest=()=>{},onDegauss=()=>{},defaults=DISPLAY_DEFAULTS}={}){
  this.options=normalizeSettings(options);this.defaults=normalizeSettings(defaults);
  this.onChange=onChange;this.onTest=onTest;this.onDegauss=onDegauss;
  this.rows=ROWS.filter(row=>!row.mobileOnly||mobile);
  this.navigation=new MenuNavigation(this.rows.length);
  this.adjustDirection=0;this.adjustClock=0;this.top=0;
 }
 setMobile(mobile){
  const key=this.rows[this.index].key;
  this.rows=ROWS.filter(row=>!row.mobileOnly||mobile);this.navigation.count=this.rows.length;
  const index=this.rows.findIndex(row=>row.key===key);this.index=index<0?Math.min(this.index,this.rows.length-1):index;
 }
 get index(){return this.navigation.index;}
 set index(value){
  this.navigation.index=clamp(Number.isFinite(value)?Math.trunc(value):0,0,this.rows.length-1);
  this.top=Math.min(clamp(this.top,Math.max(0,this.index-6),this.index),this.rows.length-7);
  this.release();
 }
 get selectionLabel(){const row=this.rows[this.index];return `${row.label}${row.type==='action'?'':': '+this.valueLabel(row)}`;}
 setOptions(options){this.options=normalizeSettings(options);}
 release(){this.navigation.release();this.adjustDirection=0;this.adjustClock=0;}
 valueLabel(row){
  if(row.key==='arrowsRight')return this.options.arrowsRight?'RIGHT':'LEFT';
  if(row.type==='environment')return ENVIRONMENT_LABELS[this.options.environment];
  if(row.type==='boolean')return this.options[row.key]?'ON':'OFF';
  if(row.type==='action')return '>';
  if(row.key==='tint')return Math.round(this.options.tint)+' DEG';
  return Math.round(this.options[row.key]*100)+'%';
 }
 change(next){this.options=normalizeSettings(next);this.onChange({...this.options});}
 adjust(direction){
  const row=this.rows[this.index];
  if(row.type==='action')return;
  const next={...this.options};
  if(row.type==='environment')next.environment=ENVIRONMENTS[(ENVIRONMENTS.indexOf(next.environment)+direction+ENVIRONMENTS.length)%ENVIRONMENTS.length];
  else if(row.type==='boolean')next[row.key]=direction>0;
  else next[row.key]=clamp(Math.round((next[row.key]+direction*(row.step??.05))*100)/100,row.key==='brightness'?.3:0,row.max??2);
  if(next[row.key]!==this.options[row.key])this.change(next);
 }
 activate(){
  const row=this.rows[this.index];
  if(row.key==='degauss'){this.release();this.onDegauss();}
  else if(row.key==='test'){this.release();this.onTest();}
  else if(row.key==='reset')this.change({...this.defaults});
  else if(row.type==='boolean')this.change({...this.options,[row.key]:!this.options[row.key]});
  else this.adjust(1);
 }
 update(dt,input){
  const before=this.index;this.navigation.update(dt,input);
  if(this.index!==before){this.adjustDirection=0;this.adjustClock=0;}
  this.top=clamp(this.top,Math.max(0,this.index-6),this.index);
  this.top=Math.min(this.top,this.rows.length-7);
  const vertical=input.down.has('ArrowUp')||input.down.has('ArrowDown')||input.pressed.has('ArrowUp')||input.pressed.has('ArrowDown');
  const left=input.down.has('ArrowLeft'),right=input.down.has('ArrowRight');
  const dir=vertical?0:(left||right?Number(right)-Number(left):Number(input.pressed.has('ArrowRight'))-Number(input.pressed.has('ArrowLeft')));
  if(dir!==this.adjustDirection){this.adjustDirection=dir;this.adjustClock=.32;if(dir)this.adjust(dir);}
  else if(dir){this.adjustClock-=dt;if(this.adjustClock<=0){this.adjust(dir);this.adjustClock+=this.rows[this.index].type==='environment'?.22:.1;}}
  if(input.pressed.has('Space'))this.activate();
 }
 render(ctx,touch=false){
  fill(ctx,0,0,256,192,0);
  pixelText(ctx,'SETTINGS',128,18,2,.9,'center');
  fill(ctx,18,35,220,1,.2);
  for(let slot=0;slot<7;slot++){
   const rowIndex=this.top+slot,row=this.rows[rowIndex],y=46+slot*14,selected=rowIndex===this.index;
   if(selected){fill(ctx,17,y-4,219,13,.065);pixelText(ctx,'>',21,y,1,.9);}
   pixelText(ctx,row.label,29,y,1,selected?.94:.4);
   if(!row.type){
    const min=row.key==='brightness'?.3:0,amount=(this.options[row.key]-min)/((row.max??2)-min);
    const width=row.key==='tint'?40:51;
    fill(ctx,137,y+1,width,3,.12);fill(ctx,137,y+1,Math.round(width*amount),3,selected?.65:.28);
   }
   pixelText(ctx,this.valueLabel(row),228,y,1,selected?.94:.5,'right');
  }
  // A small rail indicates the hidden rows without shrinking their lettering.
  fill(ctx,239,44,1,90,.12);
  fill(ctx,239,44+Math.round(this.top/this.rows.length*90),1,Math.round(7/this.rows.length*90),.45);
  fill(ctx,18,145,220,1,.2);
  pixelText(ctx,this.rows[this.index].note,128,154,1,.43,'center');
  pixelText(ctx,'UP DOWN SELECT / LEFT RIGHT ADJUST',128,168,1,.35,'center');
  pixelText(ctx,'ENTER SELECT / ESC BACK',128,179,1,.5,'center');
 }
}

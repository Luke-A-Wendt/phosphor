const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const smooth=x=>{x=clamp(x);return x*x*(3-2*x);};
export const POWER_ON_SECONDS=2.0;
export const POWER_OFF_SECONDS=1.8;
// A deliberately slowed, illustrative tube model. Heater temperature follows
// a first-order thermal response; emission has a thermionic threshold. Supply
// and deflection time constants differ on shutdown. They are not a measured CRT.
const emission=t=>{
 const temperature=300+800*(1-Math.exp(-Math.max(0,t-.08)/.33));
 return (temperature/1100)**2*Math.exp(-10000*(1/temperature-1/1100));
};
const fullEmission=emission(POWER_ON_SECONDS);
export class PowerSequence {
 constructor({reducedMotion=false}={}){this.reducedMotion=reducedMotion;this.phase='off';this.time=0;this.shutdownLevel=0;this.shutdownVertical=1;this.shutdownHorizontal=1;this.shutdownBend=0;this.shutdownFocus=0;}
 get busy(){return this.phase==='starting'||this.phase==='stopping';}
 startOn(){this.phase='starting';this.time=0;return this.state;}
 startOff(){
  if(this.phase==='off'||this.phase==='stopping')return this.state;
  const previous=this.state;
  this.shutdownLevel=previous.level;this.shutdownVertical=previous.vertical;this.shutdownHorizontal=previous.horizontal;this.shutdownBend=previous.bend;this.shutdownFocus=previous.focus;
  this.phase='stopping';this.time=0;return this.state;
 }
 update(dt){
  if(this.busy&&Number.isFinite(dt)&&dt>0){this.time+=dt;if(this.time>=(this.phase==='starting'?POWER_ON_SECONDS:POWER_OFF_SECONDS))this.phase=this.phase==='starting'?'on':'off';}
  return this.state;
 }
 get state(){
  if(this.phase==='off')return {level:0,vertical:1,horizontal:1,spot:0,bend:0,focus:0};
  if(this.phase==='on')return {level:1,vertical:1,horizontal:1,spot:0,bend:0,focus:0};
  const t=this.time;
  if(this.phase==='starting'){
   // Deflection stabilizes before a cold cathode emits appreciable light.
   const level=t<=.08?0:clamp(emission(t)/fullEmission);
   return {level,vertical:this.reducedMotion?1:1-.035*Math.exp(-t/.25),horizontal:this.reducedMotion?1:1-.012*Math.exp(-t/.22),spot:0,bend:this.reducedMotion?0:.006*Math.exp(-t/.25),focus:this.reducedMotion?0:.6*Math.exp(-t/.45)};
  }
  if(this.reducedMotion)return {level:this.shutdownLevel*(1-smooth(t/POWER_OFF_SECONDS)),vertical:1,horizontal:1,spot:0,bend:0,focus:0};
  // The supply rails and magnetic deflection fields decay on different time
  // scales. Vertical height is lost first; horizontal drive carries a bowed
  // line before converging. Focus voltage no longer tracks accelerating voltage,
  // so the transient beam footprint softens rather than remaining razor-sharp.
  // These are reference-informed approximations, not measured circuit values.
  const current=Math.exp(-t/.55)*(1-smooth((t-1.35)/.25));
  const vertical=this.shutdownVertical*Math.max(.0015,Math.exp(-Math.max(0,t-.07)/.13));
  const horizontal=this.shutdownHorizontal*Math.max(.002,Math.exp(-Math.max(0,t-.68)/.17));
  const residual=.12*smooth((t-1.10)/.20)*Math.exp(-Math.max(0,t-1.30)/.22)*(1-smooth((t-1.60)/.20));
  const bend=this.shutdownBend*Math.exp(-t/.2)+.033*(1-Math.exp(-t/.09))*Math.exp(-t/.5);
  const focus=this.shutdownFocus*Math.exp(-t/.25)+.55*(1-Math.exp(-t/.12))*Math.exp(-t/1.1);
  return {level:this.shutdownLevel*current,vertical,horizontal,spot:this.shutdownLevel*residual,bend,focus};
 }
}

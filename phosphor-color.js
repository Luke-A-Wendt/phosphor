// Hue rotates the emitting phosphor and its related glass tones together.
// The default is an exact identity, preserving the original green rendering.
export const DEFAULT_TINT=125;
export function normalizeTint(value){return Number.isFinite(value)?Math.max(0,Math.min(360,value)):DEFAULT_TINT;}
function rotateHue(rgb,degrees){
 if(degrees===0)return [...rgb];
 const max=Math.max(...rgb),min=Math.min(...rgb),delta=max-min;
 if(delta===0)return [...rgb];
 const [r,g,b]=rgb;
 const hue=(max===r?(g-b)/delta:max===g?(b-r)/delta+2:(r-g)/delta+4)*60;
 const h=((hue+degrees)%360+360)%360/60;
 const x=delta*(1-Math.abs(h%2-1));
 const channels=h<1?[delta,x,0]:h<2?[x,delta,0]:h<3?[0,delta,x]:h<4?[0,x,delta]:h<5?[x,0,delta]:[delta,0,x];
 return channels.map(value=>value+min);
}
export function phosphorColors(tint=DEFAULT_TINT){
 const shift=normalizeTint(tint)-DEFAULT_TINT;
 return {
  spectrum:rotateHue([.035,1,.115],shift),
  glass:rotateHue([.20,.72,.30],shift),
  coating:rotateHue([.10,.70,.24],shift),
  beam:rotateHue([37,229,92],shift),
  line:rotateHue([30,170,65],shift),
  core:rotateHue([65,240,105],shift),
  spot:rotateHue([50,220,90],shift),
  ambient:rotateHue([11,30,16],shift),
  room:rotateHue([55,90,62],shift),
  page:rotateHue([3,7,5],shift)
 };
}
export function colorCSS(rgb,alpha=1){return `rgba(${rgb.map(value=>Math.round(value)).join(',')},${Math.max(0,Math.min(1,alpha))})`;}

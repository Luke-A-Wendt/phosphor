import {phosphorColors,colorCSS} from './phosphor-color.js';

const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const number=(value,fallback)=>Number.isFinite(value)?value:fallback;
const EDGE_OFFSETS=[-.12,-.06,0,.06,.12];
const EDGE_DEPTHS=[.025,.07,.15,.28];
const SCREEN_SCALE=.92;
const smooth=(low,high,value)=>{const t=clamp((value-low)/(high-low),0,1);return t*t*(3-2*t);};
const displayChannel=energy=>{const mapped=1-Math.exp(-Math.max(0,energy)*1.1);return 255*(mapped<=.0031308?12.92*mapped:1.055*mapped**(1/2.4)-.055);};

/** Local incident light from the monochrome phosphor, before room reflections.
 * `along` runs left-to-right on horizontal edges and top-to-bottom on sides.
 * Finite quadrature approximates a rough, inward-facing lip's view of the tube.
 */
export function sampleInletLight(data,width,height,edge,along,options={},power={}){
 if(!data||width<1||height<1)return 0;
 const level=clamp(number(power.level,1),0,1),sx=Math.max(.001,number(power.horizontal,1)),sy=Math.max(.001,number(power.vertical,1));
 if(level===0)return 0;
 const curvature=.06*clamp(number(options.curvature,0),0,2),bend=number(power.bend,0);
 let light=0,weights=0;
 for(const offset of EDGE_OFFSETS)for(const depth of EDGE_DEPTHS){
  const tangent=along+offset;
  const weight=Math.exp(-offset*offset/.009)/(1+Math.pow(depth/.075,2));
  weights+=weight;
  let u,v;
  if(edge==='top'){u=tangent;v=depth;}
  else if(edge==='bottom'){u=tangent;v=1-depth;}
  else if(edge==='left'){u=depth;v=tangent;}
  else if(edge==='right'){u=1-depth;v=tangent;}
  else return 0;
  const x=u*2-1,y=v*2-1;
  // Match the raster's cross-axis bow and its current deflection extent.
  u=.5+.5*x*(1+curvature*y*y);
  v=.5+.5*y*(1+curvature*x*x)+bend*(1-clamp(x/sx,-1,1)**2);
  u=(u-.5)/sx+.5;v=(v-.5)/sy+.5;
  if(u<0||u>1||v<0||v>1)continue;
  const pixel=(Math.min(height-1,Math.floor(v*height))*width+Math.min(width-1,Math.floor(u*width)))*4;
  light+=data[pixel]/255*weight;
 }
 return Math.max(0,light/weights)*level*clamp(number(options.brightness,1),0,2);
}

/** Weak whole-screen bounce. Coarse area patches keep distant content from
 * vanishing entirely, but the near-edge gather remains the dominant signal. */
export function sampleInletBounce(data,width,height,edge,along,options={},power={}){
 const level=clamp(number(power.level,1),0,1);
 if(!data||width<1||height<1||level===0)return 0;
 const sx=Math.max(.001,number(power.horizontal,1)),sy=Math.max(.001,number(power.vertical,1));
 const curvature=.06*clamp(number(options.curvature,0),0,2),bend=number(power.bend,0);
 const px=edge==='left'?0:edge==='right'?1:along,py=edge==='top'?0:edge==='bottom'?1:along;
 if(!['top','bottom','left','right'].includes(edge))return 0;
 let light=0;
 for(let row=0;row<3;row++)for(let col=0;col<4;col++){
  const u=(col+.5)/4,v=(row+.5)/3,x=u*2-1,y=v*2-1;
  const sourceU=(.5*x*(1+curvature*y*y))/sx+.5;
  const sourceV=(.5*y*(1+curvature*x*x)+bend*(1-clamp(x/sx,-1,1)**2))/sy+.5;
  if(sourceU<0||sourceU>1||sourceV<0||sourceV>1)continue;
  let sum=0,count=0;
  for(let yy=-2;yy<=2;yy++)for(let xx=-2;xx<=2;xx++){
   const ix=Math.floor(sourceU*width)+xx,iy=Math.floor(sourceV*height)+yy;
   if(ix>=0&&ix<width&&iy>=0&&iy<height){sum+=data[(iy*width+ix)*4]/255;count++;}
  }
  const dx=(u-px)*2.6666667,dy=(v-py)*2;
  const depth=edge==='top'?dy:edge==='bottom'?-dy:edge==='left'?dx:-dx;
  const heightAbove=.07,r2=dx*dx+dy*dy+heightAbove*heightAbove,r=Math.sqrt(r2);
  const cosine=Math.max(0,(1.3*depth-heightAbove)/(Math.sqrt(2.69)*r));
  const formFactor=heightAbove/r*cosine/r2;
  light+=(count?sum/count:0)*formFactor*.36;
 }
 return light*level*clamp(number(options.brightness,1),0,2);
}

/** Same linear-light exposure response as the WebGL phosphor compositor. */
export function inletLightColor(energy,tint){
 return phosphorColors(tint).spectrum.map(channel=>displayChannel(Math.max(0,energy)*channel));
}

/** Nearly planar matte inset, with a narrow glass contact and outer chamfers. */
export function inletMaterialColor(position,ambient=0){
 const t=clamp(position,0,1);
 let gradient=.118+(.032-.118)*smooth(.765,.795,t);
 gradient=(gradient+(-.080-gradient)*smooth(.91,.94,t))/.105;
 const normalZ=1/Math.sqrt(1+gradient*gradient);
 const diffuse=.28+.72*normalZ,roughSpecular=normalZ**14;
 const contact=smooth(.012,.07,t),shoulder=1-.28*smooth(.945,1,t);
 const edgePolish=1+.10*Math.exp(-Math.pow((t-.80)/.023,2));
 const energy=clamp(number(ambient,0),0,2)*(.008*diffuse+.0015*roughSpecular)*contact*shoulder*edgePolish;
 return [.78,.83,.71].map(channel=>displayChannel(channel*energy));
}

function makeCanvas(source){return (source.ownerDocument||globalThis.document).createElement('canvas');}
function roundedPath(ctx,rect){ctx.roundRect(rect.x,rect.y,rect.width,rect.height,rect.radius);}

/** Reduced-optics Canvas fallback. Screen footprint and all controls stay fixed.
 * Only phosphorCanvas supplies luminous energy; the rendered faceplate is copied
 * solely to inset its existing appearance into the shallow recess.
 */
export function drawInletFallback(ctx,renderedCanvas,phosphorCanvas,options={},power={},cache={}){
 if(options.blackBackground||options.monitorBorder===false||!renderedCanvas||!phosphorCanvas)return cache;
 const w=renderedCanvas.width,h=renderedCanvas.height;
 if(!(w>0&&h>0))return cache;
 cache.copy??=makeCanvas(renderedCanvas);cache.sample??=makeCanvas(phosphorCanvas);
 if(cache.copy.width!==w||cache.copy.height!==h){cache.copy.width=w;cache.copy.height=h;}
 if(cache.sample.width!==64||cache.sample.height!==48){cache.sample.width=64;cache.sample.height=48;}
 const copy=cache.copy.getContext('2d'),sample=cache.sample.getContext('2d',{willReadFrequently:true});
 copy.globalCompositeOperation='copy';copy.drawImage(renderedCanvas,0,0);
 sample.globalCompositeOperation='copy';sample.drawImage(phosphorCanvas,0,0,64,48);
 const pixels=sample.getImageData(0,0,64,48).data;
 const unit=h/2,cx=w/2,cy=h/2;
 const box=(x,y,r)=>({x:cx-x*unit,y:cy-y*unit,width:2*x*unit,height:2*y*unit,radius:r*unit});
 const outer=box(1.32,.99,.045),inner=box(1.308*SCREEN_SCALE,.975*SCREEN_SCALE,.052*SCREEN_SCALE);
 ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';ctx.filter='none';
 ctx.fillStyle=colorCSS(phosphorColors(options.tint).page);ctx.fillRect(0,0,w,h);
 ctx.drawImage(cache.copy,w*.04,h*.04,w*SCREEN_SCALE,h*SCREEN_SCALE);
 ctx.beginPath();roundedPath(ctx,outer);roundedPath(ctx,inner);ctx.clip('evenodd');
 const room=clamp(number(options.ambient,0),0,2);
 const interpolate=t=>Object.fromEntries(Object.keys(inner).map(key=>[key,inner[key]+(outer[key]-inner[key])*t]));
 // Most bands share a flat slope; the few outer bands define narrow chamfers.
 // Each band is neutral material; only nearby phosphor adds a colored glow.
 for(let band=0;band<40;band++){
  const a=band/40,b=(band+1)/40;
  ctx.beginPath();roundedPath(ctx,interpolate(b));roundedPath(ctx,interpolate(a));
  ctx.fillStyle=colorCSS(inletMaterialColor((a+b)/2,room));ctx.fill('evenodd');
 }
 ctx.globalCompositeOperation='screen';
 for(const edge of ['top','bottom','left','right']){
  const horizontal=edge==='top'||edge==='bottom',segments=horizontal?36:28;
  for(let segment=0;segment<segments;segment++){
   const along=(segment+.5)/segments;
   const light=sampleInletLight(pixels,64,48,edge,along,options,power)+sampleInletBounce(pixels,64,48,edge,along,options,power)*.7;
   if(light<=.00001)continue;
   const x=horizontal?inner.x+along*inner.width:edge==='left'?inner.x:inner.x+inner.width;
   const y=horizontal?(edge==='top'?inner.y:inner.y+inner.height):inner.y+along*inner.height;
   // Broad tangential lobes overlap smoothly rather than drawing bright stripes.
   const rx=horizontal?inner.width/segments*2.2:unit*.13;
   const ry=horizontal?unit*.13:inner.height/segments*2.2;
   ctx.save();ctx.translate(x,y);ctx.scale(rx,ry);
   const glow=ctx.createRadialGradient(0,0,0,0,0,1);
   const color=inletLightColor(light*.095,options.tint);
   glow.addColorStop(0,colorCSS(color,.72));glow.addColorStop(.48,colorCSS(color,.42));glow.addColorStop(1,colorCSS(color,0));
   ctx.fillStyle=glow;ctx.fillRect(-1,-1,2,2);ctx.restore();
  }
 }
 // Four shallow corner joins distinguish the separate sloping faces. Rounded
 // endpoints and low contrast avoid adding decorative cracks or casing lines.
 ctx.globalCompositeOperation='source-over';ctx.strokeStyle='rgba(0,0,0,.18)';ctx.lineWidth=Math.max(.6,unit*.004);ctx.lineCap='round';
 const cornerInset=1-Math.SQRT1_2;
 for(const sx of [-1,1])for(const sy of [-1,1]){
  const corner=rect=>({x:rect.x+(sx>0?rect.width:0)-sx*rect.radius*cornerInset,y:rect.y+(sy>0?rect.height:0)-sy*rect.radius*cornerInset});
  const a=corner(inner),b=corner(outer),dx=b.x-a.x,dy=b.y-a.y;
  ctx.beginPath();ctx.moveTo(a.x+dx*.12,a.y+dy*.12);ctx.lineTo(a.x+dx*.86,a.y+dy*.86);ctx.stroke();
 }
 // The lip meets the glass in a thin occluded seam; it does not glow uniformly.
 ctx.strokeStyle='rgba(0,0,0,.65)';ctx.lineWidth=Math.max(.75,unit*.005);
 ctx.beginPath();roundedPath(ctx,inner);ctx.stroke();ctx.restore();
 return cache;
}

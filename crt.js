/**
 * Monochrome raster / faceplate renderer. No dependencies.
 *
 * The source is exactly 256 x 192 samples, displayed at 4:3 with square pixels.
 * A 60 Hz / 262-line raster excites two exponential phosphor populations.
 * Each visible frame analytically integrates decay AND the line's excitation
 * pulses over its exposure interval; there is no decorative scrolling scan bar.
 * The source is held for the interval, as an ordinary browser framebuffer is.
 * Gaussian beam reconstruction, optical scatter and a separate glass layer are
 * rendered at display resolution. No RGB mask is used on a monochrome tube.
 *
 * This is a physically informed, tunable visual model, not a measured model of
 * one particular tube. The faceplate uses geometric-optics rays through finite-thickness spherical glass;
 * room reflections are procedural. Browser refresh cannot show the individual
 * 15.72 kHz sweeps. Fast/slow decay constants are illustrative green phosphor.
 */

import {DEFAULT_TINT,normalizeTint,phosphorColors,colorCSS} from './phosphor-color.js';

const VS = `#version 300 es
precision highp float;
out vec2 uv;
void main(){
  vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));
  uv=p; gl_Position=vec4(p*2.0-1.0,0.0,1.0);
}`;

const STATE = `#version 300 es
precision highp float;
uniform sampler2D sourceImage;
uniform sampler2D previousState;
uniform float clock;
uniform float exposure;
uniform float persistence;
uniform float bufferMode;
vec2 packLight(float v){float scaled=clamp(v/32.0,0.0,1.0)*255.0;return vec2(floor(scaled)/255.0,fract(scaled));}
out vec4 color;
void main(){
  ivec2 cell=ivec2(gl_FragCoord.xy);
  vec4 src=texelFetch(sourceImage,cell,0);
  float excitation=max(src.r,max(src.g,src.b));
  vec2 stored=texelFetch(previousState,cell,0).rg;
  vec2 energy=bufferMode>0.5?exp2(stored*8.0)-1.0:stored;
  const float period=1.0/60.0;
  // 35 blank lines above and below the 192-line active image. Source upload
  // is flipped into GL coordinates: scan from the physical top down.
  float line=191.0-float(cell.y);
  // The active portion occupies 83% of each line; the remaining time is
  // horizontal blanking/retrace. Vertical blanking is never phosphor-excited.
  float phase=(35.0+line+0.13+0.83*(float(cell.x)+0.5)/256.0)/262.0*period;
  vec2 tau=vec2(0.0017,0.025)*max(0.08,persistence);
  float start=clock-exposure;
  float pulse=(floor((start-phase)/period)+1.0)*period+phase;
  vec2 integral=vec2(0.0);
  float cursor=start;
  // At most four visits with the capped 50 ms exposure. Emission is integrated
  // as energy*tau*(1-exp(-dt/tau)), including the fraction after each pulse.
  for(int i=0;i<4;i++){
    if(pulse<=clock){
      float step=max(0.0,pulse-cursor);
      vec2 decay=exp(-step/tau);
      integral+=energy*tau*(1.0-decay);
      energy=energy*decay+excitation*period/tau;
      cursor=pulse; pulse+=period;
    }
  }
  vec2 decay=exp(-max(0.0,clock-cursor)/tau);
  integral+=energy*tau*(1.0-decay);
  energy*=decay;
  float tail=0.20*clamp(persistence,0.0,1.5);
  float light=dot(integral/max(exposure,0.0001),vec2(1.0-tail,tail));
  color=bufferMode>0.5?vec4(log2(1.0+min(energy,vec2(255.0)))/8.0,packLight(light)):vec4(energy,light,1.0);
}`;

const BEAM = `#version 300 es
precision highp float;
in vec2 uv;
uniform sampler2D state;
uniform float scanlines;
uniform float brightness;
uniform float bufferMode;
vec2 packLight(float v){float scaled=clamp(v/32.0,0.0,1.0)*255.0;return vec2(floor(scaled)/255.0,fract(scaled));}
out vec4 color;
float signalAt(ivec2 p){
  if(p.x<0||p.x>=256||p.y<0||p.y>=192) return 0.0;
  vec4 sampleValue=texelFetch(state,p,0);
  return bufferMode>0.5?(sampleValue.b+sampleValue.a/255.0)*32.0:sampleValue.b;
}
void main(){
  vec2 position=uv*vec2(256.0,192.0)-0.5;
  ivec2 base=ivec2(floor(position));
  float light=0.0;
  float edge=pow(length((uv-0.5)*1.42),3.0);
  for(int j=-1;j<=2;j++){
    int y=base.y+j;
    float row=0.0, normalization=0.0;
    for(int i=-1;i<=2;i++){
      int x=base.x+i;
      float dx=position.x-float(x);
      // Horizontal signal bandwidth is continuous; the source pixels are not
      // little square LCD cells. Optical focus is slightly softer at the edge.
      float sigmaX=0.43+0.10*edge;
      float weight=exp(-0.5*dx*dx/(sigmaX*sigmaX));
      row+=signalAt(ivec2(x,y))*weight;
      normalization+=weight;
    }
    row/=max(normalization,0.00001);
    // Increased beam current expands the spot while conserving integrated
    // energy. Inter-line darkness comes from spot shape, not an overlay mask.
    float focused=0.205+0.064*sqrt(clamp(row*brightness,0.0,2.0))+0.025*edge;
    float sigma=mix(0.49,focused,clamp(scanlines,0.0,1.0));
    sigma/=1.0+0.22*max(0.0,scanlines-1.0);
    float dy=position.y-float(y);
    light+=row*exp(-0.5*dy*dy/(sigma*sigma))/(2.506628*sigma);
  }
  color=bufferMode>0.5?vec4(packLight(light*brightness),0.0,1.0):vec4(vec3(light*brightness),1.0);
}`;

const BLUR = `#version 300 es
precision highp float;
in vec2 uv;
uniform sampler2D image;
uniform vec2 direction;
uniform float bufferMode;
float lightAt(vec2 p){vec4 v=texture(image,p);return bufferMode>0.5?(v.r+v.g/255.0)*32.0:v.r;}
vec2 packLight(float v){float scaled=clamp(v/32.0,0.0,1.0)*255.0;return vec2(floor(scaled)/255.0,fract(scaled));}
out vec4 color;
void main(){
  float result=lightAt(uv)*0.2270270270;
  result+=(lightAt(uv+direction*1.3846153846)+lightAt(uv-direction*1.3846153846))*0.3162162162;
  result+=(lightAt(uv+direction*3.2307692308)+lightAt(uv-direction*3.2307692308))*0.0702702703;
  color=bufferMode>0.5?vec4(packLight(result),0.0,1.0):vec4(vec3(result),1.0);
}`;

const COMPOSITE = `#version 300 es
precision highp float;
in vec2 uv;
uniform sampler2D beam;
uniform sampler2D glow;
uniform sampler2D scatter;
uniform float clock;
uniform float curvature;
uniform float glass;
uniform float bloom;
uniform float motion;
uniform float ambient;
uniform float reflection;
uniform float environmentMode;
uniform vec2 resolution;
uniform float powerLevel;
uniform vec2 powerScale;
uniform float powerSpot;
uniform float powerBend;
uniform float powerFocus;
uniform vec3 phosphorSpectrum;
uniform vec3 glassTint;
uniform vec3 coatingTint;
uniform vec3 pageTint;
uniform float bufferMode;
float lightAt(sampler2D image,vec2 p){vec4 v=texture(image,p);return bufferMode>0.5?(v.r+v.g/255.0)*32.0:v.r;}
out vec4 color;

// All geometry is in screen-half-height units. The normal-incidence faceplate
// thickness is about 5% of its height: illustrative thick CRT glass, not a
// measured tube. Ray intersections and Fresnel use physical geometric optics;
// the environment, coating texture and unresolved scattering are approximations.
float hash(vec2 p){vec3 q=fract(vec3(p.xyx)*0.1031);q+=dot(q,q.yzx+33.33);return fract((q.x+q.y)*q.z);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1)),f.x),f.y);}
float roundedBox(vec2 p,vec2 b,float r){vec2 q=abs(p)-b+r;return length(max(q,0.0))+min(max(q.x,q.y),0.0)-r;}
// Nearest forward intersection, including a ray starting within a sphere.
float sphereHit(vec3 origin,vec3 direction,vec3 center,float radius){
  vec3 offset=origin-center;float b=dot(offset,direction);
  float h=b*b-dot(offset,offset)+radius*radius;
  if(h<0.0)return -1.0;
  float root=sqrt(h),nearHit=-b-root,farHit=-b+root;
  return nearHit>0.00001?nearHit:farHit;
}
// Unpolarized dielectric Fresnel: squared s/p amplitude average. Exact rather
// than Schlick, including total internal reflection for the inner interface.
float fresnel(float cosI,float etaI,float etaT){
  cosI=clamp(abs(cosI),0.0,1.0);
  float sinT2=(etaI*etaI)/(etaT*etaT)*(1.0-cosI*cosI);
  if(sinT2>=1.0)return 1.0;
  float cosT=sqrt(1.0-sinT2);
  float rs=(etaI*cosI-etaT*cosT)/(etaI*cosI+etaT*cosT);
  float rp=(etaT*cosI-etaI*cosT)/(etaT*cosI+etaI*cosT);
  return (rs*rs+rp*rp)*0.5;
}
// A deliberately unresolved environment: broad radiance fields rather than
// identifiable objects. Reflected rays still sample their own direction, so
// the illumination follows the curved front and rear interfaces separately.
float softLobe(vec2 p,vec2 center,vec2 size){vec2 d=(p-center)/size;return exp(-dot(d,d)*0.5);}
float environmentLight(vec3 point,vec3 direction,float roughness){
  float distance=(4.0-point.z)/max(direction.z,0.12);
  vec2 room=point.xy+direction.xy*distance;
  vec2 blur=vec2(roughness*2.0);
  float broad=0.022+0.032*softLobe(room,vec2(-1.8,2.7),vec2(4.9,3.8)+blur);
  float irregular=0.84+0.16*noise(room*0.28+vec2(9.0,4.0));
  float diffuse=broad+0.045*softLobe(room,vec2(3.6,0.7),vec2(3.1,4.8)+blur);
  // A very soft window-lit wall; no rectangular edges, mullions or grid.
  float window=broad+0.17*softLobe(room,vec2(-3.2,2.0),vec2(2.7,3.4)+blur)
                    +0.023*softLobe(room,vec2(4.7,-2.0),vec2(4.4,3.2)+blur);
  float studio=broad+0.10*softLobe(room,vec2(-1.2,4.9),vec2(5.1,1.8)+blur)
                    +0.075*softLobe(room,vec2(4.0,1.5),vec2(2.1,3.6)+blur)
                    +0.018*softLobe(room,vec2(-4.8,-1.6),vec2(3.0,2.7)+blur);
  // An observer softly occludes an illuminated room. The head/shoulders are
  // a dim negative reflection, never a luminous avatar, camera or live image.
  float head=softLobe(room,vec2(0.2,0.70),vec2(0.58,0.78)+blur*0.5);
  float shoulders=softLobe(room,vec2(0.2,-1.35),vec2(1.65,0.91)+blur*0.5);
  float observerMask=clamp(max(head,shoulders),0.0,1.0);
  float observer=(diffuse+0.032)*(1.0-observerMask*0.32);
  float value=diffuse;
  if(environmentMode>1.5&&environmentMode<2.5)value=window;
  else if(environmentMode>2.5&&environmentMode<3.5)value=studio;
  else if(environmentMode>3.5&&environmentMode<4.5)value=observer;
  else if(environmentMode>4.5)value=(window*0.38+studio*0.32+diffuse*0.30)*(1.0-observerMask*0.16);
  return value*irregular;
}
float scratch(vec2 point,vec2 a,vec2 b,float width){
  vec2 ab=b-a;float t=clamp(dot(point-a,ab)/dot(ab,ab),0.0,1.0);
  float d=length(point-a-ab*t);return exp(-d*d/(width*width));
}
vec3 encodeDisplay(vec3 light){
  // Work in linear light until this final exposure/tone response. An sRGB
  // display cannot emit a real phosphor spectrum or an electron-beam impulse.
  vec3 mapped=vec3(1.0)-exp(-max(light,vec3(0))*1.10);
  return mix(12.92*mapped,1.055*pow(mapped,vec3(1.0/2.4))-0.055,step(vec3(0.0031308),mapped));
}
void main(){
  const vec2 aspect=vec2(4.0/3.0,1.0);
  vec2 p=(uv*2.0-1.0)*aspect;
  vec3 page=pageTint;
  float c=clamp(curvature,0.0,2.0),g=clamp(glass,0.0,2.0);
  float aa=max(0.0005,2.0/resolution.y);
  float outerDistance=roundedBox(p,vec2(1.308,0.975),0.112);
  float outerMask=1.0-smoothstep(-aa,aa,outerDistance);
  // Avoid huge radii at zero curvature while retaining a virtually flat mode.
  float outerRadius=max(1.95,3.15/max(0.04,c));
  float thickness=0.095*max(g,0.025);
  float innerRadius=outerRadius-thickness;
  vec3 center=vec3(0,0,-outerRadius);
  vec3 origin=vec3(p,3.0),incident=vec3(0,0,-1);
  float outerT=sphereHit(origin,incident,center,outerRadius);
  vec3 outerPoint=origin+incident*outerT;
  vec3 outerNormal=normalize(outerPoint-center);
  // Small fixed surface waviness bends reflected rays, independent of the
  // separate phosphor grain underneath. No time-varying swimming glass.
  float waviness=sin(p.x*9.7+p.y*5.3)*sin(p.y*11.4-p.x*3.1)*0.0008*g;
  vec3 reflectionNormal=normalize(outerNormal+vec3(waviness,-waviness*0.7,0));
  const float ior=1.52;
  vec3 glassRay=refract(incident,outerNormal,1.0/ior);
  float innerT=sphereHit(outerPoint+glassRay*0.0001,glassRay,center,innerRadius);
  vec3 innerPoint=outerPoint+glassRay*(innerT+0.0001);
  vec3 innerNormal=normalize(innerPoint-center);
  float outerF=fresnel(dot(-incident,outerNormal),1.0,ior);
  // Light originates in a coating at the rear glass boundary. Use the second
  // interface for reciprocal transmission and the first internal ghost path.
  float innerF=fresnel(dot(-glassRay,innerNormal),ior,1.0);
  float opticalPath=max(innerT,0.0);
  float transmission=(1.0-outerF)*(1.0-innerF)*exp(-0.70*opticalPath);
  vec2 image=innerPoint.xy/vec2(2.56,1.92)+0.5;
  float innerDistance=roundedBox(innerPoint.xy,vec2(1.280,0.960),0.098);
  float phosphorMask=1.0-smoothstep(-aa,aa,innerDistance);

  // Deflection changes the emitting raster, never the glass or reflection.
  float across=clamp((image.x-0.5)/max(powerScale.x*0.5,0.001),-1.0,1.0);
  // Residual yoke current bows the raster as its supply falls. Only emission
  // bends; the faceplate, coating and room reflections stay stationary.
  vec2 raster=image-vec2(0.0,powerBend*(1.0-across*across));
  vec2 emission=(raster-0.5)/max(powerScale,vec2(0.001))+0.5;
  vec2 boundary=abs(raster-0.5)-powerScale*0.5;
  float emissionMask=(1.0-smoothstep(-aa,aa,boundary.x))*(1.0-smoothstep(-aa,aa,boundary.y));
  float direct=lightAt(beam,emission);
  float tight=lightAt(glow,emission),wide=lightAt(scatter,emission);
  // Approximate one extra internal round trip. Both its angular displacement
  // and attenuation grow with the glass path. Higher bounces are discarded.
  vec2 ghostShift=2.0*opticalPath*glassRay.xy/vec2(2.56,1.92);
  float ghost=lightAt(glow,emission+ghostShift);
  float ghostFraction=outerF*innerF*exp(-1.4*opticalPath);
  direct=mix(direct,tight,clamp(powerFocus*0.65,0.0,0.65));
  float tightWeight=clamp(bloom*0.19,0.0,0.38),wideWeight=clamp(bloom*0.14,0.0,0.28);
  float energy=mix(direct,ghost,ghostFraction)*(1.0-tightWeight-wideWeight)+tight*tightWeight+wide*wideWeight;

  energy*=powerLevel*emissionMask;
  // Once scanlines converge, integrate several rows instead of undersampling
  // one arbitrary row of the compressed texture. The beam retains a finite
  // Gaussian footprint: a collapsed raster is a luminous line, not a zero-width
  // sampling artifact. Spatial concentration is capped as beam current decays.
  float converged=1.0-smoothstep(0.025,0.18,powerScale.y);
  if(converged>0.0){
    float column=0.0;
    for(int row=0;row<16;row++){
      vec2 sampleUV=vec2(clamp(emission.x,0.0,1.0),(float(row)+0.5)/16.0);
      column+=mix(lightAt(glow,sampleUV),lightAt(scatter,sampleUV),0.7);
    }
    column/=16.0;
    float sigma=max(0.0017,0.75/resolution.y)*(1.0+powerFocus*2.3);
    float lineProfile=exp(-0.5*pow((raster.y-0.5)/sigma,2.0));
    float horizontalMask=1.0-smoothstep(-aa,aa,boundary.x);
    float lineEnergy=min(3.0,column*11.0+0.05)*powerLevel*lineProfile*horizontalMask;
    energy=mix(energy,lineEnergy,converged);
    // Scatter has a wider, weaker footprint independent of deflection scale.
    energy+=column*powerLevel*0.22*exp(-0.5*pow((raster.y-0.5)/(sigma*5.0),2.0))*horizontalMask*converged;
  }
  vec2 centerDistance=(image-0.5)*vec2(1.3333,1.0);
  energy+=powerSpot*(exp(-dot(centerDistance,centerDistance)/0.000025)
                  +0.09*exp(-dot(centerDistance,centerDistance)/0.00025));
  wide*=powerLevel*emissionMask;

  // Fixed inner-surface phosphor grains: granular conversion efficiency, low-
  // frequency coating mottling, and tiny ambient reflectance. It is a coating,
  // not a decorative RGB grille. Antialias the finest grain on small screens.
  float grainScale=min(1152.0,resolution.y*0.85);
  float grains=noise(image*vec2(grainScale*4.0/3.0,grainScale));
  float coating=noise(image*vec2(43.0,31.0));
  float conversion=0.90+0.18*grains+0.035*(coating-0.5);
  float edgeFocus=1.0-0.075*pow(length(innerPoint.xy/aspect)*0.7071,3.0);
  float electronicNoise=(hash(gl_FragCoord.xy+floor(clock*60.0))-0.5)*0.005*motion;
  energy*=conversion*edgeFocus*(1.0+electronicNoise)*transmission*phosphorMask;

  float roomLight=clamp(ambient,0.0,2.0);
  float reflectionGain=roomLight*clamp(reflection,0.0,2.0)*step(0.5,environmentMode);
  float reflected=environmentLight(outerPoint,reflect(incident,reflectionNormal),0.20)*outerF*g*reflectionGain;
  // Reflection from the inner face has a distinct displaced surface image.
  vec3 internalReflection=reflect(glassRay,innerNormal);
  vec3 escapedReflection=refract(internalReflection,-outerNormal,ior);
  if(dot(escapedReflection,escapedReflection)>0.01){
    reflected+=environmentLight(innerPoint,escapedReflection,0.42)*innerF*(1.0-outerF)*(1.0-outerF)*exp(-1.4*opticalPath)*0.28*g*reflectionGain;
  }
  // Microscopic surface marks scatter reflected room light; the image below
  // stays sharply separated from them. Effects intentionally remain sparse.
  vec2 dustGrid=p*vec2(280.0);vec2 dustCell=floor(dustGrid);
  float dustSeed=hash(dustCell);
  float dust=step(0.9965,dustSeed)*exp(-28.0*dot(fract(dustGrid)-0.5,fract(dustGrid)-0.5));
  float marks=scratch(p,vec2(-0.98,0.66),vec2(-0.73,0.74),max(aa*0.32,0.0008));
  marks+=scratch(p,vec2(0.84,-0.72),vec2(0.97,-0.63),max(aa*0.25,0.0006))*0.5;
  float grazing=pow(1.0-max(outerNormal.z,0.0),0.65);
  reflected+=(dust*0.0016+marks*0.0008)*(0.3+grazing)*g*reflectionGain;
  // The thin bright edge is the glass edge itself, not a monitor frame. The
  // phosphor coating ends slightly behind it, visibly revealing depth.
  float edgeGlint=exp(-pow((outerDistance+0.010)/0.005,2.0));
  float topLight=0.25+0.75*smoothstep(-0.5,0.9,p.y);
  reflected+=edgeGlint*topLight*0.003*g*reflectionGain;
  float edgeDepth=(1.0-phosphorMask)*0.0007*g*roomLight;
  // Ambient illumination reaches the matte coating through the faceplate.
  // It raises black level independently of identifiable/specular reflections.
  // At zero room light the coating and marks vanish; only emission remains.
  float ambientCoating=(0.0020+grains*0.0015+coating*0.0008)*phosphorMask*roomLight*transmission;
  vec3 linearLight=energy*phosphorSpectrum+(reflected+edgeDepth)*glassTint+ambientCoating*coatingTint;
  vec3 surface=encodeDisplay(linearLight);
  float spill=(1.0-outerMask)*exp(-max(0.0,outerDistance)*95.0)*wide*bloom*0.008;
  color=vec4(mix(page,surface,outerMask)+encodeDisplay(spill*phosphorSpectrum),1.0);
}`;

function shader(gl,type,source){
  const s=gl.createShader(type); gl.shaderSource(s,source); gl.compileShader(s);
  if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)){
    const error=gl.getShaderInfoLog(s); gl.deleteShader(s); throw new Error(error||'Shader compile failed');
  }
  return s;
}
function program(gl,fragment){
  const p=gl.createProgram(), v=shader(gl,gl.VERTEX_SHADER,VS), f=shader(gl,gl.FRAGMENT_SHADER,fragment);
  gl.attachShader(p,v); gl.attachShader(p,f); gl.linkProgram(p); gl.deleteShader(v); gl.deleteShader(f);
  if(!gl.getProgramParameter(p,gl.LINK_STATUS)){ const e=gl.getProgramInfoLog(p); gl.deleteProgram(p); throw new Error(e||'Shader link failed'); }
  const uniforms={};
  for(let i=0;i<gl.getProgramParameter(p,gl.ACTIVE_UNIFORMS);i++){
    const name=gl.getActiveUniform(p,i).name; uniforms[name]=gl.getUniformLocation(p,name);
  }
  return {p,uniforms};
}

export class CRTDisplay {
  constructor(canvas,sourceCanvas){
    this.canvas=canvas; this.source=sourceCanvas;this.power={level:1,vertical:1,horizontal:1,spot:0};
    this.options={tint:DEFAULT_TINT,brightness:1.73,persistence:1,bloom:1.4,curvature:1.85,glass:2,scanlines:1.6,ambient:1.5,reflection:1.45,environment:'diffuse',reducedMotion:false};
    this._backend='Canvas 2D fallback'; this._targets=[]; this._programs=[]; this._destroyed=false;
    this._contextLost=false; this._lostHandler=e=>{e.preventDefault();this._contextLost=true;this._backend='WebGL context lost';};
    this._restoreHandler=()=>{this._contextLost=false;this.gl=this.gl||this._blitGL;this._blitGL=null;try{this._initGL();this.resize();}catch(e){this._fallback(e);}};
    canvas.addEventListener('webglcontextlost',this._lostHandler);
    canvas.addEventListener('webglcontextrestored',this._restoreHandler);
    try{
      this.gl=canvas.getContext('webgl2',{alpha:false,antialias:false,depth:false,stencil:false,preserveDrawingBuffer:false,powerPreference:'high-performance'});
      if(!this.gl) throw new Error('WebGL2 unavailable');
      this._initGL();
    }catch(error){this._fallback(error);}
    this.resize();
  }
  get backend(){return this._backend;}
  _initGL(){
    const gl=this.gl;
    // RGBA8 keeps the same raster, optics and power shaders on mobile GPUs
    // without float render targets, instead of silently changing visual models.
    this._byteTargets=!gl.getExtension('EXT_color_buffer_float');
    this._targets=[];this._programs=[];
    gl.disable(gl.DEPTH_TEST);gl.disable(gl.BLEND);gl.disable(gl.CULL_FACE);
    this.vao=gl.createVertexArray();gl.bindVertexArray(this.vao);
    this.programs={state:program(gl,STATE),beam:program(gl,BEAM),blur:program(gl,BLUR),composite:program(gl,COMPOSITE)};
    this._programs=Object.values(this.programs);
    this.inputTexture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,this.inputTexture);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,256,192,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
    this.states=[this._target(256,192,false),this._target(256,192,false)]; this.stateIndex=0;
    this._backend='WebGL 2 · layered glass / integrated raster'+(this._byteTargets?' · encoded targets':'');this._forceResize=true;
  }
  _target(width,height,linear=true){
    const gl=this.gl,texture=gl.createTexture(),fbo=gl.createFramebuffer();
    let switchedEncoding=false;
    gl.bindTexture(gl.TEXTURE_2D,texture);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,linear?gl.LINEAR:gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,linear?gl.LINEAR:gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D,0,this._byteTargets?gl.RGBA8:gl.RGBA16F,width,height,0,gl.RGBA,this._byteTargets?gl.UNSIGNED_BYTE:gl.HALF_FLOAT,null);
    gl.bindFramebuffer(gl.FRAMEBUFFER,fbo);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,texture,0);
    if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE){
      // Some mobile drivers advertise float rendering but reject a particular
      // target size/format. Retry this target using the shared encoded path.
      if(!this._byteTargets){
        this._byteTargets=true;switchedEncoding=true;
        gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,width,height,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
        this._backend='WebGL 2 · layered glass / integrated raster · encoded targets';
      }
      if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE){gl.deleteTexture(texture);gl.deleteFramebuffer(fbo);throw new Error('Incomplete phosphor framebuffer');}
    }
    if(switchedEncoding){
      // A resize may fail after raw-float states have already accumulated light.
      // Clear those old values before every shader begins decoding byte data.
      for(const previous of this._targets){gl.bindFramebuffer(gl.FRAMEBUFFER,previous.fbo);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);}
      gl.bindFramebuffer(gl.FRAMEBUFFER,fbo);
    }
    gl.viewport(0,0,width,height);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);
    const target={texture,fbo,width,height};this._targets.push(target);return target;
  }
  _deleteTarget(t){
    if(!t)return;this.gl.deleteTexture(t.texture);this.gl.deleteFramebuffer(t.fbo);this._targets=this._targets.filter(x=>x!==t);
  }
  _fallback(error){
    console.warn('Phosphor renderer fallback:',error?.message||error);
    const acquiredGL=this.gl; this._disposeGL(); this.gl=null;
    let canvas=this.canvas,ctx=null;
    // Keep the user's DOM canvas and its focus/pointer listeners when WebGL
    // exists but the richer float pipeline does not. Canvas 2D renders into an
    // offscreen surface; an elementary WebGL pass only presents those pixels.
    if(acquiredGL&&!acquiredGL.isContextLost()){
      try{
        this._blitGL=acquiredGL;
        this._blitProgram=program(acquiredGL,`#version 300 es
precision highp float;
in vec2 uv;
uniform sampler2D pixels;
out vec4 color;
void main(){color=texture(pixels,uv);}`);
        this._blitTexture=acquiredGL.createTexture();
        acquiredGL.bindTexture(acquiredGL.TEXTURE_2D,this._blitTexture);
        acquiredGL.texParameteri(acquiredGL.TEXTURE_2D,acquiredGL.TEXTURE_MIN_FILTER,acquiredGL.LINEAR);
        acquiredGL.texParameteri(acquiredGL.TEXTURE_2D,acquiredGL.TEXTURE_MAG_FILTER,acquiredGL.LINEAR);
        acquiredGL.texParameteri(acquiredGL.TEXTURE_2D,acquiredGL.TEXTURE_WRAP_S,acquiredGL.CLAMP_TO_EDGE);
        acquiredGL.texParameteri(acquiredGL.TEXTURE_2D,acquiredGL.TEXTURE_WRAP_T,acquiredGL.CLAMP_TO_EDGE);
        this._fallbackOutput=document.createElement('canvas');
        this._fallbackOutput.width=canvas.width;this._fallbackOutput.height=canvas.height;
        ctx=this._fallbackOutput.getContext('2d',{alpha:false});
      }catch(blitError){
        this._disposeBlit();console.warn('Basic GL presentation unavailable:',blitError.message);
      }
    }
    if(!ctx){
      ctx=canvas.getContext('2d',{alpha:false});
      // Only a complete failure of even basic WebGL needs a replacement; a
      // context's type cannot be changed. Always expose the active canvas.
      if(!ctx){
        const replacement=canvas.cloneNode(false);
        canvas.removeEventListener('webglcontextlost',this._lostHandler);
        canvas.removeEventListener('webglcontextrestored',this._restoreHandler);
        if(canvas.parentNode)canvas.replaceWith(replacement);
        this.canvas=replacement;canvas=replacement;ctx=canvas.getContext('2d',{alpha:false});
      }
    }
    this.fallback=ctx;this._forceResize=false;
    this._backend='Canvas 2D fallback · reduced optics';
    this._fallbackBuffer=document.createElement('canvas');this._fallbackBuffer.width=256;this._fallbackBuffer.height=192;
    this._fallbackContext=this._fallbackBuffer.getContext('2d',{alpha:false});
  }
  setOptions(partial={}){
    for(const key of ['brightness','persistence','bloom','curvature','glass','scanlines','ambient','reflection']){
      if(Number.isFinite(partial[key]))this.options[key]=Math.max(0,Math.min(2,partial[key]));
    }
    if('blackBackground' in partial)this.options.blackBackground=Boolean(partial.blackBackground);
    if('tint' in partial)this.options.tint=normalizeTint(partial.tint);
    if(['none','diffuse','window','studio','observer','mixed'].includes(partial.environment))this.options.environment=partial.environment;
    if('reducedMotion' in partial)this.options.reducedMotion=Boolean(partial.reducedMotion);
  }
  resize(){
    const bounds=this.canvas.getBoundingClientRect();
    const rect={width:this.canvas.clientWidth||bounds.width,height:this.canvas.clientHeight||bounds.height};
    const dpr=Math.min(2,window.devicePixelRatio||1);
    // A modest size cap keeps all multipass buffers affordable on integrated GPUs.
    const pixelBudget=window.matchMedia?.('(pointer: coarse)').matches?900000:1470000;
    const scale=Math.min(dpr,1400/Math.max(1,rect.width),Math.sqrt(pixelBudget/Math.max(1,rect.width*rect.height)));
    const width=Math.max(4,Math.round((rect.width||800)*scale));
    const height=Math.max(4,Math.round((rect.height||600)*scale));
    if(this.canvas.width===width&&this.canvas.height===height&&!this._forceResize)return;
    this.canvas.width=width;this.canvas.height=height;
    if(this._fallbackOutput){this._fallbackOutput.width=width;this._fallbackOutput.height=height;}
    if(this.gl&&!this._contextLost){
      try{
        for(const key of ['beamTarget','blurHalf','glowTarget','blurQuarter','scatterTarget'])this._deleteTarget(this[key]);
        this.beamTarget=this._target(width,height);
        const hw=Math.max(1,Math.floor(width/2)),hh=Math.max(1,Math.floor(height/2)),qw=Math.max(1,Math.floor(width/4)),qh=Math.max(1,Math.floor(height/4));
        this.blurHalf=this._target(hw,hh);this.glowTarget=this._target(hw,hh);
        this.blurQuarter=this._target(qw,qh);this.scatterTarget=this._target(qw,qh);
        this._forceResize=false;
      }catch(error){this._fallback(error);}
    }
  }
  _pass(program,target,textures,uniforms={}){
    const gl=this.gl;
    gl.useProgram(program.p);gl.bindFramebuffer(gl.FRAMEBUFFER,target?target.fbo:null);
    gl.viewport(0,0,target?target.width:this.canvas.width,target?target.height:this.canvas.height);
    if(program.uniforms.bufferMode!=null)gl.uniform1f(program.uniforms.bufferMode,this._byteTargets?1:0);
    let unit=0;
    for(const [name,texture] of Object.entries(textures)){
      gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,texture);gl.uniform1i(program.uniforms[name],unit++);
    }
    for(const [name,value] of Object.entries(uniforms)){
      if(Array.isArray(value)){if(value.length===3)gl.uniform3fv(program.uniforms[name],value);else gl.uniform2fv(program.uniforms[name],value);}else gl.uniform1f(program.uniforms[name],value);
    }
    gl.drawArrays(gl.TRIANGLES,0,3);
  }
  setPower(state={}){
    const clamp=(value,fallback,min=0)=>Number.isFinite(value)?Math.max(min,Math.min(1,value)):fallback;
    this.power={level:clamp(state.level,1),vertical:clamp(state.vertical,1,.001),horizontal:clamp(state.horizontal,1,.001),spot:clamp(state.spot,0),bend:clamp(state.bend,0),focus:clamp(state.focus,0)};
  }
  render(timeSeconds,dtSeconds){
    if(this._destroyed||this._contextLost)return;
    const dt=Math.min(0.05,Math.max(0.001,Number.isFinite(dtSeconds)?dtSeconds:1/60));
    if(!this.gl){this._renderFallback(dt);return;}
    const gl=this.gl,o=this.options,colors=phosphorColors(this.options.tint);
    gl.bindVertexArray(this.vao);
    gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.inputTexture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL,gl.NONE);
    gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,gl.RGBA,gl.UNSIGNED_BYTE,this.source);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);
    const previous=this.states[this.stateIndex],current=this.states[1-this.stateIndex];
    // Keeping the simulation clock small avoids losing sub-line timing in
    // single-precision shader arithmetic after a tab has been open for hours.
    this._clock=(this._clock||0)+dt;
    if(this._clock>1)this._clock-=1; // exactly 60 raster periods; sub-microsecond float precision
    this._pass(this.programs.state,current,{sourceImage:this.inputTexture,previousState:previous.texture},{clock:this._clock,exposure:dt,persistence:o.persistence});
    this.stateIndex=1-this.stateIndex;
    this._pass(this.programs.beam,this.beamTarget,{state:current.texture},{scanlines:o.scanlines,brightness:o.brightness});
    const w=this.beamTarget.width,h=this.beamTarget.height;
    this._pass(this.programs.blur,this.blurHalf,{image:this.beamTarget.texture},{direction:[2.0/w,0]});
    this._pass(this.programs.blur,this.glowTarget,{image:this.blurHalf.texture},{direction:[0,2.0/h]});
    this._pass(this.programs.blur,this.blurQuarter,{image:this.glowTarget.texture},{direction:[9.0/w,0]});
    this._pass(this.programs.blur,this.scatterTarget,{image:this.blurQuarter.texture},{direction:[0,9.0/h]});
    this._pass(this.programs.composite,null,{beam:this.beamTarget.texture,glow:this.glowTarget.texture,scatter:this.scatterTarget.texture},{clock:this._clock,curvature:o.curvature,glass:o.glass,bloom:o.bloom,motion:o.reducedMotion?0:1,ambient:o.ambient,reflection:o.reflection,environmentMode:['none','diffuse','window','studio','observer','mixed'].indexOf(o.environment),resolution:[w,h],powerLevel:this.power.level,powerScale:[this.power.horizontal,this.power.vertical],powerSpot:this.power.spot,powerBend:this.power.bend||0,powerFocus:this.power.focus||0,phosphorSpectrum:colors.spectrum,glassTint:colors.glass,coatingTint:colors.coating,pageTint:o.blackBackground?[0,0,0]:colors.page.map(v=>v/255)});
  }
  _renderFallback(dt){
    const ctx=this.fallback;if(!ctx)return;
    const b=this._fallbackContext,o=this.options,w=this.canvas.width,h=this.canvas.height,colors=phosphorColors(o.tint);
    b.globalCompositeOperation='source-over';b.fillStyle=`rgba(0,0,0,${1-Math.exp(-dt/(0.022*Math.max(0.08,o.persistence)))})`;b.fillRect(0,0,256,192);
    b.globalCompositeOperation='lighter';b.globalAlpha=0.65;b.drawImage(this.source,0,0);b.globalAlpha=1;b.globalCompositeOperation='source-over';
    ctx.fillStyle=o.blackBackground?'#000':colorCSS(colors.page);ctx.fillRect(0,0,w,h);ctx.save();
    const r=w*0.025;ctx.beginPath();ctx.roundRect(w*0.025,h*0.025,w*0.95,h*0.95,r);ctx.clip();
    const power=this.power;ctx.save();ctx.translate(w/2,h/2);ctx.scale(power.horizontal,power.vertical);ctx.translate(-w/2,-h/2);
    const bend=power.bend||0,focus=power.focus||0,columns=bend>.00005?32:1;
    for(let col=0;col<columns;col++){
      const x=col*w/columns,cw=w/columns,across=(col+.5)/columns*2-1;
      // Reverse the UV y direction used by WebGL. Keep beam width finite even
      // as vertical deflection approaches zero.
      const offset=-bend*(1-across*across)*h/Math.max(.001,power.vertical);
      ctx.save();ctx.translate(0,offset);
      const draw=()=>columns===1?ctx.drawImage(this._fallbackBuffer,0,0,w,h):ctx.drawImage(this._fallbackBuffer,col*256/columns,0,256/columns,192,x,0,cw+.5,h);
      ctx.imageSmoothingEnabled=true;ctx.filter=`blur(${(Math.max(0,o.bloom)+focus*2)*w/320}px)`;ctx.globalAlpha=.35*power.level;draw();
      ctx.filter=focus>.001?`blur(${focus*w/480}px)`:'none';ctx.globalAlpha=Math.min(1,o.brightness)*power.level;draw();
      ctx.filter='none';ctx.globalCompositeOperation='multiply';ctx.globalAlpha=1;ctx.fillStyle=colorCSS(colors.beam);ctx.fillRect(x,0,cw+.5,h);
      ctx.globalCompositeOperation='source-over';ctx.globalAlpha=.32*Math.min(1,o.scanlines);ctx.fillStyle='#000';
      for(let y=0;y<192;y+=Math.max(1,Math.ceil(192/(h*power.vertical))))ctx.fillRect(x,(y+.65)*h/192,cw+.5,h/192*.35);
      ctx.restore();
    }
    ctx.restore();ctx.globalAlpha=1;ctx.globalCompositeOperation='screen';
    if(power.vertical<.18&&power.level>0){
      const ratio=Math.max(0,Math.min(1,(power.vertical-.025)/.155));
      const convergence=1-ratio*ratio*(3-2*ratio);
      // Match GL's content-derived integrated column, rather than inventing a
      // fixed-strength line unrelated to the actual phosphor image.
      const data=b.getImageData?.(0,0,256,192)?.data;
      const columnLight=Array.from({length:32},(_,col)=>{
        if(!data)return 0;
        let sum=0;
        for(let row=0;row<16;row++)for(let x=0;x<8;x++)sum+=data[(Math.floor((row+.5)*12)*256+col*8+x)*4]/255;
        return sum/128*Math.max(0,o.brightness);
      });
      for(let col=0;col<columns;col++){
        const across=(col+.5)/columns*2-1,offset=-bend*(1-across*across)*h;
        const sample=Math.min(31,Math.floor((col+.5)/columns*32));
        let averaged=0,weights=0;
        for(let dx=-2;dx<=2;dx++){const weight=3-Math.abs(dx);averaged+=columnLight[Math.max(0,Math.min(31,sample+dx))]*weight;weights+=weight;}
        const lineEnergy=Math.min(3,averaged/weights*11+.05)*power.level*convergence;
        const strength=1-Math.exp(-lineEnergy*1.1);
        const spread=Math.max(.0017,.75/h)*(1+focus*2.3)*5;
        const line=ctx.createLinearGradient(0,h*(.5-spread)+offset,0,h*(.5+spread)+offset);
        line.addColorStop(0,colorCSS(colors.line,0));line.addColorStop(.42,colorCSS(colors.line,strength*.08));
        line.addColorStop(.5,colorCSS(colors.core,strength));line.addColorStop(.58,colorCSS(colors.line,strength*.08));line.addColorStop(1,colorCSS(colors.line,0));
        ctx.fillStyle=line;ctx.fillRect(w*(1-power.horizontal)/2+col*w*power.horizontal/columns,h*(.5-spread)+offset,w*power.horizontal/columns+.5,h*spread*2);
      }
    }
    if(power.spot>0){
      const spot=ctx.createRadialGradient(w/2,h/2,0,w/2,h/2,h*.016);
      spot.addColorStop(0,colorCSS(colors.spot,Math.min(1,power.spot*3)));spot.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=spot;ctx.fillRect(0,0,w,h);
    }
    ctx.fillStyle=colorCSS(colors.ambient,o.ambient*.18);ctx.fillRect(0,0,w,h);
    if(o.environment!=='none'&&o.ambient>0&&o.reflection>0){
      // Cache a small unresolved room field. The fallback keeps all preset
      // choices, while its documented reduced optics omit refracted rays.
      if(this._roomPreset!==o.environment||this._roomTint!==o.tint){
        this._roomPreset=o.environment;this._roomTint=o.tint;
        this._roomCanvas??=document.createElement('canvas');
        this._roomCanvas.width=256;this._roomCanvas.height=192;
        const room=this._roomCanvas.getContext('2d');
        const lobe=(x,y,rx,ry,alpha)=>{
          room.save();room.translate(x,y);room.scale(rx,ry);
          const gradient=room.createRadialGradient(0,0,0,0,0,1);
          gradient.addColorStop(0,colorCSS(colors.room,alpha));
          gradient.addColorStop(1,'rgba(0,0,0,0)');
          room.fillStyle=gradient;room.fillRect(-1,-1,2,2);room.restore();
        };
        room.globalCompositeOperation='lighter';
        lobe(100,65,230,175,.35);lobe(220,95,180,200,.25);
        if(o.environment==='window'||o.environment==='mixed')lobe(30,48,180,190,.6);
        if(o.environment==='studio'||o.environment==='mixed'){
          lobe(180,8,180,105,.45);lobe(250,110,105,200,.25);
        }
        if(o.environment==='observer'||o.environment==='mixed'){
          room.globalCompositeOperation='destination-out';
          lobe(133,75,34,42,.22);lobe(133,139,84,50,.22);
        }
      }
      ctx.globalAlpha=Math.min(.65,o.ambient*o.reflection*.18);
      ctx.drawImage(this._roomCanvas,0,0,w,h);
    }
    ctx.restore();ctx.filter='none';ctx.globalAlpha=1;
    if(this._blitGL){
      const gl=this._blitGL;gl.bindVertexArray(null);gl.useProgram(this._blitProgram.p);
      gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,w,h);
      gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this._blitTexture);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,this._fallbackOutput);
      gl.uniform1i(this._blitProgram.uniforms.pixels,0);gl.drawArrays(gl.TRIANGLES,0,3);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);
    }
  }
  _disposeBlit(){
    if(this._blitGL){
      if(this._blitProgram)this._blitGL.deleteProgram(this._blitProgram.p);
      if(this._blitTexture)this._blitGL.deleteTexture(this._blitTexture);
    }
    this._blitGL=null;this._blitProgram=null;this._blitTexture=null;
  }
  _disposeGL(){
    if(!this.gl)return;
    for(const t of this._targets){this.gl.deleteTexture(t.texture);this.gl.deleteFramebuffer(t.fbo);}
    for(const p of this._programs)this.gl.deleteProgram(p.p);
    if(this.inputTexture)this.gl.deleteTexture(this.inputTexture);
    if(this.vao)this.gl.deleteVertexArray(this.vao);
    this._targets=[];this._programs=[];
  }
  destroy(){
    this._destroyed=true;this._disposeGL();this._disposeBlit();
    this.canvas.removeEventListener('webglcontextlost',this._lostHandler);this.canvas.removeEventListener('webglcontextrestored',this._restoreHandler);
  }
}

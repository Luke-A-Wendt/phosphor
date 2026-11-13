/**
 * Monochrome raster / faceplate renderer. No dependencies.
 *
 * The source is exactly 160 x 192 samples, displayed with non-square pixels.
 * A 60 Hz / 262-line raster excites two exponential phosphor populations.
 * Each visible frame analytically integrates decay AND the line's excitation
 * pulses over its exposure interval; there is no decorative scrolling scan bar.
 * The source is held for the interval, as an ordinary browser framebuffer is.
 * Gaussian beam reconstruction, optical scatter and a separate glass layer are
 * rendered at display resolution. No RGB mask is used on a monochrome tube.
 *
 * This is a physically informed, tunable visual model, not a measured model of
 * one particular tube. Faceplate refraction is a thin-layer approximation;
 * room reflections are procedural. Browser refresh cannot show the individual
 * 15.72 kHz sweeps. Fast/slow decay constants are illustrative green phosphor.
 */

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
out vec4 color;
void main(){
  ivec2 cell=ivec2(gl_FragCoord.xy);
  vec4 src=texelFetch(sourceImage,cell,0);
  float excitation=max(src.r,max(src.g,src.b));
  vec2 energy=texelFetch(previousState,cell,0).rg;
  const float period=1.0/60.0;
  // 35 blank lines above and below the 192-line active image. Source upload
  // is flipped into GL coordinates: scan from the physical top down.
  float line=191.0-float(cell.y);
  // The active portion occupies 83% of each line; the remaining time is
  // horizontal blanking/retrace. Vertical blanking is never phosphor-excited.
  float phase=(35.0+line+0.13+0.83*(float(cell.x)+0.5)/160.0)/262.0*period;
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
  color=vec4(energy,light,1.0);
}`;

const BEAM = `#version 300 es
precision highp float;
in vec2 uv;
uniform sampler2D state;
uniform float scanlines;
uniform float brightness;
out vec4 color;
float signalAt(ivec2 p){
  if(p.x<0||p.x>=160||p.y<0||p.y>=192) return 0.0;
  return texelFetch(state,p,0).b;
}
void main(){
  vec2 position=uv*vec2(160.0,192.0)-0.5;
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
  color=vec4(vec3(light*brightness),1.0);
}`;

const BLUR = `#version 300 es
precision highp float;
in vec2 uv;
uniform sampler2D image;
uniform vec2 direction;
out vec4 color;
void main(){
  vec3 result=texture(image,uv).rgb*0.2270270270;
  result+=(texture(image,uv+direction*1.3846153846).rgb+texture(image,uv-direction*1.3846153846).rgb)*0.3162162162;
  result+=(texture(image,uv+direction*3.2307692308).rgb+texture(image,uv-direction*3.2307692308).rgb)*0.0702702703;
  color=vec4(result,1.0);
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
uniform vec2 resolution;
out vec4 color;
float hash(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}
float roundedBox(vec2 p,vec2 b,float r){vec2 q=abs(p)-b+r; return length(max(q,0.0))+min(max(q.x,q.y),0.0)-r;}
float rectangle(vec2 p,vec2 lo,vec2 hi,float softness){
  vec2 a=smoothstep(lo-vec2(softness),lo+vec2(softness),p);
  vec2 b=1.0-smoothstep(hi-vec2(softness),hi+vec2(softness),p);
  return a.x*a.y*b.x*b.y;
}
vec3 phosphor(float energy){
  // All emission shares one green spectrum. The transfer curve retains a
  // bright green core rather than clipping it to white.
  float g=1.0-exp(-max(energy,0.0)*0.85);
  return vec3(pow(g,1.10)*0.135,g,pow(g,1.16)*0.31);
}
void main(){
  vec2 p=uv*2.0-1.0;
  float c=clamp(curvature,0.0,2.0);
  vec2 shaped=p*(1.0+0.055*c*dot(p,p));
  float edgeDistance=roundedBox(shaped,vec2(0.988),0.095+0.035*c);
  float aa=2.4/max(resolution.x,resolution.y);
  float inside=1.0-smoothstep(-aa,aa,edgeDistance);
  vec3 page=vec3(3.0,7.0,5.0)/255.0;
  // Convex outer faceplate and refraction down to the emitting inner surface.
  vec3 normal=normalize(vec3(p.x*0.30*c,p.y*0.24*c,1.0));
  vec3 transmitted=refract(vec3(0.0,0.0,-1.0),normal,1.0/1.52);
  vec2 refracted=shaped+glass*0.042*transmitted.xy/max(0.1,-transmitted.z);
  vec2 screen=refracted*0.5+0.5;
  float direct=texture(beam,screen).r;
  float tight=texture(glow,screen).r;
  float wide=texture(scatter,screen).r;
  // Very faint second-surface reflection: displaced with angle, not a second
  // equally bright text image. This is an approximation of internal halation.
  float ghost=texture(glow,screen+normal.xy*0.011).r;
  float transmission=1.0-glass*(0.045+0.045*dot(p,p));
  float edgeFocus=1.0-0.12*pow(clamp(dot(p,p)*0.5,0.0,1.0),2.0);
  // Scatter redistributes light instead of adding unlimited energy. The
  // normalized kernels and these coefficients preserve total emitted flux
  // before glass attenuation, edge loss, and the display transfer curve.
  float tightWeight=0.20*bloom, wideWeight=0.12*bloom;
  float ghostWeight=0.012*glass;
  float directWeight=1.0-tightWeight-wideWeight-ghostWeight;
  float energy=(direct*directWeight+tight*tightWeight+wide*wideWeight+ghost*ghostWeight)*transmission*edgeFocus;
  float granularity=(hash(floor(screen*vec2(1280.0,1536.0)))-0.5)*0.035;
  energy*=1.0+granularity;
  // Thermal/electrical variation is intentionally tiny. No simulated VHS
  // tracking faults, RGB convergence error, or cinematic rolling bright bar.
  float noise=(hash(gl_FragCoord.xy+floor(clock*60.0))-0.5)*motion;
  energy*=1.0+noise*0.009;
  vec3 light=phosphor(energy);
  float fresnel=0.042+0.958*pow(1.0-max(normal.z,0.0),5.0);
  // A dim off-screen window reflected in the curved faceplate. Position and
  // shape follow the surface normal, giving it a separate visual depth.
  vec2 reflected=vec2(p.x+0.10*p.y*p.y,p.y-0.16*p.x*p.x);
  float window=rectangle(reflected,vec2(-0.84,0.48),vec2(-0.40,0.91),0.10);
  float cross=1.0-0.68*exp(-pow((reflected.x+0.625)/0.022,2.0));
  window*=cross;
  float lip=exp(-pow((edgeDistance+0.018)/0.009,2.0));
  float rim=lip*(0.25+0.75*max(0.0,p.y))*0.009;
  float reflection=glass*(window*(0.014+fresnel*0.12)+rim);
  // Glass has its own barely visible, green-tinted ambient floor.
  vec3 surface=vec3(0.004,0.010,0.006)+reflection*vec3(0.21,1.0,0.47);
  surface+=light;
  // A small amount of optical spill reaches outside the active faceplate,
  // with no housing, frame, bezel, or outer monitor representation.
  float spill=(1.0-inside)*exp(-max(0.0,edgeDistance)*80.0)*texture(scatter,clamp(screen,0.0,1.0)).r*bloom*0.025;
  vec3 result=mix(page,surface,inside)+phosphor(spill);
  color=vec4(result,1.0);
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
    this.canvas=canvas; this.source=sourceCanvas;
    this.options={brightness:1,persistence:1,bloom:1,curvature:1,glass:1,scanlines:1,reducedMotion:false};
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
    if(!gl.getExtension('EXT_color_buffer_float')) throw new Error('Floating-point render targets unavailable');
    this._targets=[];this._programs=[];
    gl.disable(gl.DEPTH_TEST);gl.disable(gl.BLEND);gl.disable(gl.CULL_FACE);
    this.vao=gl.createVertexArray();gl.bindVertexArray(this.vao);
    this.programs={state:program(gl,STATE),beam:program(gl,BEAM),blur:program(gl,BLUR),composite:program(gl,COMPOSITE)};
    this._programs=Object.values(this.programs);
    this.inputTexture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,this.inputTexture);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,160,192,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
    this.states=[this._target(160,192,false),this._target(160,192,false)]; this.stateIndex=0;
    this._backend='WebGL 2 · integrated raster';this._forceResize=true;
  }
  _target(width,height,linear=true){
    const gl=this.gl,texture=gl.createTexture(),fbo=gl.createFramebuffer();
    gl.bindTexture(gl.TEXTURE_2D,texture);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,linear?gl.LINEAR:gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,linear?gl.LINEAR:gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA16F,width,height,0,gl.RGBA,gl.HALF_FLOAT,null);
    gl.bindFramebuffer(gl.FRAMEBUFFER,fbo);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,texture,0);
    if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE){gl.deleteTexture(texture);gl.deleteFramebuffer(fbo);throw new Error('Incomplete phosphor framebuffer');}
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
    this._fallbackBuffer=document.createElement('canvas');this._fallbackBuffer.width=160;this._fallbackBuffer.height=192;
    this._fallbackContext=this._fallbackBuffer.getContext('2d',{alpha:false});
  }
  setOptions(partial={}){
    for(const key of ['brightness','persistence','bloom','curvature','glass','scanlines']){
      if(Number.isFinite(partial[key]))this.options[key]=Math.max(0,Math.min(2,partial[key]));
    }
    if('reducedMotion' in partial)this.options.reducedMotion=Boolean(partial.reducedMotion);
  }
  resize(){
    const rect=this.canvas.getBoundingClientRect();
    const dpr=Math.min(2,window.devicePixelRatio||1);
    // A modest size cap keeps all multipass buffers affordable on integrated GPUs.
    const scale=Math.min(dpr,1400/Math.max(1,rect.width));
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
    let unit=0;
    for(const [name,texture] of Object.entries(textures)){
      gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,texture);gl.uniform1i(program.uniforms[name],unit++);
    }
    for(const [name,value] of Object.entries(uniforms)){
      if(Array.isArray(value))gl.uniform2fv(program.uniforms[name],value);else gl.uniform1f(program.uniforms[name],value);
    }
    gl.drawArrays(gl.TRIANGLES,0,3);
  }
  render(timeSeconds,dtSeconds){
    if(this._destroyed||this._contextLost)return;
    const dt=Math.min(0.05,Math.max(0.001,Number.isFinite(dtSeconds)?dtSeconds:1/60));
    if(!this.gl){this._renderFallback(dt);return;}
    const gl=this.gl,o=this.options;
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
    this._pass(this.programs.composite,null,{beam:this.beamTarget.texture,glow:this.glowTarget.texture,scatter:this.scatterTarget.texture},{clock:this._clock,curvature:o.curvature,glass:o.glass,bloom:o.bloom,motion:o.reducedMotion?0:1,resolution:[w,h]});
  }
  _renderFallback(dt){
    const ctx=this.fallback;if(!ctx)return;
    const b=this._fallbackContext,o=this.options,w=this.canvas.width,h=this.canvas.height;
    b.globalCompositeOperation='source-over';b.fillStyle=`rgba(0,0,0,${1-Math.exp(-dt/(0.022*Math.max(0.08,o.persistence)))})`;b.fillRect(0,0,160,192);
    b.globalCompositeOperation='lighter';b.globalAlpha=0.65;b.drawImage(this.source,0,0);b.globalAlpha=1;b.globalCompositeOperation='source-over';
    ctx.fillStyle='#030705';ctx.fillRect(0,0,w,h);ctx.save();
    const r=w*0.025;ctx.beginPath();ctx.roundRect(w*0.025,h*0.025,w*0.95,h*0.95,r);ctx.clip();
    ctx.imageSmoothingEnabled=true;ctx.filter=`blur(${Math.max(0,o.bloom)*w/320}px)`;ctx.globalAlpha=0.35;ctx.drawImage(this._fallbackBuffer,0,0,w,h);
    ctx.filter='none';ctx.globalAlpha=Math.min(1,o.brightness);ctx.drawImage(this._fallbackBuffer,0,0,w,h);
    ctx.globalCompositeOperation='multiply';ctx.fillStyle='#25e55c';ctx.fillRect(0,0,w,h);ctx.globalCompositeOperation='source-over';ctx.globalAlpha=0.32*Math.min(1,o.scanlines);ctx.fillStyle='#000';
    for(let y=0;y<192;y++)ctx.fillRect(0,(y+0.65)*h/192,w,h/192*0.35);
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

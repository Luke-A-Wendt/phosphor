// Final faceplate surround. RGB contains the rendered screen; alpha carries
// only phosphor emission, so reflected room light cannot illuminate the lip.
export const INLET = `#version 300 es
precision highp float;
in vec2 uv;
uniform sampler2D screenImage;
uniform vec2 resolution;
uniform vec3 phosphorSpectrum;
uniform vec3 pageTint;
uniform float ambient;
out vec4 color;
const vec2 aspect=vec2(1.3333333333,1.0);
const float screenScale=0.92;
float roundedBox(vec2 p,vec2 b,float r){vec2 q=abs(p)-b+r;return length(max(q,0.0))+min(max(q.x,q.y),0.0)-r;}
// The opening gently bows outward at the middle of each edge, as the curved
// faceplate disappears into the molded recess; the outer edge remains square.
vec2 glassPoint(vec2 p){vec2 q=p/screenScale;return q*(1.0+vec2(0.028,0.020)*pow(q.yx/vec2(0.975,1.308),vec2(2.0)));}
float innerDistance(vec2 p){return roundedBox(glassPoint(p),vec2(1.308,0.975),0.052)*screenScale;}
vec3 encodeDisplay(vec3 light){
 vec3 mapped=vec3(1.0)-exp(-max(light,vec3(0.0))*1.10);
 return mix(12.92*mapped,1.055*pow(mapped,vec3(1.0/2.4))-0.055,step(vec3(0.0031308),mapped));
}
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1)),f.x),f.y);}
// Rough dielectric microfacets: plastic reflects a broad phosphor image in
// addition to diffuse spill. The same BRDF is used for screen and room light.
float specularBRDF(vec3 n,vec3 light,float roughness){
 float nl=max(dot(n,light),0.0),nv=max(n.z,0.001);
 if(nl<=0.0)return 0.0;
 vec3 halfway=normalize(light+vec3(0,0,1));
 float nh=max(dot(n,halfway),0.0),vh=max(halfway.z,0.0);
 float alpha=roughness*roughness,a2=alpha*alpha;
 float den=nh*nh*(a2-1.0)+1.0;
 float distribution=a2/(3.14159265*den*den);
 float gv=2.0*nv/(nv+sqrt(a2+(1.0-a2)*nv*nv));
 float gl=2.0*nl/(nl+sqrt(a2+(1.0-a2)*nl*nl));
 float fresnel=0.04+0.96*pow(1.0-vh,5.0);
 return distribution*gv*gl*fresnel/max(4.0*nv*nl,0.001);
}
float emissionAt(vec2 p,float patchWidth){
 vec2 q=glassPoint(p)/aspect*0.5+0.5;
 if(any(lessThan(q,vec2(0.0)))||any(greaterThan(q,vec2(1.0))))return 0.0;
 // Integrate small emitting patches, not individual scanlines. A filtered
 // mip footprint prevents the finite quadrature grid from showing as bands.
 float footprint=max(0.0,log2(resolution.y*patchWidth));
 return -2.0*log(max(0.0001,1.0-textureLod(screenImage,q,footprint).a));
}
void main(){
 vec2 p=(uv*2.0-1.0)*aspect;
 float aa=max(0.0005,2.0/resolution.y);
 float d=innerDistance(p),outerD=roundedBox(p,vec2(1.32,0.99),0.045);
 vec3 screen=textureLod(screenImage,glassPoint(p)/aspect*0.5+0.5,0.0).rgb;
 if(d < -aa){color=vec4(screen,1.0);return;}
 if(outerD > aa){color=vec4(pageTint,1.0);return;}
 // The SDF normal blends smoothly around corners: both adjacent screen edges
 // illuminate a corner, without four independent strips meeting at a seam.
 vec2 e=vec2(0.001,0.0);
 vec2 outward=normalize(vec2(innerDistance(p+e)-innerDistance(p-e),innerDistance(p+e.yx)-innerDistance(p-e.yx)));
 vec2 tangent=vec2(-outward.y,outward.x);
 float width=max(0.025,d-outerD);
 float t=clamp(d/width,0.0,1.0);
 vec2 edge=p-outward*max(d,0.0);
 // Four near-planar inset faces meet at softly tooled corner joins. Narrow
 // chamfers define the outer ledge, rather than rounding the whole rim over.
 vec2 facePosition=(abs(p)-vec2(1.308,0.975)*screenScale)/(vec2(1.32,0.99)-vec2(1.308,0.975)*screenScale);
 float join=facePosition.y-facePosition.x;
 float faceMix=smoothstep(-0.075,0.075,join);
 vec2 faceNormal=normalize(vec2(sign(p.x)*(1.0-faceMix),sign(p.y)*faceMix));
 faceNormal=normalize(mix(outward,faceNormal,smoothstep(0.04,0.20,t)));
 float height=0.010+0.118*min(t,0.78)+0.032*clamp(t-0.78,0.0,0.14)-0.080*max(t-0.92,0.0);
 float gradient=mix(0.118,0.032,smoothstep(0.765,0.795,t));
 gradient=mix(gradient,-0.080,smoothstep(0.91,0.94,t))/width;
 vec3 normal=normalize(vec3(-faceNormal*gradient,1.0));
 float fineScale=min(210.0,resolution.y*0.28);
 vec2 grainUV=p*fineScale;
 vec2 microNormal=vec2(noise(grainUV+vec2(.13,0))-noise(grainUV-vec2(.13,0)),noise(grainUV+vec2(0,.13))-noise(grainUV-vec2(0,.13)));
 normal=normalize(normal+vec3(microNormal*0.075,0));
 float roughness=0.46+0.16*noise(p*19.0)+0.05*noise(grainUV);
 float irradiance=0.0,specular=0.0;
 // Bounded area-light quadrature: each point contributes by distance squared,
 // emitter cosine and receiving-surface cosine. Only lip pixels do this work.
 for(int row=0;row<4;row++){
  float depth=0.025+float(row)*0.065;
  for(int column=-3;column<=3;column++){
   vec2 samplePoint=edge-outward*depth+tangent*(float(column)*0.06);
   vec3 delta=vec3(samplePoint-p,-height);
   float r2=dot(delta,delta),r=sqrt(r2);
   float formFactor=(height/r)*max(0.0,dot(normal,delta/r))/max(r2,0.001);
   float arriving=emissionAt(samplePoint,0.025)*formFactor*0.0039;
   irradiance+=arriving;
   specular+=arriving*specularBRDF(normal,delta/r,roughness);
  }
 }
 // The whole raster contributes a weaker, broad bounce. Coarse filtered
 // patches cover the screen interior; the local gather resolves near edges.
 for(int y=0;y<3;y++)for(int x=0;x<4;x++){
  vec2 source=vec2((float(x)-1.5)*0.60,(float(y)-1.0)*0.60);
  vec3 delta=vec3(source-p,-height);
  float r2=dot(delta,delta),r=sqrt(r2);
  float formFactor=(height/r)*max(0.0,dot(normal,delta/r))/max(r2,0.001);
  float farWeight=smoothstep(0.20,0.42,length(delta.xy));
  float arriving=emissionAt(source,0.18)*formFactor*0.36*farWeight;
  irradiance+=arriving;
  specular+=arriving*specularBRDF(normal,delta/r,roughness);
 }
 // Fixed pigment mottling, minute pits and rubbed edges belong to the surface,
 // independent of the moving light. Keep wear restrained and resolution-safe.
 float mottling=0.86+0.14*noise(p*8.0)+0.045*noise(p*37.0);
 float grain=0.88+0.12*noise(grainUV);
 vec2 pitUV=p*76.0,pitCell=floor(pitUV),pitPoint=fract(pitUV)-0.5;
 float pits=step(0.979,hash(pitCell))*exp(-30.0*dot(pitPoint,pitPoint));
 float textureGrain=mottling*grain*(1.0-0.22*pits);
 float contact=smoothstep(0.012,0.070,t);
 float corner=exp(-pow(join/0.11,2.0))*smoothstep(0.06,0.20,t)*(1.0-smoothstep(0.72,0.88,t));
 float occlusion=1.0-0.20*corner;
 float shoulder=1.0-0.28*smoothstep(0.945,1.0,t);
 float edgePolish=exp(-pow((t-0.80)/0.023,2.0))*(0.7+0.3*noise(p*81.0));
 vec3 roomDirection=normalize(vec3(-0.6,1.0,2.1));
 float diffuse=0.28+0.72*max(0.0,dot(normal,roomDirection));
 float roomSpecular=specularBRDF(normal,roomDirection,roughness)*max(0.0,dot(normal,roomDirection));
 vec3 room=vec3(0.78,0.83,0.71)*max(0.0,ambient)*(0.008*diffuse+0.020*roomSpecular);
 vec3 reflected=phosphorSpectrum*(irradiance*0.72+specular*3.14159265);
 vec3 material=encodeDisplay((room+reflected)*textureGrain*contact*shoulder*occlusion*(1.0+edgePolish*0.12));
 float outerMask=1.0-smoothstep(-aa,aa,outerD);
 float innerMask=1.0-smoothstep(-aa,aa,d);
 color=vec4(mix(mix(pageTint,material,outerMask),screen,innerMask),1.0);
}`;

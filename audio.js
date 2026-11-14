// Original procedural audio: no recordings, samples from games, or network requests.
// Original Web Audio approximations, not a component-exact circuit emulator.
// Circuit references (no source code or ROM/audio samples extracted):
// https://github.com/mamedev/mame/blob/master/src/mame/atari/asteroid_a.cpp
// https://github.com/mamedev/mame/blob/master/src/mame/midw8080/mw8080bw_a.cpp
// https://www.computerarcheology.com/Arcade/SpaceInvaders/Code.html
// Fleet pitches are calculated from 555 R1=40/68/82/100k, R2=75k, C=.1uF,
// 5V supply / 4.4V charging. Four ~67ms pulses; mild harmonics retained for
// small speakers. Cadence follows this game's movement, rather than a ROM timer.
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const VOLUMES={musicVolume:1,gameVolume:1,keyboardVolume:.5,monitorVolume:.5};
// Power transients get extra headroom without raising the continuous hum.
const POWER_GAIN=1.6;
const BUS_GAIN={music:1,game:1,keyboard:6,monitor:6};
const BUS={music:'musicVolume',game:'gameVolume',keyboard:'keyboardVolume',monitor:'monitorVolume'};
const hz=midi=>440*2**((midi-69)/12);
// Traditional Korobeiniki melody; this is an original two-voice arrangement.
const MELODY=[
 [76,1],[71,.5],[72,.5],[74,1],[72,.5],[71,.5],[69,1],[69,.5],[72,.5],[76,1],[74,.5],[72,.5],
 [71,1.5],[72,.5],[74,1],[76,1],[72,1],[69,1],[69,2],
 [74,1.5],[77,.5],[81,1],[79,.5],[77,.5],[76,1.5],[72,.5],[76,1],[74,.5],[72,.5],
 [71,1],[71,.5],[72,.5],[74,1],[76,1],[72,1],[69,1],[69,2],
 [76,2],[72,2],[74,2],[71,2],[72,2],[69,2],[68,2],[71,2],
 [76,2],[72,2],[74,2],[71,2],[72,1],[76,1],[81,2],[80,2],[81,2]
];

export class AudioEngine {
 constructor({contextFactory,random=Math.random}={}){
  this.contextFactory=contextFactory||(()=>{const Context=globalThis.AudioContext||globalThis.webkitAudioContext;return Context?new Context({latencyHint:'interactive'}):null;});
  this.random=random;this.options={...VOLUMES};this.ctx=null;this.buses={};this.voices=new Set();this.loops=[];this.continuous=new Map();this.retiring=new Set();this.noiseBuffers=new Map();
  this.powered=false;this.hidden=false;this.scene=null;this.active=false;this.note=0;this.beat=0;this.nextNote=0;this.lastEvent=new Map();this.lastBlast=null;this.lastStatus=null;this.marchStep=0;this.beatClock=0;this.beatStep=0;this.failed=false;this._unlocking=null;this._pendingPower=null;this._pendingEvents=[];
 }
 _buildContext(){
  const c=this.contextFactory();if(!c)return false;
  this.ctx=c;this.failed=false;this.lastEvent.clear();
  this.master=c.createGain();this.master.gain.value=.38;
  this.limiter=c.createDynamicsCompressor();this.limiter.threshold.value=-18;this.limiter.knee.value=12;this.limiter.ratio.value=6;this.limiter.attack.value=.003;this.limiter.release.value=.16;
  this.master.connect(this.limiter);this.limiter.connect(c.destination);this.buses={};
  for(const [name,key] of Object.entries(BUS)){const bus=c.createGain();bus.gain.value=this.options[key]*BUS_GAIN[name];bus.connect(this.master);this.buses[name]=bus;}
  c.onstatechange=()=>{if(this.ctx===c&&c.state==='running')this._flushPending();};
  return true;
 }
 _discardContext(){
  this._stopHum();this._stopContinuous(null,true);this.noiseBuffers.clear();for(const voice of [...this.voices])this._stopVoice(voice);
  for(const node of [this.master,this.limiter,...Object.values(this.buses)])try{node?.disconnect();}catch{}
  if(this.ctx)this.ctx.onstatechange=null;this.ctx=null;this.buses={};this._unlocking=null;
 }
 unlock(){
  try{
   if(this.ctx?.state==='closed')this._discardContext();
   if(!this.ctx&&!this._buildContext())return Promise.resolve(false);
   const c=this.ctx;
   if(c.state==='running'){this._flushPending();return Promise.resolve(true);}
   // A previous WebKit resume can remain pending through an interruption.
   // Each later gesture may retry; settled callbacks only flush current queues.
   // WebKit also uses "interrupted" after system/fullscreen transitions.
   // Resume every non-running live context, then schedule one-shots only when
   // its clock is actually running. The most recent power request wins.
   const pending=Promise.resolve(c.resume()).then(()=>{
    if(this.ctx!==c)return false;
    if(c.state==='running'){this._flushPending();return true;}return false;
   },()=>false);
   this._unlocking=pending;
   pending.then(()=>{if(this._unlocking===pending)this._unlocking=null;});
   return pending;
  }catch{this.failed=true;return Promise.resolve(false);}
 }
 _flushPending(){
  if(!this.ctx||this.ctx.state!=='running'||this.hidden)return;
  const power=this._pendingPower;this._pendingPower=null;
  if(power==='on')this._playPowerOn();else if(power==='off')this._playPowerOff();
  else if(this.powered)this._startHum();
  const events=this._pendingEvents.splice(0);
  for(const event of events){if(event.kind==='key')this.keyDown(event.key);else this.gameSound(event.gameId,event.event);}
 }
 _queueEvent(event){
  if(this.ctx&&!this.hidden&&this.ctx.state!=='running'){this._pendingEvents.push(event);if(this._pendingEvents.length>12)this._pendingEvents.shift();}
 }
 setOptions(next={}){
  for(const key of Object.values(BUS))if(Number.isFinite(next[key]))this.options[key]=clamp(next[key],0,1);
  if(!this.ctx||this.ctx.state==='closed'||!this.master)return;
  for(const [name,key] of Object.entries(BUS)){const p=this.buses[name].gain;p.cancelScheduledValues(this.ctx.currentTime);p.setValueAtTime(p.value,this.ctx.currentTime);p.linearRampToValueAtTime(this.options[key]*BUS_GAIN[name],this.ctx.currentTime+.015);}
  if(this.options.musicVolume===0)this._stopTag('music');
  if(this.options.gameVolume===0){this._stopContinuous(null,true);this._stopTag('game');}
 }
 _ready(bus){return Boolean(this.ctx&&this.ctx.state==='running'&&!this.hidden&&this.options[BUS[bus]]>0);}
 _rand(a,b){return a+(b-a)*clamp(this.random(),0,1);}
 _track(source,nodes,tag,end){
  const voice={source,nodes,tag,end};this.voices.add(voice);
  source.onended=()=>{this.voices.delete(voice);for(const n of nodes){try{n.disconnect();}catch{}}};
  // Bound held-fire/polyphony even on a context whose clock is suspended.
  if(this.voices.size>64)this._stopVoice(this.voices.values().next().value);
  return voice;
 }
 _stopVoice(v){if(!v)return;try{v.source.stop();}catch{}for(const n of v.nodes){try{n.disconnect();}catch{}}this.voices.delete(v);}
 _stopTag(tag){for(const v of [...this.voices])if(v.tag===tag)this._stopVoice(v);}
 _tone(bus,frequency,duration,amplitude,{when=0,to=frequency,type='sine',tag=bus,attack=.004,cutoff=0,hold=0,duty=0}={}){
  if(!this._ready(bus))return;
  const c=this.ctx,t=c.currentTime+Math.max(0,when),d=clamp(duration,.008,4),osc=c.createOscillator(),gain=c.createGain(),nodes=[osc,gain];
  const max=Math.min(18000,c.sampleRate*.42);frequency=clamp(frequency,20,max);to=clamp(to,20,max);
  osc.type=type;
  if(duty&&c.createPeriodicWave&&osc.setPeriodicWave){const real=new Float32Array(24),imag=new Float32Array(24);for(let n=1;n<24;n++){real[n]=2*Math.sin(2*Math.PI*n*duty)/(Math.PI*n);imag[n]=2*(1-Math.cos(2*Math.PI*n*duty))/(Math.PI*n);}osc.setPeriodicWave(c.createPeriodicWave(real,imag));}
  osc.frequency.setValueAtTime(frequency,t);osc.frequency.exponentialRampToValueAtTime(to,t+d);
  gain.gain.setValueAtTime(0,t);gain.gain.linearRampToValueAtTime(clamp(amplitude,0,.4),t+Math.min(attack,d*.2));if(hold>0)gain.gain.setValueAtTime(clamp(amplitude,0,.4),t+Math.min(hold,d*.85));gain.gain.exponentialRampToValueAtTime(.00001,t+d);
  if(cutoff){const filter=c.createBiquadFilter();filter.type='lowpass';filter.frequency.value=cutoff;filter.Q.value=.6;osc.connect(filter);filter.connect(gain);nodes.push(filter);}else osc.connect(gain);
  gain.connect(this.buses[bus]);this._track(osc,nodes,tag,t+d);osc.start(t);osc.stop(t+d+.01);
 }
 _noise(bus,duration,amplitude,{when=0,frequency=900,to=frequency,q=.6,type='lowpass',tag=bus,attack=.002,hold=0,white=false,roll=0,tail=0,rollSpeed=1}={}){
  if(!this._ready(bus))return;
  const c=this.ctx,t=c.currentTime+Math.max(0,when),d=clamp(duration,.01,5),count=Math.ceil(c.sampleRate*d),buffer=c.createBuffer(1,count,c.sampleRate),data=buffer.getChannelData(0);
  // Most transients are gently colored. The artillery body is broad white
  // noise, with a separate slowly changing amplitude for the rolling low tail.
  let previous=0,rolling=1,target=1,rollClock=0;
  const smoothing=1-Math.exp(-1/(c.sampleRate*.028));
  for(let n=0;n<count;n++){
   const sample=this._rand(-1,1);previous=white?sample:previous*.25+sample*.75;
   if(roll>0){if(rollClock--<=0){target=this._rand(1-roll,1);rollClock=Math.round(c.sampleRate*this._rand(.045,.12)*rollSpeed);}rolling+=(target-rolling)*smoothing;}
   data[n]=previous*rolling;
  }
  const source=c.createBufferSource(),filter=c.createBiquadFilter(),gain=c.createGain();source.buffer=buffer;filter.type=type;filter.frequency.setValueAtTime(frequency,t);filter.frequency.exponentialRampToValueAtTime(to,t+d);filter.Q.value=q;
  const level=clamp(amplitude,0,.5);
  gain.gain.setValueAtTime(0,t);gain.gain.linearRampToValueAtTime(level,t+Math.min(attack,d*.2));
  if(tail>0){
   // A long audible decay, then a smooth final release; the ordinary transient
   // envelope fades too quickly to carry an artillery roar through its tail.
   if(hold>0)gain.gain.linearRampToValueAtTime(level,t+Math.min(hold,d*.25));
   gain.gain.exponentialRampToValueAtTime(Math.max(.00001,level*tail),t+d*.82);gain.gain.linearRampToValueAtTime(0,t+d);
  }else{if(hold>0)gain.gain.setValueAtTime(level,t+Math.min(hold,d*.85));gain.gain.exponentialRampToValueAtTime(.00001,t+d);}
  source.connect(filter);filter.connect(gain);gain.connect(this.buses[bus]);this._track(source,[source,filter,gain],tag,t+d);source.start(t);source.stop(t+d+.01);
 }
 // Clocked, one-bit excitation gives the coarse rushing sound of a noise
 // register, not a pitched motor. Cache a full-length buffer per audio context.
 _clockedNoise(clock=12000){
  const c=this.ctx,key=String(clock);if(this.noiseBuffers.has(key))return this.noiseBuffers.get(key);
  const length=Math.round(c.sampleRate*65535/clock),buffer=c.createBuffer(1,length,c.sampleRate),data=buffer.getChannelData(0);
  let state=0xace1,phase=0,value=1;
  for(let n=0;n<length;n++){phase+=clock/c.sampleRate;while(phase>=1){phase--;state=(state>>>1)^(-(state&1)&0xb400);value=(state&1)?1:-1;}data[n]=value;}
  this.noiseBuffers.set(key,buffer);return buffer;
 }
 _stopContinuous(name=null,immediate=false){
  if(immediate)for(const voice of this.retiring){try{voice.source.stop();for(const aux of voice.aux||[])aux.stop();}catch{}for(const node of voice.nodes)try{node.disconnect();}catch{}}
  if(immediate)this.retiring.clear();
  for(const [id,voice] of this.continuous){
   if(name!==null&&id!==name)continue;
   this.continuous.delete(id);const t=this.ctx?.currentTime||0;
   try{voice.gain.gain.cancelScheduledValues(t);voice.gain.gain.setValueAtTime(voice.level,t);voice.gain.gain.linearRampToValueAtTime(0,t+(immediate?.001:.045));voice.source.stop(t+(immediate?.002:.055));for(const aux of voice.aux||[])aux.stop(t+(immediate?.002:.055));}catch{}
   if(immediate){for(const node of voice.nodes)try{node.disconnect();}catch{}}else this.retiring.add(voice);
  }
 }
 _continuousVoice(id,source,gain,nodes,level,aux=[]){
  const c=this.ctx;gain.gain.setValueAtTime(0,c.currentTime);gain.gain.linearRampToValueAtTime(level,c.currentTime+.035);gain.connect(this.buses.game);
  const voice={source,gain,nodes,level,aux};
  source.onended=()=>{this.retiring.delete(voice);for(const node of nodes)try{node.disconnect();}catch{}};
  this.continuous.set(id,voice);source.start();for(const node of aux)node.start();
 }
 _thrust(gameId){
  if(this.continuous.has('thrust'))return;
  const c=this.ctx,source=c.createBufferSource(),low=c.createBiquadFilter(),body=c.createGain(),air=c.createBiquadFilter(),hiss=c.createGain(),gain=c.createGain();
  source.buffer=this._clockedNoise(12000);source.loop=true;
  // Atari's thrust circuits filtered a noise register into a low rumble.
  // A quiet broad midrange branch keeps that texture audible on small speakers.
  low.type='lowpass';low.frequency.value=gameId==='lander'?560:200;low.Q.value=.7;body.gain.value=gameId==='lander'?.34:.42;
  air.type='bandpass';air.frequency.value=gameId==='lander'?1150:1450;air.Q.value=.55;hiss.gain.value=gameId==='lander'?.065:.085;
  source.connect(low);low.connect(body);body.connect(gain);source.connect(air);air.connect(hiss);hiss.connect(gain);
  this._continuousVoice('thrust',source,gain,[source,low,body,air,hiss,gain],gameId==='asteroids'?.48:.8);
 }
 _saucer(){
  if(this.continuous.has('saucer'))return;
  const c=this.ctx,source=c.createOscillator(),lfo=c.createOscillator(),depth=c.createGain(),filter=c.createBiquadFilter(),gain=c.createGain();
  source.type='sawtooth';source.frequency.value=340;lfo.type='triangle';lfo.frequency.value=7.5;depth.gain.value=125;filter.type='lowpass';filter.frequency.value=1600;filter.Q.value=.6;
  lfo.connect(depth);depth.connect(source.frequency);source.connect(filter);filter.connect(gain);
  this._continuousVoice('saucer',source,gain,[source,lfo,depth,filter,gain],.065,[lfo]);
 }
 // A normalized stochastic pressure tail, built in the audible low bands.
 // Filtering full-spectrum white noise down to bass removed nearly all its
 // energy; merely extending that envelope made a long but inaudible tail.
 // Normalize the bands before soft saturation, preserving a gravelly body
 // above phone-speaker rolloff without introducing a fixed pitched oscillator.
 _tankRumble(variation){
  if(!this._ready('game'))return;
  const c=this.ctx,d=2.8*variation,rate=c.sampleRate,count=Math.ceil(rate*d);
  const buffer=c.createBuffer(1,count,rate),data=buffer.getChannelData(0),body=new Float32Array(count);
  const coefficient=f=>1-Math.exp(-2*Math.PI*f/rate);
  const bassLP=coefficient(100*variation),bassHP=coefficient(28),bodyLP=coefficient(260*variation),bodyHP=coefficient(95);
  let low=0,dc=0,mid=0,midDC=0,bassEnergy=0,bodyEnergy=0;
  for(let n=0;n<count;n++){
   low+=bassLP*(this._rand(-1,1)-low);dc+=bassHP*(low-dc);
   mid+=bodyLP*(this._rand(-1,1)-mid);midDC+=bodyHP*(mid-midDC);
   data[n]=low-dc;body[n]=mid-midDC;
   bassEnergy+=data[n]*data[n];bodyEnergy+=body[n]*body[n];
  }
  const bassScale=1/Math.max(.00001,Math.sqrt(bassEnergy/count)),bodyScale=1/Math.max(.00001,Math.sqrt(bodyEnergy/count));
  let gust=.8,target=.8,gustClock=0,gravel=.7,gravelTarget=.7,gravelClock=0;
  const gustSmooth=1-Math.exp(-1/(rate*.18)),gravelSmooth=1-Math.exp(-1/(rate*.12));
  for(let n=0;n<count;n++){
   const time=n/rate;
   if(gustClock--<=0){target=this._rand(.4,1);gustClock=Math.round(rate*this._rand(.3,.8));}
   if(gravelClock--<=0){gravelTarget=this._rand(.3,1);gravelClock=Math.round(rate*this._rand(.2,.5));}
   gust+=(target-gust)*gustSmooth;gravel+=(gravelTarget-gravel)*gravelSmooth;
   const bass=Math.tanh(data[n]*bassScale*.7),grain=Math.tanh(body[n]*bodyScale*.5);
   const attack=1-Math.exp(-time/.16),decay=Math.pow(Math.max(0,1-time/d),.68);
   const final=clamp((d-time)/.18,0,1);
   data[n]=(.9*bass*gust+.1*grain*gravel)*attack*decay*final;
  }
  data[0]=0;data[count-1]=0;
  const source=c.createBufferSource(),gain=c.createGain(),filter=c.createBiquadFilter();source.buffer=buffer;gain.gain.value=.7;
  filter.type='lowpass';filter.frequency.value=230;filter.Q.value=.5;
  source.connect(filter);filter.connect(gain);gain.connect(this.buses.game);this._track(source,[source,filter,gain],'game',c.currentTime+d);source.start();source.stop(c.currentTime+d+.01);
 }
 _blast(gameId,large=false){
  const variation=gameId==='tanks'?this._rand(.94,1.06):this._rand(.92,1.08);
  if(gameId==='tanks'){
   // Soft distant thunder: no bright crack or broadband impact hiss.
   this._tankRumble(variation);
   return;
  }
  // Other games retain their shorter burst and low debris tail.
  this._noise('game',.065,.20,{frequency:2300*variation,to:1100,type:'bandpass',q:.55,hold:.012});
  this._noise('game',large?.95:.5,.34,{frequency:gameId==='lander'?760:1100,to:160,attack:.008,hold:large?.075:.03});
  this._noise('game',large?1.15:.65,.26,{when:.018,frequency:300,to:85,attack:.025,hold:.06});
 }
 keyDown(key=''){
  if(!this._ready('keyboard')){if(this.options.keyboardVolume>0)this._queueEvent({kind:'key',key});return;}
  const weight=/Space|Enter|action/i.test(key)?1.15:1,variation=this._rand(.91,1.09),level=this._rand(.085,.115)*weight*.5;
  this._noise('keyboard',this._rand(.022,.037),level,{frequency:this._rand(900,1300),type:'lowpass',q:.5,attack:.006});
  this._tone('keyboard',this._rand(175,240),this._rand(.045,.065),level*.6,{to:145*variation,type:'triangle',cutoff:600,attack:.008});
  this._noise('keyboard',.018,level*.24,{when:this._rand(.009,.016),frequency:650,type:'lowpass',attack:.004});
 }
 _startHum(){
  if(!this.ctx||this.ctx.state!=='running'||this.hidden||!this.powered||this.loops.length)return;
  const c=this.ctx;
  for(const [frequency,amplitude] of [[60,.012],[120,.005],[15720,.0014]]){
   const osc=c.createOscillator(),gain=c.createGain();osc.frequency.value=Math.min(frequency,c.sampleRate*.42);gain.gain.setValueAtTime(0,c.currentTime);gain.gain.linearRampToValueAtTime(amplitude,c.currentTime+.6);osc.connect(gain);gain.connect(this.buses.monitor);osc.start();this.loops.push({osc,gain});
  }
 }
 _stopHum(){
  for(const {osc,gain} of this.loops){try{gain.gain.cancelScheduledValues(this.ctx.currentTime);gain.gain.setTargetAtTime(0,this.ctx.currentTime,.035);osc.stop(this.ctx.currentTime+.18);osc.onended=()=>{osc.disconnect();gain.disconnect();};}catch{}}
  this.loops=[];
 }
 powerOn(){
  this.powered=true;this._pendingPower='on';this._pendingEvents=[];this._stopTag('monitor');this._stopHum();this._flushPending();
 }
 powerOff(){
  this.powered=false;this._pendingPower='off';this._pendingEvents=[];this.setScene(null,false);this._stopHum();this._stopTag('monitor');this._flushPending();
 }
 // Damped mechanical modes approximate a cabinet/yoke relaxing as its field
 // collapses. A finite attack avoids the old broadband snap; close low modes
 // beat gently, while a small rapidly damped frequency perturbation supplies
 // the spring-like texture. This is synthesized, not audio copied from a clip.
 _powerResonance(starting=false){
  if(!this._ready('monitor'))return;
  const c=this.ctx,d=starting?.8:1.55,count=Math.ceil(c.sampleRate*d);
  const buffer=c.createBuffer(1,count,c.sampleRate),data=buffer.getChannelData(0);
  const variation=1,modes=[[54,.07,.52],[128,.16,.48],[143,.13,.55],[164,.11,.43],[326,.055,.28]];
  // Dephased modes and a slow onset avoid a coherent low-frequency drum hit.
  const phase=[0,1.7,4.2,2.8,5.1];
  for(let n=0;n<count;n++){
   const t=n/c.sampleRate,attack=(1-Math.exp(-t/.075))**2,release=Math.min(1,Math.max(0,(d-t)/.12));
   let sample=0;
   for(let k=0;k<modes.length;k++){
    const [f,weight,decay]=modes[k];
    const settle=1+.007*Math.exp(-t/.35)*Math.cos(2*Math.PI*8*t);
    phase[k]+=2*Math.PI*f*variation*(starting?1.13:1)*settle/c.sampleRate;
    sample+=weight*Math.sin(phase[k])*Math.exp(-t/(decay*(starting?.65:1)));
   }
   data[n]=sample*attack*release;
  }
  const source=c.createBufferSource(),gain=c.createGain();source.buffer=buffer;gain.gain.value=(starting?.075:.12)*POWER_GAIN;
  source.connect(gain);gain.connect(this.buses.monitor);this._track(source,[source,gain],'monitor',c.currentTime+d);source.start();source.stop(c.currentTime+d+.01);
 }
 _playPowerOn(){
  this._powerResonance(true);
  this._noise('monitor',.07,.035*POWER_GAIN,{frequency:650,attack:.012});
  this._tone('monitor',58,1.55,.055*POWER_GAIN,{to:60,type:'sine',attack:.055});
  this._tone('monitor',116,1.2,.022*POWER_GAIN,{to:120,type:'triangle',cutoff:420,attack:.045});
  this._noise('monitor',1.1,.055*POWER_GAIN,{when:.025,frequency:380,attack:.06});
  this._tone('monitor',14800,1.85,.006*POWER_GAIN,{when:.08,to:15720,attack:.15});
  this._startHum();
 }
 _playPowerOff(){
  this._powerResonance(false);
  this._noise('monitor',.85,.025*POWER_GAIN,{when:.015,frequency:420,to:90,attack:.035,roll:.25,tail:.08});
  // Flyback drive fades out; it does not sweep down through the audible band.
  this._tone('monitor',15720,.24,.0035*POWER_GAIN,{to:15180,attack:.018});
 }
 setScene(gameId=null,active=true){
  if(gameId!==this.scene||!active)this._pendingEvents=this._pendingEvents.filter(event=>event.kind!=='game');
  if(gameId!==this.scene){this._stopTag('music');this._stopTag('game');this._stopContinuous();this.note=0;this.beat=0;this.nextNote=this.ctx?.currentTime||0;this.lastBlast=null;this.lastStatus=null;this.marchStep=0;this.beatClock=0;this.beatStep=0;this.scene=gameId;}
  if(this.active&&!active){this._stopTag('music');this._stopTag('game');this._stopContinuous();}
  this.active=Boolean(active&&gameId&&!this.hidden);
 }
 gameSound(gameId,event){
  if(!this._ready('game')){if(this.options.gameVolume>0&&event!=='march')this._queueEvent({kind:'game',gameId,event});return;}
  const now=this.ctx.currentTime,key=gameId+':'+event;
  if(now-(this.lastEvent.get(key)??-Infinity)<.025)return;this.lastEvent.set(key,now);
  const tone=(f,d,a=.10,o={})=>this._tone('game',f,d,a,o);
  if(gameId==='invaders'&&event==='march'){
   // One pulse per rack movement. Four descending notes, not a free-running beat.
   const step=this.marchStep++%4,frequency=[62.4,53.6,50.1,46.2][step],duty=[.676,.721,.740,.760][step];
   tone(frequency,.073,.19,{type:'square',duty,cutoff:340,attack:.001,hold:.058});return;
  }
  if(event==='start'||event==='clear'){
   this.marchStep=0;this.beatClock=.2;this.beatStep=0;
   if(event==='start'){tone(440,.045,.055,{type:'square',cutoff:1500});return;}
   const root=gameId==='tetris'?660:330;
   [1,1.25,1.5,2].forEach((ratio,i)=>tone(root*ratio,.12,.095,{when:i*.07,type:'square',cutoff:2100}));return;
  }
  if(gameId==='pong'){
   const [f,d]=event==='hit'?[480,.065]:event==='tick'?[240,.045]:[120,.24];
   tone(f,d,.12,{type:'square',cutoff:1900,hold:d*.7});return;
  }
  if(gameId==='breakout'){
   const [f,d]=event==='hit'?[740,.045]:event==='tick'?[370,.04]:event==='lose'?[138,.28]:[920,.05];
   tone(f,d,.10,{type:'square',cutoff:2600,hold:d*.6});return;
  }
  if(gameId==='tetris'){
   if(event==='lose'){[330,294,247,165].forEach((f,i)=>tone(f,.18,.10,{when:i*.13,type:'square',cutoff:1500}));}
   else if(event==='hit'){tone(155,.06,.12,{type:'square',cutoff:850});this._noise('game',.045,.075,{frequency:1800});}
   else tone(event==='tick'?880:1046,.03,.065,{type:'square',cutoff:2200});return;
  }
  if(gameId==='snake'){
   if(event==='lose'){[392,294,196,98].forEach((f,i)=>tone(f,.11,.11,{when:i*.075,type:'square',cutoff:1600}));}
   else{tone(880,.065,.09,{to:1175,type:'square',cutoff:2300});tone(1320,.07,.075,{when:.045,to:1760,type:'square',cutoff:2800});}return;
  }
  if(event==='shoot'){
   if(gameId==='tanks'){
    this._noise('game',.045,.32,{frequency:2600,type:'bandpass',q:.55,hold:.008});
    this._noise('game',.36,.38,{frequency:1000,to:180,attack:.003,hold:.02});
    this._noise('game',.65,.22,{when:.018,frequency:280,to:80,attack:.018,hold:.035});
    tone(72,.14,.13,{to:48,type:'sine'});
   }else if(gameId==='invaders'){
    tone(1150,.18,.115,{to:120,type:'sawtooth',cutoff:2300,attack:.001,hold:.015});
    this._noise('game',.07,.065,{frequency:2400,type:'bandpass'});
   }else tone(1650,.095,.12,{to:380,type:'square',cutoff:2600,attack:.001});
  }else if(event==='lose'||event==='hit'){
   if(gameId==='invaders'&&event==='hit'){
    tone(1050,.09,.10,{to:155,type:'square',cutoff:1700,attack:.001});this._noise('game',.085,.12,{frequency:1800,to:450});
   }else this._blast(gameId,event==='lose'||gameId==='tanks');
  }else if(event==='score'){
   if(gameId==='invaders'){for(let n=0;n<5;n++)tone(n%2?900:1650,.065,.085,{when:n*.045,to:n%2?650:1200,type:'square',cutoff:2100});}
   else if(gameId==='lander'){[750,1000,1500].forEach((f,i)=>tone(f,.13,.09,{when:i*.10,type:'square',cutoff:2500}));}
   else [440,660,880].forEach((f,i)=>tone(f,.1,.08,{when:i*.065,type:'triangle'}));
  }else if(event==='tick')tone(330,.025,.06,{type:'square',cutoff:1200});
 }
 _music(){
  if(!this._ready('music')||!this.active||this.scene!=='tetris')return;
  const now=this.ctx.currentTime;if(this.nextNote<now)this.nextNote=now+.02;
  let guard=0;
  while(this.nextNote<now+.16&&guard++<4){
   const [pitch,beats]=MELODY[this.note],duration=beats*60/132,offset=this.nextNote-now;
   this._tone('music',hz(pitch),duration*.82,.13,{when:offset,type:'square',cutoff:1800,tag:'music',attack:.008});
   // Sparse tonic/fifth accompaniment, separate from the melody's timbre.
   if(Math.round(this.beat)%2===0)this._tone('music',hz(Math.floor(this.beat/4)%2?40:45),Math.min(.65,duration*.9),.11,{when:offset,type:'triangle',tag:'music',attack:.012});
   this.nextNote+=duration;this.beat+=beats;this.note=(this.note+1)%MELODY.length;if(this.note===0)this.beat=0;
  }
 }
 update(game,active,dt=1/60){
  const running=Boolean(active&&game&&game.status==='playing'&&!this.hidden);
  this.setScene(game?.id||null,Boolean(active&&game&&!this.hidden));
  if(running)this._music();else this._stopTag('music');
  if(active&&game?.id==='tanks'&&game.blast&&game.blast!==this.lastBlast){this.lastBlast=game.blast;this.gameSound('tanks','hit');}
  if(!running||!this._ready('game')){this._stopContinuous();return;}
  if(game.thrust&&['lander','asteroids'].includes(game.id))this._thrust(game.id);else this._stopContinuous('thrust');
  if(game.id==='invaders'&&game.ufo?.active)this._saucer();else this._stopContinuous('saucer');
  dt=clamp(Number.isFinite(dt)?dt:0,0,.1);
  if(game.id==='asteroids'){
   this.beatClock-=dt;
   if(this.beatClock<=0){this.beatClock=clamp(.24+(game.rocks?.length||1)*.035,.27,.72);this._tone('game',this.beatStep++%2?81:104,.075,.055,{type:'triangle',cutoff:500,hold:.025});}
  }
 }
 setHidden(hidden){
  hidden=Boolean(hidden);if(hidden===this.hidden)return;
  this.hidden=hidden;
  if(this.hidden){this.active=false;this._pendingPower=null;this._pendingEvents=[];this._stopHum();this._stopContinuous(null,true);for(const v of [...this.voices])this._stopVoice(v);}
  else{this.nextNote=this.ctx?.currentTime||0;if(this.ctx)void this.unlock();}
 }
 destroy(){this.powered=false;this.hidden=true;this._pendingPower=null;this._pendingEvents=[];this._stopHum();this._stopContinuous(null,true);for(const v of [...this.voices])this._stopVoice(v);try{this.ctx?.close()?.catch?.(()=>{});}catch{}}
}

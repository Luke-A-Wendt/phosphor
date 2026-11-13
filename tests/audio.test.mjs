import test from 'node:test';
import assert from 'node:assert/strict';
import {AudioEngine} from '../audio.js';

class Param {
 constructor(value=0){this.value=value;this.events=[];}
 setValueAtTime(v,t){assert.ok(Number.isFinite(v)&&Number.isFinite(t));this.value=v;this.events.push(['set',v,t]);}
 linearRampToValueAtTime(v,t){assert.ok(Number.isFinite(v)&&Number.isFinite(t));this.value=v;this.events.push(['linear',v,t]);}
 exponentialRampToValueAtTime(v,t){assert.ok(v>0&&Number.isFinite(t));this.value=v;this.events.push(['exponential',v,t]);}
 setTargetAtTime(v,t,d){assert.ok(Number.isFinite(v)&&Number.isFinite(t)&&d>0);this.value=v;this.events.push(['target',v,t,d]);}
 cancelScheduledValues(t){this.events.push(['cancel',t]);}
}
class Node {
 constructor(kind){this.kind=kind;this.connections=[];this.disconnected=false;this.frequency=new Param();this.gain=new Param(1);this.Q=new Param();this.threshold=new Param();this.knee=new Param();this.ratio=new Param();this.attack=new Param();this.release=new Param();}
 connect(n){this.connections.push(n);}
 disconnect(){this.disconnected=true;}
 start(t=0){this.started=t;}
 stop(t=0){this.stopped=t;}
 setPeriodicWave(wave){this.wave=wave;this.type='custom';}
}
class Context {
 constructor(){this.currentTime=0;this.sampleRate=24000;this.state='running';this.nodes=[];this.buffers=[];this.destination={};}
 node(kind){const n=new Node(kind);this.nodes.push(n);return n;}
 createPeriodicWave(real,imag){assert.ok([...real,...imag].every(Number.isFinite));return {real,imag};}
 createGain(){return this.node('gain');}createOscillator(){return this.node('osc');}createBiquadFilter(){return this.node('filter');}createBufferSource(){return this.node('noise');}createDynamicsCompressor(){return this.node('compressor');}
 createBuffer(ch,count,rate){const data=new Float32Array(count);const b={getChannelData:()=>data,duration:count/rate};this.buffers.push(b);return b;}
 resume(){this.state='running';return Promise.resolve();}close(){this.state='closed';return Promise.resolve();}
 finishVoices(){for(const n of this.nodes)if(n.stopped!==undefined&&n.stopped<=this.currentTime)n.onended?.();}
}
function setup(random=()=>.5){const c=new Context(),audio=new AudioEngine({contextFactory:()=>c,random});audio.unlock();return {c,audio};}

test('audio is optional, gesture-created, and uses independent conservative volume buses',async()=>{
 let created=0;const c=new Context();c.state='suspended';const audio=new AudioEngine({contextFactory:()=>{created++;return c;}});
 audio.keyDown();audio.powerOn();assert.equal(created,0);assert.equal(await audio.unlock(),true);assert.equal(c.state,'running');assert.equal(created,1);
 assert.equal(audio.master.gain.value,.38);assert.equal(Object.keys(audio.buses).length,4);assert.equal(audio.limiter.ratio.value,6);
 audio.setOptions({musicVolume:0,gameVolume:100,keyboardVolume:-2,monitorVolume:NaN});assert.equal(audio.options.musicVolume,0);assert.equal(audio.options.gameVolume,1);assert.equal(audio.options.keyboardVolume,0);assert.equal(audio.options.monitorVolume,1);
 assert.equal(audio.buses.music.gain.value,0);assert.equal(await new AudioEngine({contextFactory:()=>null}).unlock(),false);assert.equal(await new AudioEngine({contextFactory:()=>{throw Error();}}).unlock(),false);
});

test('each key has bounded randomized pitch, timing and noise with finite envelopes',()=>{
 let step=0;const {audio,c}=setup(()=>((step++*17)%101)/101);
 audio.keyDown('ArrowUp');const first=c.nodes.filter(n=>n.kind==='osc')[0].frequency.events[0][1];
 audio.keyDown('Enter');const second=c.nodes.filter(n=>n.kind==='osc')[1].frequency.events[0][1];assert.notEqual(first,second);
 assert.ok(first>=175&&first<=240&&second>=175&&second<=240);
 for(const b of c.buffers){const d=b.getChannelData(0);assert.ok(d.every(x=>Number.isFinite(x)&&Math.abs(x)<=1));}
 const count=audio.voices.size;audio.setOptions({keyboardVolume:0});audio.keyDown('ArrowUp');assert.equal(audio.voices.size,count);
 c.currentTime=1;c.finishVoices();assert.equal(audio.voices.size,0);
});

test('monitor power cycles create and dispose hum, preserving a brief off tail',()=>{
 const {audio,c}=setup();audio.powerOn();assert.equal(audio.loops.length,3);assert.equal(audio.powered,true);
 audio.powerOff();assert.equal(audio.loops.length,0);assert.equal(audio.powered,false);assert.ok(audio.voices.size>0);
 for(const v of audio.voices)assert.equal(v.tag,'monitor');
 c.currentTime=2;c.finishVoices();assert.equal(audio.voices.size,0);
 audio.powerOn();audio.setHidden(true);assert.equal(audio.voices.size,0);assert.equal(audio.loops.length,0);audio.setHidden(false);assert.equal(audio.loops.length,3);
 audio.destroy();assert.equal(audio.loops.length,0);assert.equal(audio.voices.size,0);
});

test('music schedules only for active Tetris and stops on pause, mute, scene exit or hidden page',()=>{
 const {audio,c}=setup();const game={id:'tetris',status:'playing'};
 audio.update(game,true,.016);assert.ok([...audio.voices].some(v=>v.tag==='music'));
 audio.update(game,false,.016);assert.ok(![...audio.voices].some(v=>v.tag==='music'));
 c.currentTime=1;audio.update(game,true,.016);assert.ok([...audio.voices].some(v=>v.tag==='music'));
 audio.setOptions({musicVolume:0});assert.ok(![...audio.voices].some(v=>v.tag==='music'));audio.setOptions({musicVolume:.18});
 c.currentTime=3;audio.update(game,true,.016);audio.setScene('pong');assert.ok(![...audio.voices].some(v=>v.tag==='music'));
 audio.update(game,true,.016);audio.setHidden(true);assert.equal(audio.voices.size,0);
});

test('game effects differ across games, keep terminal tails, and bound polyphony',()=>{
 const {audio,c}=setup();
 for(const id of ['tetris','pong','breakout','asteroids','invaders','snake','lander','tanks']){
  for(const event of ['start','tick','hit','shoot','score','clear','lose']){c.currentTime+=.03;audio.gameSound(id,event);}
 }
 assert.ok(c.nodes.some(n=>n.kind==='noise'));assert.ok(c.nodes.some(n=>n.kind==='osc'));assert.ok(audio.voices.size<=64);
 audio.setScene('tetris',true);audio.gameSound('tetris','lose');audio.update({id:'tetris',status:'over'},true,.016);assert.ok([...audio.voices].some(v=>v.tag==='game'),'loss sound is not cut off by terminal game status');
 audio.setScene('tanks',true);const blast={};audio.update({id:'tanks',status:'won',blast},true,.016);assert.ok([...audio.voices].some(v=>v.tag==='game'),'winning impact still sounds');
 const count=audio.voices.size;audio.update({id:'tanks',status:'won',blast},true,.016);assert.equal(audio.voices.size,count,'same blast does not repeat');
 audio.setHidden(true);assert.equal(audio.voices.size,0);
});

test('three interrupted power cycles resume and play a fresh on/off envelope every time',async()=>{
 const {audio,c}=setup();let resumes=0;
 c.resume=async()=>{resumes++;c.state='running';c.onstatechange?.();};
 for(let cycle=0;cycle<3;cycle++){
  c.state=cycle%2?'interrupted':'suspended';
  const before=c.nodes.length;
  audio.powerOn();assert.equal(c.nodes.length,before,'no one-shot is scheduled on a stopped clock');
  assert.equal(await audio.unlock(),true);
  assert.equal(audio.loops.length,3);assert.ok([...audio.voices].some(v=>v.tag==='monitor'));
  c.currentTime+=2.2;c.finishVoices();const offStart=c.nodes.length;audio.powerOff();
  assert.ok(c.nodes.length>offStart);assert.ok([...audio.voices].some(v=>v.tag==='monitor'));assert.equal(audio.loops.length,0);
  c.currentTime+=1.8;c.finishVoices();assert.equal(audio.voices.size,0);
 }
 assert.equal(resumes,3);
});

test('a delayed resume plays only the latest power transition and preserves a queued game action',async()=>{
 const {audio,c}=setup();c.state='interrupted';let resolveResume;
 c.resume=()=>new Promise(resolve=>{resolveResume=()=>{c.state='running';resolve();};});
 const pending=audio.unlock();audio.powerOn();audio.powerOff();
 assert.equal(audio.voices.size,0);assert.equal(audio._pendingPower,'off');
 resolveResume();assert.equal(await pending,true);assert.equal(audio.powered,false);assert.equal(audio.loops.length,0);
 assert.ok(audio.voices.size>0);assert.ok([...audio.voices].every(v=>v.end<c.currentTime+1.8),'startup cannot replay after cancelled warmup');
 c.currentTime=2;c.finishVoices();c.state='suspended';
 const gameResume=audio.unlock();audio.setScene('tanks',true);audio.gameSound('tanks','shoot');assert.equal(audio.voices.size,0);
 resolveResume();await gameResume;assert.ok([...audio.voices].some(v=>v.tag==='game'));
});

test('closed contexts are replaced and mute survives rebuilding',async()=>{
 const first=new Context(),second=new Context();let creations=0;
 const audio=new AudioEngine({contextFactory:()=>creations++===0?first:second});
 await audio.unlock();audio.powerOn();audio.powerOff();first.state='closed';
 audio.setOptions({monitorVolume:0});audio.powerOn();await audio.unlock();
 assert.equal(audio.ctx,second);assert.equal(creations,2);assert.equal(audio.options.monitorVolume,0);
 assert.equal(second.nodes.filter(n=>n.kind==='noise').length,0);
 assert.ok([...audio.voices].every(v=>v.tag!=='monitor'));
 assert.equal(first.onstatechange,null);
 audio.powerOff();audio.setOptions({monitorVolume:1});audio.powerOn();assert.ok([...audio.voices].some(v=>v.tag==='monitor'));
});

test('lander thrust and crash plus tank fire/impact include audible midband energy and respect mute',()=>{
 const {audio,c}=setup();audio.setScene('lander',true);
 audio.update({id:'lander',status:'playing',thrust:true},true,.1);
 assert.ok(c.nodes.some(n=>n.kind==='filter'&&n.type==='bandpass'&&n.frequency.value>=1000),'thrust is not only bass inaudible on phone speakers');
 const before=audio.voices.size;audio.gameSound('lander','lose');assert.ok(audio.voices.size>before);
 audio.setScene('tanks',true);audio.gameSound('tanks','shoot');assert.ok([...audio.voices].some(v=>v.tag==='game'));
 const fire=c.nodes.length;audio.update({id:'tanks',status:'playing',blast:{}},true,.016);assert.ok(c.nodes.length>fire);
 audio.setOptions({gameVolume:0});const muted=c.nodes.length;
 audio.gameSound('tanks','shoot');audio.update({id:'lander',status:'playing',thrust:true},true,.1);assert.equal(c.nodes.length,muted);
});

test('queued game sounds are discarded on menu entry and pause, retaining keyboard feedback',async()=>{
 for(const next of [null,'tanks']){
  const {audio,c}=setup();audio.setScene('tanks',true);c.state='interrupted';let finish;
  c.resume=()=>new Promise(resolve=>{finish=()=>{c.state='running';resolve();};});
  const pending=audio.unlock();audio.gameSound('tanks','shoot');audio.keyDown('Escape');
  assert.equal(audio._pendingEvents.length,2);audio.setScene(next,false);
  assert.deepEqual(audio._pendingEvents.map(e=>e.kind),['key']);
  finish();await pending;
  assert.ok([...audio.voices].some(v=>v.tag==='keyboard'));
  assert.ok([...audio.voices].every(v=>v.tag!=='game'));
 }
});

test('a later gesture retries a stuck resume without replaying queued power or game sounds',async()=>{
 const {audio,c}=setup();c.state='interrupted';const finishes=[];let calls=0;
 c.resume=()=>{calls++;return new Promise(resolve=>{finishes.push(()=>{c.state='running';resolve();});});};
 const stalled=audio.unlock();audio.powerOn();
 const retry=audio.unlock();assert.equal(calls,2,'pending resume does not block the next gesture');
 finishes[1]();await retry;const count=c.nodes.length;assert.equal(audio.loops.length,3);
 finishes[0]();await stalled;assert.equal(c.nodes.length,count,'late completion cannot replay startup');
});


test('a held thruster is one sustained noise source, with release, reuse and a distinct timbre',()=>{
 const {audio,c}=setup();const game={id:'lander',status:'playing',thrust:true};
 audio.update(game,true);const first=audio.continuous.get('thrust');
 assert.equal(first.source.loop,true);assert.ok(first.gain.connections.includes(audio.buses.game));
 const buffer=first.source.buffer;assert.ok(buffer.getChannelData(0).some(v=>v===1));assert.ok(buffer.getChannelData(0).some(v=>v===-1));
 const count=c.nodes.length;
 for(let n=0;n<120;n++){c.currentTime+=1/60;audio.update(game,true,1/60);}
 assert.equal(audio.continuous.get('thrust'),first);assert.equal(c.nodes.length,count,'no repeated puffs or oscillators while holding thrust');
 game.thrust=false;audio.update(game,true);assert.equal(audio.continuous.size,0);
 assert.ok(first.source.stopped>c.currentTime&&first.source.stopped<c.currentTime+.06,'short smooth release');
 c.currentTime+=.1;c.finishVoices();assert.ok(first.nodes.every(n=>n.disconnected));assert.equal(audio.retiring.size,0);
 game.thrust=true;audio.update(game,true);assert.notEqual(audio.continuous.get('thrust').source,first.source);assert.equal(audio.continuous.get('thrust').source.buffer,buffer,'noise data is reused across burns');
 audio.update({id:'asteroids',status:'playing',thrust:true,rocks:[{}]},true);const other=audio.continuous.get('thrust');
 assert.notEqual(other.nodes.find(n=>n.kind==='filter'&&n.type==='lowpass').frequency.value,first.nodes.find(n=>n.kind==='filter'&&n.type==='lowpass').frequency.value);
});

test('continuous game sounds stop on mute, pause, game exit, terminal state, hidden page and disposal',()=>{
 for(const stop of [a=>a.setOptions({gameVolume:0}),a=>a.update({id:'lander',status:'playing',thrust:true},false),a=>a.setScene(null,false),a=>a.update({id:'lander',status:'over',thrust:true},true),a=>a.setHidden(true),a=>a.destroy()]){
  const {audio,c}=setup();audio.update({id:'lander',status:'playing',thrust:true},true);const voice=audio.continuous.get('thrust');
  stop(audio);assert.equal(audio.continuous.size,0);assert.ok(voice.source.stopped<=c.currentTime+.06);
  c.currentTime+=.1;c.finishVoices();assert.ok(voice.nodes.every(n=>n.disconnected));
 }
 const {audio}=setup();audio.update({id:'lander',status:'playing',thrust:true},true);const voice=audio.continuous.get('thrust');
 audio.update({id:'lander',status:'playing',thrust:false},true);assert.equal(audio.retiring.size,1);audio.setHidden(true);
 assert.equal(audio.retiring.size,0);assert.ok(voice.nodes.every(n=>n.disconnected),'hiding also disposes a release already in flight');
});

test('Invaders four pulse voices follow events only, rotate and reset with the wave',()=>{
 const {audio,c}=setup();audio.setScene('invaders',true);
 for(let n=0;n<8;n++){c.currentTime+=.1;audio.gameSound('invaders','march');}
 const pulses=c.nodes.filter(n=>n.kind==='osc');
 assert.deepEqual(pulses.map(n=>n.frequency.events[0][1]),[62.4,53.6,50.1,46.2,62.4,53.6,50.1,46.2]);
 assert.ok(pulses.every(n=>n.type==='custom'&&n.stopped-n.started<.09),'gated low pulses retain asymmetric circuit harmonics');
 const count=c.nodes.length;for(let n=0;n<100;n++){c.currentTime+=.016;audio.update({id:'invaders',status:'playing'},true,.016);}
 assert.equal(c.nodes.length,count,'no free-running fleet timer');
 audio.gameSound('invaders','clear');c.currentTime+=.1;audio.gameSound('invaders','march');
 assert.equal(c.nodes.filter(n=>n.kind==='osc').at(-1).frequency.events[0][1],62.4);
 c.state='interrupted';audio.gameSound('invaders','march');assert.equal(audio._pendingEvents.length,0,'old movement beats cannot bunch up after resume');
});

test('the UFO has one continuous modulated voice only while present',()=>{
 const {audio,c}=setup();const game={id:'invaders',status:'playing',ufo:{active:true}};
 audio.update(game,true);const voice=audio.continuous.get('saucer');assert.ok(voice);assert.equal(voice.aux.length,1);
 for(let n=0;n<30;n++)audio.update(game,true);assert.equal(audio.continuous.get('saucer'),voice);
 game.ufo.active=false;audio.update(game,true);assert.equal(audio.continuous.size,0);assert.equal(voice.aux[0].stopped,voice.source.stopped);
 c.currentTime+=.1;c.finishVoices();assert.ok(voice.nodes.every(n=>n.disconnected));
});

test('artillery uses pressure, crack and debris noise rather than a pitched laser swoop',()=>{
 const {audio,c}=setup();audio.gameSound('tanks','shoot');
 const fireNoise=c.nodes.filter(n=>n.kind==='noise');assert.ok(fireNoise.length>=3);
 const tones=c.nodes.filter(n=>n.kind==='osc');assert.ok(tones.every(n=>n.type==='sine'&&n.frequency.events[0][1]<100));
 const before=c.nodes.length;c.currentTime+=.5;audio.gameSound('tanks','hit');
 const impact=c.nodes.slice(before);assert.ok(impact.filter(n=>n.kind==='noise').some(n=>n.stopped-n.started>1),'debris/rumble outlasts the initial pressure crack');
 assert.ok(impact.some(n=>n.kind==='filter'&&n.type==='bandpass'));assert.ok(impact.some(n=>n.kind==='filter'&&n.type==='lowpass'));
});

test('Pong paddle, wall and score cues are distinct fixed tones',()=>{
 const {audio,c}=setup();for(const event of ['hit','tick','score']){audio.gameSound('pong',event);c.currentTime+=.3;}
 const voices=c.nodes.filter(n=>n.kind==='osc');assert.deepEqual(voices.map(n=>n.frequency.events[0][1]),[480,240,120]);
 assert.ok(voices.every(n=>n.frequency.events[0][1]===n.frequency.events[1][1]));
});

test('repeated visible gestures do not rewind or overlap the Tetris music scheduler',()=>{
 const {audio,c}=setup();const game={id:'tetris',status:'playing'};audio.update(game,true);const next=audio.nextNote,count=c.nodes.length;
 for(let n=0;n<12;n++){audio.setHidden(false);audio.unlock();audio.update(game,true);}
 assert.equal(audio.nextNote,next);assert.equal(c.nodes.length,count);
 audio.setHidden(true);c.currentTime+=1;audio.setHidden(false);assert.equal(audio.nextNote,c.currentTime);
});


test('both sustained thrusters are softened without changing their distinct filtering or volume defaults',()=>{
 for(const [id,cutoff] of [['lander',560],['asteroids',200]]){
  const {audio}=setup();audio.update({id,status:'playing',thrust:true,rocks:[{}]},true);
  const voice=audio.continuous.get('thrust');assert.equal(voice.level,id==='asteroids'?.48:.8);
  assert.equal(voice.nodes.find(n=>n.kind==='filter'&&n.type==='lowpass').frequency.value,cutoff);
  assert.equal(audio.options.gameVolume,1);assert.equal(audio.buses.game.gain.value,1);
 }
});

test('Tanks impacts carry a broad noise roar and a longer rolling tail without a pitched layer',()=>{
 let step=1;const {audio,c}=setup(()=>{step=(step*16807)%2147483647;return step/2147483647;});
 audio.setScene('tanks',true);const blast={};audio.update({id:'tanks',status:'won',blast},true);
 const voices=[...audio.voices];assert.ok(voices.length>=3);assert.ok(voices.every(v=>v.source.kind==='noise'));
 const ends=voices.map(v=>v.end);assert.ok(Math.max(...ends)>3.75&&Math.max(...ends)<4.3);
 assert.ok(c.nodes.some(n=>n.kind==='filter'&&n.type==='lowpass'&&n.frequency.events[0][1]>2400),'impact has broadband body');
 const rumble=voices.find(v=>v.source.buffer?.duration>3.5);assert.ok(rumble,'impact includes the long normalized pressure tail');
 const data=rumble.source.buffer.getChannelData(0);
 const rms=(start,end)=>{const block=data.subarray(start*c.sampleRate,end*c.sampleRate);return Math.sqrt(block.reduce((sum,x)=>sum+x*x,0)/block.length);};
 assert.equal(data[0],0);assert.ok(rms(2,2.5)>.10,'late rumble keeps meaningful energy instead of filtering it away');
 assert.ok(rms(3,3.4)>.04,'rumble persists through the fourth second');
 const highpass=new Float32Array(data.length),alpha=1-Math.exp(-2*Math.PI*180/c.sampleRate);let low=0;
 for(let n=0;n<data.length;n++){low+=alpha*(data[n]-low);highpass[n]=data[n]-low;}
 const phone=highpass.subarray(2*c.sampleRate,3*c.sampleRate);
 assert.ok(Math.sqrt(phone.reduce((sum,x)=>sum+x*x,0)/phone.length)>.055,'audible gravel survives phone-speaker bass rolloff');
 assert.ok(c.buffers.every(b=>b.getChannelData(0).every(v=>Number.isFinite(v)&&Math.abs(v)<=1)));
 c.currentTime=2.5;c.finishVoices();const tail=[...audio.voices];assert.ok(tail.includes(rumble),'gravelly body and bass remain after the initial roar fades');
 const count=c.nodes.length;audio.update({id:'tanks',status:'won',blast},true);assert.equal(c.nodes.length,count,'winning impact is not retriggered');
 audio.update({id:'tanks',status:'playing',blast:null,turn:1},true);assert.ok(audio.voices.has(rumble),'opponent turn does not cut off the tail');
 audio.setScene('tanks',false);assert.equal(audio.voices.size,0);assert.ok(tail.every(v=>v.nodes.every(n=>n.disconnected)),'pause disposes the longer tail');
 c.currentTime=5;audio.setScene('tanks',true);audio.gameSound('tanks','hit');assert.notEqual(Math.max(...[...audio.voices].map(v=>v.end-c.currentTime)),Math.max(...ends),'successive impacts vary slightly');
 audio.setOptions({gameVolume:0});assert.equal(audio.voices.size,0);
});


test('power-off has a finite soft low resonance with an audible decaying tail and no snap',()=>{
 let seed=24;const {audio,c}=setup(()=>{seed=(seed*16807)%2147483647;return seed/2147483647;});
 audio.powerOn();const previous=[...audio.voices];audio.powerOff();
 assert.ok(previous.every(v=>v.nodes.every(n=>n.disconnected)),'shutdown replaces startup voices');
 const buffer=[...audio.voices].find(v=>v.source.buffer?.duration>1.4)?.source.buffer;
 assert.ok(buffer,'mechanical ring continues beyond the old short off snap');
 const data=buffer.getChannelData(0),rms=(a,b)=>{const s=data.subarray(a*c.sampleRate,b*c.sampleRate);return Math.sqrt(s.reduce((n,v)=>n+v*v,0)/s.length);};
 assert.equal(data[0],0);assert.ok(data.every(v=>Number.isFinite(v)&&Math.abs(v)<1));
 assert.ok(rms(0,.004)<rms(.03,.1),'onset ramps rather than snapping');
 assert.ok(rms(.65,.9)>.004,'late low resonances remain present');
 assert.ok(rms(1.25,1.5)<rms(.65,.9),'the tail decays naturally');
 assert.ok([...audio.voices].filter(v=>v.source.kind==='osc').every(v=>v.source.frequency.events[0][1]>10000),'no cartoon low sine swoop');
 c.currentTime=1.8;c.finishVoices();assert.equal(audio.voices.size,0);
 audio.setOptions({monitorVolume:0});audio.powerOn();audio.powerOff();assert.equal(audio.voices.size,0);
});

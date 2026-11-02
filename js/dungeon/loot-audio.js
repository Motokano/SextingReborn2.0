(() => {
  'use strict';
  // Original procedural reveal cues. Timing is independent of world ticks.
  const ranks=['common','uncommon','rare','exceptional','legendary'];
  const scores={
    common:{duration:.65,notes:[[0,1046.5,.18,.28]],chord:[]},
    uncommon:{duration:1.45,notes:[[0,659.25,.18,.48],[.12,783.99,.18,.55],[.25,1046.5,.22,.85]],chord:[]},
    rare:{duration:2.5,notes:[[0,587.33,.17,.7],[.1,880,.16,.8],[.23,1174.66,.18,1],[.37,1396.91,.16,1.15],[.53,1760,.12,1.2]],chord:[293.66,440,698.46]},
    exceptional:{duration:3.6,notes:[[0,587.33,.2,.7],[.09,739.99,.19,.8],[.19,880,.18,.9],[.31,1174.66,.2,1.2],[.44,1479.98,.17,1.4],[.6,1760,.15,1.5],[.78,2349.32,.09,1.6]],chord:[293.66,369.99,440,587.33]},
    legendary:{duration:4.5,notes:[[0,261.63,.23,1.3],[.1,392,.18,1],[.24,523.25,.19,1.1],[.4,659.25,.18,1.2],[.57,783.99,.18,1.3],[.75,1046.5,.2,1.6],[.95,1318.51,.17,1.7],[1.14,1567.98,.15,1.9],[1.32,2093,.12,2.4]],chord:[261.63,329.63,392,523.25]}
  };
  let context,master,muted=false,pending=[],queued=false;
  const active=new Set(),storageKey='corpse-reveal-sound-muted';
  try{muted=localStorage.getItem(storageKey)==='1';}catch{}

  // Also accepts OfflineAudioContext, so the actual synthesized output can be checked.
  function synthesize(ctx,destination,rank,at=ctx.currentTime){
    const score=scores[rank]||scores.common,voices=[],bus=ctx.createGain(),panner=ctx.createStereoPanner();
    bus.gain.value=.64;panner.pan.value=0;bus.connect(panner);panner.connect(destination);
    const end=at+score.duration;
    function tone(freq,start,length,volume,type='sine',pan=0){
      const oscillator=ctx.createOscillator(),gain=ctx.createGain(),stereo=ctx.createStereoPanner();
      oscillator.type=type;oscillator.frequency.value=freq;stereo.pan.value=pan;
      gain.gain.setValueAtTime(0,start);gain.gain.linearRampToValueAtTime(volume,start+.012);
      gain.gain.exponentialRampToValueAtTime(.0001,start+length);
      oscillator.connect(gain);gain.connect(stereo);stereo.connect(bus);
      oscillator.start(start);oscillator.stop(start+length+.02);voices.push(oscillator);
      oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();stereo.disconnect();};
    }
    score.notes.forEach(([offset,freq,volume,length],i)=>{
      tone(freq,at+offset,length,volume,'sine',(i%2?1:-1)*.18);
      tone(freq*2.002,at+offset,length*.46,volume*.14);
      tone(freq*3,at+offset,length*.18,volume*.045);
    });
    score.chord.forEach((freq,i)=>tone(freq,at+.32,score.duration-.4,.033,'triangle',(i%2?1:-1)*.28));
    if(rank==='legendary'){
      // A low ceremonial bell followed by a second resolved chord, not a louder gold cue.
      tone(130.81,at,2.2,.21);tone(130.81*2.76,at,1.3,.045);tone(130.81*5.4,at,.65,.016);
      [523.25,659.25,783.99,1046.5].forEach((freq,i)=>tone(freq,at+1.32,3,.041,'triangle',(i%2?1:-1)*.32));
    }
    if(rank==='rare'||rank==='exceptional'||rank==='legendary'){
      const red=rank==='legendary',high=red||rank==='exceptional';
      tone(red?65.41:high?73.42:146.83,at,red?1.1:.8,red?.27:high?.3:.12);
      // A single soft air burst, filtered away from harsh upper frequencies.
      const length=red?.48:high?.34:.18,buffer=ctx.createBuffer(1,Math.ceil(ctx.sampleRate*length),ctx.sampleRate),data=buffer.getChannelData(0);
      let seed=937;for(let i=0;i<data.length;i++){seed=(seed*16807)%2147483647;data[i]=(seed/2147483647*2-1);}
      const noise=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),gain=ctx.createGain();
      noise.buffer=buffer;filter.type='lowpass';filter.frequency.setValueAtTime(2100,at);filter.frequency.exponentialRampToValueAtTime(350,at+length);
      gain.gain.setValueAtTime(0,at);gain.gain.linearRampToValueAtTime(high?.12:.06,at+.015);gain.gain.exponentialRampToValueAtTime(.0001,at+length);
      noise.connect(filter);filter.connect(gain);gain.connect(bus);noise.start(at);voices.push(noise);
      noise.onended=()=>{noise.disconnect();filter.disconnect();gain.disconnect();};
    }
    let stopped=false;
    return {duration:score.duration,stop(){if(stopped)return;stopped=true;bus.gain.cancelScheduledValues(ctx.currentTime);bus.gain.setTargetAtTime(0,ctx.currentTime,.012);for(const voice of voices){try{voice.stop(ctx.currentTime+.06);}catch{}}},dispose(){bus.disconnect();panner.disconnect();},end};
  }
  function unlock(event){
    if(!event.isTrusted||muted)return;
    try{
      if(!context){
        const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return;
        context=new Audio();master=context.createGain();master.gain.value=.62;
        const limiter=context.createDynamicsCompressor();limiter.threshold.value=-12;limiter.knee.value=12;limiter.ratio.value=5;limiter.attack.value=.003;limiter.release.value=.2;
        master.connect(limiter);limiter.connect(context.destination);
      }
      if(context.state==='suspended')context.resume().catch(()=>{});
    }catch{/* Browsers without audio support still show the reveal. */}
  }
  function request(rank,owner){
    if(muted||document.hidden||!context||context.state!=='running')return;
    pending.push({rank:ranks.includes(rank)?rank:'common',owner});
    if(queued)return (scores[rank]||scores.common).duration*1000;queued=true;
    queueMicrotask(()=>{
      queued=false;const batch=pending;pending=[];
      if(!batch.length||muted||document.hidden||context.state!=='running')return;
      // One resolved cue per simultaneous reveal, including both allocation columns.
      const strongest=batch.reduce((best,item)=>ranks.indexOf(item.rank)>ranks.indexOf(best)?item.rank:best,'common');
      for(const voice of active){voice.stop();}
      const voice=synthesize(context,master,strongest,context.currentTime+.015);voice.owners=new Set(batch.map(item=>item.owner));active.add(voice);
      setTimeout(()=>{voice.dispose();active.delete(voice);},(voice.duration+.15)*1000);
    });
    return (scores[rank]||scores.common).duration*1000;
  }
  function cancel(owner){pending=pending.filter(item=>item.owner!==owner);for(const voice of active)if(voice.owners.has(owner)){voice.owners.delete(owner);if(!voice.owners.size)voice.stop();}}
  function silence(){pending=[];for(const voice of active)voice.stop();}
  function renderButtons(){
    document.querySelectorAll('[data-reveal-sound]').forEach(button=>{
      button.setAttribute('aria-pressed',String(!muted));button.setAttribute('aria-label',muted?'开启揭晓音效':'静音揭晓音效');button.title=muted?'开启音效':'静音';
      button.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4Z"/>'+(muted?'<path d="m16 9 5 6m0-6-5 6"/>':'<path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>')+'</svg>';
    });
  }
  document.addEventListener('pointerdown',unlock,{capture:true});document.addEventListener('keydown',unlock,{capture:true});
  document.addEventListener('click',event=>{
    if(!event.target.closest('[data-reveal-sound]'))return;
    muted=!muted;try{localStorage.setItem(storageKey,muted?'1':'0');}catch{}
    if(muted)silence();else unlock(event);renderButtons();
  });
  document.addEventListener('visibilitychange',()=>{if(document.hidden)silence();});window.addEventListener('pagehide',silence);
  window.LOOT_REVEAL_AUDIO={request,cancel,synthesize,renderButtons,duration:rank=>(scores[rank]||scores.common).duration*1000};
  renderButtons();
})();

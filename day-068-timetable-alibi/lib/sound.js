// All tones are synthesized here; no downloaded audio or autoplay.
export function createSound() {
  let context=null,enabled=false;
  function tone(frequency,start,duration,volume=.04) {
    const osc=context.createOscillator(),gain=context.createGain();
    osc.type='sine';osc.frequency.value=frequency;
    gain.gain.setValueAtTime(0,start);gain.gain.linearRampToValueAtTime(volume,start+.015);
    gain.gain.exponentialRampToValueAtTime(.0001,start+duration);
    osc.connect(gain);gain.connect(context.destination);osc.start(start);osc.stop(start+duration);
  }
  return {
    setEnabled(value){enabled=value;},
    play(kind='tap'){
      if(!enabled)return;
      try {
        context??=new (window.AudioContext||window.webkitAudioContext)();
        void context.resume().catch(()=>{});
        const now=context.currentTime;
        const talk=kind.startsWith('talk-');
        const voice=kind==='talk-toru'?260:kind==='talk-shiori'?390:460;
        const notes=talk?[voice,voice*1.15,voice*.97]:kind==='objection'?[196,293.66,392,587.33]:kind==='success'?[392,493.88,587.33,783.99]:kind==='wrong'?[293.66,261.63]:kind==='play'?[523.25,659.25]:[659.25];
        notes.forEach((f,i)=>tone(f,now+i*(talk?.065:.11),talk?.07:kind==='success'?.7:.22,talk?.012:.04));
      }catch{/* Audio availability does not affect the investigation. */}
    }
  };
}

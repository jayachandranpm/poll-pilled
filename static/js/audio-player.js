/* A shared player for submitted takes and recording review. Native audio stays the fallback. */
'use strict';
let playerSequence=0;
const audioTime=value=>{const seconds=Math.max(0,Math.floor(Number.isFinite(value)?value:0));return Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0');};
function enhanceAudio(){
  $$('audio[controls]:not([data-custom-player])').forEach(audio=>{
    audio.dataset.customPlayer='true';audio.removeAttribute('controls');audio.hidden=true;
    const label=audio.getAttribute('aria-label')||'Voice take',id='voice-player-'+(++playerSequence),player=document.createElement('div');player.className='voice-player';player.setAttribute('role','group');player.setAttribute('aria-label',label);
    audio.before(player);player.append(audio);player.insertAdjacentHTML('beforeend',`<button type="button" class="audio-play" aria-label="Play ${escapeHTML(label)}">${icon('play-bold')}</button><div class="audio-progress"><input type="range" min="0" max="1000" value="0" step="1" aria-label="Seek ${escapeHTML(label)}" aria-valuetext="0:00"><span class="audio-time"><span data-current>0:00</span><span data-duration>0:00</span></span></div><select id="${id}-speed" aria-label="Playback speed for ${escapeHTML(label)}">${[['0.75','0.75×'],['1','1×'],['1.25','1.25×'],['1.5','1.5×'],['2','2×']].map(([v,t])=>`<option value="${v}" ${v==='1'?'selected':''}>${t}</option>`).join('')}</select><span class="audio-error" role="status" hidden></span>`);
    const button=$('.audio-play',player),seek=$('input[type="range"]',player),speed=$('select',player);
    function update(){const duration=Number.isFinite(audio.duration)?audio.duration:0,current=audio.currentTime||0;seek.disabled=!duration;seek.value=duration?Math.round(current/duration*1000):0;seek.style.setProperty('--progress',seek.value/10+'%');seek.setAttribute('aria-valuetext',audioTime(current)+' of '+audioTime(duration));$('[data-current]',player).textContent=audioTime(current);$('[data-duration]',player).textContent=audioTime(duration);}
    function playback(){button.innerHTML=icon(audio.paused?'play-bold':'pause-bold');button.setAttribute('aria-label',(audio.paused?'Play ':'Pause ')+label);player.classList.toggle('playing',!audio.paused);}
    button.addEventListener('click',async()=>{if(!audio.paused){audio.pause();return;}stopAudio();activeAudio=audio;try{await audio.play();}catch(error){toast('This audio could not play. Try reloading the conversation.',true);}playback();});
    seek.addEventListener('input',()=>{if(Number.isFinite(audio.duration)&&audio.duration>0){audio.currentTime=Number(seek.value)/1000*audio.duration;update();}});
    speed.addEventListener('change',()=>{audio.playbackRate=Number(speed.value);});
    for(const event of ['loadedmetadata','durationchange','timeupdate','seeked'])audio.addEventListener(event,update);
    for(const event of ['play','pause','ended'])audio.addEventListener(event,playback);
    audio.addEventListener('ended',()=>{if(activeAudio===audio){activeAudio=null;activeAudioId=null;}});
    audio.addEventListener('error',()=>{const error=$('.audio-error',player);error.hidden=false;error.textContent='Audio unavailable. Reload to try again.';button.disabled=true;});
    update();
  });
}
new MutationObserver(()=>{if(activeAudio?.dataset.customPlayer&&!activeAudio.isConnected)stopAudio();enhanceAudio();}).observe(document.body,{childList:true,subtree:true});
enhanceAudio();

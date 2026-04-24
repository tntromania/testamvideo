// ===================== STATE =====================
const MODEL_META = {
    'gemini-flash': { type:'image', cost:1 },
    'gemini-pro':   { type:'image', cost:2 },
    'veo3.1-fast':  { type:'video', cost:2 },
    'veo-extend':   { type:'video', cost:2 },
    'grok-720p-6s': { type:'video', cost:2 },
    'grok-720p-10s':{ type:'video', cost:2 },
    'grok-extend':  { type:'video', cost:2 },
    'grok-storyboard': { type:'video', storyboard:true, costPerScene:2 },
    // ── Kling 3.0 per-second (1.2/1.5 cr/s) ────────────────────────
    'kling-3-0-720p':          { type:'video', crPerSec: 1.2, durRange:[3,15] },
    'kling-3-0-1080p':         { type:'video', crPerSec: 1.5, durRange:[3,15] },
    // ── Kling 2.6 prețuri fixe 5s/10s ───────────────────────────────
    'kling-2-6-720p':          { type:'video', durCosts:{5:4,10:8},   fixedDurs:[5,10] },
    'kling-2-6-1080p':         { type:'video', durCosts:{5:6,10:12},  fixedDurs:[5,10] },
    'kling-2-6-1080p-audio':   { type:'video', durCosts:{5:9,10:17},  fixedDurs:[5,10] },
    // ── Motion Control — FLAT per generare ──────────────────────────
    'kling-motion-3-720p':     { type:'video', flatCost: 6,  motion:true },
    'kling-motion-3-1080p':    { type:'video', flatCost: 10, motion:true },
    'kling-motion-2-6-720p':   { type:'video', flatCost: 4,  motion:true },
    'kling-motion-2-6-1080p':  { type:'video', flatCost: 6,  motion:true },
    // ── Seedance 2 Fast — per secundă ───────────────────────────────
    'seedance-fast-480p':      { type:'video', crPerSec: 1.5, durRange:[4,15] },
    'seedance-fast-720p':      { type:'video', crPerSec: 2.5, durRange:[4,15] },
};
let mode = 'image';
let imgCount = 1;
let vidCount = 1;
let vidDuration = 5;    // durata selectată pentru Kling/Seedance
let uploadedRefs = [];
let startFrameFile = null;
let endFrameFile   = null;
let refVideoFile   = null;   // video de referință pentru Motion Control
let motionImageFile = null;  // imagine de referință personaj pentru Motion Control
let activeJobs = new Map();
let jobCounter = 0;
let lbMediaList = [], lbCurrentIndex = 0, lbCurrentType = 'image';

// ── STORYBOARD STATE ──
let storyboardScenes = [];          // [{prompt, duration}]
let _editingSceneIdx = -1;          // -1 = add new, >=0 = editing existing
let _storyboardFirstImageFile = null; // optional first-scene reference (option 1b)


// ═══════════════════════════════════════════════════════════════
// MODEL SELECT — rebuild per mod (fix: optgroup display:none nu
// funcționează în toate browserele; reconstruim DOM la fiecare switch)
// ═══════════════════════════════════════════════════════════════
const IMG_SELECT_HTML = `
<optgroup label="Imagini AI">
  <option value="gemini-flash">Nano Banana · Rapid</option>
  <option value="gemini-pro">Nano Banana · Pro</option>
</optgroup>`;

const VID_SELECT_HTML = `
<optgroup label="Video · Veo">
  <option value="veo3.1-fast">Veo 3.1 Fast</option>
</optgroup>
<optgroup label="Video · Grok 3">
  <option value="grok-720p-6s">Grok 3 · 6s</option>
  <option value="grok-720p-10s">Grok 3 · 10s</option>
  <option value="grok-storyboard">🎬 Grok Storyboard · NOU ✨</option>
</optgroup>
<optgroup label="Kling 3.0 · în mentenanță">
  <option value="kling-3-0-720p" disabled>Kling 3.0 · 720p — indisponibil</option>
  <option value="kling-3-0-1080p" disabled>Kling 3.0 · 1080p — indisponibil</option>
</optgroup>
<optgroup label="Kling 2.6 · în mentenanță">
  <option value="kling-2-6-720p" disabled>Kling 2.6 · 720p — indisponibil</option>
  <option value="kling-2-6-1080p" disabled>Kling 2.6 · 1080p — indisponibil</option>
  <option value="kling-2-6-1080p-audio" disabled>Kling 2.6 · Audio 1080p — indisponibil</option>
</optgroup>
<optgroup label="Kling Motion Control · în mentenanță">
  <option value="kling-motion-2-6-720p" disabled>Kling 2.6 Motion · 720p — indisponibil</option>
  <option value="kling-motion-2-6-1080p" disabled>Kling 2.6 Motion · 1080p — indisponibil</option>
  <option value="kling-motion-3-720p" disabled>Kling 3.0 Motion · 720p — indisponibil</option>
  <option value="kling-motion-3-1080p" disabled>Kling 3.0 Motion · 1080p — indisponibil</option>
</optgroup>
<optgroup label="Seedance 2 Fast · în mentenanță">
  <option value="seedance-fast-480p" disabled>Seedance Fast · 480p — indisponibil</option>
  <option value="seedance-fast-720p" disabled>Seedance Fast · 720p — indisponibil</option>
</optgroup>`;

function rebuildModelSelect(currentMode) {
    const sel = document.getElementById('model-sel');
    if (!sel) return;
    const isVid = currentMode === 'video';
    sel.innerHTML = isVid ? VID_SELECT_HTML : IMG_SELECT_HTML;
    sel.value = isVid ? 'grok-720p-6s' : 'gemini-flash';
}

// ===================== AUTH =====================
const $loginModal = document.getElementById('login-modal');
function openLoginModal()  { $loginModal.classList.add('show'); }
function closeLoginModal() { $loginModal.classList.remove('show'); }
function setToken(t)   { document.cookie = "viralio_token="+t+"; domain=.viralio.ro; path=/; max-age=604800; Secure; SameSite=Lax"; }
function getToken()    { const m = document.cookie.match(/(?:^|; )viralio_token=([^;]*)/); return m?m[1]:null; }
function removeToken() { document.cookie = "viralio_token=; domain=.viralio.ro; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT"; }

async function handleCredentialResponse(resp) {
    try {
        const r = await fetch('/api/auth/google',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({credential:resp.credential})});
        const d = await r.json();
        if(d.token){ setToken(d.token); closeLoginModal(); updateUI(d.user); }
    } catch(e){ toast('Eroare conectare server.'); }
}

function updateUI(user) {
    document.getElementById('login-top-btn').style.display = 'none';
    document.getElementById('login-top-btn-mobile').style.display = 'none';
    const up = document.getElementById('user-profile');
    up.classList.remove('hidden'); up.style.display = 'flex';
    document.getElementById('nav-name').innerText = user.name.split(' ')[0];
    document.getElementById('nav-avatar').src = user.picture;
    document.getElementById('nav-credits').innerText = user.credits;
    const _bar=document.getElementById('nav-credits-bar'); if(_bar) _bar.textContent=user.credits;
    loadHistory();
}

function logout() { removeToken(); location.reload(); }

window.onload = async () => {
    const savedMode = localStorage.getItem('viralio_mode');
    if (savedMode === 'video' && mode !== 'video') {
        mode = 'video';
        document.getElementById('tab-image').classList.remove('active');
        document.getElementById('tab-video').classList.add('active');
        document.getElementById('img-options').classList.add('hidden');
        document.getElementById('vid-options').classList.remove('hidden');
        document.getElementById('refs-section').classList.add('hidden');
        rebuildModelSelect('video');
        updateModelEtaChip();
        updateKlingOptions();
        refreshBadges();
    } else {
        rebuildModelSelect('image');
    }

    const t = getToken();
    if(t) {
        try {
            const r = await fetch('/api/auth/me',{headers:{'Authorization':'Bearer '+t}});
            if(r.ok){ const d=await r.json(); updateUI(d.user); } else removeToken();
        } catch(e){}
    }
    refreshBadges();
    updateStoryboardUI();
    if(t) { tryRestoreTask(); }
};

// ===================== UI HELPERS =====================
function toast(msg){ const el=document.getElementById('toast'); el.textContent=msg; el.classList.add('show'); setTimeout(()=>el.classList.remove('show'),2800); }
function escHtml(s){ return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function updateCharCount(){ document.getElementById('char-count').textContent = document.getElementById('prompt-in').value.length + ' caractere'; }
function fillExample(){ document.getElementById('prompt-in').value='A cinematic wide shot of a futuristic cyberpunk city at sunset, neon lights reflecting on wet streets, 8k resolution, photorealistic'; updateCharCount(); }
function updateCount(d){ imgCount=Math.min(4,Math.max(1,imgCount+d)); document.getElementById('count-val').textContent=imgCount; refreshBadges(); }
function updateVCount(d){ vidCount=Math.min(4,Math.max(1,vidCount+d)); document.getElementById('vcount-val').textContent=vidCount; refreshBadges(); }

function computeKlingCost(m, dur) {
    if (m.flatCost !== undefined) return m.flatCost;
    if (m.durCosts) {
        const fds = m.fixedDurs || [5];
        const near = fds.reduce((p,c) => Math.abs(c-dur)<Math.abs(p-dur)?c:p);
        return m.durCosts[near] || 0;
    }
    if (m.crPerSec) {
        const effDur = m.durRange
            ? Math.min(Math.max(dur, m.durRange[0]), m.durRange[1])
            : dur;
        return Math.max(1, Math.round(m.crPerSec * effDur));
    }
    return 0;
}
function refreshBadges(){
    const sel = document.getElementById('model-sel');
    const modelId = sel?.value || '';
    const m = MODEL_META[modelId]||{type:'image',cost:1};
    const n = mode==='image'?imgCount:vidCount;
    let cost;
    const isPremium2 = m.crPerSec !== undefined || m.durCosts !== undefined || m.flatCost !== undefined;
    if (m.storyboard) {
        // Cost = nr_scene × costPerScene (indep de vidCount)
        cost = storyboardScenes.length * (m.costPerScene || 2);
    } else if (isPremium2) {
        cost = computeKlingCost(m, vidDuration) * n;
    } else {
        cost = (m.cost || 2) * n;
    }
    document.getElementById('total-cost').textContent = cost;
}

function onModelChange(){ refreshBadges(); updateModelEtaChip(); updateKlingOptions(); updateStoryboardUI(); }

function updateModelEtaChip(){
    const chip = document.getElementById('model-eta-chip');
    if(!chip) return;
    const modelId = document.getElementById('model-sel')?.value || '';
    if(modelId === 'grok-storyboard'){
        chip.style.display = 'flex';
        chip.innerHTML = `<div style="display:flex;align-items:center;gap:9px;padding:9px 12px;border-radius:10px;background:linear-gradient(135deg,rgba(236,72,153,0.12),rgba(99,102,241,0.12));border:1px solid rgba(236,72,153,0.3);width:100%;box-sizing:border-box"><span style="font-size:1rem">🎬</span><div style="flex:1;min-width:0"><div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap"><span style="font-size:0.72rem;font-weight:800;background:linear-gradient(135deg,#f472b6,#a5a8ff);-webkit-background-clip:text;-webkit-text-fill-color:transparent;letter-spacing:0.02em">Multi-scenă · chain</span><span style="font-size:0.54rem;font-weight:900;padding:2px 6px;border-radius:5px;background:linear-gradient(135deg,#ec4899,#8b5cf6);color:white;letter-spacing:0.09em;box-shadow:0 2px 6px rgba(236,72,153,0.35)">NOU</span></div><span style="font-size:0.62rem;color:rgba(255,255,255,0.4);font-weight:600;display:block;margin-top:1px">Până la 10 scene · 2 credite/scenă</span></div></div>`;
    } else if(modelId.startsWith('grok-')){
        chip.style.display = 'flex';
        chip.innerHTML = `<div style="display:flex;align-items:center;gap:8px;padding:7px 12px;border-radius:10px;background:rgba(99,211,140,0.08);border:1px solid rgba(99,211,140,0.2);width:100%;box-sizing:border-box"><span style="font-size:0.95rem">${modelId==='grok-extend'?'🔗':'⚡'}</span><div><span style="font-size:0.68rem;font-weight:700;color:rgba(99,211,140,0.9);letter-spacing:0.02em">~40 secunde</span><span style="font-size:0.65rem;color:rgba(255,255,255,0.3);margin-left:6px">${modelId==='grok-extend'?'Grok Extend · continuă video':'procesare rapidă'}</span></div></div>`;
    } else if(modelId.startsWith('veo')){
        chip.style.display = 'flex';
        chip.innerHTML = `<div style="display:flex;align-items:center;gap:8px;padding:7px 12px;border-radius:10px;background:rgba(139,92,246,0.08);border:1px solid rgba(139,92,246,0.25);width:100%;box-sizing:border-box"><span style="font-size:0.95rem">${modelId==='veo-extend'?'🔗':'⏳'}</span><div><span style="font-size:0.68rem;font-weight:700;color:rgba(167,139,250,0.9);letter-spacing:0.02em">1–2 minute</span><span style="font-size:0.65rem;color:rgba(255,255,255,0.3);margin-left:6px">${modelId==='veo-extend'?'Veo Extend · continuă video':'servere aglomerate'}</span></div></div>`;
    } else if(modelId.startsWith('kling-') || modelId.startsWith('seedance-fast-')){
        const isMotion = modelId.includes('motion');
        const isSeedance = modelId.startsWith('seedance-fast-');
        const klingLabel = isSeedance ? 'Seedance · Bytedance AI video' : isMotion ? 'Motion Control · video de referință necesar' : modelId.includes('3-0') ? 'Kling 3.0 · calitate premium' : 'Kling 2.6 · calitate superioară';
        chip.style.display = 'flex';
        chip.innerHTML = `<div style="display:flex;align-items:center;gap:8px;padding:7px 12px;border-radius:10px;background:rgba(251,146,60,0.08);border:1px solid rgba(251,146,60,0.2);width:100%;box-sizing:border-box"><span style="font-size:0.95rem">${isMotion ? '🎥' : isSeedance ? '🌱' : '🎬'}</span><div><span style="font-size:0.68rem;font-weight:700;color:rgba(251,196,60,0.9);letter-spacing:0.02em">2–5 minute</span><span style="font-size:0.65rem;color:rgba(255,255,255,0.3);margin-left:6px">${klingLabel}</span></div></div>`;
    } else {
        chip.style.display = 'none';
        chip.innerHTML = '';
    }
}

function switchMode(m){
    mode=m; const isVid=m==='video';
    try { localStorage.setItem('viralio_mode', m); } catch(e) {}
    document.getElementById('tab-image').classList.toggle('active',!isVid);
    document.getElementById('tab-video').classList.toggle('active',isVid);
    document.getElementById('img-options').classList.toggle('hidden',isVid);
    document.getElementById('vid-options').classList.toggle('hidden',!isVid);
    document.getElementById('refs-section').classList.toggle('hidden', isVid);
    rebuildModelSelect(m);
    updateModelEtaChip();
    updateKlingOptions();
    updateStoryboardUI();
    refreshBadges();
    if(getToken()) loadHistory();
}

function aspectClass(r){
    if(r==='16:9') return 'aspect-video';
    if(r==='9:16') return 'aspect-[9/16]';
    if(r==='21:9') return 'aspect-[21/9]';
    return 'aspect-square';
}

// ===================== START / END FRAME =====================
function handleFrameSelect(type, e) {
    const file = e.target.files[0]; if (!file) return;
    const url = URL.createObjectURL(file);
    if (type === 'start') {
        startFrameFile = file;
        document.getElementById('start-frame-img').src = url;
        document.getElementById('start-frame-preview').classList.remove('hidden');
        document.getElementById('start-frame-zone').classList.add('hidden');
    } else {
        endFrameFile = file;
        document.getElementById('end-frame-img').src = url;
        document.getElementById('end-frame-preview').classList.remove('hidden');
        document.getElementById('end-frame-zone').classList.add('hidden');
    }
    e.target.value = '';
}

function removeFrame(type) {
    if (type === 'start') {
        startFrameFile = null;
        document.getElementById('start-frame-img').src = '';
        document.getElementById('start-frame-preview').classList.add('hidden');
        document.getElementById('start-frame-zone').classList.remove('hidden');
    } else {
        endFrameFile = null;
        document.getElementById('end-frame-img').src = '';
        document.getElementById('end-frame-preview').classList.add('hidden');
        document.getElementById('end-frame-zone').classList.remove('hidden');
    }
}

// ===================== REFS =====================
function handleFileSelect(e){ Array.from(e.target.files).forEach(f=>{ if(uploadedRefs.length<4) uploadedRefs.push(f); }); renderRefGallery(); e.target.value=''; }
function removeRef(i,e){ e.stopPropagation(); uploadedRefs.splice(i,1); renderRefGallery(); }
function insertTag(i){ const ta=document.getElementById('prompt-in'); const tag=`@img${i+1}`; const s=ta.selectionStart; ta.value=ta.value.substring(0,s)+` ${tag} `+ta.value.substring(ta.selectionEnd); ta.focus(); updateCharCount(); }
function renderRefGallery(){
    const gal=document.getElementById('ref-gallery'); const zone=document.getElementById('ref-zone');
    if(uploadedRefs.length>0){ gal.classList.remove('hidden'); zone.classList.add('hidden'); }
    else { gal.classList.add('hidden'); zone.classList.remove('hidden'); }
    gal.innerHTML=uploadedRefs.map((f,i)=>{
        const url=window.URL.createObjectURL(f);
        return `<div class="relative w-[4.5rem] h-[4.5rem] rounded-xl overflow-hidden group cursor-pointer" style="border:1.5px solid rgba(99,102,241,0.3)" onclick="insertTag(${i})"><img src="${url}" class="w-full h-full object-cover"><span class="absolute top-1 left-1 text-white text-[0.52rem] font-bold px-1.5 py-0.5 rounded" style="background:rgba(99,102,241,0.8)">@img${i+1}</span><button onclick="removeRef(${i},event)" class="absolute top-1 right-1 w-5 h-5 bg-red-500/80 text-white rounded-full flex items-center justify-center text-[0.55rem] opacity-0 group-hover:opacity-100 transition-all"><i class="fa-solid fa-xmark"></i></button></div>`;
    }).join('');
}

function handlePromptInput(){
    updateCharCount();
    const menu=document.getElementById('autocomplete-menu');
    if(uploadedRefs.length===0){ menu.classList.remove('show'); return; }
    const val=document.getElementById('prompt-in').value;
    const pos=document.getElementById('prompt-in').selectionStart;
    if(val.charAt(pos-1)==='@'){ showAutocomplete(); } else { menu.classList.remove('show'); }
}
function showAutocomplete(){
    const menu=document.getElementById('autocomplete-menu'); menu.innerHTML='';
    uploadedRefs.forEach((f,i)=>{
        const url=window.URL.createObjectURL(f);
        const item=document.createElement('div'); item.className='autocomplete-item';
        item.innerHTML=`<img src="${url}" class="w-8 h-8 rounded-lg object-cover border border-white/10"><span class="text-sm font-bold">@img${i+1}</span>`;
        item.onclick=(e)=>{ e.stopPropagation(); const ta=document.getElementById('prompt-in'); const pos=ta.selectionStart; ta.value=ta.value.substring(0,pos)+`img${i+1} `+ta.value.substring(pos); ta.focus(); updateCharCount(); menu.classList.remove('show'); };
        menu.appendChild(item);
    });
    menu.classList.add('show');
}
document.addEventListener('click',(e)=>{ const m=document.getElementById('autocomplete-menu'); if(m&&!m.contains(e.target)&&e.target!==document.getElementById('prompt-in')) m.classList.remove('show'); });

// ===================== LIGHTBOX =====================
function openLightbox(list, idx, type){
    lbMediaList=list; lbCurrentIndex=idx; lbCurrentType=type;
    updateLightboxContent();
    document.getElementById('lb-prev').classList.toggle('hidden',list.length<=1);
    document.getElementById('lb-next').classList.toggle('hidden',list.length<=1);
    document.getElementById('lightbox').classList.add('show');
}
function updateLightboxContent(){
    const img=document.getElementById('lb-img'); const vid=document.getElementById('lb-vid'); const dlBtn=document.getElementById('lb-download-btn');
    img.classList.add('hidden'); vid.classList.add('hidden');
    try { vid.pause(); } catch(e){}
    const item=lbMediaList[lbCurrentIndex];
    let url,type;
    if(item&&typeof item==='object'&&item.url){ url=item.url; type=item.type; } else { url=item; type=lbCurrentType; }
    dlBtn.onclick=(e)=>{ e.stopPropagation(); downloadMedia(url,`viralio_${Date.now()}.${type==='video'?'mp4':'png'}`); };
    if(type==='video'){ vid.src=url; vid.style.cssText='max-width:90vw;max-height:85vh;width:auto;height:auto;'; vid.classList.remove('hidden'); vid.load(); }
    else { img.src=url; img.classList.remove('hidden'); }
}
function navLightbox(dir,e){ if(e)e.stopPropagation(); lbCurrentIndex=(lbCurrentIndex+dir+lbMediaList.length)%lbMediaList.length; updateLightboxContent(); }
function closeLightbox(){ document.getElementById('lightbox').classList.remove('show'); setTimeout(()=>{ try{document.getElementById('lb-vid').pause();}catch(e){} },300); }
document.addEventListener('keydown',(e)=>{ if(!document.getElementById('lightbox').classList.contains('show')) return; if(e.key==='ArrowLeft'&&lbMediaList.length>1) navLightbox(-1,null); if(e.key==='ArrowRight'&&lbMediaList.length>1) navLightbox(1,null); if(e.key==='Escape') closeLightbox(); });

// ===================== DOWNLOAD =====================
async function downloadMedia(url, filename){
    try {
        const r = await fetch(url, { mode: 'cors' });
        if (!r.ok) throw new Error('fetch failed');
        const blob = await r.blob();
        const bu = window.URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = bu; a.download = filename;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        window.URL.revokeObjectURL(bu);
    } catch(err){
        const proxyUrl = `/api/media/proxy-download?url=${encodeURIComponent(url)}&filename=${encodeURIComponent(filename)}`;
        const a = document.createElement('a'); a.href = proxyUrl; a.download = filename;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
    }
}

// ===================== EMPTY STATE =====================
function checkEmptyState(){
    const jobs=document.getElementById('jobs-area');
    const empty=document.getElementById('st-empty');
    if(jobs.children.length===0){ empty.classList.remove('hidden'); } else { empty.classList.add('hidden'); }
}

// ===================== JOB SYSTEM =====================

function buildShimmerLoading(currentMode, count, ratio, modelId) {
    count = count || 1;
    ratio = ratio || '9:16';
    const ratioMap = {'9:16':'9/16','16:9':'16/9','1:1':'1/1','4:5':'4/5','5:4':'5/4','3:4':'3/4','4:3':'4/3','2:3':'2/3','3:2':'3/2','21:9':'21/9'};
    const aspectCSS = ratioMap[ratio] || '1/1';
    const isPortrait = ['9:16','4:5','3:4','2:3'].includes(ratio);
    const isLandscape = ['16:9','21:9','3:2','4:3','5:4'].includes(ratio);
    // Dimensiuni placeholder similare cu cardurile finale
    const cardW = isPortrait ? '140px' : isLandscape ? '220px' : '180px';
    // Grid wrapper similar cu setJobDone pentru consistență vizuală
    const maxW = count === 1
        ? (isPortrait ? '210px' : isLandscape ? '460px' : '280px')
        : (isPortrait ? (count<=2?'340px':count===3?'500px':'660px') : (isLandscape ? '100%' : (count<=2?'420px':'560px')));
    const gridCols = count === 1 ? '1fr'
        : (isPortrait ? `repeat(${Math.min(count,4)},1fr)` : (isLandscape ? 'repeat(2,1fr)' : `repeat(${Math.min(count,2)},1fr)`));

    // Fiecare placeholder are data-slot pentru înlocuire progresivă
    const placeholders = Array.from({length: count}, (_, i) =>
        `<div class="rounded-xl shimmer-box" data-slot="${i}" style="aspect-ratio:${aspectCSS};animation-delay:${i*0.15}s;transition:opacity 0.3s"></div>`
    ).join('');

    return `<div style="padding:12px"><div id="job-media-grid-JOBID" style="display:grid;grid-template-columns:${gridCols};gap:10px;max-width:${maxW};margin:0 auto">${placeholders}</div></div><p id="job-status-JOBID" style="display:none;"></p>`;
}

// ===================== PROGRESSIVE RENDER =====================
// Înlocuiește un shimmer placeholder cu media reală când vine partial_url
function renderPartialResult(jobId, url, uuid, slotIndex, totalCount, ratio, mediaType, allPartialUrls, allPartialUuids){
    const grid = document.getElementById(`job-media-grid-${jobId}`);
    if(!grid) return;
    const slot = grid.querySelector(`[data-slot="${slotIndex}"]`);
    if(!slot) return;

    const ratioMap = {'9:16':'9/16','16:9':'16/9','1:1':'1/1','4:5':'4/5','5:4':'5/4','3:4':'3/4','4:3':'4/3','2:3':'2/3','3:2':'3/2','21:9':'21/9'};
    const aspectCSS = ratioMap[ratio] || '1/1';
    const ts = Date.now() + slotIndex;

    const el = document.createElement('div');
    el.className = 'result-card';
    el.dataset.slot = slotIndex;
    el.style.cssText = 'border-radius:14px;overflow:hidden;animation:fadeInUp 0.4s cubic-bezier(0.16,1,0.3,1) forwards';

    if(mediaType === 'image'){
        const allStr = JSON.stringify(allPartialUrls);
        el.innerHTML = `<div class="${aspectClass(ratio)} w-full relative group overflow-hidden" style="border-radius:14px 14px 0 0"><img src="${url}" class="absolute inset-0 w-full h-full object-cover"><div class="card-overlay"><button onclick='openLightbox(${allStr},${slotIndex},"image")' class="text-white backdrop-blur-md text-xs font-bold px-3 py-1.5 rounded-xl transition-all hover:scale-105" style="background:rgba(255,255,255,0.15);border:1px solid rgba(255,255,255,0.2)"><i class="fa-solid fa-expand mr-1"></i>Mărește</button></div></div><div class="p-2.5" style="border-top:1px solid rgba(255,255,255,0.05)"><button onclick="downloadMedia('${url}','viralio_img_${ts}.png')" class="w-full text-xs font-bold px-3 py-2 rounded-xl transition-all" style="color:rgba(255,255,255,0.6);background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.07)"><i class="fa-solid fa-download mr-1"></i>Descarcă</button></div>`;
    } else {
        const extendAttr = uuid ? `data-uuid="${uuid}" data-url="${url}"` : `data-url="${url}"`;
        // ✅ Fix video: butoane pe un singur rând, fără text wrap, video vizibil
        el.innerHTML = `<div class="${aspectClass(ratio)} w-full relative overflow-hidden" style="background:#000;border-radius:14px 14px 0 0"><video src="${url}" controls playsinline preload="metadata" class="absolute inset-0 w-full h-full object-contain"></video></div><div class="p-2" style="border-top:1px solid rgba(255,255,255,0.05);display:flex;flex-direction:column;gap:6px"><button onclick="downloadMedia('${url}','viralio_vid_${ts}.mp4')" style="width:100%;font-size:0.72rem;font-weight:700;padding:6px 8px;border-radius:10px;color:rgba(255,255,255,0.6);background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.07);white-space:nowrap;overflow:hidden;text-overflow:ellipsis"><i class="fa-solid fa-download" style="margin-right:4px"></i>Descarcă</button><button ${extendAttr} onclick="openExtendModal(this.dataset.uuid,this.dataset.url)" style="width:100%;font-size:0.72rem;font-weight:700;padding:6px 8px;border-radius:10px;color:rgba(165,168,255,0.9);background:rgba(99,102,241,0.15);border:1px solid rgba(99,102,241,0.35);white-space:nowrap;overflow:hidden;text-overflow:ellipsis"><i class="fa-solid fa-forward" style="font-size:0.6rem;margin-right:4px"></i>Extinde Video</button></div>`;
    }

    slot.replaceWith(el);
}

// ===================== ETA TIMER =====================
const _etaTimers = {};
function startEtaTimer(jobId, maxSec) {
    let elapsed = 0;
    const timerId = setInterval(() => {
        elapsed++;
        const timerEl = document.getElementById(`eta-timer-${jobId}`);
        const barEl   = document.getElementById(`eta-bar-${jobId}`);
        if (!timerEl) { clearInterval(timerId); return; }
        timerEl.textContent = elapsed >= 60 ? `${Math.floor(elapsed/60)}m ${elapsed%60}s` : `${elapsed}s`;
        if (barEl) { barEl.style.width = Math.min((elapsed / maxSec) * 100, 97) + '%'; }
        if (elapsed >= maxSec * 3) clearInterval(timerId);
    }, 1000);
    _etaTimers[jobId] = timerId;
}
function stopEtaTimer(jobId) {
    if (_etaTimers[jobId]) {
        clearInterval(_etaTimers[jobId]);
        delete _etaTimers[jobId];
        const barEl = document.getElementById(`eta-bar-${jobId}`);
        if (barEl) { barEl.style.transition='width 0.4s ease'; barEl.style.width='100%'; }
    }
}

function createJobCard(jobId, promptText, currentMode, count, ratio){
    count = count || 1;
    ratio = ratio || '9:16';
    const el=document.createElement('div');
    el.id=`job-${jobId}`;
    el.className='job-card processing';
    const typeLabel = currentMode==='video'
        ? `<span class="flex items-center gap-1.5" style="color:rgba(165,168,255,0.7)"><i class="fa-solid fa-clapperboard text-[0.6rem]"></i> <span class="font-bold text-[0.65rem] uppercase tracking-wider">Video</span></span>`
        : `<span class="flex items-center gap-1.5" style="color:rgba(165,168,255,0.7)"><i class="fa-solid fa-image text-[0.6rem]"></i> <span class="font-bold text-[0.65rem] uppercase tracking-wider">Imagine</span></span>`;
    const _selModel = document.getElementById('model-sel')?.value || '';
    const shimmer = buildShimmerLoading(currentMode, count, ratio, _selModel).replace(/JOBID/g, String(jobId));
    el.innerHTML=`<div class="flex items-center justify-between px-5 py-3.5" style="border-bottom:1px solid rgba(255,255,255,0.05)"><div class="flex items-center gap-3 overflow-hidden flex-1 min-w-0"><div class="pulse-ring shrink-0"><div class="w-2.5 h-2.5 rounded-full" style="background:rgba(99,102,241,0.9)"></div></div><span class="text-sm font-medium truncate" style="color:rgba(255,255,255,0.6);max-width:240px">${escHtml(promptText)}</span></div><div class="shrink-0 ml-3 flex items-center gap-2">${typeLabel}</div></div><div id="job-body-${jobId}" class="p-4">${shimmer}</div>`;
    return el;
}

function setJobStatus(jobId, text){
    const el = document.getElementById(`job-status-${jobId}`);
    if(el){ el.textContent = text; return; }
    const body = document.getElementById(`job-body-${jobId}`);
    if(!body) return;
    let st = body.querySelector('[data-status]');
    if(!st){ st = body.querySelector('p'); if(st) st.setAttribute('data-status','1'); }
    if(st) st.textContent = text;
}

function _addCloseBtn(card){
    const header = card.querySelector('div[style*="border-bottom"]');
    if(header && !header.querySelector('.job-close-btn')){
        const xBtn = document.createElement('button');
        xBtn.className='job-close-btn shrink-0 ml-2 w-6 h-6 rounded-lg flex items-center justify-center transition-all hover:scale-110';
        xBtn.style.cssText='background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.08);color:rgba(255,255,255,0.35)';
        xBtn.innerHTML='<i class="fa-solid fa-xmark text-[0.6rem]"></i>';
        xBtn.onclick=()=>{ card.style.transition='opacity 0.3s,transform 0.3s'; card.style.opacity='0'; card.style.transform='scale(0.97)'; setTimeout(()=>{ card.remove(); checkEmptyState(); },300); };
        header.appendChild(xBtn);
    }
}

function setJobDone(jobId, urls, ratioVal, currentMode, uuids){ stopEtaTimer(jobId); clearActiveTask();
    const body=document.getElementById(`job-body-${jobId}`); const card=document.getElementById(`job-${jobId}`);
    if(!body||!card) return;
    card.className='job-card done';
    _addCloseBtn(card);

    const pulseWrap = card.querySelector('.pulse-ring');
    if(pulseWrap){ pulseWrap.classList.remove('pulse-ring'); const dot = pulseWrap.querySelector('div') || pulseWrap; dot.style.background = 'rgba(52,211,153,0.9)'; }

    const isPortrait=['9:16','2:3','3:4','4:5'].includes(ratioVal);
    const isLandscape=['16:9','21:9','3:2','4:3','5:4'].includes(ratioVal);
    const count=urls.length;

    // ✅ Dacă media a fost deja randată progresiv, înlocuim doar shimmer-ele rămase
    const existingGrid = document.getElementById(`job-media-grid-${jobId}`);
    if(existingGrid){
        urls.forEach((url, idx) => {
            // Verificăm dacă slotul a fost deja înlocuit cu media reală
            const slot = existingGrid.querySelector(`[data-slot="${idx}"]`);
            if(slot && slot.classList.contains('shimmer-box')){
                // Slotul e încă shimmer — îl înlocuim
                renderPartialResult(jobId, url, (uuids&&uuids[idx])||'', idx, count, ratioVal, currentMode, urls, uuids||[]);
            }
        });
        // Eliminăm shimmer-ele rămase care nu au primit URL (erori parțiale)
        existingGrid.querySelectorAll('.shimmer-box').forEach(el => el.remove());
        // Actualizăm lightbox-ul pentru imagini (URL-urile complete sunt acum disponibile)
        if(currentMode==='image'){
            const allStr=JSON.stringify(urls);
            existingGrid.querySelectorAll('.result-card img').forEach((img,idx)=>{
                const btn = img.closest('.result-card')?.querySelector('button[onclick*="openLightbox"]');
                if(btn) btn.setAttribute('onclick', `openLightbox(${allStr},${idx},"image")`);
            });
        }
        return;
    }

const makeCard=(url, idx)=>{
        const el=document.createElement('div');
        el.className='result-card';
        const ts=Date.now()+idx;
        if(currentMode==='image'){
            const allStr=JSON.stringify(urls);
            el.innerHTML=`<div class="${aspectClass(ratioVal)} w-full relative group overflow-hidden" style="border-radius:14px 14px 0 0"><img src="${url}" class="absolute inset-0 w-full h-full object-cover"><div class="card-overlay"><button onclick='openLightbox(${allStr},${idx},"image")' class="text-white backdrop-blur-md text-xs font-bold px-3 py-1.5 rounded-xl transition-all hover:scale-105" style="background:rgba(255,255,255,0.15);border:1px solid rgba(255,255,255,0.2)"><i class="fa-solid fa-expand mr-1"></i>Mărește</button></div></div><div class="p-2.5" style="border-top:1px solid rgba(255,255,255,0.05)"><button onclick="downloadMedia('${url}','viralio_img_${ts}.png')" class="w-full text-xs font-bold px-3 py-2 rounded-xl transition-all" style="color:rgba(255,255,255,0.6);background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.07)"><i class="fa-solid fa-download mr-1"></i>Descarcă</button></div>`;
        } else {
            const uuid = (uuids && uuids[idx]) || '';
            const extendAttr = uuid ? `data-uuid="${uuid}" data-url="${url}"` : `data-url="${url}"`;
            // ✅ Fix: butoane compacte, fără text wrap, video vizibil
            el.innerHTML=`<div class="${aspectClass(ratioVal)} w-full relative overflow-hidden" style="background:#000;border-radius:14px 14px 0 0"><video src="${url}" controls playsinline preload="metadata" class="absolute inset-0 w-full h-full object-contain"></video></div><div class="p-2" style="border-top:1px solid rgba(255,255,255,0.05);display:flex;flex-direction:column;gap:6px"><button onclick="downloadMedia('${url}','viralio_vid_${ts}.mp4')" style="width:100%;font-size:0.72rem;font-weight:700;padding:6px 8px;border-radius:10px;color:rgba(255,255,255,0.6);background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.07);white-space:nowrap;overflow:hidden;text-overflow:ellipsis"><i class="fa-solid fa-download" style="margin-right:4px"></i>Descarcă</button><button ${extendAttr} onclick="openExtendModal(this.dataset.uuid,this.dataset.url)" style="width:100%;font-size:0.72rem;font-weight:700;padding:6px 8px;border-radius:10px;color:rgba(165,168,255,0.9);background:rgba(99,102,241,0.15);border:1px solid rgba(99,102,241,0.35);white-space:nowrap;overflow:hidden;text-overflow:ellipsis"><i class="fa-solid fa-forward" style="font-size:0.6rem;margin-right:4px"></i>Extinde Video</button></div>`;
        }
        return el;
    };

    body.innerHTML='';
    const wrapper=document.createElement('div');
    wrapper.style.padding='12px';
    if(count===1){
        const maxW = isPortrait ? '210px' : isLandscape ? '460px' : '280px';
        wrapper.style.maxWidth=maxW; wrapper.style.margin='0 auto';
        wrapper.appendChild(makeCard(urls[0],0));
    } else {
        const grid=document.createElement('div'); grid.style.display='grid'; grid.style.gap='10px';
        if(isPortrait){ const cols=Math.min(count,4); grid.style.gridTemplateColumns=`repeat(${cols},1fr)`; grid.style.maxWidth=count<=2?'340px':count===3?'460px':'580px'; grid.style.margin='0 auto'; }
        else if(isLandscape){ grid.style.gridTemplateColumns='repeat(2,1fr)'; }
        else { grid.style.gridTemplateColumns=`repeat(${Math.min(count,2)},1fr)`; grid.style.maxWidth=count<=2?'420px':'560px'; grid.style.margin='0 auto'; }
        urls.forEach((url,i)=>grid.appendChild(makeCard(url,i)));
        wrapper.appendChild(grid);
    }
    body.appendChild(wrapper);
}

function setJobError(jobId, msg){ stopEtaTimer(jobId);
    if (!msg.includes('Conexiunea a fost întreruptă')) {
        clearActiveTask();
    }

    // ⚠️ După orice eroare, forțăm refresh la credite (să nu rămână afișat
    // un sold vechi din cache dacă cumva ceva a părut să scadă)
    try {
        const t = getToken();
        if (t) {
            fetch('/api/auth/me', { headers: { 'Authorization': 'Bearer ' + t }, cache: 'no-store' })
                .then(r => r.ok ? r.json() : null)
                .then(d => {
                    if (!d?.user) return;
                    const nc = document.getElementById('nav-credits'); if (nc) nc.innerText = d.user.credits;
                    const bar = document.getElementById('nav-credits-bar'); if (bar) bar.textContent = d.user.credits;
                })
                .catch(() => {});
        }
    } catch(e) {}

    const body=document.getElementById(`job-body-${jobId}`); const card=document.getElementById(`job-${jobId}`);
    if(!body) return;
    card.className='job-card error';
    _addCloseBtn(card);
    const pulseWrap = card.querySelector('.pulse-ring');
    if(pulseWrap){ pulseWrap.classList.remove('pulse-ring'); const dot = pulseWrap.querySelector('div') || pulseWrap; dot.style.background = 'rgba(248,113,113,0.9)'; }

    // Detectăm eroarea specifică de format imagine (Failed to prepare reference image)
    const isPrepareImageError = msg && (
        msg.toLowerCase().includes('failed to prepare reference image') ||
        msg.toLowerCase().includes('prepare reference image')
    );
    if (isPrepareImageError) {
        msg = '⚠️ Imaginea de referință nu a putut fi procesată de AI.\n\nSoluție rapidă:\n• Convertește imaginea în format JPG\n• Folosește o imagine curată, needitată (fără filtre, watermark sau modificări)\n• Apoi încearcă din nou.';
    }

    // Detectăm dacă eroarea e din cauza imaginii de referință blocate (conținut)
    const isImageBlocked = !isPrepareImageError && msg && (
        msg.toLowerCase().includes('reference image') ||
        msg.toLowerCase().includes('content moderation') ||
        msg.toLowerCase().includes('imaginea de referinta') ||
        msg.toLowerCase().includes('imaginea de start') ||
        msg.toLowerCase().includes('imaginea de final')
    );

    // ★ FIX CRITIC: dacă imaginea e blocată, o resetăm automat
    // altfel userul o retrimite fără să știe la fiecare Recreate
    if (isImageBlocked) {
        startFrameFile = null;
        try {
            document.getElementById('start-frame-img').src = '';
            document.getElementById('start-frame-preview').classList.add('hidden');
            document.getElementById('start-frame-zone').classList.remove('hidden');
        } catch(e) {}
        endFrameFile = null;
        try {
            document.getElementById('end-frame-img').src = '';
            document.getElementById('end-frame-preview').classList.add('hidden');
            document.getElementById('end-frame-zone').classList.remove('hidden');
        } catch(e) {}
        uploadedRefs = [];
        try { renderRefGallery(); } catch(e) {}
    }

    const isBlocked = isImageBlocked || (msg && (
        msg.includes('sexuala') || msg.includes('blocat') || msg.includes('filtrat') ||
        msg.includes('inadecvat') || msg.includes('siguranta') || msg.includes('Audio') ||
        msg.includes('politicile') || msg.includes('minori') || msg.includes('🚫')
    ));
    const icon = isBlocked ? 'fa-ban' : 'fa-triangle-exclamation';
    const iconColor = isBlocked ? 'rgba(251,146,60,0.8)' : 'rgba(248,113,113,0.8)';

    const formattedMsg = escHtml(msg).replace(/\n\n/g, '<br><br>').replace(/\n/g, '<br>');

    const actionBtn = isPrepareImageError
        ? `<button onclick="document.getElementById('prompt-in').focus();" class="text-xs font-bold px-4 py-2 rounded-xl mt-1 transition-all hover:scale-105" style="color:rgba(251,196,60,0.9);background:rgba(251,196,60,0.1);border:1px solid rgba(251,196,60,0.25)">🖼️ Convertește imaginea în JPG și încearcă din nou</button>`
        : isImageBlocked
        ? `<button onclick="document.getElementById('prompt-in').focus();" class="text-xs font-bold px-4 py-2 rounded-xl mt-1 transition-all hover:scale-105" style="color:rgba(251,146,60,0.9);background:rgba(251,146,60,0.1);border:1px solid rgba(251,146,60,0.2)">🖼️ Imaginea blocată a fost ștearsă — încearcă fără ea</button>`
        : isBlocked
            ? `<button onclick="document.getElementById('prompt-in').focus();" class="text-xs font-bold px-4 py-2 rounded-xl mt-1 transition-all hover:scale-105" style="color:rgba(251,146,60,0.9);background:rgba(251,146,60,0.1);border:1px solid rgba(251,146,60,0.2)">✏️ Modifică promptul</button>`
            : '';

    body.innerHTML=`<div class="flex flex-col items-center gap-2 py-4 px-3 w-full"><i class="fa-solid ${icon} text-2xl" style="color:${iconColor}"></i><p class="text-xs text-left leading-relaxed" style="color:rgba(255,255,255,0.45);max-width:340px">${formattedMsg}</p>${actionBtn}</div>`;
}

function _addCloseBtn(card){
    const header = card.querySelector('div[style*="border-bottom"]');
    if(header && !header.querySelector('.job-close-btn')){
        const xBtn = document.createElement('button');
        xBtn.className='job-close-btn shrink-0 ml-2 w-6 h-6 rounded-lg flex items-center justify-center transition-all hover:scale-110';
        xBtn.style.cssText='background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.08);color:rgba(255,255,255,0.35)';
        xBtn.innerHTML='<i class="fa-solid fa-xmark text-[0.6rem]"></i>';
        xBtn.onclick=()=>{ 
            clearActiveTask(); // Acum trebuie șters manual doar dacă utilizatorul închide explicit cardul de eroare
            card.style.transition='opacity 0.3s,transform 0.3s'; card.style.opacity='0'; card.style.transform='scale(0.97)'; 
            setTimeout(()=>{ card.remove(); checkEmptyState(); },300); 
        };
        header.appendChild(xBtn);
    }
}

// ===================== SSE READER =====================
async function readSSEJob(jobId, response, opts={}){
    const { currentMode, ratio, count } = opts;
    const reader=response.body.getReader();
    const dec=new TextDecoder(); let buf=''; let finalData={}; let lastError=null;
    // State pentru afișare progresivă
    const partialUrls=[]; const partialUuids=[];
    try {
        while(true){
            const {done,value}=await reader.read();
            if(value) buf+=dec.decode(value,{stream:true});
            if(done){ if(buf.trim()) buf+='\n'; }
            const lines=buf.split('\n'); buf=lines.pop();
            for(const line of lines){
                const t=line.trim(); if(!t||t.startsWith(':')) continue;
                if(t.startsWith('data:')){
                    const raw=t.slice(5).trim();
                    if(raw==='[DONE]') continue;
                    if(raw.startsWith('{')||raw.startsWith('[')){
                        try {
                            const p=JSON.parse(raw);
                            if(p.error){ lastError=p.error; continue; }
                            // ✅ Afișare progresivă: fiecare media gata vine separat
                            if(p.partial_url){
                                partialUrls.push(p.partial_url);
                                partialUuids.push(p.partial_uuid||'');
                                const mediaType = p.partial_type || currentMode || 'image';
                                if(p.status) setJobStatus(jobId, p.status);
                                renderPartialResult(jobId, p.partial_url, p.partial_uuid||'', partialUrls.length-1, count||1, ratio, mediaType, partialUrls, partialUuids);
                                continue;
                            }
                            if(p.status&&Object.keys(p).length===1){ setJobStatus(jobId,p.status); continue; }
                            if(p.status&&!p.file_urls&&!p.file_url&&!p.video_url&&!p.url&&!p.partial_url){ setJobStatus(jobId,p.status); continue; }
                            Object.assign(finalData,p);
                        } catch(e){}
                    }
                }
            }
            if(done) break;
        }
    } finally {}
    if(lastError&&!finalData.file_urls&&!finalData.file_url&&!finalData.video_url&&!finalData.url&&partialUrls.length===0) throw new Error(lastError);
    if(!lastError && Object.keys(finalData).length===0){
        if(partialUrls.length>0) return { file_urls: partialUrls, file_uuids: partialUuids, saved_to_history: true };
        throw new Error('Conexiunea a fost întreruptă. Reîncearcă.');
    }
    const result = Object.keys(finalData).length>0 ? finalData : null;
    if(result && !result.file_urls && partialUrls.length>0) result.file_urls = partialUrls;
    if(result && !result.file_uuids && partialUuids.length>0) result.file_uuids = partialUuids;
    return result;
}

function extractUrls(data){
    if(!data) return { urls: [], uuids: [] };
    const uuids = data.file_uuids || [];
    if(data.file_urls&&Array.isArray(data.file_urls)&&data.file_urls.length>0) return { urls: data.file_urls, uuids };
    if(data.file_url) return { urls: [data.file_url], uuids };
    if(data.video_url) return { urls: [data.video_url], uuids };
    if(data.url) return { urls: [data.url], uuids };
    const found=[]; const scan=(o)=>{ for(let k in o){ if(typeof o[k]==='string'&&(o[k].includes('.mp4')||o[k].includes('.png')||o[k].startsWith('http'))) found.push(o[k]); else if(typeof o[k]==='object'&&o[k]!==null) scan(o[k]); } }; scan(data);
    return { urls: found, uuids };
}

// ===================== RUN JOB =====================
async function runJob(jobId, promptText, currentMode, ratio, refs, token, startFrame, endFrame){
    const job=activeJobs.get(jobId); if(!job) return;
    try {
        const fd=new FormData();
        if(currentMode==='image'){
            const model_id=document.getElementById('model-sel').value;
            setJobStatus(jobId,'Se generează imaginile...');
            fd.append('prompt',promptText); fd.append('aspect_ratio',ratio); fd.append('number_of_images',imgCount); fd.append('model_id',model_id);
            refs.forEach(f=>fd.append('ref_images',f,f.name));
            const resp=await fetch('/api/media/image',{method:'POST',headers:{'Authorization':'Bearer '+token},body:fd});
            if(!resp.ok){ const j=await resp.json().catch(()=>{}); throw new Error(j?.error||'Eroare server'); }
            const data=await readSSEJob(jobId,resp,{currentMode,ratio,count:imgCount});
            const { urls } = extractUrls(data); if(!urls?.length) throw new Error('Nu s-au generat imagini.');
            setJobDone(jobId,urls,ratio,currentMode,[]);
            if(!data?.saved_to_history) await saveToSupabase(urls,promptText,currentMode,[]);
        } else {
            const model_id=document.getElementById('model-sel').value;
            const _mMeta = MODEL_META[model_id] || {};
            let statusMsg = 'Se trimite la AI...';
            if (startFrame && endFrame) statusMsg = 'Se trimite cu start + end frame...';
            else if (startFrame) statusMsg = 'Se trimite cu start frame...';
            else if (model_id === 'veo-extend' || model_id === 'grok-extend') statusMsg = 'Se trimite pentru extend video...';
            else if (_mMeta.motion && refVideoFile) statusMsg = `Se trimite Motion Control (${refVideoFile.name})...`;
            else if (_mMeta.motion) statusMsg = 'Motion Control — lipsă video referință!';
            else if (_mMeta.crPerSec || _mMeta.durCosts) statusMsg = `Se generează ${vidDuration}s${modelId.includes('audio')?'+audio':''}...`;
            setJobStatus(jobId, statusMsg);
            fd.append('prompt',promptText); fd.append('aspect_ratio',ratio); fd.append('number_of_videos',vidCount); fd.append('model_id',model_id);
            // Durata selectată pentru Kling/Seedance
            const _m = MODEL_META[model_id] || {};
            if (_m.crPerSec || _m.durCosts) fd.append('duration', String(vidDuration));
            // Motion control: video de referință
            if (_m.motion && refVideoFile) fd.append('ref_video', refVideoFile, refVideoFile.name);
            if (startFrame) fd.append('start_image', startFrame, startFrame.name);
            if (endFrame)   fd.append('end_image',   endFrame,   endFrame.name);
            refs.forEach(f=>fd.append('ref_images',f,f.name));
            const resp=await fetch('/api/media/video',{method:'POST',headers:{'Authorization':'Bearer '+token},body:fd});
            if(!resp.ok){ const j=await resp.json().catch(()=>{}); throw new Error(j?.error||'Eroare server'); }
            const data=await readSSEJob(jobId,resp,{currentMode,ratio,count:vidCount});
            const { urls, uuids } = extractUrls(data); if(!urls?.length) throw new Error('Nu s-a generat video.');
            setJobDone(jobId,urls,ratio,currentMode,uuids);
            if(!data?.saved_to_history) await saveToSupabase(urls,promptText,currentMode,uuids);
        }
        setTimeout(loadHistory, 3000);
    } catch(err){
        let msg = err.message || '';
        if (msg === 'Failed to fetch' || msg === 'NetworkError when attempting to fetch resource.' || msg.toLowerCase().includes('network') || msg === 'Load failed') {
            msg = 'Conexiunea a fost întreruptă. Verifică internetul și reîncearcă.';
        } else if (msg === 'Nu s-a generat video.' || msg === 'Nu s-au generat imagini.') {
            msg = 'Nu s-a putut genera conținut. Reîncearcă sau modifică promptul.';
        }
        setJobError(jobId, msg);
    } finally {
        activeJobs.delete(jobId);
        try { const r=await fetch('/api/auth/me',{headers:{'Authorization':'Bearer '+token}}); if(r.ok){ const d=await r.json(); document.getElementById('nav-credits').innerText=d.user.credits; const bar=document.getElementById('nav-credits-bar'); if(bar) bar.textContent=d.user.credits; } } catch(e){}
    }
}

// ===================== EXTEND MODAL =====================
let _extendUUID = '';
let _extendUrl  = '';
let _extendModel = 'grok';
let _extendDuration = 10;

function openExtendModal(uuid, url) {
    _extendUUID = uuid || ''; _extendUrl = url || '';
    _extendModel = 'grok'; _extendDuration = 10;
    try { localStorage.setItem('viralio_last_extend', JSON.stringify({ uuid, url, ts: Date.now() })); } catch(e){}
    const vid = document.getElementById('ext-preview-vid');
    if(vid) { vid.src = url; vid.currentTime = 0; }
    const pr = document.getElementById('ext-prompt'); if(pr) pr.value = '';
    selectExtendModel('grok'); selectExtendDuration(10);
    const modal = document.getElementById('extend-modal');
    modal.style.display = 'flex';
    requestAnimationFrame(() => { modal.style.opacity = '1'; });
}

function closeExtendModal(e) {
    if(e && e.target !== document.getElementById('extend-modal') && e.type !== 'click') return;
    const modal = document.getElementById('extend-modal');
    modal.style.opacity = '0';
    setTimeout(() => { modal.style.display = 'none'; }, 300);
    const vid = document.getElementById('ext-preview-vid');
    if(vid) { vid.pause(); vid.src = ''; }
}

function selectExtendModel(model) {
    _extendModel = model;
    const grokBtn = document.getElementById('ext-btn-grok');
    const veoBtn  = document.getElementById('ext-btn-veo');
    const durRow  = document.getElementById('ext-duration-row');
    if(model === 'grok') {
        grokBtn.style.border='1.5px solid rgba(99,102,241,0.5)'; grokBtn.style.background='rgba(99,102,241,0.12)'; grokBtn.querySelector('div div:first-child').style.color='rgba(165,168,255,0.95)';
        veoBtn.style.border='1.5px solid rgba(255,255,255,0.08)'; veoBtn.style.background='rgba(255,255,255,0.03)'; veoBtn.querySelector('div div:first-child').style.color='rgba(255,255,255,0.7)';
        if(durRow) durRow.style.display = 'block';
    } else {
        veoBtn.style.border='1.5px solid rgba(99,102,241,0.5)'; veoBtn.style.background='rgba(99,102,241,0.12)'; veoBtn.querySelector('div div:first-child').style.color='rgba(165,168,255,0.95)';
        grokBtn.style.border='1.5px solid rgba(255,255,255,0.08)'; grokBtn.style.background='rgba(255,255,255,0.03)'; grokBtn.querySelector('div div:first-child').style.color='rgba(255,255,255,0.7)';
        if(durRow) durRow.style.display = 'none';
    }
}

function selectExtendDuration(dur) {
    _extendDuration = dur;
    const b6=document.getElementById('ext-dur-6'), b10=document.getElementById('ext-dur-10');
    const active={border:'1.5px solid rgba(99,102,241,0.5)',background:'rgba(99,102,241,0.12)',color:'rgba(165,168,255,0.95)'};
    const inactive={border:'1.5px solid rgba(255,255,255,0.1)',background:'rgba(255,255,255,0.03)',color:'rgba(255,255,255,0.5)'};
    Object.assign(b6.style, dur===6?active:inactive);
    Object.assign(b10.style, dur===10?active:inactive);
}

async function submitExtend() {
    const token = getToken(); if(!token){ closeExtendModal(); openLoginModal(); return; }
    if(!_extendUUID){ toast('UUID lipsă — videoclipul nu are ID salvat.'); return; }
    const prompt = document.getElementById('ext-prompt')?.value?.trim() || '';
    const model_id = _extendModel === 'grok' ? 'grok-extend' : 'veo-extend';
    const ratio = '9:16';
    closeExtendModal();
    const jobId = ++jobCounter;
    activeJobs.set(jobId, { aborted: false, reader: null });
    const card = createJobCard(jobId, prompt || 'Extend video...', 'video', 1, ratio);
    document.getElementById('jobs-area').prepend(card);
    checkEmptyState();
    const maxSec = _extendModel === 'grok' ? 50 : 130;
    startEtaTimer(jobId, maxSec);
    markTaskActive(jobId, { type: 'extend', prompt, uuid: _extendUUID, model: model_id, ratio: '16:9', count: 1 });
    try {
        const fd = new FormData();
        fd.append('prompt', prompt); fd.append('model_id', model_id); fd.append('aspect_ratio', ratio);
        fd.append('number_of_videos', '1'); fd.append('ref_history', _extendUUID); fd.append('extend_duration', String(_extendDuration));
        setJobStatus(jobId, 'Se trimite la AI pentru extend...');
        const resp = await fetch('/api/media/video', { method:'POST', headers:{'Authorization':'Bearer '+token}, body:fd });
        if(!resp.ok){ const j = await resp.json().catch(()=>{}); throw new Error(j?.error||'Eroare server'); }
        const data = await readSSEJob(jobId, resp, {currentMode:'video', ratio, count:1});
        const { urls, uuids } = extractUrls(data);
        if(!urls?.length) throw new Error('Nu s-a generat video extend.');
        setJobDone(jobId, urls, ratio, 'video', uuids);
        if(!data?.saved_to_history) saveToSupabase(urls, prompt || 'Extend video', 'video', uuids);
        setTimeout(loadHistory, 2000);
    } catch(err) {
        let msg = err.message || '';
        if(msg === 'Failed to fetch' || msg.toLowerCase().includes('network')) msg = 'Conexiunea a fost întreruptă. Reîncearcă.';
        setJobError(jobId, msg);
    } finally {
        activeJobs.delete(jobId);
        try { const r = await fetch('/api/auth/me', { headers:{'Authorization':'Bearer '+token} }); if(r.ok){ const d = await r.json(); document.getElementById('nav-credits').innerText = d.user.credits; } } catch(e){}
    }
}

document.addEventListener('keydown', e => { if(e.key==='Escape' && document.getElementById('extend-modal').style.display==='flex') closeExtendModal(); });
document.addEventListener('keydown', e => { if(e.key==='Escape' && document.getElementById('scene-modal')?.style.display==='flex') closeSceneModal(); });

// ===================== KLING/SEEDANCE OPTIONS =====================
function updateKlingOptions() {
    const modelId = document.getElementById('model-sel')?.value || '';
    const m = MODEL_META[modelId] || {};
    const isPremium = m.crPerSec !== undefined || m.durCosts !== undefined || m.flatCost !== undefined;
        const hasDuration = isPremium && m.flatCost === undefined; // flatCost (motion) → no dur selector
    const isMotion = m.motion === true;

    const durSection = document.getElementById('kling-dur-section');
    const motionSection = document.getElementById('kling-motion-section');
    const frameSection = document.querySelector('.frames-section');

    if (durSection) {
        durSection.style.display = hasDuration ? '' : 'none';
        if (hasDuration) renderDurationBtns(modelId, m);
    }
    if (motionSection) motionSection.style.display = isMotion ? '' : 'none';
    if (frameSection)  frameSection.style.display  = isMotion ? 'none' : '';
    const motionImgSection = document.getElementById('kling-motion-image-section');
    if (motionImgSection) motionImgSection.style.display = isMotion ? '' : 'none';

    refreshBadges();
}

function renderDurationBtns(modelId, m) {
    const container = document.getElementById('kling-dur-btns');
    if (!container) return;

    let durs = [];
    if (m.fixedDurs) {
        durs = m.fixedDurs;
    } else if (m.durRange) {
        const [min, max] = m.durRange;
        for (let i = min; i <= max; i++) durs.push(i);
    }
    if (!durs.length) durs = [5];

    // Clamp vidDuration to valid options
    if (!durs.includes(vidDuration)) {
        vidDuration = durs.reduce((p,c) => Math.abs(c-vidDuration)<Math.abs(p-vidDuration)?c:p);
    }

    container.innerHTML = durs.map(d => {
        const isActive = d === vidDuration;
        const style = isActive
            ? 'background:rgba(251,146,60,0.2);border:1.5px solid rgba(251,146,60,0.5);color:rgba(251,196,60,0.95)'
            : 'background:rgba(255,255,255,0.03);border:1.5px solid rgba(255,255,255,0.1);color:rgba(255,255,255,0.5)';
        return `<button onclick="selectDuration(${d})" style="padding:6px 12px;border-radius:9px;font-size:0.75rem;font-weight:700;cursor:pointer;transition:all 0.18s;${style}">${d}s</button>`;
    }).join('');
}

function selectDuration(d) {
    vidDuration = d;
    const modelId = document.getElementById('model-sel')?.value || '';
    const m = MODEL_META[modelId] || {};
    if (m.crPerSec) renderDurationBtns(modelId, m);
    refreshBadges();
}

function handleRefVideoSelect(e) {
    const file = e.target.files[0]; if (!file) return;
    refVideoFile = file;
    const preview = document.getElementById('ref-video-name');
    if (preview) preview.textContent = file.name;
    const zone = document.getElementById('ref-video-zone');
    const previewEl = document.getElementById('ref-video-preview');
    if (zone) zone.style.display = 'none';
    if (previewEl) previewEl.style.display = 'flex';
    e.target.value = '';

    // Auto-detectează durata videoclipului de referință
    const url = URL.createObjectURL(file);
    const tmpVid = document.createElement('video');
    tmpVid.preload = 'metadata';
    tmpVid.onloadedmetadata = () => {
        URL.revokeObjectURL(url);
        const detectedDur = Math.ceil(tmpVid.duration) || 5;
        vidDuration = detectedDur;
        // Actualizează costul estimat în UI
        const costEl = document.getElementById('ref-video-cost');
        const modelId = document.getElementById('model-sel')?.value || '';
        const m = MODEL_META[modelId] || {};
        if (costEl && m.crPerSec) {
            const estCost = computeKlingCost(m, detectedDur);
            costEl.textContent = `~${estCost} credite (${detectedDur}s detectat)`;
        }
        refreshBadges();
    };
    tmpVid.src = url;
}

function removeRefVideo() {
    refVideoFile = null;
    vidDuration = 5;
    const zone = document.getElementById('ref-video-zone');
    const previewEl = document.getElementById('ref-video-preview');
    const costEl = document.getElementById('ref-video-cost');
    if (zone) zone.style.display = '';
    if (previewEl) previewEl.style.display = 'none';
    if (costEl) costEl.textContent = '';
    refreshBadges();
}

function handleMotionImageSelect(e) {
    const file = e.target.files[0]; if (!file) return;
    motionImageFile = file;
    document.getElementById('motion-image-name').textContent = file.name;
    document.getElementById('motion-image-zone').style.display = 'none';
    document.getElementById('motion-image-preview').style.display = 'flex';
    e.target.value = '';
}

function removeMotionImage() {
    motionImageFile = null;
    document.getElementById('motion-image-zone').style.display = '';
    document.getElementById('motion-image-preview').style.display = 'none';
}

// ═══════════════════════════════════════════════════════════════
// STORYBOARD — multi-scenă (Grok)
// ═══════════════════════════════════════════════════════════════
const STORYBOARD_MAX_SCENES = 10;
const STORYBOARD_MIN_SCENES = 2;
const STORYBOARD_MAX_TOTAL_SEC = 45;

function isStoryboardActive() {
    const modelId = document.getElementById('model-sel')?.value || '';
    return modelId === 'grok-storyboard';
}

function updateStoryboardUI() {
    const active = isStoryboardActive();
    const panel = document.getElementById('storyboard-panel');
    const promptPanel = document.getElementById('prompt-panel');
    const vcountPanel = document.getElementById('vcount-panel');
    const framesSection = document.querySelector('.frames-section');
    const durSection = document.getElementById('kling-dur-section');
    const motionSection = document.getElementById('kling-motion-section');
    const motionImgSection = document.getElementById('kling-motion-image-section');
    const sidebar = document.getElementById('sidebar-settings');

    if (panel) panel.style.display = active ? '' : 'none';
    if (promptPanel) promptPanel.style.display = active ? 'none' : '';
    if (vcountPanel) vcountPanel.style.display = active ? 'none' : '';
    // Lățim sidebar-ul pentru a încăpea mai confortabil scene cards
    if (sidebar) sidebar.classList.toggle('sidebar-wide', active);
    if (active) {
        // Ascundem restul secțiunilor video specifice
        if (framesSection) framesSection.style.display = 'none';
        if (durSection) durSection.style.display = 'none';
        if (motionSection) motionSection.style.display = 'none';
        if (motionImgSection) motionImgSection.style.display = 'none';
        renderScenesTable();
    }
    refreshBadges();
}

function renderScenesTable() {
    const list = document.getElementById('scenes-list');
    const emptyEl = document.getElementById('scenes-empty');
    const counter = document.getElementById('scenes-counter');
    const totalDurEl = document.getElementById('scenes-total-dur');
    const durPill = document.getElementById('scenes-dur-pill');
    const genBtn = document.getElementById('gen-btn');
    if (!list) return;

    const totalDur = storyboardScenes.reduce((s, x) => s + (x.duration||0), 0);

    if (counter) counter.textContent = storyboardScenes.length;
    if (totalDurEl) totalDurEl.textContent = `${totalDur}s/${STORYBOARD_MAX_TOTAL_SEC}s`;
    if (durPill) {
        durPill.classList.remove('dur-warn','dur-over');
        if (totalDur > STORYBOARD_MAX_TOTAL_SEC) durPill.classList.add('dur-over');
        else if (totalDur >= STORYBOARD_MAX_TOTAL_SEC - 6) durPill.classList.add('dur-warn');
    }

    if (storyboardScenes.length === 0) {
        list.innerHTML = '';
        list.style.display = 'none';
        if (emptyEl) emptyEl.style.display = '';
    } else {
        list.style.display = '';
        if (emptyEl) emptyEl.style.display = 'none';
        list.innerHTML = storyboardScenes.map((s, i) => {
            const isFirst = i === 0;
            const hasImg = isFirst && _storyboardFirstImageFile;
            return `
                <div class="scene-row">
                    <span class="scene-badge">${i+1}</span>
                    <div class="scene-body">
                        <div class="scene-prompt-text">${escHtml(s.prompt)}</div>
                        <div class="scene-meta-row">
                            <span class="dur-pill">${s.duration}s</span>
                            ${hasImg ? '<span class="scene-img-chip"><i class="fa-solid fa-image"></i> imagine start</span>' : ''}
                        </div>
                    </div>
                    <div class="scene-actions">
                        <button onclick="editScene(${i})" class="scene-btn" title="Editează"><i class="fa-solid fa-pen"></i></button>
                        <button onclick="removeScene(${i})" class="scene-btn scene-btn-danger" title="Șterge"><i class="fa-solid fa-trash"></i></button>
                    </div>
                </div>`;
        }).join('');
    }

    // Butonul Generate — dezactivat dacă scenele nu-s valide
    if (genBtn) {
        const validCount = storyboardScenes.length >= STORYBOARD_MIN_SCENES && storyboardScenes.length <= STORYBOARD_MAX_SCENES;
        const validDur = totalDur <= STORYBOARD_MAX_TOTAL_SEC && totalDur > 0;
        genBtn.disabled = !(validCount && validDur);
        genBtn.style.opacity = genBtn.disabled ? '0.5' : '';
        genBtn.style.cursor = genBtn.disabled ? 'not-allowed' : '';
    }
}

function openSceneModal(editIdx) {
    _editingSceneIdx = (typeof editIdx === 'number') ? editIdx : -1;
    const modal = document.getElementById('scene-modal');
    const title = document.getElementById('scene-modal-title');
    const promptEl = document.getElementById('scene-prompt');
    const totalDur = storyboardScenes.reduce((s, x) => s + (x.duration||0), 0);

    if (_editingSceneIdx >= 0) {
        const s = storyboardScenes[_editingSceneIdx];
        if (title) title.textContent = `Editează scena ${_editingSceneIdx + 1}`;
        if (promptEl) promptEl.value = s.prompt || '';
        selectSceneDuration(s.duration || 6);
    } else {
        // Add new
        if (storyboardScenes.length >= STORYBOARD_MAX_SCENES) {
            toast(`Maxim ${STORYBOARD_MAX_SCENES} scene.`);
            return;
        }
        if (title) title.textContent = `Adaugă scena ${storyboardScenes.length + 1}`;
        if (promptEl) promptEl.value = '';
        // Alegem automat durata care mai încape (6s dacă încape, altfel niciuna)
        const remainingSec = STORYBOARD_MAX_TOTAL_SEC - totalDur;
        selectSceneDuration(remainingSec >= 10 ? 6 : (remainingSec >= 6 ? 6 : 6));
    }
    updateSceneImageUI();
    modal.style.display = 'flex';
    requestAnimationFrame(() => { modal.style.opacity = '1'; });
    setTimeout(() => { try { promptEl?.focus(); } catch(e){} }, 200);
}

function closeSceneModal(e) {
    if (e && e.target !== document.getElementById('scene-modal') && e.type !== 'click') return;
    const modal = document.getElementById('scene-modal');
    modal.style.opacity = '0';
    setTimeout(() => { modal.style.display = 'none'; }, 250);
    _editingSceneIdx = -1;
}

let _sceneModalDuration = 6;
function selectSceneDuration(d) {
    _sceneModalDuration = d;
    const b6 = document.getElementById('scene-dur-6');
    const b10 = document.getElementById('scene-dur-10');
    if (!b6 || !b10) return;
    const active = 'background:rgba(236,72,153,0.15);border:1.5px solid rgba(236,72,153,0.5);color:rgba(244,114,182,0.95)';
    const inactive = 'background:rgba(255,255,255,0.03);border:1.5px solid rgba(255,255,255,0.1);color:rgba(255,255,255,0.5)';
    b6.style.cssText = `flex:1;padding:9px;border-radius:10px;font-size:0.8rem;font-weight:700;cursor:pointer;transition:all 0.2s;${d===6?active:inactive}`;
    b10.style.cssText = `flex:1;padding:9px;border-radius:10px;font-size:0.8rem;font-weight:700;cursor:pointer;transition:all 0.2s;${d===10?active:inactive}`;
}

function updateSceneImageUI() {
    // Image reference vizibilă doar pentru prima scenă (add cu 0 scene existente, sau edit idx=0)
    const section = document.getElementById('scene-image-section');
    if (!section) return;
    const isFirst = (_editingSceneIdx === 0) || (_editingSceneIdx === -1 && storyboardScenes.length === 0);
    section.style.display = isFirst ? '' : 'none';
    if (isFirst) {
        const zone = document.getElementById('scene-image-zone');
        const preview = document.getElementById('scene-image-preview');
        const nameEl = document.getElementById('scene-image-name');
        if (_storyboardFirstImageFile) {
            if (zone) zone.style.display = 'none';
            if (preview) preview.style.display = 'flex';
            if (nameEl) nameEl.textContent = _storyboardFirstImageFile.name;
        } else {
            if (zone) zone.style.display = '';
            if (preview) preview.style.display = 'none';
        }
    }
}

function handleSceneImageSelect(e) {
    const file = e.target.files[0]; if (!file) return;
    _storyboardFirstImageFile = file;
    updateSceneImageUI();
    e.target.value = '';
}

function removeSceneImage() {
    _storyboardFirstImageFile = null;
    updateSceneImageUI();
}

function saveScene() {
    const promptEl = document.getElementById('scene-prompt');
    const prompt = (promptEl?.value || '').trim();
    if (!prompt) { toast('Scrie un prompt pentru scenă.'); try { promptEl?.focus(); } catch(e){} return; }
    if (prompt.length > 800) { toast('Promptul scenei e prea lung (max 800 caractere).'); return; }
    const duration = _sceneModalDuration === 10 ? 10 : 6;

    // Verificare buget total
    const currentTotal = storyboardScenes.reduce((s, x, i) => s + (i === _editingSceneIdx ? 0 : x.duration), 0);
    if (currentTotal + duration > STORYBOARD_MAX_TOTAL_SEC) {
        toast(`Durată totală ar depăși ${STORYBOARD_MAX_TOTAL_SEC}s (actual ${currentTotal}s + ${duration}s).`);
        return;
    }

    if (_editingSceneIdx >= 0) {
        storyboardScenes[_editingSceneIdx] = { prompt, duration };
    } else {
        if (storyboardScenes.length >= STORYBOARD_MAX_SCENES) { toast(`Maxim ${STORYBOARD_MAX_SCENES} scene.`); return; }
        storyboardScenes.push({ prompt, duration });
    }
    closeSceneModal();
    renderScenesTable();
    refreshBadges();
}

function editScene(idx) { openSceneModal(idx); }

function removeScene(idx) {
    storyboardScenes.splice(idx, 1);
    // Dacă a fost scoasă prima scenă și există imagine globală, o păstrăm pentru noua primă scenă (sau o lăsăm)
    if (storyboardScenes.length === 0) _storyboardFirstImageFile = null;
    renderScenesTable();
    refreshBadges();
}

function clearAllScenes() {
    if (storyboardScenes.length === 0) return;
    if (!confirm('Ștergi toate scenele?')) return;
    storyboardScenes = [];
    _storyboardFirstImageFile = null;
    renderScenesTable();
    refreshBadges();
}

// ===================== GENERATE =====================
async function generate(){
    const token=getToken(); if(!token){ openLoginModal(); return; }
    const _activeModelId = document.getElementById('model-sel')?.value || '';

    // ── Storyboard branch ──
    if (_activeModelId === 'grok-storyboard') {
        if (storyboardScenes.length < STORYBOARD_MIN_SCENES) { toast(`Minim ${STORYBOARD_MIN_SCENES} scene necesare.`); return; }
        if (storyboardScenes.length > STORYBOARD_MAX_SCENES) { toast(`Maxim ${STORYBOARD_MAX_SCENES} scene.`); return; }
        const totalDur = storyboardScenes.reduce((s,x)=>s+x.duration,0);
        if (totalDur > STORYBOARD_MAX_TOTAL_SEC) { toast(`Durată totală depășește ${STORYBOARD_MAX_TOTAL_SEC}s.`); return; }
        const sbRatio = document.querySelector('input[name="vratio"]:checked')?.value || '16:9';
        const jobId = ++jobCounter;
        activeJobs.set(jobId, { aborted: false, reader: null });
        const firstPrompt = storyboardScenes[0].prompt;
        const cardLabel = `🎬 Storyboard · ${storyboardScenes.length} scene: ${firstPrompt}`;
        const card = createJobCard(jobId, cardLabel, 'video', 1, sbRatio);
        document.getElementById('jobs-area').prepend(card);
        checkEmptyState();
        if (window.innerWidth < 768) {
            const sidebar = document.getElementById('sidebar-settings');
            if (sidebar && !sidebar.classList.contains('translate-y-full')) toggleMobileSettings();
        }
        startEtaTimer(jobId, 300); // storyboard: until 5 min
        markTaskActive(jobId, { type: 'storyboard', prompt: firstPrompt, model: 'grok-storyboard', ratio: sbRatio, count: 1 });
        runStoryboardJob(jobId, sbRatio, token);
        return;
    }

    const promptText=document.getElementById('prompt-in').value.trim();
    if(!promptText){ toast('Introdu un prompt descriptiv!'); return; }
    const currentMode=mode;
    const ratio=currentMode==='image'?(document.querySelector('input[name="ratio"]:checked')?.value||'9:16'):(document.querySelector('input[name="vratio"]:checked')?.value||'16:9');
    const refs=[...uploadedRefs];
    const _isMotionModel = _activeModelId.includes('motion');
    const startFrame = currentMode==='video' ? (_isMotionModel ? motionImageFile : startFrameFile) : null;
    const endFrame   = currentMode==='video' ? (_isMotionModel ? null : endFrameFile) : null;
    const jobId=++jobCounter;
    activeJobs.set(jobId,{aborted:false,reader:null});
    const count = currentMode==='image' ? imgCount : vidCount;
    const card=createJobCard(jobId,promptText,currentMode,count,ratio);
    document.getElementById('jobs-area').prepend(card);
    checkEmptyState();
    if(window.innerWidth<768){
        const sidebar=document.getElementById('sidebar-settings');
        if(sidebar&&!sidebar.classList.contains('translate-y-full')) toggleMobileSettings();
    }
    runJob(jobId,promptText,currentMode,ratio,refs,token,startFrame,endFrame);
    if(currentMode==='video'){
        const modelId = document.getElementById('model-sel')?.value || '';
        const maxSec = modelId.startsWith('grok-') ? 50 : (modelId.startsWith('kling-') || modelId === 'seedance-fast-480p') ? 300 : 130;
        startEtaTimer(jobId, maxSec);
        markTaskActive(jobId, { type: 'video', prompt: promptText, model: modelId, ratio, count: vidCount });
    } else {
        markTaskActive(jobId, { type: 'image', prompt: promptText, ratio, count: imgCount });
    }
}

// ── Storyboard job runner ──
async function runStoryboardJob(jobId, ratio, token) {
    const scenesCopy = storyboardScenes.map(s => ({ prompt: s.prompt, duration: s.duration, mode: 'custom' }));
    const sceneCount = scenesCopy.length;
    try {
        const fd = new FormData();
        fd.append('scenes', JSON.stringify(scenesCopy));
        fd.append('aspect_ratio', ratio);
        fd.append('model_id', 'grok-storyboard');
        if (_storyboardFirstImageFile) {
            fd.append('first_image', _storyboardFirstImageFile, _storyboardFirstImageFile.name);
        }
        setJobStatus(jobId, `Se generează storyboard cu ${sceneCount} scene...`);
        const resp = await fetch('/api/media/video-storyboard', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + token },
            body: fd
        });
        if (!resp.ok) { const j = await resp.json().catch(()=>{}); throw new Error(j?.error || 'Eroare server'); }
        const data = await readSSEJob(jobId, resp, { currentMode: 'video', ratio, count: 1 });
        const { urls, uuids } = extractUrls(data);
        if (!urls?.length) throw new Error('Nu s-a generat storyboard.');
        setJobDone(jobId, urls, ratio, 'video', uuids);
        if (!data?.saved_to_history) await saveToSupabase(urls, `🎬 Storyboard (${sceneCount} scene) — ${scenesCopy[0].prompt}`, 'video', uuids);
        setTimeout(loadHistory, 3000);
    } catch (err) {
        let msg = err.message || '';
        if (msg === 'Failed to fetch' || msg === 'NetworkError when attempting to fetch resource.' || msg.toLowerCase().includes('network') || msg === 'Load failed') {
            msg = 'Conexiunea a fost întreruptă. Verifică internetul și reîncearcă.';
        } else if (msg === 'Nu s-a generat storyboard.') {
            msg = 'Nu s-a putut genera storyboard. Reîncearcă sau modifică scenele.';
        }
        setJobError(jobId, msg);
    } finally {
        activeJobs.delete(jobId);
        try {
            const r = await fetch('/api/auth/me', { headers: { 'Authorization': 'Bearer ' + token } });
            if (r.ok) {
                const d = await r.json();
                document.getElementById('nav-credits').innerText = d.user.credits;
                const bar = document.getElementById('nav-credits-bar'); if (bar) bar.textContent = d.user.credits;
            }
        } catch (e) {}
    }
}

// ===================== TASK PERSISTENCE =====================
const TASK_KEY = 'viralio_active_task';
const TASK_MAX_AGE = 15 * 60 * 1000;

function markTaskActive(jobId, meta) {
    try { localStorage.setItem(TASK_KEY, JSON.stringify({ jobId, startedAt: Date.now(), ...meta })); } catch(e) {}
}

function clearActiveTask() {
    try { localStorage.removeItem(TASK_KEY); } catch(e) {}
}

// ★ FIX BUG 2: restore model info so ETA badge renders correctly on refresh
function tryRestoreTask() {
    let task;
    try { const raw = localStorage.getItem(TASK_KEY); if (!raw) return; task = JSON.parse(raw); } catch(e) { clearActiveTask(); return; }
    const age = Date.now() - task.startedAt;
    if (age > TASK_MAX_AGE) { clearActiveTask(); return; }

    const restoredMode = (task.type === 'image') ? 'image' : 'video';
    const restoredRatio = task.ratio || (restoredMode === 'image' ? '9:16' : '16:9');
    const restoredCount = task.count || 1;
    const restoredPrompt = task.prompt || '…';
    const restoredModel = task.model || '';

    // ★ FIX: temporarily set model-sel to task.model so buildShimmerLoading picks up correct ETA
    const modelSel = document.getElementById('model-sel');
    const prevModel = modelSel?.value;
    if (restoredModel && modelSel) {
        // Ensure the option exists before setting
        // Rebuilt select might not have this model if mode changed — safe check
        const opt = modelSel.querySelector(`option[value="${restoredModel}"]`);
        if (opt) { modelSel.value = restoredModel; } else { rebuildModelSelect(restoredMode); }
    }

    const restoredJobId = ++jobCounter;
    activeJobs.set(restoredJobId, { aborted: false, reader: null, restored: true });

    const card = createJobCard(restoredJobId, restoredPrompt, restoredMode, restoredCount, restoredRatio);
    const jobsArea = document.getElementById('jobs-area');
    if (jobsArea) { jobsArea.prepend(card); checkEmptyState(); }

    // Restore previous model selection
    if (prevModel && modelSel) modelSel.value = prevModel;

    setJobStatus(restoredJobId, 'Se recuperează generarea după refresh…');

    if (restoredMode === 'video' || task.type === 'extend') {
        const elapsed = Math.floor(age / 1000);
        const maxSec = (restoredModel||'').startsWith('grok') ? 50 : ((restoredModel||'').startsWith('kling')||(restoredModel||'')==='seedance-fast-480p') ? 300 : 130;
        startEtaTimer(restoredJobId, Math.max(maxSec - elapsed, 5));
    }

    _pollForResult(restoredJobId, restoredMode, restoredRatio, restoredPrompt, task.startedAt);
}

async function _pollForResult(jobId, jobMode, ratio, prompt, startedAt) {
    const token = getToken();
    if (!token) { setJobError(jobId, 'Sesiune expirată după refresh. Regenerează.'); clearActiveTask(); activeJobs.delete(jobId); return; }

    const MAX_POLLS = 120;
    const INTERVAL  = 5000;

    for (let i = 0; i < MAX_POLLS; i++) {
        await new Promise(r => setTimeout(r, INTERVAL));
        const job = activeJobs.get(jobId);
        if (!job) return;
        try {
            const res = await fetch(`/api/media/history?type=${jobMode === 'extend' ? 'video' : jobMode}&page=1&limit=20`, {
                headers: { 'Authorization': 'Bearer ' + token }
            });
            if (!res.ok) continue;
            const data = await res.json();
            const found = (data.history || []).find(item => {
                const itemTs = new Date(item.createdAt).getTime();
                // Căutăm videoclipuri create DUPĂ momentul start-ului taskului (cu 3s toleranță pentru clock skew)
                return itemTs >= startedAt - 3000;
            });
            if (found) {
                const batchItems = (data.history || []).filter(item => {
                    const ts = new Date(item.createdAt).getTime();
                    return ts >= startedAt - 3000 && (item.prompt || '') === (found.prompt || '');
                });
                const urls  = batchItems.map(i => i.supabaseUrl || i.originalUrl).filter(Boolean);
                const uuids = batchItems.map(i => i.uuid || '');
                setJobDone(jobId, urls.length ? urls : [found.supabaseUrl || found.originalUrl], ratio, jobMode === 'extend' ? 'video' : jobMode, uuids);
                clearActiveTask(); setTimeout(loadHistory, 1000); activeJobs.delete(jobId);
                return;
            }
        } catch(e) {}
    }
    setJobError(jobId, 'Generarea a durat prea mult sau a eșuat. Verifică istoricul.');
    clearActiveTask(); activeJobs.delete(jobId);
}

// ===================== THEME TOGGLE =====================
function toggleTheme(){
    const html = document.documentElement;
    const isLight = html.classList.toggle('light');
    localStorage.setItem('viralio-theme', isLight ? 'light' : 'dark');
}
(function(){ const saved = localStorage.getItem('viralio-theme'); if(saved === 'light') document.documentElement.classList.add('light'); })();

// ===================== MOBILE SIDEBAR =====================
function toggleMobileSettings(){
    const sidebar=document.getElementById('sidebar-settings');
    const overlay=document.getElementById('mobile-overlay');
    const btn=document.getElementById('mobile-settings-btn');
    const sup=document.getElementById('support-buttons');
    if(sidebar.classList.contains('translate-y-full')){
        sidebar.classList.remove('translate-y-full'); overlay.classList.remove('opacity-0','pointer-events-none');
        btn.classList.add('translate-y-24','opacity-0'); if(sup) sup.classList.add('opacity-0','pointer-events-none');
    } else {
        sidebar.classList.add('translate-y-full'); overlay.classList.add('opacity-0','pointer-events-none');
        btn.classList.remove('translate-y-24','opacity-0'); if(sup) sup.classList.remove('opacity-0','pointer-events-none');
    }
}

// ===================== AUTO-REFRESH LA DEPLOY NOU =====================
(function(){
    let knownVersion = null;
    const CHECK_INTERVAL = 5 * 60 * 1000;
    async function checkVersion(){
        try {
            const res = await fetch('/api/version', { cache: 'no-store' });
            if(!res.ok) return;
            const { version } = await res.json();
            if(knownVersion === null){ knownVersion = version; return; }
            if(version !== knownVersion){
                const areJobsActive = activeJobs && activeJobs.size > 0;
                if(!areJobsActive){ location.reload(); } else { setTimeout(checkVersion, 30000); }
            }
        } catch(e){}
    }
    setTimeout(() => { checkVersion(); setInterval(checkVersion, CHECK_INTERVAL); }, 10000);
})();
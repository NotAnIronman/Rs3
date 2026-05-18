const WIKI = 'https://runescape.wiki/api.php';
let allMonsters = [];
let inDropsView = false;
let searchTimer = null;
let currentMode = 'npc';

// Navigation history (remember last view per mode)
// Each entry: { mode, type, name, title, scrollY }
// type: 'browser' | 'drops' | 'disambig'
const navHistory = { npc: null, item: null };
function saveNavState(type, name, title, scrollY) {
  navHistory[currentMode] = { mode: currentMode, type, name, title, scrollY: scrollY||0 };
}
function getSavedNav() { return navHistory[currentMode] || null; }

// Settings
const settings = { debugLog: false, ocrCanvas: false, opacity: 100 };
function saveSetting(k,v){ settings[k]=v; try{localStorage.setItem('dvSettings',JSON.stringify(settings));}catch(e){} }
(function(){
  try{
    const s=JSON.parse(localStorage.getItem('dvSettings')||'{}');
    if(s.debugLog!==undefined)settings.debugLog=s.debugLog;
    if(s.ocrCanvas!==undefined)settings.ocrCanvas=s.ocrCanvas;
    if(typeof s.opacity==='number')settings.opacity=Math.max(30,Math.min(100,s.opacity));
  }catch(e){}
})();
const DEBUG_OVERLAY_HEIGHT=180;
function applyToggleUI(){
  document.getElementById('toggle-debug').classList.toggle('on',settings.debugLog);
  document.getElementById('toggle-ocr-canvas').classList.toggle('on',settings.ocrCanvas);
  const sl=document.getElementById('opacity-slider'),vl=document.getElementById('opacity-value');
  if(sl)sl.value=settings.opacity; if(vl)vl.textContent=settings.opacity+'%';
  document.body.style.opacity=(settings.opacity/100).toString();
  getOrCreateDebugOverlay().style.display=settings.debugLog?'block':'none';
  const oc=getOrCreateOcrCanvas(); oc.style.display=settings.ocrCanvas?'block':'none';
  oc.style.bottom=settings.debugLog?(DEBUG_OVERLAY_HEIGHT+'px'):'0px';
}
function getOrCreateDebugOverlay(){
  let el=document.getElementById('section-debug');
  if(!el){el=document.createElement('div');el.id='section-debug';el.style.cssText='position:fixed;bottom:0;left:0;right:0;background:rgba(0,0,0,.88);color:#00ff00;font-family:monospace;font-size:11px;line-height:1.5;padding:6px 8px;height:'+DEBUG_OVERLAY_HEIGHT+'px;overflow-y:auto;z-index:9999;white-space:pre-wrap;box-sizing:border-box;';el.style.display='none';document.body.appendChild(el);}
  return el;
}
function getOrCreateOcrCanvas(){
  let el=document.getElementById('dbg-ocr-canvas');
  if(!el){el=document.createElement('canvas');el.id='dbg-ocr-canvas';el.style.cssText='position:fixed;bottom:0;right:4px;border:2px solid #f5c518;image-rendering:pixelated;z-index:9999;background:#222;max-width:98vw;min-width:40px;min-height:20px;';el.style.display='none';document.body.appendChild(el);}
  return el;
}
document.getElementById('settings-btn').addEventListener('click',function(e){
  e.stopPropagation();
  const p=document.getElementById('settings-panel'),b=document.getElementById('settings-btn');
  p.classList.toggle('open'); b.classList.toggle('active',p.classList.contains('open')); applyToggleUI();
});
document.addEventListener('click',function(){
  document.getElementById('settings-panel').classList.remove('open');
  document.getElementById('settings-btn').classList.remove('active');
});
document.getElementById('settings-panel').addEventListener('click',e=>e.stopPropagation());
document.getElementById('toggle-debug').addEventListener('click',function(){saveSetting('debugLog',!settings.debugLog);applyToggleUI();});
document.getElementById('toggle-ocr-canvas').addEventListener('click',function(){saveSetting('ocrCanvas',!settings.ocrCanvas);applyToggleUI();});
document.getElementById('opacity-slider').addEventListener('input',function(e){saveSetting('opacity',parseInt(e.target.value,10)||100);applyToggleUI();});

// Debug
const DEBUG_MAX_LINES=200;
function dbg(s){
  console.log('[DropViewer]',s);
  const o=getOrCreateDebugOverlay();
  const esc=String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  o.innerHTML+=esc+'<br>';
  const lines=o.innerHTML.split('<br>');
  if(lines.length>DEBUG_MAX_LINES)o.innerHTML=lines.slice(-DEBUG_MAX_LINES).join('<br>');
  o.scrollTop=o.scrollHeight;
}
function setStatus(type,msg){const el=document.getElementById('status');el.className=type;el.textContent=msg;}

// Mode tabs
document.querySelectorAll('.mode-tab').forEach(tab=>{
  tab.addEventListener('click',()=>{
    const mode=tab.dataset.mode;
    if(mode===currentMode)return;
    currentMode=mode;
    document.querySelectorAll('.mode-tab').forEach(t=>t.classList.toggle('active',t===tab));
    const inp=document.getElementById('search-input');
    inp.placeholder=mode==='item'?'Search items...':'Search NPCs...';
    setStatus('','');
    // Restore last view for this mode if we have one
    const saved=getSavedNav();
    if(saved&&saved.type==='drops'&&saved.name){
      inp.value=saved.name;
      if(mode==='item') lookupItemSources(saved.name);
      else lookup(saved.name);
    } else {
      inp.value='';
      showBrowser();
      if(mode==='npc'){
        renderNpcList('');
        document.getElementById('list-label').textContent=allMonsters.length?'All RS3 monsters':'Loading...';
        document.getElementById('list-count').textContent=allMonsters.length?allMonsters.length+' total':'';
      } else {
        document.getElementById('npc-list').innerHTML='<div id="npc-empty">Type an item name and press Search.<br><small>e.g. "Dragon bones", "Abyssal whip"</small></div>';
        document.getElementById('list-label').textContent='Item drop source lookup';
        document.getElementById('list-count').textContent='';
      }
    }
  });
});

// View switching
function showBrowser(){
  document.getElementById('npc-browser').style.display='flex';
  document.getElementById('disambig').style.display='none';
  document.getElementById('drops').style.display='none';
  document.getElementById('back-btn').style.display='none';
  document.getElementById('subtitle').textContent=currentMode==='item'?'Search any item':'Search any NPC';
  document.getElementById('npc-img').style.display='none';
  document.getElementById('titlebar-logo').style.display='inline';
  inDropsView=false;
}
function showDisambig(){
  document.getElementById('npc-browser').style.display='none';
  document.getElementById('disambig').style.display='block';
  document.getElementById('drops').style.display='none';
  document.getElementById('back-btn').style.display='block';
  inDropsView=false;
}
function showDrops(){
  document.getElementById('npc-browser').style.display='none';
  document.getElementById('disambig').style.display='none';
  document.getElementById('drops').style.display='block';
  document.getElementById('back-btn').style.display='block';
  inDropsView=true;
}

// Monster list loader
async function loadMonsterList(){
  document.getElementById('list-status').textContent='⏳ Loading monster list...';
  let monsters=[],offset=0;const limit=500;
  try{
    while(true){
      const query=`[[Monster JSON::+]]|?Has name|limit=${limit}|offset=${offset}`;
      const url=`${WIKI}?action=ask&query=${encodeURIComponent(query)}&format=json&origin=*`;
      const r=await fetch(url); const d=await r.json();
      const results=d?.query?.results; if(!results)break;
      const keys=Object.keys(results); if(keys.length===0)break;
      for(const key of keys){
        const page=results[key];
        const name=page?.printouts?.['Has name']?.[0]||page.fulltext;
        if(name&&!name.includes('/'))monsters.push({name,fulltext:page.fulltext});
      }
      dbg(`Loaded ${monsters.length} monsters (offset ${offset})`);
      document.getElementById('list-status').textContent=`⏳ Loading... ${monsters.length} found`;
      if(keys.length<limit)break; offset+=limit;
    }
    const seen=new Set();
    allMonsters=monsters.filter(m=>{if(seen.has(m.name))return false;seen.add(m.name);return true;}).sort((a,b)=>a.name.localeCompare(b.name));
    document.getElementById('list-status').textContent='';
    document.getElementById('list-label').textContent='All RS3 monsters';
    document.getElementById('list-count').textContent=allMonsters.length+' total';
    if(currentMode==='npc')renderNpcList('');
  }catch(e){
    dbg('Monster list load error: '+e.message);
    document.getElementById('list-status').textContent='⚠️ Could not load full list — use search box above';
    allMonsters=POPULAR_NPCS.map(n=>({name:n.name,fulltext:n.name,cat:n.cat,icon:n.icon}));
    if(currentMode==='npc')renderNpcList('');
  }
}

// ── Popular NPC fallback list ──────────────────────────────
const POPULAR_NPCS = [
//-Bosses-
  { name:'Abomination',icon:'⚔️',cat:'Boss' },
  { name:'Amascut, the Devourer',icon:'🐱',cat:'Boss' },
  { name:'The Ambassador',icon:'🪼',cat:'Boss' },
  { name:'Araxxi',icon:'🕷️',cat:'Boss' },
  { name:'Arch-Glacor',icon:'❄️',cat:'Boss' },
  { name:'Barrows - Rise of the Six',icon:'👻',cat:'Boss' },
  { name:'Beastmaster Durzag',icon:'⚔️',cat:'Boss' },
  { name:'Black stone dragon',icon:'🐉',cat:'Boss' },
  { name:'Chaos Elemental',icon:'👻',cat:'Boss' },
  { name:'Commander Zilyana',icon:'⚔️',cat:'Boss' },
  { name:'Corporeal Beast',icon:'👻',cat:'Boss' },
  { name:'Croesus',icon:'🌳',cat:'Boss' },
  { name:'Dagannoth Kings',icon:'🦖',cat:'Boss' },
  { name:'Exiled Kalphite Queen',icon:'🦂',cat:'Boss' },
  { name:'Flesh-hatcher Mhekarnahz',icon:'😈',cat:'Boss' },
  { name:'Gate of Elidinis',icon:'⚒️',cat:'Boss' },
  { name:'General Graardor',icon:'⚔️',cat:'Boss' },
  { name:'Giant mole',icon:'🐭',cat:'Boss' },
  { name:'Gregorovic',icon:'⚔️',cat:'Boss' },
  { name:'Har-Aken',icon:'🔥',cat:'Boss' },
  { name:'Helwyr',icon:'🐺',cat:'Boss' },
  { name:'Hermod',icon:'⚔️',cat:'Boss' },
  { name:'Ivar, King of Bones',icon:'💀',cat:'Boss' },
  { name:'Kalphite King',icon:'🦂',cat:'Boss' },
  { name:'Kalphite Queen',icon:'🦂',cat:'Boss' },
  { name:'King Black Dragon',icon:'🐉',cat:'Boss' },
  { name:'Kerapac, the Bound',icon:'🐉',cat:'Boss' },
  { name:"K'ril Tsutsaroth",icon:'😈',cat:'Boss' },
  { name:"Kree'arra",icon:'🦅',cat:'Boss' },
  { name:'Legio Primus',icon:'⚔️',cat:'Boss' },
  { name:'Magister',icon:'👻',cat:'Boss' },
  { name:'Nakatra',icon:'⚔️',cat:'Boss' },
  { name:'Nex',icon:'⚔️',cat:'Boss' },
  { name:'Nex: Angel of Death',icon:'💀',cat:'Boss' },
  { name:'Queen Black Dragon',icon:'🐉',cat:'Boss' },
  { name:'Raksha',icon:'🦖',cat:'Boss' },
  { name:'Rasial',icon:'💀',cat:'Boss' },
  { name:'Rex Matriarchs',icon:'🦖',cat:'Boss' },
  { name:'Seiryu',icon:'🐉',cat:'Boss' },
  { name:'Silverquill, the Dreadhog',icon:'⚔️',cat:'Boss' },
  { name:'Solak, Guardian of the Grove',icon:'🌳',cat:'Boss' },
  { name:'Telos, the Warden',icon:'⚔️',cat:'Boss' },
  { name:'TzKal-Zuk',icon:'🔥',cat:'Boss' },
  { name:'Twin Furies',icon:'⚔️',cat:'Boss' },
  { name:'Vindicta',icon:'🐉',cat:'Boss' },
  { name:'Vorago',icon:'🪨',cat:'Boss' },
  { name:'Vorkath',icon:'🐉',cat:'Boss' },
  { name:'Yakamaru',icon:'🪼',cat:'Boss' },
  { name:"Zamorak, Lord of Chaos",icon:'😈',cat:'Boss' },
//-Slayer-
  { name:'Aberrant spectre', icon:'👻', cat:'Slayer' },
  { name:'Abyssal beast', icon:'😈', cat:'Slayer' },
  { name:'Abyssal demon', icon:'😈', cat:'Slayer' },
  { name:'Abyssal lord', icon:'😈', cat:'Slayer' },
  { name:'Abyssal savage', icon:'😈', cat:'Slayer' },
  { name:'Acheron mammoth', icon:'🐘', cat:'Slayer' },
  { name:'Airut', icon:'🐗', cat:'Slayer' },
  { name:'Anagami', icon:'🐲', cat:'Slayer' },
  { name:'Aquanite', icon:'💧', cat:'Slayer' },
  { name:'Arhat', icon:'🐲', cat:'Slayer' },
  { name:'Armoured phantom', icon:'👻', cat:'Slayer' },
  { name:'Automaton Generator', icon:'🤖', cat:'Slayer' },
  { name:'Automaton Guardian', icon:'🤖', cat:'Slayer' },
  { name:'Automaton Tracer', icon:'🤖', cat:'Slayer' },

  { name:'Banshee', icon:'👻', cat:'Slayer' },
  { name:'Basilisk', icon:'🐍', cat:'Slayer' },
  { name:'Beastmaster\'s hound', icon:'🐕', cat:'Slayer' },
  { name:'Bladed muspah', icon:'🧛', cat:'Slayer' },
  { name:'Blood nihil', icon:'🩸', cat:'Slayer' },
  { name:'Bloodveld', icon:'🩸', cat:'Slayer' },
  { name:'Brine rat', icon:'🐀', cat:'Slayer' },
  { name:'Brutish dinosaur', icon:'🦕', cat:'Slayer' },
  { name:'Bulbour crawler', icon:'⚔️', cat:'Slayer' },

  { name:'Camel warrior', icon:'🐪', cat:'Slayer' },
  { name:'Capsarius', icon:'💎', cat:'Slayer' },
  { name:'Cave bug', icon:'🐛', cat:'Slayer' },
  { name:'Cave crawler', icon:'🐜', cat:'Slayer' },
  { name:'Cave horror', icon:'😱', cat:'Slayer' },
  { name:'Cave slime', icon:'🟢', cat:'Slayer' },
  { name:'Cockatrice', icon:'🐔', cat:'Slayer' },
  { name:'Corrupted kalphite guardian', icon:'🪲', cat:'Slayer' },  
  { name:'Corrupted kalphite marauder', icon:'🪲', cat:'Slayer' },
  { name:'Corrupted lizard', icon:'🦎', cat:'Slayer' },
  { name:'Corrupted scarab', icon:'🪲', cat:'Slayer' },
  { name:'Corrupted scorpion', icon:'🦂', cat:'Slayer' },
  { name:'Corrupted worker', icon:'👨‍🌾', cat:'Slayer' },
  { name:'Crawling hand', icon:'✋', cat:'Slayer' },
  { name:'Crocodile akh', icon:'🐊', cat:'Slayer' },

  { name:'Dark beast', icon:'🐺', cat:'Slayer' },
  { name:'Desert lizard', icon:'🦎', cat:'Slayer' },
  { name:'Desert strykewyrm', icon:'🐍', cat:'Slayer' },
  { name:'Devil snare', icon:'🥀', cat:'Slayer' },
  { name:'Dragonstone dragon', icon:'🐲', cat:'Slayer' },
  { name:'Dust devil', icon:'🌪️', cat:'Slayer' },

  { name:'Edimmu', icon:'🧟', cat:'Slayer' },

  { name:'Feline akh', icon:'🐈', cat:'Slayer' },
  { name:'Feral Dinosaur', icon:'🦕', cat:'Slayer' },
  { name:'Fever spider', icon:'🕷️', cat:'Slayer' },
  { name:'Force muspah', icon:'🧛', cat:'Slayer' },

  { name:'Ganodermic beast', icon:'🍄', cat:'Slayer' },
  { name:'Ganodermic runt', icon:'🍄', cat:'Slayer' },
  { name:'Gargoyle', icon:'🗿', cat:'Slayer' },
  { name:'Gelatinous abomination', icon:'🪼', cat:'Slayer' },
  { name:'Gladius', icon:'🤺', cat:'Slayer' },
  { name:'Gorilla akh', icon:'🦍', cat:'Slayer' },
  { name:'Grifolapine', icon:'🍄', cat:'Slayer' },
  { name:'Grifolaroo', icon:'🍄', cat:'Slayer' },

  { name:'Harpie bug swarm', icon:'🪰', cat:'Slayer' },
  { name:'Hydrix dragon', icon:'🐲', cat:'Slayer' },

  { name:'Ice nihil', icon:'❄️', cat:'Slayer' },
  { name:'Ice strykewyrm', icon:'❄️', cat:'Slayer' },
  { name:'Imperial mage akh', icon:'✨', cat:'Slayer' },
  { name:'Imperial ranger akh', icon:'🏹', cat:'Slayer' },
  { name:'Imperial warrior akh', icon:'⚔️', cat:'Slayer' },
  { name:'Infernal mage', icon:'🧙‍♂️', cat:'Slayer' },

  { name:'Jelly', icon:'🧊', cat:'Slayer' },
  { name:'Jungle strykewyrm', icon:'🐍', cat:'Slayer' },

  { name:'Killerwatt', icon:'⚡', cat:'Slayer' },
  { name:'Kurask', icon:'🌿', cat:'Slayer' },

  { name:'Lampenflora', icon:'🪔', cat:'Slayer' },
  { name:'Lava strykewyrm', icon:'🌋', cat:'Slayer' },
  { name:'Legiones', icon:'💎', cat:'Slayer' },
  { name:'Liverworts', icon:'🌺', cat:'Slayer' },
  { name:'Luminous snaggler', icon:'🌿', cat:'Slayer' },

  { name:'Mighty banshee', icon:'🎧', cat:'Slayer' },
  { name:'Mogre', icon:'👹', cat:'Slayer' },
  { name:'Molanisk', icon:'🐌', cat:'Slayer' },
  { name:'Moss golem', icon:'🗿', cat:'Slayer' },
  { name:'Mutated bloodveld', icon:'🩸', cat:'Slayer' },
  { name:'Mutated jadinko baby', icon:'🦎', cat:'Slayer' },
  { name:'Mutated jadinko guard', icon:'🦎', cat:'Slayer' },
  { name:'Mutated jadinko male', icon:'🦎', cat:'Slayer' },
  { name:'Mutated zygomite', icon:'🍄', cat:'Slayer' },

  { name:'Nechryael', icon:'😈', cat:'Slayer' },
  { name:'Night spider', icon:'🕷️', cat:'Slayer' },
  { name:'Nightmare', icon:'🌙', cat:'Slayer' },
  { name:'Nodon artificer', icon:'🐉', cat:'Slayer' },
  { name:'Nodon enforcer', icon:'🐲', cat:'Slayer' },
  { name:'Nodon engineer', icon:'🐉', cat:'Slayer' },
  { name:'Nodon guard', icon:'🐲', cat:'Slayer' },
  { name:'Nodon hunter', icon:'🐉', cat:'Slayer' },

  { name:'Onyx dragon', icon:'🐲', cat:'Slayer' },

  { name:'Profane Scabarite', icon:'🔥', cat:'Slayer' },
  { name:'Pyrefiend', icon:'🐞', cat:'Slayer' },

  { name:'Ripper demon', icon:'👹', cat:'Slayer' },
  { name:'Ripper dinosaur', icon:'🦖', cat:'Slayer' },  
  { name:'Risen ghost', icon:'👻', cat:'Slayer' },
  { name:'Rockslug', icon:'🐌', cat:'Slayer' },
  { name:'Rorarius', icon:'💎', cat:'Slayer' },

  { name:'Sakadagami', icon:'💧', cat:'Slayer' },
  { name:'Salawa akh', icon:'🐩', cat:'Slayer' },
  { name:'Scarab akh', icon:'🪲', cat:'Slayer' },
  { name:'Scutarius', icon:'🛡️', cat:'Slayer' },
  { name:'Seeker', icon:'👁️', cat:'Slayer' },
  { name:'Shadow nihil', icon:'🌑', cat:'Slayer' },
  { name:'Siege engine', icon:'🚂', cat:'Slayer' },
  { name:'Skeletal wyvern', icon:'☠️', cat:'Slayer' },
  { name:'Slasher Demon', icon:'👹', cat:'Slayer' },
  { name:'Smoke nihil', icon:'💨', cat:'Slayer' },
  { name:'Sotapanna', icon:'💧', cat:'Slayer' },
  { name:'Soulgazer', icon:'👁️', cat:'Slayer' },
  { name:'Spiritual guardian', icon:'🧝', cat:'Slayer' },
  { name:'Spiritual mage', icon:'🧝‍♂️', cat:'Slayer' },
  { name:'Spiritual ranger', icon:'🧝‍♀️', cat:'Slayer' },
  { name:'Spiritual warrior', icon:'🧞', cat:'Slayer' },

  { name:'Terror dog', icon:'🐕', cat:'Slayer' },
  { name:'Throwing muspah', icon:'🧛', cat:'Slayer' },
  { name:'Turoth', icon:'🐉', cat:'Slayer' },

  { name:'Unspeakable horror', icon:'🎭', cat:'Slayer' },

  { name:'Venomous dinosaur', icon:'🦖', cat:'Slayer' },
  { name:'Vinecrawler', icon:'🌿', cat:'Slayer' },

  { name:'Wall beast', icon:'🧱', cat:'Slayer' },
  { name:'Warped terrorbird', icon:'🐓', cat:'Slayer' },
  { name:'Warped tortoise', icon:'🐢', cat:'Slayer' },
  { name:'Wyvern', icon:'🐲', cat:'Slayer' },

//-Dungeons-
  { name:'Dragonkin Laboratory',icon:'⚔️',cat:'Dungeon' },
  { name:'Sanctum of Rebirth',icon:'⚔️',cat:'Dungeon' },
  { name:'Temple of Aminishi',icon:'⚔️',cat:'Dungeon' },
  { name:'The Shadow Reef',icon:'⚔️',cat:'Dungeon' },
  { name:'The Zamorakian Undercity',icon:'⚔️',cat:'Dungeon' },
];

function renderNpcList(filter){
  const list=document.getElementById('npc-list');
  const q=filter.toLowerCase().trim();
  const source=allMonsters.length>0?allMonsters:POPULAR_NPCS;
  const filtered=q?source.filter(n=>n.name.toLowerCase().includes(q)).slice(0,100):source.slice(0,200);
  if(filtered.length===0){
    list.innerHTML=`<div id="npc-empty">No matches for "<strong>${filter}</strong>"<br><small>Press Search to look it up on the wiki</small></div>`;
    return;
  }
  const frag=document.createDocumentFragment();
  for(const npc of filtered){
    const el=document.createElement('div');el.className='npc-item';
    el.innerHTML=`<span class="npc-icon">${npc.icon||'👾'}</span><span class="npc-name">${npc.name}</span>${npc.cat?`<span class="npc-cat">${npc.cat}</span>`:''}`;
    el.addEventListener('click',()=>lookup(npc.fulltext||npc.name));
    frag.appendChild(el);
  }
  list.innerHTML=''; list.appendChild(frag);
}

// Disambiguation
async function checkDisambig(title){
  const url=`${WIKI}?action=query&titles=${encodeURIComponent(title)}&prop=pageprops&ppprop=disambiguation&format=json&origin=*`;
  const r=await fetch(url);const d=await r.json();
  const pages=d?.query?.pages; if(!pages)return false;
  const page=Object.values(pages)[0];
  return page?.pageprops?.hasOwnProperty('disambiguation')??false;
}
async function getDisambigLinks(title){
  const url=`${WIKI}?action=parse&page=${encodeURIComponent(title)}&prop=links&format=json&origin=*`;
  const r=await fetch(url);const d=await r.json();
  return (d?.parse?.links||[]).filter(l=>l.ns===0).map(l=>l['*']).filter(l=>!l.includes('disambiguation'));
}
function showDisambigOptions(title,links,msg){
  document.getElementById('disambig-msg').textContent=msg||`"${title}" refers to multiple pages. Which one?`;
  const c=document.getElementById('disambig-options');c.innerHTML='';
  for(const link of links){
    const el=document.createElement('div');el.className='disambig-option';el.textContent=link;
    el.addEventListener('click',()=>currentMode==='item'?lookupItemSources(link):lookupPage(link));
    c.appendChild(el);
  }
  showDisambig();document.getElementById('subtitle').textContent='Choose a page';setStatus('','');
}

// Suggest alternatives
function editDistance(a,b){
  a=a.toLowerCase();b=b.toLowerCase();const m=a.length,n=b.length;
  const dp=Array.from({length:m+1},(_,i)=>Array.from({length:n+1},(_,j)=>i||j));
  for(let i=1;i<=m;i++)for(let j=1;j<=n;j++)dp[i][j]=a[i-1]===b[j-1]?dp[i-1][j-1]:1+Math.min(dp[i-1][j],dp[i][j-1],dp[i-1][j-1]);
  return dp[m][n];
}
function scoreAlternative(s,q){
  const sl=s.toLowerCase().trim(),ql=q.toLowerCase().trim();
  const meta=/\(storyline\)|\(book\)|\(music\)|\(recipe\)|\(item\)|\(quest\)|\(object\)|\(disambiguation\)/i.test(s)?500:0;
  const base=sl.replace(/\s*\([^)]*\)\s*/g,'').trim();
  if(base===ql)return-200+meta;
  if(sl.startsWith(ql+' ')||sl===ql)return-100+editDistance(sl,ql)+meta;
  const re=new RegExp('\\b'+ql.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\b','i');
  if(re.test(sl))return editDistance(sl,ql)+meta;
  return editDistance(sl,ql)+sl.length*0.3+meta;
}
async function suggestAlternatives(title){
  try{
    const url=`${WIKI}?action=opensearch&search=${encodeURIComponent(title)}&limit=30&namespace=0&format=json&origin=*`;
    const r=await fetch(url);const d=await r.json();
    let suggestions=(d[1]||[]).filter(s=>s!==title);
    if(!suggestions.length){setStatus('err',`⚠️ No drop table found for "${title}".`);return;}
    suggestions.sort((a,b)=>scoreAlternative(a,title)-scoreAlternative(b,title));
    suggestions=suggestions.slice(0,12);
    setStatus('busy',`No drops on "${title}" — pick a related page:`);
    showDisambigOptions(title,suggestions,`"${title}" has no drop table. Did you mean one of these?`);
  }catch(e){setStatus('err',`⚠️ No drop table found for "${title}".`);}
}

// Helpers
function fixIconUrl(src){
  if(!src)return'';let url=src;
  if(url.startsWith('/'))url='https://runescape.wiki'+url;
  url=url.replace(/\/thumb\//,'/').replace(/\/\d+px-[^/]+$/,'');
  return url;
}
function stripNotes(text){return text.replace(/\[\s*[a-z]?\s*\d+\s*\]/gi,'').trim();}
function rarityClass(r){
  if(!r)return{label:'?',cls:'b-unknown'};const s=r.toLowerCase().trim();
  if(s==='always')return{label:'Always',cls:'b-always'};
  const m=s.match(/(\d[\d,.]*)\/(\d[\d,.]*)/);
  if(m){
    const chance=parseFloat(m[1].replace(/,/g,''))/parseFloat(m[2].replace(/,/g,''));
    const label=r.split(/[;(]/)[0].trim();
    if(chance>=0.25)return{label,cls:'b-common'};
    if(chance>=0.03)return{label,cls:'b-uncommon'};
    if(chance>=0.003)return{label,cls:'b-rare'};
    if(chance>=0.0003)return{label,cls:'b-vr'};
    return{label,cls:'b-ultra'};
  }
  if(s.includes('very rare')||s.includes('ultra'))return{label:r,cls:'b-vr'};
  if(s.includes('rare'))return{label:r,cls:'b-rare'};
  if(s.includes('uncommon'))return{label:r,cls:'b-uncommon'};
  if(s.includes('common'))return{label:r,cls:'b-common'};
  return{label:r,cls:'b-unknown'};
}

// Strip level suffix
// stripLevelSuffix: removes the combat level from NPC examine text.
// Returns { text, hadLevel } where hadLevel=true means actual level
// content (digits and/or a "level" word) was removed — not just the
// trailing OCR border artifact (lone "l" / "1" / "i").
// The examine box right edge always bleeds a lone "l" or "1" into the
// OCR result for BOTH NPCs and items, so stripping that artifact alone
// is NOT a reliable NPC signal. We only set hadLevel=true when we also
// removed digits or a "level"-like word.
function stripLevelSuffix(raw){
  if(!raw)return{text:raw,hadLevel:false};
  raw=raw.trim();
  var hadLevel=false;

  // Step 1: strip trailing bracket group e.g. "(level-85)" or "(56)"
  // This is unambiguously level content if it contains a digit.
  var bracketMatch=raw.match(/\s*[\(\[{<][^\)\]}>]*\d[^\)\]}>]*[\)\]}>]\s*$/);
  if(bracketMatch){raw=raw.slice(0,raw.length-bracketMatch[0].length).trim();hadLevel=true;}

  // Step 2: strip "level"-like word followed by digits
  // e.g. "level-85", "leyel- 56", "Uevels", "levels"
  var dm=raw.match(/\d+/);
  if(dm){
    var i=dm.index-1;
    while(i>=0&&/[\s\-:.,;(]/.test(raw[i]))i--;
    var we=i+1; while(i>=0&&/[a-zA-Z]/.test(raw[i]))i--;
    var ws=i+1; var word=raw.slice(ws,we);
    if(word.length>=3&&word.length<=8&&/[eua]/i.test(word)&&/[lsvy]$/i.test(word)){
      var ca=ws-1; while(ca>=0&&/[\s\-:.,;(]/.test(raw[ca]))ca--;
      raw=raw.slice(0,ca+1);
      hadLevel=true;
    } else if(dm){
      // bare digits with no preceding word — still a level
      raw=raw.replace(/[\s\-]+\d+\s*$/,'').trim();
      if(raw.length<dm.index+dm[0].length)hadLevel=true;
    }
  }

  // Step 3: strip trailing lone OCR artifact (l / L / 1 / i / j / I)
  // This fires for BOTH npcs and items — do NOT set hadLevel here.
  raw=raw.replace(/(?<=[a-zA-Z\d])\s+[lLjJiI1]\s*$/,'').trim();

  // Step 4: clean up any remaining trailing punctuation/junk
  raw=raw.replace(/[\s\-|_.,;:!?]+$/,'').trim();

  return{text:raw,hadLevel};
}
function resolveOcrName(raw){
  if(!raw)return raw;
  // Strip level suffix (returns {text, hadLevel}); also strip trailing artifacts
  var stripped=stripLevelSuffix(raw).text;
  stripped=stripped.trim().replace(/(\s+\d+)+\s*$/,'').trim().replace(/\s+[lLjJiI1]\s*$/,'').trim();
  if(!allMonsters.length)return stripped;
  const lower=stripped.toLowerCase();
  for(const m of allMonsters)if(m.name.toLowerCase()===lower)return m.name;
  const parts=stripped.split(/\s+/);
  while(parts.length>1){parts.pop();const sub=parts.join(' ').toLowerCase();for(const m of allMonsters){if(m.name.toLowerCase()===sub){dbg('OCR "'+stripped+'"→"'+m.name+'"');return m.name;}}}
  return stripped;
}

// Main lookup (NPC mode)
// NOTE: does NOT check currentMode — callers are responsible for
// setting currentMode before calling. OCR paths call lookupPage()
// directly to bypass any mode confusion entirely.
async function lookup(name){
  if(!name)return;
  setStatus('busy',`🔍 Searching for "${name}"...`);
  showDrops();
  document.getElementById('subtitle').textContent=name;
  document.getElementById('search-input').value=name;
  document.getElementById('drops').innerHTML='';
  let title=null;
  try{
    const r=await fetch(`${WIKI}?action=opensearch&search=${encodeURIComponent(name)}&limit=5&format=json&origin=*`);
    const d=await r.json(); if(d[1]?.length)title=d[1][0];
  }catch(e){setStatus('err','❌ Network error: '+e.message);return;}
  if(!title){setStatus('err',`⚠️ "${name}" not found.`);return;}
  await lookupPage(title);
}
async function lookupPage(title){
  setStatus('busy',`📄 Loading: ${title}...`);
  document.getElementById('subtitle').textContent=title;
  const npcImg=document.getElementById('npc-img'),logo=document.getElementById('titlebar-logo');
  npcImg.style.display='none'; logo.style.display='inline';
  try{const isD=await checkDisambig(title);if(isD){const links=await getDisambigLinks(title);showDisambigOptions(title,links);return;}}catch(e){}
  const[imgUrl,html]=await Promise.all([fetchNpcImage(title),fetchPageHtml(title)]);
  if(imgUrl){npcImg.src=imgUrl;npcImg.style.display='block';logo.style.display='none';npcImg.onerror=()=>{npcImg.style.display='none';logo.style.display='inline';};}
  if(!html){setStatus('err','❌ Empty page.');return;}
  const{variants}=extractDrops(html);
  const total=variants.reduce((s,v)=>s+v.sections.reduce((ss,sec)=>ss+sec.rows.length,0),0);
  if(total===0){await suggestAlternatives(title);return;}
  setStatus('ok',`✅ ${total} drops for ${title}`);
  showDrops(); renderAllSections(variants);
  saveNavState('drops', title, title, 0);
}
async function fetchNpcImage(title){
  try{
    const r=await fetch(`${WIKI}?action=query&prop=pageimages&titles=${encodeURIComponent(title)}&pithumbsize=80&piprop=thumbnail&format=json&origin=*`);
    const d=await r.json();const pages=d?.query?.pages;if(!pages)return null;
    return Object.values(pages)[0]?.thumbnail?.source||null;
  }catch(e){return null;}
}
async function fetchPageHtml(title){
  try{
    const r=await fetch(`${WIKI}?action=parse&page=${encodeURIComponent(title)}&prop=text&format=json&origin=*`);
    const d=await r.json(); return d?.parse?.text?.['*']||'';
  }catch(e){return'';}
}

// ══════════════════════════════════════════════════════════
// DROP TABLE PARSER (charm-aware)
// ══════════════════════════════════════════════════════════
function extractDrops(rawHtml){
  const div=document.createElement('div'); div.innerHTML=rawHtml;
  const dropHeadings=[]; const seenEls=new Set();
  for(const span of div.querySelectorAll('span[id]')){
    if(span.id.toLowerCase().includes('drop')){
      const el=span.closest('h2,h3,h4');
      if(el&&!seenEls.has(el)){seenEls.add(el);dropHeadings.push({el,text:el.textContent.trim()});}
    }
  }
  for(const h of div.querySelectorAll('h2,h3,h4')){
    if(h.textContent.toLowerCase().includes('drop')&&!seenEls.has(h)){seenEls.add(h);dropHeadings.push({el:h,text:h.textContent.trim()});}
  }
  dbg('Drop headings: '+dropHeadings.map(h=>h.text).join(' | '));
  if(dropHeadings.length===0)return{variants:[]};
  const variants=[];
  for(const heading of dropHeadings){
    const isHard=heading.text.toLowerCase().includes('hard');
    let label=heading.text.replace(/\bdrops?\b/gi,'').replace(/\btable\b/gi,'').replace(/[()[\]]/g,'').replace(/\s+/g,' ').trim()||'Drops';
    const sections=parseSectionsFromHeading(div,heading.el);
    dbg(`Variant "${label}": ${sections.length} sections`);
    if(sections.length>0)variants.push({label,isHard,sections});
  }
  const uniqueLabels=new Set(variants.map(v=>v.label));
  variants.forEach(v=>{v.showLabel=uniqueLabels.size>1;});
  return{variants};
}
function parseSectionsFromHeading(div,startEl){
  const startLevel=parseInt(startEl.tagName[1]);
  const allEls=Array.from(div.querySelectorAll('h2,h3,h4,table'));
  let startIdx=allEls.indexOf(startEl);
  if(startIdx===-1)startIdx=allEls.findIndex(el=>el===startEl||el.contains(startEl)||startEl.contains(el));
  if(startIdx===-1)return[];
  const sections=[]; let sectionName='Drops';
  for(let i=startIdx+1;i<allEls.length;i++){
    const el=allEls[i],tag=el.tagName.toLowerCase(),level=parseInt(tag[1]);
    if((tag==='h2'||tag==='h3'||tag==='h4')&&level<=startLevel)break;
    if(tag==='h3'||tag==='h4')sectionName=stripNotes(el.textContent);
    if(tag==='table'){
      const rows=parseTable(el);
      if(rows.length>0){
        const existing=sections.find(s=>s.name===sectionName);
        if(existing)existing.rows.push(...rows);
        else sections.push({name:sectionName,rows});
      }
    }
  }
  return sections;
}

// Column layout detection
// RS3 wiki drop tables have a header row with th cells.
// Typical order: Item | Quantity | Rarity | Price  (sometimes GE price omitted)
// We detect col indices so we never mistake Price for Quantity.
function detectCols(table){
  const headerRow=table.querySelector('tr');
  if(!headerRow)return null;
  const ths=Array.from(headerRow.querySelectorAll('th,td'));
  if(ths.length<2)return null;
  const cols={item:-1,qty:-1,rarity:-1,price:-1};
  for(let i=0;i<ths.length;i++){
    const t=ths[i].textContent.toLowerCase().trim();
    if((t.includes('item')||t.includes('name'))&&cols.item===-1)cols.item=i;
    else if((t.includes('quant')||t.includes('amount')||t==='qty'||t==='#')&&cols.qty===-1)cols.qty=i;
    else if((t.includes('rarity')||t.includes('chance'))&&cols.rarity===-1)cols.rarity=i;
    else if((t.includes('price')||t.includes('value')||t.includes('coin')||t.includes('gp'))&&cols.price===-1)cols.price=i;
  }
  // If we detected at least item+rarity, trust the layout
  if(cols.item!==-1&&cols.rarity!==-1)return cols;
  return null; // fall back to heuristic scan
}

// isCharmTable
// A charm table is one whose *data* rows are predominantly charm entries.
// We require: header contains "Charm" as a standalone word in a TH,
// OR ≥3 of the first 5 data-rows contain a "charm" link.
// This prevents false-positive on tables that merely mention charms.
function isCharmTable(table){
  // Check for a TH whose full text is just "Charm" (case-insensitive)
  for(const th of table.querySelectorAll('th')){
    if(/^\s*charm\s*$/i.test(th.textContent))return true;
  }
  // Count data rows that have a charm link
  let charmRows=0,dataRows=0;
  for(const tr of table.querySelectorAll('tr')){
    if(!tr.querySelector('td'))continue;
    dataRows++;
    for(const a of tr.querySelectorAll('a'))
      if(/\bcharm\b/i.test(a.textContent)){charmRows++;break;}
    if(dataRows>=5)break;
  }
  return dataRows>0&&charmRows>=Math.min(3,dataRows);
}

// parseCharmTable
// Handles both layouts the RS3 wiki uses:
// Layout A: one charm per <tr>  (most monsters)
// Layout B: all 4 charms as columns in a SINGLE <tr> (compact tables)
// Strategy: collect all (charmName, qty, rarity) triples found anywhere
// in the table by scanning every cell. We don't care about row boundaries.
function parseCharmTable(table){
  const CHARM_NAMES=['gold charm','crimson charm','blue charm','green charm'];
  // Accumulate results in insertion order, keyed by normalised charm name
  const found=new Map(); // normName → {name,img,qty,rarity}

  // Pass 1: find all charm name cells and their images
  for(const cell of table.querySelectorAll('td,th')){
    for(const a of cell.querySelectorAll('a')){
      const txt=stripNotes(a.textContent.trim());
      const norm=txt.toLowerCase().replace(/\s+/g,' ');
      if(CHARM_NAMES.includes(norm)&&!found.has(norm)){
        const img=cell.querySelector('img');
        found.set(norm,{
          name:txt,
          img:img?fixIconUrl(img.getAttribute('src')||img.src||''):'',
          qty:'',rarity:''
        });
      }
    }
  }

  if(found.size===0){
    dbg('parseCharmTable: no charm names found, falling back');
    return[];
  }

  // Pass 2: walk the table row by row.
  // For each row determine which charm it belongs to (by the charm link present),
  // then pick up qty and rarity from the other cells in that row.
  for(const tr of table.querySelectorAll('tr')){
    if(!tr.querySelector('td'))continue;
    // Which charm does this row belong to?
    let rowCharm=null;
    for(const a of tr.querySelectorAll('a')){
      const norm=stripNotes(a.textContent.trim()).toLowerCase().replace(/\s+/g,' ');
      if(found.has(norm)){rowCharm=norm;break;}
    }
    if(!rowCharm)continue;
    const entry=found.get(rowCharm);

    for(const cell of tr.querySelectorAll('td,th')){
      const text=stripNotes(cell.textContent.trim());
      // Skip the charm-name cell itself
      if(cell.querySelector('a[href]')){
        const aText=stripNotes(cell.querySelector('a').textContent.trim()).toLowerCase().replace(/\s+/g,' ');
        if(CHARM_NAMES.includes(aText))continue;
      }
      // Rarity fraction
      if(!entry.rarity&&/^(always|\d[\d,]*\s*\/\s*[\d,]+)/i.test(text)){
        entry.rarity=stripNotes(text.split(';')[0].trim());
        continue;
      }
      // Quantity (plain integer, not a fraction)
      if(!entry.qty&&/^\d[\d,]*$/.test(text)&&text.length<12&&!text.includes('/')){
        entry.qty=text;
      }
    }
  }

  const rows=Array.from(found.values()).filter(r=>r.name);
  dbg('parseCharmTable: '+rows.length+' entries: '+rows.map(r=>r.name+'('+r.rarity+')').join(', '));
  return rows;
}

// parseTable (standard, non-charm)
// Uses header-detected column layout when available so that the
// Price column (e.g. "558–837") is never mistaken for Quantity.
function parseTable(table){
  if(isCharmTable(table))return parseCharmTable(table);

  const cols=detectCols(table);
  const trs=Array.from(table.querySelectorAll('tr'));

  // Skip the header row if we have column info
  const dataRows=cols?trs.slice(1):trs;

  const rows=[];
  for(const tr of dataRows){
    const allCells=Array.from(tr.querySelectorAll('td,th'));
    const tdCells=tr.querySelectorAll('td');
    if(tdCells.length<1)continue;

    let name='',qty='',rarity='',img='';

    if(cols){
      // Header-guided extraction
      const get=i=>(i>=0&&i<allCells.length)?allCells[i]:null;

      // Item name + icon
      const itemCell=get(cols.item>=0?cols.item:0);
      if(itemCell){
        if(!img){const i=itemCell.querySelector('img');if(i)img=fixIconUrl(i.getAttribute('src')||i.src||'');}
        const a=itemCell.querySelector('a');
        if(a){const c=stripNotes(a.textContent.trim());if(c.length>1&&c.length<80)name=c;}
        if(!name)name=stripNotes(itemCell.textContent.trim());
      }

      // Quantity — only from the qty column, never from price column
      if(cols.qty>=0){
        const qCell=get(cols.qty);
        if(qCell){
          // Quantity cell may contain "2–3 (noted)" — extract the number range
          const raw=stripNotes(qCell.textContent.trim());
          // Strip trailing parenthetical like "(noted)" "(unnoted)"
          const cleaned=raw.replace(/\s*\([^)]*\)/g,'').trim();
          if(cleaned)qty=raw; // keep full string including "(noted)" for display
        }
      }

      // Rarity
      if(cols.rarity>=0){
        const rCell=get(cols.rarity);
        if(rCell){rarity=stripNotes(rCell.textContent.trim().split(';')[0].split('\n')[0]);}
      }

      // Image fallback: scan all cells if not found in item cell
      if(!img){
        for(const cell of allCells){
          const i=cell.querySelector('img');
          if(i){img=fixIconUrl(i.getAttribute('src')||i.src||'');break;}
        }
      }

    } else {
      // Heuristic extraction (no recognisable header)
      for(const cell of allCells){
        const text=stripNotes(cell.textContent.trim());
        if(!img){const i=cell.querySelector('img');if(i)img=fixIconUrl(i.getAttribute('src')||i.src||'');}
        if(!name&&cell.querySelector('a')){
          const a=cell.querySelector('a'),c=stripNotes(a.textContent.trim());
          if(c.length>1&&c.length<80&&!c.match(/^\d+$/))name=c;
        }
        if(!rarity&&/^(always|\d[\d,]*\s*\/\s*[\d,]+)/i.test(text)){rarity=stripNotes(text.split(';')[0].trim());continue;}
        // Only grab qty if it doesn't look like a coin value (no commas in 3+ digit numbers
        // unless it's a range). Large comma-numbers like "1,234" are prices, not quantities.
        if(!qty&&/^[\d,–\-]+(\s*\([^)]*\))?$/.test(text)&&text.length<30){
          // Reject if it looks like a coin value: >4 digits with commas e.g. "5,000"
          const noComma=text.replace(/,/g,'').replace(/[^0-9]/g,'');
          if(noComma.length<=5)qty=text;
        }
      }
    }

    if(!name||name.length>80)continue;
    const nl=name.toLowerCase();
    if(nl==='item'||nl==='items'||nl==='drop'||nl==='name')continue;
    rows.push({name,qty,rarity,img});
  }

  const seen=new Set();
  return rows.filter(r=>{if(seen.has(r.name))return false;seen.add(r.name);return true;});
}

// Render NPC drop sections
function renderAllSections(variants){
  const container=document.getElementById('drops'); container.innerHTML='';
  const showLabels=variants.length>1;
  for(const variant of variants){
    if(!variant.sections.length)continue;
    if(showLabels){
      const color=variant.isHard?'#5c1a1a':'#1a3a5c';
      const hdr=document.createElement('div');
      hdr.style.cssText=`background:${color};padding:5px 12px;font-size:11px;font-weight:700;letter-spacing:1px;color:#fff;border-bottom:2px solid rgba(0,0,0,.3);text-transform:uppercase;position:sticky;top:0;z-index:2;`;
      hdr.textContent=(variant.isHard?'💀 ':'⚔ ')+variant.label;
      container.appendChild(hdr);
    }
    for(const sec of variant.sections){if(sec.rows.length===0)continue;container.appendChild(makeSectionBlock(sec));}
  }
}
function makeSectionBlock(sec,onRowClick){
  const wrapper=document.createElement('div'); wrapper.className='section-wrapper';
  const startCollapsed=sec.rows.length>25;
  const hdr=document.createElement('div'); hdr.className='section-hdr'+(startCollapsed?' collapsed':'');
  hdr.innerHTML=`<span class="hdr-left"><span class="chevron">▼</span><span>${sec.name}</span></span><span class="row-count">${sec.rows.length} items</span>`;
  const body=document.createElement('div'); body.className='section-body'+(startCollapsed?' collapsed':'');
  for(const row of sec.rows)body.appendChild(makeDropRow(row,onRowClick));
  if(!startCollapsed)requestAnimationFrame(()=>{body.style.maxHeight=body.scrollHeight+'px';});
  hdr.addEventListener('click',()=>{
    const collapsed=hdr.classList.toggle('collapsed');
    if(collapsed){body.style.maxHeight=body.scrollHeight+'px';requestAnimationFrame(()=>body.classList.add('collapsed'));}
    else{body.classList.remove('collapsed');body.style.maxHeight=body.scrollHeight+'px';body.addEventListener('transitionend',()=>{if(!hdr.classList.contains('collapsed'))body.style.maxHeight='none';},{once:true});}
  });
  wrapper.appendChild(hdr); wrapper.appendChild(body); return wrapper;
}
function makeDropRow(row,onRowClick){
  const el=document.createElement('div');
  el.className='drop-row'+(onRowClick?' clickable':'');
  if(onRowClick)el.addEventListener('click',()=>onRowClick(row));
  if(row.img){const img=document.createElement('img');img.className='item-img';img.src=row.img;img.alt=row.name;img.onerror=function(){this.replaceWith(placeholder(row.name));};el.appendChild(img);}
  else el.appendChild(placeholder(row.name));
  const info=document.createElement('div');info.className='item-info';
  const nm=document.createElement('div');nm.className='item-name';nm.textContent=row.name;info.appendChild(nm);
  if(row.qty){const q=document.createElement('div');q.className='item-qty';q.textContent='x'+row.qty;info.appendChild(q);}
  el.appendChild(info);
  if(row.rarity){const{label,cls}=rarityClass(row.rarity);const wrap=document.createElement('div');wrap.className='rarity';const badge=document.createElement('span');badge.className='badge '+cls;badge.textContent=label;wrap.appendChild(badge);el.appendChild(wrap);}
  return el;
}
function placeholder(name){const d=document.createElement('div');d.className='item-placeholder';d.textContent=(name||'?').charAt(0).toUpperCase();return d;}

// Rarity → sort value (higher = more common)
// Returns a float 0–1 representing drop chance, or special values:
// 2 = Always,  -1 = unknown
function rarityToChance(r){
  if(!r)return-1;
  const s=r.toLowerCase().trim();
  if(s==='always')return 2;
  const m=s.match(/(\d[\d,.]*)\/(\d[\d,.]*)/);
  if(m){
    const num=parseFloat(m[1].replace(/,/g,'')),den=parseFloat(m[2].replace(/,/g,''));
    if(den>0)return num/den;
  }
  if(s.includes('always'))return 2;
  if(s.includes('very rare'))return 0.001;
  if(s.includes('rare'))return 0.01;
  if(s.includes('uncommon'))return 0.1;
  if(s.includes('common'))return 0.5;
  return -1;
}

// NPC drop row — clicking an item opens Item Sources
function makeDropRow(row,onRowClick){
  const el=document.createElement('div');
  // Items in NPC drops are always clickable to open item sources
  el.className='drop-row clickable';
  el.title='Find all sources for "'+row.name+'"';
  el.addEventListener('click',()=>{
    if(onRowClick){onRowClick(row);return;}
    // Cross-mode navigate: switch to item tab and look up sources
    const prevMode=currentMode;
    currentMode='item';
    document.querySelectorAll('.mode-tab').forEach(t=>t.classList.toggle('active',t.dataset.mode==='item'));
    document.getElementById('search-input').placeholder='Search items...';
    lookupItemSources(row.name);
  });
  if(row.img){const img=document.createElement('img');img.className='item-img';img.src=row.img;img.alt=row.name;img.onerror=function(){this.replaceWith(placeholder(row.name));};el.appendChild(img);}
  else el.appendChild(placeholder(row.name));
  const info=document.createElement('div');info.className='item-info';
  const nm=document.createElement('div');nm.className='item-name';nm.textContent=row.name;info.appendChild(nm);
  if(row.qty){const q=document.createElement('div');q.className='item-qty';q.textContent='x'+row.qty;info.appendChild(q);}
  el.appendChild(info);
  if(row.rarity){const{label,cls}=rarityClass(row.rarity);const wrap=document.createElement('div');wrap.className='rarity';const badge=document.createElement('span');badge.className='badge '+cls;badge.textContent=label;wrap.appendChild(badge);el.appendChild(wrap);}
  // Small arrow hint pointing to item sources
  const arrow=document.createElement('span');arrow.style.cssText='color:var(--dim);font-size:10px;flex-shrink:0;margin-left:1px;';arrow.textContent='›';el.appendChild(arrow);
  return el;
}

// ══════════════════════════════════════════════════════════
// ITEM → DROP SOURCES LOOKUP
// ══════════════════════════════════════════════════════════
async function lookupItemSources(name){
  if(!name)return;
  setStatus('busy',`🔍 Finding drop sources for "${name}"...`);
  showDrops();
  document.getElementById('subtitle').textContent=name;
  document.getElementById('search-input').value=name;
  document.getElementById('drops').innerHTML='';
  document.getElementById('npc-img').style.display='none';
  document.getElementById('titlebar-logo').style.display='inline';
  let title=null;
  try{
    const r=await fetch(`${WIKI}?action=opensearch&search=${encodeURIComponent(name)}&limit=5&format=json&origin=*`);
    const d=await r.json(); if(d[1]?.length)title=d[1][0];
  }catch(e){setStatus('err','❌ Network error: '+e.message);return;}
  if(!title){setStatus('err',`⚠️ "${name}" not found.`);return;}
  try{const isD=await checkDisambig(title);if(isD){const links=await getDisambigLinks(title);showDisambigOptions(title,links,`"${title}" could be multiple items. Which one?`);return;}}catch(e){}
  const[imgUrl,html]=await Promise.all([fetchNpcImage(title),fetchPageHtml(title)]);
  if(imgUrl){const ni=document.getElementById('npc-img');ni.src=imgUrl;ni.style.display='block';document.getElementById('titlebar-logo').style.display='none';ni.onerror=()=>{ni.style.display='none';document.getElementById('titlebar-logo').style.display='inline';};}
  if(!html){setStatus('err','❌ Empty page.');return;}
  const sources=extractDropSources(html,title);
  if(sources.length===0){
    setStatus('err',`⚠️ No "Drop Sources" table found for "${title}".`);
    document.getElementById('drops').innerHTML=`<div style="padding:16px;text-align:center;color:var(--dim);font-size:11px;"><div style="font-size:24px;margin-bottom:8px;">🔍</div><div style="color:var(--text);margin-bottom:4px;">${title}</div><div>No drop sources found on the wiki for this item.</div><div style="margin-top:8px;">Try the <strong>NPC Drops</strong> tab to look up a monster directly.</div></div>`;
    return;
  }
  setStatus('ok',`✅ ${sources.length} source${sources.length===1?'':'s'} drop "${title}"`);
  renderDropSources(sources,title);
  saveNavState('drops', title, title, 0);
}

// Extract drop sources from item page HTML
function extractDropSources(rawHtml,itemTitle){
  const div=document.createElement('div'); div.innerHTML=rawHtml;
  let sourceHeading=null;
  for(const h of div.querySelectorAll('h2,h3,h4')){
    const t=h.textContent.toLowerCase();
    if(t.includes('drop source')||(t.includes('source')&&t.includes('drop'))){sourceHeading=h;break;}
  }
  if(!sourceHeading){
    for(const span of div.querySelectorAll('span[id]')){
      const id=span.id.toLowerCase();
      if(id.includes('source')){sourceHeading=span.closest('h2,h3,h4');if(sourceHeading)break;}
    }
  }
  dbg('Drop sources heading: '+(sourceHeading?sourceHeading.textContent.trim():'NOT FOUND'));
  if(!sourceHeading)return extractDropSourcesFromAnyTable(div);
  const allEls=Array.from(div.querySelectorAll('h2,h3,h4,table'));
  const startLevel=parseInt(sourceHeading.tagName[1]);
  let idx=allEls.indexOf(sourceHeading);
  if(idx===-1)idx=allEls.findIndex(el=>el.contains(sourceHeading)||sourceHeading.contains(el));
  if(idx===-1)return extractDropSourcesFromAnyTable(div);
  for(let i=idx+1;i<allEls.length;i++){
    const el=allEls[i],tag=el.tagName.toLowerCase();
    if((tag==='h2'||tag==='h3'||tag==='h4')&&parseInt(tag[1])<=startLevel)break;
    if(tag==='table'){const rows=parseDropSourceTable(el);if(rows.length>0)return rows;}
  }
  return[];
}
function extractDropSourcesFromAnyTable(div){
  for(const table of div.querySelectorAll('table')){
    const headers=Array.from(table.querySelectorAll('th')).map(th=>th.textContent.toLowerCase());
    const hasMonster=headers.some(h=>h.includes('monster')||h.includes('source')||h.includes('npc'));
    const hasRarity=headers.some(h=>h.includes('rarity')||h.includes('chance')||h.includes('rate'));
    if(hasMonster&&hasRarity){const rows=parseDropSourceTable(table);if(rows.length>0){dbg('Found drop source table via fallback: '+rows.length+' rows');return rows;}}
  }
  return[];
}

// Parse a "Drop Sources" table
// Columns detected from headers: Monster | Level | Quantity | Rarity
function parseDropSourceTable(table){
  const rows=[];
  const headerRow=table.querySelector('tr'); if(!headerRow)return rows;
  const headers=Array.from(headerRow.querySelectorAll('th,td')).map(c=>c.textContent.toLowerCase().trim());
  dbg('Drop source headers: '+JSON.stringify(headers));
  let colMonster=-1,colQty=-1,colRarity=-1,colLevel=-1;
  for(let i=0;i<headers.length;i++){
    const h=headers[i];
    if((h.includes('monster')||h.includes('source')||h.includes('npc')||h.includes('name'))&&colMonster===-1)colMonster=i;
    else if((h.includes('level')||h.includes('combat'))&&colLevel===-1)colLevel=i;
    else if((h.includes('quant')||h.includes('amount')||h.includes('qty'))&&colQty===-1)colQty=i;
    else if((h.includes('rarity')||h.includes('chance')||h.includes('rate')||h.includes('drop'))&&colRarity===-1)colRarity=i;
  }
  if(colMonster===-1)colMonster=0;
  if(colRarity===-1&&headers.length>0)colRarity=headers.length-1;
  dbg(`Drop source cols — monster:${colMonster} level:${colLevel} qty:${colQty} rarity:${colRarity}`);
  const trs=Array.from(table.querySelectorAll('tr')).slice(1);
  for(const tr of trs){
    const cells=Array.from(tr.querySelectorAll('td,th'));
    if(cells.length<2)continue;
    let monsterName='',monsterImg='',monsterLevel='';
    if(colMonster>=0&&colMonster<cells.length){
      const cell=cells[colMonster];
      const a=cell.querySelector('a');
      monsterName=a?stripNotes(a.textContent.trim()):stripNotes(cell.textContent.trim());
      const img=cell.querySelector('img');
      if(img)monsterImg=fixIconUrl(img.getAttribute('src')||img.src||'');
    }
    if(!monsterName||monsterName.length<1||monsterName.length>100)continue;
    if(colLevel>=0&&colLevel<cells.length)monsterLevel=stripNotes(cells[colLevel].textContent.trim());
    let qty='';
    if(colQty>=0&&colQty<cells.length){qty=stripNotes(cells[colQty].textContent.trim());}
    else{for(let ci=0;ci<cells.length;ci++){if(ci===colMonster||ci===colLevel||ci===colRarity)continue;const t=stripNotes(cells[ci].textContent.trim());if(/^\d[\d,–\-\s]*$/.test(t)&&t.length<20){qty=t;break;}}}
    let rarity='';
    if(colRarity>=0&&colRarity<cells.length){rarity=stripNotes(cells[colRarity].textContent.trim().split(';')[0].split('\n')[0]);}
    if(/^rarity|^chance|^rate/i.test(rarity))continue;
    rows.push({name:monsterName,img:monsterImg,level:monsterLevel,qty,rarity});
  }
  dbg('parseDropSourceTable: '+rows.length+' rows');
  return rows;
}

// Render item drop sources (grouped by rarity)
// Groups: Always | High (≥80%) | Medium (50–80%) | Low (<50%)
// Unknown-rarity sources go in Low. Sources never shown are omitted.
function renderDropSources(sources,itemTitle){
  const container=document.getElementById('drops'); container.innerHTML='';

  // Banner
  const banner=document.createElement('div');
  banner.style.cssText='background:#1a3a5c;padding:5px 12px;font-size:11px;font-weight:700;letter-spacing:1px;color:#fff;border-bottom:2px solid rgba(0,0,0,.3);text-transform:uppercase;position:sticky;top:0;z-index:2;';
  banner.textContent='🎒 Drop Sources — '+itemTitle;
  container.appendChild(banner);

  const hint=document.createElement('div');
  hint.style.cssText='padding:4px 12px;font-size:10px;color:var(--dim);border-bottom:1px solid var(--border);background:var(--bg2);';
  hint.textContent='Tap a monster to view its full drop table →';
  container.appendChild(hint);

  // Bucket definitions: [key, label, icon, minChance, maxChance]
  const BUCKETS=[
    {key:'always', label:'Always',  icon:'⭐', min:2,    max:Infinity},
    {key:'high',   label:'High',    icon:'🟢', min:0.8,  max:2},
    {key:'medium', label:'Medium',  icon:'🟡', min:0.5,  max:0.8},
    {key:'low',    label:'Low',     icon:'🔴', min:-1,   max:0.5},  // -1 = unknown also lands here
  ];

  // Sort sources: always first, then high→low by chance desc, unknown at bottom of Low
  const withChance=sources.map(s=>({...s,_chance:rarityToChance(s.rarity)}));
  withChance.sort((a,b)=>{
    // unknown (-1) sorts to bottom
    const ac=a._chance<0?-2:a._chance, bc=b._chance<0?-2:b._chance;
    return bc-ac;
  });

  // Assign to buckets
  const bucketMap={};
  for(const b of BUCKETS)bucketMap[b.key]=[];
  for(const src of withChance){
    const c=src._chance;
    if(c>=2)           bucketMap.always.push(src);
    else if(c>=0.8)    bucketMap.high.push(src);
    else if(c>=0.5)    bucketMap.medium.push(src);
    else               bucketMap.low.push(src); // includes unknown (c===-1)
  }

  // Click handler: switch to NPC mode and look up monster
  const onRowClick=(src)=>{
    currentMode='npc';
    document.querySelectorAll('.mode-tab').forEach(t=>t.classList.toggle('active',t.dataset.mode==='npc'));
    document.getElementById('search-input').placeholder='Search NPCs...';
    lookup(src.name);
  };

  // Build a source row element
  function makeSourceRow(src){
    const el=document.createElement('div'); el.className='drop-row clickable';
    el.title='View full drops for '+src.name;
    el.addEventListener('click',()=>onRowClick(src));
    if(src.img){const img=document.createElement('img');img.className='item-img';img.src=src.img;img.alt=src.name;img.onerror=function(){this.replaceWith(placeholder(src.name));};el.appendChild(img);}
    else el.appendChild(placeholder(src.name));
    const info=document.createElement('div');info.className='item-info';
    const nm=document.createElement('div');nm.className='item-name';nm.textContent=src.name;info.appendChild(nm);
    const sub=[];if(src.level)sub.push('Lvl '+src.level);if(src.qty)sub.push('Qty: '+src.qty);
    if(sub.length){const q=document.createElement('div');q.className='item-qty';q.textContent=sub.join(' · ');info.appendChild(q);}
    el.appendChild(info);
    if(src.rarity){const{label,cls}=rarityClass(src.rarity);const wrap=document.createElement('div');wrap.className='rarity';const badge=document.createElement('span');badge.className='badge '+cls;badge.textContent=label;wrap.appendChild(badge);el.appendChild(wrap);}
    const arrow=document.createElement('span');arrow.style.cssText='color:var(--dim);font-size:11px;flex-shrink:0;margin-left:2px;';arrow.textContent='›';el.appendChild(arrow);
    return el;
  }

  let anyRendered=false;
  for(const b of BUCKETS){
    const rows=bucketMap[b.key];
    if(!rows.length)continue;
    anyRendered=true;

    // Section header with coloured left border
    const borderColors={always:'#4caf50',high:'#81c784',medium:'#ffb74d',low:'#e57373'};
    const sec={name:`${b.icon} ${b.label} (${rows.length})`,rows};
    const wrapper=document.createElement('div'); wrapper.className='section-wrapper';
    const hdr=document.createElement('div'); hdr.className='section-hdr';
    hdr.style.borderLeft=`3px solid ${borderColors[b.key]}`;
    hdr.innerHTML=`<span class="hdr-left"><span class="chevron">▼</span><span>${b.icon} ${b.label}</span></span><span class="row-count">${rows.length}</span>`;
    const body=document.createElement('div'); body.className='section-body';
    for(const src of rows)body.appendChild(makeSourceRow(src));
    requestAnimationFrame(()=>{body.style.maxHeight=body.scrollHeight+'px';});
    hdr.addEventListener('click',()=>{
      const c=hdr.classList.toggle('collapsed');
      if(c){body.style.maxHeight=body.scrollHeight+'px';requestAnimationFrame(()=>body.classList.add('collapsed'));}
      else{body.classList.remove('collapsed');body.style.maxHeight=body.scrollHeight+'px';body.addEventListener('transitionend',()=>{if(!hdr.classList.contains('collapsed'))body.style.maxHeight='none';},{once:true});}
    });
    wrapper.appendChild(hdr); wrapper.appendChild(body); container.appendChild(wrapper);
  }

  if(!anyRendered){
    container.innerHTML+='<div style="padding:16px;text-align:center;color:var(--dim);font-size:11px;">No sources to display.</div>';
  }
}

// UI events
const searchInput=document.getElementById('search-input');
searchInput.addEventListener('input',()=>{
  if(inDropsView||currentMode==='item')return;
  clearTimeout(searchTimer); searchTimer=setTimeout(()=>renderNpcList(searchInput.value),150);
});
document.getElementById('search-btn').addEventListener('click',()=>{
  const v=searchInput.value.trim(); if(!v)return;
  if(currentMode==='item')lookupItemSources(v); else lookup(v);
});
searchInput.addEventListener('keydown',e=>{
  if(e.key!=='Enter')return; const v=searchInput.value.trim(); if(!v)return;
  if(currentMode==='item')lookupItemSources(v); else lookup(v);
});
document.getElementById('back-btn').addEventListener('click',()=>{
  navHistory[currentMode]=null; // clear saved state so tab returns to browser
  showBrowser(); searchInput.value='';
  if(currentMode==='npc')renderNpcList('');
  else document.getElementById('npc-list').innerHTML='<div id="npc-empty">Type an item name and press Search.<br><small>e.g. "Dragon bones", "Abyssal whip"</small></div>';
  setStatus('','');
});
document.getElementById('close').addEventListener('click',()=>{fetch('https://bolt-api/close',{method:'POST'}).catch(()=>{});});

// Message handler (from Lua)
function handleMsg(text){
  if(text.startsWith('LOOKUP:'))lookup(text.slice(7));
  else if(text==='FOCUS_SEARCH'){searchInput.value='';searchInput.focus();if(inDropsView){showBrowser();renderNpcList('');}}
}
window.addEventListener('message',evt=>{
  if(!evt.data)return;
  if(evt.data.type==='pluginMessage'&&evt.data.content)handleMsg(new TextDecoder().decode(new Uint8Array(evt.data.content)).trim());
  else if(typeof evt.data==='string')handleMsg(evt.data.trim());
});

// Alt1 Integration
let _alt1Badge=null;
function flashBadge(color){if(!_alt1Badge)return;_alt1Badge.style.background=color||'#4caf50';setTimeout(()=>{_alt1Badge.style.background='#e94560';},1500);}
let alt1InitDone=false;
function tryInitAlt1(){
  if(alt1InitDone||typeof window.alt1==='undefined')return;
  alt1InitDone=true;
  const badge=document.createElement('div');badge.id='alt1badge';
  badge.style.cssText='position:fixed;top:4px;right:30px;background:#e94560;color:#fff;font-size:9px;padding:1px 5px;border-radius:2px;font-weight:700;z-index:100;cursor:pointer;';
  badge.textContent='ALT1';badge.title='Click to manually read screen';document.body.appendChild(badge);_alt1Badge=badge;
  dbg('alt1 v'+window.alt1.version);
  try{window.alt1.identifyAppUrl('./appconfig.json');}catch(e){dbg('identifyApp err: '+e.message);}
  var a1lib=null,a1script=document.createElement('script');
  a1script.src='./alt1base.bundle.js';
  a1script.onload=function(){
    var attempts=0;
    function tryA1lib(){a1lib=window.A1lib;if(a1lib&&typeof a1lib.captureHoldFullRs==='function'){dbg('A1lib loaded');loadAnchors();getTesseract();a1lib.on('alt1pressed',function(e){dbg('alt1pressed x='+e.x+' y='+e.y);readExamineWindow();});dbg('Alt+1 hook registered');}else if(attempts<30){attempts++;setTimeout(tryA1lib,100);}else dbg('A1lib unavailable');}
    tryA1lib();
  };
  a1script.onerror=function(){dbg('Failed to load alt1base.bundle.js');setStatus('ok','Alt1 — right-click NPC, hover Examine, press Alt+1');};
  document.head.appendChild(a1script);
  function processOpenInfo(info){
    if(!info)return false;
    let text=info;
    if(typeof info==='string'){try{const p=JSON.parse(info);text=p.text||p.match||p.string||JSON.stringify(p);}catch(e){}}
    const parsed=parseExamineText(text);
    if(parsed){
      const stripped=stripLevelSuffix(parsed);
      const name=resolveOcrName(stripped.text);
      dbg('openInfo: "'+parsed+'" -> "'+name+'" hadLevel='+stripped.hadLevel);
      flashBadge('#4caf50');
      if(stripped.hadLevel){
        // Level found — NPC
        currentMode='npc';
        document.querySelectorAll('.mode-tab').forEach(t=>t.classList.toggle('active',t.dataset.mode==='npc'));
        document.getElementById('search-input').placeholder='Search NPCs...';
        document.getElementById('search-input').value=name;
        setStatus('busy','NPC: '+name);
        setTimeout(()=>{showDrops();document.getElementById('subtitle').textContent=name;document.getElementById('drops').innerHTML='';lookupPage(name);},200);
      } else {
        // No level — item
        currentMode='item';
        document.querySelectorAll('.mode-tab').forEach(t=>t.classList.toggle('active',t.dataset.mode==='item'));
        document.getElementById('search-input').placeholder='Search items...';
        document.getElementById('search-input').value=name;
        setStatus('busy','Item: '+name);
        setTimeout(()=>lookupItemSources(name),200);
      }
      return true;
    }
    return false;
  }
  if(!processOpenInfo(window.alt1.openInfo))setStatus('ok','Alt1 — right-click NPC, hover Examine, press Alt+1');
  let lastOpenInfo=JSON.stringify(window.alt1.openInfo);
  setInterval(()=>{const cur=JSON.stringify(window.alt1.openInfo);if(cur!==lastOpenInfo){lastOpenInfo=cur;processOpenInfo(window.alt1.openInfo);}},200);
  badge.addEventListener('click',()=>{flashBadge('#f5c518');if(a1lib)readExamineWindow();else dbg('A1lib not loaded yet');});
}
tryInitAlt1();
(function(){var elapsed=0,poll=setInterval(()=>{elapsed+=500;if(alt1InitDone||elapsed>=30000)clearInterval(poll);else tryInitAlt1();},500);})();

// Anchor + Tesseract
var anchorTL=null,anchorBR=null,anchorExamine=null,anchorsLoading=false;
async function loadAnchors(){
  if(anchorTL&&anchorBR&&anchorExamine)return true;if(anchorsLoading)return false;anchorsLoading=true;
  try{const ID=window.A1lib.ImageDetect;anchorTL=await ID.imageDataFromUrl('./TopLeft.png');anchorBR=await ID.imageDataFromUrl('./BottomRight.png');anchorExamine=await ID.imageDataFromUrl('./Examine.png');dbg('Anchors loaded');return true;}
  catch(e){dbg('Anchor load error: '+e.message);anchorsLoading=false;return false;}
}
var tesseractWorker=null,tesseractLoading=false;
async function getTesseract(){
  if(tesseractWorker)return tesseractWorker;
  if(tesseractLoading){for(var i=0;i<100;i++){await new Promise(r=>setTimeout(r,100));if(tesseractWorker)return tesseractWorker;}return null;}
  tesseractLoading=true;
  return new Promise(resolve=>{
    const s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
    s.onload=async()=>{try{const w=await Tesseract.createWorker('eng',1,{logger:m=>{if(m.status==='recognizing text')dbg('OCR: '+Math.round(m.progress*100)+'%');}});await w.setParameters({tessedit_char_whitelist:"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 '-,!.",tessedit_pageseg_mode:'7',preserve_interword_spaces:'1'});tesseractWorker=w;resolve(w);}catch(e){dbg('Tesseract init error: '+e.message);tesseractLoading=false;resolve(null);}};
    s.onerror=()=>{dbg('Failed to load Tesseract.js');tesseractLoading=false;resolve(null);};
    document.head.appendChild(s);
  });
}
function imgDataToCanvas(d){const c=document.createElement('canvas');c.width=d.width;c.height=d.height;const ctx=c.getContext('2d');const id=ctx.createImageData(d.width,d.height);id.data.set(d.data);ctx.putImageData(id,0,0);return c;}
function scaleCanvas(src,scale){const dst=document.createElement('canvas');dst.width=src.width*scale;dst.height=src.height*scale;const ctx=dst.getContext('2d');ctx.imageSmoothingEnabled=false;ctx.drawImage(src,0,0,dst.width,dst.height);return dst;}

async function readExamineWindow(){
  if(!window.alt1||!window.alt1.permissionPixel){setStatus('err','Pixel permission not granted');return;}
  setStatus('busy','Scanning for Examine window...');
  if(!await loadAnchors()){setStatus('err','Anchor images missing');return;}
  try{
    const a1lib=window.A1lib,screen=a1lib.captureHoldFullRs();
    if(!screen){setStatus('err','Screen capture failed');return;}
    const tlHits=screen.findSubimage(anchorTL),brHits=screen.findSubimage(anchorBR),exHits=screen.findSubimage(anchorExamine);
    dbg('Hits TL:'+tlHits.length+' BR:'+brHits.length+' Ex:'+exHits.length);

    // TL is required. BR is optional — short item names can push the bottom-right
    // corner off-screen so we fall back to cropping from TL downward when BR is missing.
    if(!tlHits.length){setStatus('err','Examine window not found');return;}

    let bestMatch=null;

    if(brHits.length){
      // Normal path: score every TL+BR pair and pick the best
      for(const t of tlHits)for(const b of brHits){
        if(b.x<t.x||b.y<t.y+anchorTL.height)continue;
        const w=(b.x+anchorBR.width)-t.x,h=(b.y+anchorBR.height)-t.y;
        if(w>800||h>500)continue;
        let ex=null;
        for(const e of exHits){if(e.x>=t.x&&e.x+anchorExamine.width<=b.x+anchorBR.width&&e.y>=t.y+anchorTL.height&&e.y+anchorExamine.height<=b.y){ex=e;break;}}
        const score=(ex?0:1e9)+w*h;
        if(!bestMatch||score<bestMatch.score)bestMatch={tl:t,br:b,ex,score};
      }
    }

    // Fallback: TL-only crop using the Examine anchor for vertical position
    if(!bestMatch&&tlHits.length){
      const t=tlHits[0];
      const ex=exHits.find(e=>e.y>t.y&&e.x>=t.x)||exHits[0]||null;
      dbg('No BR found — using TL-only fallback');
      bestMatch={tl:t,br:null,ex,score:0};
    }

    if(!bestMatch){setStatus('err','Examine window not found');return;}

    const{tl,br,ex}=bestMatch;
    const PAD=3;
    let nameAbsX,nameAbsY,nameW,nameH;

    if(ex){
      // Crop from just after the Examine label to the right edge of the window
      nameAbsX=ex.x+anchorExamine.width+3;
      nameAbsY=ex.y-PAD;
      nameH=anchorExamine.height+PAD*2;
      // Use BR for right edge if available, else cap at 400px
      nameW=br?(br.x+anchorBR.width)-nameAbsX:Math.min(screen.width-nameAbsX,400);
    } else if(br){
      nameAbsX=tl.x;
      nameAbsY=tl.y+anchorTL.height-PAD;
      nameW=(br.x+anchorBR.width)-tl.x;
      nameH=br.y-(tl.y+anchorTL.height)+PAD*2;
    } else {
      // No Examine anchor and no BR — generous defaults from TL
      nameAbsX=tl.x;
      nameAbsY=tl.y+anchorTL.height-PAD;
      nameW=Math.min(screen.width-tl.x,400);
      nameH=30+PAD*2;
    }

    if(nameAbsY<0){nameH+=nameAbsY;nameAbsY=0;}
    if(nameAbsX<0){nameW+=nameAbsX;nameAbsX=0;}
    if(nameAbsX+nameW>screen.width)nameW=screen.width-nameAbsX;
    if(nameAbsY+nameH>screen.height)nameH=screen.height-nameAbsY;
    if(nameW<=0){setStatus('err','Name crop zero-width');return;}

    const stripRaw=screen.toData(nameAbsX,nameAbsY,nameW,nameH);
    const SW=stripRaw.width||nameW,SH=stripRaw.height||nameH,SD=stripRaw.data;
    const colBright=new Uint8Array(SW);
    for(let cx=0;cx<SW;cx++)for(let cy=0;cy<SH;cy++){const si=(cy*SW+cx)*4;if((SD[si]+SD[si+1]+SD[si+2])/3>55){colBright[cx]=1;break;}}
    const gaps=[];let inGap=false,gapStart=0;
    for(let gx=0;gx<SW;gx++){if(!colBright[gx]&&!inGap){inGap=true;gapStart=gx;}else if(colBright[gx]&&inGap){gaps.push({start:gapStart,end:gx-1});inGap=false;}}
    if(inGap)gaps.push({start:gapStart,end:SW-1});
    let clipCol=SW;
    for(let gi=gaps.length-1;gi>=0;gi--){const g=gaps[gi];if(g.end-g.start+1<2)continue;let hL=false,hR=false;for(let lx=g.start-1;lx>=0;lx--)if(colBright[lx]){hL=true;break;}for(let rx=g.end+1;rx<SW;rx++)if(colBright[rx]){hR=true;break;}if(hL&&hR){clipCol=g.start;break;}}
    const cW=Math.max(1,clipCol),cD={width:cW,height:SH,data:new Uint8ClampedArray(cW*SH*4)};
    for(let r=0;r<SH;r++)for(let c=0;c<cW;c++){const s=(r*SW+c)*4,d=(r*cW+c)*4;cD.data[d]=SD[s];cD.data[d+1]=SD[s+1];cD.data[d+2]=SD[s+2];cD.data[d+3]=255;}
    const scaled=scaleCanvas(imgDataToCanvas(cD),4);
    const ctx=scaled.getContext('2d'),px=ctx.getImageData(0,0,scaled.width,scaled.height);
    let avg=0;for(let i=0;i<px.data.length;i+=4)avg+=(px.data[i]+px.data[i+1]+px.data[i+2])/3;avg/=px.data.length/4;
    if(avg<128){const inv=ctx.createImageData(scaled.width,scaled.height);for(let i=0;i<px.data.length;i+=4){inv.data[i]=255-px.data[i];inv.data[i+1]=255-px.data[i+1];inv.data[i+2]=255-px.data[i+2];inv.data[i+3]=255;}ctx.putImageData(inv,0,0);}
    const oc=getOrCreateOcrCanvas();oc.width=scaled.width;oc.height=scaled.height;oc.getContext('2d').drawImage(scaled,0,0);oc.style.bottom=settings.debugLog?(DEBUG_OVERLAY_HEIGHT+'px'):'0px';if(settings.ocrCanvas)oc.style.display='block';

    setStatus('busy','Running OCR...');
    const worker=await getTesseract();if(!worker){setStatus('err','Tesseract not available');return;}
    const result=await worker.recognize(scaled);
    const tesseractRaw=(result.data.text||'').trim();
    dbg('Tesseract raw: "'+tesseractRaw+'"');

    // If stripLevelSuffix removed level content, it's an NPC. Items never have a level.
    // The lone trailing "l" artifact that appears for both NPCs and items does NOT count.
    const stripped=stripLevelSuffix(tesseractRaw);
    dbg('rawAfter="'+stripped.text+'" levelWasStripped='+stripped.hadLevel);

    if(!stripped.text||stripped.text.length<2){setStatus('err','OCR returned no text');return;}
    const resolved=resolveOcrName(stripped.text);
    dbg('resolved="'+resolved+'"');
    flashBadge('#4caf50');

    if(stripped.hadLevel){
      // Level found in raw text — treat as NPC
      currentMode='npc';
      document.querySelectorAll('.mode-tab').forEach(t=>t.classList.toggle('active',t.dataset.mode==='npc'));
      document.getElementById('search-input').placeholder='Search NPCs...';
      document.getElementById('search-input').value=resolved;
      setStatus('busy','NPC: '+resolved);
      showDrops();
      document.getElementById('subtitle').textContent=resolved;
      document.getElementById('drops').innerHTML='';
      lookupPage(resolved);
    } else {
      // No level found — treat as item
      currentMode='item';
      document.querySelectorAll('.mode-tab').forEach(t=>t.classList.toggle('active',t.dataset.mode==='item'));
      document.getElementById('search-input').placeholder='Search items...';
      document.getElementById('search-input').value=resolved;
      setStatus('busy','Item: '+resolved);
      lookupItemSources(resolved);
    }
  }catch(e){dbg('readExamineWindow error: '+e.message);setStatus('err','Error: '+e.message.slice(0,80));}
}
function parseExamineText(text){if(!text)return null;const m=text.match(/Examine[^a-z]+(.+)/i);return m?m[1].trim():null;}

// Init
applyToggleUI();
showBrowser();
searchInput.focus();
loadMonsterList();

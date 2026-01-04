import {DingClient} from './widgetHelper.js';
class MetricsWidget{
 constructor(){
  this.c=new DingClient({mode:'widget'});
   this._trails=new Map();
   this._config = { intervalSec: 2, color: 'cyan' };
 }
 async start(){
  await this._loadConfig();
  this._applyConfig();
  this._applyNumberWidths();
  this.c.onConfigChanged?.((cfg)=>{
   if(cfg && typeof cfg==='object'){
    this._config={...this._config,...cfg};
    this._applyConfig();
    this._applyNumberWidths();
   }else{
    this._config = { intervalSec: 2, color: 'cyan' };
    this._applyConfig();
    this._applyNumberWidths();
   }
  });
  this.c.onBackendEvent((n,p)=>{
   if(n==='metrics')this.apply(p.snapshot);
  });
  try{
   const res=await this.c.backendRequest('getSnapshot',{});
   if(res?.snapshot) this.apply(res.snapshot);
  }catch(e){
   const msg = (e && e.message) ? e.message : String(e);
   const code = e && e.code ? ` code=${e.code}` : '';
   console.error(`metrics widget getSnapshot error:${code} ${msg}`, e);
  }
 }
 async _loadConfig(){
  try{
   const cfg=await this.c.getConfig();
   if(cfg && typeof cfg==='object')
    this._config={...this._config,...cfg};
  }catch(e){}
 }
 _applyConfig(){
  // Color
  const map={
   white:'#e6e6e6',
   pink:'#ff7ab8',
   cyan:'#31e6ff',
   lime:'#7ef57e',
   purple:'#b899ff',
   amber:'#ffc35a',
  };
  const hex=map[(this._config.color||'').toLowerCase()] || map.cyan;
  document.body?.style?.setProperty('--neon',hex);

  // Interval -> backend
  const intervalSec = Number.isFinite(this._config.intervalSec) ? this._config.intervalSec : 2;
  const periodMs = Math.max(250, Math.min(10000, Math.round(intervalSec*1000)));
  try{
   this.c.backendRequest('setPeriodMs',{periodMs});
  }catch(e){}
 }
 apply(s){
  const clamp01=v=>Math.max(0,Math.min(1,v));
  const setNumWidth=(row,text)=>{
   const el=document.querySelector(`.row[data-row="${row}"]`);
   if(!el) return;
   const ch = Math.max(6, (text?.length ?? 0) + 1);
   el.style.setProperty('--num-width', `${ch}ch`);
  };
  const setBar=(key,selector,pRaw)=>{const t=document.querySelector(selector);if(!t){console.warn('metrics widget missing track', selector);return;}
   const p=clamp01(pRaw);
   const {decay,ghost}=this._updateTrail(key,p);
   const setWidth=(sel,val)=>{
    const el=t.querySelector(sel);
    if(!el) return;
    const pct=`${(val*100).toFixed(1)}%`;
    el.style.setProperty('--p',val);
   el.style.width=pct;
   };
   setWidth('.bar-now',p);
   setWidth('.bar-decay',decay);
   setWidth('.bar-ghost',ghost);
   const edge=t.querySelector('.edge');if(edge){edge.style.setProperty('--p-now',p);edge.style.left=`${(p*100).toFixed(1)}%`;}
  };
  const setRamBar=(selector,usedRaw,cacheRaw)=>{
   const t=document.querySelector(selector);
   if(!t){console.warn('metrics widget missing track', selector);return;}
   const used=clamp01(usedRaw);
   const cache=clamp01(cacheRaw);
   const usedTrail=this._updateTrail('ram-used',used);
   const cacheTrail=this._updateTrail('ram-cache',cache);

   const setWidth=(sel,val)=>{
    const el=t.querySelector(sel);
    if(!el) return;
    const pct=`${(val*100).toFixed(1)}%`;
    el.style.setProperty('--p',val);
    el.style.width=pct;
   };

   setWidth('.bar-now',used);
   setWidth('.bar-decay',cacheTrail.decay);
   setWidth('.bar-ghost',cacheTrail.ghost);

   const edge=t.querySelector('.edge');
   if(edge){
    edge.style.setProperty('--p-now',used);
    edge.style.left=`${(used*100).toFixed(1)}%`;
   }
  };

  // CPU
  const cpuPct=s.cpu?.usagePct||0;
  setBar('cpu',`.row[data-row="cpu"] .track`,clamp01(cpuPct/100));
  const cpuNum=document.querySelector('.row[data-row="cpu"] .num');
  if(cpuNum) cpuNum.textContent=`${cpuPct.toFixed(0)}%`; else console.warn('metrics widget missing cpu num');

  // RAM
  let ramPct=0;
  let ramCachePct=0;
  if(s.mem?.totalBytes) ramPct=clamp01(s.mem.usedBytes/s.mem.totalBytes);
  if(s.mem?.totalBytes) ramCachePct=clamp01((s.mem.cachedBytes ?? 0)/s.mem.totalBytes);
  setRamBar(`.row[data-row="ram"] .track`,ramPct,ramPct+ramCachePct);
  const ramNum=document.querySelector('.row[data-row="ram"] .num');
  if(ramNum){
   const usedGb=s.mem?.usedBytes? (s.mem.usedBytes/1e9):0;
   const totGb=s.mem?.totalBytes? (s.mem.totalBytes/1e9):0;
   ramNum.textContent=`${usedGb.toFixed(0)}/${totGb.toFixed(0)}G`;
   setNumWidth('ram', ramNum.textContent);
  } else console.warn('metrics widget missing ram num');

  // NET (per-direction bars)
  const rx=s.net?.rxBps||0,tx=s.net?.txBps||0;
  const scaleFor = v => {
   const base = Math.max(v * 1.6, 1e3);
   if (base >= 1e9) return {barScale: base, displayDiv: 1e9, suffix: 'G'};
   if (base >= 1e6) return {barScale: base, displayDiv: 1e6, suffix: 'M'};
   return {barScale: Math.max(base, 1e3), displayDiv: 1e3, suffix: 'K'};
  };
  const fmt=(v,sc)=>{
   const scaled=v/sc.displayDiv;
   let str;
   if (scaled >= 100) str = scaled.toFixed(0);
   else if (scaled >= 10) str = scaled.toFixed(1);
   else str = scaled.toFixed(2);
   return `${str}${sc.suffix}`;
  };
  const rxScale=scaleFor(rx);
  const txScale=scaleFor(tx);
  setBar('net-in',`.row[data-row="net"] [data-dir="in"] .track`,clamp01(rx/rxScale.barScale));
  setBar('net-out',`.row[data-row="net"] [data-dir="out"] .track`,clamp01(tx/txScale.barScale));
  const rxNum=document.querySelector('.row[data-row="net"] .num.in');
  const txNum=document.querySelector('.row[data-row="net"] .num.out');
  if(rxNum) rxNum.textContent=fmt(rx,rxScale); else console.warn('metrics widget missing rx num');
  if(txNum) txNum.textContent=fmt(tx,txScale); else console.warn('metrics widget missing tx num');

  // Battery
  const batPresent=!!s.battery?.present;
  const batPct=batPresent?(s.battery.percent||0):100;
  setBar('bat',`.row[data-row="bat"] .track`, batPresent ? clamp01(batPct/100) : 1);
  const batNum=document.querySelector('.row[data-row="bat"] .num');
  if(batNum){
   batNum.textContent=batPresent?`${batPct.toFixed(0)}%`:'⚡';
  } else console.warn('metrics widget missing bat num');

  const batLabel = document.querySelector('.lbl-bat-text');
  if (batLabel)
    batLabel.textContent = batPresent ? 'BAT' : 'PWR';

  const batIcon = document.querySelector('.bat-icon');
  if (batIcon) {
    if (batPresent) {
      batIcon.textContent = '▮';
      batIcon.style.color = '#7ef57e';
      batIcon.style.visibility = 'visible';
    } else {
      batIcon.textContent = '⚡';
      batIcon.style.color = '#ffc35a';
      batIcon.style.visibility = 'visible';
    }
  }

  // Meta labels
  const host = s.hostName || s.host || 'Host';
  const hostEl = document.querySelector('.meta.meta-bottom .host-name');
  if (hostEl) hostEl.textContent = host;
 }

 _applyNumberWidths(){
  const map={
   cpu:'6ch',
   ram:'6ch',
   net:'6ch',
   bat:'6ch',
  };
  for(const [row,width] of Object.entries(map)){
   const el=document.querySelector(`.row[data-row="${row}"]`);
   if(el) el.style.setProperty('--num-width',width);
  }
 }

  _updateTrail(key,target){
   const prev=this._trails.get(key)??{decay:target,ghost:target};
   const decay=prev.decay+(target-prev.decay)*0.25;
   const ghost=Math.max(target,prev.ghost*0.92);
   this._trails.set(key,{decay,ghost});
   return {decay,ghost};
  }
}
new MetricsWidget().start();

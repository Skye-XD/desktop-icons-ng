import {DingClient} from './widgetHelper.js';
class MetricsWidget{
 constructor(){
  this.c=new DingClient({mode:'widget'});
 }
 async start(){
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
 apply(s){
  const clamp01=v=>Math.max(0,Math.min(1,v));
  const setBar=(r,pRaw)=>{const t=document.querySelector(`.row[data-row="${r}"] .track`);if(!t){console.warn('metrics widget missing track', r);return;}
   const p=clamp01(pRaw);const pct=`${(p*100).toFixed(1)}%`;
   for(const sel of ['.bar-now','.bar-ghost','.bar-decay']){const el=t.querySelector(sel);if(el){el.style.setProperty('--p',p);el.style.width=pct;}}
   const edge=t.querySelector('.edge');if(edge){edge.style.setProperty('--p-now',p);edge.style.left=pct;}
  };
  const setNetHalf=(sel,pRaw)=>{const half=document.querySelector(sel);if(!half){console.warn('metrics widget missing net half', sel);return;}
   const p=clamp01(pRaw);const pct=`${(p*100).toFixed(1)}%`;const isLeft=sel.includes('net-left');
   for(const barSel of ['.bar-now','.bar-ghost','.bar-decay']){const el=half.querySelector(barSel);if(el){el.style.setProperty('--p',p);el.style.width=pct;}}
   const edge=half.querySelector('.edge');
   if(edge){
    edge.style.setProperty('--p-now',p);
    if(isLeft){edge.style.right=pct;edge.style.left='auto';}
    else {edge.style.left=pct;edge.style.right='auto';}
   }
  };

  // CPU
  const cpuPct=s.cpu?.usagePct||0;
  setBar('cpu',clamp01(cpuPct/100));
  const cpuNum=document.querySelector('.row[data-row="cpu"] .num');
  if(cpuNum) cpuNum.textContent=`${cpuPct.toFixed(0)}%`; else console.warn('metrics widget missing cpu num');

  // RAM
  let ramPct=0;
  if(s.mem?.totalBytes) ramPct=clamp01(s.mem.usedBytes/s.mem.totalBytes);
  setBar('ram',ramPct);
  const ramNum=document.querySelector('.row[data-row="ram"] .num');
  if(ramNum){
   const usedGb=s.mem?.usedBytes? (s.mem.usedBytes/1e9):0;
   const totGb=s.mem?.totalBytes? (s.mem.totalBytes/1e9):0;
   ramNum.textContent=`${usedGb.toFixed(1)} / ${totGb.toFixed(1)} G`;
  } else console.warn('metrics widget missing ram num');

  // NET (per-direction bars)
  const rx=s.net?.rxBps||0,tx=s.net?.txBps||0;
  const scaleFor=v=>{const base=Math.max(v*1.6,1e3);if(base>=1e9)return{barScale:base,displayDiv:1e9,suffix:'G'};if(base>=1e6)return{barScale:base,displayDiv:1e6,suffix:'M'};if(base>=1e3)return{barScale:base,displayDiv:1e3,suffix:'K'};return{barScale:base,displayDiv:1,suffix:''};};
  const rxScale=scaleFor(rx), txScale=scaleFor(tx);
  setNetHalf('.row[data-row="net"] .net-left',clamp01(rx/rxScale.barScale));
  setNetHalf('.row[data-row="net"] .net-right',clamp01(tx/txScale.barScale));
  const rxNum=document.querySelector('.row[data-row="net"] .num.in');
  const txNum=document.querySelector('.row[data-row="net"] .num.out');
  const fmt=(v,sc)=>`${(v/sc.displayDiv).toFixed(2)}${sc.suffix}`;
  if(rxNum) rxNum.textContent=fmt(rx,rxScale); else console.warn('metrics widget missing rx num');
  if(txNum) txNum.textContent=fmt(tx,txScale); else console.warn('metrics widget missing tx num');

  // Battery
  const batPresent=!!s.battery?.present;
  const batPct=batPresent?(s.battery.percent||0):100;
  setBar('bat',clamp01(batPct/100));
  const batNum=document.querySelector('.row[data-row="bat"] .num');
  if(batNum){
   batNum.textContent=batPresent?`${batPct.toFixed(0)}%`:'⚡';
  } else console.warn('metrics widget missing bat num');
 }
}
new MetricsWidget().start();

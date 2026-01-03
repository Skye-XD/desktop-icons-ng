import {DingClient} from './widgetHelper.js';
class MetricsWidget{
 constructor(){this.c=new DingClient({mode:'widget'});}
 async start(){this.c.onBackendEvent((n,p)=>{if(n==='metrics')this.apply(p.snapshot)});}
 apply(s){
  const set=(r,ch)=>{const t=document.querySelector(`.row[data-row="${r}"] .track`);if(!t)return;
   t.querySelector('.bar-now')?.style.setProperty('--p',ch);
   t.querySelector('.bar-ghost')?.style.setProperty('--p',ch);
   t.querySelector('.bar-decay')?.style.setProperty('--p',ch);
   t.querySelector('.edge')?.style.setProperty('--p-now',ch);
  };
  const cpu=Math.max(0,Math.min(1,(s.cpu?.usagePct||0)/100));set('cpu',cpu);
  const ram=s.mem?.totalBytes?Math.min(1,s.mem.usedBytes/s.mem.totalBytes):0;set('ram',ram);
  const rx=s.net?.rxBps||0,tx=s.net?.txBps||0;
  set('net',Math.min(1,(rx+tx)/1e6));
  const bat=s.battery?.present?Math.min(1,(s.battery.percent||0)/100):0;set('bat',bat);
 }
}
new MetricsWidget().start();

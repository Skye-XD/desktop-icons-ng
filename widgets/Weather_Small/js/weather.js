'use strict';
import { debounce } from './util.js';
import { fetchForecast } from './openMeteoClient.js';
import { normalizeOpenMeteo } from './normalizeOpenMeteo.js';
import { setIconInto } from './iconLoader.js';
import { formatTemp, formatTempPair } from './units.js';

const LOCAL_LOCATION_KEY='wx-last-location';
const LOCAL_SETTINGS_KEY='wx-last-settings';

function _api(){ return window.ding || window.DING || window.WidgetAPI || null; }

function _defaults(){
  return { location:{label:'',lat:null,lon:null}, units:'system', refreshMinutes:30, animationsEnabled:true, cache:null };
}

function _merge(base, patch){
  if(!patch || typeof patch!=='object') return base;
  const out={...base, ...patch};
  if(patch.location && typeof patch.location==='object')
    out.location={...base.location, ...patch.location};
  return out;
}

class WeatherApp {
  constructor(){
    this._api=_api();
    this._host={ reducedMotion:false, locale:null };
    this._cfg=_defaults();
    this._timer=null;
    this._busy=false;

    this._els={
      html: document.documentElement,
      location: document.getElementById('location'),
      alertDot: document.getElementById('alertDot'),
      nowIcon: document.getElementById('nowIcon'),
      temp: document.getElementById('temp'),
      condition: document.getElementById('condition'),
      precip: document.getElementById('precip'),
      status: document.getElementById('statusLine'),
      fc: [
        { dow: document.getElementById('fcDow1'), icon: document.getElementById('fcIcon1'), temp: document.getElementById('fcTemp1') },
        { dow: document.getElementById('fcDow2'), icon: document.getElementById('fcIcon2'), temp: document.getElementById('fcTemp2') },
        { dow: document.getElementById('fcDow3'), icon: document.getElementById('fcIcon3'), temp: document.getElementById('fcTemp3') },
      ],
    };
  }

  async init(){
    this._applySizeClass();
    window.addEventListener('resize', debounce(()=>this._applySizeClass(), 60));
    window.addEventListener('storage', (ev)=>{
      if(ev.key===LOCAL_SETTINGS_KEY || ev.key===LOCAL_LOCATION_KEY){
        this._maybeAdoptLocalState(true);
        this._applyMotionClass();
        this._renderFromCache();
        this._restartTimer();
        this.refresh('storage');
      }
    });

    if(this._api?.onHostStateChanged){
      this._api.onHostStateChanged((st)=>{
        this._host={...this._host, ...(st||{})};
        this._applyMotionClass();
        this._renderFromCache();
      });
    }

    if(this._api?.onConfigChanged){
      this._api.onConfigChanged((cfg)=>{
        this._cfg=_merge(this._cfg, cfg);
        this._maybeAdoptLocalState();
        this._applyMotionClass();
        this._renderFromCache();
        this._persistLocalState();
        this._restartTimer();
        this.refresh('config');
      });
    }

    const initial=this._api?.getConfigSync?.() ?? null;
    if(initial) this._cfg=_merge(this._cfg, initial);

    this._maybeAdoptLocalState();
    this._persistLocalState();

    this._applyMotionClass();
    this._renderFromCache();

    if(!this._cfg.location?.lat || !this._cfg.location?.lon){
      this._setStatus('Set a location in preferences.');
      return;
    }

    this._restartTimer();
    await this.refresh('startup');
  }

  _applySizeClass(){
    const w=document.body.clientWidth||0;
    const h=document.body.clientHeight||0;

    const dSmall=Math.abs(w-260)+Math.abs(h-160);
    const dMed=Math.abs(w-320)+Math.abs(h-200);
    const dLarge=Math.abs(w-420)+Math.abs(h-260);

    let cls='wx-medium';
    if(dSmall<=dMed && dSmall<=dLarge) cls='wx-small';
    else if(dLarge<=dSmall && dLarge<=dMed) cls='wx-large';

    const html=this._els.html;
    html.classList.remove('wx-small','wx-medium','wx-large');
    html.classList.add(cls);
  }

  _applyMotionClass(){
    const systemReduced=!!this._host.reducedMotion;
    const localEnabled=!!this._cfg.animationsEnabled;
    const enabled=!systemReduced && localEnabled;
    this._els.html.classList.toggle('wx-no-anim', !enabled);
  }

  _setStatus(s){ this._els.status.textContent=s||''; }

  _renderFromCache(){
    const c=this._cfg.cache;
    const cfgLabel=this._cfg.location?.label || 'Set location';

    if(c) {
      // If cache is for a different location, prefer showing the chosen label until new data arrives
      if(c.location?.label && c.location.label !== cfgLabel){
        this._els.location.textContent=cfgLabel;
        return;
      }
      this._render(c, {fromCache:true});
      return;
    }
    // No cached weather yet—reflect the chosen location label and show pending state
    this._els.location.textContent = cfgLabel ? `${cfgLabel} · updating…` : 'Updating…';
  }

  _restartTimer(){
    if(this._timer){ clearInterval(this._timer); this._timer=null; }
    const mins=Number(this._cfg.refreshMinutes)||30;
    const ms=Math.max(15, mins)*60*1000;
    this._timer=setInterval(()=>this.refresh('timer'), ms);
  }

  async refresh(reason){
    if(this._busy) return;
    if(!this._cfg.location?.lat || !this._cfg.location?.lon) return;

    this._busy=true;
    this._setStatus('Updating…');

    try{
      const raw=await fetchForecast({lat:this._cfg.location.lat, lon:this._cfg.location.lon});
      const norm=normalizeOpenMeteo({raw, locationLabel:this._cfg.location.label, locale:this._host.locale});
      this._cfg.cache=norm;
      this._persistLocalState();
      this._api?.setConfigPatch?.({cache:norm});
      await this._render(norm, {fromCache:false});
      this._setStatus(`Updated ${new Date().toLocaleTimeString()}`);
    }catch(e){
      console.error('[weather] refresh failed', e);
      this._setStatus(this._cfg.cache ? 'Offline — showing cached data' : 'Unable to load weather');
    }finally{
      this._busy=false;
    }
  }

  _persistLocalState(){
    try{
      localStorage.setItem(LOCAL_LOCATION_KEY, JSON.stringify(this._cfg.location||{}));
      const payload={
        location:this._cfg.location,
        units:this._cfg.units,
        refreshMinutes:this._cfg.refreshMinutes,
        animationsEnabled:this._cfg.animationsEnabled,
      };
      localStorage.setItem(LOCAL_SETTINGS_KEY, JSON.stringify(payload));
    }catch(e){}
  }

  _loadLocalLocation(){
    try{
      const raw=localStorage.getItem(LOCAL_LOCATION_KEY);
      if(!raw) return null;
      const parsed=JSON.parse(raw);
      if(parsed && typeof parsed==='object' && parsed.lat && parsed.lon)
        return parsed;
    }catch(e){}
    return null;
  }

  _loadLocalSettings(){
    try{
      const raw=localStorage.getItem(LOCAL_SETTINGS_KEY);
      if(!raw) return null;
      const parsed=JSON.parse(raw);
      if(parsed && typeof parsed==='object') return parsed;
    }catch(e){}
    return null;
  }

  _maybeAdoptLocalState(force=false){
    const cached=this._loadLocalSettings();
    if(cached){
      if (force || this._cfg.units === undefined || this._cfg.units === null || this._cfg.units === '') this._cfg.units = cached.units || this._cfg.units;
      if (force || this._cfg.refreshMinutes === undefined || this._cfg.refreshMinutes === null) this._cfg.refreshMinutes = cached.refreshMinutes || this._cfg.refreshMinutes;
      if (cached.animationsEnabled !== undefined) {
      // Only adopt local value as a fallback. Do NOT override host-provided config.
      if (force || this._cfg.animationsEnabled === undefined || this._cfg.animationsEnabled === null) {
        this._cfg.animationsEnabled = cached.animationsEnabled;
      }
    }
    }

    if(force || !this._cfg.location?.lat || !this._cfg.location?.lon){
      const loc=this._loadLocalLocation();
      if(loc){
        this._cfg.location=loc;
        this._api?.setConfigPatch?.({location:loc});
      }
    }
  }

  async _render(n,{fromCache}){
    this._els.location.textContent=n.location?.label || 'Set location';
    this._els.alertDot.style.visibility = (n.alerts && n.alerts.length) ? 'visible' : 'hidden';

    let units=this._cfg.units || 'system';
    if(units==='system') units='metric';

    const t=formatTemp(n.now?.tempC, units);
    this._els.temp.textContent=(t===null)?'--':String(t);
    this._els.condition.textContent=n.now?.condition?.label || '--';

    const pp=n.now?.precipProbPct;
    this._els.precip.textContent=(pp===null||pp===undefined)?'--%':`${Math.round(pp)}%`;

    const systemReduced=!!this._host.reducedMotion;
    const localEnabled=!!this._cfg.animationsEnabled;
    const animEnabled=!systemReduced && localEnabled;

    await setIconInto(this._els.nowIcon, n.now?.condition?.icon || 'not-available', {animationsEnabled: animEnabled});

    for(let i=0;i<3;i++){
      const day=n.days?.[i+1] || null;
      const col=this._els.fc[i];
      if(!day){
        col.dow.textContent='--';
        col.temp.textContent='--/--';
        col.icon.innerHTML='';
        continue;
      }
      col.dow.textContent=day.dow || '--';
      col.temp.textContent=(day.hiC!==null && day.loC!==null) ? (formatTempPair(day.hiC, day.loC, units) || '--/--') : '--/--';
      await setIconInto(col.icon, day.condition?.icon || 'not-available', {animationsEnabled:false});
    }
  }
}

(async()=>{
  try{ const app=new WeatherApp(); await app.init(); window.__weatherApp=app; }
  catch(e){ console.error('[weather] init failed', e); }
})();

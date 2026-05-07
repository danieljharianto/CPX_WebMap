import mapboxgl from 'mapbox-gl';
import { MapboxOverlay } from '@deck.gl/mapbox';
import { MVTLayer } from 'deck.gl';
import Chart from 'chart.js/auto';
import 'mapbox-gl/dist/mapbox-gl.css';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;
if (!MAPBOX_TOKEN) {
  console.error('Missing VITE_MAPBOX_TOKEN. Set it in .env (local) and Vercel Environment Variables.');
}
mapboxgl.accessToken = MAPBOX_TOKEN;

let mapInst=null;
let overlay=null;
let curLayer='base';
let histChart=null;
let globalMin=0,globalMax=300;
let stats={};
let selectedId=null;

const CSTOPS=[
  [0,  [254,229,217]],
  [.25,[252,174,145]],
  [.5, [251,106, 74]],
  [.75,[222, 45, 38]],
  [1,  [165, 15, 21]],
];
function lerp(a,b,t){return a+(b-a)*t}
function eui2rgb(val,mn,mx){
  const t=Math.max(0,Math.min(1,(val-mn)/(mx-mn)));
  for(let i=0;i<CSTOPS.length-1;i++){
    const[t0,c0]=CSTOPS[i],[t1,c1]=CSTOPS[i+1];
    if(t<=t1){const u=(t-t0)/(t1-t0);return[0,1,2].map(j=>Math.round(lerp(c0[j],c1[j],u)))}
  }
  return[165,15,21];
}

// MVT field names (eui_shallow is truncated to eui_shallo in the tileset)
const MVT_PROP={base:'eui_base',shallow:'eui_shallo',deep:'eui_deep'};

function featureId(f){
  const p=f.properties||{};
  return String(p.ID??p.building_id??p.id??f.id??'');
}

function getColor(f,layer){
  const id=featureId(f);
  if(selectedId!==null&&id===selectedId)return[255,220,50,255];
  const val=parseFloat(f.properties[MVT_PROP[layer]]);
  if(isNaN(val))return[120,120,120,140];
  const[r,g,b]=eui2rgb(val,globalMin,globalMax);
  return[r,g,b,230];
}

function handleHover({object}){
  mapInst.getCanvas().style.cursor=object?'pointer':'default';
}

function handleClick({object}){
  if(!object)return;
  const id=featureId(object);
  selectedId=id||null;
  updateDetail(object.properties,id);
  overlay&&overlay.setProps({layers:[buildingLayer()]});
}

function updateDetail(props,id){
  const dp=document.getElementById('detail-panel');
  if(!props){dp.innerHTML='<div class="dp-hint">Click a building on the map to inspect its EUI values across all three retrofit scenarios.</div>';return}
  const base=parseFloat(props.eui_base);
  const shallow=parseFloat(props.eui_shallo);
  const deep=parseFloat(props.eui_deep);
  if(isNaN(base)){dp.innerHTML='<div class="dp-hint">EUI data not available for this building.</div>';return}
  const pct=v=>Math.max(2,(v/globalMax*100)).toFixed(1);
  const label=id?`Building #${id}`:'Selected Building';
  dp.innerHTML=`
    <div class="dp-title">${label}</div>
    ${props.Typology?`<div class="dp-row"><span class="dk">Typology</span><span class="dv">${props.Typology}</span></div>`:''}
    <div class="dp-row"><span class="dk">Baseline EUI</span><span class="dv">${base.toFixed(2)}<span class="dv-unit">kWh/m²/yr</span></span></div>
    <div class="dp-row"><span class="dk">Shallow EUI</span><span class="dv">${isNaN(shallow)?'—':shallow.toFixed(2)}<span class="dv-unit">kWh/m²/yr</span></span></div>
    <div class="dp-row"><span class="dk">Deep EUI</span><span class="dv">${isNaN(deep)?'—':deep.toFixed(2)}<span class="dv-unit">kWh/m²/yr</span></span></div>
    ${(!isNaN(shallow))?`<div class="dp-row"><span class="dk">Shallow saving</span><span class="dv dv-save">↓ ${(base-shallow).toFixed(2)}<span class="dv-unit">kWh/m²/yr</span></span></div>`:''}
    ${(!isNaN(deep))?`<div class="dp-row"><span class="dk">Deep saving</span><span class="dv dv-save">↓ ${(base-deep).toFixed(2)}<span class="dv-unit">kWh/m²/yr</span></span></div>`:''}
    <div class="bar-wrap">
      <div class="bar-lbl">EUI relative to scenario max</div>
      <div class="bar-row"><span class="bar-name">Baseline</span><div class="bar-track"><div class="bar-fill" style="width:${pct(base)}%;background:#fb6a4a"></div></div><span class="bar-val">${base.toFixed(0)}</span></div>
      ${!isNaN(shallow)?`<div class="bar-row"><span class="bar-name">Shallow</span><div class="bar-track"><div class="bar-fill" style="width:${pct(shallow)}%;background:#de2d26"></div></div><span class="bar-val">${shallow.toFixed(0)}</span></div>`:''}
      ${!isNaN(deep)?`<div class="bar-row"><span class="bar-name">Deep</span><div class="bar-track"><div class="bar-fill" style="width:${pct(deep)}%;background:#67000d"></div></div><span class="bar-val">${deep.toFixed(0)}</span></div>`:''}
    </div>
  `;
}

function buildHist(layer){
  const s=stats[layer];
  if(!s||!s.vals||s.vals.length===0)return;
  const mn=globalMin,mx=globalMax;
  const bins=28,step=(mx-mn)/bins||1;
  const counts=Array(bins).fill(0);
  const labels=Array.from({length:bins},(_,i)=>(mn+i*step).toFixed(0));
  s.vals.forEach(v=>{let i=Math.min(bins-1,Math.max(0,Math.floor((v-mn)/step)));counts[i]++});
  const colors=counts.map((_,i)=>{const[r,g,b]=eui2rgb(mn+(i/(bins-1))*(mx-mn),mn,mx);return`rgba(${r},${g},${b},0.9)`});
  if(histChart)histChart.destroy();
  const ctx=document.getElementById('hc').getContext('2d');
  histChart=new Chart(ctx,{
    type:'bar',
    data:{labels,datasets:[{data:counts,backgroundColor:colors,borderWidth:0,borderRadius:1}]},
    options:{
      responsive:true,maintainAspectRatio:false,animation:{duration:300},
      plugins:{legend:{display:false},tooltip:{
        backgroundColor:'#fff',borderColor:'#e0e0e0',borderWidth:1,
        titleColor:'#333',bodyColor:'#555',
        titleFont:{family:'IBM Plex Mono',size:13},bodyFont:{family:'IBM Plex Mono',size:13},
        callbacks:{title:i=>i[0].label+' kWh/m²/yr',label:i=>i.raw+' buildings'}
      }},
      scales:{
        x:{ticks:{color:'#bbb',font:{family:'IBM Plex Mono',size:13},maxRotation:0,maxTicksLimit:5},grid:{display:false},border:{color:'#eee'}},
        y:{ticks:{color:'#bbb',font:{family:'IBM Plex Mono',size:13},maxTicksLimit:4},grid:{color:'#f5f5f5'},border:{display:false}}
      }
    }
  });
}

function updateStats(layer){
  const s=stats[layer];
  if(!s)return;
  document.getElementById('s-min').textContent=s.min.toFixed(0);
  document.getElementById('s-mean').textContent=s.mean.toFixed(0);
  document.getElementById('s-max').textContent=s.max.toFixed(0);
  const dEl=document.getElementById('s-delta');
  if(layer!=='base'&&stats.base){
    const d=s.mean-stats.base.mean,pct=(d/stats.base.mean*100).toFixed(1);
    dEl.textContent=pct+'% vs baseline';
  }else dEl.textContent='kWh/m²/yr';
  document.getElementById('ln-min').textContent=s.min.toFixed(0);
  document.getElementById('ln-q1').textContent=s.q1.toFixed(0);
  document.getElementById('ln-mid').textContent=((s.min+s.max)/2).toFixed(0);
  document.getElementById('ln-q3').textContent=s.q3.toFixed(0);
  document.getElementById('ln-max').textContent=s.max.toFixed(0);
  document.getElementById('desc-min').textContent=s.min.toFixed(1);
  document.getElementById('desc-max').textContent=s.max.toFixed(1);
  const dDesc=document.getElementById('desc-delta');
  if(layer!=='base'&&stats.base){
    const d=(stats.base.mean-s.mean),pct=(d/stats.base.mean*100).toFixed(1);
    dDesc.textContent='↓ '+d.toFixed(1)+' kWh/m²/yr ('+pct+'%)';
  }else dDesc.textContent='—';
}

function parseCSVRow(line){
  const result=[];let cur='';let inQ=false;
  for(let i=0;i<line.length;i++){
    if(line[i]==='"'){inQ=!inQ;}
    else if(line[i]===','&&!inQ){result.push(cur);cur='';}
    else{cur+=line[i];}
  }
  result.push(cur);
  return result;
}

async function loadCSVStats(){
  try{
    const res=await fetch(import.meta.env.BASE_URL+'EUI_Compile_upd.csv');
    const text=await res.text();
    const lines=text.trim().split('\n');
    const headers=parseCSVRow(lines[0]).map(h=>h.trim());
    const col=name=>headers.indexOf(name);
    const idIdx=col('ID'), baseIdx=col('eui_base'), shallowIdx=col('eui_shallow'), deepIdx=col('eui_deep');
    const newStats={};
    let allVals=[];
    const keys={base:baseIdx,shallow:shallowIdx,deep:deepIdx};
    Object.entries(keys).forEach(([k,idx])=>{
      const vals=lines.slice(1).map(line=>{
        const v=parseCSVRow(line);
        return parseFloat(v[idx]);
      }).filter(x=>!isNaN(x)&&x>0).sort((a,b)=>a-b);
      if(vals.length===0)return;
      const sum=vals.reduce((a,x)=>a+x,0);
      newStats[k]={min:vals[0],max:vals[vals.length-1],mean:sum/vals.length,q1:vals[Math.floor(vals.length*.25)],q3:vals[Math.floor(vals.length*.75)],vals};
      allVals=allVals.concat(vals);
    });
    if(Object.keys(newStats).length===0)return;
    stats=newStats;
    globalMin=Math.min(...allVals);
    globalMax=Math.max(...allVals);
    updateStats('base');
    buildHist('base');
    overlay&&overlay.setProps({layers:[buildingLayer()]});
  }catch(e){console.error('CSV load failed',e);}
}

function toggleAcc(id){
  document.getElementById(id+'-hdr').classList.toggle('open');
  document.getElementById(id+'-body').classList.toggle('open');
}

function buildingLayer(){
  return new MVTLayer({
    id:'buildings',
    data:`https://api.mapbox.com/v4/danielharianto.dyjgjv2g/{z}/{x}/{y}.mvt?access_token=${MAPBOX_TOKEN}`,
    minZoom:14,
    maxZoom:16,
    extruded:true,elevationScale:2,
    material:false,
    getElevation:f=>parseFloat(f.properties.HGT_AGL)||3,
    getFillColor:f=>getColor(f,curLayer),
    stroked:false,wireframe:false,
    pickable:true,autoHighlight:true,highlightColor:[255,255,255,80],
    onHover:handleHover,
    onClick:handleClick,
    updateTriggers:{getFillColor:[curLayer,selectedId]}
  });
}

const SIDEBAR_W=800;

function initMap(){
  mapInst=new mapboxgl.Map({
    container:'deck-container',
    style:'mapbox://styles/mapbox/dark-v10',
    center:[-112.129124,33.453338],
    zoom:15.5,
    bearing:0,
    pitch:40,
    antialias:true
  });

  overlay=new MapboxOverlay({
    interleaved:false,
    layers:[]
  });

  mapInst.addControl(overlay);

  mapInst.on('load',()=>{
    ['building','building-outline'].forEach(id=>{
      if(mapInst.getLayer(id)) mapInst.removeLayer(id);
    });
    overlay.setProps({layers:[buildingLayer()]});
    loadCSVStats();
  });

  window.addEventListener('resize',()=>{mapInst.resize();});
}

function setLayer(layer){
  curLayer=layer;
  document.querySelectorAll('.scen-tab').forEach(t=>{
    t.classList.toggle('active',t.dataset.layer===layer);
  });
  updateStats(layer);
  buildHist(layer);
  overlay&&overlay.setProps({layers:[buildingLayer()]});
}

function zoomMap(dir){
  if(mapInst) mapInst.setZoom(mapInst.getZoom()+dir*0.5);
}

window.setLayer=setLayer;
window.zoomMap=zoomMap;
window.toggleAcc=toggleAcc;

initMap();


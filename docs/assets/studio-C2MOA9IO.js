import{P as p,S as T,g as B,m as w,a as R,l as H,b as N}from"./grow-Dan61DCH.js";function A(i,e,n,o){i.innerHTML=`
    <div class="section">
      <div class="heading">seed</div>
      <div class="row">
        <input type="number" id="seed" value="${e.seed}">
        <button id="dice" title="new seed for everything not locked">dice</button>
        <button id="replay" title="replay the growth">replay</button>
      </div>
      <div class="row checks">
        <label><input type="checkbox" id="lockVase"> lock vase</label>
        <label><input type="checkbox" id="lockBlooms"> lock blooms</label>
      </div>
    </div>
    <div class="section"><div class="heading">palette</div><div class="pills" id="palettes"></div></div>
    <div class="section"><div class="heading">vase</div><div class="pills" id="silhouettes"></div></div>
    <div class="section">
      <div class="heading">shape</div>
      <div class="pills" id="modes" style="margin-bottom: 8px"></div>
      <div class="slider-row"><span>blooms</span><input type="range" id="mediums" min="1" max="5" step="1" value="1"><em id="mediums-val">auto</em></div>
      <div class="slider-row"><span>density</span><input type="range" id="density" min="0.5" max="1.5" step="0.05" value="${e.density}"><em id="density-val"></em></div>
      <div class="slider-row"><span>curve</span><input type="range" id="curviness" min="0" max="2" step="0.1" value="${e.curviness}"><em id="curviness-val"></em></div>
    </div>
    <div class="section">
      <div class="heading">motion</div>
      <div class="slider-row"><span>sway</span><input type="range" id="sway" min="0" max="2" step="0.1" value="${e.sway}"><em id="sway-val"></em></div>
      <div class="slider-row"><span>speed</span><input type="range" id="speed" min="0.5" max="2" step="0.1" value="${e.speed}"><em id="speed-val"></em></div>
    </div>
    <div class="section">
      <div class="heading">flowers</div><div class="pills" id="asset-heads"></div>
      <div class="heading" style="margin-top: 8px">leaves</div><div class="pills" id="asset-leaves"></div>
    </div>
    <div class="section"><div class="heading">view</div><div class="pills" id="views"></div></div>
    <div class="section"><button id="export" class="wide">export svg</button></div>
  `;const s=d=>i.querySelector(`#${d}`),a=s("seed"),l=(d,g,h,r,v=!1)=>{const M=s(d);for(const x of g){const k=document.createElement("button");k.textContent=x,k.dataset.value=x,k.addEventListener("click",()=>{r(x),o.onChange(v)}),M.appendChild(k)}return()=>{M.querySelectorAll("button").forEach(x=>x.classList.toggle("active",x.dataset.value===h()))}},c=(d,g)=>{const h=s(d);for(const r of n.filter(v=>v.kind===g)){const v=document.createElement("button");v.textContent=r.label,v.dataset.id=r.id,v.addEventListener("click",()=>{e.disabled.has(r.id)?e.disabled.delete(r.id):e.disabled.add(r.id),o.onChange(!1)}),h.appendChild(v)}return()=>{h.querySelectorAll("button").forEach(r=>r.classList.toggle("active",!e.disabled.has(r.dataset.id)))}},b=[c("asset-heads","head"),c("asset-leaves","leaf"),l("modes",["stems","posy","wreath"],()=>e.mode,d=>{e.mode=d},!0),l("palettes",p.map(d=>d.name),()=>p[e.paletteIndex].name,d=>{e.paletteIndex=p.findIndex(g=>g.name===d)}),l("silhouettes",["auto",...T],()=>e.silhouette,d=>{e.silhouette=d}),l("views",["bouquet","sheet","vases"],()=>e.view,d=>{e.view=d})];a.addEventListener("change",()=>{e.seed=Math.trunc(Number(a.value))||1,o.onDice()}),s("dice").addEventListener("click",()=>{e.seed=Date.now()%1e6,o.onDice()}),s("replay").addEventListener("click",o.onReplay),s("export").addEventListener("click",o.onExport),s("lockVase").addEventListener("change",d=>{e.lockVase=d.target.checked}),s("lockBlooms").addEventListener("change",d=>{e.lockBlooms=d.target.checked});const m=(d,g,h=!1)=>{const r=s(d);r.addEventListener(h?"input":"change",()=>{g(Number(r.value)),h?(I(),o.onSwayLive()):o.onChange(!1)})};m("mediums",d=>{e.mediums=d<=1?null:Math.round(d)}),m("density",d=>{e.density=d}),m("curviness",d=>{e.curviness=d}),m("sway",d=>{e.sway=d},!0),m("speed",d=>{e.speed=d});const I=()=>{for(const d of b)d();a.value=String(e.seed),s("lockVase").checked=e.lockVase,s("lockBlooms").checked=e.lockBlooms,s("mediums").value=String(e.mediums??1),s("mediums-val").textContent=e.mediums===null?"auto":String(e.mediums),s("density").value=String(e.density),s("density-val").textContent=e.density.toFixed(2),s("curviness").value=String(e.curviness),s("curviness-val").textContent=e.curviness.toFixed(1),s("sway").value=String(e.sway),s("sway-val").textContent=e.sway.toFixed(1),s("speed").value=String(e.speed),s("speed-val").textContent=e.speed.toFixed(1)};return{sync:I}}const q={x:-165,y:-345,w:330,h:510};function U(i,e){const n=p[e.paletteIndex],o=B(w(e.vaseSeed),n,e.silhouette,"x"),s=R(w(e.bloomSeed),n,i,{mouthHalf:o.mouthHalf,width:o.width,height:o.height},{mediums:e.mediums,density:e.density,curviness:e.curviness,mode:e.mode,literal:!0}),a=e.mode==="stems"?q:s.bounds?{x:s.bounds.x,y:s.bounds.y,w:s.bounds.w,h:s.bounds.h}:q;return`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${a.x} ${a.y} ${a.w} ${a.h}" width="${Math.round(a.w*2)}" height="${Math.round(a.h*2)}">
<title>Paper Bouquet</title>
<desc>Paper Bouquet, vase seed ${e.vaseSeed}, bloom seed ${e.bloomSeed}, palette ${n.name}.</desc>
<rect x="${a.x}" y="${a.y}" width="${a.w}" height="${a.h}" fill="${n.ground}"/>
`+s.markup+(e.mode==="stems"?`<g>${o.markup}</g>
`:"")+"</svg>"}function O(i,e){const n=U(i,e),o=new Blob([n],{type:"image/svg+xml"}),s=URL.createObjectURL(o),a=document.createElement("a");a.href=s,a.download=`paper-bouquet-v${e.vaseSeed}-b${e.bloomSeed}.svg`,a.click(),URL.revokeObjectURL(s)}const t={seed:1,vaseSeed:1,bloomSeed:1,lockVase:!1,lockBlooms:!1,paletteIndex:0,silhouette:"auto",mediums:null,density:1,curviness:1,mode:"stems",disabled:new Set,sway:1,speed:1,view:"bouquet"},S={speed:1,sway:1};let u,y=null;function j(){const i=new URLSearchParams(location.search),e=(c,b)=>{const m=Number(i.get(c));return Number.isFinite(m)&&i.has(c)?m:b};t.vaseSeed=Math.trunc(e("vs",1))||1,t.bloomSeed=Math.trunc(e("bs",1))||1,t.seed=t.bloomSeed;const n=p.findIndex(c=>c.name===i.get("pal"));n>=0&&(t.paletteIndex=n);const o=i.get("vase");o&&T.includes(o)&&(t.silhouette=o);const s=i.get("md");s&&s!=="auto"&&Number(s)>=2&&(t.mediums=Math.min(5,Math.trunc(Number(s)))),t.density=Math.min(1.5,Math.max(.5,e("dn",1))),t.curviness=Math.min(2,Math.max(0,e("cv",1)));const a=i.get("mode");a==="stems"||a==="posy"||a==="wreath"?t.mode=a:i.get("st")==="0"&&(t.mode="posy");const l=i.get("off");t.disabled=new Set(l?l.split(",").filter(Boolean):[]),t.sway=Math.min(2,Math.max(0,e("sw",1))),t.speed=Math.min(2,Math.max(.5,e("sp",1)))}function V(){const i=new URLSearchParams({vs:String(t.vaseSeed),bs:String(t.bloomSeed),pal:p[t.paletteIndex].name,vase:t.silhouette,md:t.mediums===null?"auto":String(t.mediums),dn:String(t.density),cv:String(t.curviness),mode:t.mode,sw:String(t.sway),sp:String(t.speed)});t.disabled.size&&i.set("off",[...t.disabled].join(",")),history.replaceState(null,"",`${location.pathname}?${i}`)}const _=document.getElementById("app");_.innerHTML=`
  <style>
    * { box-sizing: border-box; margin: 0; }
    body { font-family: ui-monospace, "SF Mono", Menlo, monospace; transition: background 0.4s ease; }
    h1 { font-size: 16px; font-weight: 600; position: fixed; top: 18px; left: 22px; color: var(--ink, #2b2825); z-index: 3; }
    .float-buttons { position: fixed; top: 14px; right: 18px; display: flex; gap: 8px; z-index: 4; }
    .float-buttons button {
      background: transparent; color: var(--ink, #2b2825); border-color: var(--ink, #2b2825);
      opacity: 0.75;
    }
    .float-buttons button:hover { opacity: 1; }
    #stage.full { position: fixed; inset: 0; }
    #stage.full svg { width: 100vw; height: 100vh; display: block; }
    #stage.grid-mode { padding: 64px 22px 22px; }
    #panel {
      position: fixed; top: 56px; right: 18px; width: 252px; max-height: calc(100vh - 76px);
      overflow-y: auto; z-index: 3; display: none; flex-direction: column; gap: 14px;
      background: #211f1d; color: #e8e0d2; padding: 16px; border-radius: 12px;
      box-shadow: 0 8px 30px rgba(0,0,0,0.28);
    }
    #panel.open { display: flex; }
    .section .heading { font-size: 11px; opacity: 0.55; margin-bottom: 6px; }
    .row { display: flex; gap: 6px; align-items: center; }
    .row.checks { margin-top: 6px; gap: 12px; }
    .row.checks label { font-size: 12px; display: flex; gap: 5px; align-items: center; cursor: pointer; }
    .pills { display: flex; flex-wrap: wrap; gap: 5px; }
    button {
      font: inherit; font-size: 12px; padding: 5px 10px; cursor: pointer;
      border: 1px solid #4a453e; border-radius: 6px; background: #2b2825; color: #e8e0d2;
    }
    #panel button.active { background: #e8e0d2; color: #1e1c1a; border-color: #e8e0d2; }
    button.wide { width: 100%; padding: 8px; }
    input[type="number"] {
      font: inherit; font-size: 12px; width: 84px; padding: 5px 8px;
      border: 1px solid #4a453e; border-radius: 6px; background: #2b2825; color: #e8e0d2;
    }
    .slider-row { display: grid; grid-template-columns: 52px 1fr 34px; gap: 8px; align-items: center; margin: 5px 0; font-size: 12px; }
    .slider-row em { font-style: normal; opacity: 0.65; font-size: 11px; text-align: right; }
    input[type="range"] { accent-color: #e8e0d2; width: 100%; }
    .sheet { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; }
    .sheet .cell { position: relative; }
    .sheet svg { width: 100%; height: auto; }
    .sheet .tag { position: absolute; top: 8px; left: 10px; font-size: 10px; opacity: 0.6; color: var(--ink, #2b2825); }
  </style>
  <h1>Paper Bouquet</h1>
  <div class="float-buttons">
    <button id="quickDice" title="grow a new bouquet">dice</button>
    <button id="settingsToggle" title="open and close the settings">settings</button>
  </div>
  <div id="stage"></div>
  <div id="panel"></div>
`;const f=document.getElementById("stage");function W(i){const e=parseInt(i.slice(1),16);return .299*(e>>16&255)+.587*(e>>8&255)+.114*(e&255)>140?"#2b2825":"#f2e8d5"}function E(){const i=o=>!t.disabled.has(o.id);let e={large:u.heads.large.filter(i),medium:u.heads.medium.filter(i),small:u.heads.small.filter(i)};const n=[...e.large,...e.medium,...e.small];return n.length===0?e=u.heads:(e.large.length||(e={...e,large:n}),e.medium.length||(e={...e,medium:n})),{heads:e,leaves:u.leaves.filter(i),sprigs:u.sprigs,byId:u.byId}}function C(i,e,n){const o=p[t.paletteIndex],s=t.silhouette==="auto"?void 0:t.silhouette,a=B(w(i),o,s,`s${i}-${e}`),l=R(w(e),o,E(),{mouthHalf:a.mouthHalf,width:a.width,height:a.height},{mediums:t.mediums??void 0,density:t.density,curviness:t.curviness,mode:t.mode}),c=n?`<div class="tag">${e}</div>`:"",b=t.mode==="stems"?"-165 -345 330 510":l.bounds?`${l.bounds.x} ${l.bounds.y} ${l.bounds.w} ${l.bounds.h}`:"-165 -165 330 330";return`
    <div class="cell">${c}
      <svg viewBox="${b}">
        ${l.markup}
        ${t.mode==="stems"?`<g class="pb-vase">${a.markup}</g>`:""}
      </svg>
    </div>`}function G(i,e){const n=p[t.paletteIndex],o=t.silhouette==="auto"?void 0:t.silhouette,s=B(w(i),n,o,`v${i}`);return`
    <div class="cell">${`<div class="tag">${i} ${s.silhouette}</div>`}
      <svg viewBox="-110 -12 220 174">
        <g transform="translate(0 ${150-s.height})">${s.markup}</g>
      </svg>
    </div>`}function $(i){y==null||y.destroy(),y=null,S.speed=t.speed,S.sway=t.sway;const e=p[t.paletteIndex].ground;if(document.body.style.background=e,document.documentElement.style.setProperty("--ink",W(e)),t.view==="bouquet"){f.className="full",document.body.style.overflow="hidden",f.innerHTML=C(t.vaseSeed,t.bloomSeed,!1);const n=f.querySelector("svg");if(n){const o=n.getBBox(),s=24;n.setAttribute("viewBox",`${o.x-s} ${o.y-s} ${o.width+s*2} ${o.height+s*2}`),i&&(y=N(n,t.bloomSeed,S))}}else{f.className="grid-mode",document.body.style.overflow="auto";const n=t.view==="sheet"?s=>C(t.vaseSeed+s,t.bloomSeed+s,!0):s=>G(t.vaseSeed+s);let o="";for(let s=0;s<12;s++)o+=n(s);f.innerHTML=`<div class="sheet">${o}</div>`}V(),L==null||L.sync()}function D(){t.lockVase||(t.vaseSeed=t.seed),t.lockBlooms||(t.bloomSeed=t.seed),$(!0)}const F=document.getElementById("panel"),z=document.getElementById("settingsToggle");z.addEventListener("click",()=>{const i=F.classList.toggle("open");z.textContent=i?"close":"settings"});document.getElementById("quickDice").addEventListener("click",()=>{t.seed=Date.now()%1e6,D()});const P=()=>({vaseSeed:t.vaseSeed,bloomSeed:t.bloomSeed,paletteIndex:t.paletteIndex,silhouette:t.silhouette==="auto"?void 0:t.silhouette,mediums:t.mediums??void 0,density:t.density,curviness:t.curviness,mode:t.mode});let L=null;j();H().then(i=>{u=i;const e=[...u.byId.values()].filter(n=>n.type==="head"||n.type==="leaf").map(n=>({id:n.id,label:n.id.replace(/^(head|leaf)-/,""),kind:n.type}));L=A(F,t,e,{onDice:D,onReplay(){t.view!=="bouquet"&&(t.view="bouquet"),$(!0)},onExport(){O(E(),P())},onChange(n){$(n)},onSwayLive(){S.sway=t.sway,V()}}),$(!0),window.__pbExport=()=>U(E(),P())});

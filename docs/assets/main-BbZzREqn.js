import{l as x,p as y,r as d,g as v,a as f,b as k,P as w,m as E,c as z}from"./grow-CO0DWtem.js";const B=2,S=.5;let u,o=null;const $=document.getElementById("app");$.innerHTML=`
  <style>
    * { box-sizing: border-box; margin: 0; }
    body { font-family: ui-monospace, "SF Mono", Menlo, monospace; transition: background 0.4s ease; cursor: pointer; }
    h1 { font-size: 16px; font-weight: 600; position: fixed; top: 18px; left: 22px; color: var(--ink, #2b2825); z-index: 3; }
    #generate {
      position: fixed; top: 14px; right: 18px; z-index: 4; cursor: pointer;
      font: inherit; font-size: 12px; padding: 5px 11px; border-radius: 6px;
      background: transparent; color: var(--ink, #2b2825); border: 1px solid var(--ink, #2b2825);
      opacity: 0.75;
    }
    #generate:hover { opacity: 1; }
    #studio-link {
      position: fixed; bottom: 14px; right: 18px; z-index: 3; font-size: 11px;
      color: var(--ink, #2b2825); opacity: 0.35; text-decoration: none;
    }
    #studio-link:hover { opacity: 0.8; }
    #stage { position: fixed; inset: 0; }
    #stage svg { width: 100vw; height: 100vh; display: block; }
  </style>
  <h1>Paper Bouquet</h1>
  <button id="generate">generate</button>
  <div id="stage"></div>
  <a id="studio-link" href="studio.html">studio</a>
`;const c=document.getElementById("stage");function L(e){const t=parseInt(e.slice(1),16);return .299*(t>>16&255)+.587*(t>>8&255)+.114*(t&255)>140?"#2b2825":"#f2e8d5"}function p(e){o==null||o.destroy(),o=null;const t=E(e),n=y(t,w),l=z(t,2,5),m=d(t,.6,1.4),b=d(t,.3,1.7),i=v(t,n),h=f(t,n,u,{mouthHalf:i.mouthHalf,width:i.width,height:i.height},{mediums:l,density:m,curviness:b});document.body.style.background=n.ground,document.documentElement.style.setProperty("--ink",L(n.ground)),c.innerHTML=`
    <svg viewBox="-165 -345 330 510">
      ${h.markup}
      <g class="pb-vase">${i.markup}</g>
    </svg>`;const a=c.querySelector("svg"),s=a.getBBox(),r=24;a.setAttribute("viewBox",`${s.x-r} ${s.y-r} ${s.width+r*2} ${s.height+r*2}`),o=k(a,e,{speed:S,sway:B})}const g=()=>Date.now()%1e6;x().then(e=>{u=e,p(g()),document.addEventListener("click",t=>{t.target.closest("#studio-link")||p(g())})});

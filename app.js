(function(){
"use strict";

/* ---------- Catálogos ---------- */
const ESTADOS=[
  {k:'espera',l:'En espera',v:'--st-espera'},
  {k:'progreso',l:'En progreso',v:'--st-progreso'},
  {k:'terminado',l:'Terminado',v:'--st-terminado'},
  {k:'mejoras',l:'En mejora',v:'--st-mejoras'}
];
const EST=Object.fromEntries(ESTADOS.map(e=>[e.k,e]));
const MOD_ESTADOS=ESTADOS.filter(e=>e.k!=='mejoras');
const PRIO_L={alta:'Alta',media:'Media',baja:'Baja'};
const PRIO_R={alta:0,media:1,baja:2};
const FASE_L={pendiente:'Pendiente',curso:'En curso',hecha:'Hecha'};
const FASE_NEXT={pendiente:'curso',curso:'hecha',hecha:'pendiente'};
const FASE_C={pendiente:'--st-espera',curso:'--st-progreso',hecha:'--st-terminado'};
const TIPOS_BASE=['Automatización','Reporte','Aplicación','Portal','Mejora de proceso','Infraestructura'];
const VIEWS=['tablero','cronograma','indicadores'];
const DAY=86400000;
const SIN_RESP='Sin responsable';

/* ---------- Estado ---------- */
const S={
  projects:[], dbProjects:[], localProjects:[],
  mode:'loading', loaded:false, demo:false,
  view:'tablero', openId:null, editId:null, mejId:null,
  f:{q:'',resp:'',tipo:''},
  canWrite:true, user:null, userId:null,
  showDone:false, showPhases:true, detailDirty:false, closedMods:new Set()
};
let sb=null, channel=null, loadTimer=null, charts=[];
const queues={};

/* ---------- Utilidades ---------- */
const $=s=>document.querySelector(s);
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clone=o=>JSON.parse(JSON.stringify(o));
const uid=pre=>pre+Date.now().toString(36)+Math.random().toString(36).slice(2,7);
const cssv=n=>getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const arr=x=>Array.isArray(x)?x:[];
function fade(hex,a){const m=/^#?([0-9a-f]{6})$/i.exec(hex||'');if(!m)return hex;const n=parseInt(m[1],16);return `rgba(${n>>16&255},${n>>8&255},${n&255},${a})`;}
function parseD(s){if(!s||typeof s!=='string')return null;const a=s.split('-').map(Number);if(a.length!==3||a.some(isNaN))return null;return new Date(a[0],a[1]-1,a[2]);}
function today(){const t=new Date();return new Date(t.getFullYear(),t.getMonth(),t.getDate());}
const todayIso=()=>iso(today());
function iso(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
function addDays(d,n){const x=new Date(d);x.setDate(x.getDate()+n);return x;}
function fmtD(s){const d=parseD(s);if(!d)return '—';const o={day:'numeric',month:'short'};if(d.getFullYear()!==new Date().getFullYear())o.year='numeric';return d.toLocaleDateString('es-MX',o);}
function fmtDT(isoStr){const d=new Date(isoStr);if(isNaN(d))return '';return d.toLocaleDateString('es-MX',{day:'numeric',month:'short',year:'numeric'})+', '+d.toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit'});}
function ndays(a,b){return Math.max(0,Math.round((b-a)/DAY));}
function nd(n){return `${n} ${n===1?'día':'días'}`;}
function maxIso(list){const ds=list.map(parseD).filter(Boolean);return ds.length?iso(new Date(Math.max(...ds))):'';}
function minIso(list){const ds=list.map(parseD).filter(Boolean);return ds.length?iso(new Date(Math.min(...ds))):'';}
function estadoOf(o){return EST[o.estado]?o.estado:'espera';}
function getP(id){return S.projects.find(p=>p.id===id);}
const mods=p=>arr(p.modulos);
const modDone=m=>estadoOf(m)==='terminado';
function closedP(p){const e=estadoOf(p);return e==='terminado'||(e==='mejoras'&&!!parseD(p.fechaCierre));}
const openMej=p=>arr(p.mejoras).filter(m=>!m.cierre);
function modProgress(m){if(modDone(m))return 100;const f=arr(m.fases);return f.length?Math.round(f.filter(x=>x.estado==='hecha').length/f.length*100):0;}
function units(p){
  const u=arr(p.fases).map(f=>f.estado==='hecha');
  mods(p).forEach(m=>{const f=arr(m.fases);if(f.length)u.push(...f.map(x=>x.estado==='hecha'||modDone(m)));else u.push(modDone(m));});
  return u;
}
function progress(p){if(closedP(p))return 100;const u=units(p);return u.length?Math.round(u.filter(Boolean).length/u.length*100):0;}
function allPhases(p){return arr(p.fases).concat(...mods(p).map(m=>arr(m.fases)));}
function respOf(p,m){return ((m&&m.responsable)||p.responsable||'').trim()||SIN_RESP;}
function fullName(p,m){return m?`${p.nombre||'Sin nombre'} › ${m.nombre||'Módulo'}`:(p.nombre||'Sin nombre');}
/* Texto de tiempo: abierto crece día con día; cerrado muestra la duración final */
function ageText(o,closed){
  const s=parseD(o.fechaInicio),c=parseD(o.fechaCierre);
  if(closed&&c)return s?`Cerrado ${fmtD(o.fechaCierre)}, ${nd(ndays(s,c))}`:`Cerrado ${fmtD(o.fechaCierre)}`;
  if(!s)return 'Sin iniciar';
  const n=ndays(s,today());return n===0?'Inició hoy':`Lleva ${nd(n)}`;
}
function workItems(list){
  const out=[];
  list.forEach(p=>{
    const ms=mods(p);
    if(ms.length)ms.forEach(m=>out.push({p,m,estado:closedP(p)?estadoOf(p):estadoOf(m),resp:respOf(p,m),name:fullName(p,m)}));
    else out.push({p,m:null,estado:estadoOf(p),resp:respOf(p),name:fullName(p)});
  });
  return out;
}

/* ---------- Reglas de fechas automáticas ---------- */
function setEstado(o,e){
  if(!EST[e]||o.estado===e)return;
  const prev=o.estado,t=todayIso();
  o.estado=e;
  o.historial=arr(o.historial).concat({estado:e,fecha:new Date().toISOString()}).slice(-40);
  if(e==='progreso'&&!o.fechaInicio)o.fechaInicio=t;
  if(e==='terminado'){
    if(!(prev==='mejoras'&&o.fechaCierre))o.fechaCierre=t;   // al cerrar una mejora se conserva el cierre original
    if(!o.fechaInicio)o.fechaInicio=o.fechaCierre;
    arr(o.mejoras).forEach(m=>{if(!m.cierre)m.cierre=t;});
  }else if(e!=='mejoras'){
    delete o.fechaCierre;
  }
}
function touchStart(p){
  if(!p.fechaInicio)p.fechaInicio=todayIso();
  if(estadoOf(p)==='espera')setEstado(p,'progreso');
}
function syncModule(m){
  const fs=arr(m.fases);if(!fs.length)return;
  const started=fs.filter(f=>f.estado!=='pendiente');
  const firstStart=minIso(started.map(f=>f.inicio));
  if(firstStart&&(!m.fechaInicio||parseD(firstStart)<parseD(m.fechaInicio)))m.fechaInicio=firstStart;
  if(fs.every(f=>f.estado==='hecha')){
    if(!modDone(m)){m.estado='terminado';m.historial=arr(m.historial).concat({estado:'terminado',fecha:new Date().toISOString()});}
    m.fechaCierre=maxIso(fs.map(f=>f.fin))||todayIso();
  }else if(modDone(m)){
    m.estado='progreso';delete m.fechaCierre;
  }else if(started.length&&estadoOf(m)==='espera'){
    m.estado='progreso';
  }
}
function cyclePhase(p,scope,i){
  const fs=fasesRef(p,scope);const f=fs&&fs[i];if(!f)return false;
  const t=todayIso(),next=FASE_NEXT[f.estado]||'curso';
  f.estado=next;
  if(next==='curso'){if(!f.inicio)f.inicio=t;f.fin='';}
  else if(next==='hecha'){if(!f.inicio)f.inicio=t;f.fin=t;}
  else{f.inicio='';f.fin='';}
  if(scope)syncModule(getMod(p,scope));
  if(next!=='pendiente')touchStart(p);
}
function lastDoneDate(p){
  return maxIso([...allPhases(p).map(f=>f.fin),...mods(p).map(m=>m.fechaCierre)].filter(d=>parseD(d)&&parseD(d)<=today()));
}

/* ---------- Datos: tienda compartida, local o ejemplo ---------- */
function setSave(t){$('#saveState').textContent=t||'';}
function enqueue(id,fn){const prev=queues[id]||Promise.resolve();const next=prev.catch(()=>{}).then(fn);queues[id]=next;return next;}
function upsertMem(p){const i=S.projects.findIndex(x=>x.id===p.id);if(i>=0)S.projects[i]=p;else S.projects.push(p);}
function persistLocal(){}
async function writeWithRetry(fn){
  try{return await fn();}
  catch(e){if(isNetErr(e)){await new Promise(r=>setTimeout(r,600+Math.random()*900));return fn();}throw e;}
}
function writeError(e){
  const code=e&&e.code,msg=(e&&e.message)||'';
  if(code==='42501'||/row-level security|permission/i.test(msg)){
    notice('perm','warn','No tienes permiso para guardar. Tu usuario debe estar dado de alta en el equipo; pide acceso al administrador.');setSave('Sin guardar');
  }else if(code==='PGRST301'||code==='PGRST303'||/jwt/i.test(msg)){
    notice('ses','warn','Tu sesión expiró y el último cambio no se guardó. Vuelve a iniciar sesión.',[{label:'Iniciar sesión',fn:()=>sb.auth.signOut()}]);setSave('Sin guardar');
  }else if(code==='23514'){
    notice('quota','warn','El proyecto es demasiado grande para guardarse. Elimina notas o fases antiguas.');setSave('Sin guardar');
  }else{
    notice('err','warn','No se pudo guardar el último cambio. Revisa tu conexión e inténtalo otra vez.');setSave('Sin guardar');
  }
}
async function saveProject(p){
  p.actualizado=new Date().toISOString();
  if(S.demo){upsertMem(p);render();return;}
  if(S.mode==='db'){
    upsertMem(p);render();setSave('Guardando…');
    try{await enqueue(p.id,()=>writeWithRetry(()=>sbSave(p)));setSave('Guardado');clearNotice('err');}
    catch(e){writeError(e);}
  }else{upsertMem(p);persistLocal();render();setSave('Guardado en este navegador');}
}
async function removeProject(id){
  {const i=S.projects.findIndex(p=>p.id===id);if(i>=0)S.projects.splice(i,1);}
  if(S.demo){render();return;}
  if(S.mode==='db'){
    render();setSave('Guardando…');
    try{await enqueue(id,()=>writeWithRetry(()=>sbDelete(id)));setSave('Guardado');}
    catch(e){writeError(e);}
  }else{persistLocal();render();}
}
function editProject(id,fn){const cur=getP(id);if(!cur||!S.canWrite)return;const p=clone(cur);if(fn(p)===false)return;saveProject(p);}
function getMod(p,mid){return mods(p).find(m=>m.id===mid);}
function fasesRef(p,scope){
  if(scope){const m=getMod(p,scope);if(!m)return null;if(!Array.isArray(m.fases))m.fases=[];return m.fases;}
  if(!Array.isArray(p.fases))p.fases=[];return p.fases;
}

/* ---------- Avisos ---------- */
const NOTICES={};
function notice(key,kind,text,actions){NOTICES[key]={kind,text,actions:actions||[]};renderNotices();}
function clearNotice(key){if(NOTICES[key]){delete NOTICES[key];renderNotices();}}
function flash(key,text){notice(key,'info',text);setTimeout(()=>clearNotice(key),7000);}
function renderNotices(){
  const box=$('#notices');box.innerHTML='';
  Object.values(NOTICES).forEach(n=>{
    const d=document.createElement('div');d.className='notice'+(n.kind==='warn'?' warn':'');
    const p=document.createElement('p');p.textContent=n.text;d.appendChild(p);
    n.actions.forEach(a=>{const b=document.createElement('button');b.type='button';b.className='btn btn-sm';b.textContent=a.label;b.onclick=a.fn;d.appendChild(b);});
    box.appendChild(d);
  });
}

/* ---------- Filtros ---------- */
function filtered(){
  const q=S.f.q.trim().toLowerCase();
  return S.projects.filter(p=>{
    if(S.f.resp){const rs=[p.responsable,...mods(p).map(m=>m.responsable)].map(x=>(x||'').trim());if(!rs.includes(S.f.resp))return false;}
    if(S.f.tipo&&(p.tipo||'')!==S.f.tipo)return false;
    if(q){const h=[p.nombre,p.descripcion,p.responsable,p.tipo,...mods(p).map(m=>m.nombre+' '+(m.responsable||'')),...arr(p.mejoras).map(m=>m.descripcion)].join(' ').toLowerCase();if(!h.includes(q))return false;}
    return true;
  });
}
function uniqVals(vals){return [...new Set(vals.map(v=>(v||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es'));}
function renderFilterOptions(){
  const fill=(sel,vals,label,cur)=>{
    const s=$(sel);const html=`<option value="">${label}</option>`+vals.map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join('');
    if(s.dataset.h!==html){s.innerHTML=html;s.dataset.h=html;}
    s.value=cur;
  };
  const resps=uniqVals(S.projects.flatMap(p=>[p.responsable,...mods(p).map(m=>m.responsable)]));
  const tipos=uniqVals(S.projects.map(p=>p.tipo));
  if(S.f.resp&&!resps.includes(S.f.resp))S.f.resp='';
  if(S.f.tipo&&!tipos.includes(S.f.tipo))S.f.tipo='';
  fill('#fResp',resps,'Todos los responsables',S.f.resp);
  fill('#fTipo',tipos,'Todos los tipos',S.f.tipo);
  $('#dlResp').innerHTML=resps.map(v=>`<option value="${esc(v)}">`).join('');
  $('#dlTipo').innerHTML=uniqVals([...TIPOS_BASE,...tipos]).map(v=>`<option value="${esc(v)}">`).join('');
}

/* ---------- KPIs ---------- */
function monthKey(d){return d.getFullYear()*12+d.getMonth();}
function renderKPIs(list){
  const by=k=>list.filter(p=>estadoOf(p)===k);
  const prog=by('progreso'),esp=by('espera'),mej=by('mejoras');
  const activos=prog.length+esp.length;
  const avg=prog.length?Math.round(prog.reduce((a,p)=>a+progress(p),0)/prog.length):0;
  const closed=list.filter(p=>closedP(p)&&parseD(p.fechaCierre));
  const now=monthKey(today());
  const closedIn=m=>closed.filter(p=>monthKey(parseD(p.fechaCierre))===m).length;
  const tAct=closedIn(now),tAnt=closedIn(now-1),delta=tAct-tAnt;
  const durs=closed.filter(p=>parseD(p.fechaInicio)).map(p=>ndays(parseD(p.fechaInicio),parseD(p.fechaCierre)));
  const avgDur=durs.length?Math.round(durs.reduce((a,b)=>a+b,0)/durs.length):null;
  const openM=mej.reduce((a,p)=>a+openMej(p).length,0);
  const modsAct=[...prog,...esp].reduce((a,p)=>a+mods(p).filter(m=>!modDone(m)).length,0);
  const altas=a=>a.filter(p=>p.prioridad==='alta').length;
  const deltaTxt=delta===0?'<b>sin cambio</b>':`<b class="${delta>0?'up':'down'}">${delta>0?'+':'−'}${Math.abs(delta)}</b>`;
  const k=(title,val,ctx,color)=>`<article class="kpi" style="--k:var(${color})"><h2>${title}</h2><div class="val">${val}</div><div class="ctx">${ctx}</div></article>`;
  $('#kpis').innerHTML=
    k('Proyectos activos',activos,modsAct?`<b>${modsAct}</b> ${modsAct===1?'módulo abierto':'módulos abiertos'}, de ${list.length} proyectos`:`de ${list.length} en total`,'--brand')+
    k('En progreso',prog.length,`Avance promedio <b>${avg}%</b>`,'--st-progreso')+
    k('En espera',esp.length,altas(esp)?`<b>${altas(esp)}</b> de prioridad alta`:'Por arrancar','--st-espera')+
    k('Terminados este mes',tAct,`Mes anterior ${tAnt} → ${tAct}, ${deltaTxt}`,'--st-terminado')+
    k('En mejora',mej.length,openM?`<b>${openM}</b> ${openM===1?'mejora abierta':'mejoras abiertas'}`:'Ninguna abierta','--st-mejoras')+
    k('Duración promedio',avgDur===null?'—':`${avgDur}<small>${avgDur===1?'día':'días'}</small>`,durs.length?`Inicio a cierre, ${durs.length} ${durs.length===1?'proyecto':'proyectos'}`:'Aún no hay proyectos cerrados','--brand');
}

/* ---------- Vista: tablero ---------- */
function sortCards(a,b){
  const pa=PRIO_R[a.prioridad]??1,pb=PRIO_R[b.prioridad]??1;if(pa!==pb)return pa-pb;
  const da=parseD(a.fechaInicio),db=parseD(b.fechaInicio);if(da&&db)return da-db;if(da)return -1;if(db)return 1;
  return (a.nombre||'').localeCompare(b.nombre||'','es');
}
function cardHTML(p){
  const e=EST[estadoOf(p)],pr=progress(p),ph=allPhases(p),ms=mods(p),om=openMej(p);
  const left=estadoOf(p)==='mejoras'&&om.length?`Mejora desde ${fmtD(minIso(om.map(m=>m.inicio)))}`:ageText(p,closedP(p));
  const modList=ms.length?`<ul class="mods">${ms.slice(0,4).map(m=>`<li style="--c:var(${EST[estadoOf(m)].v})" title="${esc(m.nombre)}: ${EST[estadoOf(m)].l}"><span class="dot"></span><span class="mn">${esc(m.nombre)}</span><span>${modProgress(m)}%</span></li>`).join('')}${ms.length>4?`<li class="more">${ms.length-4} más</li>`:''}</ul>`:'';
  const right=estadoOf(p)==='mejoras'?`${om.length} ${om.length===1?'mejora abierta':'mejoras abiertas'}`:(ms.length?`${ms.length} ${ms.length===1?'módulo':'módulos'}`:(ph.length?`${ph.filter(x=>x.estado==='hecha').length}/${ph.length} fases`:'Sin fases'));
  return `<article class="card" tabindex="0" data-id="${esc(p.id)}" ${S.canWrite?'draggable="true"':''} style="--c:var(${e.v})" aria-label="${esc(p.nombre)}, ${e.l}, avance ${pr}%">
    <div class="card-top"><h4>${esc(p.nombre||'Sin nombre')}</h4><span class="prio prio-${esc(PRIO_L[p.prioridad]?p.prioridad:'media')}">${PRIO_L[p.prioridad]||'Media'}</span></div>
    <div class="who">${p.responsable?`<span>${esc(p.responsable)}</span>`:''}${p.tipo?`<span>${esc(p.tipo)}</span>`:''}${!p.responsable&&!p.tipo?'<span>Sin responsable</span>':''}</div>
    <div class="prog"><div class="bar"><i style="width:${pr}%"></i></div><span>${pr}%</span></div>
    ${modList}
    <div class="card-foot"><span>${esc(left)}</span><span>${right}</span></div>
  </article>`;
}
function renderBoard(list){
  $('#view').innerHTML=`<div class="board-scroll"><div class="board">${ESTADOS.map(e=>{
    const items=list.filter(p=>estadoOf(p)===e.k).sort(sortCards);
    const emptyTxt=!S.canWrite?'Sin proyectos':(e.k==='mejoras'?'Arrastra aquí un proyecto terminado para registrarle una mejora':'Arrastra un proyecto aquí');
    return `<section class="col" data-estado="${e.k}" style="--c:var(${e.v})" aria-label="${e.l}">
      <div class="col-head"><h3>${e.l}</h3><span class="count">${items.length}</span></div>
      <div class="col-body">${items.map(cardHTML).join('')||`<div class="col-empty">${emptyTxt}</div>`}</div>
    </section>`;}).join('')}</div></div>`;
}

/* ---------- Vista: cronograma ---------- */
function projectSegments(p,t){
  const s=parseD(p.fechaInicio),c=parseD(p.fechaCierre),segs=[],marks=[];
  if(closedP(p)&&c){
    segs.push({s,e:c,c:'--st-terminado',label:nd(ndays(s,c)),title:`${p.nombre}: del ${fmtD(p.fechaInicio)} al ${fmtD(p.fechaCierre)} (${nd(ndays(s,c))})`});
    let cur=c;
    arr(p.mejoras).filter(m=>parseD(m.inicio)).sort((a,b)=>parseD(a.inicio)-parseD(b.inicio)).forEach(m=>{
      const ms=parseD(m.inicio),me=parseD(m.cierre)||t;
      if(ms>cur)segs.push({s:cur,e:ms,c:'--st-mejoras',gap:true,title:`${p.nombre}: cerrado, antes de la mejora`});
      segs.push({s:ms,e:me,c:'--st-mejoras',mark:true,open:!m.cierre,label:nd(ndays(ms,me)),title:`Mejora: ${m.descripcion} (desde ${fmtD(m.inicio)}${m.cierre?', cerrada el '+fmtD(m.cierre):', abierta'})`});
      marks.push({d:ms,title:`Inicio de mejora (${fmtD(m.inicio)}): ${m.descripcion}`});
      if(me>cur)cur=me;
    });
  }else{
    segs.push({s,e:t,c:estadoOf(p)==='espera'?'--st-espera':'--st-progreso',open:true,label:nd(ndays(s,t)),title:`${p.nombre}: desde ${fmtD(p.fechaInicio)}, en curso (${nd(ndays(s,t))})`});
  }
  return {segs,marks};
}
function renderTimeline(list){
  const t=today();
  const pool=list.filter(p=>S.showDone||estadoOf(p)!=='terminado');
  const started=pool.filter(p=>parseD(p.fechaInicio)).sort((a,b)=>parseD(a.fechaInicio)-parseD(b.fechaInicio));
  const notStarted=pool.filter(p=>!parseD(p.fechaInicio));
  const legend=`<div class="legend">
    <span><i style="--c:var(--st-progreso)"></i>En curso</span>
    <span><i style="--c:var(--st-terminado)"></i>Terminado</span>
    <span><i style="--c:var(--st-mejoras)"></i>Mejora</span>
    <span><i class="gap-i"></i>Cerrado, antes de la mejora</span>
    <span><i class="dia"></i>Inicio de mejora</span>
    <span><i style="--c:var(--bad);width:2px"></i>Hoy</span></div>`;
  let html=`<div class="panel"><div class="panel-head"><h3>Cronograma</h3>
    <label class="check"><input type="checkbox" id="tlPhases" ${S.showPhases?'checked':''}> Mostrar fases</label>
    <label class="check"><input type="checkbox" id="tlDone" ${S.showDone?'checked':''}> Incluir terminados</label></div>${legend}`;
  if(!started.length){
    html+=`<p class="q" style="margin-top:14px">Ningún proyecto ha arrancado todavía. Las barras aparecen cuando un proyecto pasa a En progreso o se avanza su primera fase.</p>`;
  }else{
    const rows=[];
    const phaseRows=(fases,p,deep)=>{
      if(!S.showPhases)return;
      arr(fases).filter(f=>f.estado!=='pendiente'&&parseD(f.inicio)).sort((a,b)=>parseD(a.inicio)-parseD(b.inicio)).forEach(f=>{
        const s=parseD(f.inicio),done=f.estado==='hecha'&&parseD(f.fin),e=done?parseD(f.fin):t;
        rows.push({cls:'ph'+(deep?' deep':''),p,label:f.nombre,title:f.nombre,
          segs:[{s,e,c:done?'--st-terminado':'--st-progreso',open:!done,title:`Fase ${f.nombre}: desde ${fmtD(f.inicio)}${done?' hasta '+fmtD(f.fin):', en curso'} (${nd(ndays(s,e))})`}],marks:[]});
      });
    };
    started.forEach(p=>{
      const {segs,marks}=projectSegments(p,t);
      const om=openMej(p);
      const sub=`${p.responsable||SIN_RESP} — ${estadoOf(p)==='mejoras'&&om.length?'Mejora desde '+fmtD(minIso(om.map(m=>m.inicio))):ageText(p,closedP(p))}`;
      rows.push({cls:'',p,label:p.nombre||'Sin nombre',title:fullName(p),sub,segs,marks});
      phaseRows(p.fases,p,false);
      mods(p).filter(m=>parseD(m.fechaInicio)).sort((a,b)=>parseD(a.fechaInicio)-parseD(b.fechaInicio)).forEach(m=>{
        const ms=parseD(m.fechaInicio),mc=modDone(m)&&parseD(m.fechaCierre),me=mc||t;
        rows.push({cls:'sub',p,label:m.nombre,title:fullName(p,m),sub:[m.responsable,ageText(m,modDone(m))].filter(Boolean).join(' — '),
          segs:[{s:ms,e:me,c:mc?'--st-terminado':'--st-progreso',open:!mc,label:nd(ndays(ms,me)),title:`${fullName(p,m)}: desde ${fmtD(m.fechaInicio)}${mc?' hasta '+fmtD(m.fechaCierre):', en curso'} (${nd(ndays(ms,me))})`}],marks:[]});
        phaseRows(m.fases,p,true);
      });
    });
    const all=rows.flatMap(r=>r.segs.flatMap(x=>[x.s,x.e]));
    let min=new Date(Math.min(t,...all)),max=new Date(Math.max(t,...all));
    min=new Date(min.getFullYear(),min.getMonth(),1);max=new Date(max.getFullYear(),max.getMonth()+1,1);
    const total=max-min,pos=d=>((d-min)/total*100);
    const months=[];for(let d=new Date(min);d<max;d=new Date(d.getFullYear(),d.getMonth()+1,1))months.push(new Date(d));
    const showYear=min.getFullYear()!==addDays(max,-1).getFullYear();
    const mLabel=d=>d.toLocaleDateString('es-MX',showYear||months.length>8?{month:'short',year:'2-digit'}:{month:'long'});
    const grid=months.map(m=>`<span class="tl-grid" style="left:${pos(m)}%"></span>`).join('');
    const segHTML=(r,x)=>{
      const l=pos(x.s),w=Math.max(pos(x.e)-l,0.5);
      if(x.gap)return `<span class="seg gap" style="--c:var(${x.c});left:${l}%;width:${w}%" title="${esc(x.title)}"></span>`;
      return `<button type="button" class="seg${x.open?' open':''}${x.mark?' marked':''}" data-open="${esc(r.p.id)}" style="--c:var(${x.c});left:${l}%;width:${w}%" title="${esc(x.title)}">${x.label&&w>=6?`<span>${esc(x.label)}</span>`:''}</button>`;
    };
    html+=`<div class="tl-scroll" style="margin-top:10px"><div class="tl" style="--today:${pos(t)}%">
      <div class="tl-row head"><div class="tl-label"></div><div class="tl-track">${months.map(m=>`<span class="tl-month" style="left:${pos(m)}%">${esc(mLabel(m))}</span>`).join('')}<span class="tl-today" style="left:${pos(t)}%">Hoy</span></div></div>
      ${rows.map(r=>`<div class="tl-row ${r.cls}"><div class="tl-label"><button type="button" data-open="${esc(r.p.id)}" title="${esc(r.title)}">${esc(r.label)}</button>${r.sub!==undefined?`<small>${esc(r.sub)||'&nbsp;'}</small>`:''}</div>
        <div class="tl-track">${grid}${r.segs.map(x=>segHTML(r,x)).join('')}${r.marks.map(m=>`<span class="tl-mark" style="left:${pos(m.d)}%" title="${esc(m.title)}"></span>`).join('')}</div></div>`).join('')}
    </div></div>`;
  }
  if(notStarted.length)html+=`<p class="nodates">Sin iniciar: ${notStarted.map(p=>`<button type="button" data-open="${esc(p.id)}">${esc(p.nombre||'Sin nombre')}</button>`).join(', ')}</p>`;
  html+='</div>';
  $('#view').innerHTML=html;
}

/* ---------- Vista: indicadores ---------- */
function destroyCharts(){charts.forEach(c=>{try{c.destroy();}catch(e){}});charts=[];}
function nameList(names){const max=8;const l=names.slice(0,max);if(names.length>max)l.push(`y ${names.length-max} más`);return l.map(n=>'• '+n);}
function renderCharts(list){
  destroyCharts();
  const v=$('#view');
  if(typeof Chart==='undefined'){v.innerHTML='<div class="empty"><h3>No se pudieron cargar las gráficas</h3><p>La librería de gráficas no respondió. Revisa tu conexión y recarga la página.</p></div>';return;}
  const withMods=list.filter(p=>mods(p).length).sort((a,b)=>(a.nombre||'').localeCompare(b.nombre||'','es'));
  v.innerHTML=`<div class="charts">
    <div class="panel"><div class="panel-head"><h3>Proyectos por estado</h3></div><p class="q">¿Dónde está la carga del equipo hoy? Pasa el cursor para ver qué proyectos son.</p><div class="chart-box"><canvas id="c1" aria-label="Proyectos por estado" role="img"></canvas></div></div>
    <div class="panel"><div class="panel-head"><h3>Proyectos terminados por mes</h3></div><p class="q">Últimos 6 meses, según su fecha de cierre (los que hoy están en mejora cuentan en su mes original).</p><div class="chart-box"><canvas id="c2" aria-label="Terminados por mes" role="img"></canvas></div></div>
    <div class="panel"><div class="panel-head"><h3>Carga por responsable</h3></div><p class="q">Cada módulo cuenta por separado. Pasa el cursor para ver cuáles son.</p><div class="chart-box"><canvas id="c3" aria-label="Carga por responsable" role="img"></canvas></div></div>
    <div class="panel"><div class="panel-head"><h3>Módulos por proyecto</h3></div><p class="q">Estado de los módulos de cada proyecto que los tiene.</p>${withMods.length?'<div class="chart-box"><canvas id="c5" aria-label="Módulos por proyecto" role="img"></canvas></div>':'<p style="color:var(--muted);font-size:14px;margin:30px 0">Ningún proyecto tiene módulos todavía. Agrégalos desde el detalle de un proyecto.</p>'}</div>
    <div class="panel chart-wide"><div class="panel-head"><h3>Avance por proyecto y módulo</h3></div><p class="q">Proyectos en espera o en progreso; debajo de cada uno, sus módulos. Toca una barra para abrir el proyecto.</p><div class="chart-box" id="c4box"><canvas id="c4" aria-label="Avance por proyecto y módulo" role="img"></canvas></div></div>
  </div>`;
  const ink=cssv('--muted'),inkStrong=cssv('--ink'),gridC=cssv('--line'),font="'Poppins','Segoe UI',sans-serif";
  Chart.defaults.font.family=font;Chart.defaults.color=ink;Chart.defaults.borderColor=gridC;
  const legend={position:'bottom',labels:{boxWidth:12,boxHeight:12}};
  const intTicks={precision:0,stepSize:1};

  const byEst=ESTADOS.map(e=>list.filter(p=>estadoOf(p)===e.k));
  charts.push(new Chart($('#c1'),{type:'bar',data:{labels:ESTADOS.map(e=>e.l),datasets:[{label:'Proyectos',data:byEst.map(a=>a.length),backgroundColor:ESTADOS.map(e=>cssv(e.v)),borderRadius:5,maxBarThickness:38}]},
    options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,plugins:{legend,tooltip:{callbacks:{afterLabel:c=>nameList(byEst[c.dataIndex].map(p=>p.nombre||'Sin nombre'))}}},scales:{x:{beginAtZero:true,ticks:intTicks,title:{display:true,text:'Proyectos'}},y:{grid:{display:false}}}}}));

  const t=today(),ms=[];for(let i=5;i>=0;i--)ms.push(new Date(t.getFullYear(),t.getMonth()-i,1));
  const closed=ms.map(m=>list.filter(p=>closedP(p)&&parseD(p.fechaCierre)&&monthKey(parseD(p.fechaCierre))===monthKey(m)));
  charts.push(new Chart($('#c2'),{type:'line',data:{labels:ms.map(m=>m.toLocaleDateString('es-MX',{month:'short',year:'2-digit'})),datasets:[{label:'Proyectos terminados',data:closed.map(a=>a.length),borderColor:cssv('--accent'),backgroundColor:cssv('--accent'),tension:0,pointRadius:4,borderWidth:2.5}]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend,tooltip:{callbacks:{afterLabel:c=>nameList(closed[c.dataIndex].map(p=>p.nombre||'Sin nombre'))}}},scales:{y:{beginAtZero:true,ticks:intTicks,title:{display:true,text:'Proyectos'}},x:{grid:{display:false}}}}}));

  const wi=workItems(list);
  const resps=uniqVals(wi.map(w=>w.resp));
  const cell=(r,k)=>wi.filter(w=>w.resp===r&&w.estado===k);
  charts.push(new Chart($('#c3'),{type:'bar',data:{labels:resps,datasets:ESTADOS.map(e=>({label:e.l,data:resps.map(r=>cell(r,e.k).length),backgroundColor:cssv(e.v),maxBarThickness:44}))},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend,tooltip:{callbacks:{afterLabel:c=>nameList(cell(resps[c.dataIndex],ESTADOS[c.datasetIndex].k).map(w=>w.name))}}},scales:{x:{stacked:true,grid:{display:false}},y:{stacked:true,beginAtZero:true,ticks:intTicks,title:{display:true,text:'Proyectos y módulos'}}}}}));

  if(withMods.length){
    const mcell=(p,k)=>mods(p).filter(m=>estadoOf(m)===k);
    const lbl=s=>s.length>26?s.slice(0,24)+'…':s;
    charts.push(new Chart($('#c5'),{type:'bar',data:{labels:withMods.map(p=>lbl(p.nombre||'Sin nombre')),datasets:MOD_ESTADOS.map(e=>({label:e.l,data:withMods.map(p=>mcell(p,e.k).length),backgroundColor:cssv(e.v),maxBarThickness:44}))},
      options:{responsive:true,maintainAspectRatio:false,plugins:{legend,tooltip:{callbacks:{title:c=>withMods[c[0].dataIndex].nombre,afterLabel:c=>nameList(mcell(withMods[c.dataIndex],MOD_ESTADOS[c.datasetIndex].k).map(m=>m.nombre))}}},
        scales:{x:{stacked:true,grid:{display:false}},y:{stacked:true,beginAtZero:true,ticks:intTicks,title:{display:true,text:'Módulos'}}},
        onClick:(ev,els)=>{if(els[0])openDetail(withMods[els[0].index].id);}}}));
  }

  const act=list.filter(p=>!closedP(p)).sort((a,b)=>progress(b)-progress(a));
  const rows=[];
  act.forEach(p=>{rows.push({p,m:null});mods(p).forEach(m=>rows.push({p,m}));});
  $('#c4box').style.height=Math.max(280,rows.length*28+80)+'px';
  const cut=(s,n)=>s.length>n?s.slice(0,n-2)+'…':s;
  charts.push(new Chart($('#c4'),{type:'bar',
    data:{labels:rows.map(r=>r.m?'↳ '+cut(r.m.nombre||'Módulo',30):cut(r.p.nombre||'Sin nombre',34)),
      datasets:[{label:'Avance (%)',data:rows.map(r=>r.m?modProgress(r.m):progress(r.p)),
        backgroundColor:rows.map(r=>{const c=cssv(EST[estadoOf(r.m||r.p)].v);return r.m?fade(c,.55):c;}),
        borderRadius:4,maxBarThickness:18}]},
    options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,
      plugins:{legend:{...legend,labels:{...legend.labels,generateLabels:()=>[...MOD_ESTADOS.map(e=>({text:e.l,fillStyle:cssv(e.v),strokeStyle:cssv(e.v),fontColor:ink,lineWidth:0})),{text:'Módulo (tono claro)',fillStyle:fade(cssv('--st-progreso'),.55),strokeStyle:'transparent',fontColor:ink,lineWidth:0}]}},
        tooltip:{callbacks:{title:c=>fullName(rows[c[0].dataIndex].p,rows[c[0].dataIndex].m),label:c=>{const r=rows[c.dataIndex],o=r.m||r.p;return ` ${c.parsed.x}% de avance, ${EST[estadoOf(o)].l}`;}}}},
      scales:{x:{min:0,max:100,ticks:{callback:v=>v+'%'},title:{display:true,text:'Avance (%)'}},
        y:{grid:{display:false},ticks:{color:inkStrong,font:c=>({family:font,weight:rows[c.index]&&!rows[c.index].m?'600':'400',size:12})}}},
      onClick:(ev,els)=>{if(els[0])openDetail(rows[els[0].index].p.id);}}}));
}

/* ---------- Render principal ---------- */
function renderEmpty(){
  const canAdd=S.canWrite;
  $('#view').innerHTML=`<div class="empty"><h3>${S.projects.length?'Ningún proyecto coincide con los filtros':'Todavía no hay proyectos'}</h3>
    <p>${S.projects.length?'Prueba con otro responsable, tipo o búsqueda.':(canAdd?'Agrega el primer proyecto del equipo. Puedes dividirlo en módulos y fases; las fechas se van poniendo solas conforme avanza.':'Cuando el equipo agregue proyectos, aparecerán aquí.')}</p>
    <div class="row">${S.projects.length?'<button class="btn" type="button" id="clrF">Quitar filtros</button>':`${canAdd?'<button class="btn btn-primary" type="button" id="emptyNew">Agregar proyecto</button>':''}<button class="btn" type="button" id="emptyDemo">Ver con proyectos de ejemplo</button>`}</div></div>`;
}
function render(){
  if(!S.loaded&&!S.demo){$('#kpis').innerHTML='';$('#view').innerHTML='<div class="loading">Cargando proyectos…</div>';updateTabs();return;}
  renderFilterOptions();
  const list=filtered();
  renderKPIs(list);
  updateTabs();
  if(S.view!=='indicadores')destroyCharts();
  if(!list.length)renderEmpty();
  else if(S.view==='tablero')renderBoard(list);
  else if(S.view==='cronograma')renderTimeline(list);
  else renderCharts(list);
  if(S.openId&&$('#detailDlg').open)renderDetail();
  $('#genStamp').textContent='Consultado: '+new Date().toLocaleDateString('es-MX',{day:'numeric',month:'long',year:'numeric'})+', '+new Date().toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit'});
}
function updateTabs(){document.querySelectorAll('.tab').forEach(t=>t.setAttribute('aria-selected',String(t.dataset.view===S.view)));}
function applyWriteMode(){document.body.classList.toggle('readonly',!S.canWrite);}

/* ---------- Detalle ---------- */
function openDetail(id){
  if(!getP(id))return;
  S.openId=id;S.detailDirty=false;
  const dlg=$('#detailDlg');
  renderDetail(true);
  if(!dlg.open)dlg.showModal();
  dlg.scrollTop=0;
  if(location.hash!=='#proyecto-'+id)location.hash='proyecto-'+id;
}
function closeDetail(){const dlg=$('#detailDlg');if(dlg.open)dlg.close();}
function phaseBlock(fases,scope,emptyText){
  const dis=S.canWrite?'':' disabled';
  const t=today();
  const ds=fases.flatMap(f=>f.estado==='pendiente'?[]:[parseD(f.inicio),f.estado==='hecha'?parseD(f.fin):t]).filter(Boolean);
  const sp=ds.length?{s:new Date(Math.min(...ds)),e:new Date(Math.max(...ds,addDays(new Date(Math.min(...ds)),1)))}:null;
  const ppos=d=>sp?((d-sp.s)/(sp.e-sp.s)*100):0;
  const rows=fases.length?`<div class="phases" data-scope="${esc(scope)}">${fases.map((f,i)=>{
    const st=FASE_L[f.estado]?f.estado:'pendiente',fs=parseD(f.inicio),fe=st==='hecha'?(parseD(f.fin)||t):t;
    let bar='';if(sp&&fs&&st!=='pendiente'){const l=Math.min(ppos(fs),98.5),w=Math.max(ppos(fe)-l,1.5);bar=`<i style="left:${l}%;width:${Math.min(w,100-l)}%"></i>`;}
    const ini=st==='pendiente'?'<span class="fin">Sin iniciar</span>':`<input type="date" value="${esc(f.inicio||'')}" data-fase-ini="${i}" aria-label="Inicio de la fase" title="Inicio"${dis}>`;
    const fin=st==='hecha'?`<input type="date" value="${esc(f.fin||'')}" data-fase-fin="${i}" aria-label="Fecha en que se terminó la fase" title="Terminó"${dis}>`:`<span class="fin">${st==='curso'&&fs?'En curso, '+nd(ndays(fs,t)):''}</span>`;
    return `<div class="phase ${st==='hecha'?'done':''}" style="--c:var(${FASE_C[st]})">
      <button type="button" class="pill ${st!=='pendiente'?'on':''}" data-fase-st="${i}"${dis} aria-label="Estado de la fase: ${FASE_L[st]}. Cambiar estado">${FASE_L[st]}</button>
      <input type="text" value="${esc(f.nombre)}" data-fase-name="${i}" maxlength="100" aria-label="Nombre de la fase"${dis}>
      <span class="dates">${ini}${fin}</span>
      <button type="button" class="x w-only" data-fase-del="${i}" aria-label="Eliminar fase ${esc(f.nombre)}">×</button>
      <div class="p-track">${bar}</div>
    </div>`;}).join('')}</div>`:`<p style="color:var(--muted);margin:0;font-size:14px">${emptyText}</p>`;
  return rows+`<form class="add-phase solo w-only" data-add-phase="${esc(scope)}" autocomplete="off">
      <input name="nombre" placeholder="Nueva fase" maxlength="100" aria-label="Nombre de la nueva fase">
      <button class="btn btn-primary" type="submit">Agregar fase</button>
    </form>`;
}
function moduleBlock(p,m){
  const e=EST[estadoOf(m)],pr=modProgress(m),f=arr(m.fases),dis=S.canWrite?'':' disabled',done=modDone(m);
  const sub=[m.responsable||'',ageText(m,done),f.length?`${f.filter(x=>x.estado==='hecha').length}/${f.length} fases`:''].filter(Boolean).join(', ');
  return `<details class="mod" data-mod="${esc(m.id)}" style="--c:var(${e.v})" ${S.closedMods.has(m.id)?'':'open'}>
    <summary><span class="chev" aria-hidden="true">›</span><span class="m-name">${esc(m.nombre||'Módulo')}<small>${esc(sub)||'&nbsp;'}</small></span><span class="chip">${e.l}</span><span class="m-bar"><span class="bar" style="--c:var(${e.v})"><i style="width:${pr}%"></i></span>${pr}%</span></summary>
    <div class="mod-body">
      <div class="mod-fields">
        <label>Nombre del módulo<input type="text" data-mod-field="nombre" value="${esc(m.nombre||'')}" maxlength="100"${dis}></label>
        <label>Responsable<input type="text" data-mod-field="responsable" list="dlResp" value="${esc(m.responsable||'')}" maxlength="80" placeholder="${esc(p.responsable||'')}"${dis}></label>
        <label>Estado<select data-mod-field="estado"${dis}>${MOD_ESTADOS.map(x=>`<option value="${x.k}"${x.k===e.k?' selected':''}>${x.l}</option>`).join('')}</select></label>
        <label>Inicio<input type="date" data-mod-field="fechaInicio" value="${esc(m.fechaInicio||'')}"${dis}></label>
        <label>Cierre${done?`<input type="date" data-mod-field="fechaCierre" value="${esc(m.fechaCierre||'')}"${dis}>`:'<span class="ro">Se asigna al terminar sus fases</span>'}</label>
      </div>
      ${phaseBlock(f,m.id,'Este módulo aún no tiene fases.')}
      <div class="mod-foot w-only"><button type="button" class="btn btn-sm btn-danger" data-mod-del="${esc(m.id)}">Eliminar módulo</button></div>
    </div>
  </details>`;
}
function mejorasBlock(p){
  const list=arr(p.mejoras).slice().sort((a,b)=>(b.inicio||'').localeCompare(a.inicio||''));
  const canReg=closedP(p);
  if(!list.length&&!canReg)return '';
  const t=today();
  return `<div class="sec">
    <div class="sec-h"><h3>Mejoras</h3><span>Ajustes detectados después de terminar el proyecto</span></div>
    ${list.length?`<ul class="mej-list">${list.map(m=>{const s=parseD(m.inicio),c=parseD(m.cierre);
      return `<li class="mej${m.cierre?' closed':''}"><p>${esc(m.descripcion)}</p>
        <small>Desde ${esc(fmtD(m.inicio))}${m.cierre?`, cerrada el ${esc(fmtD(m.cierre))} (${nd(s&&c?ndays(s,c):0)})`:`, abierta, ${s&&ndays(s,t)>0?'lleva '+nd(ndays(s,t)):'inició hoy'}`}</small>
        <span class="acts w-only">${m.cierre?'':`<button type="button" class="btn btn-sm" data-mej-close="${esc(m.id)}">Cerrar mejora</button>`}<button type="button" class="x" data-mej-del="${esc(m.id)}" aria-label="Eliminar mejora">×</button></span></li>`;}).join('')}</ul>`:'<p style="color:var(--muted);font-size:14px;margin:0 0 10px">Sin mejoras registradas.</p>'}
    ${canReg?'<button type="button" class="btn w-only" id="dMejNew">Registrar mejora</button>':''}
  </div>`;
}
function renderDetail(force){
  const body=$('#detailBody');const p=getP(S.openId);
  const ctl=['#dEstado','#dEdit','#dDelete'];
  if(!p){body.innerHTML='<div class="empty"><h3>Este proyecto ya no está en el tablero</h3><p>Pudo haberlo eliminado otra persona del equipo.</p></div>';ctl.forEach(s=>$(s).hidden=true);return;}
  ctl.forEach(s=>$(s).hidden=false);
  const ae=document.activeElement;
  if(!force&&ae&&body.contains(ae)&&/^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName)){S.detailDirty=true;return;}
  S.detailDirty=false;
  const keepScroll=$('#detailDlg').scrollTop;
  const e=EST[estadoOf(p)],pr=progress(p),fases=arr(p.fases),ms=mods(p),notas=arr(p.notas),closed=closedP(p);
  const opts=ESTADOS.filter(x=>x.k!=='mejoras'||closed||e.k==='mejoras');
  const sel=$('#dEstado');sel.innerHTML=opts.map(x=>`<option value="${x.k}"${x.k===e.k?' selected':''}>${x.l}</option>`).join('');sel.style.setProperty('--c',`var(${e.v})`);
  const ro=$('#dEstadoRO');ro.textContent=e.l;ro.style.setProperty('--c',`var(${e.v})`);ro.hidden=S.canWrite;
  const s=parseD(p.fechaInicio),c=parseD(p.fechaCierre);
  const facts=[
    ['Responsable',p.responsable||'—'],['Tipo',p.tipo||'—'],['Prioridad',PRIO_L[p.prioridad]||'Media'],
    ['Inicio',s?fmtD(p.fechaInicio):'Al arrancar'],
    ['Cierre',closed&&c?fmtD(p.fechaCierre):'Al terminar'],
    ['Duración',!s?'—':(closed&&c?nd(ndays(s,c)):`${nd(ndays(s,today()))} y contando`)]
  ];
  const u=units(p),allDone=!closed&&u.length&&u.every(Boolean);
  const progTxt=closed?(e.k==='mejoras'?'Proyecto terminado, con mejora en curso':'Proyecto terminado'):(u.length?`${u.filter(Boolean).length} de ${u.length} partes hechas${ms.length?` en ${ms.length} ${ms.length===1?'módulo':'módulos'}${fases.length?' y fases generales':''}`:''}`:'Agrega módulos o fases para medir el avance');
  body.innerHTML=`
    <h2 class="d-title" id="dTitle">${esc(p.nombre||'Sin nombre')}</h2>
    ${p.descripcion?`<p class="d-desc">${esc(p.descripcion)}</p>`:''}
    <dl class="facts">${facts.map(([k,v])=>`<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>

    <div class="sec">
      <div class="sec-h"><h3>Avance</h3><span>${esc(progTxt)}</span></div>
      <div class="big-prog" style="--c:var(${e.v})"><span class="pct">${pr}%</span><div class="bar"><i style="width:${pr}%"></i></div></div>
      ${allDone&&S.canWrite?`<div class="done-banner"><p>Todas las fases están hechas. ¿Cierras el proyecto? La fecha de cierre será la de la última fase terminada (${esc(fmtD(lastDoneDate(p)||todayIso()))}).</p><button type="button" class="btn btn-primary btn-sm" id="dCloseProj">Marcar como terminado</button></div>`:''}
    </div>

    ${mejorasBlock(p)}

    <div class="sec">
      <div class="sec-h"><h3>Módulos</h3><span>${ms.length?'Cada módulo tiene su propio estado, responsable y fases':'Divide el proyecto en partes que avanzan por separado'}</span></div>
      ${ms.map(m=>moduleBlock(p,m)).join('')||`<p style="color:var(--muted);margin:0 0 8px;font-size:14px">Este proyecto no tiene módulos. Si es algo como un portal con varias secciones, agrega una por módulo.</p>`}
      <form class="add-mod w-only" id="addMod" autocomplete="off">
        <input name="nombre" placeholder="Nuevo módulo" maxlength="100" aria-label="Nombre del nuevo módulo">
        <input name="responsable" list="dlResp" placeholder="Responsable" maxlength="80" aria-label="Responsable del módulo">
        <button class="btn btn-primary" type="submit">Agregar módulo</button>
      </form>
    </div>

    <div class="sec">
      <div class="sec-h"><h3>${ms.length?'Fases generales':'Fases'}</h3><span>${S.canWrite?'Toca el estado para avanzarla; el inicio y el fin se ponen solos':''}</span></div>
      ${phaseBlock(fases,'',ms.length?'Sin fases generales.':'Este proyecto aún no tiene fases.')}
    </div>

    <div class="sec">
      <div class="sec-h"><h3>Bitácora</h3><span>Acuerdos, avances y pendientes</span></div>
      <form class="notes-form w-only" id="addNote">
        <label class="sr" for="noteTxt">Nueva nota</label>
        <textarea id="noteTxt" name="t" maxlength="2000" placeholder="Ej. Se validó el módulo de vacaciones con RRHH; falta la prueba con jefes."></textarea>
        <div class="row"><button class="btn btn-primary" type="submit">Agregar nota</button></div>
      </form>
      ${notas.length?`<ul class="notes">${notas.slice().sort((a,b)=>(b.fecha||'').localeCompare(a.fecha||'')).map(nt=>`<li class="note"><header><span>${esc(fmtDT(nt.fecha))}</span>${nt.autorNombre?`<span>${esc(nt.autorNombre)}</span>`:''}<span class="sp"></span><button type="button" class="x w-only" data-note-del="${esc(nt.id)}" aria-label="Eliminar nota">×</button></header><p>${esc(nt.texto)}</p></li>`).join('')}</ul>`:'<p style="color:var(--muted);font-size:14px">Sin notas todavía.</p>'}
    </div>

    <p class="d-meta">${p.creado?'Creado el '+esc(fmtDT(p.creado)):''}${p.actualizado?(p.creado?'<br>':'')+'Última actualización: '+esc(fmtDT(p.actualizado)):''}</p>`;
  if(!force)$('#detailDlg').scrollTop=keepScroll;
  resolveNames(body);
}
async function resolveNames(root){
  if(!S.user)return;
  const els=[...root.querySelectorAll('[data-uid]')];if(!els.length)return;
  try{
    const ps=await S.user.profiles([...new Set(els.map(e=>e.dataset.uid))]);
    els.forEach(e=>{const pr=ps[e.dataset.uid];const nm=pr&&pr.name;e.textContent=nm?(pr.isMe?'Tú':nm):'';});
  }catch(e){}
}

/* ---------- Mejoras ---------- */
function openMejora(id){
  const p=getP(id);if(!p||!S.canWrite)return;
  if(!closedP(p)||!parseD(p.fechaCierre)){flash('mej','Solo un proyecto terminado puede pasar a mejora. Primero márcalo como terminado.');return;}
  S.mejId=id;
  const f=$('#mForm');f.reset();$('#mErr').hidden=true;
  f.inicio.value=todayIso();f.inicio.min=p.fechaCierre;f.inicio.max=todayIso();
  $('#mCtx').textContent=`“${p.nombre}” se cerró el ${fmtD(p.fechaCierre)}. En el cronograma su línea cambia de color a partir de esa fecha y marca el día en que inicia la mejora.`;
  $('#mejDlg').showModal();
  setTimeout(()=>f.descripcion.focus(),30);
}
function submitMejora(ev){
  ev.preventDefault();
  const f=$('#mForm'),p=getP(S.mejId);if(!p)return;
  const err=m=>{$('#mErr').textContent=m;$('#mErr').hidden=false;};
  const desc=f.descripcion.value.trim(),ini=f.inicio.value||todayIso();
  if(!desc){err('Describe la mejora que se detectó.');f.descripcion.focus();return;}
  if(parseD(ini)<parseD(p.fechaCierre)){err(`La mejora no puede iniciar antes del cierre del proyecto (${fmtD(p.fechaCierre)}).`);return;}
  if(parseD(ini)>today()){err('La fecha de inicio no puede ser futura.');return;}
  const mj={id:uid('j'),descripcion:desc,inicio:ini,cierre:''};if(S.userId){mj.autor=S.userId;mj.autorNombre=S.userName;}
  editProject(S.mejId,q=>{q.mejoras=arr(q.mejoras).concat(mj);if(estadoOf(q)!=='mejoras')setEstado(q,'mejoras');});
  $('#mejDlg').close();
}

/* ---------- Formulario ---------- */
function syncCierreField(){
  const f=$('#pForm'),st=f.estado.value,show=st==='terminado'||st==='mejoras';
  $('#cierreWrap').hidden=!show;
  if(show&&!f.fechaCierre.value)f.fechaCierre.value=todayIso();
}
function openForm(id){
  S.editId=id||null;
  const f=$('#pForm');f.reset();$('#fErr').hidden=true;
  const p=id?getP(id):null;
  const opts=ESTADOS.filter(e=>e.k!=='mejoras'||(p&&estadoOf(p)==='mejoras'));
  f.estado.innerHTML=opts.map(e=>`<option value="${e.k}">${e.l}</option>`).join('');
  $('#fTitle').textContent=p?'Editar proyecto':'Nuevo proyecto';
  $('#fSubmit').textContent=p?'Guardar cambios':'Crear proyecto';
  $('#fasesInitWrap').hidden=!!p;$('#modsInitWrap').hidden=!!p;
  f.fechaCierre.max=todayIso();
  if(p){
    ['nombre','descripcion','responsable','tipo','fechaInicio','fechaCierre'].forEach(k=>f[k].value=p[k]||'');
    f.estado.value=estadoOf(p);f.prioridad.value=PRIO_L[p.prioridad]?p.prioridad:'media';
  }else{
    f.estado.value='espera';f.prioridad.value='media';
    if(S.f.resp)f.responsable.value=S.f.resp;
    if(S.f.tipo)f.tipo.value=S.f.tipo;
  }
  syncCierreField();
  $('#formDlg').showModal();
  setTimeout(()=>f.nombre.focus(),30);
}
function submitForm(ev){
  ev.preventDefault();
  const f=$('#pForm');
  const v=k=>(f[k].value||'').trim();
  const err=m=>{$('#fErr').textContent=m;$('#fErr').hidden=false;};
  const est=f.estado.value,closing=est==='terminado'||est==='mejoras';
  if(!v('nombre')){err('Escribe el nombre del proyecto.');f.nombre.focus();return;}
  if(closing&&v('fechaCierre')&&parseD(v('fechaCierre'))>today()){err('La fecha de cierre no puede ser futura.');f.fechaCierre.focus();return;}
  if(closing&&v('fechaInicio')&&v('fechaCierre')&&parseD(v('fechaCierre'))<parseD(v('fechaInicio'))){err('La fecha de cierre no puede ser antes del inicio.');f.fechaCierre.focus();return;}
  const base={nombre:v('nombre'),descripcion:v('descripcion'),responsable:v('responsable'),tipo:v('tipo'),prioridad:f.prioridad.value,fechaInicio:v('fechaInicio')};
  const apply=p=>{
    Object.assign(p,base);
    delete p.fechaFin;
    setEstado(p,est);
    if(closing){
      if(v('fechaCierre'))p.fechaCierre=v('fechaCierre');
      if(!p.fechaInicio||parseD(p.fechaInicio)>parseD(p.fechaCierre))p.fechaInicio=v('fechaInicio')||p.fechaCierre;
    }
  };
  if(S.editId){editProject(S.editId,apply);$('#formDlg').close();return;}
  const now=new Date().toISOString();
  const lines=k=>v(k).split('\n').map(s=>s.trim()).filter(Boolean).slice(0,40);
  const p={id:uid('p'),estado:'espera',fases:[],modulos:[],mejoras:[],notas:[],historial:[{estado:'espera',fecha:now}],creado:now};
  if(S.userId)p.creadoPor=S.userId;
  apply(p);
  p.fases=lines('fasesInit').map(n=>({id:uid('f'),nombre:n,estado:'pendiente',inicio:'',fin:''}));
  p.modulos=lines('modsInit').map(n=>({id:uid('m'),nombre:n,responsable:'',estado:'espera',fechaInicio:'',fases:[]}));
  saveProject(p);
  $('#formDlg').close();
  openDetail(p.id);
}

/* ---------- Confirmación ---------- */
function confirmAsk(msg,yes){
  return new Promise(res=>{
    const d=$('#confirmDlg');$('#cMsg').textContent=msg;$('#cYes').textContent=yes||'Eliminar';
    const done=v=>{d.close();res(v);};
    $('#cYes').onclick=()=>done(true);$('#cNo').onclick=()=>done(false);
    d.oncancel=()=>res(false);
    d.showModal();
  });
}

/* ---------- Eventos ---------- */
function moveTo(id,est){
  const p=getP(id);if(!p||estadoOf(p)===est)return;
  if(est==='mejoras'){openMejora(id);return;}
  editProject(id,q=>setEstado(q,est));
}
function bind(){
  document.querySelectorAll('.tab').forEach(t=>t.addEventListener('click',()=>{location.hash=t.dataset.view;}));
  $('#fQ').addEventListener('input',e=>{S.f.q=e.target.value;render();});
  $('#fResp').addEventListener('change',e=>{S.f.resp=e.target.value;render();});
  $('#fTipo').addEventListener('change',e=>{S.f.tipo=e.target.value;render();});
  $('#btnNew').addEventListener('click',()=>openForm());
  $('#fCancel').addEventListener('click',()=>$('#formDlg').close());
  $('#pForm').addEventListener('submit',submitForm);
  $('#pForm').estado.addEventListener('change',syncCierreField);
  $('#mCancel').addEventListener('click',()=>$('#mejDlg').close());
  $('#mForm').addEventListener('submit',submitMejora);

  const view=$('#view');
  view.addEventListener('click',e=>{
    const c=e.target.closest('.card');if(c){openDetail(c.dataset.id);return;}
    const o=e.target.closest('[data-open]');if(o){openDetail(o.dataset.open);return;}
    if(e.target.id==='emptyNew')openForm();
    if(e.target.id==='emptyDemo')startDemo();
    if(e.target.id==='clrF'){S.f={q:'',resp:'',tipo:''};$('#fQ').value='';render();}
  });
  view.addEventListener('keydown',e=>{const c=e.target.closest('.card');if(c&&(e.key==='Enter'||e.key===' ')){e.preventDefault();openDetail(c.dataset.id);}});
  view.addEventListener('change',e=>{if(e.target.id==='tlDone'){S.showDone=e.target.checked;render();}if(e.target.id==='tlPhases'){S.showPhases=e.target.checked;render();}});

  let dragId=null;
  view.addEventListener('dragstart',e=>{const c=e.target.closest('.card');if(!c||!S.canWrite)return;dragId=c.dataset.id;c.classList.add('dragging');try{e.dataTransfer.setData('text/plain',dragId);e.dataTransfer.effectAllowed='move';}catch(_){}});
  view.addEventListener('dragend',e=>{const c=e.target.closest('.card');if(c)c.classList.remove('dragging');document.querySelectorAll('.col.over').forEach(x=>x.classList.remove('over'));dragId=null;});
  view.addEventListener('dragover',e=>{const col=e.target.closest('.col');if(!col||!dragId)return;e.preventDefault();document.querySelectorAll('.col.over').forEach(x=>{if(x!==col)x.classList.remove('over');});col.classList.add('over');});
  view.addEventListener('dragleave',e=>{const col=e.target.closest('.col');if(col&&!col.contains(e.relatedTarget))col.classList.remove('over');});
  view.addEventListener('drop',e=>{const col=e.target.closest('.col');if(!col||!dragId)return;e.preventDefault();col.classList.remove('over');const id=dragId;dragId=null;moveTo(id,col.dataset.estado);});

  const dlg=$('#detailDlg'),body=$('#detailBody');
  $('#dClose').addEventListener('click',closeDetail);
  dlg.addEventListener('close',()=>{S.openId=null;if(location.hash.startsWith('#proyecto-'))location.hash=S.view;});
  dlg.addEventListener('click',e=>{if(e.target!==dlg)return;const r=dlg.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeDetail();});
  $('#dEstado').addEventListener('change',e=>{const id=S.openId,val=e.target.value;const p=getP(id);e.target.value=estadoOf(p);e.target.blur();moveTo(id,val);});
  $('#dEdit').addEventListener('click',()=>openForm(S.openId));
  $('#dDelete').addEventListener('click',async()=>{const p=getP(S.openId);if(!p)return;if(await confirmAsk(`¿Eliminar “${p.nombre}”? Se borran también sus módulos, fases, mejoras y notas, y no se puede deshacer.`,'Eliminar proyecto')){const id=p.id;closeDetail();removeProject(id);}});
  body.addEventListener('focusout',()=>{setTimeout(()=>{if(S.detailDirty&&!body.contains(document.activeElement))renderDetail();},0);});
  body.addEventListener('toggle',e=>{const d=e.target;if(d.matches&&d.matches('details.mod')){if(d.open)S.closedMods.delete(d.dataset.mod);else S.closedMods.add(d.dataset.mod);}},true);

  const scopeOf=el=>{const s=el.closest('[data-scope]');return s?s.dataset.scope:'';};
  body.addEventListener('click',async e=>{
    const id=S.openId;
    if(e.target.id==='dCloseProj'){editProject(id,p=>{const last=lastDoneDate(p);setEstado(p,'terminado');if(last)p.fechaCierre=last;if(!p.fechaInicio||parseD(p.fechaInicio)>parseD(p.fechaCierre))p.fechaInicio=p.fechaCierre;});return;}
    if(e.target.id==='dMejNew'){openMejora(id);return;}
    const st=e.target.closest('[data-fase-st]');
    if(st){const i=+st.dataset.faseSt,sc=scopeOf(st);editProject(id,p=>cyclePhase(p,sc,i));return;}
    const fd=e.target.closest('[data-fase-del]');
    if(fd){const i=+fd.dataset.faseDel,sc=scopeOf(fd);const fs0=fasesRef(clone(getP(id)||{}),sc);const f=fs0&&fs0[i];if(!f)return;
      if(await confirmAsk(`¿Eliminar la fase “${f.nombre}”?`,'Eliminar fase'))editProject(id,p=>{const fs=fasesRef(p,sc);const k=fs?fs.findIndex(x=>x.id===f.id):-1;if(k<0)return false;fs.splice(k,1);if(sc)syncModule(getMod(p,sc));});return;}
    const md=e.target.closest('[data-mod-del]');
    if(md){const mid=md.dataset.modDel;const m=getMod(getP(id)||{},mid);if(!m)return;
      if(await confirmAsk(`¿Eliminar el módulo “${m.nombre}” y sus fases?`,'Eliminar módulo'))editProject(id,p=>{p.modulos=mods(p).filter(x=>x.id!==mid);});return;}
    const mc=e.target.closest('[data-mej-close]');
    if(mc){const jid=mc.dataset.mejClose;editProject(id,p=>{const j=arr(p.mejoras).find(x=>x.id===jid);if(!j)return false;j.cierre=todayIso();if(estadoOf(p)==='mejoras'&&!openMej(p).length)setEstado(p,'terminado');});return;}
    const mdel=e.target.closest('[data-mej-del]');
    if(mdel){const jid=mdel.dataset.mejDel;if(await confirmAsk('¿Eliminar esta mejora? También desaparece del cronograma.','Eliminar mejora'))editProject(id,p=>{p.mejoras=arr(p.mejoras).filter(x=>x.id!==jid);if(estadoOf(p)==='mejoras'&&!openMej(p).length)setEstado(p,'terminado');});return;}
    const nd2=e.target.closest('[data-note-del]');
    if(nd2){const nid=nd2.dataset.noteDel;if(await confirmAsk('¿Eliminar esta nota de la bitácora?','Eliminar nota'))editProject(id,q=>{q.notas=arr(q.notas).filter(x=>x.id!==nid);});}
  });
  body.addEventListener('change',e=>{
    const id=S.openId,t=e.target;
    if(t.dataset.modField){
      const mid=t.closest('[data-mod]').dataset.mod,k=t.dataset.modField,val=t.value.trim();
      if(k==='nombre'&&!val){t.value=(getMod(getP(id),mid)||{}).nombre||'';return;}
      if((k==='fechaInicio'||k==='fechaCierre')&&val&&parseD(val)>today()){t.value=(getMod(getP(id),mid)||{})[k]||'';flash('fecha','Las fechas no pueden ser futuras.');return;}
      editProject(id,p=>{const m=getMod(p,mid);if(!m)return false;
        if(k==='estado'){setEstado(m,val);if(val!=='espera')touchStart(p);}
        else m[k]=val;});
      return;
    }
    const sc=scopeOf(t);
    const setF=(i,k,val)=>editProject(id,p=>{const fs=fasesRef(p,sc);const f=fs&&fs[i];if(!f)return false;f[k]=val;if(sc)syncModule(getMod(p,sc));});
    if(t.dataset.faseName!==undefined){const i=+t.dataset.faseName,val=t.value.trim();if(val)setF(i,'nombre',val);else{const fs=fasesRef(clone(getP(id)),sc);t.value=fs&&fs[i]?fs[i].nombre:'';}}
    else if(t.dataset.faseIni!==undefined||t.dataset.faseFin!==undefined){
      const isIni=t.dataset.faseIni!==undefined,i=+(isIni?t.dataset.faseIni:t.dataset.faseFin);
      const fs=fasesRef(clone(getP(id)),sc),f=fs&&fs[i];if(!f)return;
      const ini=isIni?t.value:f.inicio,fin=isIni?f.fin:t.value;
      if(!t.value||parseD(t.value)>today()||(ini&&fin&&parseD(fin)<parseD(ini))){t.value=isIni?(f.inicio||''):(f.fin||'');flash('fecha','Revisa la fecha: no puede ser futura ni quedar el fin antes del inicio.');return;}
      setF(i,isIni?'inicio':'fin',t.value);
    }
  });
  body.addEventListener('keydown',e=>{const d=e.target.dataset||{};if(e.key==='Enter'&&e.target.tagName==='INPUT'&&(d.faseName!==undefined||d.modField)){e.preventDefault();e.target.blur();}});
  body.addEventListener('submit',e=>{
    e.preventDefault();const id=S.openId,fm=e.target;
    if(fm.dataset.addPhase!==undefined){
      const sc=fm.dataset.addPhase,n=fm.nombre.value.trim();if(!n){fm.nombre.focus();return;}
      const ph={id:uid('f'),nombre:n,estado:'pendiente',inicio:'',fin:''};
      fm.reset();fm.nombre.blur();
      editProject(id,p=>{const fs=fasesRef(p,sc);if(!fs)return false;fs.push(ph);if(sc){const m=getMod(p,sc);if(modDone(m)){m.estado='progreso';delete m.fechaCierre;}}});
      setTimeout(()=>{const x=body.querySelector(`[data-add-phase="${CSS.escape(sc)}"]`);if(x)x.nombre.focus();},50);
    }else if(fm.id==='addMod'){
      const n=fm.nombre.value.trim();if(!n){fm.nombre.focus();return;}
      const m={id:uid('m'),nombre:n,responsable:fm.responsable.value.trim(),estado:'espera',fechaInicio:'',fases:[]};
      fm.reset();fm.nombre.blur();
      editProject(id,p=>{p.modulos=mods(p).concat(m);});
    }else if(fm.id==='addNote'){
      const t=fm.t.value.trim();if(!t){fm.t.focus();return;}
      const nt={id:uid('n'),texto:t,fecha:new Date().toISOString()};if(S.userId){nt.autor=S.userId;nt.autorNombre=S.userName;}
      fm.t.value='';fm.t.blur();
      editProject(id,p=>{p.notas=arr(p.notas).concat(nt).slice(-300);});
    }
  });

  window.addEventListener('hashchange',applyHash);
  const mq=window.matchMedia('(prefers-color-scheme: dark)');
  const rerenderCharts=()=>{if(S.view==='indicadores')render();};
  if(mq.addEventListener)mq.addEventListener('change',rerenderCharts);
  new MutationObserver(rerenderCharts).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
  // Las barras abiertas crecen con el día: refresca al cambiar de fecha
  let lastDay=todayIso();
  setInterval(()=>{if(todayIso()!==lastDay){lastDay=todayIso();render();}},60000);
}
function applyHash(){
  const h=decodeURIComponent((location.hash||'').slice(1));
  if(h.startsWith('proyecto-')){
    const id=h.slice(9);
    if(getP(id)){if(S.openId!==id||!$('#detailDlg').open)openDetail(id);}
    else S.pendingOpen=id;
    return;
  }
  const v=VIEWS.includes(h)?h:'tablero';
  if($('#detailDlg').open)closeDetail();
  if(v!==S.view){S.view=v;render();}else updateTabs();
}

/* ---------- Ejemplo ---------- */
function demoData(){
  const t=today(),d=n=>iso(addDays(t,n)),now=new Date().toISOString();
  const F=(nombre,estado,a,b)=>({id:uid('f'),nombre,estado,inicio:a==null?'':d(a),fin:b==null?'':d(b)});
  const M=(nombre,responsable,estado,a,c,fases)=>Object.assign({id:uid('m'),nombre,responsable,estado,fechaInicio:a==null?'':d(a),fases:fases||[]},c==null?{}:{fechaCierre:d(c)});
  const P=o=>Object.assign({id:uid('p'),descripcion:'',fases:[],modulos:[],mejoras:[],notas:[],historial:[],creado:now,actualizado:now},o);
  return [
    P({nombre:'Portal RRHH',responsable:'Ana',tipo:'Portal',prioridad:'alta',estado:'progreso',fechaInicio:d(-90),
      descripcion:'Portal de Recursos Humanos con varios módulos, cada uno con su propio avance.',
      fases:[F('Diseño general del portal','hecha',-90,-70),F('Liberación general','pendiente')],
      modulos:[
        M('Vacaciones','Ana','terminado',-70,-20,[F('Formulario de solicitud','hecha',-70,-50),F('Aprobación de jefes','hecha',-49,-30),F('Reporte a jefes','hecha',-29,-20)]),
        M('Movimiento de personal','Luis','progreso',-40,null,[F('Formulario digital','hecha',-40,-20),F('Flujo de autorización','curso',-19),F('Pruebas con RRHH','pendiente')]),
        M('Aniversarios y cumpleaños','Carla','progreso',-50,null,[F('Generación de presentaciones','hecha',-50,-25),F('Ajustes de formato','curso',-5)]),
        M('Catálogo de empleados','Jorge','espera',null,null)
      ],
      notas:[{id:uid('n'),texto:'RRHH validó el módulo de vacaciones; ya está en uso.',fecha:new Date(Date.now()-18*DAY).toISOString()}]}),
    P({nombre:'Reporte semanal de rechazos',responsable:'Ana',tipo:'Reporte',prioridad:'alta',estado:'progreso',fechaInicio:d(-30),descripcion:'Generar automáticamente el reporte de rechazos por línea cada lunes.',
      fases:[F('Levantamiento','hecha',-30,-22),F('Extracción de datos','hecha',-21,-8),F('Diseño del reporte','curso',-7),F('Liberación','pendiente')]}),
    P({nombre:'Control de calibraciones',responsable:'Carla',tipo:'Aplicación',prioridad:'media',estado:'progreso',fechaInicio:d(-60),
      fases:[F('Inventario de equipos','hecha',-60,-40),F('Alertas de vencimiento','curso',-39),F('Reportes','pendiente')]}),
    P({nombre:'Alertas de material retenido',responsable:'Jorge',tipo:'Automatización',prioridad:'alta',estado:'espera'}),
    P({nombre:'Integración con ERP',responsable:'Luis',tipo:'Infraestructura',prioridad:'baja',estado:'espera'}),
    P({nombre:'Tablero de costos de no calidad',responsable:'Ana',tipo:'Reporte',prioridad:'media',estado:'mejoras',fechaInicio:d(-110),fechaCierre:d(-45),
      fases:[F('Extracción de costos','hecha',-110,-80),F('Primera versión','hecha',-79,-45)],
      mejoras:[{id:uid('j'),descripcion:'Agregar el desglose por línea que pidió gerencia',inicio:d(-12),cierre:''}]}),
    P({nombre:'Respaldo automático de bases',responsable:'Jorge',tipo:'Infraestructura',prioridad:'media',estado:'terminado',fechaInicio:d(-50),fechaCierre:d(-Math.min(3,t.getDate()-1)),
      fases:[F('Script de respaldo','hecha',-50,-30),F('Programación diaria','hecha',-29,-Math.min(3,t.getDate()-1))]}),
    P({nombre:'Estandarizar formato de auditoría',responsable:'Carla',tipo:'Mejora de proceso',prioridad:'media',estado:'terminado',fechaInicio:d(-95),fechaCierre:d(-38),
      fases:[F('Revisión de formatos','hecha',-95,-70),F('Validación','hecha',-69,-38)],
      mejoras:[{id:uid('j'),descripcion:'Agregar campo de evidencia fotográfica',inicio:d(-30),cierre:d(-22)}]})
  ];
}
function startDemo(){
  S.demo=true;S.projects=demoData();
  notice('demo','info','Estás viendo proyectos de ejemplo. Puedes moverlos y editarlos, pero no se guardan.',[{label:'Salir del ejemplo',fn:stopDemo}]);
  render();
}
function stopDemo(){
  S.demo=false;closeDetail();
  S.projects=S.dbProjects;
  clearNotice('demo');render();
}

/* ---------- Arranque con Supabase ---------- */
function isNetErr(e){return !!e&&(e.name==='TypeError'||/fetch|network/i.test(e.message||''));}
/* Bloquea el arranque si alguien pone por error una llave secreta en config.js */
function isSecretKey(k){
  if(/^sb_secret_/i.test(k))return true;
  const parts=k.split('.');if(parts.length!==3)return false;
  try{const b=parts[1].replace(/-/g,'+').replace(/_/g,'/');const pl=JSON.parse(atob(b+'='.repeat((4-b.length%4)%4)));return pl.role==='service_role';}catch(e){return false;}
}
async function sbSave(p){const {error}=await sb.from('proyectos').upsert({id:p.id,data:clone(p)});if(error)throw error;}
async function sbDelete(id){const {error}=await sb.from('proyectos').delete().eq('id',id);if(error)throw error;}
function rowToP(r){return Object.assign({},r.data||{},{id:r.id});}
function upsertDb(p){const i=S.dbProjects.findIndex(x=>x.id===p.id);if(i>=0)S.dbProjects[i]=p;else S.dbProjects.push(p);}
function openPending(){if(S.pendingOpen&&getP(S.pendingOpen)){const id=S.pendingOpen;S.pendingOpen=null;openDetail(id);}}
function showConfigError(msg){$('#login').hidden=true;$('#kpis').innerHTML='';$('#view').innerHTML=`<div class="empty"><h3>Falta configuración</h3><p>${esc(msg)}</p></div>`;}
function showLogin(){
  $('#login').hidden=false;$('#loginForm').hidden=false;$('#pwdForm').hidden=true;
  ['#btnLogout','#btnPwd','#btnUsers'].forEach(s=>$(s).hidden=true);$('#userBox').textContent='';
  setTimeout(()=>{const e=$('#lUser');if(e&&!e.value)e.focus();},50);
}
let pwdForced=false;
function showPwd(forced,user){
  pwdForced=forced;
  $('#login').hidden=false;$('#loginForm').hidden=true;$('#pwdForm').hidden=false;
  $('#pErr').hidden=true;$('#pNew').value='';$('#pNew2').value='';
  $('#pwdTitle').textContent=forced?'Cambia tu contraseña':'Cambiar mi contraseña';
  $('#pwdIntro').textContent=forced?'Estás entrando con una contraseña temporal. Elige una nueva para continuar.':'Escribe tu nueva contraseña.';
  $('#pBtn').textContent=forced?'Guardar y entrar':'Guardar';
  $('#pCancel').textContent=forced?'Salir':'Cancelar';
  const md=(user&&user.user_metadata)||{};$('#pwdUser').value=md.usuario||'';
  setTimeout(()=>$('#pNew').focus(),50);
}
function toEmail(u){u=u.trim().toLowerCase();return u.includes('@')?u:`${u}@${DOMINIO}`;}
async function callFn(accion,extra){
  const {data,error}=await sb.functions.invoke('usuarios',{body:Object.assign({accion},extra||{})});
  if(error){
    let m='No se pudo completar la operación. Inténtalo otra vez.';
    try{const j=await error.context.json();if(j&&j.error)m=j.error;}
    catch(e){if(/fetch|network|relay/i.test(error.message||''))m='No hay conexión con el servicio de usuarios. Revisa que la función "usuarios" esté publicada en Supabase.';}
    throw new Error(m);
  }
  return data||{};
}
let currentUid=null;
async function startData(user){
  if(currentUid===user.id)return;
  currentUid=user.id;
  S.userId=user.id;
  const md=user.user_metadata||{};
  S.userName=(md.nombre||md.usuario||(user.email||'').split('@')[0]||'').trim();
  $('#login').hidden=true;$('#userBox').textContent=S.userName;$('#btnLogout').hidden=false;$('#btnPwd').hidden=false;
  S.mode='db';S.loaded=false;render();
  loadTimer=setTimeout(()=>{if(!S.loaded)notice('slow','warn','La base de datos tarda en responder. El tablero se llenará en cuanto conteste.');},10000);
  try{
    const [{data:ok},{data:nm},{data:adm}]=await Promise.all([sb.rpc('es_del_equipo'),sb.rpc('mi_nombre'),sb.rpc('soy_admin')]);
    if(ok===false)notice('noteam','warn','Tu usuario no está dado de alta en el equipo, así que no puedes ver ni guardar proyectos. Pide al administrador que te agregue.');
    if(nm){S.userName=nm;$('#userBox').textContent=nm;}
    S.isAdmin=adm===true;$('#btnUsers').hidden=!S.isAdmin;
  }catch(e){}
  try{
    const {data,error}=await sb.from('proyectos').select('id,data').order('creado_en',{ascending:true});
    if(error)throw error;
    S.dbProjects.length=0;(data||[]).forEach(r=>S.dbProjects.push(rowToP(r)));
  }catch(e){
    notice('dberr','warn','No se pudieron cargar los proyectos. Revisa tu conexión y recarga la página.');
  }
  clearTimeout(loadTimer);clearNotice('slow');
  S.loaded=true;if(!S.demo)S.projects=S.dbProjects;
  render();openPending();
  channel=sb.channel('proyectos-cambios')
    .on('postgres_changes',{event:'*',schema:'public',table:'proyectos'},payload=>{
      if(payload.eventType==='DELETE'){const id=payload.old&&payload.old.id;const i=S.dbProjects.findIndex(x=>x.id===id);if(i>=0)S.dbProjects.splice(i,1);}
      else if(payload.new&&payload.new.id){upsertDb(rowToP(payload.new));}
      if(!S.demo)S.projects=S.dbProjects;
      render();
    })
    .subscribe(status=>{
      if(status==='SUBSCRIBED')clearNotice('rt');
      else if(status==='CHANNEL_ERROR'||status==='TIMED_OUT')notice('rt','warn','Sin actualización en vivo: recarga la página para ver los cambios de los demás.');
    });
}
async function stopData(){
  currentUid=null;
  if(channel){try{await sb.removeChannel(channel);}catch(e){}channel=null;}
  S.dbProjects.length=0;if(!S.demo)S.projects=S.dbProjects;
  S.loaded=false;S.mode='loading';S.userId=null;S.userName='';S.isAdmin=false;
  closeDetail();if($('#usrDlg').open)$('#usrDlg').close();Object.keys(NOTICES).forEach(clearNotice);
  render();
}
function handleSession(session){
  if(!session||!session.user){stopData();showLogin();return;}
  const u=session.user;
  if(u.app_metadata&&u.app_metadata.debe_cambiar){if(currentUid)stopData();showPwd(true,u);return;}
  if(!$('#pwdForm').hidden&&!pwdForced)return; // cambio voluntario en curso
  startData(u);
}

/* ---------- Usuarios (solo administradores) ---------- */
function showTemp(usuario,pass){
  const box=$('#uTemp');
  box.innerHTML=`<p>Contraseña temporal de <b>${esc(usuario)}</b>:</p>
    <div class="pw"><code id="uTempPw">${esc(pass)}</code><button class="btn btn-sm" type="button" id="uCopy">Copiar</button></div>
    <small>Entrégasela en persona o por un medio privado. No se vuelve a mostrar; al entrar se le pedirá cambiarla.</small>`;
  box.hidden=false;
  $('#uCopy').onclick=async()=>{try{await navigator.clipboard.writeText(pass);$('#uCopy').textContent='Copiada';}catch(e){$('#uCopy').textContent='Selecciónala y cópiala';}};
}
function renderUsers(list){
  const box=$('#uList');
  if(!list.length){box.innerHTML='<p class="hint u-hint">Todavía no hay usuarios.</p>';return;}
  box.innerHTML=`<div class="u-table-wrap"><table class="u-table"><thead><tr><th>Usuario</th><th>Nombre</th><th>Estado</th><th>Último acceso</th><th></th></tr></thead><tbody>
    ${list.map(u=>`<tr><td><b>${esc(u.usuario)}</b> ${u.es_admin?'<span class="tag tag-admin">Admin</span>':''}</td><td>${esc(u.nombre||'')}</td>
      <td>${u.debe_cambiar?'<span class="tag tag-warn">Contraseña temporal</span>':'<span class="tag tag-ok">Activo</span>'}</td>
      <td>${u.ultimo_acceso?esc(fmtDT(u.ultimo_acceso)):'Nunca'}</td>
      <td><div class="acts">${u.user_id===S.userId?'<span class="hint u-hint" style="margin:0">Tú</span>':`<button class="btn btn-sm" type="button" data-u-reset="${esc(u.user_id)}" data-u-name="${esc(u.usuario)}">Nueva temporal</button><button class="btn btn-sm btn-danger" type="button" data-u-del="${esc(u.user_id)}" data-u-name="${esc(u.usuario)}">Dar de baja</button>`}</div></td></tr>`).join('')}
  </tbody></table></div>`;
}
async function loadUsers(){
  const box=$('#uList');box.innerHTML='<p class="hint u-hint">Cargando usuarios…</p>';
  try{const r=await callFn('listar');renderUsers(r.usuarios||[]);}
  catch(e){box.innerHTML='';$('#uErr').textContent=e.message;$('#uErr').hidden=false;}
}
function bindUsers(){
  const dlg=$('#usrDlg');
  $('#btnUsers').addEventListener('click',()=>{$('#uErr').hidden=true;$('#uTemp').hidden=true;$('#uForm').reset();dlg.showModal();loadUsers();});
  $('#uClose').addEventListener('click',()=>dlg.close());
  dlg.addEventListener('close',()=>{$('#uTemp').innerHTML='';$('#uTemp').hidden=true;});
  $('#uForm').addEventListener('submit',async e=>{
    e.preventDefault();
    const f=e.target,usuario=f.usuario.value.trim().toLowerCase(),nombre=f.nombre.value.trim(),err=$('#uErr'),btn=$('#uBtn');
    err.hidden=true;$('#uTemp').hidden=true;
    if(!/^[a-z0-9][a-z0-9._-]{2,19}$/.test(usuario)){err.textContent='Usuario no válido: de 3 a 20 caracteres; solo letras minúsculas, números, punto, guion o guion bajo.';err.hidden=false;f.usuario.focus();return;}
    if(!nombre){err.textContent='Escribe el nombre de la persona.';err.hidden=false;f.nombre.focus();return;}
    btn.disabled=true;btn.textContent='Creando…';
    try{const r=await callFn('crear',{usuario,nombre,es_admin:f.es_admin.checked});f.reset();showTemp(r.usuario,r.temporal);loadUsers();}
    catch(x){err.textContent=x.message;err.hidden=false;}
    btn.disabled=false;btn.textContent='Crear usuario';
  });
  $('#uList').addEventListener('click',async e=>{
    const rs=e.target.closest('[data-u-reset]'),dl=e.target.closest('[data-u-del]'),err=$('#uErr');
    if(!rs&&!dl)return;
    err.hidden=true;
    if(rs){
      const name=rs.dataset.uName;
      if(!await confirmAsk(`¿Generar una contraseña temporal nueva para “${name}”? La actual deja de servir y tendrá que cambiarla al entrar.`,'Generar temporal'))return;
      try{const r=await callFn('restablecer',{user_id:rs.dataset.uReset});showTemp(r.usuario,r.temporal);loadUsers();}
      catch(x){err.textContent=x.message;err.hidden=false;}
    }else{
      const name=dl.dataset.uName;
      if(!await confirmAsk(`¿Dar de baja a “${name}”? Ya no podrá entrar al tablero. Sus proyectos y notas se conservan.`,'Dar de baja'))return;
      try{await callFn('baja',{user_id:dl.dataset.uDel});$('#uTemp').hidden=true;loadUsers();}
      catch(x){err.textContent=x.message;err.hidden=false;}
    }
  });
}

function bindLogin(){
  $('#loginForm').addEventListener('submit',async e=>{
    e.preventDefault();
    const us=$('#lUser').value.trim(),pw=$('#lPass').value,err=$('#lErr'),btn=$('#lBtn');
    err.hidden=true;
    if(!us||!pw){err.textContent='Escribe tu usuario y tu contraseña.';err.hidden=false;return;}
    btn.disabled=true;btn.textContent='Entrando…';
    try{
      const {error}=await sb.auth.signInWithPassword({email:toEmail(us),password:pw});
      if(error){err.textContent=/invalid/i.test(error.message)?'Usuario o contraseña incorrectos.':(/fetch|network/i.test(error.message)?'No hay conexión con Supabase. Revisa tu internet o la URL en config.js.':'No se pudo iniciar sesión: '+error.message);err.hidden=false;}
      else $('#lPass').value='';
    }catch(x){err.textContent='No hay conexión con el servidor. Inténtalo de nuevo.';err.hidden=false;}
    btn.disabled=false;btn.textContent='Entrar';
  });
  $('#pwdForm').addEventListener('submit',async e=>{
    e.preventDefault();
    const a=$('#pNew').value,b=$('#pNew2').value,err=$('#pErr'),btn=$('#pBtn');
    err.hidden=true;
    const bad=a.length<8?'La contraseña debe tener al menos 8 caracteres.':(!/[A-Za-z]/.test(a)||!/\d/.test(a))?'La contraseña debe tener letras y números.':(a!==b?'Las dos contraseñas no coinciden.':'');
    if(bad){err.textContent=bad;err.hidden=false;return;}
    btn.disabled=true;const old=btn.textContent;btn.textContent='Guardando…';
    try{
      await callFn('cambiar_password',{nueva:a});
      $('#pNew').value='';$('#pNew2').value='';
      const wasForced=pwdForced;pwdForced=false;
      $('#pwdForm').hidden=true;
      await sb.auth.refreshSession();   // trae la sesión ya sin la marca de contraseña temporal
      if(!wasForced){$('#login').hidden=true;flash('pwd','Tu contraseña se actualizó.');}
    }catch(x){err.textContent=x.message;err.hidden=false;}
    btn.disabled=false;btn.textContent=old;
  });
  $('#pCancel').addEventListener('click',()=>{if(pwdForced)sb.auth.signOut();else{$('#pwdForm').hidden=true;$('#login').hidden=true;}});
  $('#btnPwd').addEventListener('click',async()=>{const {data}=await sb.auth.getUser();showPwd(false,data&&data.user);});
  $('#btnLogout').addEventListener('click',()=>{if(S.demo)stopDemo();sb.auth.signOut();});
}
let DOMINIO='tablero-erp.local';
async function init(){
  bind();applyWriteMode();
  const h=decodeURIComponent((location.hash||'').slice(1));if(VIEWS.includes(h))S.view=h;else if(h.startsWith('proyecto-'))S.pendingOpen=h.slice(9);
  S.projects=S.dbProjects;
  render();
  const cfg=window.TABLERO_CONFIG||{};
  const url=String(cfg.supabaseUrl||'').trim(),key=String(cfg.supabaseKey||'').trim();
  if(cfg.dominioUsuarios)DOMINIO=String(cfg.dominioUsuarios).trim().toLowerCase();
  if(!url||!key||url.includes('TU-PROYECTO')||key.includes('TU_LLAVE')){showConfigError('Edita config.js con la URL del proyecto y la llave publicable de Supabase (ver README).');return;}
  if(isSecretKey(key)){showConfigError('config.js tiene una llave SECRETA. Quítala de inmediato, genera una nueva en Supabase y usa solo la llave publicable.');return;}
  if(!window.supabase||!window.supabase.createClient){showConfigError('No se pudo cargar la librería de Supabase. Revisa tu conexión a internet y recarga.');return;}
  sb=window.supabase.createClient(url,key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}});
  bindLogin();bindUsers();
  sb.auth.onAuthStateChange((event,session)=>{setTimeout(()=>handleSession(session),0);});
}
init();
})();

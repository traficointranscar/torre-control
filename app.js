/* Torre de Control · micro app
   Los datos viven cifrados (AES-256-GCM, clave PBKDF2-SHA256 derivada de la contraseña)
   en data.enc.json y solo se descifran en el dispositivo. */
(function(){
"use strict";

const DATA_URL = 'data.enc.json';
const KEY_STORE = 'tc_key_v2';
const REFRESH_MS = 3 * 60 * 1000;

let data = [], cafeData = [], llantasData = [], azucarData = [], COND = {};
let cryptoKey = null, lastIv = null, started = false;

/* ---------- utilidades ---------- */
const $ = id => document.getElementById(id);
const b64d = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const b64e = u => btoa(String.fromCharCode.apply(null, new Uint8Array(u)));
function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function store(k, v){ try{ v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); }catch(e){} }
function load(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } }

async function fetchEnc(){
  const r = await fetch(DATA_URL + '?t=' + Date.now(), {cache:'no-store'});
  if(!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}
async function deriveKey(pwd, enc){
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pwd), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({name:'PBKDF2', hash:'SHA-256', salt:b64d(enc.salt), iterations:enc.iter},
    base, {name:'AES-GCM', length:256}, true, ['decrypt']);
}
async function decrypt(key, enc){
  const pt = await crypto.subtle.decrypt({name:'AES-GCM', iv:b64d(enc.iv)}, key, b64d(enc.ct));
  return JSON.parse(new TextDecoder().decode(pt));
}
async function rememberKey(key, enc){
  const raw = await crypto.subtle.exportKey('raw', key);
  store(KEY_STORE, JSON.stringify({salt:enc.salt, k:b64e(raw)}));
}
async function storedKey(enc){
  const s = load(KEY_STORE); if(!s) return null;
  try{
    const o = JSON.parse(s); if(o.salt !== enc.salt) return null;
    return await crypto.subtle.importKey('raw', b64d(o.k), {name:'AES-GCM'}, false, ['decrypt']);
  }catch(e){ return null; }
}

/* ---------- acceso ---------- */
function unlock(){ document.body.classList.add('ok'); }
function lock(msg){
  document.body.classList.remove('ok');
  $('gateErr').textContent = msg || '';
  $('gatePwd').value = '';
  setTimeout(() => $('gatePwd').focus(), 50);
}

async function boot(){
  let enc;
  try{ enc = await fetchEnc(); }
  catch(e){ lock('No se pudo descargar la información. Revisa la conexión a internet.'); return; }
  const k = await storedKey(enc);
  if(k){
    try{ apply(await decrypt(k, enc), enc); cryptoKey = k; unlock(); return; }catch(e){ store(KEY_STORE, null); }
  }
  lock('');
}

$('gateForm').addEventListener('submit', async ev => {
  ev.preventDefault();
  const pwd = $('gatePwd').value, err = $('gateErr'), btn = $('gateBtn');
  if(!pwd){ err.textContent = 'Escribe la contraseña'; return; }
  if(!(window.crypto && crypto.subtle)){ err.textContent = 'Este navegador no permite abrir la información cifrada.'; return; }
  btn.disabled = true; btn.textContent = 'Verificando…'; err.textContent = '';
  try{
    const enc = await fetchEnc();
    const key = await deriveKey(pwd, enc);
    let payload;
    try{ payload = await decrypt(key, enc); }
    catch(e){ err.textContent = 'Contraseña incorrecta'; $('gatePwd').select(); return; }
    cryptoKey = key; await rememberKey(key, enc);
    apply(payload, enc); unlock();
  }catch(e){
    err.textContent = 'No se pudo descargar la información. Revisa la conexión.';
  }finally{ btn.disabled = false; btn.textContent = 'Ingresar'; }
});

$('btnLogout').addEventListener('click', () => { store(KEY_STORE, null); cryptoKey = null; lastIv = null; lock('Sesión cerrada.'); });
$('btnRefresh').addEventListener('click', () => refresh(true));

/* ---------- actualización automática ---------- */
async function refresh(manual){
  if(!cryptoKey) return;
  const btn = $('btnRefresh'); if(manual){ btn.textContent = 'Actualizando…'; }
  try{
    const enc = await fetchEnc();
    if(enc.iv === lastIv){ $('liveDot').classList.remove('stale'); return; }
    let payload;
    try{ payload = await decrypt(cryptoKey, enc); }
    catch(e){ store(KEY_STORE, null); cryptoKey = null; lock('La contraseña cambió. Ingresa la nueva contraseña.'); return; }
    const first = lastIv === null;
    apply(payload, enc);
    if(!first){ const n = $('newData'); n.hidden = false; clearTimeout(n._t); n._t = setTimeout(() => n.hidden = true, 6000); }
  }catch(e){ $('liveDot').classList.add('stale'); }
  finally{ if(manual) btn.textContent = 'Actualizar'; }
}
setInterval(() => { if(document.visibilityState === 'visible') refresh(false); }, REFRESH_MS);
document.addEventListener('visibilitychange', () => { if(document.visibilityState === 'visible') refresh(false); });
window.addEventListener('online', () => refresh(false));

function apply(p, enc){
  lastIv = enc.iv;
  data = p.data || []; cafeData = p.cafe || []; llantasData = p.llantas || []; azucarData = p.azucar || []; COND = p.cond || {};
  $('lastUpdate').textContent = p.lastUpdate || '—';
  $('liveDot').classList.remove('stale');
  if(!started){ started = true; }
  renderAll();
}

/* ---------- tablero (misma lógica de la Torre de Control) ---------- */
function condOf(d){ return d.cond || COND[d.placa] || ""; }
function drvHTML(d){ const c = condOf(d); return c ? `<span class="drv"><i>Cond.</i>${esc(c)}</span>` : ""; }

const CATS = {
  ruta:      {label:"En ruta",                    color:"var(--gold)"},
  activo:    {label:"Cargue / descargue en curso", color:"var(--red)"},
  espera:    {label:"En espera",                  color:"var(--blue)"},
  pendiente: {label:"Programado / por enturnar",  color:"var(--muted)"},
};
const catOf = d => CATS[d.cat] ? d.cat : 'pendiente';

let currentFilter = "todos", currentSearch = "", qOrigen = "", qDestino = "", progFilter = "todos", opFilter = "todos";

function counts(){ const c = {ruta:0, activo:0, espera:0, pendiente:0}; data.forEach(d => c[catOf(d)]++); return c; }

function renderKPIs(){
  const c = counts(), el = $('kpis');
  const items = [
    {key:'todos', n:data.length, l:'Operaciones', color:'var(--ink)'},
    {key:'ruta', n:c.ruta, l:'En ruta', color:'var(--gold)'},
    {key:'activo', n:c.activo, l:'Cargando/Descargando', color:'var(--red)'},
    {key:'espera', n:c.espera, l:'En espera', color:'var(--blue)'},
    {key:'pendiente', n:c.pendiente, l:'Programados', color:'var(--muted)'},
  ];
  el.innerHTML = items.map(it => `
    <div class="kpi ${currentFilter===it.key?'active':''}" style="--kc:${it.color}" data-filter="${it.key}">
      <div class="n">${it.n}</div><div class="l">${it.l}</div>
    </div>`).join('');
  el.querySelectorAll('.kpi').forEach(k => k.addEventListener('click', () => {
    const v = k.getAttribute('data-filter');
    currentFilter = (currentFilter === v && v !== 'todos') ? 'todos' : v;
    renderAll();
  }));
}
function syncChips(){
  document.querySelectorAll('.chip[data-prog]').forEach(ch => ch.classList.toggle('active', ch.getAttribute('data-prog') === progFilter));
  document.querySelectorAll('.chip[data-op]').forEach(ch => ch.classList.toggle('active', ch.getAttribute('data-op') === opFilter));
}
function bindChips(attr, setter){
  document.querySelectorAll('.chip['+attr+']').forEach(ch => ch.addEventListener('click', () => { setter(ch.getAttribute(attr)); syncChips(); renderAll(); }));
}
bindChips('data-prog', v => progFilter = (progFilter===v ? 'todos' : v));
bindChips('data-op',   v => opFilter = (opFilter===v ? 'todos' : v));
$('search').addEventListener('input', e => { currentSearch = e.target.value; renderAll(); });
$('qOrigen').addEventListener('input', e => { qOrigen = e.target.value; renderAll(); });
$('qDestino').addEventListener('input', e => { qDestino = e.target.value; renderAll(); });
$('btnClear').addEventListener('click', () => {
  currentSearch = qOrigen = qDestino = ''; progFilter = opFilter = currentFilter = 'todos';
  ['search','qOrigen','qDestino'].forEach(id => $(id).value = ''); syncChips(); renderAll();
});

function norm(s){ return String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase(); }
function words(s){ return norm(s).split(/[^a-z0-9]+/).filter(Boolean); }
function hasWords(q, text){ const t = words(q); if(!t.length) return true; const w = words(text); return t.every(x => w.some(y => y.startsWith(x))); }
/* "Cliente / Origen-Destino (Producto)" · "Cliente / Origen → Destino" · "Origen-Destino" · "Vacío Buenaventura" */
function parseRuta(r){
  let s = String(r||'').trim(), prod = '', cliente = '', origen = '', destino = '';
  const mp = s.match(/\(([^)]*)\)\s*$/); if(mp){ prod = mp[1].trim(); s = s.slice(0, mp.index).trim(); }
  let rest = s; const i = s.indexOf(' / ');
  if(i >= 0){ cliente = s.slice(0, i).trim(); rest = s.slice(i + 3).trim(); }
  const md = rest.match(/^(.+?)\s*(?:→|->|-)\s*(.+)$/);
  if(md){ origen = md[1].trim(); destino = md[2].trim(); }
  else if(cliente){ origen = cliente; destino = rest; }
  else { origen = rest; }
  return {cliente, origen, destino, prod};
}
function rutaOf(d){ if(!d._r || d._r.src !== d.ruta){ d._r = parseRuta(d.ruta); d._r.src = d.ruta; } return d._r; }
/* Búsqueda general: placa, conductor, producto (y cliente). Origen y destino van en sus propias casillas. */
function textMatch(d, tag){
  const r = rutaOf(d);
  if(!hasWords(qOrigen, r.origen)) return false;
  if(!hasWords(qDestino, r.destino)) return false;
  return hasWords(currentSearch, [d.placa, condOf(d), r.prod, r.cliente, tag || ''].join(' '));
}
const filtering = () => !!(currentSearch || qOrigen || qDestino || progFilter !== 'todos' || opFilter !== 'todos' || currentFilter !== 'todos');
function title(s){ return String(s||'').toLowerCase().replace(/(^|[\s(\/-])([a-záéíóúñü])/g, (m,a,b) => a + b.toUpperCase()); }
function fillLists(){
  const all = [...data, ...cafeData, ...llantasData, ...azucarData].map(rutaOf);
  const uniq = a => [...new Set(a.filter(Boolean).map(title))].sort((x,y) => x.localeCompare(y,'es'));
  $('dlOrigen').innerHTML = uniq(all.map(r => r.origen)).map(v => `<option value="${esc(v)}">`).join('');
  $('dlDestino').innerHTML = uniq(all.map(r => r.destino)).map(v => `<option value="${esc(v)}">`).join('');
}
function matches(d, isMain, tag){
  if(currentFilter !== 'todos' && catOf(d) !== currentFilter) return false;
  if(progFilter !== 'todos' && schedKind(d.prog) !== progFilter) return false;
  if(isMain && opFilter !== 'todos' && d.op !== opFilter) return false;
  return textMatch(d, tag);
}
function originOf(ruta){ return String(ruta||'').split(/\s*(?:\/|→)\s*/)[0].trim(); }
function schedKind(prog){
  const p = String(prog||'').toLowerCase(), t = p.search(/enturn/), c = p.search(/cita/);
  if(t >= 0 && (c < 0 || t < c)) return 'turno';
  if(c >= 0) return 'cita';
  return 'otros';
}
const KINDS = [{key:'turno', label:'Por enturnar'}, {key:'cita', label:'Por cita'}, {key:'otros', label:'Otros (sin turno ni cita)'}];
const OPS = [{key:'Descargue', label:'Descargues', color:'var(--red)'}, {key:'Cargue', label:'Cargues', color:'var(--gold)'}];
function byOrigin(a,b){
  return originOf(a.ruta).localeCompare(originOf(b.ruta),'es',{sensitivity:'base'})
      || String(a.ruta).localeCompare(String(b.ruta),'es',{sensitivity:'base'})
      || String(a.placa).localeCompare(String(b.placa));
}

function render(){
  renderKPIs();
  const el = $('groups'), filtered = data.filter(d => matches(d,true));
  if(!filtered.length){ el.innerHTML = `<div style="text-align:center;color:var(--muted);padding:24px 0;font-size:13px;">Sin coincidencias.</div>`; return; }
  el.innerHTML = OPS.map(op => {
    const opRows = filtered.filter(d => d.op === op.key); if(!opRows.length) return '';
    const subs = KINDS.map(k => {
      const rows = opRows.filter(d => schedKind(d.prog) === k.key).sort(byOrigin); if(!rows.length) return '';
      return `<div class="group"><div class="subHead"><h4>${k.label}</h4><span class="count">${rows.length}</span></div>
        ${rows.map(d => `
          <div class="row" style="--gc:${CATS[catOf(d)].color}">
            <div class="plate">${esc(d.placa)}</div>
            <div class="op-badge ${esc(String(d.op).toLowerCase())}">${esc(d.op)}</div>
            <div class="route">${esc(d.ruta)}<span class="prog">${esc(d.prog)}</span>${drvHTML(d)}</div>
            <div class="status">${esc(d.estado)}<span class="sub">${esc(d.op)} · último reporte</span></div>
            <div class="last-update">${esc(d.detalle)}</div>
          </div>`).join('')}</div>`;
    }).join('');
    return `<div class="opHead" style="--oc:${op.color}"><h3>${op.label}</h3><span class="count">${opRows.length}</span></div>${subs}`;
  }).join('');
}

function renderCompactPanel(id, allRows, tag){
  const el = $(id), rows = allRows.filter(d => matches(d,false,tag));
  if(allRows.length && !rows.length){ el.innerHTML = `<div style="text-align:center;color:var(--muted);padding:18px 0;font-size:13px;">Sin coincidencias.</div>`; return; }
  if(!rows.length){
    el.innerHTML = `<div class="empty-state"><span class="dot"></span><div class="txt"><b>Pendiente por programar</b><br>No hay vehículos programados en el reporte actual.</div></div>`;
    return;
  }
  el.innerHTML = ['ruta','activo','espera','pendiente'].map(ck => {
    const items = rows.filter(d => catOf(d) === ck).sort(byOrigin); if(!items.length) return '';
    const m = CATS[ck];
    return `<div class="group" style="--gc:${m.color}">
      <div class="group-head"><span class="dotbar" style="background:${m.color}"></span><h3>${m.label}</h3><span class="count">${items.length}</span></div>
      ${items.map(d => `
        <div class="row compact" style="--gc:${m.color}">
          <div class="plate">${esc(d.placa)}</div>
          <div class="route">${esc(d.ruta)}<span class="prog">${esc(d.prog)}</span>${drvHTML(d)}</div>
          <div><div class="status" style="text-align:right;">${esc(d.estado)}</div><div class="last-update">${esc(d.detalle)}</div></div>
        </div>`).join('')}</div>`;
  }).join('');
}

function renderCounts(){
  const ops = n => n + (n === 1 ? ' operación' : ' operaciones');
  $('cntNac').textContent = ops(data.length); $('cntCafe').textContent = ops(cafeData.length);
  $('cntLlan').textContent = ops(llantasData.length); $('cntAzu').textContent = ops(azucarData.length);
  $('totalOps').textContent = data.length + cafeData.length + llantasData.length + azucarData.length;
  $('tbNac').textContent = data.length; $('tbCafe').textContent = cafeData.length;
  $('tbLlan').textContent = llantasData.length; $('tbAzu').textContent = azucarData.length;
}

function renderAll(){
  render();
  renderCompactPanel('cafeGroups', cafeData, 'café');
  renderCompactPanel('llantasGroups', llantasData, 'llantas');
  renderCompactPanel('azucarGroups', azucarData, 'azúcar');
  renderCounts(); fillLists();
  $('btnClear').classList.toggle('on', filtering());
}

/* ---------- pestañas (celular) ---------- */
$('tabbar').addEventListener('click', e => {
  const b = e.target.closest('button[data-tab]'); if(!b) return;
  document.querySelectorAll('#tabbar button').forEach(x => x.classList.toggle('active', x === b));
  $('split').setAttribute('data-tab', b.getAttribute('data-tab'));
  window.scrollTo({top:0});
});

/* ---------- app instalable ---------- */
if('serviceWorker' in navigator){ window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {})); }

boot();
})();

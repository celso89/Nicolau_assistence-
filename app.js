let sb=null, session=null, profile=null, config=null, currentPage='dashboard';

const pad=n=>String(n).padStart(2,'0');
const ymd=d=>d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
const isoToday=()=>ymd(new Date());
const parseYmd=v=>{const [y,m,d]=v.split('-').map(Number);return new Date(y,m-1,d)};
const addDays=(d,n)=>{const x=new Date(d);x.setDate(x.getDate()+n);return x};
const startOfDay=d=>new Date(d.getFullYear(),d.getMonth(),d.getDate());
const mondayOf=d=>addDays(startOfDay(d),-((d.getDay()+6)%7));
const brDate=d=>d.toLocaleDateString('pt-AO');
const CATS=[['service_normal','Serviços Normais'],['visor_stock','Visores do Estoque'],['visor_order','Visores Por Encomenda']];
const CATNAME=Object.fromEntries(CATS);
async function fetchRange(tableName,start,end){let all=[],from=0;for(;;){const {data,error}=await sb.from(tableName).select('*').gte('created_at',start.toISOString()).lt('created_at',end.toISOString()).order('created_at',{ascending:false}).range(from,from+999);if(error)throw error;all=all.concat(data||[]);if(!data||data.length<1000)break;from+=1000}return all}
function sums(mv){const r={};CATS.forEach(([k])=>r[k]={in:0,out:0});mv.forEach(x=>{const c=r[x.category];if(!c)return;if(x.direction==='saida')c.out+=Number(x.amount);else c.in+=Number(x.amount)});return r}
function net(mv){return mv.reduce((a,x)=>a+(x.direction==='saida'?-1:1)*Number(x.amount||0),0)}
function summaryBoxes(mv){const s=sums(mv);let tin=0,tout=0;const boxes=CATS.map(([k,l])=>{const c=s[k];tin+=c.in;tout+=c.out;return cashBox(l,c.in-c.out,false,`Entradas ${money(c.in)} · Saídas ${money(c.out)}`)}).join('');return `<div class="cash-grid">${boxes}${cashBox('Total Geral',tin-tout,true,`Entradas ${money(tin)} · Saídas ${money(tout)}`)}</div>`}
function mvRows(mv,limit=400){return mv.slice(0,limit).map(x=>`<tr><td>${new Date(x.created_at).toLocaleString('pt-AO',{dateStyle:'short',timeStyle:'short'})}</td><td>${esc(x.description)}</td><td>${CATNAME[x.category]||x.category}</td><td><span class="tag ${x.direction==='saida'?'red':'green'}">${x.direction}</span></td><td>${money(x.amount)}</td><td><button class="mini-btn del" data-delmv="${x.id}">Remover</button></td></tr>`).join('')}
function bindDelMv(){document.querySelectorAll('[data-delmv]').forEach(b=>b.onclick=async()=>{if(!await askCode('Para remover este movimento introduza o código de autorização. Não pode ser desfeito.'))return;const {error}=await sb.from('cash_movements').delete().eq('id',b.dataset.delmv);if(error){toast(friendly(error));return}await logAction('Removeu movimento de caixa',b.dataset.delmv);toast('Movimento removido.');showPage(currentPage)})}
function bindDelOs(){document.querySelectorAll('[data-delos]').forEach(b=>b.onclick=async()=>{if(!await askCode(`Remover a ordem ${b.dataset.no}? O movimento de caixa desta ordem também será removido. Introduza o código de autorização.`))return;const r1=await sb.from('cash_movements').delete().eq('order_id',b.dataset.delos);if(r1.error){toast(friendly(r1.error));return}const r2=await sb.from('service_orders').delete().eq('id',b.dataset.delos);if(r2.error){toast(friendly(r2.error));return}await logAction('Removeu ordem de serviço',b.dataset.no);toast('Ordem removida.');showPage('orders')})}
function movementModal(){openModal('Registar movimento de caixa',`<div class="field-grid">${field('description','Descrição')}${field('category','Categoria','select',true,'<option value="service_normal">Serviço Normal</option><option value="visor_stock">Visor do Estoque</option><option value="visor_order">Visor Por Encomenda</option>')}${field('direction','Movimento','select',true,'<option value="entrada">Entrada</option><option value="saida">Saída</option>')}${field('amount','Valor (Kz)','number')}</div>`,fd=>addRecord('cash_movements',{description:val(fd,'description'),category:val(fd,'category'),direction:val(fd,'direction'),amount:Number(val(fd,'amount')),created_by:session.user.id},'Registou movimento de caixa'))}
const $=id=>document.getElementById(id);
/* ===== Código de autorização (finanças) ===== */
const FIN_CODE='NOB938';
function askCode(msg){return new Promise(resolve=>{const dlg=$('codeDialog');$('codeMsg').textContent=msg;$('codeInput').value='';$('codeErr').textContent='';let done=false;const finish=v=>{if(done)return;done=true;if(dlg.open)dlg.close();resolve(v)};const check=()=>{if($('codeInput').value.trim().toUpperCase()===FIN_CODE)finish(true);else{$('codeErr').textContent='Código incorreto.';$('codeInput').select()}};$('codeOk').onclick=check;$('codeInput').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();check()}};$('codeCancel').onclick=()=>finish(false);dlg.oncancel=()=>finish(false);dlg.showModal();$('codeInput').focus()})}

/* ===== Modo escuro ===== */
function applyTheme(t){document.documentElement.dataset.theme=t;try{localStorage.setItem('na_theme',t)}catch{}document.querySelectorAll('.theme-btn').forEach(b=>b.textContent=t==='dark'?'☀ Modo claro':'🌙 Modo escuro');const m=document.querySelector('meta[name=theme-color]');if(m)m.content=t==='dark'?'#050d1a':'#071a33'}
document.querySelectorAll('.theme-btn').forEach(b=>b.onclick=()=>applyTheme(document.documentElement.dataset.theme==='dark'?'light':'dark'));
applyTheme(document.documentElement.dataset.theme==='dark'?'dark':'light');

/* ===== Tabelas empilhadas no telemóvel (rótulos por célula) ===== */
function labelTables(root){(root||document).querySelectorAll('table').forEach(t=>{const h=[...t.querySelectorAll('thead th')].map(x=>x.textContent.trim());t.querySelectorAll('tbody tr').forEach(tr=>{[...tr.children].forEach((td,i)=>{if(h[i]&&!td.dataset.label)td.dataset.label=h[i]})})})}
new MutationObserver(()=>labelTables($('content'))).observe($('content'),{childList:true,subtree:true});

/* ===== PDF da ordem de serviço ===== */
let _jspdfP=null;
function loadJsPdf(){if(window.jspdf)return Promise.resolve(window.jspdf);if(_jspdfP)return _jspdfP;_jspdfP=new Promise((res,rej)=>{const sc=document.createElement('script');sc.src='https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js';sc.onload=()=>window.jspdf?res(window.jspdf):rej(Error('Falha ao iniciar o gerador de PDF.'));sc.onerror=()=>{_jspdfP=null;rej(Error('Não foi possível carregar o gerador de PDF. Verifique a Internet.'))};document.head.appendChild(sc)});return _jspdfP}
async function logoData(){try{const r=await fetch('assets/logo.png');const b=await r.blob();return await new Promise(res=>{const f=new FileReader();f.onload=()=>res(f.result);f.onerror=()=>res(null);f.readAsDataURL(b)})}catch{return null}}
async function orderPdf(o,phone){
  const {jsPDF}=await loadJsPdf();const d=new jsPDF({unit:'mm',format:'a4'});const W=210;
  const clean=v=>String(v??'').replace(/[\u00a0\u202f]/g,' ');
  d.setFillColor(7,26,51);d.rect(0,0,W,34,'F');
  const lg=await logoData();if(lg){try{d.addImage(lg,'PNG',12,6,22,22)}catch{}}
  const tx=lg?40:14;
  d.setTextColor(255,255,255);d.setFont('helvetica','bold');d.setFontSize(18);d.text('NICOLAU ASSISTANCE',tx,17);
  d.setFont('helvetica','normal');d.setFontSize(9);d.setTextColor(170,200,235);d.text('ASSISTÊNCIA TÉCNICA',tx,24);
  d.setFont('helvetica','bold');d.setFontSize(16);d.setTextColor(21,37,59);d.text('ORDEM DE SERVIÇO',14,50);
  d.setTextColor(22,116,209);d.text(clean(o.order_no),W-14,50,{align:'right'});
  d.setDrawColor(227,234,243);d.line(14,54,W-14,54);
  let y=65;
  const row=(l,v)=>{d.setFont('helvetica','bold');d.setFontSize(8.5);d.setTextColor(115,131,154);d.text(l.toUpperCase(),14,y);d.setFont('helvetica','normal');d.setFontSize(11);d.setTextColor(21,37,59);const lines=d.splitTextToSize(clean(v||'-'),W-76);d.text(lines,62,y);y+=Math.max(10,lines.length*5.5+4.5)};
  row('Data',new Date(o.created_at).toLocaleString('pt-AO',{dateStyle:'short',timeStyle:'short'}));
  row('Cliente',o.client_name);row('Telefone',phone);row('Aparelho',o.device);row('Serviço',o.service_name);row('Tipo',o.service_type);
  if(o.visor_origin)row('Origem do visor',o.visor_origin);
  row('Defeito / reparação',o.problem);row('Estado',o.status);
  y+=4;if(y>235){d.addPage();y=30}
  d.setFillColor(11,43,80);d.roundedRect(14,y,W-28,18,3,3,'F');
  d.setFont('helvetica','normal');d.setFontSize(10);d.setTextColor(184,210,237);d.text('VALOR TOTAL',20,y+11);
  d.setFont('helvetica','bold');d.setFontSize(15);d.setTextColor(255,255,255);d.text(clean(money(o.amount)),W-20,y+11.5,{align:'right'});
  y+=44;if(y>265){d.addPage();y=40}
  d.setDrawColor(150,160,175);d.line(20,y,85,y);d.line(W-85,y,W-20,y);
  d.setFont('helvetica','normal');d.setFontSize(9);d.setTextColor(115,131,154);d.text('Assinatura do cliente',52.5,y+5,{align:'center'});d.text('Nicolau Assistance',W-52.5,y+5,{align:'center'});
  d.setFontSize(8);d.text('Documento gerado em '+new Date().toLocaleString('pt-AO',{dateStyle:'short',timeStyle:'short'}),W/2,288,{align:'center'});
  d.save('Ordem_'+clean(o.order_no).replace(/[^\w-]+/g,'_')+'.pdf');
}

/* ===== Numeração automática das ordens ===== */
function nextOrderNo(list){let m=0;list.forEach(x=>{const n=parseInt(String(x.order_no||'').replace(/\D/g,''),10);if(n>m)m=n});return 'OS-'+String(m+1).padStart(4,'0')}
async function latestOrderNos(){const {data,error}=await sb.from('service_orders').select('order_no').order('created_at',{ascending:false}).limit(1000);if(error)throw error;return data||[]}
 const money=v=>new Intl.NumberFormat('pt-AO',{maximumFractionDigits:0}).format(Number(v||0))+' Kz';  const fmtDate=d=>d?new Date(d+'T00:00:00').toLocaleDateString('pt-AO'):'—';
const CONN={ok:true};
function netFetch(url,opts={}){
  const method=(opts.method||'GET').toUpperCase(), idem=method==='GET'||method==='HEAD';
  const attempt=async n=>{
    const ctl=new AbortController(); const timer=setTimeout(()=>ctl.abort(),20000);
    if(opts.signal) opts.signal.addEventListener('abort',()=>ctl.abort());
    try{const r=await fetch(url,{...opts,signal:ctl.signal});setConn(true);return r}
    catch(err){ if(idem&&n<2){await new Promise(r=>setTimeout(r,700*(n+1)));return attempt(n+1)} setConn(false); throw err }
    finally{clearTimeout(timer)}
  };
  return attempt(0);
}
function setConn(ok){CONN.ok=ok;const el=$('connDot');if(!el)return;el.textContent=ok?'● Ligação ativa':'● Sem ligação';el.classList.toggle('offline',!ok)}
async function pingServer(){try{const r=await fetch(config.supabase_url+'/auth/v1/health',{headers:{apikey:config.publishable_key},cache:'no-store',signal:AbortSignal.timeout(8000)});setConn(r.ok||r.status<500)}catch{setConn(false)}}
window.addEventListener('online',()=>{setConn(true);if(sb&&session)pingServer()});window.addEventListener('offline',()=>setConn(false));
function friendly(err){const m=(err&&err.message)||String(err||'');
  if(/Invalid login credentials/i.test(m))return 'Email ou palavra-passe incorretos.';
  if(/Failed to fetch|NetworkError|AbortError|Load failed|network/i.test(m))return 'Sem ligação ao servidor. Verifique a Internet e tente novamente.';
  if(/Email not confirmed/i.test(m))return 'Conta ainda não confirmada. No Supabase, marque o utilizador como confirmado (Auto Confirm).';
  if(/duplicate key/i.test(m))return 'Já existe um registo com esse valor (ex.: número de OS repetido).';
  if(/row-level security|permission denied/i.test(m))return 'Sem permissão para esta ação.';
  return m}
async function boot(){
  try{
    config=window.NICOLAU_CONFIG;
    if(!config||!config.supabase_url||config.supabase_url.includes('COLOQUE_')||!config.publishable_key||config.publishable_key.includes('COLOQUE_'))throw Error('Preencha config.js com a URL e a Publishable Key do Supabase.');
    if(!window.supabase)throw Error('Não foi possível carregar a biblioteca do Supabase. Verifique a Internet e recarregue a página.');
    sb=window.supabase.createClient(config.supabase_url,config.publishable_key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false},global:{fetch:netFetch}});
    sb.auth.onAuthStateChange(ev=>{if(ev==='SIGNED_OUT'&&session){session=null;location.reload()}});
    const {data:{session:s}}=await sb.auth.getSession();
    if(s){session=s;await enter()}
    setInterval(()=>{if(session)pingServer()},30000);
  }catch(e){$('loginError').textContent=friendly(e)}
}
$('loginForm').addEventListener('submit',async e=>{
  e.preventDefault();const btn=e.submitter||e.target.querySelector('button');btn.disabled=true;$('loginError').textContent='A validar acesso…';
  try{
    if(!sb)throw Error('Sistema não inicializado. Recarregue a página.');
    const {data,error}=await sb.auth.signInWithPassword({email:$('loginEmail').value.trim(),password:$('loginPassword').value});
    if(error)throw error;
    session=data.session;await enter();
  }catch(err){$('loginError').textContent=friendly(err)}
  finally{btn.disabled=false}
});
async function enter(){
  const {data:ok,error}=await sb.rpc('is_owner');
  if(error||!ok){const msg=error?friendly(error):'Esta conta não tem permissão. Confirme o UID na função is_owner() do schema.sql.';session=null;await sb.auth.signOut().catch(()=>{});$('loginError').textContent=msg;return}
  profile={role:'admin',full_name:'Administrador'};
  $('loginView').classList.add('hidden');$('appView').classList.remove('hidden');
  $('userName').textContent=session.user.email;$('userRole').textContent='Administrador';
  $('todayLabel').textContent=new Date().toLocaleDateString('pt-AO',{dateStyle:'full'});
  pingServer();showPage('dashboard');
}
$('logoutBtn').onclick=async()=>{await sb.auth.signOut();location.reload()};$('nav').addEventListener('click',e=>{const b=e.target.closest('[data-page]');if(b)showPage(b.dataset.page)});
function toast(t){const el=$('toast');el.textContent=t;el.classList.add('show');setTimeout(()=>el.classList.remove('show'),2600)}
function pageHead(title,sub,button=''){return `<div class="page-head"><div><h3>${title}</h3><p>${sub}</p></div><div class="actions">${button}</div></div>`}
function stat(label,value,caption=''){return `<div class="stat"><div class="label">${label}</div><strong>${value}</strong><small>${caption}</small></div>`}
function table(headers,rows){return `<div class="table-wrap"><table><thead><tr>${headers.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows||`<tr><td colspan="${headers.length}" class="empty">Sem registos para apresentar.</td></tr>`}</tbody></table></div>`}
function showPage(p){currentPage=p;document.querySelectorAll('#nav button').forEach(b=>b.classList.toggle('active',b.dataset.page===p));const names={dashboard:'Painel principal',orders:'Ordens de serviço',stock:'Estoque',services:'Gestão de serviços',cash:'Caixa de hoje',finance:'Histórico de finanças',history:'Histórico de ações'};$('pageTitle').textContent=names[p]||'Gestão';({dashboard:dashboard,orders:orders,stock:stock,services:services,cash:cash,finance:finance,history:history}[p]||dashboard)().catch(e=>toast('Erro: '+friendly(e)))}
async function rows(tableName,query){let q=sb.from(tableName).select('*').order('created_at',{ascending:false});if(query)q=query(q);const {data,error}=await q;if(error)throw error;return data||[]}
async function logAction(action,detail){await sb.from('activity_logs').insert({user_id:session.user.id,actor:session.user.email,action,details:detail||''})}
async function dashboard(){
  const t=new Date(),dayS=startOfDay(t),dayE=addDays(dayS,1),wk=mondayOf(t),mo=new Date(t.getFullYear(),t.getMonth(),1);
  const [recent,cl,sv,se,mv,osToday]=await Promise.all([rows('service_orders',q=>q.limit(7)),rows('clients'),rows('visor_stock'),rows('visor_orders'),fetchRange('cash_movements',wk<mo?wk:mo,dayE),fetchRange('service_orders',dayS,dayE)]);
  const inR=(a,b)=>mv.filter(x=>{const d=new Date(x.created_at);return d>=a&&d<b});
  const hoje=inR(dayS,dayE),sem=inR(wk,dayE),mes=inR(mo,dayE);
  $('content').innerHTML=pageHead('Visão geral','Resumo operacional da Nicolau Assistance')+
  `<div class="stats">${stat('Ordens de hoje',osToday.length,'Atendimentos de hoje')}${stat('Clientes',cl.length,'Base de clientes')}${stat('Visores no estoque',sv.reduce((a,x)=>a+Number(x.quantity),0),'Unidades disponíveis')}${stat('Visores por encomenda',se.reduce((a,x)=>a+Number(x.quantity),0),'Unidades encomendadas')}</div>
  <div class="panel"><h3>Caixa de hoje — ${t.toLocaleDateString('pt-AO',{dateStyle:'full'})}</h3>${summaryBoxes(hoje)}<p class="tiny muted" style="text-align:left">O caixa recomeça a zero todos os dias. Os dias anteriores ficam guardados em <b>Histórico de finanças</b>.</p></div>
  <div class="panel"><h3>Balanço rápido</h3><div class="cash-grid" style="grid-template-columns:repeat(3,1fr)">${cashBox('Esta semana',net(sem),false,'Segunda a hoje')}${cashBox('Este mês',net(mes),false,t.toLocaleDateString('pt-AO',{month:'long',year:'numeric'}))}<div class="cash-item"><span>Ver outros períodos</span><strong style="font-size:14px;margin-top:12px"><button class="primary" id="goFin">Histórico de finanças</button></strong></div></div></div>
  <div class="panel"><h3>Ordens de serviço recentes</h3>${table(['Nº OS','Cliente','Tipo','Origem do visor','Valor','Estado'],recent.map(o=>`<tr><td>${esc(o.order_no)}</td><td>${esc(o.client_name)}</td><td>${esc(o.service_type)}</td><td>${esc(o.visor_origin||'—')}</td><td>${money(o.amount)}</td><td><span class="tag">${esc(o.status)}</span></td></tr>`).join(''))}</div>`;
  $('goFin').onclick=()=>showPage('finance');
}
function cashBox(label,value,total=false,caption=''){return `<div class="cash-item ${total?'total':''}"><span>${label}</span><strong>${money(value)}</strong>${caption?`<small>${caption}</small>`:''}</div>`}
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function openModal(title,html,onSave){$('modalTitle').textContent=title;$('modalBody').innerHTML=html;$('modal').showModal();$('modalSave').onclick=async e=>{e.preventDefault();const form=$('modalForm');if(!form.reportValidity())return;try{await onSave(new FormData(form));$('modal').close();}catch(err){toast('Não foi possível guardar: '+friendly(err))}}}
const field=(name,label,type='text',required=true,opts='')=>`<div class="field"><label>${label}</label>${type==='select'?`<select name="${name}" ${required?'required':''}>${opts}</select>`:type==='textarea'?`<textarea name="${name}" ${required?'required':''}></textarea>`:`<input name="${name}" type="${type}" ${required?'required':''} ${type==='number'?'min="0" step="0.01"':''}>`}</div>`;
function val(fd,k){return fd.get(k)?.toString().trim()||''}
async function addRecord(table,data,action){const {error}=await sb.from(table).insert(data);if(error)throw error;await logAction(action,JSON.stringify(data));toast('Registo guardado com sucesso.');showPage(currentPage)}
async function services(){const data=await rows('service_catalog');$('content').innerHTML=pageHead('Gestão de serviços','Cadastre, remova serviços e altere os respetivos preços.',`<button class="primary" id="addService">＋ Cadastrar serviço</button>`)+`<div class="panel">${table(['Serviço','Tipo','Descrição','Preço','Ações'],data.map(x=>`<tr><td>${esc(x.name)}</td><td><span class="tag ${x.service_type==='Troca de Visor'?'orange':''}">${esc(x.service_type)}</span></td><td>${esc(x.description||'—')}</td><td><b>${money(x.price)}</b></td><td><button class="mini-btn" data-price="${x.id}" data-name="${esc(x.name)}" data-value="${x.price}">Alterar preço</button><button class="mini-btn del" data-del="${x.id}">Remover</button></td></tr>`).join(''))}</div>`;$('addService').onclick=()=>openModal('Cadastrar serviço',`<div class="field-grid">${field('name','Nome do serviço')}${field('service_type','Tipo','select',true,'<option>Serviço Normal</option><option>Troca de Visor</option>')}${field('price','Preço (Kz)','number')}${field('description','Descrição','textarea',false)}</div>`,fd=>addRecord('service_catalog',{name:val(fd,'name'),service_type:val(fd,'service_type'),price:Number(val(fd,'price')),description:val(fd,'description')},'Cadastrou serviço'));document.querySelectorAll('[data-price]').forEach(b=>b.onclick=()=>openModal('Alterar preço',field('price','Novo preço (Kz)','number'),async fd=>{const {error}=await sb.from('service_catalog').update({price:Number(val(fd,'price'))}).eq('id',b.dataset.price);if(error)throw error;await logAction('Alterou preço do serviço',b.dataset.name);toast('Preço atualizado.');showPage('services')}));bindDelete('content','service_catalog','serviço')}
async function stock(){const [a,b,t]=await Promise.all([rows('visor_stock'),rows('visor_orders'),rows('tool_stock')]);$('content').innerHTML=pageHead('Estoque','Os visores em estoque, visores por encomenda e ferramentas são controlados separadamente.')+`<div class="split"><div class="panel"><div class="page-head"><h3>Visores — No Estoque</h3><button class="primary" id="addVS">＋ Adicionar</button></div>${table(['Modelo / peça','Quantidade','Custo unit.','Fornecedor','Ações'],stockRows(a,'visor_stock'))}</div><div class="panel"><div class="page-head"><h3>Visores — Por Encomenda</h3><button class="primary" id="addVE">＋ Adicionar</button></div>${table(['Modelo / peça','Quantidade','Custo unit.','Fornecedor','Ações'],stockRows(b,'visor_orders'))}</div></div><div class="panel"><div class="page-head"><h3>Ferramentas e outros materiais</h3><button class="primary" id="addTool">＋ Adicionar</button></div>${table(['Ferramenta / material','Quantidade','Custo unit.','Ações'],t.map(x=>`<tr><td>${esc(x.name)}</td><td>${x.quantity}</td><td>${money(x.unit_cost)}</td><td><button class="mini-btn del" data-del="${x.id}" data-table="tool_stock">Remover</button></td></tr>`).join(''))}</div>`;const stockModal=(title,tableName)=>openModal(title,`<div class="field-grid">${field('name','Nome / modelo')}${field('quantity','Quantidade','number')}${field('unit_cost','Custo unitário (Kz)','number')}${field('supplier','Fornecedor', 'text',false)}</div>`,fd=>addRecord(tableName,{name:val(fd,'name'),quantity:Number(val(fd,'quantity')),unit_cost:Number(val(fd,'unit_cost')),supplier:val(fd,'supplier')},'Adicionou item ao estoque'));$('addVS').onclick=()=>stockModal('Adicionar visor no estoque','visor_stock');$('addVE').onclick=()=>stockModal('Adicionar visor por encomenda','visor_orders');$('addTool').onclick=()=>openModal('Adicionar ferramenta',`<div class="field-grid">${field('name','Nome')}${field('quantity','Quantidade','number')}${field('unit_cost','Custo unitário (Kz)','number')}</div>`,fd=>addRecord('tool_stock',{name:val(fd,'name'),quantity:Number(val(fd,'quantity')),unit_cost:Number(val(fd,'unit_cost'))},'Adicionou ferramenta'));bindDelete('content','visor_stock','item');bindDelete('content','visor_orders','item');bindDelete('content','tool_stock','item')}
function stockRows(data,tableName){return data.map(x=>`<tr><td>${esc(x.name)}</td><td>${x.quantity}</td><td>${money(x.unit_cost)}</td><td>${esc(x.supplier||'—')}</td><td><button class="mini-btn del" data-del="${x.id}" data-table="${tableName}">Remover</button></td></tr>`).join('')}
async function orders(){
  const [os,clientsList,servicesList]=await Promise.all([rows('service_orders'),rows('clients'),rows('service_catalog')]);
  const nextNo=nextOrderNo(os);
  $('content').innerHTML=pageHead('Ordens de serviço','O número da OS é gerado automaticamente e o cliente é cadastrado aqui mesmo.',`<button class="primary" id="addOS">＋ Nova ordem</button>`)+`<div class="panel">${table(['Nº OS','Cliente','Serviço','Tipo','Origem do visor','Valor','Estado','Ações'],os.map(x=>`<tr><td><b>${esc(x.order_no)}</b></td><td>${esc(x.client_name)}</td><td>${esc(x.service_name)}</td><td>${esc(x.service_type)}</td><td>${esc(x.visor_origin||'—')}</td><td>${money(x.amount)}</td><td><span class="tag">${esc(x.status)}</span></td><td><button class="mini-btn" data-pdf="${x.id}">⬇ PDF</button><button class="mini-btn" data-status="${x.id}">Estado</button><button class="mini-btn del" data-delos="${x.id}" data-no="${esc(x.order_no)}">Remover</button></td></tr>`).join(''))}</div>`;
  $('addOS').onclick=()=>{
    const serviceOpts=servicesList.map(x=>`<option value="${x.id}" data-type="${esc(x.service_type)}" data-price="${x.price}">${esc(x.name)} (${esc(x.service_type)}) — ${money(x.price)}</option>`).join('');
    const clientList=`<datalist id="clientList">${clientsList.map(x=>`<option value="${esc(x.name)}">`).join('')}</datalist>`;
    openModal('Nova ordem de serviço',`<div class="field-grid">
      <div class="field"><label>Número da OS (automático)</label><input id="osNo" readonly value="${nextNo}"></div>
      <div class="field"><label>Telefone do cliente</label><input name="client_phone" type="tel" required placeholder="9xx xxx xxx"></div>
      <div class="field fullwidth"><label>Nome do cliente</label><input name="client_name" list="clientList" required autocomplete="off" placeholder="Escreva o nome do cliente">${clientList}</div>
      ${field('service_id','Serviço','select',true,serviceOpts)}
      <div class="field"><label>Tipo de serviço</label><input id="osType" readonly></div>
      <div class="field" id="originField" style="display:none"><label>Origem do visor</label><select name="visor_origin"><option>Por Encomenda</option><option>No Estoque</option></select></div>
      ${field('amount','Valor cobrado (Kz)','number')}${field('device','Aparelho / modelo','text',false)}${field('problem','Defeito / reparação','textarea',false)}</div>`,
    async fd=>{
      const name=val(fd,'client_name'),phone=val(fd,'client_phone');
      const sv=servicesList.find(x=>x.id===val(fd,'service_id'));
      if(!sv)throw Error('Cadastre primeiro um serviço na página Serviços.');
      const norm=v=>(v||'').replace(/\s+/g,'').toLowerCase();
      let cl=clientsList.find(x=>norm(x.name)===norm(name)&&norm(x.phone)===norm(phone));
      if(!cl){const {data:nc,error:ce0}=await sb.from('clients').insert({name,phone,created_by:session.user.id}).select().single();if(ce0)throw ce0;cl=nc;clientsList.push(cl);await logAction('Cadastrou cliente (pela ordem)',name)}
      const type=sv.service_type,origin=type==='Troca de Visor'?val(fd,'visor_origin'):null,amount=Number(val(fd,'amount'));
      let data=null,error=null;
      for(let i=0;i<5;i++){
        const nos=await latestOrderNos();
        ({data,error}=await sb.from('service_orders').insert({order_no:nextOrderNo(nos),client_id:cl.id,client_name:cl.name,service_id:sv.id,service_name:sv.name,service_type:type,visor_origin:origin,amount,device:val(fd,'device'),problem:val(fd,'problem'),status:'Em andamento',created_by:session.user.id}).select().single());
        if(!error)break;if(!/duplicate key/i.test(error.message||''))break;
      }
      if(error)throw error;
      const category=type==='Serviço Normal'?'service_normal':origin==='No Estoque'?'visor_stock':'visor_order';
      const {error:ce}=await sb.from('cash_movements').insert({order_id:data.id,category,description:`${data.order_no} — ${sv.name}`,amount,direction:'entrada',created_by:session.user.id});if(ce)throw ce;
      await logAction('Criou ordem de serviço',data.order_no);toast(`Ordem ${data.order_no} criada e caixa atualizado.`);showPage('orders');
    });
    const nameIn=$('modalBody').querySelector('[name=client_name]'),phoneIn=$('modalBody').querySelector('[name=client_phone]');
    nameIn.oninput=()=>{const c=clientsList.find(x=>x.name.trim().toLowerCase()===nameIn.value.trim().toLowerCase());if(c&&!phoneIn.value)phoneIn.value=c.phone||''};
    const svc=$('modalBody').querySelector('[name=service_id]');
    const sync=()=>{const opt=svc.selectedOptions[0],type=opt?.dataset.type||'';$('osType').value=type;$('originField').style.display=type==='Troca de Visor'?'block':'none';const price=opt?.dataset.price;if(price)$('modalBody').querySelector('[name=amount]').value=price};
    svc.onchange=sync;sync();
  };
  document.querySelectorAll('[data-pdf]').forEach(b=>b.onclick=async()=>{const o=os.find(x=>x.id===b.dataset.pdf);const c=clientsList.find(x=>x.id===o.client_id);b.disabled=true;const old=b.textContent;b.textContent='A gerar…';try{await orderPdf(o,c?.phone)}catch(e){toast(friendly(e))}finally{b.disabled=false;b.textContent=old}});
  document.querySelectorAll('[data-status]').forEach(b=>b.onclick=()=>openModal('Atualizar estado',field('status','Estado','select',true,'<option>Em andamento</option><option>Aguardando peça</option><option>Concluída</option><option>Entregue</option><option>Cancelada</option>'),async fd=>{const {error}=await sb.from('service_orders').update({status:val(fd,'status')}).eq('id',b.dataset.status);if(error)throw error;await logAction('Alterou estado da OS',b.dataset.status);toast('Estado atualizado.');showPage('orders')}));
  bindDelOs();
}
async function cash(){
  const t=new Date(),dayS=startOfDay(t),mv=await fetchRange('cash_movements',dayS,addDays(dayS,1));
  $('content').innerHTML=pageHead('Caixa de hoje',t.toLocaleDateString('pt-AO',{dateStyle:'full'})+' — recomeça a zero todos os dias.',`<button class="secondary" id="goFin">Histórico de finanças</button><button class="primary" id="addMovement">＋ Registar movimento</button>`)+
  `<div class="panel">${summaryBoxes(mv)}</div><div class="panel"><h3>Movimentos de hoje</h3>${table(['Hora','Descrição','Categoria','Tipo','Valor','Ações'],mvRows(mv))}</div>`;
  $('addMovement').onclick=movementModal;$('goFin').onclick=()=>showPage('finance');bindDelMv();
}
let fin={kind:'day',v:null,from:null,to:null};
async function finance(){
  if(!fin.v)fin.v=isoToday();
  if(!fin.from)fin.from=ymd(addDays(new Date(),-6));if(!fin.to)fin.to=isoToday();
  const k=fin.kind,vd=parseYmd(fin.v);let r;
  if(k==='day')r={start:vd,end:addDays(vd,1),label:vd.toLocaleDateString('pt-AO',{dateStyle:'full'})};
  else if(k==='week'){const m=mondayOf(vd);r={start:m,end:addDays(m,7),label:'Semana de '+brDate(m)+' a '+brDate(addDays(m,6))}}
  else if(k==='month'){const m=new Date(vd.getFullYear(),vd.getMonth(),1);r={start:m,end:new Date(vd.getFullYear(),vd.getMonth()+1,1),label:m.toLocaleDateString('pt-AO',{month:'long',year:'numeric'})}}
  else if(k==='year'){r={start:new Date(vd.getFullYear(),0,1),end:new Date(vd.getFullYear()+1,0,1),label:'Ano '+vd.getFullYear()}}
  else if(k==='range'){let f=parseYmd(fin.from),t2=parseYmd(fin.to);if(f>t2)[f,t2]=[t2,f];r={start:f,end:addDays(t2,1),label:brDate(f)+' a '+brDate(t2)}}
  else r={start:new Date(2000,0,1),end:new Date(2100,0,1),label:'Todo o período'};
  const [mv,os]=await Promise.all([fetchRange('cash_movements',r.start,r.end),fetchRange('service_orders',r.start,r.end)]);
  const s=sums(mv);let tin=0,tout=0;CATS.forEach(([c])=>{tin+=s[c].in;tout+=s[c].out});
  const days={};mv.forEach(x=>{const d=ymd(new Date(x.created_at));const o=days[d]||(days[d]={in:0,out:0,n:0,cat:{service_normal:0,visor_stock:0,visor_order:0}});const a=Number(x.amount)*(x.direction==='saida'?-1:1);if(x.direction==='saida')o.out+=Number(x.amount);else o.in+=Number(x.amount);o.cat[x.category]=(o.cat[x.category]||0)+a;o.n++});
  const dayKeys=Object.keys(days).sort().reverse();
  let best=null;dayKeys.forEach(d=>{const sd=days[d].in-days[d].out;if(!best||sd>best.v)best={d,v:sd}});
  const avg=dayKeys.length?(tin-tout)/dayKeys.length:0;
  const byStatus={};os.forEach(o=>byStatus[o.status]=(byStatus[o.status]||0)+1);
  const svc={};os.forEach(o=>{const e=svc[o.service_name]||(svc[o.service_name]={n:0,v:0});e.n++;e.v+=Number(o.amount)});
  const svcRows=Object.entries(svc).sort((a,b)=>b[1].v-a[1].v).slice(0,10).map(([n,e])=>`<tr><td>${esc(n)}</td><td>${e.n}</td><td>${money(e.v)}</td></tr>`).join('');
  const kinds=[['day','Dia'],['week','Semana'],['month','Mês'],['year','Ano'],['range','Intervalo'],['all','Tudo']];
  const input=k==='day'||k==='week'?`<input type="date" id="fv" value="${fin.v}">`:k==='month'?`<input type="month" id="fv" value="${fin.v.slice(0,7)}">`:k==='year'?`<input type="number" id="fv" min="2000" max="2100" value="${fin.v.slice(0,4)}">`:k==='range'?`<input type="date" id="ffrom" value="${fin.from}"><input type="date" id="fto" value="${fin.to}">`:'';
  $('content').innerHTML=pageHead('Histórico de finanças','Escolha o período e consulte o balanço organizado.',`<button class="secondary" id="fcsv">⬇ Exportar CSV</button><button class="mini-btn del" id="fdel" style="padding:11px 14px;font-size:13px">🗑 Eliminar histórico</button>`)+
  `<div class="panel"><div class="chips">${[['today','Hoje'],['yest','Ontem'],['week','Esta semana'],['month','Este mês'],['year','Este ano'],['all','Tudo']].map(([c,l])=>`<button class="chip" data-quick="${c}">${l}</button>`).join('')}</div>
  <div class="toolbar"><select id="fk">${kinds.map(([v,l])=>`<option value="${v}" ${v===k?'selected':''}>${l}</option>`).join('')}</select>${input}<button class="primary" id="fgo">Ver</button></div></div>
  <div class="panel"><h3>Balanço — ${r.label}</h3>${summaryBoxes(mv)}</div>
  <div class="stats"><div class="stat"><div class="label">Ordens no período</div><strong>${os.length}</strong><small>${Object.entries(byStatus).map(([a,b])=>a+': '+b).join(' · ')||'—'}</small></div>${stat('Entradas',money(tin),'Total recebido')}${stat('Saídas',money(tout),'Total gasto')}${stat('Média por dia com movimento',money(avg),best?'Melhor dia: '+fmtDate(best.d)+' ('+money(best.v)+')':'—')}</div>
  <div class="panel"><h3>Balanço por dia</h3>${table(['Dia','Serv. Normais','Visores Estoque','Visores Encomenda','Entradas','Saídas','Saldo'],dayKeys.map(d=>{const o=days[d];return `<tr><td><b>${fmtDate(d)}</b></td><td>${money(o.cat.service_normal)}</td><td>${money(o.cat.visor_stock)}</td><td>${money(o.cat.visor_order)}</td><td>${money(o.in)}</td><td>${money(o.out)}</td><td><b>${money(o.in-o.out)}</b></td></tr>`}).join(''))}</div>
  <div class="split"><div class="panel"><h3>Serviços mais rentáveis</h3>${table(['Serviço','Qtd.','Total'],svcRows)}</div><div class="panel"><h3>Movimentos (${mv.length})</h3><div style="max-height:420px;overflow:auto">${table(['Data','Descrição','Categoria','Tipo','Valor','Ações'],mvRows(mv))}</div>${mv.length>400?'<p class="tiny muted">A mostrar os 400 mais recentes; o balanço acima inclui todos.</p>':''}</div></div>`;
  const go=()=>{const v=$('fv');if(k==='day'||k==='week'){if(v.value)fin.v=v.value}else if(k==='month'){if(v.value)fin.v=v.value+'-01'}else if(k==='year'){if(v.value)fin.v=String(v.value).padStart(4,'0')+'-01-01'}else if(k==='range'){if($('ffrom').value)fin.from=$('ffrom').value;if($('fto').value)fin.to=$('fto').value}showPage('finance')};
  $('fk').onchange=()=>{fin.kind=$('fk').value;showPage('finance')};$('fgo').onclick=go;
  document.querySelectorAll('[data-quick]').forEach(b=>b.onclick=()=>{const q=b.dataset.quick,t=new Date();if(q==='today'){fin.kind='day';fin.v=ymd(t)}else if(q==='yest'){fin.kind='day';fin.v=ymd(addDays(t,-1))}else if(q==='week'){fin.kind='week';fin.v=ymd(t)}else if(q==='month'){fin.kind='month';fin.v=ymd(t)}else if(q==='year'){fin.kind='year';fin.v=ymd(t)}else fin.kind='all';showPage('finance')});
  $('fcsv').onclick=()=>{const q=v=>'"'+String(v??'').replace(/"/g,'""')+'"';const lines=[['Data','Hora','Descrição','Categoria','Tipo','Valor (Kz)'].map(q).join(';')].concat(mv.slice().reverse().map(x=>{const d=new Date(x.created_at);return [d.toLocaleDateString('pt-AO'),d.toLocaleTimeString('pt-AO'),x.description,CATNAME[x.category]||x.category,x.direction,x.amount].map(q).join(';')}));const blob=new Blob(['﻿'+lines.join('\r\n')],{type:'text/csv;charset=utf-8'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='financas_'+r.label.replace(/[^\w]+/g,'_')+'.csv';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),2000)};
  $('fdel').onclick=async()=>{if(!mv.length){toast('Não há movimentos neste período.');return}if(!await askCode(`Eliminar TODOS os ${mv.length} movimentos de «${r.label}»? Introduza o código de autorização.`))return;const {error}=await sb.from('cash_movements').delete().gte('created_at',r.start.toISOString()).lt('created_at',r.end.toISOString());if(error){toast(friendly(error));return}await logAction('Eliminou histórico de finanças',r.label+' ('+mv.length+' movimentos)');toast('Histórico eliminado.');showPage('finance')};
  bindDelMv();
}
async function history(){const data=await rows('activity_logs');$('content').innerHTML=pageHead('Histórico de ações','Registo de operações efetuadas pelos utilizadores.')+`<div class="panel">${table(['Data','Utilizador','Ação','Detalhes'],data.map(x=>`<tr><td>${new Date(x.created_at).toLocaleString('pt-AO')}</td><td>${esc(x.actor||'—')}</td><td>${esc(x.action)}</td><td>${esc(x.details||'')}</td></tr>`).join(''))}</div>`}
function bindDelete(root,tableName,label){document.querySelectorAll(`#${root} [data-del]`).forEach(b=>{if(b.dataset.bound)return;b.dataset.bound='1';b.onclick=async()=>{if(!confirm(`Remover este ${label}? Esta operação não pode ser desfeita.`))return;const targetTable=b.dataset.table||tableName;const {error}=await sb.from(targetTable).delete().eq('id',b.dataset.del);if(error){toast(friendly(error));return}await logAction('Removeu '+label,b.dataset.del);toast('Registo removido.');showPage(currentPage)}})}
$('modalClose').onclick=$('modalCancel').onclick=()=>$('modal').close();
$('modalForm').addEventListener('submit',e=>e.preventDefault());
let _day=isoToday();setInterval(()=>{if(!session||$('modal').open)return;if(_day!==isoToday()){_day=isoToday();$('todayLabel').textContent=new Date().toLocaleDateString('pt-AO',{dateStyle:'full'});if(['dashboard','cash'].includes(currentPage))showPage(currentPage)}},30000);
boot();

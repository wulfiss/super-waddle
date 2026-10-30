<script lang="ts">
 import { onMount } from 'svelte';
 import { supabase } from '../lib/supabase.ts';
 import { demoProducts, today, validate, type Product, type Item, type Production } from '../lib/production.ts';
 import { canAccess, homeScreen, isRole, roleLabels, screenLabels, screensFor, type Role, type Screen } from '../lib/access.ts';
 import { defaultPreviewAccount, findPreviewAccount, previewHistory, type PreviewAccount } from '../lib/preview-accounts.ts';
 import PreviewAccounts from '../lib/PreviewAccounts.svelte';
 import ScreenTabs from '../lib/ScreenTabs.svelte';
 import WarehouseScreen from '../lib/WarehouseScreen.svelte';
 import AdminScreen from '../lib/AdminScreen.svelte';
 import BakeryHistory from '../lib/BakeryHistory.svelte';
 import { changePreviewOrder, workspaceKey, type AuditEntry, type PreviewWorkspace } from '../lib/order-history.ts';
 let role = $state<Role | null>(supabase ? null : 'bakery');
 let previewAccount = $state<PreviewAccount>(defaultPreviewAccount);
 let screen = $state<Screen>('bakery');
 let loading = $state(!!supabase);
 let userId: string | null = null;
 let loadVersion = 0;
 let availableScreens = $derived(screensFor(role));
 let tab = $state('Nuevo pedido');
 let reviewDialog = $state<HTMLDialogElement>();
 let removeDialog = $state<HTMLDialogElement>();
 let editing = $state<Production | null>(null);
 let title = $derived(!role ? 'Mi espacio de trabajo' : screen === 'bakery' ? editing && tab==='Nuevo pedido' ? 'Editar pedido' : tab : screenLabels[screen]);
 let removing = $state<Production | null>(null);
 let audit = $state<AuditEntry[]>([]);
 let products = $state<Product[]>([]), items = $state<Item[]>([]), history = $state<Production[]>([]);
 let visibleHistory = $derived(supabase ? history : previewHistory(history, previewAccount));
 let date = $state(today()), responsible = $state(''), search = $state('');
 let message = $state(''), error = $state(''), busy = $state(false), ready = $state(false), email = $state(''), user = $state<string | null>(null);
 let filtered = $derived(products.filter(p=>p.name.toLocaleLowerCase('es-AR').includes(search.toLocaleLowerCase('es-AR')) && !items.some(i=>i.product_id===p.id)));
 async function load() {
  if (!supabase) return;
  const version = ++loadVersion;
  loading = true;
  error = '';
  const previousRole = role;
  role = null;
  products = []; history = []; audit=[];
  try {
   const {data:{session}, error:sessionError} = await supabase.auth.getSession();
   if(version !== loadVersion) return;
   if(sessionError) throw sessionError;
   user = session?.user.email ?? session?.user.id ?? null;
   const identityChanged = userId !== (session?.user.id ?? null);
   if(identityChanged) {items=[];editing=null;removing=null;responsible='';search='';tab='Nuevo pedido';reviewDialog?.close();removeDialog?.close();}
   userId = session?.user.id ?? null;
   if(!session) return;
   const assigned = await supabase.from('user_roles').select('role').eq('user_id',session.user.id).maybeSingle();
   if(version !== loadVersion) return;
   if(assigned.error) throw assigned.error;
   if(!isRole(assigned.data?.role)) return;
   const assignedRole = assigned.data.role;
   const [catalog, records] = await Promise.all([supabase.from('products').select('*').order('name'),supabase.from('productions').select('*, production_items(*)').order('created_at',{ascending:false})]);
   if(version !== loadVersion) return;
   if(catalog.error || records.error) throw catalog.error ?? records.error;
   let auditEntries:AuditEntry[]=[];
   if(assignedRole==='admin') {
    const events=await supabase.from('production_audit').select('*').order('occurred_at',{ascending:false});
    if(version !== loadVersion) return;
    if(events.error) throw events.error;
    auditEntries=(events.data ?? []) as AuditEntry[];
   }
   role = assignedRole;audit=auditEntries;
   if(identityChanged || previousRole !== role || !canAccess(role,screen)) screen = homeScreen(role);
   products=catalog.data ?? []; history=(records.data ?? []).map(r=>({id:r.id,user_id:r.user_id,date:r.date,responsible:r.responsible,status:r.status,revision:r.revision,registered_revision:r.registered_revision,items:r.production_items}));
  } catch {if(version === loadVersion) error='No pudimos verificar tus permisos o cargar los datos. Intentá actualizar nuevamente.';}
  finally {if(version === loadVersion) loading=false;}
 }
 function openScreen(next: Screen) {
  if(busy || !canAccess(role,next)) return;
  screen=next;error='';message='';reviewDialog?.close();
  if(supabase && next!=='bakery') void load();
 }
 function readWorkspace():PreviewWorkspace {
  const stored=localStorage.getItem(workspaceKey);
  const workspace=stored ? JSON.parse(stored) : {orders:JSON.parse(localStorage.getItem('producciones-demo-v1') ?? '[]'),audit:[]};
  if(!Array.isArray(workspace.orders) || !Array.isArray(workspace.audit)) throw new Error('Invalid local workspace');
  workspace.orders=workspace.orders.map((order:Production)=>({...order,items:order.items.map(item=>({...item,code:item.code ?? demoProducts.find(product=>product.id===item.product_id)?.code}))}));
  return workspace;
 }
 function refreshPreview() {
  try {const workspace=readWorkspace();history=workspace.orders;audit=workspace.audit;}
  catch {error='No pudimos recuperar los pedidos de prueba.';}
 }
 async function commitPreview(change:Parameters<typeof changePreviewOrder>[2]) {
  const actor=structuredClone($state.snapshot(previewAccount));
  const commit=()=>{
   const workspace=changePreviewOrder(readWorkspace(),actor,change);
   localStorage.setItem(workspaceKey,JSON.stringify(workspace));
   history=workspace.orders;audit=workspace.audit;
  };
  if(navigator.locks) await navigator.locks.request('obrador-preview-orders',commit);
  else commit();
 }
 async function registerOrder(record:Production,registered:boolean) {
  if(!registered || busy || (role!=='warehouse' && role!=='admin'))return;
  busy=true;error='';
  try {
   if(supabase){const {error:failure}=await supabase.rpc('set_production_registered',{p_id:record.id,p_expected_revision:record.revision ?? 1,p_registered:registered});if(failure)throw failure;await load();}
   else await commitPreview({action:registered?'registered':'unregistered',id:record.id,revision:record.revision ?? 1});
  }catch(failure){error=changeError(failure);}finally{busy=false;}
 }
 function clearDraft() {editing=null;items=[];date=today();responsible=supabase?'':previewAccount.name;search='';}
 function startEdit(record:Production) {
  if(busy || !canAccess(role,'bakery')) return;
  editing=structuredClone($state.snapshot(record));date=record.date;responsible=record.responsible;
  items=structuredClone($state.snapshot(record.items));search='';tab='Nuevo pedido';error='';message='';
  window.scrollTo({top:0,behavior:'smooth'});
 }
 function cancelEdit(){clearDraft();tab='Historial';error='';message='';}
 function selectBakeryTab(option:string) {
  if(busy)return;
  if(editing)clearDraft();
  tab=option;error='';message='';
  if(option==='Historial'){if(supabase)void load();else refreshPreview();}
 }
 function requestRemoval(record:Production) {
  if(busy || !canAccess(role,'bakery')) return;
  removing=structuredClone($state.snapshot(record));error='';message='';removeDialog?.showModal();
 }
 async function removeOrder() {
  if(busy || !removing || !canAccess(role,'bakery')) return;
  busy=true;error='';message='';
  try {
   if(supabase) {
    const {error:failure}=await supabase.rpc('cancel_production',{p_id:removing.id,p_expected_revision:removing.revision ?? 1});
    if(failure)throw failure;
    await load();
   } else await commitPreview({action:'cancelled',id:removing.id,revision:removing.revision ?? 1});
   message='Pedido eliminado. Ya no aparece en depósito.';
  } catch(failure) {error=changeError(failure);}
  finally {busy=false;removeDialog?.close();removing=null;}
 }
 function changeError(failure:unknown) {
  const detail=failure && typeof failure==='object' && 'message' in failure ? String(failure.message) : '';
  return detail.includes('revision') || detail.includes('unavailable')
   ? 'El pedido cambió o ya fue eliminado. Actualizá el historial y volvé a abrirlo.'
   : 'No se pudo guardar el cambio. El pedido conserva sus datos; intentá nuevamente.';
 }
 function changePreviewAccount(value: string) {
  const account = findPreviewAccount(value);
  if(busy || supabase || !account) return;
  previewAccount=account;role=account.role;screen=homeScreen(role);tab='Nuevo pedido';clearDraft();removing=null;error='';message='';reviewDialog?.close();removeDialog?.close();refreshPreview();
  try {localStorage.setItem('obrador-preview-account',account.id);}
  catch {error='No pudimos recordar la cuenta seleccionada en este navegador.';}
 }
 async function logout() {
  if(!supabase) return;
  busy=true;error='';
  const {error:failure}=await supabase.auth.signOut();
  busy=false;
  if(failure){error='No pudimos cerrar la sesión. Intentá nuevamente.';return;}
  ++loadVersion;userId=null;user=null;role=null;products=[];history=[];audit=[];items=[];editing=null;removing=null;responsible='';search='';message='';loading=false;reviewDialog?.close();removeDialog?.close();
 }
 onMount(()=>{
  ready=true;
  if (!supabase) {
   products=demoProducts;
   try {changePreviewAccount(findPreviewAccount(localStorage.getItem('obrador-preview-account'))?.id ?? defaultPreviewAccount.id);}
   catch {error='No pudimos recuperar el historial local.';}
   const sync=(event:StorageEvent)=>{if(event.key===workspaceKey || event.key==='producciones-demo-v1' || event.key===null)refreshPreview();};
   window.addEventListener('storage',sync);
   return ()=>window.removeEventListener('storage',sync);
  } else { void load(); const {data:{subscription}}=supabase.auth.onAuthStateChange((_event,session)=>{
   if(session?.user.id !== userId){++loadVersion;role=null;history=[];audit=[];products=[];items=[];editing=null;removing=null;responsible='';user=null;loading=true;reviewDialog?.close();removeDialog?.close();}
   setTimeout(()=>void load(),0);
  }); return ()=>{++loadVersion;subscription.unsubscribe();}; }
 });
 function add(p:Product) { items=[...items,{product_id:p.id,name:p.name,unit:p.unit,code:p.code,quantity:1}]; search=''; message=''; }
 function review(event:SubmitEvent) {
  event.preventDefault(); if(busy)return;
  if(!canAccess(role,'bakery')){error='No tenés permiso para crear pedidos.';return;}
  error=validate(date,responsible,items); message='';
  if(!error) reviewDialog?.showModal();
 }
 async function save() {
  if(busy)return;
  if(!canAccess(role,'bakery')){reviewDialog?.close();error='No tenés permiso para crear pedidos.';return;}
  error=validate(date,responsible,items); message='';
  if(error){reviewDialog?.close();return;}
  busy=true;
  const wasEditing=!!editing;
  try {
   if(supabase) {
    const args={p_date:date,p_responsible:responsible.trim(),p_items:items.map(i=>({product_id:i.product_id,quantity:i.quantity}))};
    const {error:failure}=editing ? await supabase.rpc('edit_production',{...args,p_id:editing.id,p_expected_revision:editing.revision ?? 1}) : await supabase.rpc('save_production',args);
    if(failure) throw failure;
    await load();
   } else {
    const draft={date,responsible:responsible.trim(),items:structuredClone($state.snapshot(items))};
    await commitPreview(editing ? {action:'edited',id:editing.id,revision:editing.revision ?? 1,draft} : {action:'created',draft});
   }
   items=[];
   if(wasEditing){clearDraft();tab='Historial';message='Pedido actualizado. Los cambios ya se ven en depósito.';}
   else message=supabase?'Pedido guardado.':'Pedido guardado en este dispositivo.';
  } catch(failure) {error=wasEditing ? changeError(failure) : 'No se pudo guardar. Tus datos siguen en el formulario; intentá nuevamente.';}
  finally {busy=false;reviewDialog?.close();}
 }
 async function login() {
  if(!supabase)return; busy=true; error='';
  try {const {error:e}=await supabase.auth.signInWithOtp({email,options:{emailRedirectTo:window.location.origin}}); if(e)throw e; message='Revisá tu correo para ingresar.';}catch{error='No pudimos enviar el enlace de acceso. Revisá el correo e intentá de nuevo.';}finally{busy=false;}
 }
 function displayDate(d:string) {return new Intl.DateTimeFormat('es-AR',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(d+'T12:00:00Z'));}
</script>

<svelte:head><title>Obrador · Pedidos</title><meta name="description" content="Organizá y registrá los pedidos de tu equipo." /></svelte:head>
<div class="shell">
 <aside><a href="/" class="brand"><span class="logo">o.</span> obrador<span class="brand-dot">/</span></a><div class="workspace">ESPACIO DE TRABAJO<strong>{role ? roleLabels[role] : 'Acceso al equipo'}</strong></div>{#if role && screen==='bakery' && !loading}<nav aria-label="Navegación principal">{#each ['Nuevo pedido','Historial'] as option (option)}<button class:active={tab===option} disabled={busy||!ready} onclick={()=>selectBakeryTab(option)}><span aria-hidden="true"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">{#if option==='Historial'}<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>{:else}<path d="M12 5v14M5 12h14"/>{/if}</svg></span>{option}</button>{/each}</nav>{/if}<div class="aside-bottom"><span class="status-dot"></span> {supabase?'Supabase configurado':'Entorno de demostración'}<small>Hecho para tu día a día.</small></div></aside>
 <main><header><span>OBRADOR <span class="slash">/</span> {role ? screenLabels[screen] : 'Acceso'}</span><span class="workspace-label">{role ? roleLabels[role] : 'Mi espacio de trabajo'}</span></header><div class="content">
 <div class="eyebrow">ORGANIZÁ TU DÍA</div><div class="title-row"><div><h1>{title}</h1><p>{screen==='warehouse' && role ? 'Los pedidos de panadería, listos para consultar.' : screen==='admin' && role ? 'Un acceso para todo tu equipo.' : tab==='Historial'?'Consultá los pedidos que ya registraste.':editing?'Actualizá el pedido y revisá los cambios antes de guardar.':'Todo listo para crear un nuevo pedido.'}</p></div><span class="badge">{supabase?'Conectado a Supabase':'Modo demo'}</span></div>
 {#if !supabase}<PreviewAccounts selected={previewAccount.id} onchange={changePreviewAccount} disabled={busy||!ready}/>{/if}
 {#if error}<div class="alert error" role="alert">{error}</div>{/if}{#if message}<div class="alert success" role="status">{message}</div>{/if}
 {#if role && !loading}<ScreenTabs screens={availableScreens} selected={screen} onchange={openScreen}/>{/if}
 <div id="screen-panel" role={role && !loading ? 'tabpanel' : undefined} aria-labelledby={role && !loading ? 'tab-'+screen : undefined}>
 {#if loading}<section class="card" role="status">Verificando acceso…</section>
 {:else if supabase && !user}
 <section class="card"><h2>Ingresá a tu espacio</h2><p>Te enviamos un enlace de acceso a tu correo.</p><form onsubmit={(e)=>{e.preventDefault();void login();}}><label for="email">Correo electrónico</label><input id="email" type="email" bind:value={email} required placeholder="nombre@ejemplo.com"/><button class="primary" disabled={busy}>{busy?'Enviando…':'Enviar enlace de acceso'}</button></form></section>
 {:else if !role}<section class="card"><h2>Acceso pendiente</h2><p>Pedile al administrador que te asigne un perfil de panadería, depósito o administración.</p><button type="button" class="secondary" onclick={()=>void load()}>Actualizar acceso</button></section>
 {:else if screen==='warehouse' && canAccess(role,'warehouse')}<WarehouseScreen records={visibleHistory} busy={busy||loading} onregister={registerOrder} onrefresh={()=>{if(supabase)void load();else refreshPreview();}}/>
 {:else if screen==='admin' && canAccess(role,'admin')}<AdminScreen onopen={openScreen} {audit}/>
 {:else if screen==='bakery' && canAccess(role,'bakery') && tab==='Nuevo pedido'}
 <form onsubmit={review}><fieldset disabled={!ready||busy}>
 <section class="card"><div class="section-title"><span class="step">01</span><div><h2>Datos del pedido</h2><p>¿Cuándo y quién está a cargo?</p></div></div><div class="fields"><div><label for="date">Fecha del pedido</label><input id="date" type="date" bind:value={date} required /></div><div><label for="responsible">Responsable</label><input id="responsible" bind:value={responsible} maxlength="120" required placeholder="Nombre y apellido" autocomplete="name"/></div></div></section>
 <section class="card"><div class="section-title"><span class="step">02</span><div><h2>Productos del pedido</h2><p>Elegí los productos e indicá la cantidad de cada uno.</p></div><span class="count">{items.length} seleccionados</span></div>
 <label for="search">Buscar productos</label><div class="search"><span aria-hidden="true">⌕</span><input id="search" type="search" bind:value={search} placeholder="Buscá por nombre de producto…" autocomplete="off"/></div>
 <div class="catalog" aria-label="Productos disponibles">{#each filtered as product (product.id)}<button type="button" onclick={()=>add(product)}><span>{product.name}<small>{product.unit}</small></span><span class="add">＋</span></button>{:else}<p class="muted">{products.length?'No hay productos que coincidan o ya están seleccionados.':'Todavía no hay productos en el catálogo.'}</p>{/each}</div>
 {#if items.length}<div class="selected"><div class="selected-heading">PRODUCTO <span>CANTIDAD</span></div>{#each items as item (item.product_id)}<div class="item"><div><strong>{item.name}</strong><small>{item.unit}</small></div><label class="sr-only" for={'q-'+item.product_id}>Cantidad de {item.name}</label><input id={'q-'+item.product_id} aria-label={'Cantidad de '+item.name} type="number" min="0.001" step="any" required bind:value={item.quantity}/><button class="remove" type="button" aria-label={'Quitar '+item.name} onclick={()=>items=items.filter(i=>i.product_id!==item.product_id)}>×</button></div>{/each}</div>{:else}<div class="empty"><span>＋</span><strong>Tu próximo pedido empieza acá</strong><p>Agregá productos desde la lista de arriba.</p></div>{/if}
 </section><div class="form-footer"><span>{items.length} {items.length===1?'producto seleccionado':'productos seleccionados'}</span><div class="form-actions">{#if editing}<button type="button" class="secondary" disabled={busy} onclick={cancelEdit}>Cancelar edición</button>{/if}<button class="primary" disabled={busy||!ready}>{busy?'Guardando…':editing?'Guardar cambios':'Guardar pedido'} <span>→</span></button></div></div></fieldset></form>
 {:else if screen==='bakery' && canAccess(role,'bakery')}<BakeryHistory records={visibleHistory} {busy} onedit={startEdit} onremove={requestRemoval} oncreate={()=>selectBakeryTab('Nuevo pedido')}/>{/if}
 </div>
 {#if user}<button class="signout" disabled={busy} onclick={()=>void logout()} >Cerrar sesión · {user}</button>{/if}
 <footer>OBRADOR <span>Menos planillas. Más pedidos.</span></footer>
 </div></main>
</div>

<dialog bind:this={reviewDialog} aria-labelledby="review-title" aria-describedby="review-description" oncancel={(event)=>{if(busy)event.preventDefault();}}>
 <h2 id="review-title">{editing?'Revisá los cambios':'Revisá tu pedido'}</h2>
 <p id="review-description">{editing?'Los cambios se reflejarán en el pedido de depósito. Confirmá los datos antes de guardar.':'¿Está todo bien? Confirmá los datos antes de guardar.'}</p>
 <dl class="review-details"><div><dt>Fecha del pedido</dt><dd>{date && !Number.isNaN(Date.parse(date)) ? displayDate(date) : 'Sin fecha'}</dd></div><div><dt>Responsable</dt><dd>{responsible.trim()}</dd></div></dl>
 <div class="review-products">{#each items as item (item.product_id)}<div class="history-item"><span>{item.name}</span><strong>{new Intl.NumberFormat('es-AR').format(item.quantity)} {item.unit}</strong></div>{/each}</div>
 <div class="review-actions"><button type="button" class="secondary" disabled={busy} onclick={()=>reviewDialog?.close()}>Volver a editar</button><button type="button" class="primary" disabled={busy} onclick={save}>{busy?'Guardando…':editing?'Sí, guardar cambios':'Sí, guardar pedido'}</button></div>
</dialog>

<dialog bind:this={removeDialog} aria-labelledby="remove-title" aria-describedby="remove-description" oncancel={(event)=>{if(busy)event.preventDefault();}}>
 <h2 id="remove-title">¿Eliminar este pedido?</h2>
 <p id="remove-description">El pedido dejará de aparecer en panadería y depósito. El administrador conservará el detalle y el registro de esta eliminación.</p>
 {#if removing}<p><strong>Pedido #{removing.id.slice(0,8).toUpperCase()}</strong> · {displayDate(removing.date)}</p><p>Responsable: <strong>{removing.responsible}</strong></p>
  {#each removing.items as item (item.product_id)}<div class="history-item"><span>{item.name}</span><strong>{new Intl.NumberFormat('es-AR').format(item.quantity)} {item.unit}</strong></div>{/each}
 {/if}
 <div class="review-actions"><button type="button" class="secondary" disabled={busy} onclick={()=>{removeDialog?.close();removing=null;}}>Volver al historial</button><button type="button" class="primary danger" disabled={busy} onclick={removeOrder}>{busy?'Eliminando…':'Sí, eliminar pedido'}</button></div>
</dialog>

<style>
 fieldset{border:0;padding:0;margin:0;min-width:0}.form-footer{flex-wrap:wrap}.form-actions{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:10px;max-width:100%}.primary.danger{background:#973f34}.primary.danger:hover{background:#7c2f26}
 dialog{width:min(560px,calc(100% - 32px));max-height:calc(100dvh - 48px);overflow:auto;border:1px solid #dfe5e2;border-radius:14px;padding:26px;color:#202b3a;background:#fff;box-shadow:0 20px 80px #142d3440}dialog::backdrop{background:#142d3480}dialog h2{font-size:21px}dialog p{margin-top:10px}.review-details{display:grid;gap:16px;margin:24px 0}.review-details dt{font-size:12px;color:#718078}.review-details dd{margin:5px 0 0;font-weight:600;overflow-wrap:anywhere}.review-products .history-item span{overflow-wrap:anywhere;min-width:0}.review-products .history-item strong{flex-shrink:0}.review-actions{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:10px;margin-top:26px}.secondary{border:1px solid #dfe5e2;background:#fff;color:#46564d;border-radius:7px;padding:12px 17px;min-height:45px}
 :global(*){box-sizing:border-box} :global(body){margin:0;background:#f6f7f9;color:#202b3a;font-family:Inter,ui-sans-serif,system-ui,sans-serif;font-size:14px} :global(button),:global(input){font:inherit} :global(button){cursor:pointer} :global(button:disabled){opacity:.6;cursor:wait} :global(button:focus-visible),:global(a:focus-visible){outline:3px solid #a3c9ba;outline-offset:3px}.shell{display:flex;min-height:100vh}aside{width:246px;flex-shrink:0;background:#fff;border-right:1px solid #e5e8eb;padding:35px 24px;display:flex;flex-direction:column}.brand{display:flex;align-items:center;gap:9px;text-decoration:none;color:#203a31;font-size:29px;font-weight:750;letter-spacing:-1px}.logo{background:#245e48;color:white;border-radius:10px;width:39px;height:39px;text-align:center;line-height:36px}.brand-dot{color:#a4b6ad}.workspace{font-size:10px;letter-spacing:1.7px;color:#839088;margin:53px 10px 24px}.workspace strong{display:block;font-size:14px;letter-spacing:0;color:#34443e;margin-top:10px}nav{display:flex;flex-direction:column;gap:8px}nav button{display:flex;align-items:center;gap:12px;min-height:48px;width:100%;border:0;background:none;text-align:left;color:#718078;padding:13px;border-radius:8px;font-weight:550}nav button span{display:grid;place-items:center;flex:0 0 24px;width:24px;height:24px}nav button.active{background:#eaf2ed;color:#245e48}.aside-bottom{margin-top:auto;padding-top:70px;color:#748177;font-size:11px}.status-dot{display:inline-block;width:6px;height:6px;border-radius:50%;background:#5a9875;margin-right:6px}.aside-bottom small{display:block;margin-top:12px;color:#a0aaa5}main{flex:1;min-width:0}header{height:83px;border-bottom:1px solid #e4e7eb;display:flex;align-items:center;justify-content:space-between;padding:0 48px;background:#ffffffa8;font-size:11px;color:#7a858f;letter-spacing:.5px}.slash{margin:0 15px;color:#c2c8ce}.workspace-label{font-size:12px;letter-spacing:0}.content{max-width:970px;margin:auto;padding:43px 48px}.eyebrow{font-size:10px;letter-spacing:2px;color:#608776;font-weight:700}.title-row{display:flex;align-items:center;justify-content:space-between;gap:14px;margin:12px 0 26px}h1{font-size:32px;letter-spacing:-1.1px;margin:0 0 10px;font-weight:650}p{color:#81908e;line-height:1.6;margin:4px 0 0}.badge{border:1px solid #dbe6df;background:#f1f6f2;color:#547661;border-radius:20px;padding:6px 11px;font-size:10px;white-space:nowrap}.card{background:white;border:1px solid #e2e6e9;border-radius:12px;padding:27px;margin-bottom:20px;box-shadow:0 2px 3px #243c3010}.section-title{display:flex;align-items:center;gap:13px;margin-bottom:25px}.step{border:1px solid #e4eae6;background:#f5f7f5;border-radius:8px;font-size:11px;color:#5e7e6b;padding:9px}h2{font-size:16px;font-weight:650;margin:0}.section-title p{font-size:12px;margin-top:5px}.count{margin-left:auto;font-size:10px;color:#8c9691}.fields{display:grid;grid-template-columns:1fr 1fr;gap:24px}label{display:block;font-size:12px;font-weight:550;margin-bottom:9px;color:#56635e}input{width:100%;border:1px solid #dfe5e2;border-radius:7px;padding:12px;background:#fff;color:#283d32;min-height:45px}input:focus{outline:2px solid #9dc3b1;outline-offset:1px}input::placeholder{color:#a2aaa7}.search{position:relative}.search span{position:absolute;left:14px;top:6px;font-size:27px;color:#8c9a93}.search input{padding-left:42px;background:#fafbfafa}.catalog{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-top:15px;max-height:250px;overflow:auto;padding:2px}.catalog button{display:flex;align-items:center;justify-content:space-between;text-align:left;background:#fff;border:1px solid #e9edea;padding:12px 14px;border-radius:7px;color:#46564d;font-size:12px}.catalog button:hover{border-color:#8eaf9e;background:#f6faf7}small{display:block;font-size:10px;color:#94a198;margin-top:4px}.add{font-size:19px;color:#658a75}.empty{text-align:center;padding:37px 12px 14px;color:#88978e}.empty>span{display:block;margin:0 auto 13px;border:1px dashed #cdd8d0;border-radius:12px;width:43px;height:43px;line-height:39px;font-size:23px}.empty strong{display:block;font-size:12px;font-weight:550}.empty p{font-size:12px}.selected{margin-top:25px;border-top:1px solid #e7ece8}.selected-heading{display:flex;justify-content:space-between;padding:15px 40px 10px 0;font-size:9px;letter-spacing:1px;color:#96a29b}.item{display:flex;gap:12px;align-items:center;padding:13px 0;border-bottom:1px solid #edf0ed}.item>div{flex:1}.item strong{font-size:12px;font-weight:550}.item input{width:100px;min-height:38px;padding:8px}.remove{border:0;background:none;color:#9b7771;font-size:22px}.form-footer{display:flex;align-items:center;justify-content:space-between;font-size:11px;color:#8a958e;margin:25px 0}.primary{border:0;background:#285f49;color:white;padding:13px 21px;border-radius:7px;font-size:12px;font-weight:550;min-height:45px}.primary:hover{background:#194a36}.primary span{margin-left:25px;font-size:17px}footer{display:flex;justify-content:space-between;border-top:1px solid #e1e7e2;margin-top:42px;padding-top:20px;font-size:9px;letter-spacing:1.5px;color:#96a29b}footer span{letter-spacing:0}.alert{border-radius:8px;padding:14px;margin-bottom:20px;line-height:1.5}.error{color:#93382c;background:#fff0eb}.success{color:#286145;background:#e6f3e9}.history-item{display:flex;justify-content:space-between;gap:20px;border-top:1px solid #e8ece9;margin-top:12px;padding-top:12px;font-size:12px}.signout{border:0;background:none;color:#64796c;font-size:12px}.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)}.muted{font-size:12px}.card form .primary{margin-top:16px}
 @media(min-width:1300px){.content{padding-top:54px}}@media(max-width:850px){aside{width:200px;padding:28px 15px}.content{padding:30px 24px}header{padding:0 24px}.workspace-label{display:none}.count{display:none}}@media(max-width:620px){.shell{display:block}aside{width:100%;padding:16px 20px;border-right:0;border-bottom:1px solid #e3e8e4}.brand{font-size:24px}.logo{width:32px;height:32px;line-height:29px}.workspace,.aside-bottom{display:none}nav{flex-direction:row;margin-top:18px;gap:8px}nav button{flex:1;justify-content:center;gap:6px;min-height:44px;text-align:center;padding:9px;font-size:12px}header{height:49px;font-size:10px;padding:0 20px}.content{padding:26px 16px}.title-row{margin-bottom:20px}h1{font-size:26px}.title-row p{font-size:12px}.badge{font-size:9px;padding:5px 9px}.card{padding:20px 16px;border-radius:10px}.fields{grid-template-columns:1fr;gap:18px}.section-title{gap:10px}h2{font-size:14px}.section-title p{font-size:11px}.catalog{gap:7px}.catalog button{padding:10px;font-size:11px}.form-footer{position:sticky;bottom:0;background:#f6f7f9f5;padding:12px 0;margin:12px 0;gap:10px}.primary{padding:12px 17px}footer{margin-top:25px;font-size:8px}.history-item{font-size:11px}}
</style>

<script lang="ts">
 import {onMount,tick} from 'svelte';
 import {supabase} from './supabase.ts';
 import {roles,roleLabels,type Role} from './access.ts';
 import {changeUserSettings,initialUserSettings,userSettingsKey,type ManagedUser,type ManagementChange,type UserSettings} from './user-management.ts';
 let {actorId,onchanged}:{actorId:string;onchanged:()=>void}=$props();
 let settings=$state<UserSettings>({users:[],recipients:[]}),loading=$state(true),busy=$state(false),error=$state(''),message=$state('');
 let name=$state(''),email=$state(''),role=$state<Role>('bakery'),editing=$state<string|null>(null),search=$state('');
 let password=$state(''),editPassword=$state('');
 let editName=$state(''),editEmail=$state(''),editDialog=$state<HTMLDialogElement>();
 let recipientEmail=$state(''),recipientId=$state<string|undefined>();
 let selectedRoles=$state<Record<string,Role>>({});
 let removing=$state<{kind:'user'|'recipient';id:string;label:string}|null>(null),dialog=$state<HTMLDialogElement>();
 const filtered=$derived(settings.users.filter(user=>[user.name,user.email].some(value=>value.toLocaleLowerCase('es-AR').includes(search.toLocaleLowerCase('es-AR')))));
 async function request(body:object):Promise<UserSettings>{
  if(!supabase)throw new Error('No hay conexión.');
  const {data,error:failure}=await supabase.functions.invoke('admin-users',{body});
  if(failure){let detail='No se pudo completar la operación. Actualizá la lista e intentá nuevamente.';if(failure.context instanceof Response){try{detail=(await failure.context.json()).error??detail;}catch{/* Keep the fallback message. */}}throw new Error(detail);}
  if(!data?.users || !data?.recipients)throw new Error('No pudimos cargar los usuarios.');return data;
 }
 function readLocal():UserSettings{return JSON.parse(localStorage.getItem(userSettingsKey)??JSON.stringify(initialUserSettings));}
 async function load(){loading=true;error='';try{settings=supabase?await request({action:'list'}):readLocal();selectedRoles=Object.fromEntries(settings.users.map(user=>[user.id,user.role??'bakery']));}catch(failure){error=failure instanceof Error?failure.message:'No pudimos cargar los usuarios.';}finally{loading=false;}}
 onMount(()=>{void load();});
 async function change(change:ManagementChange):Promise<boolean>{
  if(busy||loading)return false;busy=true;error='';message='';
  try{
   if(supabase)settings=await request(change);
   else {
    const commit=()=>{const current=readLocal(),actor=current.users.find(user=>user.id===actorId);if(!actor)throw new Error('La cuenta ya no tiene acceso.');const next=changeUserSettings(current,actor,change,crypto.randomUUID());localStorage.setItem(userSettingsKey,JSON.stringify(next));settings=next;};
    if(navigator.locks)await navigator.locks.request(userSettingsKey,commit);else commit();
    onchanged();
   }
   selectedRoles=Object.fromEntries(settings.users.map(user=>[user.id,user.role??'bakery']));
   message='Cambios guardados.';return true;
  }catch(failure){error=failure instanceof Error?failure.message:'No se pudo guardar.';return false;}finally{busy=false;}
 }
 function resetUser(){name='';email='';role='bakery';password='';}
 async function editUser(user:ManagedUser){editing=user.id;editName=user.name;editEmail=user.email;editPassword='';message='';error='';await tick();editDialog?.showModal();}
 async function saveUser(event:SubmitEvent){event.preventDefault();if(await change({action:'create-user',name,email,role,password}))resetUser();}
 async function saveEdit(event:SubmitEvent){event.preventDefault();if(!editing)return;if(await change({action:'update-user',id:editing,name:editName,email:editEmail,...(editPassword?{password:editPassword}:{})}))editDialog?.close();}
 async function saveRecipient(event:SubmitEvent){event.preventDefault();if(await change({action:'save-recipient',id:recipientId,email:recipientEmail})){recipientId=undefined;recipientEmail='';}}
 async function remove(){if(!removing)return;const target=removing;if(await change(target.kind==='user'?{action:'remove-user',id:target.id}:{action:'remove-recipient',id:target.id})){if(editing===target.id)resetUser();if(recipientId===target.id){recipientId=undefined;recipientEmail='';}dialog?.close();removing=null;}else dialog?.close();}
</script>

<section aria-label="Administrar usuarios y notificaciones" aria-busy={loading||busy}>
 <div class="intro"><div><h2>Usuarios</h2><p>Administrá las cuentas del equipo y sus permisos.</p></div><button type="button" disabled={busy||loading} onclick={load}>Actualizar lista</button></div>
 {#if error && !editing}<p class="error feedback" role="alert">{error}</p>{/if}
 {#if message}<p class="success feedback" role="status">{message}</p>{/if}
 {#if loading}<p role="status">Cargando usuarios…</p>{:else}
 <div class="card"><h3>Agregar usuario</h3><p>Asigná el correo, la contraseña inicial y el rol para ingresar a la aplicación.</p>
 {#if !supabase}<p>En esta demostración las contraseñas no se guardan ni se usan para iniciar sesión.</p>{/if}
 <form aria-label="Agregar usuario" onsubmit={saveUser}><fieldset disabled={busy||!!error&&settings.users.length===0}><div class="fields">
  <div><label for="user-name">Nombre del usuario</label><input id="user-name" bind:value={name} required maxlength="120" autocomplete="off"/></div>
  <div><label for="user-email">Correo del usuario</label><input id="user-email" type="email" bind:value={email} required maxlength="254" autocomplete="off"/></div>
  <div><label for="user-password">Contraseña inicial</label><input id="user-password" type="password" bind:value={password} required minlength="8" maxlength="72" autocomplete="new-password" aria-describedby="user-password-hint"/><p id="user-password-hint">Mínimo 8 caracteres.</p></div>
  <div><label for="user-role">Rol del usuario</label><select id="user-role" bind:value={role}>{#each roles as option}<option value={option}>{roleLabels[option]}</option>{/each}</select></div>
 </div><div class="actions"><button class="primary" type="submit">{busy?'Guardando…':'Agregar usuario'}</button></div></fieldset></form></div>
 <div class="card"><h3>Equipo <span class="count">{settings.users.length}</span></h3><label for="users-search">Buscar por nombre o correo</label><input id="users-search" type="search" bind:value={search}/>
 <div class="list">{#each filtered as user (user.id)}<article aria-label={user.email}><div class="identity"><strong>{user.name||'Sin nombre'}{user.id===actorId?' · Tu cuenta':''}</strong><span>{user.email}</span>{#if !user.role}<small>Sin acceso asignado</small>{/if}</div>
 <div class="role-control"><label class="sr-only" for={'role-'+user.id}>Rol de {user.email}</label><select id={'role-'+user.id} bind:value={selectedRoles[user.id]} disabled={busy||user.id===actorId}>{#each roles as option}<option value={option}>{roleLabels[option]}</option>{/each}</select><button type="button" aria-label={'Guardar rol de '+user.email} disabled={busy||user.id===actorId||user.role===selectedRoles[user.id]} onclick={()=>change({action:'change-role',id:user.id,role:selectedRoles[user.id]})}>Guardar rol</button></div>
 <div class="actions"><button type="button" aria-label={'Editar usuario '+user.email} disabled={busy||user.id===actorId} onclick={()=>editUser(user)}>Editar</button><button type="button" class="danger" aria-label={'Eliminar usuario '+user.email} disabled={busy||user.id===actorId} onclick={()=>{removing={kind:'user',id:user.id,label:user.email};dialog?.showModal();}}>Eliminar</button></div>
 </article>{:else}<p>{settings.users.length?'No hay coincidencias.':'Todavía no hay usuarios.'}</p>{/each}</div>
 <p>No podés modificar tu propia cuenta desde esta sección. Los pedidos existentes se conservan al eliminar un usuario.</p></div>
 <div class="card"><h3>Correos para notificaciones</h3><p>Guardá uno o varios destinatarios para los nuevos pedidos. No necesitan una cuenta de usuario.</p><p class="notice">El envío automático de correos todavía no está activado.</p>
 <form onsubmit={saveRecipient}><fieldset disabled={busy}><label for="recipient-email">Correo para notificaciones</label><div class="recipient-form"><input id="recipient-email" type="email" bind:value={recipientEmail} required maxlength="254" placeholder="deposito@tuempresa.com"/><button class="primary" type="submit">{recipientId?'Guardar correo':'Agregar correo'}</button>{#if recipientId}<button type="button" onclick={()=>{recipientId=undefined;recipientEmail='';}}>Cancelar edición de correo</button>{/if}</div></fieldset></form>
 <div class="list">{#each settings.recipients as recipient (recipient.id)}<article aria-label={recipient.email}><strong class="identity">{recipient.email}</strong><div class="actions"><button type="button" disabled={busy} aria-label={'Editar correo '+recipient.email} onclick={()=>{recipientId=recipient.id;recipientEmail=recipient.email;}}>Editar</button><button type="button" class="danger" disabled={busy} aria-label={'Eliminar correo '+recipient.email} onclick={()=>{removing={kind:'recipient',id:recipient.id,label:recipient.email};dialog?.showModal();}}>Eliminar</button></div></article>{:else}<p>Todavía no agregaste correos para notificaciones.</p>{/each}</div>
 </div>{/if}
</section>
<dialog bind:this={editDialog} aria-labelledby="edit-user-title" aria-describedby="edit-user-description" oncancel={(event)=>{if(busy)event.preventDefault();}} onclose={()=>{editing=null;editName='';editEmail='';editPassword='';error='';}}>
 <h2 id="edit-user-title">Editar usuario</h2><p id="edit-user-description">Actualizá los datos de la cuenta y, si hace falta, asigná una nueva contraseña.</p>
 {#if editing}
 {#if error}<p class="error feedback" role="alert">{error}</p>{/if}
 <form onsubmit={saveEdit}><fieldset disabled={busy}><div class="fields">
  <div><label for="edit-user-name">Nombre del usuario</label><input id="edit-user-name" bind:value={editName} required maxlength="120" autocomplete="off"/></div>
  <div><label for="edit-user-email">Correo del usuario</label><input id="edit-user-email" type="email" bind:value={editEmail} required maxlength="254" autocomplete="off"/></div>
  <div><label for="edit-user-password">Nueva contraseña</label><input id="edit-user-password" type="password" bind:value={editPassword} minlength="8" maxlength="72" autocomplete="new-password" aria-describedby="edit-password-hint"/><p id="edit-password-hint">Dejá este campo vacío para conservar la contraseña actual. Para cambiarla, usá al menos 8 caracteres.</p></div>
 </div><div class="actions"><button type="button" onclick={()=>editDialog?.close()}>Cancelar edición</button><button type="submit" class="primary">{busy?'Guardando…':'Guardar usuario'}</button></div></fieldset></form>
 {/if}
</dialog>
<dialog bind:this={dialog} aria-labelledby="remove-user-title" oncancel={(event)=>{if(busy)event.preventDefault();}}><h2 id="remove-user-title">{removing?.kind==='user'?'¿Eliminar este usuario?':'¿Eliminar este correo?'}</h2><p><strong>{removing?.label}</strong></p><p>{removing?.kind==='user'?'Se quitará su acceso a la aplicación. Sus pedidos y el historial se conservan.':'Este correo se quitará de la lista de destinatarios.'}</p><div class="actions"><button type="button" disabled={busy} onclick={()=>dialog?.close()}>Cancelar</button><button type="button" class="danger" disabled={busy} onclick={remove}>{busy?'Eliminando…':'Sí, eliminar'}</button></div></dialog>
<style>
 .intro{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:20px}h2{font-size:20px;margin:0}h3{font-size:16px;margin:0}p{font-size:12px;color:#718078;line-height:1.7}.card{background:white;border:1px solid #e2e6e9;border-radius:12px;padding:25px;margin-bottom:20px}fieldset{border:0;padding:0;margin:0;min-width:0}.fields{display:grid;grid-template-columns:1fr 1fr;gap:16px}label{display:block;font-size:12px;color:#56635e;margin:16px 0 8px}input,select{font:inherit;font-size:12px;width:100%;min-height:44px;border:1px solid #dfe5e2;border-radius:7px;padding:10px;background:white;color:#283d32}input:focus,select:focus,button:focus-visible{outline:2px solid #9dc3b1;outline-offset:2px}.actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}button{font:inherit;font-size:12px;min-height:44px;border:1px solid #dfe5e2;border-radius:7px;background:white;color:#285f49;padding:10px 14px;cursor:pointer}button:disabled{opacity:.55;cursor:default}.primary{background:#285f49;color:white}.danger,.error{color:#973f34}.success{color:#285f49}.feedback{padding:12px 16px;border-radius:8px;background:#eff4ef}.error{background:#fff0eb}.notice{background:#f4f3e9;color:#746b38;padding:10px 12px;border-radius:7px}.list{margin-top:20px}article{border-top:1px solid #e7ece8;padding:16px 0;display:flex;align-items:center;gap:12px;flex-wrap:wrap;font-size:12px}.identity{flex:1;min-width:180px;overflow-wrap:anywhere}.identity span,.identity small{display:block;margin-top:5px;color:#718078}.role-control{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.role-control select{width:auto;max-width:100%}article .actions{margin:0}.count{font-size:11px;color:#718078;margin-left:8px}.recipient-form{display:flex;gap:10px;flex-wrap:wrap}.recipient-form input{flex:1;min-width:180px}dialog{width:min(500px,calc(100% - 32px));max-height:calc(100dvh - 32px);overflow:auto;border:1px solid #dfe5e2;border-radius:12px;padding:26px;color:#202b3a;overflow-wrap:anywhere}dialog::backdrop{background:#142d3480}.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)}
 @media(max-width:620px){.card{padding:20px 16px}.fields{grid-template-columns:1fr;gap:0}.intro{align-items:flex-start}.intro button{flex-shrink:0}.role-control{width:100%}.role-control select{flex:1;min-width:0}.identity{min-width:0;flex-basis:100%}.recipient-form input{min-width:0;flex-basis:100%}}
</style>

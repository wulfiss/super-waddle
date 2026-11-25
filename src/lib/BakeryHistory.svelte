<script lang="ts">
 import Button from '#lib/ui/Button.svelte';
 import ScreenTabs from './ScreenTabs.svelte';
 import HistorySearch from './HistorySearch.svelte';
 import BatchHistory from './BatchHistory.svelte';
 import type { Role } from './access.ts';
 import { matchesHistorySearch } from './history-search.ts';
 import { isRegistered } from './warehouse.ts';
 import type { Production } from './production.ts';
 let { records, role, actorId, busy, onedit, onremove, oncreate }: {
  records:Production[]; role:Role; actorId:string; busy:boolean; onedit:(record:Production)=>void;
  onremove:(record:Production)=>void; oncreate:()=>void;
 } = $props();
 const tabs = ['Pedidos','Elaboraciones'] as const;
 let selected = $state<typeof tabs[number]>('Pedidos');
 let searches = $state({Pedidos:'', Elaboraciones:''});
 let visibleOrders = $derived(records.filter(order => matchesHistorySearch(
  searches.Pedidos, 'Pedido #' + order.id, order.responsible
 )));
 function displayDate(value:string) {
  return new Intl.DateTimeFormat('es-AR',{dateStyle:'long',timeZone:'UTC'}).format(new Date(value+'T12:00:00Z'));
 }
</script>

<ScreenTabs screens={tabs} labels={{Pedidos:'Pedidos', Elaboraciones:'Elaboraciones'}} {selected}
 label="Historial" panel="bakery-history-panel" onchange={value => selected = value}/>
<div id="bakery-history-panel" role="tabpanel" aria-labelledby={'tab-' + selected}>
 {#if selected === 'Elaboraciones'}
  <BatchHistory {role} {actorId} bind:query={searches.Elaboraciones}/>
 {:else}
<section aria-label="Historial de pedidos">
 <HistorySearch label="Buscar por pedido o responsable" bind:value={searches.Pedidos}/>
 {#each visibleOrders as record (record.id)}
  <article><div class="heading"><h2>{displayDate(record.date)}</h2><span class="badge">{isRegistered(record) ? 'Registrado por depósito' : 'Pendiente de depósito'}</span></div>
   <p class="order-id">Pedido #{record.id.slice(0,8).toUpperCase()}{#if record.kind==='extra'} · <strong>Extra</strong>{/if}</p>
   <p>Responsable: <strong>{record.responsible}</strong></p>
   <ul>{#each record.items as item (item.product_id)}<li><span>{item.name}</span><strong>{new Intl.NumberFormat('es-AR').format(item.quantity)} {item.unit}</strong></li>{/each}</ul>
   {#if isRegistered(record)}<p>Depósito ya registró este pedido. No se puede editar ni eliminar.</p>{/if}
   <div class="actions"><Button type="button" disabled={busy || isRegistered(record)} onclick={()=>onedit(record)}>Editar pedido</Button><Button type="button" disabled={busy || isRegistered(record)} color="red" onclick={()=>onremove(record)}>Eliminar pedido</Button></div>
  </article>
 {:else}
  {#if records.length}<p class="empty" role="status">No hay pedidos que coincidan con la búsqueda.</p>
  {:else}<div class="empty"><h2>Todavía no hay pedidos</h2><p>Cuando guardes el primero, lo vas a encontrar acá.</p><Button type="button" onclick={oncreate}>Crear pedido</Button></div>{/if}
 {/each}
</section>
 {/if}
</div>

<style>
 article,.empty{background:white;border:1px solid #e2e6e9;border-radius:12px;padding:var(--panel-padding);margin-bottom:var(--section-gap)}
 .heading{display:flex;align-items:center;justify-content:space-between;gap:14px}
 h2{font-size:16px;margin:0}
 p{color:#718078;line-height:1.6;font-size:12px;margin:8px 0}
 .order-id{font-size:10px;letter-spacing:.6px}
 .badge{border:1px solid #dbe6df;background:#f1f6f2;color:#547661;border-radius:20px;padding:6px 11px;font-size:10px}
 ul{list-style:none;margin:16px 0 0;padding:0}
 li{display:flex;justify-content:space-between;gap:20px;border-top:1px solid #e8ece9;padding:13px 0;font-size:12px}
 li>span{overflow-wrap:anywhere;min-width:0}
 li>strong{flex-shrink:0}
 .actions{display:flex;flex-wrap:wrap;gap:10px;border-top:1px solid #e8ece9;padding-top:17px;margin-top:8px}
 .empty{text-align:center}
 @media(max-width:620px){
 article,.empty{padding:20px 16px}
 h2{font-size:14px}}
</style>

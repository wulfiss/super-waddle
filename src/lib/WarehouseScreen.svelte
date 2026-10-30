<script lang="ts">
 import type { Production } from './production.ts';
 let { records, busy, onrefresh }: { records: Production[]; busy: boolean; onrefresh: () => void } = $props();
 let date = $state('');
 let search = $state('');
 let filtered = $derived(records.filter(record => (!date || record.date === date) &&
  [record.responsible, ...record.items.map(item => item.name)].some(value =>
   value.toLocaleLowerCase('es-AR').includes(search.toLocaleLowerCase('es-AR')))));
 function displayDate(value: string) {
  return new Intl.DateTimeFormat('es-AR', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(value + 'T12:00:00Z'));
 }
</script>

<section aria-label="Pedidos recibidos">
 <div class="heading"><div><h2>Pedidos recibidos</h2><p>Consultá los productos y cantidades que solicita panadería.</p></div>
  <button type="button" disabled={busy} onclick={onrefresh}>{busy ? 'Actualizando…' : 'Actualizar'}</button></div>
 <div class="filters"><div><label for="warehouse-date">Fecha del pedido</label><input id="warehouse-date" type="date" bind:value={date}/></div>
  <div><label for="warehouse-search">Buscar pedidos</label><input id="warehouse-search" type="search" bind:value={search} placeholder="Responsable o producto"/></div></div>
 <p class="summary" role="status">{filtered.length} {filtered.length === 1 ? 'pedido' : 'pedidos'}</p>
 {#each filtered as record (record.id)}
  <article><div class="record-heading"><h3>{displayDate(record.date)}</h3><span>Recibido</span></div>
   <p>Responsable: <strong>{record.responsible}</strong></p>
   <ul>{#each record.items as item (item.product_id)}<li><span>{item.name}</span><strong>{new Intl.NumberFormat('es-AR').format(item.quantity)} {item.unit}</strong></li>{/each}</ul>
  </article>
 {:else}
  <div class="empty"><span aria-hidden="true">▤</span><h3>{records.length ? 'No hay coincidencias' : 'Todavía no hay pedidos recibidos'}</h3>
   <p>{records.length ? 'Probá otra fecha o búsqueda.' : 'Los pedidos que guarde panadería van a aparecer acá.'}</p></div>
 {/each}
</section>

<style>
 section{background:white;border:1px solid #e2e6e9;border-radius:12px;padding:27px;margin-bottom:20px}
 .heading,.record-heading{display:flex;align-items:center;justify-content:space-between;gap:14px}h2{font-size:16px;margin:0}p{color:#718078;line-height:1.6;font-size:12px;margin:8px 0}button,input{min-height:44px;border:1px solid #dfe5e2;border-radius:7px;background:white;color:#285f49;padding:10px 12px}button{font-size:12px}
 .filters{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:24px}label{display:block;font-size:12px;color:#56635e;margin-bottom:9px}input{width:100%;color:#283d32}input:focus{outline:2px solid #9dc3b1;outline-offset:1px}.summary{margin:20px 0}
 article{border-top:1px solid #e7ece8;padding:22px 0 8px}h3{font-size:14px;margin:0}.record-heading>span{font-size:10px;color:#547661;background:#f1f6f2;border-radius:20px;padding:6px 10px}ul{list-style:none;margin:16px 0 0;padding:0}li{display:flex;justify-content:space-between;gap:20px;border-top:1px solid #edf0ed;padding:13px 0;font-size:12px}li>span{overflow-wrap:anywhere;min-width:0}li>strong{flex-shrink:0}.empty{text-align:center;padding:30px 8px}.empty>span{display:block;font-size:30px;color:#658a75;margin-bottom:15px}
 @media(max-width:620px){section{padding:20px 16px}.filters{grid-template-columns:1fr;gap:16px}.heading{align-items:flex-start}.heading button{flex-shrink:0}.record-heading{align-items:flex-start}h3{font-size:13px}}
</style>

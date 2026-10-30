<script lang="ts">
 import type { Production } from './production.ts';
 let { records, busy, onedit, onremove, oncreate }: {
  records:Production[]; busy:boolean; onedit:(record:Production)=>void;
  onremove:(record:Production)=>void; oncreate:()=>void;
 } = $props();
 function displayDate(value:string) {
  return new Intl.DateTimeFormat('es-AR',{dateStyle:'long',timeZone:'UTC'}).format(new Date(value+'T12:00:00Z'));
 }
</script>

<section aria-label="Historial de pedidos">
 {#each records as record (record.id)}
  <article><div class="heading"><h2>{displayDate(record.date)}</h2><span class="badge">Registrado</span></div>
   <p class="order-id">Pedido #{record.id.slice(0,8).toUpperCase()}</p>
   <p>Responsable: <strong>{record.responsible}</strong></p>
   <ul>{#each record.items as item (item.product_id)}<li><span>{item.name}</span><strong>{new Intl.NumberFormat('es-AR').format(item.quantity)} {item.unit}</strong></li>{/each}</ul>
   <div class="actions"><button type="button" disabled={busy} onclick={()=>onedit(record)}>Editar pedido</button><button type="button" class="danger" disabled={busy} onclick={()=>onremove(record)}>Eliminar pedido</button></div>
  </article>
 {:else}
  <div class="empty"><h2>Todavía no hay pedidos</h2><p>Cuando guardes el primero, lo vas a encontrar acá.</p><button type="button" onclick={oncreate}>Crear pedido</button></div>
 {/each}
</section>

<style>
 article,.empty{background:white;border:1px solid #e2e6e9;border-radius:12px;padding:27px;margin-bottom:20px}.heading{display:flex;align-items:center;justify-content:space-between;gap:14px}h2{font-size:16px;margin:0}p{color:#718078;line-height:1.6;font-size:12px;margin:8px 0}.order-id{font-size:10px;letter-spacing:.6px}.badge{border:1px solid #dbe6df;background:#f1f6f2;color:#547661;border-radius:20px;padding:6px 11px;font-size:10px}
 ul{list-style:none;margin:16px 0 0;padding:0}li{display:flex;justify-content:space-between;gap:20px;border-top:1px solid #e8ece9;padding:13px 0;font-size:12px}li>span{overflow-wrap:anywhere;min-width:0}li>strong{flex-shrink:0}.actions{display:flex;flex-wrap:wrap;gap:10px;border-top:1px solid #e8ece9;padding-top:17px;margin-top:8px}button{border:1px solid #dfe5e2;background:white;color:#285f49;border-radius:7px;padding:11px 16px;min-height:44px;font-size:12px}button:hover{background:#f1f6f2}.danger{color:#973f34;border-color:#ecd7d2}.danger:hover{background:#fff4f1}.empty{text-align:center}.empty button{margin-top:15px}
 @media(max-width:620px){article,.empty{padding:20px 16px}h2{font-size:14px}.actions>button{flex:1}}
</style>

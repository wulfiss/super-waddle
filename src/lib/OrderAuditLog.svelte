<script lang="ts">
 import { auditLabels, describeChanges, type AuditEntry } from './order-history.ts';
 import { roleLabels } from './access.ts';
 let { entries }: { entries:AuditEntry[] } = $props();
 const formatTime = new Intl.DateTimeFormat('es-AR',{dateStyle:'medium',timeStyle:'medium',timeZone:'America/Argentina/Buenos_Aires'});
</script>

<section class="audit" aria-label="Registro de cambios">
 <h2>Registro de cambios</h2><p class="intro">Quién cambió cada pedido, cuándo y qué se modificó. Los pedidos eliminados conservan su detalle acá.</p>
 {#each entries as entry (entry.id)}
  <article aria-label={auditLabels[entry.action]}>
   <div class="heading"><h3>{auditLabels[entry.action]}</h3><time datetime={entry.occurred_at}>{formatTime.format(new Date(entry.occurred_at))}</time></div>
   <p class="id">Pedido #{entry.production_id.slice(0,8).toUpperCase()}{#if entry.after_snapshot.kind==='extra'} · <strong>Extra</strong>{/if}</p>
   <p><strong>{entry.actor_name}</strong> · {roleLabels[entry.actor_role]}</p>
   <ul class="changes">{#each describeChanges(entry) as change, index (index)}<li>{change}</li>{/each}</ul>
   <details><summary>Ver detalle del cambio</summary><div class="snapshots">
    {#each [{label:'Antes',record:entry.before_snapshot},{label:'Después',record:entry.after_snapshot}] as snapshot (snapshot.label)}
     <div><h4>{snapshot.label}</h4>{#if snapshot.record}
      <p>Fecha: {snapshot.record.date.split('-').reverse().join('/')}</p><p>Responsable: {snapshot.record.responsible}</p>
      {#if snapshot.record.status==='cancelled'}<p class="cancelled">Eliminado de los pedidos activos</p>{/if}
      <ul>{#each snapshot.record.items as item (item.product_id)}<li>{item.name}: <strong>{new Intl.NumberFormat('es-AR').format(item.quantity)} {item.unit}</strong></li>{/each}</ul>
     {:else}<p>El pedido todavía no existía.</p>{/if}</div>
    {/each}
   </div></details>
  </article>
 {:else}<div class="empty"><h3>Todavía no hay cambios registrados</h3><p>Las nuevas altas, ediciones y eliminaciones van a aparecer acá.</p></div>{/each}
</section>

<style>
 .audit{background:white;border:1px solid #e2e6e9;border-radius:12px;padding:27px;margin-bottom:20px}h2{font-size:18px;margin:0}h3{font-size:14px;margin:0}p,.intro{font-size:12px;color:#718078;line-height:1.7;margin:8px 0}.intro{margin-bottom:24px}article{border-top:1px solid #e2e8e3;padding:22px 0}.heading{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}time,.id{font-size:10px;color:#718078}.id{letter-spacing:.7px}ul{font-size:12px;line-height:1.8;margin:10px 0;padding-left:18px}.changes{color:#344c3c}details{margin-top:15px}summary{cursor:pointer;font-size:12px;color:#285f49;padding:8px 0;min-height:40px}.snapshots{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:12px}.snapshots>div{background:#f7f9f7;border:1px solid #e3e9e3;border-radius:8px;padding:16px;overflow-wrap:anywhere;min-width:0}h4{font-size:12px;margin:0 0 12px}.cancelled{color:#973f34}.empty{padding:20px 0;text-align:center}
 @media(max-width:620px){.audit{padding:20px 16px}.heading{flex-direction:column;gap:7px}.snapshots{grid-template-columns:1fr}}
</style>

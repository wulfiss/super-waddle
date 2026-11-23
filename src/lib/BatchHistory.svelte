<script lang="ts">
 import Button from '#lib/ui/Button.svelte';
 import type { Role } from './access.ts';
 import { loadBatches } from './batch-repository.ts';
 import { matchesHistorySearch } from './history-search.ts';

 let { role, actorId, query }: {role:Role; actorId:string; query:string} = $props();
 const quantity = new Intl.NumberFormat('es-AR', {maximumFractionDigits:6});
 const date = new Intl.DateTimeFormat('es-AR', {dateStyle:'long', timeZone:'UTC'});

 function loadConfirmed(role:Role, actorId:string) {
  return loadBatches(role, actorId).then(batches => batches
   .filter(batch => batch.status === 'closed')
   .sort((first, second) => second.date.localeCompare(first.date) || second.created_at.localeCompare(first.created_at)));
 }
 let result = $derived(loadConfirmed(role, actorId));
</script>

<section aria-label="Historial de elaboraciones">
 {#await result}
  <p role="status">Cargando elaboraciones…</p>
 {:then batches}
  {#each batches.filter(batch => matchesHistorySearch(query, batch.recipe_snapshot.name, batch.responsible)) as batch (batch.id)}
   <article>
    <time datetime={batch.date}>{date.format(new Date(batch.date + 'T12:00:00Z'))}</time>
    <div class="heading"><h2>{batch.recipe_snapshot.name}</h2><span>Confirmada</span></div>
    <p>Elaboración #{batch.id.slice(0,8).toUpperCase()} · Receta v{batch.recipe_version}</p>
    <p>Responsable: <strong>{batch.responsible}</strong> · Cantidad elaborada: {quantity.format(batch.factor)}</p>
    <table aria-label={'Pesos de ' + batch.recipe_snapshot.name}>
     <thead><tr><th>Ingrediente</th><th>Sugerido</th><th>Real utilizado</th></tr></thead>
     <tbody>
      {#each batch.ingredients.filter(line => line.included) as line (line.ingredient_id)}
       {@const weight = batch.weighings?.find(row => row.ingredient_id === line.ingredient_id)}
       <tr>
        <th scope="row">{weight?.brands?.map(brand => brand.name).join(' + ') || line.name}</th>
        <td>{quantity.format(line.expected_quantity)} {line.unit}</td>
        <td>{weight ? quantity.format(weight.actual_quantity) + ' ' + line.unit : 'Sin registro'}</td>
       </tr>
      {/each}
     </tbody>
    </table>
   </article>
  {:else}
   <p role="status">{batches.length ? 'No hay elaboraciones que coincidan con la búsqueda.' : 'Todavía no hay elaboraciones confirmadas.'}</p>
  {/each}
 {:catch}
  <p role="alert">No pudimos cargar el historial de elaboraciones.</p>
  <Button onclick={() => result = loadConfirmed(role, actorId)}>Reintentar</Button>
 {/await}
</section>

<style>
 article{background:white;border:1px solid #e2e6e9;border-radius:12px;padding:var(--panel-padding);margin-bottom:var(--section-gap);overflow-wrap:anywhere}
 .heading{display:flex;justify-content:space-between;align-items:center;gap:12px;margin:8px 0}
 h2{font-size:16px;font-weight:600}
 .heading span{background:#f1f6f2;color:#365e44;border:1px solid #dbe6df;border-radius:20px;padding:5px 11px;font-size:12px}
 p,time{font-size:13px;line-height:1.6;color:#52645a}
 table{width:100%;border-collapse:collapse;margin-top:16px;font-size:13px}
 td,th{border-top:1px solid #e2e6e9;padding:8px 4px;text-align:right}
 th:first-child{text-align:left}
 tbody th{font-weight:normal}
</style>

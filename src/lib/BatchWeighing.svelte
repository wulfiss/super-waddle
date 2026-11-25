<script lang="ts">
 import Input from 'flowbite-svelte/Input.svelte';
 import type {Role} from './access.ts';
 import type {FormulationBatch} from './formulation-batches.ts';
 import {batchEventLabels,type WeightChange} from './formulation-weighing.ts';
 import WeightEntry from './WeightEntry.svelte';
 let {batch,role,onchange}:{batch:FormulationBatch;role:Role|null;onchange:(input:WeightChange)=>Promise<FormulationBatch>}=$props();
 let busy=$state(false);
 const included=$derived(batch.ingredients.filter(line=>line.included));
 const confirmed=$derived((batch.weighings??[]).filter(row=>row.incorporated).length);
 const flour=$derived(included.filter(line=>line.name.toLocaleLowerCase('es-AR').includes('harina')));
 const number=new Intl.NumberFormat('es-AR',{maximumFractionDigits:6});
 async function commit(input:WeightChange){busy=true;try{return await onchange(input);}finally{busy=false;}}
</script>
<section class="weighing" aria-label={'Registro de elaboración de '+batch.responsible}>
 <h3>Registro de elaboración</h3><span class="caption">Receta</span>
 <div class="recipe" id={'saved-recipe-'+batch.id}><strong>{batch.recipe_snapshot.code} · {batch.recipe_snapshot.name}</strong><p>{flour.length===1?'Fórmula base: '+number.format(flour[0].base_quantity)+' '+flour[0].unit+' de harina por unidad':'Fórmula base: 1 unidad'} · v{batch.recipe_version}</p>{#if batch.recipe_snapshot.provisional}<p>Cantidades provisorias</p>{/if}<p>Producción: {new Intl.DateTimeFormat('es-AR',{dateStyle:'short',timeZone:'UTC'}).format(new Date(batch.date+'T12:00:00Z'))} · Responsable: {batch.responsible}</p></div>
 <label class="caption" for={'saved-factor-'+batch.id}>Cantidad</label><Input id={'saved-factor-'+batch.id} value={number.format(batch.factor)} readonly aria-describedby={'saved-factor-help-'+batch.id}/><p class="hint" id={'saved-factor-help-'+batch.id}>Cantidad fijada al iniciar · {confirmed} de {included.length} ingredientes incorporados.</p>
 <div class="section-heading"><h4>Pesaje de ingredientes</h4><span>{included.every(line=>line.lower_limit===null)?'Sin tolerancias definidas':'Tolerancias de la receta'}</span></div>
 {#if batch.status==='closed'}<div class="closed" role="status"><strong>Elaboración cerrada automáticamente</strong><p>{batch.has_discrepancies?'Las diferencias registradas se conservaron para Calidad.':'Todos los ingredientes incluidos tienen su incorporación confirmada.'}</p>{#if batch.had_incorporated_discrepancies}<p>El historial conserva diferencias registradas al incorporar.</p>{/if}</div>{/if}
 <ul>{#each batch.ingredients as ingredient (ingredient.ingredient_id)}{#if ingredient.included}<WeightEntry {batch} {ingredient} record={batch.weighings?.find(row=>row.ingredient_id===ingredient.ingredient_id)} {role} {busy} onchange={commit}/>{:else}<li class="omitted"><span>{ingredient.name} (opcional)</span><strong>No incluido</strong></li>{/if}{/each}</ul>
 {#if batch.events?.length}<details class="batch-history"><summary>Inicio y cierre de elaboración</summary>{#each batch.events.filter(event=>event.action==='started'||event.action==='closed').toSorted((a,b)=>a.occurred_at.localeCompare(b.occurred_at)) as event (event.id)}<p><strong>{batchEventLabels[event.action]}</strong> · {event.actor_name??event.actor_id} · <time datetime={event.occurred_at}>{new Intl.DateTimeFormat('es-AR',{dateStyle:'short',timeStyle:'short'}).format(new Date(event.occurred_at))}</time></p>{/each}</details>{/if}
</section>
<style>
 .weighing{padding-top:22px}
 h3{font-size:18px;margin:0 0 18px}
 .caption{display:block;color:#52645a;font-size:12px;margin:16px 0 8px}
 .recipe{background:#f4f4f4;border-radius:10px;padding:17px 14px;font-size:14px}
 .recipe p{margin:5px 0 0;font-size:12px;color:#52645a;line-height:1.6}
 .hint{font-size:11px;color:#718078;margin:8px 0 20px}
 .section-heading{display:flex;align-items:baseline;justify-content:space-between;gap:16px;border-top:1px solid #eee;padding-top:22px}
 h4{font-size:15px;margin:0 0 12px}
 .section-heading>span{font-size:11px;color:#65776d;text-align:right}
 ul{padding:0;margin:0;list-style:none}
 .omitted{display:flex;justify-content:space-between;gap:16px;padding:20px 0;border-top:1px solid #eee;font-size:12px;color:#718078}
 .omitted>strong{font-weight:500;white-space:nowrap}
 .closed{background:#edf5ef;border:1px solid #dbe8de;border-radius:8px;padding:14px;margin:10px 0 18px;font-size:13px;color:#285f49}
 .closed p{font-size:12px;line-height:1.6;margin:6px 0 0}
 .batch-history{margin-top:14px;background:#f6f8f6;border-radius:8px;padding:14px;font-size:12px}
 .batch-history summary{cursor:pointer;min-height:30px}
 .batch-history p{font-size:12px;line-height:1.7;overflow-wrap:anywhere}
</style>

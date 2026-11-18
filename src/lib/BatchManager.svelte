<script lang="ts">
 import BatchWeighing from './BatchWeighing.svelte';
 import {weightAmount,validateWeight,weightDifference,type WeightChange} from './formulation-weighing.ts';
 import {onMount,tick} from 'svelte';
 import type {Role} from './access.ts';
 import {today} from './production.ts';
 import {decimalAmount,recipeKey} from './recipes.ts';
 import {loadRecipes} from './recipe-repository.ts';
 import {approvedRecipes,batchPlan,batchKey,scaledQuantity,validateBatchDetails,type ApprovedRecipe,type FormulationBatch,type IngredientChoice} from './formulation-batches.ts';
 import {loadBatches,persistBatch,persistWeight,completeBatch} from './batch-repository.ts';
 let {role,actorId}:{role:Role|null;actorId:string}=$props();
 let recipes=$state<ApprovedRecipe[]>([]),batches=$state<FormulationBatch[]>([]),selected=$state<ApprovedRecipe|null>(null);
 let loading=$state(true),ready=$state(false),busy=$state(false),error=$state(''),message=$state('');
 let recipeId=$state(''),date=$state(today()),responsible=$state(''),factor=$state('1');
 let choices=$state<Record<string,string>>({}),included=$state<Record<string,boolean>>({}),expanded=$state<string|null>(null);
 let actuals=$state<Record<string,string>>({}),lots=$state<Record<string,string>>({}),expiries=$state<Record<string,string>>({});
 let activeIngredient=$state<string|null>(null);
 const enteredCount=$derived(selected?.document.ingredients.filter(i=>included[i.id]&&Number.isFinite(weightAmount(actuals[i.id]??''))&&weightAmount(actuals[i.id]??'')>0).length??0);
 const includedCount=$derived(selected?.document.ingredients.filter(i=>included[i.id]).length??0);
 let retrySignature='',retryId='';
 const number=new Intl.NumberFormat('es-AR',{maximumFractionDigits:6});
 async function refresh(){
  loading=true;error='';ready=false;
  try{const [allRecipes,records]=await Promise.all([loadRecipes(),loadBatches(role,actorId)]);recipes=approvedRecipes(allRecipes);batches=records;ready=true;
   if(selected && !recipes.some(recipe=>recipe.id===selected!.id && recipe.version===selected!.version)){selected=null;recipeId='';choices={};included={};error='La receta seleccionada cambió o dejó de estar vigente. Seleccioná una receta nuevamente.';}}
  catch{error='No pudimos cargar las elaboraciones y recetas. Actualizá para reintentar.';}finally{loading=false;}
 }
 onMount(()=>{void refresh();const sync=(event:StorageEvent)=>{if(event.key===recipeKey||event.key===batchKey)void refresh();};window.addEventListener('storage',sync);return()=>window.removeEventListener('storage',sync);});
 async function saveWeight(input:WeightChange){const updated=await persistWeight(input,role,actorId);batches=batches.map(batch=>batch.id===updated.id?updated:batch);message='';return updated;}
 function pick(){
  const recipe=recipes.find(recipe=>recipe.id===recipeId);
  selected=recipe?structuredClone($state.snapshot(recipe)):null;choices={};included={};actuals={};lots={};expiries={};error='';message='';
  activeIngredient=selected?.document.ingredients[0]?.id??null;
  if(selected)for(const ingredient of selected.document.ingredients){choices[ingredient.id]=ingredient.alternatives.length?'':'0';included[ingredient.id]=!ingredient.optional;}
 }
 function useSuggested(id:string,quantity:number){error='';try{const count=decimalAmount(factor);if(!Number.isFinite(count)||count<=0||count>1000)throw new Error('Ingresá una cantidad válida de amasadas.');actuals[id]=String(scaledQuantity(quantity,count));}catch(failure){error=failure instanceof Error?failure.message:'Revisá las amasadas.';}}
 async function advance(id:string){
  error='';try{
   const ingredient=selected?.document.ingredients.find(i=>i.id===id);if(!ingredient)return;
   if(included[id]){if(ingredient.alternatives.length&&choices[id]==='')throw new Error('Elegí una materia prima.');validateWeight(weightAmount(actuals[id]??''),lots[id]||null,expiries[id]||null);}
   const remaining=selected!.document.ingredients.slice(selected!.document.ingredients.indexOf(ingredient)+1).find(i=>included[i.id]);
   activeIngredient=remaining?.id??null;await tick();
   if(remaining)document.getElementById('quick-weight-'+selected!.document.ingredients.indexOf(remaining))?.focus();else document.getElementById('quick-summary')?.scrollIntoView({block:'nearest',behavior:'smooth'});
  }catch(failure){error=failure instanceof Error?failure.message:'Revisá el peso real.';}
 }
 function selections():IngredientChoice[]{return selected?.document.ingredients.map(ingredient=>({ingredient_id:ingredient.id,choice:!included[ingredient.id]?null:choices[ingredient.id]===''?NaN:Number(choices[ingredient.id])}))??[];}
 function suggested(quantity:number):string{
  const value=decimalAmount(factor);
  if(!Number.isFinite(value)||value<=0||value>1000)return '—';
  try{return number.format(scaledQuantity(quantity,value));}catch{return 'Fuera de rango';}
 }
 function displayDate(value:string){return new Intl.DateTimeFormat('es-AR',{dateStyle:'long',timeZone:'UTC'}).format(new Date(value+'T12:00:00Z'));}
 function deltaPercent(id:string,quantity:number){try{const actual=weightAmount(actuals[id]??''),count=decimalAmount(factor);if(!Number.isFinite(actual)||actual<=0||!Number.isFinite(count)||count<=0||count>1000)return '';const delta=weightDifference({expected_quantity:scaledQuantity(quantity,count),lower_limit:null,upper_limit:null},actual).percent;return delta===null||delta===0?'':(delta>0?'+':'')+new Intl.NumberFormat('es-AR',{maximumFractionDigits:2}).format(delta)+' %';}catch{return '';}}
 function difference(id:string,quantity:number){const actual=weightAmount(actuals[id]??''),count=decimalAmount(factor);if(!Number.isFinite(actual)||!Number.isFinite(count)||count<=0||count>1000)return '';if(quantity*count>1e9)return 'Cantidad sugerida fuera de rango';const expected=scaledQuantity(quantity,count);const diff=weightDifference({expected_quantity:expected,lower_limit:null,upper_limit:null},actual);return `Diferencia: ${diff.difference>0?'+':''}${number.format(diff.difference)}${diff.percent===null?'':` (${new Intl.NumberFormat('es-AR',{maximumFractionDigits:2}).format(diff.percent)} %)`}`;}
 async function finish(event:SubmitEvent){
  event.preventDefault();if(busy||!ready)return;busy=true;error='';message='';
  try{
   if(!selected)throw new Error('Seleccioná una receta vigente.');
   const input={recipe_id:selected.id,recipe_version:selected.version,date,responsible:responsible.trim(),factor:decimalAmount(factor),selections:selections()};
   validateBatchDetails(input);const plan=batchPlan(selected.document,input.factor,input.selections);
   const weights=plan.filter(line=>line.included).map(line=>{const value=weightAmount(actuals[line.ingredient_id]??'');try{validateWeight(value,lots[line.ingredient_id]||null,expiries[line.ingredient_id]||null);}catch{activeIngredient=line.ingredient_id;throw new Error('Revisá el peso real, lote y vencimiento de '+line.name+'. El peso debe ser mayor que cero.');}return {ingredient_id:line.ingredient_id,actual_quantity:value,lot:lots[line.ingredient_id]?.trim()||null,expiry_date:expiries[line.ingredient_id]||null};});
   const signature=JSON.stringify({input,weights});if(signature!==retrySignature){retrySignature=signature;retryId=crypto.randomUUID();}
   const saved=await completeBatch({...input,request_id:retryId},weights,role,actorId);
   batches=[saved,...batches.filter(row=>row.id!==saved.id)];expanded=null;selected=null;recipeId='';actuals={};lots={};expiries={};choices={};included={};retrySignature='';retryId='';
   message='Elaboración guardada y confirmada. Se conservaron los pesos reales y sus diferencias.';
  }catch(failure){const missing=selected?.document.ingredients.find(i=>included[i.id]&&i.alternatives.length&&choices[i.id]==='');if(missing)activeIngredient=missing.id;error=failure instanceof Error?failure.message:'No se pudo guardar la elaboración.';}finally{busy=false;}
 }
 async function start(event:Event){
  event.preventDefault();if(busy||!ready)return;error='';message='';busy=true;
  try{
   if(!selected)throw new Error('Seleccioná una receta vigente.');
   const input={recipe_id:selected.id,recipe_version:selected.version,date,responsible:responsible.trim(),factor:decimalAmount(factor),selections:selections()};
   validateBatchDetails(input);batchPlan(selected.document,input.factor,input.selections);
   const signature=JSON.stringify(input);if(signature!==retrySignature){retrySignature=signature;retryId=crypto.randomUUID();}
   const id=await persistBatch({...input,request_id:retryId},role,actorId);
   expanded=id;selected=null;recipeId='';choices={};included={};factor='1';retrySignature='';retryId='';
   message='Elaboración iniciada. Se guardaron la receta y las cantidades sugeridas.';
   await refresh();await tick();document.getElementById('batch-detail-'+id)?.scrollIntoView({block:'start',behavior:'smooth'});
  }catch(failure){error=failure instanceof Error?failure.message:'No se pudo iniciar la elaboración.';}finally{busy=false;}
 }
</script>

<section aria-label="Elaboraciones">
 <div class="intro"><button disabled={busy||loading} onclick={()=>void refresh()}>Actualizar elaboraciones</button></div>
 {#if error}<p class="alert error" role="alert">{error}</p>{/if}
 {#if message}<p class="alert success" role="status">{message}</p>{/if}
 {#if loading}<p role="status">Cargando elaboraciones…</p>{/if}
 <form class="card" aria-label="Nueva elaboración" onsubmit={finish} novalidate>
  <fieldset disabled={busy||!ready}>
   <h3 class="step-title">1 · Producto y cantidad</h3>
   <label for="batch-recipe">Receta vigente</label><select id="batch-recipe" bind:value={recipeId} onchange={pick} required><option value="">Seleccioná una receta</option>{#each recipes as recipe (recipe.id)}<option value={recipe.id}>{recipe.document.name}</option>{/each}</select>
   {#if ready && !recipes.length}<p>No hay recetas vigentes. Administración debe aprobar una versión en Recetas antes de iniciar una elaboración.</p>{/if}
   <div class="fields"><div><label for="batch-date">Fecha de producción</label><input id="batch-date" type="date" bind:value={date} required/></div><div><label for="batch-responsible">Responsable</label><input aria-label="Responsable de elaboración" id="batch-responsible" bind:value={responsible} maxlength="120" required autocomplete="name"/></div><div><label for="batch-factor">Amasadas</label><input aria-label="Unidades de elaboración (amasadas)" id="batch-factor" inputmode="decimal" bind:value={factor} required title="1 unidad = 1 amasada"/></div></div>
   {#if selected}
    {#if selected.document.provisional}<p class="provisional">Cantidades provisorias</p>{/if}
    <div class="step-heading"><h3 class="step-title">2 · Peso real, lote y vencimiento</h3><span>{enteredCount} de {includedCount}</span></div>
    <progress max={includedCount||1} value={enteredCount} aria-label="Pesos ingresados"></progress>
    <div class="ingredient-list">
    {#each selected.document.ingredients as ingredient,index (ingredient.id)}
     {@const name=ingredient.alternatives.length&&choices[ingredient.id]!==''?[ingredient.name,...ingredient.alternatives][Number(choices[ingredient.id])]:ingredient.name}
     <details class="ingredient-panel" data-ingredient={ingredient.id} open={activeIngredient===ingredient.id}>
      <summary onclick={(event)=>{event.preventDefault();activeIngredient=activeIngredient===ingredient.id?null:ingredient.id;}}><strong>{name}</strong><span>{included[ingredient.id]?'Sugerido: '+suggested(ingredient.quantity)+' '+ingredient.unit:'Opcional · no incluido'}</span></summary>
      <div class="ingredient-body">
       {#if ingredient.optional}<label class="check"><input type="checkbox" aria-label={'Incluir '+ingredient.name+' (opcional)'} bind:checked={included[ingredient.id]}/> Incluir ingrediente opcional</label>{/if}
       {#if ingredient.alternatives.length}<label for={'batch-choice-'+index}>Materia prima {index+1} (elegí una)</label><select id={'batch-choice-'+index} bind:value={choices[ingredient.id]} disabled={!included[ingredient.id]}><option value="">Elegí una alternativa</option>{#each [ingredient.name,...ingredient.alternatives] as option,choice}<option value={String(choice)}>{option}</option>{/each}</select>{/if}
       {#if included[ingredient.id]}
       <label for={'quick-weight-'+index}>Cantidad real utilizada</label><div class="weight-field"><input id={'quick-weight-'+index} aria-label={'Peso real de '+name} inputmode="decimal" bind:value={actuals[ingredient.id]} placeholder="Peso real" autocomplete="off" onkeydown={(event)=>{if(event.key==='Enter'){event.preventDefault();void advance(ingredient.id);}}}/><span>{ingredient.unit}</span></div>
       <div class="trace-fields"><label>Lote <small>(opcional)</small><input aria-label={'Lote '+(index+1)} bind:value={lots[ingredient.id]} maxlength="120" placeholder="Lote"/></label><label>Vencimiento <small>(opcional)</small><input aria-label={'Vencimiento '+(index+1)} type="date" bind:value={expiries[ingredient.id]}/></label></div>
       {#if actuals[ingredient.id]}<p class="difference">{difference(ingredient.id,ingredient.quantity)}</p>{/if}
       {/if}
       <div class="ingredient-actions">{#if included[ingredient.id]}<button type="button" onclick={()=>useSuggested(ingredient.id,ingredient.quantity)}>Usar sugerido</button>{/if}<button type="button" onclick={()=>void advance(ingredient.id)}>Siguiente →</button></div>
      </div>
     </details>
    {/each}
    </div>
    <section class="review" id="quick-summary" aria-label="Resumen de elaboración"><h3 class="step-title">3 · Resumen</h3><strong>{selected.document.name} · {factor} {decimalAmount(factor)===1?'amasada':'amasadas'}</strong><p>{includedCount} ingredientes · lote y vencimiento opcionales</p>
     {#each selected.document.ingredients as ingredient (ingredient.id)}{#if included[ingredient.id]}
      {@const actual=weightAmount(actuals[ingredient.id]??'')}
      {@const delta=deltaPercent(ingredient.id,ingredient.quantity)}
      <div class="review-row" class:different={!!delta}><span>{ingredient.alternatives.length&&choices[ingredient.id]!==''?[ingredient.name,...ingredient.alternatives][Number(choices[ingredient.id])]:ingredient.name}</span><strong>{Number.isFinite(actual)&&actual>0?number.format(actual):'Pendiente'} / {suggested(ingredient.quantity)} {ingredient.unit}{#if delta}<span class="delta-badge">{delta}</span>{/if}</strong></div>
     {/if}{/each}
    </section>
   {/if}
   <div class="actions"><button class="primary" type="submit" disabled={!selected}>{busy?'Guardando…':'Guardar y confirmar elaboración'}</button><small>Confirmás las cantidades incorporadas.</small></div>
   <details class="more-options"><summary>Más opciones</summary>
    <details><summary>Continuar más tarde (opcional)</summary><button type="button" disabled={!selected} onclick={(event)=>void start(event)}>Iniciar elaboración</button></details>
   </details>
  </fieldset>
 </form>
 <section class="card" aria-label="Historial de elaboraciones"><h3>{role==='admin'?'Todas las elaboraciones':'Mis elaboraciones'}</h3><p>Elaboraciones guardadas con su receta de referencia y cantidades sugeridas.</p>
  {#each batches as batch (batch.id)}<article aria-label={'Elaboración de '+batch.responsible+' - '+batch.recipe_snapshot.name}>
   <div class="batch-heading"><div><span class="code">Elaboración #{batch.id.slice(0,8).toUpperCase()}</span><h4>{batch.recipe_snapshot.name} · v{batch.recipe_version}</h4></div><span class="badge">{batch.status==='closed'?'Cerrada':'En curso'}</span></div>
   <p>{displayDate(batch.date)} · Responsable: <strong>{batch.responsible}</strong></p><p>{number.format(batch.factor)} {batch.factor===1?'amasada':'amasadas'}{#if batch.recipe_snapshot.provisional} · <strong>Cantidades provisorias</strong>{/if}</p>
   <button aria-expanded={expanded===batch.id} aria-controls={'batch-detail-'+batch.id} onclick={()=>expanded=expanded===batch.id?null:batch.id}>{expanded===batch.id?'Ocultar cantidades':'Ver cantidades sugeridas'}</button>
   <div id={'batch-detail-'+batch.id} hidden={expanded!==batch.id}><BatchWeighing {batch} {role} onchange={saveWeight}/></div>
  </article>{:else}{#if ready}<p>Todavía no hay elaboraciones registradas.</p>{/if}{/each}
 </section>
</section>
<style>
 .intro{display:flex;justify-content:flex-end;margin-bottom:12px}.intro button{font-size:11px;padding:7px 10px}.card{background:white;border:1px solid #e2e6e9;border-radius:12px;padding:24px;margin-bottom:20px}h3{font-size:17px;margin:0 0 16px}h4{font-size:14px;margin:12px 0}p,small{font-size:12px;line-height:1.5;color:#65776d}fieldset{border:0;padding:0;margin:0;min-width:0}label{display:block;font-size:12px;color:#52645a;margin:12px 0 6px}input,select{box-sizing:border-box;width:100%;min-height:44px;border:1px solid #dfe5e2;border-radius:8px;padding:9px 12px;background:white;color:#202b3a;font:inherit;font-size:13px}.fields{display:grid;grid-template-columns:1fr 1.3fr .7fr;gap:14px}.provisional{margin:12px 0 0;font-size:11px;color:#8b602f}.ingredient-list{margin-top:14px} .step-title{font-size:13px;margin:10px 0}.step-heading{display:flex;justify-content:space-between;gap:12px;align-items:center;margin-top:18px}.step-heading>span{font-size:11px;color:#65776d;white-space:nowrap}progress{width:100%;height:5px;accent-color:#285f49}.ingredient-panel{border:1px solid #e2e6e9;border-radius:9px;margin:8px 0;overflow:hidden}.ingredient-panel>summary{display:flex;justify-content:space-between;align-items:center;gap:14px;padding:14px;list-style:none}.ingredient-panel>summary::after{content:"›";font-size:18px;color:#65776d}.ingredient-panel[open]>summary::after{transform:rotate(90deg)}.ingredient-panel>summary>strong{font-size:13px;color:#202b3a;overflow-wrap:anywhere}.ingredient-panel>summary>span{margin-left:auto;font-size:11px;text-align:right;flex-shrink:0}.ingredient-panel[open]>summary{background:#f4f6f4}.ingredient-body{padding:0 14px 14px}.trace-fields{display:grid;grid-template-columns:1fr 1fr;gap:12px}.ingredient-actions{display:flex;gap:10px;margin-top:14px}.ingredient-actions>button{flex:1}.review{border:1px solid #e2e6e9;background:#f8faf8;border-radius:9px;padding:14px;margin-top:18px}.review>strong{font-size:14px}.review-row{display:flex;justify-content:space-between;align-items:baseline;gap:16px;border-top:1px solid #e7ece8;padding:10px 0;font-size:12px}.different>strong{color:#92511d}.delta-badge{display:inline-block;margin-left:6px;padding:3px 5px;border-radius:4px;background:#fff0d7;font-size:10px}.review-row>span{overflow-wrap:anywhere}.review-row>strong{font-size:11px;white-space:nowrap}.weight-field{display:flex;align-items:center;gap:8px;min-width:0}.weight-field>input{min-width:0}.weight-field>span{font-size:12px;color:#65776d;flex-shrink:0}.check{display:flex;gap:8px;align-items:center;font-size:11px!important;margin:5px 0 0!important}.check input{width:17px;height:17px;min-height:17px;accent-color:#285f49}.difference{grid-column:1/-1;margin:0;font-size:11px}.actions{display:flex;align-items:center;gap:12px;margin-top:18px;flex-wrap:wrap}.actions small{font-size:11px}.more-options{margin-top:14px}summary{font-size:12px;color:#65776d;cursor:pointer;padding:9px 0}button{border:1px solid #dfe5e2;border-radius:7px;padding:10px 14px;min-height:44px;background:white;color:#285f49;font-size:12px}button:disabled{opacity:.5;cursor:not-allowed}.primary{background:#285f49;color:white}.alert{padding:14px;border-radius:8px}.error{background:#fff0eb;color:#973f34}.success{background:#e6f3e9;color:#285f49}.badge{font-size:11px;background:#f1f6f2;padding:7px 11px;border-radius:20px;white-space:nowrap}.code{font-size:10px;color:#718078;letter-spacing:.5px}article{border-top:1px solid #e7ece8;padding:20px 0;overflow-wrap:anywhere}.batch-heading{display:flex;justify-content:space-between;align-items:start;gap:14px}
 @media(max-width:620px){.card{padding:16px 12px}.fields{grid-template-columns:1fr 1fr;gap:10px}.fields>div:last-child{grid-column:1/3}.trace-fields{grid-template-columns:1fr;gap:0}.ingredient-panel>summary{padding:12px;gap:8px}.ingredient-panel>summary>strong{font-size:12px}.ingredient-panel>summary>span{font-size:10px}.ingredient-actions{flex-wrap:wrap}.actions>button{width:100%}.review-row{gap:10px}}
</style>

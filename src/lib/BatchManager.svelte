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
  if(selected)for(const ingredient of selected.document.ingredients){choices[ingredient.id]=ingredient.alternatives.length?'':'0';included[ingredient.id]=!ingredient.optional;}
 }
 function selections():IngredientChoice[]{return selected?.document.ingredients.map(ingredient=>({ingredient_id:ingredient.id,choice:!included[ingredient.id]?null:choices[ingredient.id]===''?NaN:Number(choices[ingredient.id])}))??[];}
 function suggested(quantity:number):string{
  const value=decimalAmount(factor);
  if(!Number.isFinite(value)||value<=0||value>1000)return '—';
  try{return number.format(scaledQuantity(quantity,value));}catch{return 'Fuera de rango';}
 }
 function displayDate(value:string){return new Intl.DateTimeFormat('es-AR',{dateStyle:'long',timeZone:'UTC'}).format(new Date(value+'T12:00:00Z'));}
 function difference(id:string,quantity:number){const actual=weightAmount(actuals[id]??''),count=decimalAmount(factor);if(!Number.isFinite(actual)||!Number.isFinite(count)||count<=0||count>1000)return '';if(quantity*count>1e9)return 'Cantidad sugerida fuera de rango';const expected=scaledQuantity(quantity,count);const diff=weightDifference({expected_quantity:expected,lower_limit:null,upper_limit:null},actual);return `Diferencia: ${diff.difference>0?'+':''}${number.format(diff.difference)}${diff.percent===null?'':` (${new Intl.NumberFormat('es-AR',{maximumFractionDigits:2}).format(diff.percent)} %)`}`;}
 async function finish(event:SubmitEvent){
  event.preventDefault();if(busy||!ready)return;busy=true;error='';message='';
  try{
   if(!selected)throw new Error('Seleccioná una receta vigente.');
   const input={recipe_id:selected.id,recipe_version:selected.version,date,responsible:responsible.trim(),factor:decimalAmount(factor),selections:selections()};
   validateBatchDetails(input);const plan=batchPlan(selected.document,input.factor,input.selections);
   const weights=plan.filter(line=>line.included).map(line=>{const value=weightAmount(actuals[line.ingredient_id]??'');try{validateWeight(value,lots[line.ingredient_id]||null,expiries[line.ingredient_id]||null);}catch{throw new Error('Revisá el peso real, lote y vencimiento de '+line.name+'. El peso debe ser mayor que cero.');}return {ingredient_id:line.ingredient_id,actual_quantity:value,lot:lots[line.ingredient_id]?.trim()||null,expiry_date:expiries[line.ingredient_id]||null};});
   const signature=JSON.stringify({input,weights});if(signature!==retrySignature){retrySignature=signature;retryId=crypto.randomUUID();}
   const saved=await completeBatch({...input,request_id:retryId},weights,role,actorId);
   batches=[saved,...batches.filter(row=>row.id!==saved.id)];expanded=null;selected=null;recipeId='';actuals={};lots={};expiries={};choices={};included={};retrySignature='';retryId='';
   message='Elaboración guardada y confirmada. Se conservaron los pesos reales y sus diferencias.';
  }catch(failure){error=failure instanceof Error?failure.message:'No se pudo guardar la elaboración.';}finally{busy=false;}
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
 <div class="intro"><div><h2>Elaboraciones</h2><p>Elegí el producto, ingresá los pesos reales y guardá toda la elaboración en un solo paso.</p></div><button disabled={busy||loading} onclick={()=>void refresh()}>Actualizar elaboraciones</button></div>
 {#if error}<p class="alert error" role="alert">{error}</p>{/if}
 {#if message}<p class="alert success" role="status">{message}</p>{/if}
 {#if loading}<p role="status">Cargando elaboraciones…</p>{/if}
 <form class="card" aria-label="Nueva elaboración" onsubmit={finish} novalidate>
  <h3>Registro de elaboración</h3>
  <fieldset disabled={busy||!ready}>
   <label for="batch-recipe">Receta vigente</label><select id="batch-recipe" bind:value={recipeId} onchange={pick} required><option value="">Seleccioná una receta</option>{#each recipes as recipe (recipe.id)}<option value={recipe.id}>{recipe.document.name} · v{recipe.version} · {recipe.document.code}</option>{/each}</select>
   {#if ready && !recipes.length}<p>No hay recetas vigentes. Administración debe aprobar una versión en Recetas antes de iniciar una elaboración.</p>{/if}
   <div class="fields"><div><label for="batch-date">Fecha de producción</label><input id="batch-date" type="date" bind:value={date} required/></div><div><label for="batch-responsible">Responsable de elaboración</label><input id="batch-responsible" bind:value={responsible} maxlength="120" required autocomplete="name"/></div><div><label for="batch-factor">Unidades de elaboración (amasadas)</label><input id="batch-factor" inputmode="decimal" bind:value={factor} required aria-describedby="batch-factor-help"/><p id="batch-factor-help">1 unidad = 1 amasada de la receta. Podés ingresar fracciones, por ejemplo 0,5.</p></div></div>
   {#if selected}
    <div class="recipe-note"><strong>{selected.document.name} · v{selected.version}</strong>{#if selected.document.provisional}<p><strong>Cantidades provisorias</strong>: esta marca se conservará en la elaboración.</p>{/if}<p>Se guardará una copia de esta versión. Los cambios posteriores en la receta no modificarán la elaboración.</p></div>
    <h3>Pesaje de ingredientes</h3>
    {#each selected.document.ingredients as ingredient,index (ingredient.id)}
     <div class="ingredient" class:omitted={!included[ingredient.id]}>
      <div class="ingredient-input"><strong>{ingredient.alternatives.length&&choices[ingredient.id]!==''?[ingredient.name,...ingredient.alternatives][Number(choices[ingredient.id])]:ingredient.name}</strong>{#if ingredient.optional}<label class="check"><input type="checkbox" bind:checked={included[ingredient.id]}/> Incluir {ingredient.name} (opcional)</label>{/if}
       {#if ingredient.alternatives.length}<label for={'batch-choice-'+index}>Materia prima {index+1} (elegí una)</label><select id={'batch-choice-'+index} bind:value={choices[ingredient.id]} disabled={!included[ingredient.id]} required={included[ingredient.id]}><option value="">Elegí una materia prima</option>{#each [ingredient.name,...ingredient.alternatives] as name,choice}<option value={String(choice)}>{name}</option>{/each}</select>{/if}
      </div><div class="expected"><span>Cantidad sugerida</span><strong>{included[ingredient.id]?suggested(ingredient.quantity)+' '+ingredient.unit:'No incluido'}</strong><small>{number.format(ingredient.quantity)} {ingredient.unit} por amasada</small></div>
     </div>
     {#if included[ingredient.id]}<div class="quick-weight"><label for={'quick-weight-'+index}>Peso real de {ingredient.alternatives.length&&choices[ingredient.id]!==''?[ingredient.name,...ingredient.alternatives][Number(choices[ingredient.id])]:ingredient.name}</label><div class="weight-field"><input id={'quick-weight-'+index} inputmode="decimal" bind:value={actuals[ingredient.id]} autocomplete="off"/><span>{ingredient.unit}</span></div>{#if actuals[ingredient.id]}<p>{difference(ingredient.id,ingredient.quantity)}</p>{/if}<details><summary>Lote y vencimiento (opcional)</summary><div class="fields"><label>Lote {index+1}<input bind:value={lots[ingredient.id]} maxlength="120"/></label><label>Vencimiento {index+1}<input type="date" bind:value={expiries[ingredient.id]}/></label></div></details></div>{/if}
    {/each}
   {/if}
   <p>Al guardar confirmás que incorporaste las cantidades ingresadas. Las diferencias quedan registradas para Calidad.</p><div class="actions"><button class="primary" type="submit" disabled={!selected}>{busy?'Guardando…':'Guardar y confirmar elaboración'}</button></div><details class="draft-options"><summary>Continuar más tarde (opcional)</summary><p>Guardá solo el inicio si todavía no tenés los pesos.</p><button type="button" disabled={!selected} onclick={(event)=>void start(event)}>Iniciar elaboración</button></details>
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
 .quick-weight{margin-bottom:22px}.weight-field{display:flex;align-items:center;gap:12px}.weight-field>input{flex:1;min-width:0}.weight-field>span{font-size:13px;color:#65776d}summary{font-size:12px;cursor:pointer;padding:10px 0}.draft-options{margin-top:18px} .intro,.batch-heading{display:flex;justify-content:space-between;gap:18px;align-items:center}.intro{margin-bottom:20px}.intro>div{max-width:700px}h2{font-size:21px;margin:0}h3{font-size:16px;margin:0 0 14px}h4{font-size:15px;margin:8px 0}p,small{font-size:12px;color:#65776d;line-height:1.7}.card{background:white;border:1px solid #e2e6e9;border-radius:12px;padding:25px;margin-bottom:20px}fieldset{border:0;padding:0;margin:0;min-width:0}.fields{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}label{display:block;font-size:12px;color:#52645a;margin:16px 0 8px}input,select{box-sizing:border-box;width:100%;min-height:44px;border:1px solid #dfe5e2;border-radius:24px;padding:10px 14px;background:white;color:#202b3a;font:inherit}.check{display:flex;align-items:center;gap:10px}.check input{width:20px;min-height:20px;height:20px;accent-color:#285f49;flex-shrink:0}.recipe-note{padding:16px;background:#f1f6f2;border-radius:8px;margin:16px 0 24px;font-size:13px}.ingredient{display:flex;align-items:center;justify-content:space-between;gap:24px;border-top:1px solid #e7ece8;padding:18px 0}.ingredient-input{flex:1;min-width:0}.ingredient-input>strong{font-size:13px;overflow-wrap:anywhere}.expected{flex-shrink:0;display:flex;flex-direction:column;align-items:flex-end;gap:6px}.expected>span{font-size:11px;color:#65776d}.expected>strong{font-size:18px;color:#285f49}.omitted .expected>strong{color:#65776d;font-size:14px}.actions{margin-top:18px}button{border:1px solid #dfe5e2;border-radius:7px;padding:11px 15px;min-height:44px;background:white;color:#285f49;font-size:12px}button:disabled{opacity:.5;cursor:not-allowed}.primary{background:#285f49;color:white}.alert{padding:14px;border-radius:8px}.error{background:#fff0eb;color:#973f34}.success{background:#e6f3e9;color:#285f49}.badge{font-size:11px;background:#f1f6f2;padding:7px 11px;border-radius:20px;white-space:nowrap}.code{font-size:10px;color:#718078;letter-spacing:.5px}article{border-top:1px solid #e7ece8;padding:24px 0;overflow-wrap:anywhere}
 @media(max-width:620px){.intro{flex-direction:column;align-items:start}.card{padding:20px 16px}.fields{grid-template-columns:1fr;gap:0}.ingredient{flex-direction:column;align-items:stretch;gap:14px}.expected{align-items:start}.batch-heading{align-items:start}}
</style>

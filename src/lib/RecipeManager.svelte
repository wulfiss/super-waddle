<script lang="ts">
 import Button from '#lib/ui/Button.svelte';
 import Input from 'flowbite-svelte/Input.svelte';
 import { onMount } from 'svelte';
 import type { Product } from './production.ts';
 import type { Role } from './access.ts';
 import { initialRecipes, latestRecipe, normalizeRecipe, decimalAmount, recipeKey, recipeStatus, type Recipe, type RecipeDraft, type RecipeIngredient, type RecipeChange } from './recipes.ts';
 import { loadRecipes, persistRecipe } from './recipe-repository.ts';
 let {products,role,actorId}:{products:Product[];role:Role|null;actorId:string}=$props();
 let recipes=$state<Recipe[]>([]),loading=$state(true),busy=$state(false),error=$state(''),message=$state('');
 let search=$state(''),archived=$state(false),editing=$state<Recipe|null>(null),formOpen=$state(false);
 type Line=Omit<RecipeIngredient,'quantity'|'tolerance_lower'|'tolerance_upper'|'alternatives'> & {quantity:string;lower:string;upper:string;alternativesText:string};
 let code=$state(''),name=$state(''),family=$state(''),productId=$state(''),provisional=$state(true),lines=$state<Line[]>([]);
 let confirming=$state<{action:'approve'|'archive';recipe:Recipe}|null>(null),dialog=$state<HTMLDialogElement>();
 let historyId=$state<string|null>(null);
 let retrySignature='',retryId='';
 const filtered=$derived(recipes.filter(recipe=>(archived || recipe.active) && [recipe.code,recipe.name].some(value=>value.toLocaleLowerCase('es-AR').includes(search.toLocaleLowerCase('es-AR')))));
 function newLine():Line{return {id:crypto.randomUUID(),name:'',quantity:'',unit:'kg',optional:false,alternativesText:'',lower:'',upper:''};}
 async function refresh(){loading=true;error='';try{recipes=await loadRecipes();}catch{error='No pudimos cargar las recetas. Actualizá para reintentar.';}finally{loading=false;}}
 onMount(()=>{void refresh();const sync=(event:StorageEvent)=>{if(event.key===recipeKey)void refresh();};window.addEventListener('storage',sync);return()=>window.removeEventListener('storage',sync);});
 function closeForm(){editing=null;formOpen=false;lines=[];retrySignature='';retryId='';}
 function template(){const recipe=initialRecipes().recipes[0];edit(recipe);editing=null;code=recipe.code;}
 function create(){editing=null;code='';name='';family='';productId='';provisional=true;lines=[newLine()];formOpen=true;error='';message='';}
 function edit(recipe:Recipe){
  editing=structuredClone($state.snapshot(recipe));const draft=latestRecipe(recipe).document;
  code=draft.code;name=draft.name;family=draft.family;productId=draft.product_id ?? '';provisional=draft.provisional;
  lines=draft.ingredients.map(line=>({...line,quantity:String(line.quantity),alternativesText:line.alternatives.join('\n'),lower:line.tolerance_lower===null?'':String(line.tolerance_lower),upper:line.tolerance_upper===null?'':String(line.tolerance_upper)}));
  formOpen=true;error='';message='';window.scrollTo({top:0,behavior:'smooth'});
 }
 async function commit(input:Omit<Extract<RecipeChange,{action:'save'}>,'request_id'>|Omit<Extract<RecipeChange,{action:'approve'|'archive'}>,'request_id'>){
  const signature=JSON.stringify(input);
  if(signature!==retrySignature){retryId=crypto.randomUUID();retrySignature=signature;}
  await persistRecipe({...input,request_id:retryId} as RecipeChange,role,actorId);
 }
 async function save(event:SubmitEvent){
  event.preventDefault();if(busy)return;error='';message='';busy=true;
  try{
   const draft:RecipeDraft=normalizeRecipe({code,name,family,product_id:productId||null,provisional,ingredients:lines.map(line=>({id:line.id,name:line.name,quantity:decimalAmount(line.quantity),unit:line.unit,optional:line.optional,alternatives:line.alternativesText.split('\n'),tolerance_lower:line.lower.trim()===''?null:decimalAmount(line.lower),tolerance_upper:line.upper.trim()===''?null:decimalAmount(line.upper)}))});
   await commit({action:'save',id:editing?.id,revision:editing?.revision,draft});closeForm();message='Borrador guardado. Aprobalo cuando la fórmula esté revisada.';await refresh();
  }catch(failure){error=failure instanceof Error?failure.message:'No se pudo guardar la receta.';}finally{busy=false;}
 }
 async function confirm(){
  if(!confirming || busy)return;busy=true;error='';message='';
  try{
   const {recipe,action}=confirming;
   await commit({action,id:recipe.id,revision:recipe.revision});
   message=action==='approve'?'Versión aprobada. Las versiones anteriores se conservan.':'Receta archivada. Su historial se conserva.';
   dialog?.close();confirming=null;await refresh();
  }catch(failure){error=failure instanceof Error?failure.message:'No se pudo guardar el cambio.';dialog?.close();}finally{busy=false;}
 }
 function ask(action:'approve'|'archive',recipe:Recipe){confirming={action,recipe:structuredClone($state.snapshot(recipe))};dialog?.showModal();}
</script>

<section aria-label="Administrar recetas">
 <div class="intro"><div><h2>Recetas y formulaciones</h2><p>Las cantidades corresponden a <strong>1 unidad de elaboración</strong>. Cada edición guarda una nueva versión.</p></div><div class="actions"><Button disabled={busy||loading||formOpen} onclick={template}>Usar modelo Pan mignón</Button><Button disabled={busy||loading||formOpen} onclick={create} type="button" color="primary">Agregar receta</Button></div></div>
 {#if error}<p class="alert error" role="alert">{error}</p>{/if}
 {#if message}<p class="alert success" role="status">{message}</p>{/if}
 {#if formOpen}
 <form class="card" onsubmit={save} aria-label={editing?'Editar receta':'Agregar receta'}>
  <h3>{editing?`Nueva versión de ${editing.name}`:'Nueva receta'}</h3><p>Guardar crea un borrador. La fórmula vigente se mantiene hasta que apruebes la nueva versión.</p>
  <fieldset disabled={busy}><div class="fields">
   <label>Código<Input bind:value={code} required maxlength={80}/></label>
   <label>Nombre de receta<Input bind:value={name} required maxlength={160}/></label>
   <label>Familia<Input bind:value={family} maxlength={120}/></label>
   <label>Producto vinculado (opcional)<select aria-label="Producto vinculado (opcional)" bind:value={productId}><option value="">Sin vincular</option>{#each products as product (product.id)}<option value={product.id}>{product.name}</option>{/each}{#if productId && !products.some(product=>product.id===productId)}<option value={productId}>Producto archivado</option>{/if}</select></label>
  </div><label class="check"><input type="checkbox" bind:checked={provisional}/> Cantidades provisorias</label>
  <h3>Ingredientes por unidad</h3><p>Las alternativas se ofrecen como marcas habituales al registrar el peso.</p>
  {#each lines as line,index (line.id)}
   <fieldset class="ingredient"><legend>Ingrediente {index+1}</legend><div class="fields">
    <label>Materia prima {index+1}<Input bind:value={line.name} required maxlength={160}/></label>
    <label>Cantidad base {index+1}<Input inputmode="decimal" bind:value={line.quantity} required placeholder="Ej.: 25 o 0,250"/></label>
    <label>Unidad {index+1}<select aria-label={'Unidad '+(index+1)} bind:value={line.unit}><option>kg</option><option>g</option><option>L</option><option>unidades</option></select></label>
   </div><label>Alternativas {index+1} (una por línea)<textarea bind:value={line.alternativesText} rows="2" placeholder="Otra materia prima que reemplaza a la principal, con la misma cantidad y unidad"></textarea></label>
   <label class="check"><input type="checkbox" bind:checked={line.optional}/> Ingrediente opcional {index+1}</label>
   <details><summary>Tolerancias aprobadas (opcional)</summary><p>Sin límites definidos se mostrarán diferencias, sin clasificarlas como aceptables o inaceptables.</p><div class="fields">
    <label>Tolerancia inferior % {index+1}<Input inputmode="decimal" bind:value={line.lower} placeholder="Sin definir"/></label>
    <label>Tolerancia superior % {index+1}<Input inputmode="decimal" bind:value={line.upper} placeholder="Sin definir"/></label>
   </div></details>
   <div class="actions"><Button type="button" disabled={index===0} aria-label={'Subir ingrediente '+(index+1)} onclick={()=>{[lines[index-1],lines[index]]=[lines[index],lines[index-1]];}}>↑ Subir</Button><Button type="button" disabled={index===lines.length-1} aria-label={'Bajar ingrediente '+(index+1)} onclick={()=>{[lines[index+1],lines[index]]=[lines[index],lines[index+1]];}}>↓ Bajar</Button><Button type="button" disabled={lines.length===1} color="red" onclick={()=>lines=lines.filter(item=>item.id!==line.id)}>Quitar ingrediente {index+1}</Button></div>
   </fieldset>
  {/each}
  <div class="actions"><Button type="button" disabled={lines.length>=100} onclick={()=>lines=[...lines,newLine()]}>Agregar ingrediente</Button><Button type="button" onclick={closeForm}>Cancelar edición</Button><Button type="submit" color="primary">{busy?'Guardando…':'Guardar borrador'}</Button></div>
  </fieldset>
 </form>
 {/if}
 <div class="card"><div class="filters"><label>Buscar recetas<Input type="search" bind:value={search}/></label><label class="check"><input type="checkbox" bind:checked={archived}/> Incluir archivadas</label><Button disabled={busy} onclick={()=>void refresh()}>Actualizar recetas</Button></div>
 {#if loading}<p role="status">Cargando recetas…</p>{:else}
 {#each filtered as recipe (recipe.id)}
  {@const latest=latestRecipe(recipe)}
  <article aria-label={recipe.name}><div class="recipe-heading"><div><span class="code">{recipe.code}</span><h3>{recipe.name}</h3></div><span class="badge">{!recipe.active?'Archivada':recipeStatus[latest.status]} · v{latest.version}</span></div>
   <p>{latest.document.family || 'Sin familia'}{#if latest.document.provisional} · <strong>Cantidades provisorias</strong>{/if}</p>
   {#if recipe.current_version && recipe.current_version!==latest.version}<p>La versión vigente sigue siendo v{recipe.current_version} hasta aprobar este borrador.</p>{/if}
   <ol>{#each latest.document.ingredients as ingredient (ingredient.id)}<li><span>{[ingredient.name,...ingredient.alternatives].join(' o ')}{#if ingredient.optional}{' '}<small>(opcional)</small>{/if}</span><strong>{new Intl.NumberFormat('es-AR',{maximumFractionDigits:3}).format(ingredient.quantity)} {ingredient.unit}</strong></li>{/each}</ol>
   <div class="actions">{#if recipe.active}<Button disabled={busy||loading||formOpen} onclick={()=>edit(recipe)}>Editar receta</Button>{#if latest.status==='draft'}<Button disabled={busy||formOpen} type="button" color="primary" onclick={()=>ask('approve',recipe)}>Aprobar versión</Button>{/if}<Button disabled={busy||formOpen} color="red" onclick={()=>ask('archive',recipe)}>Eliminar receta</Button>{/if}<Button aria-expanded={historyId===recipe.id} onclick={()=>historyId=historyId===recipe.id?null:recipe.id}>Historial de versiones</Button></div>
   {#if historyId===recipe.id}<section aria-label={'Versiones de '+recipe.name} class="history">{#each [...recipe.versions].sort((a,b)=>b.version-a.version) as version (version.version)}<details><summary>v{version.version} · {recipeStatus[version.status]} · {new Intl.DateTimeFormat('es-AR',{dateStyle:'short',timeStyle:'short'}).format(new Date(version.created_at))}</summary><p>{version.document.code} · {version.document.name} · {version.document.provisional?'Provisoria':'Cantidades revisadas'}</p>{#if version.approved_at}<p>Aprobada: {new Intl.DateTimeFormat('es-AR',{dateStyle:'short',timeStyle:'short'}).format(new Date(version.approved_at))}</p>{/if}<ul>{#each version.document.ingredients as ingredient (ingredient.id)}<li><span>{[ingredient.name,...ingredient.alternatives].join(' o ')}{ingredient.optional?' (opcional)':''}</span><strong>{ingredient.quantity} {ingredient.unit}</strong></li>{/each}</ul></details>{/each}</section>{/if}
  </article>
 {:else}<p>{search?'No hay recetas que coincidan.':'Todavía no hay recetas disponibles.'}</p>{/each}{/if}
 </div>
</section>
<dialog bind:this={dialog} aria-labelledby="recipe-dialog-title" oncancel={(event)=>{if(busy)event.preventDefault();}}>
 <h2 id="recipe-dialog-title">{confirming?.action==='approve'?'¿Aprobar esta versión?':'¿Eliminar esta receta?'}</h2>
 <p><strong>{confirming?.recipe.name}</strong></p>
 {#if confirming?.action==='approve'}<p>Esta fórmula será la vigente. Las versiones anteriores conservarán sus cantidades.</p>{#if latestRecipe(confirming.recipe).document.provisional}<p><strong>Atención: estas cantidades están marcadas como provisorias.</strong></p>{/if}{:else}<p>La receta quedará archivada. Se conservarán todas sus versiones y elaboraciones históricas.</p>{/if}
 <div class="actions"><Button disabled={busy} onclick={()=>dialog?.close()}>Cancelar</Button><Button disabled={busy} onclick={confirm} type="button" color="primary">{busy?'Guardando…':confirming?.action==='approve'?'Sí, aprobar versión':'Sí, archivar receta'}</Button></div>
</dialog>
<style>
 .intro,.recipe-heading{display:flex;justify-content:space-between;align-items:center;gap:16px}
 .intro{margin-bottom:20px}
 .intro>div{max-width:680px}
 h2{font-size:21px;margin:0}
 h3{font-size:16px;margin:10px 0}
 p,small{font-size:12px;line-height:1.7;color:#65776d}
 .card{background:#fff;border:1px solid #e2e6e9;border-radius:12px;padding:var(--panel-padding);margin-bottom:var(--section-gap)}
 fieldset{border:0;min-width:0;padding:0;margin:0}
 .fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
 label{display:block;font-size:12px;margin:12px 0;color:#52645a}
 input,textarea,select{display:block;box-sizing:border-box;width:100%;min-height:44px;border:1px solid #dfe5e2;border-radius:7px;padding:10px;background:#fff;color:#202b3a;font:inherit;margin-top:8px}
 textarea{resize:vertical}
 .check{display:flex;align-items:center;gap:10px}
 .check input{width:20px;height:20px;min-height:20px;margin:0;accent-color:#285f49}
 .ingredient{border:1px solid #dfe5e2;padding:18px;border-radius:9px;margin:20px 0}
 .ingredient legend{font-size:13px;font-weight:600;padding:0 8px}
 .actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:16px}
 .error{color:#973f34}
 .alert{padding:14px;border-radius:8px}
 .error{background:#fff0eb}
 .success{background:#e6f3e9;color:#285f49}
 .filters{display:flex;align-items:end;gap:20px;flex-wrap:wrap}
 .filters>label:first-child{flex:1;min-width:160px}
 article{border-top:1px solid #e7ece8;padding:24px 0;overflow-wrap:anywhere}
 .code{font-size:10px;letter-spacing:.6px;color:#718078}
 .badge{padding:6px 10px;border-radius:20px;background:#f1f6f2;font-size:11px;white-space:nowrap}
 ol,ul{padding:0;list-style:none}
 li{display:flex;justify-content:space-between;gap:20px;font-size:12px;border-top:1px solid #eef1ef;padding:12px 0}
 li>strong{white-space:nowrap}
 summary{cursor:pointer;font-size:12px;min-height:32px;padding-top:8px}
 .history{margin-top:20px;padding:15px;background:#f6f8f6;border-radius:8px}
 dialog{width:min(500px,calc(100% - 32px));box-sizing:border-box;border:1px solid #dfe5e2;border-radius:12px;padding:26px;color:#202b3a}
 dialog::backdrop{background:#142d3480}
 @media(max-width:620px){
 .intro,.recipe-heading{align-items:start}
 .intro{flex-direction:column}
 .card{padding:var(--panel-padding)}
 .fields{grid-template-columns:1fr;gap:0}
 .ingredient{padding:12px}
 .filters{gap:8px}
 .recipe-heading h3{font-size:15px}}
</style>

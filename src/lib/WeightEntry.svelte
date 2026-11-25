<script lang="ts">
 import FieldNotice from './FieldNotice.svelte';
 import BrandPortions from './BrandPortions.svelte';
 import {brandDraft,brandTotal,brandWeight,type BrandDraft} from './ingredient-brands.ts';
 import Button from '#lib/ui/Button.svelte';
 import Input from 'flowbite-svelte/Input.svelte';
 import {untrack} from 'svelte';
 import type {Role} from './access.ts';
 import type {BatchIngredient,FormulationBatch} from './formulation-batches.ts';
 import {weightAmount,weightDifference,validateWeight,validActualQuantity,batchEventLabels,type BatchWeight,type WeightChange} from './formulation-weighing.ts';
 let {batch,ingredient,record,role,busy,onchange}:{batch:FormulationBatch;ingredient:BatchIngredient;record:BatchWeight|undefined;role:Role|null;busy:boolean;onchange:(input:WeightChange)=>Promise<FormulationBatch>}=$props();
 let actual=$state(''),lot=$state(''),expiry=$state(''),note=$state(''),error=$state(''),feedback=$state(''),correcting=$state(false);
 let notice:FieldNotice;
 let form:HTMLFormElement;
 let portions=$state<BrandDraft[]>([]);
 const recipeIngredient=$derived(batch.recipe_snapshot.ingredients.find(i=>i.id===ingredient.ingredient_id));
 function draftPortions(saved:BatchWeight|null|undefined){
  return saved?.brands?.map(b=>brandDraft(b.name,String(b.actual_quantity),b.lot??'',b.expiry_date??''))??[];
 }
 let baseline=$state<BatchWeight|null>(null),initialized=$state(false);
 let retrySignature='',retryId='';
 const number=new Intl.NumberFormat('es-AR',{maximumFractionDigits:6});
 const percent=new Intl.NumberFormat('es-AR',{maximumFractionDigits:2});
 const dirty=$derived(JSON.stringify(portions)!==JSON.stringify(draftPortions(baseline))||actual!==(baseline?String(baseline.actual_quantity):'')||lot!==(baseline?.lot??'')||expiry!==(baseline?.expiry_date??''));
 const stale=$derived((record?.revision??0)!==(baseline?.revision??0));
 const editable=$derived(!record?.incorporated&&batch.status!=='closed'||role==='admin'&&correcting);
 const value=$derived(portions.length?brandTotal(portions):weightAmount(actual));
 const comparison=$derived(Number.isFinite(value)&&value>0?weightDifference(ingredient,value):null);
 const events=$derived((batch.events??[]).filter(event=>event.ingredient_id===ingredient.ingredient_id).toSorted((a,b)=>a.occurred_at.localeCompare(b.occurred_at)));
 const inputId=$derived('weight-'+batch.id+'-'+ingredient.ingredient_id);
 function apply(saved:BatchWeight|undefined){baseline=saved?structuredClone($state.snapshot(saved)):null;portions=draftPortions(saved);actual=saved?String(saved.actual_quantity):'';lot=saved?.lot??'';expiry=saved?.expiry_date??'';note='';correcting=false;initialized=true;}
 $effect(()=>{const saved=record;untrack(()=>{if(!initialized||!dirty&&!correcting)apply(saved);});});
 async function change(action:'save'|'incorporate'|'correct'){
  if(busy || (action!=='incorporate' && notice.showFirst(form)))return;error='';feedback='';
  try{
   const measured=action!=='incorporate'&&portions.length?brandWeight(portions):{actual_quantity:value,lot:lot.trim()||null,expiry_date:expiry||null};
   if(action!=='incorporate')validateWeight(measured.actual_quantity,measured.lot,measured.expiry_date);
   if(action==='incorporate'&&(dirty||stale||!record))throw new Error('Guardá el peso y sus datos antes de confirmar la incorporación.');
   if(note.trim().length>500)throw new Error('La observación no puede superar los 500 caracteres.');
   const input=action==='incorporate'?{action,batch_id:batch.id,ingredient_id:ingredient.ingredient_id,expected_revision:baseline?.revision??0}:{action,batch_id:batch.id,ingredient_id:ingredient.ingredient_id,expected_revision:baseline?.revision??0,...measured,note:note.trim()||null};
   const signature=JSON.stringify(input);if(signature!==retrySignature){retrySignature=signature;retryId=crypto.randomUUID();}
   const updated=await onchange({...input,request_id:retryId} as WeightChange);
   apply(updated.weighings?.find(weight=>weight.ingredient_id===ingredient.ingredient_id));retrySignature='';retryId='';
   feedback=action==='incorporate'?'Incorporación confirmada.':action==='correct'?'Corrección guardada en el historial.':'Peso registrado.';
  }catch(failure){error=failure instanceof Error?failure.message:'No se pudo guardar el registro.';}
 }
 function formatEventValue(snapshot:Record<string,unknown>|null,key:string){const value=snapshot?.[key];return typeof value==='number'?number.format(value):typeof value==='string'?value:'Sin dato';}
 function displayTime(value:string){return new Intl.DateTimeFormat('es-AR',{dateStyle:'short',timeStyle:'short'}).format(new Date(value));}
</script>

<li class="weight-row" aria-label={'Pesaje de '+ingredient.name}>
 <div class="row-heading"><label for={inputId}>{ingredient.name}{#if ingredient.optional}<small> (opcional)</small>{/if}</label><span>Esperado: {number.format(ingredient.expected_quantity)} {ingredient.unit}</span></div>
 <FieldNotice bind:this={notice}/>
 <form bind:this={form} onsubmit={(event)=>{event.preventDefault();void change(correcting?'correct':'save');}} novalidate>
 <fieldset disabled={busy}>
  {#if portions.length}
   <BrandPortions bind:rows={portions} options={recipeIngredient?[recipeIngredient.name,...recipeIngredient.alternatives]:[ingredient.name]} unit={ingredient.unit} readonly={!editable}/>
  {:else}
  <div class="weight-input"><Input id={inputId} data-problem={editable&&!validActualQuantity(value)?'Ingresá el peso real de '+ingredient.name+' en '+ingredient.unit+'.':undefined} aria-label={'Peso real de '+ingredient.name} inputmode="decimal" bind:value={actual} readonly={!editable} autocomplete="off" aria-describedby={actual.trim()||record?inputId+'-difference':undefined}/><span class="unit">{ingredient.unit}</span><details class="help"><summary aria-label={'Ver referencia de '+ingredient.name}>?</summary><p>Base: {number.format(ingredient.base_quantity)} {ingredient.unit} por unidad. {#if ingredient.lower_limit!==null&&ingredient.upper_limit!==null}Rango aprobado: {number.format(ingredient.lower_limit)} a {number.format(ingredient.upper_limit)} {ingredient.unit}.{:else}No hay tolerancias aprobadas definidas.{/if}</p></details></div>
  {#if editable}<Button type="button" onclick={()=>portions=[brandDraft('',actual,lot,expiry)]}>Otra marca</Button>
   <Button type="button" onclick={()=>portions=[brandDraft(ingredient.name,actual,lot,expiry),brandDraft()]}>Combinar marcas</Button>{/if}
  {/if}
  {#if actual.trim()||record||portions.length}<div class="difference" id={inputId+'-difference'}>
   {#if comparison}<span class:warning={comparison.within===false}>{comparison.within===false?'⚠ Fuera de tolerancia':comparison.within===true?'✓ Dentro de tolerancia':'Diferencia registrada'}: {comparison.difference>0?'+':''}{number.format(comparison.difference)} {ingredient.unit}{#if comparison.percent!==null}{' '}({comparison.percent>0?'+':''}{percent.format(comparison.percent)} %){/if}</span>{:else}<span>Pendiente de un peso válido.</span>{/if}
   <strong>{dirty||!record?'Sin guardar':record.incorporated?'Incorporado':'Peso guardado · pendiente de incorporar'}</strong>
  </div>{/if}
  {#if !portions.length}<details class="traceability"><summary>Lote y vencimiento (opcional)</summary><div class="trace-fields"><label for={inputId+'-lot'}>Lote de {ingredient.name}<Input id={inputId+'-lot'} bind:value={lot} maxlength={120} readonly={!editable}/></label><label for={inputId+'-expiry'}>Vencimiento de {ingredient.name}<Input id={inputId+'-expiry'} type="date" bind:value={expiry} readonly={!editable}/></label></div>{#if expiry&&expiry<batch.date}<p class="warning">⚠ El vencimiento es anterior a la fecha de producción.</p>{/if}</details>{/if}
  {#if correcting}<label class="note" for={inputId+'-note'}>Observación de corrección (opcional)<textarea id={inputId+'-note'} bind:value={note} maxlength="500" rows="2"></textarea></label><p>La incorporación seguirá confirmada. Se conservarán el registro anterior y esta corrección en el historial.</p>{/if}
  {#if stale}<p class="warning">El registro cambió en otra sesión. Revisá el peso guardado antes de continuar.</p><Button type="button" onclick={()=>{apply(record);error='';feedback='';}}>Recargar peso guardado</Button>{/if}
  {#if error}<p class="error" role="alert">{error}</p>{/if}
  {#if feedback&&!dirty&&!stale}<p class="success" role="status">{feedback}</p>{/if}
  <div class="actions">
   {#if editable&&(actual.trim()||portions.length)}<Button type="submit" disabled={stale||!!record&&!dirty&&!correcting} color="primary">{busy?'Guardando…':correcting?'Guardar corrección':record?'Guardar cambios de peso':'Registrar peso'}</Button>{/if}
   {#if record&&!record.incorporated&&batch.status!=='closed'}<Button type="button" disabled={dirty||stale} onclick={()=>void change('incorporate')}>Confirmar incorporación</Button>{/if}
   {#if record?.incorporated&&role==='admin'&&!correcting}<Button type="button" onclick={()=>{correcting=true;error='';feedback='';}}>Corregir registro</Button>{/if}
   {#if correcting}<Button type="button" onclick={()=>{apply(record);error='';feedback='';}}>Cancelar corrección</Button>{/if}
  </div>
 </fieldset></form>
 {#if events.length}<details class="history"><summary>Historial de {ingredient.name}</summary>{#each events as event (event.id)}<div class="event"><strong>{batchEventLabels[event.action]}</strong><p>{event.actor_name??event.actor_id} · <time datetime={event.occurred_at}>{displayTime(event.occurred_at)}</time></p><p>{event.before_snapshot?formatEventValue(event.before_snapshot,'actual_quantity')+' → ':''}{formatEventValue(event.after_snapshot,'actual_quantity')} {ingredient.unit}</p>{#if event.before_snapshot?.lot!==event.after_snapshot.lot||event.before_snapshot?.expiry_date!==event.after_snapshot.expiry_date}<p>Lote: {formatEventValue(event.before_snapshot,'lot')} → {formatEventValue(event.after_snapshot,'lot')} · Vencimiento: {formatEventValue(event.before_snapshot,'expiry_date')} → {formatEventValue(event.after_snapshot,'expiry_date')}</p>{/if}{#if event.note}<p>Observación: {event.note}</p>{/if}</div>{/each}</details>{/if}
</li>
<style>
 .weight-row{list-style:none;border-top:1px solid #ededed;padding:22px 0}
 .row-heading{display:flex;justify-content:space-between;align-items:baseline;gap:16px;margin-bottom:10px}
 .row-heading>label{font-size:14px;font-weight:600;overflow-wrap:anywhere}
 .row-heading>span{font-size:12px;color:#52645a;text-align:right;flex-shrink:0}
 small{font-size:11px;font-weight:400}
 fieldset{border:0;margin:0;padding:0;min-width:0}
 .weight-input{display:flex;gap:12px;align-items:center}
 textarea{box-sizing:border-box;width:100%;min-height:44px;border:1px solid #ddd;border-radius:9px;padding:10px 14px;font:inherit;background:#fff;color:#202b3a}
 .unit{font-size:13px;color:#65776d;flex-shrink:0}
 .help{position:relative}
 .help>summary{display:block;width:22px;height:22px;border:1px solid #8b958e;border-radius:50%;font-size:12px;line-height:22px;text-align:center;cursor:pointer;list-style:none}
 .help[open]>p{position:absolute;right:0;top:22px;width:min(260px,70vw);padding:14px;background:white;border:1px solid #ddd;border-radius:9px;z-index:1;box-shadow:0 4px 18px #132f3617}
 .difference{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;font-size:11px;color:#65776d;margin:10px 0}
 .difference>strong{font-weight:500}
 summary{cursor:pointer;font-size:12px;min-height:28px;padding-top:7px}
 .trace-fields{display:grid;grid-template-columns:1fr 1fr;gap:14px}
 .trace-fields label,.note{display:block;font-size:12px;margin:12px 0 8px}
 .note textarea{display:block;margin-top:8px}
 .note textarea{resize:vertical}
 .actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:12px}
 p{font-size:12px;color:#65776d;line-height:1.7}
 .warning,.error{color:#9b491a}
 .error{background:#fff0eb;padding:10px;border-radius:6px}
 .success{color:#285f49}
 .history{margin-top:14px;padding:10px 14px;background:#f6f8f6;border-radius:8px}
 .event{border-top:1px solid #e2e6e2;padding:12px 0;font-size:12px;overflow-wrap:anywhere}
 .event>strong{font-size:12px}
 .event p{margin:4px 0}
 @media(max-width:620px){
 .row-heading{gap:10px}
 .row-heading>span{font-size:11px}
 .trace-fields{grid-template-columns:1fr;gap:0}
 .weight-input{gap:9px}}
</style>

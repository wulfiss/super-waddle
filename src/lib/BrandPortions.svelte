<script lang="ts">
 import {tick} from 'svelte';
 import {validActualQuantity,weightAmount} from './formulation-weighing.ts';
 import Button from './ui/Button.svelte';
 import {brandDraft, brandTotal, type BrandDraft} from './ingredient-brands.ts';
 let {rows=$bindable(), options, unit, readonly=false}:{
  rows:BrandDraft[]; options:string[]; unit:string; readonly?:boolean
 }=$props();
 const id=$props.id();
 function rowLabel(row:BrandDraft,index:number){return row.name.trim()||'la marca '+(index+1);}
 const total=$derived(brandTotal(rows));
 const format=new Intl.NumberFormat('es-AR',{maximumFractionDigits:6});
 async function add(){
  rows=[...rows,brandDraft()];
  await tick();
  document.getElementById(id+'-name-'+(rows.length-1))?.focus();
 }
</script>

<datalist id={id+'-options'}>{#each options as option}<option value={option}></option>{/each}</datalist>
{#each rows as row,i (i)}
 <fieldset class="portion">
  <legend>Marca {i+1}</legend>
  <label>Marca<input id={id+'-name-'+i} list={id+'-options'} data-problem={!readonly&&!row.name.trim()?'Escribí o elegí el nombre de la marca '+(i+1)+'.':undefined} placeholder="Elegí o escribí una marca" bind:value={row.name} maxlength="160" required {readonly}/></label>
  <label>Cantidad ({unit})<input data-problem={!readonly&&!validActualQuantity(weightAmount(row.quantity))?'Ingresá la cantidad de '+rowLabel(row,i)+' en '+unit+'.':undefined} inputmode="decimal" placeholder="0" bind:value={row.quantity} required {readonly}/></label>
  <label>Lote{rows.length===1?' (opcional)':''}<input data-problem={!readonly&&rows.length>1&&!row.lot.trim()?'Escribí el lote de '+rowLabel(row,i)+'.':undefined} bind:value={row.lot} maxlength="120" required={rows.length>1} {readonly}/></label>
  <label>Vencimiento{rows.length===1?' (opcional)':''}<input type="date" data-problem={!readonly&&rows.length>1&&!row.expiry?'Elegí el vencimiento de '+rowLabel(row,i)+'.':undefined} bind:value={row.expiry} required={rows.length>1} {readonly}/></label>
  {#if !readonly && rows.length>1}<Button type="button" onclick={()=>rows=rows.filter((_,index)=>index!==i)}>Quitar marca {i+1}</Button>{/if}
 </fieldset>
{/each}
<div class="foot">{#if !readonly}<Button type="button" onclick={add}>Agregar otra marca</Button>{/if}
 {#if rows.length>1}<strong>Total: {Number.isFinite(total)?format.format(total):'—'} {unit}</strong>{/if}
</div>
<style>
 .portion{margin:12px 0;padding:10px 12px 14px;border:1px solid #dbe5de;border-radius:9px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;min-width:0}
 legend,strong{font-size:13px;color:#285f49;font-weight:600}
 label{display:grid;gap:4px;min-width:0;font-size:13px}
 input{min-width:0;width:100%;min-height:44px;border:1px solid #ccd8d1;border-radius:7px;padding:8px;background:white;font:inherit}
 .foot{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
</style>

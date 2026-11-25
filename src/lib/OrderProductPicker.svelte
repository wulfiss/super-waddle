<script lang="ts">
 import {tick} from 'svelte';
 import Button from './ui/Button.svelte';
 import {orderQuantityFormat, productCategories, type ProductCategory, type Product, type Item} from './production.ts';
 import {matchesHistorySearch} from './history-search.ts';

 let {products, items, onchange}: {products:Product[]; items:Item[]; onchange:(next:Item[])=>void}=$props();
 const pageSize=4;
 let search=$state(''), category=$state<ProductCategory|'all'>('all'), limit=$state(pageSize);
 let active=$state<string|null>(null), draft=$state(''), problem=$state('');
 let field=$state<HTMLInputElement>();
 let selected=$derived(new Map(items.map(item=>[item.product_id,item])));
 let matches=$derived(products.filter(product=>(category==='all'||product.category===category)
  && matchesHistorySearch(search,product.name)));
 let visible=$derived(matches.slice(0,limit));
 let visibleIds=$derived(new Set(visible.map(product=>product.id)));
 let otherItems=$derived(items.filter(item=>!visibleIds.has(item.product_id)));

 function resetList(){
  limit=pageSize;
  active=null;
 }
 async function edit(id:string){
  active=id;
  const item=selected.get(id);
  draft=item?orderQuantityFormat.format(item.quantity):'';
  problem='';
  await tick();
  field?.focus();
  field?.select();
 }
 async function closeEditor(id:string){
  active=null;
  problem='';
  await tick();
  (document.getElementById('choose-'+id)??document.getElementById('order-search'))?.focus({preventScroll:true});
 }
 function commit(line:Omit<Item,'quantity'>){
  const text=draft.trim();
  const quantity=Number(text.replace(',','.'));
  if(!/^(?:\d+(?:[.,]\d*)?|[.,]\d+)$/.test(text)||!Number.isFinite(quantity)||quantity<=0){
   problem='Ingresá una cantidad mayor que cero.';
   field?.focus();
   return;
  }
  const id=line.product_id;
  onchange(selected.has(id)?items.map(item=>item.product_id===id?{...item,quantity}:item):[...items,{...line,quantity}]);
  void closeEditor(id);
 }
 export function readyToReview(){
  if(!active || (!visibleIds.has(active) && !selected.has(active)))return true;
  problem='Confirmá la cantidad o tocá Cancelar para revisar el pedido.';
  field?.focus();
  return false;
 }
</script>

{#snippet row(line:Omit<Item,'quantity'>)}
 {@const id=line.product_id}
 {@const saved=selected.get(id)}
 <div class="product" class:editing={active===id}>
  {#if active===id}
   <strong>{line.name}</strong>
   <label for="order-quantity">¿Cuánto necesitás?</label>
   <div class="amount"><input id="order-quantity" aria-label={'Cantidad de '+line.name} inputmode="decimal"
    aria-invalid={!!problem} aria-describedby={problem?'order-unit order-quantity-error':'order-unit'}
    bind:this={field} bind:value={draft} oninput={()=>problem=''} onkeydown={event=>{
     if(event.key==='Enter'){event.preventDefault();commit(line);}
     if(event.key==='Escape'){event.preventDefault();void closeEditor(id);}
    }}/><span id="order-unit">{line.unit}</span></div>
   {#if problem}<p id="order-quantity-error" role="alert">{problem}</p>{/if}
   <div class="actions">
    <Button type="button" color="primary" onclick={()=>commit(line)}>{saved?'Actualizar cantidad':'Agregar al pedido'}</Button>
    <Button type="button" onclick={()=>void closeEditor(id)}>Cancelar</Button>
    {#if saved}<Button type="button" aria-label={'Quitar '+line.name} onclick={()=>{
     onchange(items.filter(item=>item.product_id!==id));void closeEditor(id);
    }}>Quitar del pedido</Button>{/if}
   </div>
  {:else}
   <button id={'choose-'+id} class="choose" type="button" aria-label={saved?'Cambiar '+line.name:line.name+' '+line.unit}
    onclick={()=>void edit(id)}>
    <span><strong>{line.name}</strong><small>{saved?'Agregado · '+orderQuantityFormat.format(saved.quantity)+' '+line.unit:line.unit}</small></span>
    <span class="action-label">{saved?'Cambiar':'＋'}</span>
   </button>
  {/if}
 </div>
{/snippet}

<section aria-label="Productos del pedido">
 <label class="question" for="order-search">¿Qué producto necesitás?</label>
 <input id="order-search" type="search" aria-label="Buscar productos" placeholder="Buscar producto" autocomplete="off"
  bind:value={search} oninput={resetList}/>
 <div class="filters" role="group" aria-label="Filtrar productos por categoría">
  <button type="button" aria-pressed={category==='all'} onclick={()=>{category='all';resetList();}}>Todos</button>
  {#each Object.entries(productCategories) as [key,label] (key)}
   <button type="button" aria-pressed={category===key} onclick={()=>{category=key as ProductCategory;resetList();}}>{label}</button>
  {/each}
 </div>
 <div role="region" aria-label="Productos disponibles">
  {#each visible as product (product.id)}
   {@render row(selected.get(product.id)??{product_id:product.id,name:product.name,unit:product.unit,code:product.code,category:product.category})}
  {:else}<p>{products.length?'No hay productos que coincidan con la búsqueda.':'Todavía no hay productos en el catálogo.'}</p>{/each}
 </div>
 {#if matches.length>limit}<button type="button" class="more" onclick={()=>limit+=pageSize}>Ver más productos</button>{/if}
 {#if otherItems.length}
  <h3>En tu pedido</h3>
  {#each otherItems as item (item.product_id)}{@render row(item)}{/each}
 {/if}
</section>

<style>
 section{background:white;border:1px solid #e2e6e9;border-radius:12px;padding:var(--panel-padding)}
 .question,h3{display:block;font-size:17px;font-weight:650;margin:0 0 12px}
 h3{margin-top:20px}
 input{font:inherit;font-size:16px;color:#203a31;border:1px solid #bbc9c0;border-radius:7px;padding:10px 12px;min-height:46px;width:100%}
 button{cursor:pointer;font:inherit}
 .filters,.actions{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0}
 .filters button,.more{border:1px solid #dfe5e2;background:white;color:#285f49;min-height:44px;border-radius:7px;padding:8px 12px;font-size:14px}
 .filters [aria-pressed=true]{background:#285f49;border-color:#285f49;color:white}
 .product{border:1px solid #dfe5e2;border-radius:8px;margin:8px 0;overflow-wrap:anywhere;scroll-margin-block:12px 100px}
 .choose{display:flex;align-items:center;justify-content:space-between;gap:12px;text-align:left;width:100%;padding:12px 14px;border:0;border-radius:inherit;background:white;color:#203a31;font-size:16px}
 .choose:hover{background:#f3f7f4}
 small,label{display:block;font-size:14px;margin-top:4px;color:#52645a}
 .action-label,.more{font-weight:600;color:#285f49}
 .editing{padding:14px;border-color:#76a389}
 .editing label{margin:12px 0 6px}
 .amount{display:flex;align-items:center;gap:10px}
 .amount input{flex:1;min-width:0;max-width:14rem}
 .amount span{flex:0 0 auto;max-width:45%}
 .actions{margin-bottom:0}
 [role=alert]{color:#963f32}
 .more{display:block;margin:auto;border:0;text-decoration:underline}
 :is(input,button):focus-visible{outline:2px solid #285f49;outline-offset:2px}
</style>

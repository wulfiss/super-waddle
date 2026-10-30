<script lang="ts">
 import type {Product} from './production.ts';
 import type {CatalogChange} from './catalog.ts';
 let {products,busy,onchange}:{products:Product[];busy:boolean;onchange:(change:CatalogChange)=>Promise<void>}=$props();
 let code=$state(''),name=$state(''),unit=$state(''),search=$state(''),error=$state('');
 let editing=$state<Product|null>(null),removing=$state<Product|null>(null),dialog=$state<HTMLDialogElement>();
 const filtered=$derived(products.filter(product=>[product.name,product.code ?? ''].some(value=>value.toLocaleLowerCase('es-AR').includes(search.toLocaleLowerCase('es-AR')))));
 function clear(){editing=null;code='';name='';unit='';error='';}
 function edit(product:Product){editing={...product};code=product.code ?? '';name=product.name;unit=product.unit;error='';window.scrollTo({top:0,behavior:'smooth'});}
 async function save(event:SubmitEvent){event.preventDefault();if(busy)return;error='';try{await onchange({action:'save',draft:{code,name,unit},id:editing?.id,revision:editing?.revision ?? 1});clear();}catch(failure){error=failure instanceof Error?failure.message:'No se pudo guardar el producto.';}}
 async function remove(){if(busy||!removing)return;error='';try{await onchange({action:'remove',id:removing.id,revision:removing.revision ?? 1});if(editing?.id===removing.id)clear();dialog?.close();removing=null;}catch(failure){dialog?.close();error=failure instanceof Error?failure.message:'No se pudo eliminar el producto.';}}
</script>

<section aria-label="Administrar productos">
 <div class="card"><h2>{editing?'Editar producto':'Nuevo producto'}</h2><p>El catálogo que usa panadería para armar sus pedidos.</p>
 {#if error}<p class="error" role="alert">{error}</p>{/if}
 <form onsubmit={save}><fieldset disabled={busy}><div class="fields">
  <div><label for="product-code">Código del producto</label><input id="product-code" bind:value={code} required maxlength="80" placeholder="Ej.: 001"/></div>
  <div><label for="product-name">Nombre del producto</label><input id="product-name" bind:value={name} required maxlength="160" placeholder="Nombre"/></div>
  <div><label for="product-unit">Unidad</label><input id="product-unit" bind:value={unit} required maxlength="40" placeholder="Ej.: kg, unidades, docenas"/></div>
 </div><div class="actions">{#if editing}<button type="button" onclick={clear}>Cancelar edición</button>{/if}<button class="primary" type="submit">{busy?'Guardando…':editing?'Guardar producto':'Agregar producto'}</button></div></fieldset></form></div>
 <div class="card"><h2>Productos disponibles</h2><label for="catalog-search">Buscar por código o nombre</label><input id="catalog-search" type="search" bind:value={search}/>
 {#each filtered as product (product.id)}<article aria-label={product.name}><div><h3>{product.name}</h3><p>Código: {product.code ?? 'Sin código'} · Unidad: {product.unit}</p></div><div class="actions"><button type="button" disabled={busy} onclick={()=>edit(product)}>Editar producto</button><button type="button" class="danger" disabled={busy} onclick={()=>{removing=product;dialog?.showModal();}}>Eliminar producto</button></div></article>
 {:else}<p>{products.length?'No hay coincidencias.':'Todavía no hay productos disponibles.'}</p>{/each}</div>
</section>
<dialog bind:this={dialog} aria-labelledby="remove-product-title" oncancel={(event)=>{if(busy)event.preventDefault();}}>
 <h2 id="remove-product-title">¿Eliminar este producto?</h2><p><strong>{removing?.name}</strong> dejará de estar disponible para nuevos pedidos. Los pedidos existentes conservarán sus datos.</p>
 <div class="actions"><button type="button" disabled={busy} onclick={()=>dialog?.close()}>Volver al catálogo</button><button class="danger" type="button" disabled={busy} onclick={remove}>Sí, eliminar producto</button></div>
</dialog>
<style>
 .card{background:white;border:1px solid #e2e6e9;border-radius:12px;padding:25px;margin-bottom:20px}h2{font-size:17px;margin:0 0 12px}h3{font-size:14px;margin:0}p{font-size:12px;color:#718078;line-height:1.7}fieldset{border:0;margin:0;padding:0;min-width:0}.fields{display:grid;grid-template-columns:1fr 2fr 1fr;gap:16px;margin:22px 0}label{display:block;font-size:12px;color:#56635e;margin:16px 0 8px}input{width:100%;min-height:44px;border:1px solid #dfe5e2;border-radius:7px;padding:10px;font:inherit}input:focus{outline:2px solid #9dc3b1;outline-offset:1px}.actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:15px}button{border:1px solid #dfe5e2;border-radius:7px;background:white;color:#285f49;min-height:44px;padding:10px 14px;font-size:12px}.primary{background:#285f49;color:white}.danger,.error{color:#973f34}article{border-top:1px solid #e7ece8;padding:20px 0;margin-top:18px;overflow-wrap:anywhere}dialog{width:min(500px,calc(100% - 32px));border:1px solid #dfe5e2;border-radius:12px;padding:26px;color:#202b3a}dialog::backdrop{background:#142d3480}
 @media(max-width:620px){.card{padding:20px 16px}.fields{grid-template-columns:1fr;gap:0}.actions button{flex:1}}
</style>

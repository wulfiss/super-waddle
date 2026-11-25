<script module lang="ts">
 export const bakeryOptions = [
  {name:'Nuevo pedido', description:'Pedí los productos e insumos que necesitás de depósito.'},
  {name:'Pedido extra', description:'Agregá un pedido adicional por faltantes o reposición.'},
  {name:'Elaboraciones', description:'Registrá una preparación o continuá una que esté en curso.'},
  {name:'Historial', description:'Consultá tus pedidos y las elaboraciones confirmadas.'}
 ] as const;
</script>

<script lang="ts">
 let {onopen, disabled}: {onopen:(option:typeof bakeryOptions[number]['name'])=>void; disabled:boolean} = $props();
</script>

<nav class="options" aria-label="Opciones de panadería">
 {#each bakeryOptions as option (option.name)}
  <button type="button" {disabled} onclick={() => onopen(option.name)}>
   <strong>{option.name}</strong>
   <span class="description">{option.description}</span>
   <span class="arrow" aria-hidden="true">→</span>
  </button>
 {/each}
</nav>

<style>
 .options{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
 button{display:grid;grid-template-columns:1fr auto;align-content:start;align-items:center;gap:8px 16px;background:white;color:#202b3a;text-align:left;border:1px solid #dfe6e1;border-radius:12px;padding:var(--panel-padding);font:inherit;cursor:pointer}
 button:hover{background:#f4f8f5;border-color:#89a593}
 button:focus-visible{outline:2px solid #285f49;outline-offset:3px}
 strong{font-size:18px}
 .description{grid-row:2;grid-column:1/-1;color:#52645a;font-size:14px;line-height:1.5}
 .arrow{grid-row:1;grid-column:2;color:#285f49;font-size:20px}
 @media(max-width:620px){.options{grid-template-columns:1fr;gap:10px}}
</style>

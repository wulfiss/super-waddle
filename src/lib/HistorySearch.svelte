<script lang="ts">
 let {label, value = $bindable('')}: {label:string; value?:string} = $props();
</script>

<input class="history-search" type="search" aria-label={label} placeholder={label} bind:value/>

<style>
 .history-search{width:100%;min-height:44px;padding:10px 14px;margin-bottom:var(--section-gap);border:1px solid #b9c5bd;border-radius:8px;background:white}
 .history-search:focus-visible{outline:2px solid #285f49;outline-offset:2px}
</style>

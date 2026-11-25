<script lang="ts">
 import FlowbiteButton from 'flowbite-svelte/Button.svelte';
 import type {ButtonProps} from 'flowbite-svelte';
 let {color='alternative',size='sm',class:className='',...props}:ButtonProps=$props();
</script>
<FlowbiteButton {...props} {color} {size} class={(color==='alternative'?'border-gray-200 ':'border-transparent ')+'border border-solid min-h-11 rounded-lg text-[13px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-700 '+className}/>

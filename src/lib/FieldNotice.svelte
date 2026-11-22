<script lang="ts">
 import { tick } from 'svelte';
 import Button from './ui/Button.svelte';

 let { reveal }: { reveal?: (field: HTMLElement) => void } = $props();
 const id = $props.id();
 let dialog: HTMLDialogElement;
 let message = $state('');
 let target: HTMLElement | null = null;

 export function showFirst(scope: ParentNode | null, selector = '[data-problem]') {
  const field = scope?.querySelector<HTMLElement>(selector);
  if (!field?.dataset.problem) return false;
  target = field;
  message = field.dataset.problem;
  dialog.showModal();
  return true;
 }

 async function goToField() {
  const field = target;
  target = null;
  if (!field?.isConnected) return;
  reveal?.(field);
  await tick();
  field.focus({ preventScroll: true });
  field.scrollIntoView({ block: 'center', behavior: 'instant' });
 }
</script>

<dialog bind:this={dialog} role="alertdialog" aria-labelledby={id+'-title'} aria-describedby={id+'-message'} onclose={goToField}>
 <h2 id={id+'-title'}>Revisá este dato</h2>
 <p id={id+'-message'}>{message}</p>
 <Button type="button" color="primary" onclick={()=>dialog.close()}>Ir al campo</Button>
</dialog>

<style>
 dialog{position:fixed;inset:0;margin:auto;width:min(23rem,calc(100% - 2rem));max-height:85dvh;overflow:auto;padding:1.5rem;border:1px solid #cddbd2;border-radius:12px;background:#fff;color:#202b3a;box-shadow:0 12px 36px #142d342b}
 dialog::backdrop{background:#142d3470}
 h2{margin:0;font-size:1.2rem}p{margin:.65rem 0 1.2rem;font-size:1rem;line-height:1.5;overflow-wrap:anywhere}
 dialog :global(button){width:100%}
</style>

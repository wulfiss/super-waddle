<script lang="ts" generics="T extends string">
 import Button from '#lib/ui/Button.svelte';
 let { screens, selected, onchange, labels, label = 'Pantallas', panel = 'screen-panel' }: {
  screens: readonly T[]; selected: T; onchange: (screen: T) => void;
  labels: Record<T,string>; label?: string; panel?: string;
 } = $props();
 function navigate(event: KeyboardEvent) {
  const offset = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
  if (!offset && event.key !== 'Home' && event.key !== 'End') return;
  event.preventDefault();
  const index = event.key === 'Home' ? 0 : event.key === 'End' ? screens.length - 1
   : (screens.indexOf(selected) + offset + screens.length) % screens.length;
  const buttons = (event.currentTarget as HTMLElement).closest('[role="tablist"]')?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
  buttons?.[index]?.focus();
  onchange(screens[index]);
 }
</script>

<div class="screen-tabs" role="tablist" aria-label={label}>
 {#each screens as screen (screen)}
  <Button type="button" role="tab" id={'tab-' + screen} aria-controls={panel}
   aria-selected={selected === screen} tabindex={selected === screen ? 0 : -1}
   color={selected === screen ? 'primary' : 'alternative'} class="flex-1 min-w-0 px-1" onkeydown={navigate} onclick={() => onchange(screen)}>{labels[screen]}</Button>
 {/each}
</div>

<style>
 .screen-tabs{display:flex;gap:6px;padding:6px;background:#eaf0ec;border:1px solid #dfe7e1;border-radius:10px;margin-bottom:27px}
 @media(max-width:620px){.screen-tabs{gap:3px;padding:4px;margin-bottom:22px}}
</style>

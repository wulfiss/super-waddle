<script lang="ts">
 import { screenLabels, type Screen } from './access.ts';
 let { screens, selected, onchange }: {
  screens: readonly Screen[]; selected: Screen; onchange: (screen: Screen) => void;
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

<div class="screen-tabs" role="tablist" aria-label="Pantallas">
 {#each screens as screen (screen)}
  <button type="button" role="tab" id={'tab-' + screen} aria-controls="screen-panel"
   aria-selected={selected === screen} tabindex={selected === screen ? 0 : -1}
   class:active={selected === screen} onkeydown={navigate} onclick={() => onchange(screen)}>{screenLabels[screen]}</button>
 {/each}
</div>

<style>
 .screen-tabs{display:flex;gap:6px;padding:6px;background:#eaf0ec;border:1px solid #dfe7e1;border-radius:10px;margin-bottom:27px}
 button{flex:1;min-width:0;min-height:44px;padding:10px 12px;border:0;border-radius:7px;background:transparent;color:#5e7267;font-size:13px;font-weight:600}
 button.active{background:white;color:#245e48;box-shadow:0 1px 4px #243c3014}
 @media(max-width:620px){button{font-size:11px;padding:9px 5px}.screen-tabs{gap:3px;padding:4px;margin-bottom:22px}}
</style>

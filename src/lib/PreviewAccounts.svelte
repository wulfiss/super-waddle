<script lang="ts">
 import Select from 'flowbite-svelte/Select.svelte';
 import { roleLabels } from './access.ts';
 import { previewAccounts, type PreviewAccount } from './preview-accounts.ts';
 let { selected, onchange, disabled = false, accounts=previewAccounts }: { selected: string; onchange: (id: string) => void; disabled?:boolean; accounts?:readonly PreviewAccount[] } = $props();
</script>

<section class="accounts" aria-label="Cuentas de prueba">
 <div><span class="eyebrow">VISTA PREVIA</span><h2>Cambiá de cuenta para probar</h2>
  <p>Sin correo ni contraseña. Los datos de prueba se guardan solo en este navegador.</p></div>
 <label for="preview-account">Cuenta de prueba</label>
 <Select placeholder="" id="preview-account" value={selected} {disabled} onchange={(event:Event) => onchange((event.currentTarget as HTMLSelectElement).value)}>
  {#each accounts as account (account.id)}<option value={account.id}>{account.name} · {roleLabels[account.role]}</option>{/each}
 </Select>
</section>

<style>
 .accounts{background:#eff4ef;border:1px solid #dce7dc;border-radius:10px;padding:20px;margin-bottom:24px}
 .eyebrow{font-size:9px;font-weight:700;letter-spacing:1.5px;color:#608776}
 h2{font-size:15px;margin:7px 0}
 p{font-size:12px;line-height:1.7;color:#66796b;margin:0 0 16px}
 label{display:block;font-size:12px;font-weight:600;margin-bottom:8px;color:#465e50}
 @media(max-width:620px){
 .accounts{padding:16px}}
</style>

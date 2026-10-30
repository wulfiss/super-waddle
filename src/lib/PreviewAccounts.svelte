<script lang="ts">
 import { roleLabels } from './access.ts';
 import { previewAccounts } from './preview-accounts.ts';
 let { selected, onchange }: { selected: string; onchange: (id: string) => void } = $props();
</script>

<section class="accounts" aria-label="Cuentas de prueba">
 <div><span class="eyebrow">VISTA PREVIA</span><h2>Cambiá de cuenta para probar</h2>
  <p>Sin correo ni contraseña. Los pedidos de prueba se guardan solo en este navegador.</p></div>
 <label for="preview-account">Cuenta de prueba</label>
 <select id="preview-account" value={selected} onchange={(event) => onchange(event.currentTarget.value)}>
  {#each previewAccounts as account (account.id)}<option value={account.id}>{account.name} · {roleLabels[account.role]}</option>{/each}
 </select>
</section>

<style>
 .accounts{background:#eff4ef;border:1px solid #dce7dc;border-radius:10px;padding:20px;margin-bottom:24px}.eyebrow{font-size:9px;font-weight:700;letter-spacing:1.5px;color:#608776}h2{font-size:15px;margin:7px 0}p{font-size:12px;line-height:1.7;color:#66796b;margin:0 0 16px}label{display:block;font-size:12px;font-weight:600;margin-bottom:8px;color:#465e50}select{font:inherit;width:100%;min-height:46px;padding:10px 12px;border:1px solid #cddacf;border-radius:7px;background:white;color:#285f49;font-size:12px}select:focus{outline:2px solid #9dc3b1;outline-offset:2px}
 @media(max-width:620px){.accounts{padding:16px}select{font-size:11px;padding:10px 7px}}
</style>

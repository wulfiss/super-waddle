<script lang="ts">
 import type { Screen } from './access.ts';
 let { onopen }: { onopen: (screen: Screen) => void } = $props();
</script>

<section aria-label="Acceso de administrador">
 <span class="badge">ACCESO COMPLETO</span><h2>Todos los espacios, en un solo lugar.</h2>
 <p>Como administrador, podés acceder a panadería y depósito desde las pestañas de arriba.</p>
 <div class="screens">
  <button type="button" onclick={() => onopen('bakery')}><span aria-hidden="true">＋</span><strong>Panadería</strong><small>Creá pedidos y consultá el historial completo.</small><span class="link">Abrir panadería →</span></button>
  <button type="button" onclick={() => onopen('warehouse')}><span aria-hidden="true">▤</span><strong>Depósito</strong><small>Consultá todos los pedidos recibidos y sus cantidades.</small><span class="link">Abrir depósito →</span></button>
 </div>
 <h3>Permisos por perfil</h3>
 <dl><div><dt>Personal de panadería</dt><dd>Panadería · crear y consultar sus propios pedidos.</dd></div><div><dt>Personal de depósito</dt><dd>Depósito · consultar los pedidos de panadería.</dd></div><div><dt>Administrador</dt><dd>Todas las pantallas y el historial completo.</dd></div></dl>
</section>

<style>
 section{background:white;border:1px solid #e2e6e9;border-radius:12px;padding:27px;margin-bottom:20px}.badge{font-size:10px;letter-spacing:1px;color:#547661}h2{font-size:21px;line-height:1.4;margin:12px 0}p{font-size:13px;color:#718078;line-height:1.7}
 .screens{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin:27px 0}button{display:flex;flex-direction:column;align-items:flex-start;text-align:left;border:1px solid #dfe7e1;border-radius:10px;padding:22px;background:#f9fbf9;color:#285f49}button:hover{background:#f0f6f1;border-color:#8eaf9e}button>span:first-child{font-size:25px;margin-bottom:16px}strong{font-size:16px}small{font-size:12px;color:#718078;line-height:1.7;margin:8px 0 20px}.link{font-size:12px;margin-top:auto}h3{font-size:14px;margin:0}dl{margin:16px 0 0}dl>div{padding:14px 0;border-top:1px solid #e7ece8}dt{font-size:12px;font-weight:600}dd{margin:6px 0 0;font-size:12px;color:#718078;line-height:1.6}
 @media(max-width:620px){section{padding:20px 16px}.screens{grid-template-columns:1fr}h2{font-size:19px}}
</style>

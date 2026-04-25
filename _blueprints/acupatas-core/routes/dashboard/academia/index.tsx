import { component$ } from '@builder.io/qwik';

export default component$(() => {
  const card = 'bg-white rounded-2xl border border-[#4a2e85]/10 p-5';
  const pill = 'inline-flex items-center rounded-full border border-[#4a2e85]/15 bg-[#4a2e85]/5 px-3 py-1 text-xs text-[#4a2e85]';

  return (
    <div class="min-h-screen bg-[#f6f6f6]">
      <div class="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
        <header class="space-y-3">
          <div class={pill}>Academia para cuidadores</div>
          <h1 class="text-3xl sm:text-4xl font-extrabold text-[#4a2e85]">Guía práctica para cuidar mascotas con calidad y seguridad</h1>
          <p class="text-[#4a2e85b3]">
            Esta guía resume buenas prácticas de bienestar animal. Úsala como checklist diario y adapta todo a cada mascota.
            Para dudas médicas o señales de alarma, consulta a un veterinario.
          </p>
        </header>

        <section class="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div class={card}>
            <h2 class="text-lg font-semibold text-[#4a2e85]">1) Alimentación y agua</h2>
            <ul class="mt-3 space-y-2 text-sm text-[#4a2e85b3]">
              <li>Respeta la dieta indicada por el dueño (cantidad, horarios, marca y restricciones).</li>
              <li>Agua fresca siempre disponible; cambia el agua al menos 1-2 veces al día.</li>
              <li>Evita dar comida humana o premios no autorizados.</li>
            </ul>
          </div>
          <div class={card}>
            <h2 class="text-lg font-semibold text-[#4a2e85]">2) Ejercicio y estimulación</h2>
            <ul class="mt-3 space-y-2 text-sm text-[#4a2e85b3]">
              <li>Perros: paseos diarios y juego; gatos: juego activo corto y frecuente.</li>
              <li>Evita ejercicio intenso en horas de calor; prioriza sombra e hidratación.</li>
              <li>Enriquecimiento mental: juguetes, olfateo, rutinas y refuerzo positivo.</li>
            </ul>
          </div>
          <div class={card}>
            <h2 class="text-lg font-semibold text-[#4a2e85]">3) Higiene y entorno</h2>
            <ul class="mt-3 space-y-2 text-sm text-[#4a2e85b3]">
              <li>Limpia platos, camas y arenero con frecuencia.</li>
              <li>Mantén el espacio ventilado y libre de riesgos (cables, químicos, basura).</li>
              <li>Revisa almohadillas, orejas, ojos y pelaje por suciedad o irritaciones.</li>
            </ul>
          </div>
        </section>

        <section class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div class={card}>
            <h2 class="text-lg font-semibold text-[#4a2e85]">4) Salud preventiva</h2>
            <ul class="mt-3 space-y-2 text-sm text-[#4a2e85b3]">
              <li>Vacunas y desparasitación deben estar al día (verifica con el dueño).</li>
              <li>Control de pulgas y garrapatas según indicaciones.</li>
              <li>Evita contacto con animales desconocidos si no hay autorización.</li>
            </ul>
          </div>
          <div class={card}>
            <h2 class="text-lg font-semibold text-[#4a2e85]">5) Señales de alarma</h2>
            <ul class="mt-3 space-y-2 text-sm text-[#4a2e85b3]">
              <li>Letargo extremo, vómitos persistentes, diarrea con sangre o convulsiones.</li>
              <li>Dificultad respiratoria, abdomen muy distendido, fiebre o dolor intenso.</li>
              <li>En estos casos, contacta al dueño y al veterinario de inmediato.</li>
            </ul>
          </div>
        </section>

        <section class="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div class={card}>
            <h2 class="text-lg font-semibold text-[#4a2e85]">6) Manejo seguro</h2>
            <ul class="mt-3 space-y-2 text-sm text-[#4a2e85b3]">
              <li>Usa correa y arnés adecuados; confirma identificación y placa.</li>
              <li>Transporte seguro en vehículo: arnés, transportín o separador.</li>
              <li>Evita puertas abiertas y ventanas sin protección.</li>
            </ul>
          </div>
          <div class={card}>
            <h2 class="text-lg font-semibold text-[#4a2e85]">7) Rutinas y conducta</h2>
            <ul class="mt-3 space-y-2 text-sm text-[#4a2e85b3]">
              <li>Mantén horarios consistentes para comida, paseos y descanso.</li>
              <li>Refuerzo positivo: premia conductas correctas, evita castigos.</li>
              <li>Respeta el espacio del animal; no forzar interacciones.</li>
            </ul>
          </div>
          <div class={card}>
            <h2 class="text-lg font-semibold text-[#4a2e85]">8) Comunicación con el dueño</h2>
            <ul class="mt-3 space-y-2 text-sm text-[#4a2e85b3]">
              <li>Envía updates con fotos y notas breves sobre conducta y apetito.</li>
              <li>Reporta cualquier cambio de salud o comportamiento de inmediato.</li>
              <li>Confirma instrucciones especiales (medicación, alergias, miedos).</li>
            </ul>
          </div>
        </section>

        <section class={card}>
          <h2 class="text-lg font-semibold text-[#4a2e85]">Checklist rápido del cuidador</h2>
          <div class="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-[#4a2e85b3]">
            <div class="flex items-start gap-2"><span>•</span><span>Agua fresca y comida según indicaciones.</span></div>
            <div class="flex items-start gap-2"><span>•</span><span>Paseos/juego adecuados para la especie y energía.</span></div>
            <div class="flex items-start gap-2"><span>•</span><span>Entorno limpio, seguro y sin riesgos.</span></div>
            <div class="flex items-start gap-2"><span>•</span><span>Observación diaria de apetito, ánimo y salud.</span></div>
            <div class="flex items-start gap-2"><span>•</span><span>Comunicación clara y rápida con el dueño.</span></div>
            <div class="flex items-start gap-2"><span>•</span><span>Contacto de emergencia veterinaria disponible.</span></div>
          </div>
        </section>
      </div>
    </div>
  );
});

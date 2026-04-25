import { component$, useStyles$ } from '@builder.io/qwik';
import { Link, type DocumentHead } from '@builder.io/qwik-city';
import {
  LuArrowRight,
  LuShieldCheck,
  LuMapPin,
  LuStar,
  LuHeart,
  LuSparkles,
  LuMessagesSquare,
  LuBadgeCheck,
  LuLock,
  LuCamera,
  LuSmartphone,
  LuUsers,
  LuDownload
} from '@qwikest/icons/lucide';
import { PWAInstallButton, useIsStandalone } from '../components/pwa-install-button';

export const head: DocumentHead = {
  title: 'ACUPATAS - Cuidado Seguro para tu Mascota',
  meta: [
    { name: 'viewport', content: 'width=device-width, initial-scale=1.0' },
    {
      name: 'description',
      content:
        'La plataforma mas segura de Venezuela para conectar duenos y cuidadores de mascotas con verificacion biometrica, geolocalizacion y pagos auditables.',
    },
    { name: 'keywords', content: 'cuidado mascotas, cuidadores verificados, Venezuela, seguridad mascotas, biometria' },
    { property: 'og:title', content: 'ACUPATAS - Cuidado Seguro para tu Mascota' },
    { property: 'og:description', content: 'Encuentra cuidadores verificados con maximo control y seguridad.' },
    { property: 'og:type', content: 'website' },
  ],
  links: [
    { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
    { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: 'anonymous' },
    {
      rel: 'stylesheet',
      href: 'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Nunito+Sans:wght@300;400;600;700&display=swap',
    },
  ],
};

export default component$(() => {
  const isStandalone = useIsStandalone();

  useStyles$(
    `
      :global(body) {
        font-family: 'Nunito Sans', system-ui, -apple-system, sans-serif;
        background: #f6f5fb;
      }
      .home-root {
        --brand-purple: #4a2e85;
        --brand-orange: #ef7c43;
        --brand-yellow: #f6e527;
        --ink: #2d1c4a;
        --muted: rgba(45, 28, 74, 0.72);
        position: relative;
        overflow: hidden;
      }
      .home-root::before {
        content: '';
        position: absolute;
        inset: 0;
        background:
          radial-gradient(circle at 10% 10%, rgba(246, 229, 39, 0.25), transparent 45%),
          radial-gradient(circle at 90% 5%, rgba(239, 124, 67, 0.22), transparent 40%),
          radial-gradient(circle at 80% 80%, rgba(74, 46, 133, 0.22), transparent 45%);
        z-index: 0;
      }
      .home-content {
        position: relative;
        z-index: 1;
      }
      .floating-orb {
        position: absolute;
        border-radius: 999px;
        filter: blur(0px);
        opacity: 0.45;
        animation: floaty 14s ease-in-out infinite;
      }
      .floating-orb.orb-one {
        width: 260px;
        height: 260px;
        top: -120px;
        left: -80px;
        background: radial-gradient(circle, rgba(246, 229, 39, 0.6), rgba(246, 229, 39, 0.06));
      }
      .floating-orb.orb-two {
        width: 220px;
        height: 220px;
        bottom: -80px;
        right: -70px;
        animation-delay: -5s;
        background: radial-gradient(circle, rgba(239, 124, 67, 0.55), rgba(239, 124, 67, 0.08));
      }
      .floating-orb.orb-three {
        width: 160px;
        height: 160px;
        top: 20%;
        right: 8%;
        animation-delay: -8s;
        background: radial-gradient(circle, rgba(74, 46, 133, 0.5), rgba(74, 46, 133, 0.08));
      }
      .paw-stamp {
        position: absolute;
        opacity: 0.12;
        animation: drift 18s ease-in-out infinite;
      }
      .paw-stamp.one {
        left: 8%;
        bottom: 14%;
      }
      .paw-stamp.two {
        right: 14%;
        top: 18%;
        animation-delay: -6s;
      }
      .title-font {
        font-family: 'Space Grotesk', sans-serif;
      }
      .soft-card {
        background: rgba(255, 255, 255, 0.85);
        border: 1px solid rgba(74, 46, 133, 0.12);
        box-shadow: 0 20px 60px rgba(74, 46, 133, 0.15);
        backdrop-filter: blur(10px);
      }
      .glass-panel {
        background: linear-gradient(140deg, rgba(255, 255, 255, 0.9), rgba(255, 255, 255, 0.65));
        border: 1px solid rgba(74, 46, 133, 0.12);
      }
      .chip {
        display: inline-flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.35rem 0.8rem;
        border-radius: 999px;
        font-size: 0.8rem;
        font-weight: 600;
        background: rgba(74, 46, 133, 0.1);
        color: var(--brand-purple);
      }
      .hero-cta {
        transition: transform 0.2s ease, box-shadow 0.2s ease;
      }
      .hero-cta:hover {
        transform: translateY(-2px);
        box-shadow: 0 12px 24px rgba(74, 46, 133, 0.2);
      }
      .pet-card {
        background: rgba(255, 255, 255, 0.9);
        border: 1px solid rgba(74, 46, 133, 0.12);
        border-radius: 18px;
        padding: 0.9rem 1rem;
        display: flex;
        align-items: center;
        gap: 0.75rem;
        box-shadow: 0 16px 36px rgba(74, 46, 133, 0.12);
      }
      .pet-icon {
        width: 42px;
        height: 42px;
        border-radius: 14px;
        display: grid;
        place-items: center;
        background: linear-gradient(135deg, rgba(246, 229, 39, 0.5), rgba(239, 124, 67, 0.4));
      }
      .hero-art {
        position: relative;
        border-radius: 28px;
        padding: 1.75rem;
        background:
          radial-gradient(circle at 20% 15%, rgba(246, 229, 39, 0.25), transparent 55%),
          radial-gradient(circle at 80% 0%, rgba(239, 124, 67, 0.28), transparent 50%),
          radial-gradient(circle at 65% 90%, rgba(74, 46, 133, 0.25), transparent 55%),
          rgba(255, 255, 255, 0.8);
        border: 1px solid rgba(74, 46, 133, 0.12);
        box-shadow: 0 30px 80px rgba(74, 46, 133, 0.18);
        overflow: hidden;
      }
      .hero-art::after {
        content: '';
        position: absolute;
        inset: 8%;
        border-radius: 24px;
        border: 1px dashed rgba(74, 46, 133, 0.18);
        pointer-events: none;
      }
      .hero-avatar {
        width: 78px;
        height: 78px;
        border-radius: 22px;
        background: rgba(255, 255, 255, 0.9);
        border: 1px solid rgba(74, 46, 133, 0.12);
        display: grid;
        place-items: center;
        box-shadow: 0 16px 32px rgba(74, 46, 133, 0.18);
      }
      .hero-bubble {
        background: rgba(255, 255, 255, 0.9);
        border: 1px solid rgba(74, 46, 133, 0.12);
        border-radius: 18px;
        padding: 0.75rem 1rem;
        box-shadow: 0 18px 40px rgba(74, 46, 133, 0.14);
      }
      .hero-grid {
        display: grid;
        gap: 1rem;
      }
      .hero-flow {
        position: relative;
        display: grid;
        gap: 0.75rem;
      }
      .flow-card {
        background: rgba(255, 255, 255, 0.92);
        border: 1px solid rgba(74, 46, 133, 0.12);
        border-radius: 16px;
        padding: 0.75rem 0.9rem;
        display: flex;
        align-items: center;
        gap: 0.6rem;
        box-shadow: 0 12px 30px rgba(74, 46, 133, 0.12);
        animation: flow-bob 6s ease-in-out infinite;
      }
      .flow-card:nth-child(2) {
        animation-delay: -2s;
      }
      .flow-card:nth-child(3) {
        animation-delay: -4s;
      }
      .journey-card {
        position: relative;
        overflow: hidden;
        border-radius: 28px;
        padding: 1.5rem;
        border: 1px solid rgba(74, 46, 133, 0.12);
        box-shadow: 0 24px 60px rgba(74, 46, 133, 0.12);
        background: linear-gradient(145deg, rgba(255,255,255,0.95), rgba(255,255,255,0.82));
      }
      .journey-card::before {
        content: '';
        position: absolute;
        inset: auto -10% -30% auto;
        width: 180px;
        height: 180px;
        border-radius: 999px;
        opacity: 0.35;
      }
      .journey-card.owner::before {
        background: radial-gradient(circle, rgba(246, 229, 39, 0.95), rgba(246, 229, 39, 0));
      }
      .journey-card.caregiver::before {
        background: radial-gradient(circle, rgba(239, 124, 67, 0.9), rgba(239, 124, 67, 0));
      }
      .mini-pill {
        display: inline-flex;
        align-items: center;
        gap: 0.35rem;
        padding: 0.38rem 0.7rem;
        border-radius: 999px;
        font-size: 0.7rem;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        border: 1px solid rgba(74, 46, 133, 0.12);
        background: rgba(255,255,255,0.8);
        color: #4a2e85;
      }
      .spark-line {
        position: absolute;
        width: 110px;
        height: 110px;
        border-radius: 999px;
        border: 1px dashed rgba(74, 46, 133, 0.16);
        opacity: 0.6;
      }
      .spark-line.one {
        top: -28px;
        right: -10px;
      }
      .spark-line.two {
        bottom: -40px;
        left: -16px;
      }
      .hero-flow {
        animation: flow-pulse 7s ease-in-out infinite;
      }
      .flow-chip {
        font-size: 0.65rem;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        color: rgba(74, 46, 133, 0.55);
      }
      .flow-name {
        font-weight: 700;
        color: #4a2e85;
        font-size: 0.9rem;
      }
      .flow-note {
        font-size: 0.75rem;
        color: rgba(45, 28, 74, 0.7);
      }
      @media (min-width: 640px) {
        .hero-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
      }
      @keyframes floaty {
        0%, 100% { transform: translateY(0) translateX(0); }
        50% { transform: translateY(-18px) translateX(10px); }
      }
      @keyframes flow-bob {
        0%, 100% { transform: translateY(0); box-shadow: 0 12px 30px rgba(74, 46, 133, 0.12); }
        50% { transform: translateY(-10px); box-shadow: 0 20px 40px rgba(74, 46, 133, 0.2); }
      }
      @keyframes flow-pulse {
        0%, 100% { transform: translateY(0); }
        50% { transform: translateY(6px); }
      }
      @keyframes drift {
        0%, 100% { transform: translateY(0) rotate(0deg); }
        50% { transform: translateY(-12px) rotate(6deg); }
      }
      @media (max-width: 768px) {
        .paw-stamp { display: none; }
      }
    `
  );

  return (
    <main class="home-root">
      <div class="floating-orb orb-one" />
      <div class="floating-orb orb-two" />
      <div class="floating-orb orb-three" />
      <svg class="paw-stamp one" width="160" height="160" viewBox="0 0 120 120" aria-hidden="true">
        <circle cx="30" cy="38" r="12" fill="#4a2e85" />
        <circle cx="55" cy="28" r="10" fill="#4a2e85" />
        <circle cx="80" cy="38" r="12" fill="#4a2e85" />
        <ellipse cx="55" cy="75" rx="28" ry="22" fill="#4a2e85" />
      </svg>
      <svg class="paw-stamp two" width="160" height="160" viewBox="0 0 120 120" aria-hidden="true">
        <circle cx="30" cy="38" r="12" fill="#ef7c43" />
        <circle cx="55" cy="28" r="10" fill="#ef7c43" />
        <circle cx="80" cy="38" r="12" fill="#ef7c43" />
        <ellipse cx="55" cy="75" rx="28" ry="22" fill="#ef7c43" />
      </svg>

      <div class="home-content">
        <section id="inicio" class="pt-20 pb-20 lg:pb-28" data-vt="home-hero">
          <div class="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-[0.95fr,1.05fr] gap-12 items-start">
            <div class="space-y-6 md:pr-6" data-vt="home-copy">
              <span class="chip">
                <LuSparkles class="w-4 h-4" />
                Plataforma verificada en Venezuela
              </span>
              <h1 class="title-font text-4xl sm:text-6xl lg:text-7xl font-bold text-[#2d1c4a] leading-tight tracking-tight">
                Cuidado premium para <span class="text-transparent bg-clip-text bg-gradient-to-r from-[#f6e527] to-[#ef7c43]">mascotas felices</span>,
                con control total y mucho cariño.
              </h1>
              <p class="text-lg sm:text-xl text-[var(--muted)] max-w-3xl">
                ACUPATAS conecta familias y cuidadores con control real: biometria, geolocalizacion y pagos auditables.
                Todo ocurre dentro del chat seguro, con historial completo y soporte activo.
              </p>
              <div class="flex flex-col sm:flex-row gap-4" data-vt="home-cta">
                <Link
                  href="/auth?mode=registro"
                  class="hero-cta inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-gradient-to-r from-[#f6e527] to-[#ef7c43] text-[#4a2e85] font-semibold"
                >
                  Soy dueno de mascota
                  <LuArrowRight class="w-5 h-5" />
                </Link>
                <Link
                  href="/auth?mode=registro"
                  class="hero-cta inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl border border-[#4a2e85]/20 text-[#4a2e85] font-semibold bg-white/70"
                >
                  Quiero ser cuidador
                  <LuArrowRight class="w-5 h-5" />
                </Link>
              </div>
              <div class="grid sm:grid-cols-3 gap-3 md:hidden">
                <div class="pet-card">
                  <div class="pet-icon">
                    <svg viewBox="0 0 64 64" width="26" height="26" fill="none" aria-hidden="true">
                      <circle cx="22" cy="26" r="8" fill="#4a2e85" />
                      <circle cx="42" cy="26" r="8" fill="#4a2e85" />
                      <path d="M16 14l6 8M48 14l-6 8" stroke="#4a2e85" stroke-width="3" stroke-linecap="round" />
                      <path d="M20 42c4 6 20 6 24 0" stroke="#4a2e85" stroke-width="3" stroke-linecap="round" />
                    </svg>
                  </div>
                  <div>
                    <div class="text-sm font-semibold text-[#4a2e85]">Perros felices</div>
                    <div class="text-xs text-[#4a2e85b3]">Paseos y alojamiento seguro</div>
                  </div>
                </div>
                <div class="pet-card">
                  <div class="pet-icon">
                    <svg viewBox="0 0 64 64" width="26" height="26" fill="none" aria-hidden="true">
                      <path d="M16 28l8-10 8 10" stroke="#4a2e85" stroke-width="3" stroke-linecap="round" />
                      <path d="M48 28l-8-10-8 10" stroke="#4a2e85" stroke-width="3" stroke-linecap="round" />
                      <circle cx="32" cy="38" r="12" fill="#4a2e85" />
                      <circle cx="28" cy="36" r="2" fill="#fff" />
                      <circle cx="36" cy="36" r="2" fill="#fff" />
                      <path d="M28 44c4 2 8 2 12 0" stroke="#fff" stroke-width="2" stroke-linecap="round" />
                    </svg>
                  </div>
                  <div>
                    <div class="text-sm font-semibold text-[#4a2e85]">Gatos tranquilos</div>
                    <div class="text-xs text-[#4a2e85b3]">Ambientes calmados y limpios</div>
                  </div>
                </div>
                <div class="pet-card">
                  <div class="pet-icon">
                    <svg viewBox="0 0 64 64" width="26" height="26" fill="none" aria-hidden="true">
                      <circle cx="24" cy="34" r="8" fill="#4a2e85" />
                      <circle cx="40" cy="30" r="6" fill="#4a2e85" />
                      <path d="M28 44c8 4 18 2 24-6" stroke="#4a2e85" stroke-width="3" stroke-linecap="round" />
                    </svg>
                  </div>
                  <div>
                    <div class="text-sm font-semibold text-[#4a2e85]">Mascotas pequenas</div>
                    <div class="text-xs text-[#4a2e85b3]">Exoticos con cuidado experto</div>
                  </div>
                </div>
              </div>
              <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm md:hidden">
                {[
                  { label: 'Verificacion biometrica', value: '100%' },
                  { label: 'Chat interno', value: 'Seguro' },
                  { label: 'Pagos', value: 'Auditables' },
                  { label: 'Soporte', value: '24/7' },
                ].map((stat) => (
                  <div key={stat.label} class="glass-panel rounded-xl px-4 py-3">
                    <div class="text-lg font-semibold text-[#4a2e85]">{stat.value}</div>
                    <div class="text-xs text-[#4a2e85b3]">{stat.label}</div>
                  </div>
                ))}
              </div>

            </div>

            <div class="hidden md:flex flex-col gap-6" data-vt="home-visual">
              <div class="relative">
                <div class="absolute -top-6 -left-8 h-20 w-20 rounded-3xl bg-gradient-to-br from-[#f6e527] to-[#ef7c43] opacity-70 blur-[1px]" />
                <div class="absolute -bottom-8 right-6 h-24 w-24 rounded-[32px] bg-[#4a2e85]/15 blur-[2px]" />
                <div class="hero-art space-y-6">
                  <div class="flex items-center justify-between">
                    <div>
                      <p class="text-xs uppercase tracking-[0.3em] text-[#4a2e85]/60">Historias reales</p>
                      <h2 class="title-font text-2xl font-semibold text-[#2d1c4a]">Mascotas cuidadas como en casa</h2>
                    </div>
                    <div class="hero-avatar">
                      <svg viewBox="0 0 64 64" width="36" height="36" fill="none" aria-hidden="true">
                        <circle cx="24" cy="24" r="8" fill="#4a2e85" />
                        <circle cx="44" cy="24" r="8" fill="#4a2e85" />
                        <path d="M18 14l6 7M46 14l-6 7" stroke="#4a2e85" stroke-width="3" stroke-linecap="round" />
                        <path d="M22 40c4 6 16 6 20 0" stroke="#4a2e85" stroke-width="3" stroke-linecap="round" />
                      </svg>
                    </div>
                  </div>

                  <div class="hero-grid">
                    <div class="hero-bubble">
                      <div class="flex items-center gap-3">
                        <div class="h-10 w-10 rounded-2xl bg-[#f6e527]/30 flex items-center justify-center">
                          <LuHeart class="w-5 h-5 text-[#4a2e85]" />
                        </div>
                        <div>
                          <p class="text-xs text-[#4a2e85b3]">Mascota feliz</p>
                          <p class="text-sm font-semibold text-[#4a2e85]">Foto diaria y notas</p>
                        </div>
                      </div>
                    </div>
                    <div class="hero-bubble">
                      <div class="flex items-center gap-3">
                        <div class="h-10 w-10 rounded-2xl bg-[#ef7c43]/20 flex items-center justify-center">
                          <LuBadgeCheck class="w-5 h-5 text-[#4a2e85]" />
                        </div>
                        <div>
                          <p class="text-xs text-[#4a2e85b3]">Cuidador verificado</p>
                          <p class="text-sm font-semibold text-[#4a2e85]">Biometria aprobada</p>
                        </div>
                      </div>
                    </div>
                    <div class="hero-bubble">
                      <div class="flex items-center gap-3">
                        <div class="h-10 w-10 rounded-2xl bg-[#4a2e85]/15 flex items-center justify-center">
                          <LuMessagesSquare class="w-5 h-5 text-[#4a2e85]" />
                        </div>
                        <div>
                          <p class="text-xs text-[#4a2e85b3]">Chat seguro</p>
                          <p class="text-sm font-semibold text-[#4a2e85]">Historial completo</p>
                        </div>
                      </div>
                    </div>
                    <div class="hero-bubble">
                      <div class="flex items-center gap-3">
                        <div class="h-10 w-10 rounded-2xl bg-[#f6e527]/20 flex items-center justify-center">
                          <LuMapPin class="w-5 h-5 text-[#4a2e85]" />
                        </div>
                        <div>
                          <p class="text-xs text-[#4a2e85b3]">Ubicacion</p>
                          <p class="text-sm font-semibold text-[#4a2e85]">Seguimiento real</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div class="rounded-2xl bg-white/80 border border-[#4a2e85]/10 p-4 space-y-3">
                    <div class="flex items-center justify-between text-sm text-[#4a2e85b3]">
                      <span>Servicio activo</span>
                      <span class="inline-flex items-center gap-1 text-[#4a2e85]">
                        <LuShieldCheck class="w-4 h-4" />
                        Verificado
                      </span>
                    </div>
                    <div class="grid grid-cols-2 gap-3">
                      <div class="rounded-xl bg-[#f6f5fb] p-3">
                        <p class="text-xs text-[#4a2e85b3]">Mascota</p>
                        <p class="text-sm font-semibold text-[#4a2e85]">Luna, 3 anos</p>
                      </div>
                      <div class="rounded-xl bg-[#f6f5fb] p-3">
                        <p class="text-xs text-[#4a2e85b3]">Cuidador</p>
                        <p class="text-sm font-semibold text-[#4a2e85]">Carlos R.</p>
                      </div>
                    </div>
                    <div class="flex flex-wrap gap-2 text-xs text-[#4a2e85]">
                      <span class="px-2.5 py-1 rounded-full bg-[#4a2e85]/10">Perros</span>
                      <span class="px-2.5 py-1 rounded-full bg-[#f6e527]/20 text-[#4a2e85]">Gatos</span>
                      <span class="px-2.5 py-1 rounded-full bg-[#ef7c43]/15 text-[#4a2e85]">Pequenos</span>
                    </div>
                  </div>

                  <div class="grid grid-cols-2 gap-3">
                    <div class="rounded-2xl bg-[#4a2e85] text-white px-4 py-3">
                      <p class="text-xs uppercase tracking-wider text-white/80">Calificacion</p>
                      <div class="flex items-center gap-1 text-sm mt-2">
                        <LuStar class="w-4 h-4 text-[#f6e527]" />
                        4.9 / 5
                      </div>
                    </div>
                    <div class="rounded-2xl bg-[#ef7c43] text-white px-4 py-3">
                      <p class="text-xs uppercase tracking-wider">Reservas</p>
                      <p class="text-lg font-semibold mt-2">+120</p>
                    </div>
                  </div>
                </div>
              </div>
              <div class="hero-flow block">
                <div class="flow-card">
                  <div class="h-10 w-10 rounded-2xl bg-[#f6e527]/30 flex items-center justify-center">
                    <LuHeart class="w-5 h-5 text-[#4a2e85]" />
                  </div>
                  <div>
                    <div class="flow-chip">Dueno</div>
                    <div class="flow-name">Ana G.</div>
                    <div class="flow-note">Busca cuidador para Luna</div>
                  </div>
                </div>
                <div class="flow-card">
                  <div class="h-10 w-10 rounded-2xl bg-[#ef7c43]/20 flex items-center justify-center">
                    <LuShieldCheck class="w-5 h-5 text-[#4a2e85]" />
                  </div>
                  <div>
                    <div class="flow-chip">Cuidador</div>
                    <div class="flow-name">Carlos R.</div>
                    <div class="flow-note">Verificado - 4.9</div>
                  </div>
                </div>
                <div class="flow-card">
                  <div class="h-10 w-10 rounded-2xl bg-[#4a2e85]/15 flex items-center justify-center">
                    <LuMessagesSquare class="w-5 h-5 text-[#4a2e85]" />
                  </div>
                  <div>
                    <div class="flow-chip">Chat interno</div>
                    <div class="flow-name">Reserva lista</div>
                    <div class="flow-note">Pago verificado y seguimiento</div>
                  </div>
                </div>
              </div>
              <div class="grid sm:grid-cols-3 gap-3">
                <div class="pet-card">
                  <div class="pet-icon">
                    <svg viewBox="0 0 64 64" width="26" height="26" fill="none" aria-hidden="true">
                      <circle cx="22" cy="26" r="8" fill="#4a2e85" />
                      <circle cx="42" cy="26" r="8" fill="#4a2e85" />
                      <path d="M16 14l6 8M48 14l-6 8" stroke="#4a2e85" stroke-width="3" stroke-linecap="round" />
                      <path d="M20 42c4 6 20 6 24 0" stroke="#4a2e85" stroke-width="3" stroke-linecap="round" />
                    </svg>
                  </div>
                  <div>
                    <div class="text-sm font-semibold text-[#4a2e85]">Perros felices</div>
                    <div class="text-xs text-[#4a2e85b3]">Paseos y alojamiento seguro</div>
                  </div>
                </div>
                <div class="pet-card">
                  <div class="pet-icon">
                    <svg viewBox="0 0 64 64" width="26" height="26" fill="none" aria-hidden="true">
                      <path d="M16 28l8-10 8 10" stroke="#4a2e85" stroke-width="3" stroke-linecap="round" />
                      <path d="M48 28l-8-10-8 10" stroke="#4a2e85" stroke-width="3" stroke-linecap="round" />
                      <circle cx="32" cy="38" r="12" fill="#4a2e85" />
                      <circle cx="28" cy="36" r="2" fill="#fff" />
                      <circle cx="36" cy="36" r="2" fill="#fff" />
                      <path d="M28 44c4 2 8 2 12 0" stroke="#fff" stroke-width="2" stroke-linecap="round" />
                    </svg>
                  </div>
                  <div>
                    <div class="text-sm font-semibold text-[#4a2e85]">Gatos tranquilos</div>
                    <div class="text-xs text-[#4a2e85b3]">Ambientes calmados y limpios</div>
                  </div>
                </div>
                <div class="pet-card">
                  <div class="pet-icon">
                    <svg viewBox="0 0 64 64" width="26" height="26" fill="none" aria-hidden="true">
                      <circle cx="24" cy="34" r="8" fill="#4a2e85" />
                      <circle cx="40" cy="30" r="6" fill="#4a2e85" />
                      <path d="M28 44c8 4 18 2 24-6" stroke="#4a2e85" stroke-width="3" stroke-linecap="round" />
                    </svg>
                  </div>
                  <div>
                    <div class="text-sm font-semibold text-[#4a2e85]">Mascotas pequenas</div>
                    <div class="text-xs text-[#4a2e85b3]">Exoticos con cuidado experto</div>
                  </div>
                </div>
              </div>
              <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                {[
                  { label: 'Verificacion biometrica', value: '100%' },
                  { label: 'Chat interno', value: 'Seguro' },
                  { label: 'Pagos', value: 'Auditables' },
                  { label: 'Soporte', value: '24/7' },
                ].map((stat) => (
                  <div key={stat.label} class="glass-panel rounded-xl px-4 py-3">
                    <div class="text-lg font-semibold text-[#4a2e85]">{stat.value}</div>
                    <div class="text-xs text-[#4a2e85b3]">{stat.label}</div>
                  </div>
                ))}
              </div>

            </div>
          </div>
        </section>

        <section class="pb-4 sm:pb-8" data-vt="home-journeys">
          <div class="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <div class="grid lg:grid-cols-2 gap-6">
              <article class="journey-card owner" data-vt="journey-owner">
                <div class="spark-line one" />
                <div class="space-y-4 relative z-10">
                  <span class="mini-pill">
                    <LuHeart class="w-3.5 h-3.5" />
                    Para dueños
                  </span>
                  <div>
                    <h3 class="title-font text-2xl font-semibold text-[#2d1c4a]">Tu mascota sigue sintiéndose acompañada, aunque tú no estés.</h3>
                    <p class="text-sm sm:text-base text-[#4a2e85b3] mt-2">
                      Elige cuidadores verificados, arma la reserva dentro del chat y sigue todo con fotos, pagos controlados y reseñas al final del cuidado.
                    </p>
                  </div>
                  <div class="grid sm:grid-cols-3 gap-3">
                    <div class="glass-panel rounded-2xl p-4">
                      <div class="text-sm font-bold text-[#4a2e85]">1. Busca</div>
                      <div class="text-xs text-[#4a2e85b3] mt-1">Filtra por zona, precio, especies y capacidad.</div>
                    </div>
                    <div class="glass-panel rounded-2xl p-4">
                      <div class="text-sm font-bold text-[#4a2e85]">2. Conversa</div>
                      <div class="text-xs text-[#4a2e85b3] mt-1">Todo queda dentro del chat seguro de ACUPATAS.</div>
                    </div>
                    <div class="glass-panel rounded-2xl p-4">
                      <div class="text-sm font-bold text-[#4a2e85]">3. Sigue</div>
                      <div class="text-xs text-[#4a2e85b3] mt-1">Recibe evidencias y confirma cada paso del servicio.</div>
                    </div>
                  </div>
                </div>
              </article>

              <article class="journey-card caregiver" data-vt="journey-caregiver">
                <div class="spark-line two" />
                <div class="space-y-4 relative z-10">
                  <span class="mini-pill">
                    <LuShieldCheck class="w-3.5 h-3.5" />
                    Para cuidadores
                  </span>
                  <div>
                    <h3 class="title-font text-2xl font-semibold text-[#2d1c4a]">Convierte tu experiencia con mascotas en un perfil confiable y profesional.</h3>
                    <p class="text-sm sm:text-base text-[#4a2e85b3] mt-2">
                      Gestiona cupos, disponibilidad, fotos, pagos y comisiones desde un dashboard pensado para trabajar con claridad y sin ruido.
                    </p>
                  </div>
                  <div class="grid sm:grid-cols-3 gap-3">
                    <div class="soft-card rounded-2xl p-4">
                      <div class="text-sm font-bold text-[#4a2e85]">Perfil sólido</div>
                      <div class="text-xs text-[#4a2e85b3] mt-1">Servicios, especies, tamaños y reputación visibles.</div>
                    </div>
                    <div class="soft-card rounded-2xl p-4">
                      <div class="text-sm font-bold text-[#4a2e85]">Cupo real</div>
                      <div class="text-xs text-[#4a2e85b3] mt-1">La app protege tu capacidad por mascota y por fecha.</div>
                    </div>
                    <div class="soft-card rounded-2xl p-4">
                      <div class="text-sm font-bold text-[#4a2e85]">Cobro claro</div>
                      <div class="text-xs text-[#4a2e85b3] mt-1">Validación de pago, comisión e historial operativo.</div>
                    </div>
                  </div>
                </div>
              </article>
            </div>
          </div>
        </section>

        <section id="como-funciona" class="py-20" data-vt="home-flow">
          <div class="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <div class="text-center mb-12">
              <p class="text-sm uppercase tracking-[0.2em] text-[#4a2e85b3]">Como funciona</p>
              <h2 class="title-font text-3xl sm:text-4xl font-semibold text-[#2d1c4a]">Un flujo claro y sin riesgos</h2>
              <p class="text-[#4a2e85b3] mt-3">Desde el registro hasta el cierre del servicio, todo queda registrado.</p>
            </div>
            <div class="grid md:grid-cols-4 gap-6">
              {[
                {
                  title: 'Registro verificado',
                  desc: 'Documentos, biometria y referencias personales.',
                  icon: <LuShieldCheck class="w-6 h-6" />,
                },
                {
                  title: 'Busqueda inteligente',
                  desc: 'Filtra por zona, precio, experiencia y calificaciones.',
                  icon: <LuUsers class="w-6 h-6" />,
                },
                {
                  title: 'Chat interno seguro',
                  desc: 'Hasta 3 chats abiertos y seleccion obligatoria.',
                  icon: <LuMessagesSquare class="w-6 h-6" />,
                },
                {
                  title: 'Pago controlado',
                  desc: 'Comprobante y control de pagos con soporte.',
                  icon: <LuSmartphone class="w-6 h-6" />,
                },
              ].map((step, index) => (
                <div key={step.title} class="glass-panel rounded-2xl p-6">
                  <div class="flex items-center justify-between mb-4">
                    <div class="h-10 w-10 rounded-xl bg-[#4a2e85]/10 text-[#4a2e85] grid place-items-center">
                      {step.icon}
                    </div>
                    <span class="text-sm font-semibold text-[#4a2e85]">0{index + 1}</span>
                  </div>
                  <h3 class="title-font text-lg text-[#2d1c4a]">{step.title}</h3>
                  <p class="text-sm text-[#4a2e85b3] mt-2">{step.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="seguridad" class="py-20" data-vt="home-security">
          <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div class="flex flex-col lg:flex-row gap-10">
              <div class="lg:w-1/3 space-y-4">
                <p class="text-sm uppercase tracking-[0.2em] text-[#4a2e85b3]">Seguridad</p>
                <h2 class="title-font text-3xl sm:text-4xl font-semibold text-[#2d1c4a]">Capas reales de confianza</h2>
                <p class="text-[#4a2e85b3]">
                  No dependemos solo de perfiles. Cada usuario pasa por verificaciones y queda auditado.
                </p>
                <div class="flex items-center gap-3 text-sm text-[#4a2e85]">
                  <LuBadgeCheck class="w-5 h-5" />
                  Identidad confirmada
                </div>
                <div class="flex items-center gap-3 text-sm text-[#4a2e85]">
                  <LuLock class="w-5 h-5" />
                  Chat interno obligatorio
                </div>
              </div>
              <div class="lg:w-2/3 grid md:grid-cols-2 gap-6">
                {[
                  {
                    title: 'Biometria facial',
                    desc: 'Validamos rostro contra documento oficial.',
                    icon: <LuCamera class="w-6 h-6" />,
                  },
                  {
                    title: 'Geolocalizacion activa',
                    desc: 'Ubicacion registrada en cada servicio.',
                    icon: <LuMapPin class="w-6 h-6" />,
                  },
                  {
                    title: 'Pagos verificados',
                    desc: 'Pago movil con comprobante obligatorio.',
                    icon: <LuSmartphone class="w-6 h-6" />,
                  },
                  {
                    title: 'Calificaciones obligatorias',
                    desc: 'Sin feedback no se activa nueva busqueda.',
                    icon: <LuStar class="w-6 h-6" />,
                  },
                ].map((feature) => (
                  <div key={feature.title} class="soft-card rounded-2xl p-6">
                    <div class="h-11 w-11 rounded-xl bg-[#4a2e85]/10 text-[#4a2e85] grid place-items-center mb-4">
                      {feature.icon}
                    </div>
                    <h3 class="title-font text-lg text-[#2d1c4a]">{feature.title}</h3>
                    <p class="text-sm text-[#4a2e85b3] mt-2">{feature.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section id="contacto" class="py-20" data-vt="home-contact">
          <div class="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
            <div class="soft-card rounded-3xl p-8 sm:p-12 text-center">
              <p class="text-sm uppercase tracking-[0.2em] text-[#4a2e85b3]">Listo para comenzar</p>
              <h2 class="title-font text-3xl sm:text-4xl font-semibold text-[#2d1c4a] mt-2">
                Construye confianza desde el primer servicio.
              </h2>
              <p class="text-[#4a2e85b3] mt-4">
                Registra tu cuenta y empieza a conectar con cuidadores verificados o familias responsables.
              </p>
              <div class="mt-6 flex flex-col sm:flex-row gap-4 justify-center">
                <Link
                  href="/auth?mode=registro"
                  class="hero-cta inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-gradient-to-r from-[#f6e527] to-[#ef7c43] text-[#4a2e85] font-semibold"
                >
                  Registrarme ahora
                  <LuArrowRight class="w-5 h-5" />
                </Link>
                <Link
                  href="/auth?mode=login"
                  class="hero-cta inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl border border-[#4a2e85]/20 text-[#4a2e85] font-semibold bg-white/70"
                >
                  Ya tengo cuenta
                  <LuArrowRight class="w-5 h-5" />
                </Link>
              </div>
              <div class="mt-6 text-xs text-[#4a2e85b3]">
                Soporte directo: soporte@acupatas.com
              </div>
            </div>
          </div>
        </section>

        {/* PWA Promotion Banner */}
        {!isStandalone.value && (
          <section class="py-12 bg-gradient-to-r from-[#4a2e85] to-[#2d1c4a] relative overflow-hidden" data-vt="home-pwa-banner">
            <div class="absolute inset-0 opacity-10 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCI+PGNpcmNsZSBjeD0iMiIgY3k9IjIiIHI9IjIiIGZpbGw9IiNmZmYiLz48L3N2Zz4=')]"></div>
            <div class="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 flex flex-col md:flex-row items-center justify-between gap-8">
              <div class="text-center md:text-left text-white space-y-3">
                <h3 class="title-font text-2xl sm:text-3xl font-bold flex items-center justify-center md:justify-start gap-2 text-white">
                  <LuSmartphone class="w-8 h-8 text-[#ef7c43]" />
                  Lleva ACUPATAS en tu celular
                </h3>
                <p class="text-white/80 max-w-xl text-sm sm:text-base">
                  Instala nuestra Web App (PWA) de forma directa, sin pasar por tiendas, sin consumir espacio y totalmente segura en tu Android o iPhone.
                </p>
              </div>
              <div class="shrink-0 flex flex-col items-center gap-3">
                <button
                  onClick$={() => document.getElementById('pwa-install-button-trigger')?.click()}
                  class="flex items-center gap-2 px-8 py-4 rounded-2xl bg-[#ef7c43] hover:bg-[#d66b35] text-white font-black text-lg shadow-lg hover:shadow-xl hover:-translate-y-1 transition-all"
                >
                  <LuDownload class="w-6 h-6" />
                  Instalar Ahora
                </button>
                <span class="text-[10px] text-white/50 text-center max-w-[200px] leading-tight">
                  Descarga directa en Android. <br /> Guía rápida en iPhone.
                </span>
              </div>
            </div>
          </section>
        )}
      </div>
      <PWAInstallButton />
    </main>
  );
});

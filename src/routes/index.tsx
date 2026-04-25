import { component$ } from '@builder.io/qwik';
import { Link, type DocumentHead } from '@builder.io/qwik-city';
import {
  LuArrowUpRight,
  LuBath,
  LuBedDouble,
  LuHeadphones,
  LuHome,
  LuMapPin,
  LuSearch,
  LuShieldCheck,
  LuSparkles,
} from '@qwikest/icons/lucide';

const featured = [
  {
    id: '1',
    title: 'Villa de lujo',
    meta: '4 camas · 3 baños · 279 m²',
    price: '$1,200,000',
    img: 'https://picsum.photos/seed/rehome-villa/960/640',
    tag: 'Exclusiva',
  },
  {
    id: '2',
    title: 'Apartamento moderno',
    meta: '2 camas · 2 baños · 139 m²',
    price: '$850,000',
    img: 'https://picsum.photos/seed/rehome-apt/960/640',
    tag: 'Nuevo',
  },
  {
    id: '3',
    title: 'Cabaña acogedora',
    meta: '3 camas · 2 baños · 186 m²',
    price: '$650,000',
    img: 'https://picsum.photos/seed/rehome-cabin/960/640',
    tag: 'Vista',
  },
] as const;

const articles = [
  {
    title: 'Tendencias del mercado',
    desc: 'Lo que observamos en precios, zonas y tiempos de venta este año.',
  },
  {
    title: 'Consejos para compradores',
    desc: 'Checklist para visitas, financiamiento y due diligence sin sorpresas.',
  },
  {
    title: 'Inversiones inteligentes',
    desc: 'Cómo evaluar rentabilidad y riesgo antes de cerrar una operación.',
  },
] as const;

const testimonials = [
  {
    quote: 'Excelente servicio y propiedades de alta calidad. Muy recomendado.',
    author: 'Juan Pérez',
    role: 'Comprador',
  },
  {
    quote: 'Encontré mi hogar ideal gracias a su acompañamiento profesional.',
    author: 'María López',
    role: 'Inversora',
  },
  {
    quote: 'Proceso transparente y sin fricciones de principio a fin.',
    author: 'Carlos García',
    role: 'Familia con niños',
  },
] as const;

const valueProps = [
  {
    title: 'Curaduría real',
    text: 'Listados verificados y criterios claros para que compares con tranquilidad.',
    icon: LuShieldCheck,
  },
  {
    title: 'Acompañamiento',
    text: 'Un solo canal para dudas, visitas y documentos — sin correr de oficina en oficina.',
    icon: LuHeadphones,
  },
  {
    title: 'Datos, no ruido',
    text: 'Fichas con métricas que importan: luz, tiempos de traslado y señal del barrio.',
    icon: LuMapPin,
  },
] as const;

function initials(name: string) {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

export default component$(() => {
  return (
    <div class="relative text-white">
      {/* Hero — más aire, foco y buscador accesible */}
      <a
        href="#contenido"
        class="sr-only left-2 top-2 z-[100] rounded-md bg-white px-3 py-2 text-sm font-medium text-[#0B0914] focus:not-sr-only focus:absolute focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-[#f6e527]"
      >
        Saltar al contenido
      </a>
      <section
        class="relative overflow-hidden border-b border-white/10 pb-20 pt-10 md:pb-24 md:pt-16"
        aria-labelledby="hero-heading"
      >
        <div
          class="pointer-events-none absolute inset-0 bg-gradient-to-br from-[#4a2e85]/50 via-[#0B0914]/20 to-[#f6e527]/[0.12]"
        />
        <div class="pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_at_top,white,transparent_70%)] bg-[#0B0914]/30" />
        <div class="relative mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div class="flex flex-col gap-12 lg:flex-row lg:items-end lg:justify-between">
            <div class="max-w-2xl space-y-6">
              <p class="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-3 py-1.5 text-xs font-medium uppercase tracking-[0.14em] text-white/85 shadow-sm">
                <LuSparkles class="h-3.5 w-3.5 text-[#f6e527]" aria-hidden="true" />
                Bienes raíces premium
              </p>
              <h1
                id="hero-heading"
                class="text-4xl font-semibold leading-[1.08] tracking-tight sm:text-5xl xl:text-[3.15rem] xl:leading-tight"
              >
                home la{' '}
                <span class="bg-gradient-to-r from-[#f6e527] to-[#ef7c43] bg-clip-text text-transparent">
                  manuel
                </span>
              </h1>
              <p class="max-w-prose text-base leading-relaxed text-white/70 sm:text-lg sm:leading-relaxed">
                Explora propiedades curadas, agenda visitas y recibe asesoría clara en cada paso — sin ruido, con datos
                que importan.
              </p>
              <div class="flex flex-wrap items-center gap-2 text-xs text-white/50 sm:text-sm">
                <span class="inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden="true" />
                <span>Respuesta en &lt; 24h · visitas bajo cita</span>
              </div>
              <div class="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                <Link
                  href="/properties/"
                  class="inline-flex min-h-[2.75rem] items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#f6e527] to-[#ef7c43] px-5 py-3 text-sm font-semibold text-[#0B0914] shadow-lg shadow-[#0B0914]/50 transition motion-safe:hover:translate-y-[-1px] motion-safe:hover:brightness-105 motion-safe:active:scale-[0.99] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f6e527]"
                >
                  Ver propiedades
                  <LuHome class="h-4 w-4" aria-hidden="true" />
                </Link>
                <Link
                  href="/contact/"
                  class="inline-flex min-h-[2.75rem] items-center justify-center rounded-xl border border-white/25 bg-white/[0.07] px-5 py-3 text-sm font-semibold text-white backdrop-blur-sm transition hover:bg-white/12 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/50"
                >
                  Hablar con un asesor
                </Link>
                <Link
                  href="/about/"
                  class="inline-flex items-center justify-center text-sm font-medium text-white/60 underline decoration-white/20 underline-offset-4 transition hover:text-white hover:decoration-[#f6e527] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f6e527]/40"
                >
                  Cómo trabajamos
                </Link>
              </div>
            </div>
            <div
              class="w-full max-w-md rounded-2xl border border-white/15 bg-white/[0.07] p-1 shadow-2xl shadow-black/50 backdrop-blur-xl motion-safe:duration-200 motion-safe:hover:border-[#f6e527]/25"
              data-vt="hero-search"
            >
              <div class="rounded-[0.9rem] bg-gradient-to-b from-white/[0.04] to-transparent p-4 sm:p-5">
                <p class="mb-3 text-xs font-semibold uppercase tracking-wider text-white/55" id="search-label">
                  Buscador express
                </p>
                <div class="flex flex-col gap-2 sm:flex-row sm:items-stretch sm:gap-2">
                  <div class="relative min-w-0 flex-1">
                    <LuSearch
                      class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40"
                      aria-hidden="true"
                    />
                    <input
                      type="search"
                      name="q"
                      placeholder="Zona, precio o tipo de vivienda"
                      class="h-12 w-full rounded-xl border border-white/15 bg-[#0B0914]/50 py-2 pl-10 pr-3 text-sm text-white placeholder:text-white/35 focus:border-[#f6e527]/45 focus:shadow-[0_0_0_3px_rgba(246,229,39,0.12)] focus:outline-none"
                      readOnly
                      tabIndex={0}
                      autoComplete="off"
                      aria-labelledby="search-label"
                      aria-describedby="search-hint"
                    />
                  </div>
                  <div class="flex gap-2 sm:contents">
                    <Link
                      href="/properties/"
                      class="inline-flex h-12 flex-1 items-center justify-center rounded-xl bg-gradient-to-r from-[#f6e527] to-[#ef7c43] px-4 text-sm font-semibold text-[#0B0914] transition motion-safe:hover:brightness-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f6e527] sm:min-w-[7.5rem]"
                    >
                      Buscar
                    </Link>
                    <button
                      type="button"
                      class="inline-flex h-12 shrink-0 items-center justify-center rounded-xl border border-white/20 bg-white/5 px-4 text-sm font-semibold text-white/90 transition hover:border-white/35 hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/40"
                      aria-label="Filtros avanzados (próximamente). Por ahora ve al catálogo de propiedades"
                      disabled
                    >
                      Filtros
                    </button>
                  </div>
                </div>
                <p id="search-hint" class="mt-3 text-xs leading-relaxed text-white/50">
                  Próximamente: guardados, alertas y comparar fichas. Mientras, el catálogo filtra lo esencial.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <header
        class="sticky top-0 z-40 border-b border-white/10 bg-[#0B0914]/90 backdrop-blur-md backdrop-saturate-150"
        data-vt="page-nav"
      >
        <div class="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <Link
            href="/"
            class="group flex min-h-[2.5rem] items-center gap-2.5 font-semibold tracking-tight text-white"
          >
            <span class="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#f6e527] to-[#ef7c43] text-[#0B0914] shadow-sm ring-1 ring-white/20 transition group-hover:brightness-105">
              <LuHome class="h-5 w-5" aria-hidden="true" />
            </span>
            <span>Real Estate Explorer</span>
          </Link>
          <nav aria-label="Principal">
            <ul class="flex flex-wrap items-center justify-end gap-0.5 text-sm font-medium sm:gap-1">
              <li>
                <Link
                  href="/"
                  aria-current="page"
                  class="rounded-lg px-3 py-2 text-white ring-1 ring-white/20 ring-offset-0 ring-offset-[#0B0914] sm:py-2"
                >
                  Inicio
                </Link>
              </li>
              <li>
                <Link
                  href="/properties/"
                  class="rounded-lg px-3 py-2 text-white/80 transition hover:bg-white/8 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f6e527]/50"
                >
                  Propiedades
                </Link>
              </li>
              <li>
                <Link
                  href="/about/"
                  class="rounded-lg px-3 py-2 text-white/80 transition hover:bg-white/8 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f6e527]/50"
                >
                  Nosotros
                </Link>
              </li>
              <li>
                <Link
                  href="/contact/"
                  class="rounded-lg bg-gradient-to-r from-[#f6e527] to-[#ef7c43] px-3.5 py-2 font-semibold text-[#0B0914] shadow-sm transition hover:brightness-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f6e527]"
                >
                  Contacto
                </Link>
              </li>
            </ul>
          </nav>
        </div>
      </header>

      <div id="contenido" class="scroll-mt-32">
        {/* Tira de valor */}
        <section
          class="border-b border-white/10 bg-gradient-to-b from-white/[0.03] to-transparent py-12"
          aria-labelledby="valor-heading"
        >
          <div class="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <h2 id="valor-heading" class="sr-only">
              Por qué con nosotros
            </h2>
            <ul class="grid gap-6 md:grid-cols-3 md:gap-8">
              {valueProps.map((v) => {
                const ValueIcon = v.icon;
                return (
                  <li
                    key={v.title}
                    class="flex gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-5 transition hover:border-[#f6e527]/20"
                  >
                    <div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#4a2e85]/50 to-[#0B0914] text-[#f6e527] ring-1 ring-white/10">
                      <ValueIcon class="h-6 w-6" aria-hidden="true" />
                    </div>
                    <div>
                      <h3 class="text-base font-semibold tracking-tight text-white">{v.title}</h3>
                      <p class="mt-1.5 text-sm leading-relaxed text-white/65">{v.text}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>

        {/* Propiedades */}
        <section
          class="mx-auto max-w-6xl px-4 py-16 sm:px-6 md:py-20 lg:px-8"
          aria-labelledby="featured-heading"
        >
          <div class="mb-12 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div class="max-w-2xl">
              <h2
                id="featured-heading"
                class="text-2xl font-semibold tracking-tight sm:text-3xl md:text-[1.75rem]"
              >
                Propiedades destacadas
              </h2>
              <p class="mt-3 text-sm leading-relaxed text-white/60 md:text-base">
                Tres ejemplos representativos. Sustituye imágenes y textos por tus listados reales.
              </p>
            </div>
            <Link
              href="/properties/"
              class="inline-flex min-h-11 items-center justify-center gap-1 text-sm font-semibold text-[#f6e527] underline decoration-[#f6e527]/35 underline-offset-[5px] transition hover:decoration-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f6e527]"
            >
              Ver catálogo completo
              <LuArrowUpRight class="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
          <div class="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {featured.map((p) => (
              <article
                key={p.id}
                class="group relative flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.05] to-transparent shadow-xl ring-0 transition duration-200 hover:-translate-y-0.5 hover:border-[#f6e527]/30 hover:shadow-2xl hover:shadow-[#0B0914]/40 motion-reduce:transform-none"
              >
                {/* Contenido decorativo sin puntero; el overlay va después con z-10 y el botón queda encima con z-20 */}
                <div class="pointer-events-none relative z-0 flex flex-1 flex-col">
                  <div class="relative block aspect-[16/10] overflow-hidden">
                    <img
                      src={p.img}
                      width={960}
                      height={600}
                      alt=""
                      class="h-full w-full object-cover transition duration-500 ease-out will-change-transform group-hover:scale-[1.04] motion-reduce:group-hover:scale-100"
                      loading="lazy"
                      decoding="async"
                    />
                    <div class="absolute inset-0 bg-gradient-to-t from-[#0B0914]/80 via-[#0B0914]/10 to-transparent opacity-90" />
                    <span class="absolute left-3 top-3 inline-flex max-w-[12rem] rounded-full border border-white/20 bg-[#0B0914]/85 px-2.5 py-1 text-xs font-semibold text-[#f6e527]">
                      {p.tag}
                    </span>
                  </div>
                  <div class="flex flex-1 flex-col px-5 pb-0 pt-0 sm:px-6">
                    <h3 class="mt-5 text-lg font-semibold leading-snug tracking-tight text-white transition-colors group-hover:text-[#f6e527] sm:mt-6">
                      {p.title}
                    </h3>
                    <p class="mt-2 flex min-h-[1.25rem] items-center gap-2 text-sm text-white/60">
                      <LuMapPin class="h-4 w-4 shrink-0" aria-hidden="true" />
                      <span>Ubicación premium</span>
                    </p>
                    <div class="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-sm text-white/70">
                      <span class="inline-flex items-center gap-1.5">
                        <LuBedDouble class="h-4 w-4" aria-hidden="true" />
                        {p.meta.split('·')[0]?.trim()}
                      </span>
                      <span class="inline-flex items-center gap-1.5">
                        <LuBath class="h-4 w-4" aria-hidden="true" />
                        {p.meta.split('·')[1]?.trim()}
                      </span>
                    </div>
                    <p
                      class="mt-4 text-2xl font-semibold tabular-nums tracking-tight text-white"
                      aria-label={`Precio ${p.price}`}
                    >
                      {p.price}
                    </p>
                  </div>
                </div>
                <div class="pointer-events-none relative z-20 px-5 pb-5 pt-5 sm:px-6 sm:pb-6">
                  {/* Mismo destino que el overlay; solo decoración (clics van al Link absoluto). */}
                  <span
                    class="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/[0.08] py-2.5 text-sm font-semibold text-white group-hover:border-[#f6e527]/40 group-hover:bg-white/12"
                    aria-hidden="true"
                  >
                    Ver ficha
                    <LuArrowUpRight class="h-4 w-4" aria-hidden="true" />
                  </span>
                </div>
                <Link
                  href={`/properties/${p.id}/`}
                  class="absolute inset-0 z-10 rounded-2xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f6e527]"
                  aria-label={`Ver ficha: ${p.title}`}
                >
                  <span class="sr-only">Ver ficha: {p.title}</span>
                </Link>
              </article>
            ))}
          </div>
        </section>

        {/* Noticias + Testimonios */}
        <section class="border-t border-white/10 bg-gradient-to-b from-[#04050a] to-[#0B0914] py-16 md:py-20">
          <div class="mx-auto max-w-6xl space-y-20 px-4 sm:px-6 md:space-y-24 lg:px-8">
            <div>
              <h2 class="text-2xl font-semibold tracking-tight sm:text-3xl" id="news-h">
                Últimas noticias
              </h2>
              <p class="mt-2 text-sm text-white/55">Ideas breves para tomar mejores decisiones.</p>
              <ul class="mt-10 grid gap-6 md:grid-cols-3" role="list" aria-labelledby="news-h">
                {articles.map((a, i) => (
                  <li
                    key={a.title}
                    class="relative flex flex-col rounded-2xl border border-white/10 border-l-2 border-l-[#f6e527] bg-white/[0.04] p-5 pl-5 transition hover:border-white/20"
                  >
                    <span class="mb-3 text-xs font-semibold tabular-nums text-white/40">
                      0{i + 1}
                    </span>
                    <h3 class="text-base font-semibold text-white sm:text-lg">{a.title}</h3>
                    <p class="mt-2 grow text-sm leading-relaxed text-white/65">{a.desc}</p>
                    <span class="mt-5 text-xs font-semibold uppercase tracking-wider text-[#f6e527]/80">
                      Próximamente
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h2 class="text-2xl font-semibold tracking-tight sm:text-3xl" id="test-h">
                Testimonios
              </h2>
              <p class="mt-2 text-sm text-white/55">Clientes que ya se mudaron con nosotros.</p>
              <ul
                class="mt-10 grid gap-6 md:grid-cols-3"
                role="list"
                aria-labelledby="test-h"
              >
                {testimonials.map((t) => (
                  <li
                    key={t.author}
                    class="flex flex-col rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.07] to-white/[0.02] p-5 shadow-sm"
                  >
                    <p class="text-sm leading-relaxed text-white/85 sm:text-base">“{t.quote}”</p>
                    <div class="mt-5 flex items-center gap-3">
                      <span
                        class="flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-gradient-to-br from-[#4a2e85]/50 to-[#0B0914] text-sm font-bold text-[#f6e527] ring-1 ring-inset ring-white/10"
                        aria-hidden="true"
                      >
                        {initials(t.author)}
                      </span>
                      <div>
                        <p class="text-sm font-semibold text-white">{t.author}</p>
                        <p class="text-xs text-white/50">{t.role}</p>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      </div>

      <footer
        class="border-t border-white/10 bg-[#03040a] py-12 text-sm text-white/60 sm:py-16"
        role="contentinfo"
      >
        <div class="mx-auto grid max-w-6xl gap-10 px-4 sm:grid-cols-2 sm:px-6 lg:grid-cols-3 lg:px-8">
          <div class="max-w-sm">
            <h3 class="text-xs font-semibold uppercase tracking-wider text-white/50">Contacto</h3>
            <p class="mt-4">Email: contacto@realestate.com</p>
            <p class="mt-1">Teléfono: +1 234 567 890</p>
            <p class="mt-4 text-xs text-white/40">Lun–Sáb · 9:00 – 19:00</p>
          </div>
          <div>
            <h3 class="text-xs font-semibold uppercase tracking-wider text-white/50">Enlaces</h3>
            <ul class="mt-4 space-y-2.5">
              <li>
                <a
                  href="#"
                  class="text-white/70 transition hover:text-[#f6e527] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f6e527]"
                >
                  Política de privacidad
                </a>
              </li>
              <li>
                <a
                  href="#"
                  class="text-white/70 transition hover:text-[#f6e527] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f6e527]"
                >
                  Términos de servicio
                </a>
              </li>
              <li>
                <Link
                  href="/contact/"
                  class="text-white/70 transition hover:text-[#f6e527] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f6e527]"
                >
                  Agendar asesoría
                </Link>
              </li>
            </ul>
          </div>
          <div class="sm:col-span-2 lg:col-span-1">
            <h3 class="text-xs font-semibold uppercase tracking-wider text-white/50">Real Estate Explorer</h3>
            <p class="mt-4 text-sm leading-relaxed text-white/45">
              Experiencia inmobiliaria con foco en claridad, acompañamiento y datos útiles. Sin presión, con respuesta
              oportuna.
            </p>
          </div>
        </div>
        <p class="mx-auto mt-12 max-w-6xl border-t border-white/5 px-4 pt-6 text-center text-xs text-white/30 sm:px-6 lg:px-8">
          © {new Date().getFullYear()} Real Estate Explorer · Proyecto demo
        </p>
      </footer>
    </div>
  );
});

export const head: DocumentHead = {
  title: 'Real Estate Explorer — Inicio',
  meta: [
    {
      name: 'description',
      content:
        'Propiedades destacadas, buscador y asesoría: encuentra tu hogar con una experiencia clara y moderna.',
    },
  ],
};

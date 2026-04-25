import { component$ } from '@builder.io/qwik';
import { Link, routeLoader$, type DocumentHead } from '@builder.io/qwik-city';
import { LuArrowLeft, LuBath, LuBedDouble, LuMapPin } from '@qwikest/icons/lucide';

const catalog: Record<
  string,
  { title: string; meta: string; price: string; img: string; blurb: string }
> = {
  '1': {
    title: 'Villa de lujo',
    meta: '4 camas · 3 baños · 279 m²',
    price: '$1,200,000',
    img: 'https://picsum.photos/seed/rehome-villa/1200/720',
    blurb:
      'Residencia amplia con espacios sociales generosos, iluminación natural y acabados de alto nivel. Ideal para quien busca privacidad sin alejarse de servicios.',
  },
  '2': {
    title: 'Apartamento moderno',
    meta: '2 camas · 2 baños · 139 m²',
    price: '$850,000',
    img: 'https://picsum.photos/seed/rehome-apt/1200/720',
    blurb:
      'Planta eficiente, cocina integrada y vistas despejadas. Perfecto para profesionales o parejas que valoran la ubicación céntrica.',
  },
  '3': {
    title: 'Cabaña acogedora',
    meta: '3 camas · 2 baños · 186 m²',
    price: '$650,000',
    img: 'https://picsum.photos/seed/rehome-cabin/1200/720',
    blurb:
      'Ambiente cálido, materiales nobles y entorno tranquilo. Una opción equilibrada entre confort y contacto con la naturaleza.',
  },
};

export const usePropertyDetail = routeLoader$(({ params }) => {
  const id = params.id ?? '';
  const p = catalog[id];
  if (!p) {
    return { found: false as const, id };
  }
  return { found: true as const, id, ...p };
});

export default component$(() => {
  const data = usePropertyDetail();
  if (!data.value.found) {
    return (
      <div class="mx-auto max-w-2xl px-4 py-20 text-center text-white">
        <h1 class="text-2xl font-semibold">Propiedad no encontrada</h1>
        <p class="mt-3 text-white/65">El id “{data.value.id}” no está en el catálogo de ejemplo.</p>
        <Link
          href="/properties/"
          class="mt-8 inline-flex items-center gap-2 rounded-xl border border-white/20 px-4 py-2 text-sm font-semibold text-[#f6e527] hover:bg-white/5"
        >
          <LuArrowLeft class="h-4 w-4" aria-hidden="true" />
          Volver al listado
        </Link>
      </div>
    );
  }
  const p = data.value;
  return (
    <div class="mx-auto max-w-4xl px-4 py-10 text-white sm:px-6 lg:px-8">
      <Link
        href="/properties/"
        class="mb-8 inline-flex items-center gap-2 text-sm font-semibold text-[#f6e527] hover:underline"
      >
        <LuArrowLeft class="h-4 w-4" aria-hidden="true" />
        Volver a propiedades
      </Link>
      <article class="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] shadow-2xl">
        <div class="aspect-[21/9] w-full overflow-hidden sm:aspect-[2/1]">
          <img src={p.img} width={1200} height={720} alt="" class="h-full w-full object-cover" loading="eager" />
        </div>
        <div class="p-6 sm:p-10">
          <h1 class="text-3xl font-semibold tracking-tight sm:text-4xl">{p.title}</h1>
          <p class="mt-3 flex items-center gap-2 text-white/60">
            <LuMapPin class="h-4 w-4" aria-hidden="true" />
            Ubicación premium (ejemplo)
          </p>
          <div class="mt-4 flex flex-wrap gap-4 text-sm text-white/70">
            <span class="inline-flex items-center gap-2">
              <LuBedDouble class="h-4 w-4" />
              {p.meta.split('·')[0]?.trim()}
            </span>
            <span class="inline-flex items-center gap-2">
              <LuBath class="h-4 w-4" />
              {p.meta.split('·')[1]?.trim()}
            </span>
            <span>{p.meta.split('·')[2]?.trim()}</span>
          </div>
          <p class="mt-6 text-2xl font-semibold text-white">{p.price}</p>
          <p class="mt-6 leading-relaxed text-white/75">{p.blurb}</p>
          <Link
            href="/contact/"
            class="mt-10 inline-flex w-full items-center justify-center rounded-xl bg-gradient-to-r from-[#f6e527] to-[#ef7c43] py-3 text-sm font-semibold text-[#0B0914] sm:w-auto sm:px-10"
          >
            Agendar visita
          </Link>
        </div>
      </article>
    </div>
  );
});

export const head: DocumentHead = ({ resolveValue }) => {
  const d = resolveValue(usePropertyDetail);
  const title = d.found ? `${d.title} — Detalle` : 'Propiedad no encontrada';
  return {
    title,
    meta: [{ name: 'description', content: d.found ? d.blurb.slice(0, 155) : 'Listado de ejemplo.' }],
  };
};

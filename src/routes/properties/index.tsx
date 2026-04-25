import { component$ } from '@builder.io/qwik';
import type { DocumentHead } from '@builder.io/qwik-city';

export default component$(() => {
  return (
    <div class="container mx-auto p-4">
      <h1 class="text-4xl font-bold text-center mb-8">Listado de Propiedades</h1>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Aquí se pueden mapear las propiedades desde una fuente de datos */}
        <div class="bg-white shadow-md rounded-lg overflow-hidden">
          <img
            src="https://picsum.photos/seed/catalog-prop-1/800/480"
            alt="Property 1"
            width={800}
            height={480}
            class="w-full h-48 object-cover"
            loading="lazy"
          />
          <div class="p-4">
            <h2 class="text-2xl font-bold">Luxury Villa</h2>
            <p class="text-gray-600">4 beds • 3 baths • 3000 sqft</p>
            <p class="text-gray-800 font-bold mt-2">$1,200,000</p>
          </div>
        </div>
        <div class="bg-white shadow-md rounded-lg overflow-hidden">
          <img
            src="https://picsum.photos/seed/catalog-prop-2/800/480"
            alt="Property 2"
            width={800}
            height={480}
            class="w-full h-48 object-cover"
            loading="lazy"
          />
          <div class="p-4">
            <h2 class="text-2xl font-bold">Modern Apartment</h2>
            <p class="text-gray-600">2 beds • 2 baths • 1500 sqft</p>
            <p class="text-gray-800 font-bold mt-2">$850,000</p>
          </div>
        </div>
        <div class="bg-white shadow-md rounded-lg overflow-hidden">
          <img
            src="https://picsum.photos/seed/catalog-prop-3/800/480"
            alt="Property 3"
            width={800}
            height={480}
            class="w-full h-48 object-cover"
            loading="lazy"
          />
          <div class="p-4">
            <h2 class="text-2xl font-bold">Cozy Cottage</h2>
            <p class="text-gray-600">3 beds • 2 baths • 2000 sqft</p>
            <p class="text-gray-800 font-bold mt-2">$650,000</p>
          </div>
        </div>
      </div>
    </div>
  );
});

export const head: DocumentHead = {
  title: 'Listado de Propiedades',
  meta: [
    {
      name: 'description',
      content: 'Explora nuestro listado de propiedades disponibles.',
    },
  ],
};

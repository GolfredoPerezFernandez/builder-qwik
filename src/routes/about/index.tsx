import { component$ } from '@builder.io/qwik';
import type { DocumentHead } from '@builder.io/qwik-city';

export default component$(() => {
  return (
    <div class="container mx-auto p-4">
      <h1 class="text-4xl font-bold text-center mb-8">Sobre Nosotros</h1>
      <p class="text-lg text-gray-700 mb-4">
        Somos una empresa dedicada a ofrecer las mejores propiedades del mercado. Nuestro equipo de expertos está
        comprometido en ayudarte a encontrar la casa de tus sueños.
      </p>
      <p class="text-lg text-gray-700 mb-4">
        Con años de experiencia en el sector inmobiliario, garantizamos un servicio de calidad y atención personalizada.
      </p>
      <p class="text-lg text-gray-700">
        Contáctanos para más información sobre nuestras propiedades y servicios.
      </p>
    </div>
  );
});

export const head: DocumentHead = {
  title: 'Sobre Nosotros',
  meta: [
    {
      name: 'description',
      content: 'Conoce más sobre nuestra empresa y nuestro compromiso con el cliente.',
    },
  ],
};

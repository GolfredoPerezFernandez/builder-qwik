import { component$, Slot } from '@builder.io/qwik';

export default component$(() => {
  return (
    <div class="min-h-screen bg-[#0B0914] text-white antialiased">
      <Slot />
    </div>
  );
});

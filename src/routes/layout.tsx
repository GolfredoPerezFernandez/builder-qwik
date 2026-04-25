import { component$, Slot } from '@builder.io/qwik';
import { AgentChat } from '~/components/agent-chat/agent-chat';

export default component$(() => {
  return (
    <div 
      class="min-h-[100svh] relative antialiased selection:bg-[#f6e527]/30 bg-[#0B0914] overflow-hidden"
      style={{ fontFamily: 'Nunito Sans, ui-sans-serif, system-ui' }}
    >
      {/* Premium Ambient Background Effects */}
      <div class="fixed inset-0 z-0 pointer-events-none">
        <div class="absolute top-[-20%] right-[-10%] w-[50vw] h-[50vw] bg-[#4a2e85]/20 rounded-full blur-[120px]" />
        <div class="absolute bottom-[-20%] left-[-10%] w-[40vw] h-[40vw] bg-[#f6e527]/10 rounded-full blur-[120px]" />
        <div
          class="absolute top-[40%] left-[50%] translate-x-[-50%] translate-y-[-50%] w-[100vw] h-[100vh] bg-repeat opacity-[0.04] mix-blend-overlay"
          style={{ backgroundImage: "url('/noise.svg')", backgroundSize: '200px 200px' }}
        />
      </div>

      <main class="relative z-10 w-full min-h-screen flex flex-col">
        <Slot />
      </main>
      <AgentChat />
    </div>
  );
});

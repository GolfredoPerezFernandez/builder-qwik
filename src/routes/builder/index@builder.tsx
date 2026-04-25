import { component$ } from '@builder.io/qwik';
import { AgentChat } from '~/components/agent-chat/agent-chat';

export default component$(() => {
  return (
    <div class="fixed inset-0 flex flex-col overflow-hidden bg-[#0B0914]">
      <div class="flex-1 w-full relative">
        <iframe 
          src="/" 
          class="w-full h-full border-none bg-white shadow-2xl" 
          title="App Preview Shell"
          id="builder-iframe"
        />
        <div class="absolute top-4 left-4 pointer-events-none group">
            <div class="bg-[#4a2e85]/80 backdrop-blur-md text-white px-3 py-1 rounded-full text-xs border border-white/10 flex items-center gap-2">
                <div class="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                <span>Vista Previa Activa (Modo Constructor)</span>
            </div>
        </div>
      </div>
      <AgentChat />
    </div>
  );
});

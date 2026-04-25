import { component$, useSignal, $ } from '@builder.io/qwik';
import { streamAgent } from './agent-server';

export const AgentChat = component$(() => {
  const isOpen = useSignal(false);
  const messages = useSignal<{role: 'user' | 'agent', content: string}[]>([]);
  const input = useSignal('');
  const isLoading = useSignal(false);

  const sendMessage = $(async () => {
    if (!input.value.trim() || isLoading.value) return;
    
    messages.value = [...messages.value, { role: 'user', content: input.value }];
    const currentInput = input.value;
    input.value = '';
    isLoading.value = true;
    
    try {
      const historyToSend = messages.value.slice(0, -1); // Exclude the message we just added
      
      // Initialize an empty message entry for the agent
      const agentMsgIndex = messages.value.length;
      messages.value = [...messages.value, { role: 'agent', content: '' }];
      
      const response = await streamAgent(currentInput, historyToSend);
      
      // Append each stream chunk iteratively to the agent's message
      for await (const chunk of response) {
         const currentMessages = messages.value;
         messages.value = [
            ...currentMessages.slice(0, agentMsgIndex),
            { ...currentMessages[agentMsgIndex], content: currentMessages[agentMsgIndex].content + chunk },
            ...currentMessages.slice(agentMsgIndex + 1)
         ];
      }
    } catch (error) {
       messages.value = [...messages.value, { role: 'agent', content: 'Error communicating with AI.' }];
    } finally {
      isLoading.value = false;
    }
  });

  return (
    <div class="fixed bottom-4 right-4 z-[9999]">
      {!isOpen.value ? (
        <button 
          onClick$={() => isOpen.value = true}
          class="bg-[#4a2e85] text-white p-4 rounded-full shadow-lg hover:bg-[#3a206b] transition-colors"
        >
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"></path></svg>
        </button>
      ) : (
        <div class="bg-white rounded-xl shadow-2xl w-[350px] sm:w-[400px] h-[500px] flex flex-col border border-[#4a2e85]/20 overflow-hidden">
          <div class="bg-[#4a2e85] text-white p-4 flex justify-between items-center">
            <h3 class="font-bold">App Builder AI</h3>
            <button onClick$={() => isOpen.value = false} class="text-white/80 hover:text-white">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
            </button>
          </div>
          
          <div class="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.value.map((msg, i) => (
              <div key={i} class={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div class={`max-w-[80%] p-3 rounded-lg ${msg.role === 'user' ? 'bg-[#f6e527] text-[#4a2e85] rounded-br-none' : 'bg-gray-100 text-gray-800 rounded-bl-none'}`}>
                  {msg.content}
                </div>
              </div>
            ))}
            {isLoading.value && (
              <div class="flex justify-start">
                <div class="bg-gray-100 text-gray-800 p-3 rounded-lg rounded-bl-none animate-pulse">
                  Escribiendo...
                </div>
              </div>
            )}
          </div>
          
          <div class="p-3 border-t bg-gray-50 flex gap-2">
            <input 
              type="text" 
              bind:value={input}
              onKeyUp$={(e) => e.key === 'Enter' && sendMessage()}
              placeholder="Construye algo nuevo..."
              class="flex-1 px-3 py-2 border rounded-lg focus:outline-none focus:border-[#4a2e85] text-gray-800"
            />
            <button 
              onClick$={sendMessage}
              disabled={isLoading.value}
              class="bg-[#4a2e85] text-white px-4 py-2 rounded-lg disabled:opacity-50"
            >
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"></path></svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
});

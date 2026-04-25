import { $, component$, useSignal, useStore, useVisibleTask$ } from '@builder.io/qwik';
import { useLocation } from '@builder.io/qwik-city';
import { streamAgent, reportBrowserLog } from './agent-server';
import {
  loadBuilderChatMessages,
  saveBuilderChatMessages,
  clearBuilderChatMessages,
  type ChatPersistMessage,
} from './chat-persistence';

export interface Todo {
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
}

export const AgentChat = component$(() => {
  const loc = useLocation();
  const isOpen = useSignal(false);
  const messages = useSignal<{role: 'user' | 'agent', content: string}[]>([]);
  const input = useSignal('');
  const isLoading = useSignal(false);
  const abortController = useSignal<AbortController | null>(null);
  
  const todos = useStore<Todo[]>([]);
  const screenshots = useStore<{name: string, path: string, loading: boolean}[]>([]);
  
  const fileInputRef = useSignal<HTMLInputElement>();
  const attachments = useSignal<{name: string, type: string, data: string}[]>([]);
  const chatContainerRef = useSignal<HTMLElement>();

  // Auto-scroll al fondo cuando hay mensajes nuevos
  useVisibleTask$(({ track }) => {
    track(() => messages.value.length);
    track(() => messages.value[messages.value.length - 1]?.content);
    track(() => isLoading.value);
    
    if (chatContainerRef.value) {
      chatContainerRef.value.scrollTo({
        top: chatContainerRef.value.scrollHeight,
        behavior: 'smooth'
      });
    }
  });

  const sendMessage = $(async () => {
    if (!input.value.trim() && attachments.value.length === 0) return;

    // Si hay una corrida previa aún viva (pestaña duplicada, HMR, etc.), la cortamos
    // antes de lanzar otra. Evita 2-3 slots en paralelo en LM Studio con el mismo
    // historial, que es lo que hace que la UI quede en "Escribiendo..." varios minutos.
    if (abortController.value) {
      try { abortController.value.abort(); } catch { /* ignore */ }
    }

    let userDisplayContent = input.value;
    if (attachments.value.length > 0) {
      userDisplayContent += `\n(Adjuntos: ${attachments.value.map(a => a.name).join(', ')})`;
    }

    messages.value = [...messages.value, { role: 'user', content: userDisplayContent || '(Archivos adjuntos)' }];
    
    const currentInput = input.value;
    const currentAttachments = [...attachments.value];
    
    input.value = '';
    attachments.value = [];
    isLoading.value = true;
    
    abortController.value = new AbortController();
    
    try {
      const historyToSend = messages.value.slice(0, -1); // Exclude the message we just added
      
      // Initialize an empty message entry for the agent
      const agentMsgIndex = messages.value.length;
      messages.value = [...messages.value, { role: 'agent', content: '' }];
      
      const response = await streamAgent(currentInput, historyToSend, loc.url.pathname, currentAttachments);
      
      // Append each stream chunk iteratively to the agent's message
      for await (const chunk of response) {
         if (abortController.value && abortController.value.signal.aborted) break;
         
         if (chunk.startsWith('STATE:TODO_LIST:')) {
            try {
              const json = chunk.replace('STATE:TODO_LIST:', '');
              const list = JSON.parse(json);
              todos.length = 0;
              todos.push(...list);
            } catch {
              /* invalid todo JSON from stream */
            }
            continue;
         }
         
         if (chunk.startsWith('STATE:SCREENSHOT_STARTING:')) {
            const name = chunk.replace('STATE:SCREENSHOT_STARTING:', '');
            // Buscamos si ya existe (para no duplicar si el agente reintenta)
            if (!screenshots.find(s => s.name === name)) {
              screenshots.push({ name, path: `/screenshots/${name}`, loading: true });
            }
            continue;
         }
         
         if (chunk.startsWith('STATE:SCREENSHOT_DONE:')) {
            const name = chunk.replace('STATE:SCREENSHOT_DONE:', '');
            const shot = screenshots.find(s => s.name === name);
            if (shot) shot.loading = false;
            continue;
         }

         const currentMessages = messages.value;
         messages.value = [
            ...currentMessages.slice(0, agentMsgIndex),
            { ...currentMessages[agentMsgIndex], content: currentMessages[agentMsgIndex].content + chunk },
            ...currentMessages.slice(agentMsgIndex + 1)
         ];
      }
    } catch {
      messages.value = [...messages.value, { role: 'agent', content: 'Error communicating with AI.' }];
    } finally {
      isLoading.value = false;
      abortController.value = null;
      try {
        const convId = loc.url.pathname || '/';
        await saveBuilderChatMessages(convId, messages.value as ChatPersistMessage[]);
      } catch (e) {
        console.error('[AgentChat] Failed to persist chat', e);
      }
    }
  });

  const stopGeneration = $(() => {
    if (abortController.value) {
      abortController.value.abort();
      isLoading.value = false;
    }
  });

  // Cargar historial desde Turso/libSQL por ruta (conversation_id = pathname)
  useVisibleTask$(async ({ track }) => {
    const path = track(() => loc.url.pathname || '/');
    try {
      const loaded = await loadBuilderChatMessages(String(path));
      const rows = Array.isArray(loaded) ? loaded : [];
      if (rows.length > 0) {
        messages.value = rows;
      } else {
        const legacy = sessionStorage.getItem('agent_messages');
        if (legacy) {
          try {
            const parsed = JSON.parse(legacy) as ChatPersistMessage[];
            if (Array.isArray(parsed) && parsed.length > 0) {
              messages.value = parsed;
              await saveBuilderChatMessages(path, parsed);
            }
          } catch {
            /* ignore */
          }
        }
        sessionStorage.removeItem('agent_messages');
      }
    } catch (e) {
      console.error('[AgentChat] DB load failed, falling back to sessionStorage if present', e);
      const legacy = sessionStorage.getItem('agent_messages');
      if (legacy) {
        try {
          messages.value = JSON.parse(legacy);
        } catch {
          /* ignore */
        }
      }
    }
  });

  // Recuperar panel tras HMR. No re-enviamos al LLM automáticamente: provocaba un segundo POST
  // enorme a LM Studio (mismo historial + mensaje sistema) y el chat parecía "colgado" minutos.
  useVisibleTask$(() => {
    const savedState = sessionStorage.getItem('agent_isOpen');
    if (savedState === 'true') isOpen.value = true;
    sessionStorage.removeItem('agent_isLoading');
    isLoading.value = false;
  });

  useVisibleTask$(({ track }) => {
    track(() => isOpen.value);
    track(() => isLoading.value);
    sessionStorage.setItem('agent_isOpen', String(isOpen.value));
    sessionStorage.setItem('agent_isLoading', String(isLoading.value));
  });

  const clearMessages = $(async () => {
    if (!confirm('¿Estás seguro de que deseas borrar el historial del chat?')) return;
    const convId = loc.url.pathname || '/';
    try {
      await clearBuilderChatMessages(convId);
    } catch (e) {
      console.error('[AgentChat] DB clear failed', e);
    }
    messages.value = [];
    todos.length = 0;
    screenshots.length = 0;
    sessionStorage.removeItem('agent_messages');
    sessionStorage.removeItem('agent_isLoading');
  });

  useVisibleTask$(() => {
    const originalLog = console.log;
    const originalError = console.error;
    const originalWarn = console.warn;

    console.log = (...args) => {
      originalLog(...args);
      reportBrowserLog('log', args.map(a => String(a)).join(' '));
    };
    console.error = (...args) => {
      originalError(...args);
      reportBrowserLog('error', args.map(a => String(a)).join(' '));
    };
    console.warn = (...args) => {
      originalWarn(...args);
      reportBrowserLog('warn', args.map(a => String(a)).join(' '));
    };

    const handleError = (event: ErrorEvent) => {
      const msg = event.error ? event.error.message : event.message;
      reportBrowserLog('error', `[Window Error] ${msg}`);
    };

    const handleRejection = (event: PromiseRejectionEvent) => {
      reportBrowserLog('error', `[Unhandled Rejection] ${event.reason}`);
    };

    // Capturar errores de recursos (como 404s de imágenes/scripts)
    const handleResourceError = (event: Event) => {
      const target = event.target as HTMLElement;
      if (target && (target.tagName === 'IMG' || target.tagName === 'SCRIPT' || target.tagName === 'LINK')) {
        const url = (target as any).src || (target as any).href;
        reportBrowserLog('error', `[Network Error] Failed to load ${target.tagName}: ${url}`);
      }
    };

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleRejection);
    window.addEventListener('error', handleResourceError, true); // true para capturar en fase de capture (necesario para recursos)

    return () => {
      console.log = originalLog;
      console.error = originalError;
      console.warn = originalWarn;
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleRejection);
      window.removeEventListener('error', handleResourceError, true);
    };
  });

  const handleFileChange = $((event: Event) => {
    const target = event.target as HTMLInputElement;
    if (!target.files) return;

    Array.from(target.files).forEach(file => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const data = e.target?.result as string;
        attachments.value = [...attachments.value, {
           name: file.name,
           type: file.type,
           data
        }];
      };
      reader.readAsDataURL(file);
    });
    // Limpiamos el input para permitir misma selección de nuevo
    target.value = '';
  });

  const removeAttachment = $((index: number) => {
    attachments.value = attachments.value.filter((_, i) => i !== index);
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
            <div class="flex items-center gap-2">
              <h3 class="font-bold">App Builder AI</h3>
              <button 
                onClick$={clearMessages}
                class="p-1 hover:bg-white/10 rounded-md transition-colors text-white/60 hover:text-red-400"
                title="Limpiar historial"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
              </button>
            </div>
            <button onClick$={() => isOpen.value = false} class="text-white/80 hover:text-white">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
            </button>
          </div>
          
          <div ref={chatContainerRef} class="flex-1 overflow-y-auto p-4 space-y-4">
            {todos.length > 0 && (
              <div class="bg-[#4a2e85]/5 border border-[#4a2e85]/10 rounded-lg p-3 space-y-2 mb-4">
                <div class="flex justify-between items-center text-[10px] uppercase tracking-wider text-[#4a2e85] font-bold">
                  <span>Progreso del Agente</span>
                  <span>{Math.round((todos.filter(t => t.status === 'completed').length / todos.length) * 100)}%</span>
                </div>
                <div class="w-full bg-gray-200 rounded-full h-1.5 overflow-hidden">
                  <div 
                    class="bg-gradient-to-r from-[#f6e527] to-[#ef7c43] h-full transition-all duration-500" 
                    style={{ width: `${(todos.filter(t => t.status === 'completed').length / todos.length) * 100}%` }}
                  ></div>
                </div>
                <div class="space-y-1">
                  {todos.map((todo, i) => (
                    <div key={i} class="flex items-center gap-2 text-xs">
                      {todo.status === 'completed' ? (
                        <span class="text-green-500">✓</span>
                      ) : todo.status === 'in_progress' ? (
                        <span class="w-2 h-2 bg-[#ef7c43] rounded-full animate-pulse"></span>
                      ) : (
                        <span class="w-2 h-2 bg-gray-300 rounded-full"></span>
                      )}
                      <span class={todo.status === 'completed' ? 'text-gray-400 line-through' : 'text-gray-700'}>
                        {todo.content}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

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
            {screenshots.length > 0 && (
               <div class="mt-4 space-y-2">
                 <p class="text-[10px] font-bold text-gray-400 uppercase">Verificación Visual</p>
                 <div class="flex gap-2 overflow-x-auto pb-2 scrollbar-thin">
                   {screenshots.map((s, i) => (
                     <a key={i} href={s.path} target="_blank" class={`flex-shrink-0 relative group ${s.loading ? 'opacity-50 pointer-events-none' : ''}`}>
                       {s.loading ? (
                         <div class="h-20 w-32 border-2 border-dashed border-gray-300 rounded flex items-center justify-center animate-pulse">
                           <span class="text-[8px] text-gray-400 font-bold uppercase">Capturando...</span>
                         </div>
                       ) : (
                         <>
                           <img
                            src={s.path}
                            width={128}
                            height={80}
                            class="h-20 w-32 object-cover rounded border border-gray-200 shadow-sm"
                            alt={s.name}
                          />
                           <div class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded">
                             <span class="text-[10px] text-white font-bold">Ver Full</span>
                           </div>
                         </>
                       )}
                     </a>
                   ))}
                 </div>
               </div>
            )}
          </div>
          
          {attachments.value.length > 0 && (
            <div class="px-3 pb-2 pt-1 bg-gray-50 border-t flex gap-2 overflow-x-auto">
              {attachments.value.map((file, i) => (
                <div key={i} class="flex items-center gap-1 bg-black/5 text-xs text-black/70 px-2 py-1 rounded-md whitespace-nowrap">
                  <span class="truncate max-w-[100px]">{file.name}</span>
                  <button onClick$={() => removeAttachment(i)} class="hover:text-red-500 font-bold ml-1">×</button>
                </div>
              ))}
            </div>
          )}

          <div class="p-3 border-t bg-gray-50 flex gap-2">
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange$={handleFileChange} 
              multiple 
              accept=".pdf,.docx,.doc,.txt,image/*" 
              class="hidden" 
            />
            <button 
              onClick$={() => fileInputRef.value?.click()}
              class="text-gray-400 hover:text-[#4a2e85]"
              title="Adjuntar archivo (PDF, Word, Imágenes)"
            >
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
            </button>
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
              class={`bg-[#4a2e85] text-white px-4 py-2 rounded-lg disabled:opacity-50 ${isLoading.value ? 'hidden' : 'block'}`}
            >
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"></path></svg>
            </button>
            
            {isLoading.value && (
              <button 
                onClick$={stopGeneration}
                class="bg-red-500 text-white px-4 py-2 rounded-lg hover:bg-red-600 transition-colors"
                title="Detener generación"
              >
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H10a1 1 0 01-1-1v-4z" /></svg>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
});

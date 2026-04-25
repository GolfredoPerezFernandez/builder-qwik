import { server$ } from '@builder.io/qwik-city';
import { createDeepAgent, CompositeBackend, FilesystemBackend, StoreBackend } from 'deepagents';
import { ChatOpenAI } from '@langchain/openai';
import { InMemoryStore } from '@langchain/langgraph-checkpoint';
import path from 'path';

export const streamAgent = server$(async function* (message: string, history: any[]) {
  try {
    const apiKey = this.env.get('OPENAI_API_KEY');
    
    if (!apiKey) {
      yield "⚠️ No se encontró **OPENAI_API_KEY** en las variables de entorno. Por favor configúrala para habilitar el agente.";
      return;
    }

    const model = new ChatOpenAI({ 
      modelName: "gpt-5.3-codex",
      openAIApiKey: apiKey,
      temperature: 0,
      streaming: true // Habilitamos la capacidad de recibir stream de OpenAI
    });

    const store = new InMemoryStore();

    const backendFactory = (config: any) => new CompositeBackend(
      new FilesystemBackend({ rootDir: process.cwd() }),
      { "/memories/": new StoreBackend(config) }
    );

    const agent = createDeepAgent({
      model: model as any,
      store,
      backend: backendFactory,
      memory: [path.join(process.cwd(), "AGENTS.md")],
      system: `You are the automated App Builder AI, embedded into this Qwik application.
Your purpose is to modify the codebase in real-time acting as a 'seed' that constructs other apps or features based on user requests.
You have access to the project's actual file system through your tools.
The AGENTS.md memory file loaded into your context contains the architectural guidelines you must adhere to.
Always briefly explain your reasoning before modifying files.`,
    });

    // Usamos el modo stream de LangGraph para capturar los chunks de manera progresiva
    const stream = await agent.stream({
      messages: [
        ...history.map((msg: any) => ({ role: msg.role, content: msg.content })),
        { role: 'user', content: message }
      ]
    }, { streamMode: "messages" });

    // Iteramos asincronamente y emitimos el contenido usando "yield"
    for await (const [chunk, _metadata] of stream) {
      if (chunk.content && typeof chunk.content === 'string') {
        yield chunk.content;
      }
    }
  } catch (err: any) {
    yield "\\n\\n❌ Error: " + err.message;
  }
});

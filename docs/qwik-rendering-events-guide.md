# Qwik: Rendering y Eventos (Guía práctica)

Esta guía resume cómo renderiza Qwik y cómo manejar eventos de forma correcta, con foco en rendimiento, resumabilidad y DX.

## 1) Renderizado en Qwik

Qwik actualiza el DOM a partir de cambios reactivos (signals/stores/context) y plantillas JSX.

### Puntos clave
- Qwik puede renderizar de forma asíncrona y granular.
- El objetivo es ejecutar y descargar solo lo necesario.
- Las actualizaciones se agrupan (batching) para evitar repaints intermedios innecesarios.

## 2) JSX en Qwik (diferencias importantes)

- Los componentes se declaran con `component$()`.
- El estado local simple se maneja con `useSignal()`.
- Los handlers usan sufijo `$` (`onClick$`, `onInput$`, etc.).
- En JSX de Qwik se prefieren atributos HTML (`class`, `for`) en lugar de variantes estilo React.

## 3) Render de componentes hijos

Qwik evita trabajo innecesario: un hijo se reevalúa cuando cambian dependencias que consume.

Eso incluye:
- Props.
- Signals o contexto leídos dentro del hijo.

No depende únicamente de cambios de props.

## 4) Listas y keys

Al renderizar colecciones con `map`, cada ítem debe tener una `key` estable y única.

### Recomendación
- Usa IDs del dominio (DB/API).
- Evita índice del array como key salvo listas estáticas sin reordenamiento.

## 5) Render condicional

Usa patrones estándar de JS:
- Operador ternario (`cond ? A : B`).
- `&&` para bloques opcionales.

## 6) `dangerouslySetInnerHTML`

Úsalo solo cuando no haya alternativa declarativa.

### Regla de seguridad
- Renderizar únicamente contenido confiable o sanitizado (idealmente en servidor) para evitar XSS.

## 7) Formularios: `bind:` y sincronización estable

### `bind:`
- `bind:value` y `bind:checked` funcionan muy bien con `useSignal`.
- Para inputs numéricos, preferir lectura con `valueAsNumber` en handlers manuales.

### Cuándo usar enfoque manual (`value` + `onInput$`)
- Si necesitas transformación/sanitización (ej. solo dígitos).
- Si no trabajas con un `Signal` directo.

### Recomendación práctica
- Evita re-sincronizaciones agresivas del valor mientras el campo está enfocado.
- Si usas estado local intermedio, sincroniza desde padre solo cuando no estás editando activamente.

## 8) Eventos en Qwik

### Registro
- Se usan props `on{EventName}$`.
- Ejemplo típico: `onClick$={() => ...}`.

### Reutilización de handlers
- Si extraes un handler, envuélvelo en `$()` para producir un QRL reutilizable.

### Múltiples handlers
- Puedes pasar un array en el mismo evento: `onClick$={[h1, h2, h3]}`.

### Event object y `currentTarget`
- Primer argumento: `event`.
- Segundo argumento en handler Qwik: `currentTarget`.

## 9) Eventos asíncronos y casos síncronos

Por diseño, los handlers pueden ejecutarse de forma asíncrona (lazy-loaded). Algunas APIs requieren sincronía.

### Para `preventDefault` / `stopPropagation`
- Declarativo: `preventdefault:click`, `stoppropagation:click`.
- Condicional o más complejo: usar `sync$()`.

### Drag & Drop y APIs sensibles a timing
- Prioriza `sync$()` para operaciones que deban ocurrir en el mismo tick del evento.
- Usa lógica asíncrona adicional en `$()` después, si aplica.

### Sobre `useVisibleTask$`
- No usarlo como patrón principal para listeners del DOM.
- Reservarlo para casos sin alternativa declarativa real, porque fuerza trabajo eager en cliente.

## 10) Eventos en `window` y `document`

Opciones:
- Declarativo en JSX con prefijos `window:on...` / `document:on...`.
- Programático con `useOn`, `useOnWindow`, `useOnDocument`.

Ventaja: limpieza automática al desmontar el componente.

---

## Do / Don’t rápido

### Do
- Usa `component$`, `useSignal` y handlers con `$`.
- Usa keys estables en listas.
- Usa `sync$()` cuando una API lo exija.
- Sanitiza cualquier HTML inyectado.

### Don’t
- No asumir que solo props disparan render de hijos.
- No usar índice como key en listas dinámicas.
- No depender de `event.preventDefault()` dentro de handlers asíncronos sin `sync$`/atributos declarativos.
- No abusar de `useVisibleTask$` para listeners que pueden declararse en JSX.

---

## Snippet de referencia (form input robusto)

```tsx
import { component$, useSignal, $, useTask$ } from '@builder.io/qwik';

export default component$(() => {
  const model = useSignal('');
  const local = useSignal(model.value);
  const inputRef = useSignal<HTMLInputElement>();

  useTask$(({ track }) => {
    track(() => model.value);
    if (document.activeElement !== inputRef.value && local.value !== model.value) {
      local.value = model.value;
    }
  });

  return (
    <input
      ref={inputRef}
      bind:value={local}
      onInput$={$((_, el) => {
        const next = el.value;
        local.value = next;
        model.value = next;
      })}
    />
  );
});
```

Este patrón ayuda a evitar “saltos” o pérdida de caracteres cuando hay validaciones o sincronización entre estado local y estado padre.

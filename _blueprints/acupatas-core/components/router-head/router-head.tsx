/** @jsxImportSource @builder.io/qwik */
import { useDocumentHead, useLocation } from "@builder.io/qwik-city";
import { component$ } from "@builder.io/qwik";
import * as pwaHead from "@qwikdev/pwa/head";

/**
 * The RouterHead component is placed inside of the document `<head>` element.
 */
export const RouterHead = component$(() => {
  const head = useDocumentHead();
  const loc = useLocation();

  return (
    <>
      <title>{head.title}</title>
      <link rel="canonical" href={loc.url.href} />
      <link rel="icon" type="image/x-icon" href="/favicon.ico" />
      <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png" />
      <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />
      <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      {head.meta.map((m) => (
        <meta key={m.key} {...m} />
      ))}
      {pwaHead.meta.map((m) => (
        <meta key={m.key} {...m} />
      ))}
      {pwaHead.links.map((l) => (
        <link key={l.key} {...l} />
      ))}
      {head.links.map((l) => (
        <link key={l.key} {...l} />
      ))}
      {head.styles.map((s) => {
        const styleProps: any = { ...s.props, dangerouslySetInnerHTML: { __html: s.style } };
        return <style key={s.key} {...styleProps} />;
      })}
      {head.scripts.map((s) => {
        const scriptProps: any = { ...s.props, dangerouslySetInnerHTML: { __html: s.script } };
        return <script key={s.key} {...scriptProps} />;
      })}
    </>
  );
});

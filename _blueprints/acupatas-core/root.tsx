import { component$, sync$, useOnDocument, useVisibleTask$ } from "@builder.io/qwik";
import {
  QwikCityProvider,
  RouterOutlet,
  ServiceWorkerRegister,
} from "@builder.io/qwik-city";
import { isDev } from "@builder.io/qwik/build";
import { RouterHead } from "./components/router-head/router-head";

import "./global.css";
import "./theme.css";

export default component$(() => {
  useOnDocument(
    "qviewTransition",
    sync$((event: CustomEvent<ViewTransition>) => {
      const transition = event.detail;
      const docEl = document.documentElement;
      docEl.dataset.routeTransition = "running";

      const transitionItems = document.querySelectorAll<HTMLElement>("[data-vt]");
      for (const item of transitionItems) {
        if (!item.checkVisibility()) continue;
        item.dataset.vtActive = "true";
        const viewName = item.dataset.vt?.trim();
        if (viewName && !item.style.viewTransitionName) {
          item.style.viewTransitionName = viewName;
        }
      }

      const clear = () => {
        delete docEl.dataset.routeTransition;
        for (const item of transitionItems) {
          delete item.dataset.vtActive;
        }
      };

      void transition.finished.finally(clear);
    })
  );

  // Keep clients in sync after deploy by activating and reloading on SW updates.
  useVisibleTask$(({ cleanup }) => {
    if (!("serviceWorker" in navigator)) return;

    let reloadedFromUpdate = false;

    const onControllerChange = () => {
      if (reloadedFromUpdate) return;
      reloadedFromUpdate = true;
      window.location.reload();
    };

    const scheduleUpdateCheck = () => {
      void navigator.serviceWorker
        .getRegistration()
        .then((registration) => registration?.update())
        .catch(() => undefined);
    };

    const attachUpdateListener = async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      if (!registration) return;

      const onUpdateFound = () => {
        const installing = registration.installing;
        if (!installing) return;

        installing.addEventListener("statechange", () => {
          if (installing.state === "installed" && navigator.serviceWorker.controller) {
            registration.waiting?.postMessage({ type: "SKIP_WAITING" });
          }
        });
      };

      registration.addEventListener("updatefound", onUpdateFound);
      cleanup(() => registration.removeEventListener("updatefound", onUpdateFound));
    };

    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
    window.addEventListener("online", scheduleUpdateCheck);

    void attachUpdateListener();
    scheduleUpdateCheck();

    const periodicCheck = window.setInterval(scheduleUpdateCheck, 60_000);

    cleanup(() => {
      window.clearInterval(periodicCheck);
      window.removeEventListener("online", scheduleUpdateCheck);
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
    });
  });

  return (
    <QwikCityProvider>
      <head>
        <meta charSet="utf-8" />
        <link rel="manifest" href="/manifest.json" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Acupatas" />
        <RouterHead />
        {!isDev && <ServiceWorkerRegister />}
      </head>
      <body>
        <RouterOutlet />
      </body>
    </QwikCityProvider>
  );
});

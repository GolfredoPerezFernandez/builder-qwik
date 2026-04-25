import { component$, Slot, useSignal, $ } from '@builder.io/qwik';
import { Link, useLocation } from '@builder.io/qwik-city';
import LogoImage from '~/media/logo.png?jsx';
import { Footer } from '~/components/footer/footer';
import { PushManager } from '~/components/push-manager';
import { AgentChat } from '~/components/agent-chat/agent-chat';

export default component$(() => {
  const location = useLocation();
  const mobileMenuOpen = useSignal(false);

  const isDashboard = location.url.pathname.startsWith('/dashboard');
  const isAuth = location.url.pathname.startsWith('/auth');
  const isHome = location.url.pathname === '/';

  return (
    <div
      class={`${isAuth
        ? 'min-h-screen bg-white' // Layout minimalista para Auth
        : `min-h-[100svh] antialiased selection:bg-[#f6e527]/30 bg-white overflow-x-hidden ${isDashboard ? 'flex flex-col' : 'grid grid-rows-[auto_1fr_auto]'}`
        }`}
      style={{ fontFamily: 'Nunito Sans, ui-sans-serif, system-ui' }}
    >
      {!isDashboard && (
        <header
          class={`relative z-20 h-16 ${isHome ? 'bg-transparent border-transparent' : 'border-b border-[#4a2e85]/10 bg-white/90 backdrop-blur'
            }`}
        >
          <div class="max-w-7xl h-full mx-auto px-4 sm:px-6 lg:px-8">
            <div class="flex items-center justify-between h-full">
              <div class="flex items-center gap-2">
                <div class="h-12 w-12 sm:h-14 sm:w-14 rounded-full overflow-hidden flex items-center justify-center">
                  <LogoImage alt="ACUPATAS" class="h-10 w-10 sm:h-12 sm:w-12 object-contain" />
                </div>
                <div class="text-lg sm:text-2xl font-bold text-[#4a2e85] tracking-tight">ACUPATAS</div>
              </div>
              <nav class="hidden md:flex items-center gap-8">
                {!isDashboard && (
                  <>
                    <Link href="/" class="text-[#4a2e85]/80 hover:text-[#4a2e85] transition-colors">Inicio</Link>
                    <a href="/#como-funciona" class="text-[#4a2e85]/80 hover:text-[#4a2e85] transition-colors">Como funciona</a>
                    <a href="/#seguridad" class="text-[#4a2e85]/80 hover:text-[#4a2e85] transition-colors">Seguridad</a>
                    <a href="/#contacto" class="text-[#4a2e85]/80 hover:text-[#4a2e85] transition-colors">Contacto</a>
                  </>
                )}
                {isDashboard && (
                  <>
                    <Link href="/dashboard" class="text-[#4a2e85]/80 hover:text-[#4a2e85] transition-colors">Dashboard</Link>
                    <Link href="/dashboard/owner" class="text-[#4a2e85]/80 hover:text-[#4a2e85] transition-colors">Dueno</Link>
                    <Link href="/dashboard/caregiver" class="text-[#4a2e85]/80 hover:text-[#4a2e85] transition-colors">Cuidador</Link>
                    <Link href="/dashboard/caregiver-search" class="text-[#4a2e85]/80 hover:text-[#4a2e85] transition-colors">Buscar</Link>
                  </>
                )}
              </nav>
              <div class="flex items-center gap-3">
                {!isDashboard && !isAuth && (
                  <div class="hidden sm:flex items-center gap-3">
                    <Link href="/auth?mode=login" class="px-4 py-2 text-[#4a2e85]/80 hover:text-[#4a2e85] transition-colors">Iniciar sesion</Link>
                    <Link href="/auth?mode=registro" class="px-6 py-2 bg-gradient-to-r from-[#f6e527] to-[#ef7c43] text-[#4a2e85] font-medium rounded-lg hover:from-[#ef7c43] hover:to-[#f6e527] transition-all">
                      Registrarse
                    </Link>
                  </div>
                )}
                {isDashboard && (
                  <>
                    <Link href="/dashboard/payment" class="px-4 py-2 text-[#4a2e85]/80 hover:text-[#4a2e85] transition-colors">Pagos</Link>
                    <button class="px-4 py-2 text-red-600 hover:text-red-700 transition-colors">Salir</button>
                  </>
                )}
                {isAuth && (
                  <Link href="/" class="px-4 py-2 text-[#4a2e85]/80 hover:text-[#4a2e85] transition-colors">Volver al inicio</Link>
                )}
                <button
                  class="md:hidden p-2"
                  onClick$={$(() => (mobileMenuOpen.value = !mobileMenuOpen.value))}
                >
                  <svg class="w-6 h-6 text-[#4a2e85]/80" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    {mobileMenuOpen.value ? (
                      <path d="M18 6L6 18M6 6l12 12" />
                    ) : (
                      <>
                        <line x1="3" y1="12" x2="21" y2="12" />
                        <line x1="3" y1="6" x2="21" y2="6" />
                        <line x1="3" y1="18" x2="21" y2="18" />
                      </>
                    )}
                  </svg>
                </button>
              </div>
            </div>
          </div>

          {mobileMenuOpen.value && (
            <div class="md:hidden absolute top-full left-0 right-0 bg-white border-b border-[#4a2e85]/10 shadow-lg z-50">
              <div class="px-4 py-4 space-y-2">
                {!isDashboard && !isAuth && (
                  <>
                    <a href="/#como-funciona" class="block py-2 text-[#4a2e85]/80 hover:text-[#4a2e85] transition-colors">Como funciona</a>
                    <a href="/#seguridad" class="block py-2 text-[#4a2e85]/80 hover:text-[#4a2e85] transition-colors">Seguridad</a>
                    <a href="/#contacto" class="block py-2 text-[#4a2e85]/80 hover:text-[#4a2e85] transition-colors">Contacto</a>
                    <div class="pt-2 border-t border-[#4a2e85]/10">
                      <Link href="/auth?mode=login" class="block py-2 text-[#4a2e85]/80 hover:text-[#4a2e85] transition-colors">Iniciar sesion</Link>
                      <Link href="/auth?mode=registro" class="block py-2 px-4 bg-gradient-to-r from-[#f6e527] to-[#ef7c43] text-[#4a2e85] font-medium rounded-lg hover:from-[#ef7c43] hover:to-[#f6e527] transition-all text-center">
                        Registrarse
                      </Link>
                    </div>
                  </>
                )}
                {isDashboard && (
                  <>
                    <Link href="/dashboard" class="block py-2 text-[#4a2e85]/80 hover:text-[#4a2e85] transition-colors">Dashboard</Link>
                    <Link href="/dashboard/owner" class="block py-2 text-[#4a2e85]/80 hover:text-[#4a2e85] transition-colors">Panel Dueno</Link>
                    <Link href="/dashboard/caregiver" class="block py-2 text-[#4a2e85]/80 hover:text-[#4a2e85] transition-colors">Panel Cuidador</Link>
                    <Link href="/dashboard/caregiver-search" class="block py-2 text-[#4a2e85]/80 hover:text-[#4a2e85] transition-colors">Buscar Cuidador</Link>
                    <Link href="/dashboard/payment" class="block py-2 text-[#4a2e85]/80 hover:text-[#4a2e85] transition-colors">Pagos</Link>
                    <div class="pt-2 border-t border-[#4a2e85]/10">
                      <button class="block w-full text-left py-2 text-red-600 hover:text-red-700 transition-colors">Cerrar sesion</button>
                    </div>
                  </>
                )}
                {isAuth && (
                  <Link href="/" class="block py-2 text-[#4a2e85]/80 hover:text-[#4a2e85] transition-colors">Volver al inicio</Link>
                )}
              </div>
            </div>
          )}
        </header>
      )}

      {/* Loading Progress Bar */}
      {location.isNavigating && (
        <div class={`fixed ${isDashboard ? 'top-0' : 'top-16'} left-0 right-0 z-50 h-1 bg-[#4a2e85]/10`}>
          <div class="h-full bg-gradient-to-r from-[#f6e527] via-[#ef7c43] to-[#4a2e85] animate-progress relative overflow-hidden">
            <div class="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer" />
          </div>
        </div>
      )}

      {isDashboard ? (
        <Slot />
      ) : (
        <main class={`relative z-10 ${isAuth ? '' : 'overflow-y-auto'}`}>
          {!isAuth && !isHome && (
            <div class="fixed inset-0 -z-10 pointer-events-none">
              <div class="absolute top-[-120px] right-[-120px] w-[420px] h-[420px] bg-gradient-to-br from-[#f6e527]/10 to-transparent rounded-full blur-3xl" />
              <div class="absolute bottom-[-120px] left-[-120px] w-[420px] h-[420px] bg-gradient-to-br from-[#ef7c43]/10 to-transparent rounded-full blur-3xl" />
            </div>
          )}

          {isAuth ? (
            <Slot />
          ) : (
            <div
              class={`${isHome
                ? 'w-full'
                : 'max-w-7xl mx-auto min-h-[calc(100vh-8rem)] px-2 sm:px-4 md:px-8 py-4 sm:py-8'
                }`}
            >
              <div class={`${isHome ? 'w-full' : 'w-full min-w-0'}`}>
                <Slot />
              </div>
            </div>
          )}
        </main>
      )}

      {!isDashboard && <Footer />}
      <PushManager />
      <AgentChat />
    </div>
  );
});

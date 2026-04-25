import { component$ } from '@builder.io/qwik';
import { Link } from '@builder.io/qwik-city';
import LogoImage from '~/media/logo.png?jsx';

export const Footer = component$(() => {
    return (
        <footer id="contacto" class="relative  border-t border-[#4a2e85]/10 py-12 bg-white">
            <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div class="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
                    <div class="space-y-4">
                        <div class="flex items-center gap-2">
                            <div class="h-10 w-10 rounded-full overflow-hidden bg-white border border-[#4a2e85]/20 flex items-center justify-center">
                                <LogoImage alt="ACUPATAS" class="h-9 w-9 object-contain" />
                            </div>
                            <div class="text-lg font-bold text-[#4a2e85]">ACUPATAS</div>
                        </div>
                        <p class="text-sm text-[#4a2e85]/60">
                            Conectando familias con cuidadores confiables para sus mascotas queridas.
                        </p>
                    </div>

                    <div>
                        <h4 class="font-semibold text-[#4a2e85] mb-4">Servicios</h4>
                        <ul class="space-y-2 text-sm text-[#4a2e85]/60">
                            <li><Link href="/dashboard/caregiver-search" class="hover:text-[#4a2e85] transition-colors">Buscar Cuidador</Link></li>
                            <li><Link href="/dashboard/owner" class="hover:text-[#4a2e85] transition-colors">Panel de Dueno</Link></li>
                            <li><Link href="/dashboard/caregiver" class="hover:text-[#4a2e85] transition-colors">Panel de Cuidador</Link></li>
                        </ul>
                    </div>

                    <div>
                        <h4 class="font-semibold text-[#4a2e85] mb-4">Soporte</h4>
                        <ul class="space-y-2 text-sm text-[#4a2e85]/60">
                            <li><a href="/#como-funciona" class="hover:text-[#4a2e85] transition-colors">Como funciona</a></li>
                            <li><a href="/#seguridad" class="hover:text-[#4a2e85] transition-colors">Seguridad</a></li>
                            <li><a href="mailto:soporte@acupatas.com" class="hover:text-[#4a2e85] transition-colors">Contacto</a></li>
                            <li><a href="/terminos" class="hover:text-[#4a2e85] transition-colors">Terminos</a></li>
                        </ul>
                    </div>

                    <div>
                        <h4 class="font-semibold text-[#4a2e85] mb-4">Contacto</h4>
                        <ul class="space-y-2 text-sm text-[#4a2e85]/60">
                            <li>soporte@acupatas.com</li>
                            <li>+58 424 123 4567</li>
                            <li>Caracas, Venezuela</li>
                        </ul>
                    </div>
                </div>

                <div class="pt-8 border-t border-[#4a2e85]/10">
                    <div class="text-center text-[#4a2e85]/60 text-sm">
                        (c) {new Date().getFullYear()} ACUPATAS. Todos los derechos reservados.
                    </div>
                </div>
            </div>
        </footer>
    );
});

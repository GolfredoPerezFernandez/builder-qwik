import { component$ } from '@builder.io/qwik';
import { Link, routeLoader$ } from '@builder.io/qwik-city';
import { ImageWithRetry } from '../../../../components/ui/image-with-retry';
import { getOwnerProfileByUserId, listOwnerPets, listOwnerReviews } from '../../../../lib/owner';
import { normalizeImageUrl } from '../../../../lib/upload-utils';

const formatReviewDate = (value: string) => {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat('es-VE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(parsed);
};

export const useOwnerProfile = routeLoader$(async (event) => {
  const ownerId = event.params.id;
  const [profile, pets, reviews] = await Promise.all([
    getOwnerProfileByUserId(ownerId),
    listOwnerPets(ownerId),
    listOwnerReviews(ownerId),
  ]);
  const normalizedProfile = profile
    ? {
        ...profile,
        profilePhoto: normalizeImageUrl(profile.profilePhoto),
        photoWithPet: normalizeImageUrl(profile.photoWithPet),
      }
    : profile;

  const normalizedPets = (pets || []).map((pet: any) => ({
    ...pet,
    photo: normalizeImageUrl(pet.photo),
  }));

  return { profile: normalizedProfile, pets: normalizedPets, reviews };
});

export default component$(() => {
  const data = useOwnerProfile();
  const profile = data.value.profile;

  if (!profile) {
    return (
      <div class="min-h-screen bg-[#f6f6f6] flex items-center justify-center">
        <div class="text-center">
          <h1 class="text-2xl font-bold text-[#4a2e85]">Usuario no encontrado</h1>
          <Link href="/dashboard/owner" class="mt-4 inline-block text-[#4a2e85] hover:underline">
            Volver al dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div class="min-h-screen bg-[#f6f6f6]">
      <div class="max-w-4xl mx-auto px-4 py-10 space-y-6">
        <header class="bg-white rounded-2xl border border-[#4a2e85]/10 p-6 flex flex-col sm:flex-row gap-4">
          <ImageWithRetry
            src={profile.profilePhoto || '/images/default-avatar.jpg'}
            alt={profile.fullName || 'Dueno'}
            class="w-24 h-24 rounded-full object-cover border"
            width={96}
            height={96}
            layout="constrained"
          />
          <div>
            <h1 class="text-2xl font-bold text-[#4a2e85]">{profile.displayName || profile.fullName || 'Dueno'}</h1>
            <p class="text-sm text-gray-600">{profile.zone || 'Zona no especificada'}</p>
            <div class="mt-2 text-sm text-gray-600">
              <span class="font-semibold text-[#4a2e85]">★ {profile.rating.toFixed(1)}</span>
              <span class="ml-3">{profile.totalReviews} reseñas</span>
            </div>
          </div>
        </header>

        <section class="bg-white rounded-2xl border border-[#4a2e85]/10 p-6 space-y-3">
          <h2 class="text-lg font-semibold text-[#4a2e85]">Sobre el dueno</h2>
          <p class="text-sm text-gray-700">{profile.bio || 'Sin biografia disponible.'}</p>
          <div class="text-xs text-gray-500">Contacto: {profile.email}</div>
        </section>

        <section class="bg-white rounded-2xl border border-[#4a2e85]/10 p-6 space-y-4">
          <h2 class="text-lg font-semibold text-[#4a2e85]">Mascotas</h2>
          {data.value.pets.length === 0 ? (
            <p class="text-sm text-gray-600">No hay mascotas registradas.</p>
          ) : (
            <div class="grid gap-3 sm:grid-cols-3">
              {data.value.pets.map((pet: any) => (
                <div key={pet.id} class="border border-[#4a2e85]/10 rounded-xl p-3 text-center">
                  <ImageWithRetry src={pet.photo || '/images/default-pet.jpg'} class="w-20 h-20 rounded-full object-cover mx-auto" alt={pet.name} width={80} height={80} layout="constrained" />
                  <div class="mt-2 text-sm font-semibold text-[#4a2e85]">{pet.name}</div>
                  <div class="text-xs text-gray-500 capitalize">{pet.species} · {pet.sex}</div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section class="bg-white rounded-2xl border border-[#4a2e85]/10 p-6 space-y-3">
          <h2 class="text-lg font-semibold text-[#4a2e85]">Reseñas</h2>
          {data.value.reviews.length === 0 ? (
            <p class="text-sm text-gray-600">Todavía no hay reseñas.</p>
          ) : (
            <div class="space-y-3">
              {data.value.reviews.map((review: any, index: number) => (
                <div key={review.id} class="border border-[#4a2e85]/10 rounded-xl p-3">
                  <div class="flex items-center justify-between gap-2">
                    <div class="text-sm font-semibold text-[#4a2e85]">{review.reviewerName || review.reviewerId || `Cuidador ${index + 1}`}</div>
                    <div class="text-xs text-gray-500">{formatReviewDate(review.date)}</div>
                  </div>
                  <div class="mt-1 flex items-center gap-1 text-[#ef7c43]">
                    {Array.from({ length: 5 }).map((_, starIndex) => (
                      <svg
                        key={starIndex}
                        class={`h-3.5 w-3.5 ${starIndex < Math.round(Number(review.rating || 0)) ? 'text-[#ef7c43]' : 'text-[#e2d9f2]'}`}
                        viewBox="0 0 20 20"
                        fill="currentColor"
                      >
                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                      </svg>
                    ))}
                    <span class="ml-1 text-xs font-semibold text-[#4a2e85]/70">{Number(review.rating || 0).toFixed(1)}</span>
                  </div>
                  {review.petName && <div class="mt-1 text-xs text-[#4a2e85]/70">Mascota: {review.petName}</div>}
                  <p class="text-sm text-gray-700 mt-1">{review.comment}</p>
                </div>
              ))}
            </div>
          )}
        </section>

        <div>
          <Link class="text-sm text-[#4a2e85]" href="/dashboard/owner">Volver al dashboard</Link>
        </div>
      </div>
    </div>
  );
});


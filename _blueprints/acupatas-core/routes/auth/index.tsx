import {
  $,
  Slot,
  component$,
  useSignal,
  useStore,
  useStyles$,
  useTask$,
  useVisibleTask$,
  type QRL,
} from "@builder.io/qwik";
import { Image } from "@unpic/qwik";
import { ImageWithRetry } from "~/components/ui/image-with-retry";
import leafletStyles from "leaflet/dist/leaflet.css?inline";
import { server$, useLocation, useNavigate, Link } from "@builder.io/qwik-city";
import { createSession, clearSession, ensureAuthSchema, hashPassword, verifyPassword } from "../../lib/auth";
import { ensureOwnerSchema } from "../../lib/owner";
import { ensureCaregiverSchema } from "../../lib/caregiver";
import { getTursoClient } from "../../lib/turso";
import { resolveUploadUrl } from "../../lib/upload-utils";

interface RefItem {
  nombre: string;
  telefono: string;
  relacion: string;
}

interface UbicacionState {
  lat: string;
  lng: string;
}

interface OwnerRegistrationPayload {
  correo: string;
  nombres: string;
  apellidos: string;
  bio: string;
  tel1: string;
  tel2: string;
  cedulaNum: string;
  cedulaAnversoName: string;
  cedulaReversoName: string;
  rifNum: string;
  rifArchivoName: string;
  bancoNombre: string;
  bancoTitular: string;
  bancoCedula: string;
  bancoCuenta: string;
  bancoSoporteName: string;
  refPersonales: RefItem[];
  refFamiliares: RefItem[];
  emergencia: RefItem & { direccion: string };
  ubicacion: UbicacionState;
  direccionDetallada: string;
  tengoMascota: boolean;
  mascotas: {
    name: string;
    species: string;
    breed: string;
    age: string;
    sex: string;
    weight: string;
    size: string;
    behavior: string;
    medicalConditions: string;
    allergies: string;
    hasIdTag: boolean;
    vaccinated: boolean;
    vaccinationCardName?: string;
    photoName?: string;
  }[];
  password: string;
  role: "owner" | "caregiver";
  profilePhotoName: string;
}

const brand = {
  primary: "#4a2e85",
  yellow: "#f6e527",
  orange: "#ef7c43",
};

const steps = [
  "Rol",
  "Correo",
  "Nombre",
  "Telefonos",
  "Cedula",
  "RIF",
  "Banco",
  "Refs personales",
  "Refs familiares",
  "Emergencia",
  "Ubicacion",
  "Mascota",
];

const uploadDocument = server$(async function (
  _originalName: string,
  dataUrl: string,
) {
  const { mkdirSync, writeFileSync } = await import("node:fs");
  const { join } = await import("node:path");

  const match = dataUrl.match(/^data:(.+);base64,(.*)$/);
  if (!match) return { ok: false, reason: "invalid" } as const;
  const mime = match[1];
  const base64 = match[2];
  const extMap: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "application/pdf": "pdf",
  };
  const ext = extMap[mime] ?? "bin";
  const uploadDir =
    process.env.UPLOAD_DIR || join(process.cwd(), "public", "uploads");
  mkdirSync(uploadDir, { recursive: true });
  const filename = Date.now() + "_" + crypto.randomUUID() + "." + ext;
  const filePath = join(uploadDir, filename);
  writeFileSync(filePath, Buffer.from(base64, "base64"));
  const path = "/uploads/" + filename;
  const url = resolveUploadUrl(this, path);
  return { ok: true, filename, path, url } as const;
});

const checkEmailExists = server$(async function (email: string) {
  await ensureAuthSchema();
  const client = getTursoClient();
  const result = await client.execute({
    sql: "select id from users where email = ? limit 1",
    args: [email],
  });
  return { exists: result.rows.length > 0 };
});

const checkIdentityExists = server$(async function (
  cedula?: string,
  rif?: string,
) {
  await ensureOwnerSchema();
  const client = getTursoClient();

  // 1. Check blacklist first
  if (cedula) {
    const blackRes = await client.execute({
      sql: "select reason from blacklisted_identities where type = 'cedula' and value = ? limit 1",
      args: [cedula],
    });
    if (blackRes.rows.length > 0)
      return { exists: true, type: "cedula", blacklisted: true };
  }
  if (rif) {
    const blackRes = await client.execute({
      sql: "select reason from blacklisted_identities where type = 'rif' and value = ? limit 1",
      args: [rif],
    });
    if (blackRes.rows.length > 0)
      return { exists: true, type: "rif", blacklisted: true };
  }

  // 2. Check existing usage
  if (cedula) {
    const res = await client.execute({
      sql: "select user_id from owner_profile_extra where cedula = ? limit 1",
      args: [cedula],
    });
    if (res.rows.length > 0) return { exists: true, type: "cedula" };
  }
  if (rif) {
    const res = await client.execute({
      sql: "select user_id from owner_profile_extra where rif = ? limit 1",
      args: [rif],
    });
    if (res.rows.length > 0) return { exists: true, type: "rif" };
  }
  return { exists: false };
});

const loginUser = server$(async function (email: string, password: string) {
  await ensureAuthSchema();
  const client = getTursoClient();
  const user = await client.execute({
    sql: "select id, role, email from users where email = ? limit 1",
    args: [email],
  });
  const row = user.rows[0] as any;
  if (!row) return { ok: false, reason: "invalid" };

  if (Boolean(row.is_banned ?? 0)) {
    return { ok: false, reason: "user_banned" };
  }

  const userId = row.id as string;
  const role = row.role as "owner" | "caregiver" | undefined;
  const userEmail = String((user.rows[0] as any)?.email ?? "")
    .trim()
    .toLowerCase();
  const isAdmin = userEmail === "admin@gmail.com";

  const auth = await client.execute({
    sql: "select password_hash, password_salt from user_auth where user_id = ? limit 1",
    args: [userId],
  });
  if (auth.rows.length === 0) return { ok: false, reason: "invalid" };

  const authData = auth.rows[0] as any;
  if (
    !verifyPassword(password, authData.password_salt, authData.password_hash)
  ) {
    return { ok: false, reason: "invalid" };
  }

  await clearSession(this);
  await createSession(userId, this);
  return { ok: true, role: role || "owner", isAdmin };
});

const submitOwnerRegistration = server$(async function (
  payload: OwnerRegistrationPayload,
) {
  await ensureOwnerSchema();
  await clearSession(this);
  const client = getTursoClient();
  const now = new Date().toISOString();

  if (!payload.password) return { ok: false, reason: "missing_password" };

  const cedulaFront = payload.cedulaAnversoName
    ? resolveUploadUrl(this, payload.cedulaAnversoName)
    : "";
  const cedulaBack = payload.cedulaReversoName
    ? resolveUploadUrl(this, payload.cedulaReversoName)
    : "";
  const rifDoc = payload.rifArchivoName
    ? resolveUploadUrl(this, payload.rifArchivoName)
    : "";
  const bankSupport = payload.bancoSoporteName
    ? resolveUploadUrl(this, payload.bancoSoporteName)
    : "";
  // bankSupport already declared above
  // petVaccine is now handled per pet in the loop

  const existingUser = await client.execute({
    sql: "select id from users where email = ? limit 1",
    args: [payload.correo],
  });

  // If email already exists, reject registration
  if (existingUser.rows.length > 0) {
    return { ok: false, reason: "email_taken" };
  }

  // Check for duplicate Cedula/RIF or blacklisted
  if (payload.cedulaNum) {
    const check = await checkIdentityExists(payload.cedulaNum, undefined);
    if (check.exists) {
      if (check.blacklisted) return { ok: false, reason: "cedula_blacklisted" };
      return { ok: false, reason: "cedula_taken" };
    }
  }
  if (payload.rifNum) {
    const check = await checkIdentityExists(undefined, payload.rifNum);
    if (check.exists) {
      if (check.blacklisted) return { ok: false, reason: "rif_blacklisted" };
      return { ok: false, reason: "rif_taken" };
    }
  }

  const userId = "usr_" + crypto.randomUUID();
  await client.execute({
    sql: "insert into users(id, email, role, email_verified, created_at) values (?, ?, ?, 1, ?)",
    args: [userId, payload.correo, payload.role, now],
  });

  const auth = await client.execute({
    sql: "select user_id from user_auth where user_id = ? limit 1",
    args: [userId],
  });
  if (auth.rows.length === 0) {
    const hashed = hashPassword(payload.password);
    await client.execute({
      sql: "insert into user_auth(user_id, password_hash, password_salt, created_at, updated_at) values (?, ?, ?, ?, ?)",
      args: [userId, hashed.hash, hashed.salt, now, now],
    });
  }

  const fullName = (
    (payload.nombres || "") +
    " " +
    (payload.apellidos || "")
  ).trim();
  const ownerAddress = payload.direccionDetallada || "";

  if (payload.role === "caregiver") {
    await ensureCaregiverSchema();
    await client.execute({
      sql: `insert into caregiver_profiles(
        user_id, verified, verified_label, completeness, avatar, name, bio, zone, price_per_day,
        multi_pet, has_own_pet, own_pet_photo, own_pet_name, rating_avg, jobs_done, revenue_30d, created_at, updated_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      on conflict(user_id) do update set
        avatar=excluded.avatar,
        name=excluded.name,
        zone=excluded.zone,
        own_pet_name=excluded.own_pet_name,
        updated_at=excluded.updated_at`,
      args: [
        userId,
        0,
        "No verificado",
        0,
        payload.profilePhotoName
          ? resolveUploadUrl(this, payload.profilePhotoName)
          : "",
        fullName,
        payload.bio || "",
        ownerAddress,
        10,
        payload.tengoMascota ? 1 : 0,
        payload.tengoMascota ? 1 : 0,
        payload.tengoMascota && payload.mascotas[0]
          ? payload.mascotas[0].photoName
            ? resolveUploadUrl(this, payload.mascotas[0].photoName)
            : ""
          : "",
        payload.tengoMascota && payload.mascotas[0]
          ? payload.mascotas[0].name
          : "",
        0,
        0,
        0,
        now,
        now,
      ],
    });
    await client.execute({
      sql: `insert into caregiver_bank(user_id, bank_name, titular, rif, paymobile, verified, updated_at)
        values (?, ?, ?, ?, ?, 0, ?)
        on conflict(user_id) do update set
          bank_name=excluded.bank_name,
          titular=excluded.titular,
          rif=excluded.rif,
          paymobile=excluded.paymobile,
          updated_at=excluded.updated_at`,
      args: [
        userId,
        payload.bancoNombre,
        payload.bancoTitular,
        payload.bancoCedula,
        payload.bancoCuenta,
        now,
      ],
    });
  }

  await client.execute({
    sql: `insert into owner_profile_extra(
      user_id, full_name, email, primary_phone, alternative_phone, cedula, address, zone, biometric_selfie, display_name, bio, profile_photo, is_verified, rif, updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    on conflict(user_id) do update set
      full_name=excluded.full_name,
      email=excluded.email,
      primary_phone=excluded.primary_phone,
      alternative_phone=excluded.alternative_phone,
      cedula=excluded.cedula,
      address=excluded.address,
      zone=excluded.zone,
      biometric_selfie=excluded.biometric_selfie,
      display_name=excluded.display_name,
      bio=excluded.bio,
      profile_photo=excluded.profile_photo,
      is_verified=excluded.is_verified,
      rif=excluded.rif,
      updated_at=excluded.updated_at`,
    args: [
      userId,
      fullName,
      payload.correo,
      payload.tel1,
      payload.tel2,
      payload.cedulaNum,
      ownerAddress,
      ownerAddress, // Auto-populate zone with address
      "",
      fullName, // Auto-populate display_name with fullName
      payload.bio || "",
      payload.profilePhotoName
        ? resolveUploadUrl(this, payload.profilePhotoName)
        : "",
      0,
      payload.rifNum || "",
      now,
    ],
  });

  await client.execute({
    sql: `insert into owner_documents(
      user_id, cedula_front, cedula_back, rif_doc, bank_support, pet_vaccine, updated_at
    ) values (?, ?, ?, ?, ?, ?, ?)
    on conflict(user_id) do update set
      cedula_front=excluded.cedula_front,
      cedula_back=excluded.cedula_back,
      rif_doc=excluded.rif_doc,
      bank_support=excluded.bank_support,
      pet_vaccine=excluded.pet_vaccine,
      updated_at=excluded.updated_at`,
    args: [
      userId,
      cedulaFront,
      cedulaBack,
      rifDoc,
      bankSupport,
      "", // pet_vaccine column in owner_documents is legacy/single, ignoring for new multi-pet flow
      now,
    ],
  });

  await client.execute({
    sql: `insert into owner_emergency(user_id, nombre, relacion, direccion, telefono, updated_at)
      values (?, ?, ?, ?, ?, ?)
      on conflict(user_id) do update set
        nombre=excluded.nombre,
        relacion=excluded.relacion,
        direccion=excluded.direccion,
        telefono=excluded.telefono,
        updated_at=excluded.updated_at`,
    args: [
      userId,
      payload.emergencia.nombre,
      payload.emergencia.relacion,
      payload.emergencia.direccion,
      payload.emergencia.telefono,
      now,
    ],
  });

  await client.execute({
    sql: `insert into owner_location(user_id, lat, lng, direccion_detallada, updated_at)
      values (?, ?, ?, ?, ?)
      on conflict(user_id) do update set
        lat=excluded.lat,
        lng=excluded.lng,
        direccion_detallada=excluded.direccion_detallada,
        updated_at=excluded.updated_at`,
    args: [
      userId,
      payload.ubicacion.lat,
      payload.ubicacion.lng,
      payload.direccionDetallada,
      now,
    ],
  });

  await client.execute({
    sql: "delete from owner_refs where user_id = ?",
    args: [userId],
  });

  for (const ref of payload.refPersonales) {
    await client.execute({
      sql: "insert into owner_refs(user_id, kind, nombre, telefono, relacion) values (?, ?, ?, ?, ?)",
      args: [userId, "personal", ref.nombre, ref.telefono, ref.relacion],
    });
  }

  for (const ref of payload.refFamiliares) {
    await client.execute({
      sql: "insert into owner_refs(user_id, kind, nombre, telefono, relacion) values (?, ?, ?, ?, ?)",
      args: [userId, "familiar", ref.nombre, ref.telefono, ref.relacion],
    });
  }

  await client.execute({
    sql: "delete from owner_pet_profiles where owner_id = ?",
    args: [userId],
  });

  if (payload.tengoMascota && payload.mascotas && payload.mascotas.length > 0) {
    for (const pet of payload.mascotas) {
      await client.execute({
        sql: `insert into owner_pet_profiles(id, owner_id, name, species, breed, photo, age, sex, weight, size, behavior, medical_conditions, allergies, vaccination_card, has_id_tag, active, updated_at)
            values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          "pet_" + crypto.randomUUID(),
          userId,
          pet.name,
          pet.species,
          pet.breed,
          pet.photoName ? resolveUploadUrl(this, pet.photoName) : "",
          pet.age ? Number(pet.age) || 0 : 0,
          pet.sex,
          pet.weight ? Number(pet.weight) || 0 : 0,
          pet.size,
          pet.behavior,
          pet.medicalConditions,
          pet.allergies,
          pet.vaccinationCardName
            ? resolveUploadUrl(this, pet.vaccinationCardName)
            : "",
          pet.hasIdTag ? 1 : 0,
          1,
          now,
        ],
      });
    }
  }

  await createSession(userId, this);
  return { ok: true, userId, role: payload.role };
});

export default component$(() => {
  useStyles$(leafletStyles);
  useStyles$(`
    .auth-wrapper {
      position: relative;
      width: 100%;
      min-height: 100%;
      background: radial-gradient(circle at top left, #fff6da 0%, #f7f1ff 35%, #ffffff 70%);
    }
    .auth-wrapper::before {
      content: '';
      position: absolute;
      inset: 0;
      background: linear-gradient(120deg, rgba(246,229,39,0.18), rgba(74,46,133,0.08), rgba(239,124,67,0.12));
      opacity: 0.9;
      z-index: 0;
    }
    .auth-content {
      position: relative;
      z-index: 1;
      max-width: 100%;
      min-width: 0;
    }
    .auth-orb {
      position: absolute;
      border-radius: 999px;
      filter: blur(0px);
      opacity: 0.5;
      animation: orb-float 14s ease-in-out infinite;
      z-index: 0;
    }
    .auth-orb--one {
      width: 280px;
      height: 280px;
      background: radial-gradient(circle, rgba(246,229,39,0.55), rgba(246,229,39,0.05));
      top: -120px;
      left: -120px;
    }
    .auth-orb--two {
      width: 220px;
      height: 220px;
      background: radial-gradient(circle, rgba(239,124,67,0.5), rgba(239,124,67,0.06));
      bottom: -80px;
      right: -80px;
      animation-delay: -4s;
    }
    .auth-orb--three {
      width: 160px;
      height: 160px;
      background: radial-gradient(circle, rgba(74,46,133,0.45), rgba(74,46,133,0.06));
      top: 20%;
      right: 8%;
      animation-delay: -7s;
    }
    .auth-paw {
      position: absolute;
      width: 140px;
      height: 140px;
      opacity: 0.12;
      animation: paw-drift 18s ease-in-out infinite;
      z-index: 0;
    }
    .auth-paw--one {
      bottom: 12%;
      left: 10%;
      animation-delay: -3s;
    }
    .auth-paw--two {
      top: 18%;
      left: 70%;
      animation-delay: -9s;
      transform: rotate(-12deg);
    }
    @keyframes orb-float {
      0%, 100% { transform: translateY(0) translateX(0); }
      50% { transform: translateY(-18px) translateX(10px); }
    }
    @keyframes paw-drift {
      0%, 100% { transform: translateY(0) rotate(0deg); }
      50% { transform: translateY(-12px) rotate(6deg); }
    }
    @media (max-width: 640px) {
      .auth-paw { display: none; }
      .auth-orb--one { width: 200px; height: 200px; }
      .auth-orb--two { width: 160px; height: 160px; }
    }
  `);
  const mapRef = useSignal<HTMLElement>();
  const mapInstance = useSignal<any>();
  const markerInstance = useSignal<any>();
  const searchDebounce = useSignal<any>(null);
  const nav = useNavigate();
  const loc = useLocation();
  const isLogin = loc.url.searchParams.get("mode") === "login";

  const s = useStore({
    currentStep: 0,
    isLoggingIn: false,
    isRegistering: false,
    role: "owner",
    correo: "",
    password: "",
    authErrors: [] as string[],
    fieldErrors: {} as Record<string, string>,
    successMessage: "",
    geoStatus: "",
    citySearch: "",
    citySearchResults: [] as any[],
    isSearchingCity: false,
    nombres: "",
    apellidos: "",
    bio: "",
    tel1: "",
    tel2: "",
    cedulaNum: "",
    cedulaAnversoName: "",
    cedulaReversoName: "",
    rifNum: "",
    rifArchivoName: "",
    bancoNombre: "",
    bancoTitular: "",
    bancoCedula: "",
    bancoCuenta: "",
    bancoSoporteName: "",
    refPersonales: [
      { nombre: "", telefono: "", relacion: "" },
      { nombre: "", telefono: "", relacion: "" },
    ] as RefItem[],
    refFamiliares: [
      { nombre: "", telefono: "", relacion: "" },
      { nombre: "", telefono: "", relacion: "" },
    ] as RefItem[],
    emergencia: {
      nombre: "",
      relacion: "",
      direccion: "",
      telefono: "",
    },
    ubicacion: {
      lat: "",
      lng: "",
    } as UbicacionState,
    direccionDetallada: "",
    tengoMascota: false,
    mascotaNombre: "", // Deprecated, kept for compatibility if needed or ease of refactor
    mascotaEspecie: "",
    mascotaRaza: "",
    mascotaEdad: "",
    mascotaVacunasAlDia: false,
    mascotas: [] as {
      name: string;
      species: string;
      breed: string;
      age: string;
      sex: string;
      weight: string;
      size: string;
      behavior: string;
      medicalConditions: string;
      allergies: string;
      hasIdTag: boolean;
      vaccinated: boolean;
      vaccinationCardName?: string;
      photoName?: string;
    }[],
    mascotaDraft: {
      name: "",
      species: "perro",
      breed: "",
      age: "",
      sex: "macho",
      weight: "",
      size: "",
      behavior: "",
      medicalConditions: "",
      allergies: "",
      hasIdTag: false,
      vaccinated: false,
      vaccinationCardName: "",
      photoName: "",
    },
    mascotaControlName: "",
    mascotaFotoName: "",
    profilePhotoName: "",
    aceptoTerminos: false,
    isNavigating: false,
  });

  useTask$(({ track }) => {
    track(() => loc.url.searchParams.get("mode"));
    s.authErrors = [];
    s.fieldErrors = {};
    s.successMessage = "";
    s.isLoggingIn = false;
    s.isRegistering = false;
  });

  const ctaPrimary =
    "w-full sm:w-auto px-6 py-3 max-[400px]:px-3 max-[400px]:py-2 rounded-xl text-white font-semibold shadow-md bg-gradient-to-r from-[#4a2e85] via-[#f6e527] to-[#ef7c43] hover:brightness-105 transition-all";
  const ctaGhost =
    "px-4 py-2 rounded-lg border border-[#4a2e85]/20 text-[#4a2e85] hover:bg-[#4a2e85]/5 transition-all";

  const readFileAsDataUrl = $(
    (file: File) =>
      new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      }),
  );

  const handleFile = $(
    async (
      file: File | undefined,
      key:
        | "cedulaAnversoName"
        | "cedulaReversoName"
        | "rifArchivoName"
        | "bancoSoporteName"
        | "mascotaControlName"
        | "mascotaFotoName"
        | "profilePhotoName",
    ) => {
      if (!file) return;
      s.authErrors = [];
      s.successMessage = "";
      const dataUrl = await readFileAsDataUrl(file);
      const result = await uploadDocument(file.name, dataUrl);
      if (!result.ok) {
        s.authErrors = ["No se pudo subir el archivo."];
        return;
      }
      (s as any)[key] = result.path || result.url;
    },
  );

  const renderUploadPreview = (url?: string) => {
    if (!url) return null;
    const lower = url.toLowerCase();
    if (lower.includes(".pdf")) {
      return (
        <a
          class="text-xs text-[#4a2e85] underline"
          href={url}
          target="_blank"
          rel="noreferrer"
        >
          Ver PDF
        </a>
      );
    }
    return (
      <Image
        src={url}
        alt="preview"
        width={160}
        height={80}
        class="mt-2 h-20 w-full max-w-[160px] rounded-lg border border-[#4a2e85]/20 object-cover"
        layout="constrained"
      />
    );
  };

  const updateRef = $(
    (
      list: "refPersonales" | "refFamiliares",
      index: number,
      field: keyof RefItem,
      value: string,
    ) => {
      const refList = s[list];
      if (refList[index]) {
        refList[index][field] = value;
      }
    },
  );

  const validateStep = $(async (step: number) => {
    const errors: string[] = [];
    const fieldErrors: Record<string, string> = {};

    if (step === 0) {
      if (!s.role) {
        errors.push("Selecciona un rol.");
        fieldErrors.role = "Selecciona un rol.";
      }
    }

    if (step === 1) {
      if (!s.correo.trim()) {
        errors.push("Correo es obligatorio.");
        fieldErrors.correo = "Correo es obligatorio.";
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.correo)) {
        errors.push("Correo invalido.");
        fieldErrors.correo = "Formato invalido (ej: usuario@mail.com).";
      } else {
        // Check if email already exists
        const emailCheck = await checkEmailExists(s.correo);
        if (emailCheck.exists) {
          errors.push("Este correo ya está registrado.");
          fieldErrors.correo =
            "Este correo ya está registrado. Intenta iniciar sesión.";
        }
      }
      if (!s.password.trim()) {
        errors.push("Contrasena es obligatoria.");
        fieldErrors.password = "Contrasena es obligatoria.";
      } else if (s.password.length < 6) {
        errors.push("La contrasena es muy corta.");
        fieldErrors.password = "Minimo 6 caracteres.";
      }
    }

    if (step === 2) {
      if (!s.nombres.trim()) {
        errors.push("Nombres es obligatorio.");
        fieldErrors.nombres = "Nombres es obligatorio.";
      }
      if (!s.apellidos.trim()) {
        errors.push("Apellidos es obligatorio.");
        fieldErrors.apellidos = "Apellidos es obligatorio.";
      }
    }

    if (step === 3) {
      if (!s.tel1.trim()) {
        errors.push("Telefono principal es obligatorio.");
        fieldErrors.tel1 = "Telefono principal es obligatorio.";
      } else if (!/^0\d{10}$/.test(s.tel1.replace(/\D/g, ""))) {
        errors.push("Formato de telefono invalido (Ej: 04121234567).");
        fieldErrors.tel1 = "Debe tener 11 digitos y empezar por 0.";
      }
    }

    if (step === 4) {
      if (!s.cedulaNum.trim()) {
        errors.push("Numero de cedula es obligatorio.");
        fieldErrors.cedulaNum = "Numero de cedula es obligatorio.";
      } else if (!/^\d{6,9}$/.test(s.cedulaNum.replace(/\D/g, ""))) {
        errors.push("Cedula invalida.");
        fieldErrors.cedulaNum = "Solo numeros (6-9 digitos).";
      } else {
        const check = await checkIdentityExists(s.cedulaNum, undefined);
        if (check.exists) {
          if (check.blacklisted) {
            errors.push("Esta cédula está bloqueada.");
            fieldErrors.cedulaNum =
              "Identidad bloqueada por la administración.";
          } else {
            errors.push("Esta cédula ya está registrada.");
            fieldErrors.cedulaNum = "Esta cédula ya está registrada.";
          }
        }
      }
      if (!s.cedulaAnversoName) {
        errors.push("Foto anverso de cedula obligatoria.");
        fieldErrors.cedulaAnversoName = "Foto anverso obligatoria.";
      }
      if (!s.cedulaReversoName) {
        errors.push("Foto reverso de cedula obligatoria.");
        fieldErrors.cedulaReversoName = "Foto reverso obligatoria.";
      }
    }

    if (step === 5) {
      if (!s.rifNum.trim()) {
        errors.push("Numero de RIF es obligatorio.");
        fieldErrors.rifNum = "Numero de RIF es obligatorio.";
      } else {
        const check = await checkIdentityExists(undefined, s.rifNum);
        if (check.exists) {
          if (check.blacklisted) {
            errors.push("Este RIF está bloqueado.");
            fieldErrors.rifNum =
              "Este RIF está bloqueado por la administración.";
          } else {
            errors.push("Este RIF ya está registrado.");
            fieldErrors.rifNum = "Este RIF ya está registrado.";
          }
        }
      }
      if (!s.rifArchivoName) {
        errors.push("Documento RIF obligatorio.");
        fieldErrors.rifArchivoName = "Documento RIF obligatorio.";
      }
    }

    if (step === 6) {
      if (!s.bancoNombre.trim()) {
        errors.push("Banco es obligatorio.");
        fieldErrors.bancoNombre = "Banco es obligatorio.";
      }
      if (!s.bancoTitular.trim()) {
        errors.push("Titular de la cuenta es obligatorio.");
        fieldErrors.bancoTitular = "Titular de la cuenta es obligatorio.";
      }
      if (!s.bancoCedula.trim()) {
        errors.push("Cedula del titular es obligatoria.");
        fieldErrors.bancoCedula = "Cedula del titular es obligatoria.";
      }
      if (!s.bancoCuenta.trim()) {
        errors.push("Cuenta Pago Movil es obligatoria.");
        fieldErrors.bancoCuenta = "Cuenta Pago Movil es obligatoria.";
      }
      if (!s.bancoSoporteName) {
        errors.push("Soporte bancario obligatorio.");
        fieldErrors.bancoSoporteName = "Soporte bancario obligatorio.";
      }
    }

    if (step === 7) {
      const ref = s.refPersonales[0];
      if (!ref?.nombre.trim()) {
        errors.push("Referencia personal: nombre requerido.");
        fieldErrors.refPersonales_0_nombre = "Nombre requerido.";
      }
      if (!ref?.telefono.trim()) {
        errors.push("Referencia personal: telefono requerido.");
        fieldErrors.refPersonales_0_telefono = "Telefono requerido.";
      }
    }

    if (step === 8) {
      const ref = s.refFamiliares[0];
      if (!ref?.nombre.trim()) {
        errors.push("Referencia familiar: nombre requerido.");
        fieldErrors.refFamiliares_0_nombre = "Nombre requerido.";
      }
      if (!ref?.telefono.trim()) {
        errors.push("Referencia familiar: telefono requerido.");
        fieldErrors.refFamiliares_0_telefono = "Telefono requerido.";
      }
    }

    if (step === 9) {
      if (!s.emergencia.nombre.trim()) {
        errors.push("Contacto emergencia: nombre requerido.");
        fieldErrors.emergencia_nombre = "Nombre requerido.";
      }
      if (!s.emergencia.telefono.trim()) {
        errors.push("Contacto emergencia: telefono requerido.");
        fieldErrors.emergencia_telefono = "Telefono requerido.";
      }
      if (!s.emergencia.direccion.trim()) {
        errors.push("Contacto emergencia: direccion requerida.");
        fieldErrors.emergencia_direccion = "Direccion requerida.";
      }
    }

    if (step === 10) {
      if (!s.ubicacion.lat.trim()) {
        errors.push("Latitud es obligatoria.");
        fieldErrors.ubicacion_lat = "Latitud requerida.";
      }
      if (!s.ubicacion.lng.trim()) {
        errors.push("Longitud es obligatoria.");
        fieldErrors.ubicacion_lng = "Longitud requerida.";
      }
      if (!s.direccionDetallada.trim()) {
        errors.push("Referencia de direccion es obligatoria.");
        fieldErrors.direccionDetallada = "Direccion requerida.";
      }
    }

    // For owners, pet is mandatory; for caregivers, it depends on tengoMascota toggle
    const petRequired = s.role === "owner" || s.tengoMascota;
    if (step === 11 && petRequired) {
      if (s.mascotas.length === 0) {
        errors.push("Debes agregar al menos una mascota para registrarte.");
        fieldErrors.mascotaNombre = "Debes agregar al menos una mascota.";
      }
    }

    if (step === 11) {
      if (!s.aceptoTerminos) {
        errors.push("Debes aceptar los términos y condiciones para continuar.");
        fieldErrors.aceptoTerminos =
          "Debes aceptar los términos y condiciones.";
      }
    }

    s.fieldErrors = { ...s.fieldErrors, ...fieldErrors };
    return errors;
  });

  const nextStep = $(async () => {
    if (s.isNavigating) return;
    s.isNavigating = true;
    try {
      const errors = await validateStep(s.currentStep);
      if (errors.length) {
        // We don't populate s.authErrors here anymore because they are shown per-field.
        // This prevents the duplication reported by the user.
        return;
      }
      s.authErrors = [];
      s.fieldErrors = {};
      s.successMessage = "";
      if (s.currentStep < steps.length - 1) s.currentStep += 1;
    } finally {
      s.isNavigating = false;
    }
  });

  const prevStep = $(() => {
    if (s.isNavigating) return;
    s.authErrors = [];
    s.fieldErrors = {};
    s.successMessage = "";
    if (s.currentStep > 0) s.currentStep -= 1;
  });

  const goToStep = $((idx: number) => {
    s.currentStep = idx;
  });

  const doLogin = $(async () => {
    if (s.isLoggingIn) return;
    s.authErrors = [];
    s.fieldErrors = {};
    s.successMessage = "";
    if (!s.correo || !s.password) {
      s.authErrors = ["Completa correo y contrasena."];
      return;
    }
    s.isLoggingIn = true;
    try {
      const result = await loginUser(s.correo, s.password);
      if (!result.ok) {
        s.successMessage = "";
        if (result.reason === "user_banned") {
          s.authErrors = ["Tu cuenta ha sido bloqueada por la administración."];
        } else {
          s.authErrors = ["Credenciales invalidas."];
        }
        s.isLoggingIn = false;
        return;
      }
      s.successMessage = "Inicio de sesion exitoso.";
      const target = result.isAdmin
        ? "/dashboard/admin"
        : result.role === "caregiver"
          ? "/dashboard/caregiver"
          : "/dashboard/owner";
      if (typeof window !== "undefined") {
        window.location.assign(target);
        return;
      }
      await nav(target);
    } catch (e) {
      s.authErrors = ["Error de conexión."];
      s.isLoggingIn = false;
    }
  });

  const selectCity = $((item: any) => {
    const { lat, lon, display_name } = item;
    const nLat = parseFloat(lat).toFixed(6);
    const nLng = parseFloat(lon).toFixed(6);
    s.ubicacion.lat = nLat;
    s.ubicacion.lng = nLng;
    s.geoStatus = `Ubicacion: ${display_name}`;
    s.citySearchResults = [];
    s.citySearch = display_name;

    if (s.fieldErrors.ubicacion_lat) delete s.fieldErrors.ubicacion_lat;
    if (s.fieldErrors.ubicacion_lng) delete s.fieldErrors.ubicacion_lng;
    if (mapInstance.value) {
      mapInstance.value.setView([lat, lon], 12);
      if (markerInstance.value) markerInstance.value.setLatLng([lat, lon]);
    }
  });

  const getLocation = $(() => {
    s.geoStatus = "";
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      s.authErrors = ["No se pudo acceder a la geolocalizacion."];
      s.geoStatus = "Geolocalizacion no disponible en este navegador.";
      return;
    }
    if (typeof window !== "undefined" && !window.isSecureContext) {
      s.authErrors = ["La geolocalizacion requiere HTTPS o localhost."];
      s.geoStatus = "Solo funciona en HTTPS o localhost.";
      return;
    }
    s.authErrors = ["Obteniendo ubicacion..."];
    s.geoStatus = "Solicitando permisos de ubicacion...";
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude.toFixed(6);
        const lng = pos.coords.longitude.toFixed(6);
        s.ubicacion.lat = lat;
        s.ubicacion.lng = lng;
        if (s.fieldErrors.ubicacion_lat) delete s.fieldErrors.ubicacion_lat;
        if (s.fieldErrors.ubicacion_lng) delete s.fieldErrors.ubicacion_lng;
        if (mapInstance.value) {
          mapInstance.value.setView([Number(lat), Number(lng)], 12);
          if (markerInstance.value)
            markerInstance.value.setLatLng([Number(lat), Number(lng)]);
          mapInstance.value.invalidateSize(true);
        }
        s.authErrors = [];
        s.geoStatus = "Ubicacion actualizada.";
      },
      (err) => {
        const message =
          err?.code === 1
            ? "Permiso denegado. Activa la ubicacion en el navegador."
            : err?.code === 2
              ? "Ubicacion no disponible. Revisa GPS o red."
              : err?.code === 3
                ? "Tiempo de espera agotado. Intenta de nuevo."
                : "No se pudo obtener tu ubicacion. Intenta de nuevo.";
        const detail = err?.message ? " (" + err.message + ")" : "";
        s.authErrors = [message + detail];
        s.geoStatus = message + detail;
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
    );
  });

  useVisibleTask$(async ({ track }) => {
    track(() => s.currentStep);
    track(() => s.ubicacion.lat);
    track(() => s.ubicacion.lng);

    // Cleanup si salimos del paso 10
    if (s.currentStep !== 10) {
      if (mapInstance.value) {
        mapInstance.value.remove();
        mapInstance.value = null;
        markerInstance.value = null;
      }
      return;
    }

    if (!mapRef.value) return;

    const leaflet = await import("leaflet");
    const L = leaflet.default || leaflet;
    const lat = Number(s.ubicacion.lat || "8.000");
    const lng = Number(s.ubicacion.lng || "-66.000");
    const zoom = s.ubicacion.lat ? 13 : 6;

    // Detectar si el mapa esta en un contenedor viejo (navegacion ida y vuelta)
    if (mapInstance.value) {
      const container = mapInstance.value.getContainer();
      if (container && container !== mapRef.value) {
        mapInstance.value.remove();
        mapInstance.value = null;
        markerInstance.value = null;
      }
    }
    if (!mapInstance.value) {
      // Fix marker icon
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl:
          "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
        iconUrl:
          "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
        shadowUrl:
          "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
      });

      const map = L.map(mapRef.value).setView([lat, lng], zoom);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "(c) OpenStreetMap",
      }).addTo(map);

      const marker = L.marker([lat, lng], { draggable: true }).addTo(map);

      // Evento: Arrastrar el marcador actualiza coordenadas
      marker.on("dragend", () => {
        const pos = marker.getLatLng();
        // Actualizamos sin disparar track inmediatemente si fuera posible, pero aqui actualizamos el store
        // Para evitar saltos bruscos, el useVisibleTask maneja el recentrado, pero es aceptable.
        s.ubicacion.lat = pos.lat.toFixed(6);
        s.ubicacion.lng = pos.lng.toFixed(6);
        if (s.fieldErrors.ubicacion_lat) delete s.fieldErrors.ubicacion_lat;
        if (s.fieldErrors.ubicacion_lng) delete s.fieldErrors.ubicacion_lng;
      });

      // Evento: Clic en el mapa mueve el marcador
      map.on("click", (e: any) => {
        const { lat, lng } = e.latlng;
        s.ubicacion.lat = lat.toFixed(6);
        s.ubicacion.lng = lng.toFixed(6);
        if (s.fieldErrors.ubicacion_lat) delete s.fieldErrors.ubicacion_lat;
        if (s.fieldErrors.ubicacion_lng) delete s.fieldErrors.ubicacion_lng;
      });

      mapInstance.value = map;
      markerInstance.value = marker;
      map.invalidateSize(true);
    } else {
      // Si ya existe, actualizamos posicion
      const currentZoom = mapInstance.value.getZoom();
      mapInstance.value.setView([lat, lng], currentZoom);
      if (markerInstance.value) {
        markerInstance.value.setLatLng([lat, lng]);
      }
      mapInstance.value.invalidateSize(true);
    }
  });

  const submitForm = $(async () => {
    if (s.isRegistering) return;
    s.isRegistering = true;
    const allErrors: string[] = [];
    let firstErrorStep = -1;
    for (let i = 0; i < steps.length; i++) {
      const stepErrs = await validateStep(i);
      if (stepErrs.length > 0 && firstErrorStep === -1) {
        firstErrorStep = i;
      }
      allErrors.push(...stepErrs);
    }
    if (allErrors.length) {
      s.authErrors = Array.from(new Set(allErrors));
      s.currentStep = firstErrorStep; // Jump to the step with the error
      s.isRegistering = false;
      return;
    }
    s.authErrors = [];
    s.fieldErrors = {};
    s.successMessage = "";
    const payload: OwnerRegistrationPayload = {
      correo: s.correo,
      nombres: s.nombres,
      apellidos: s.apellidos,
      bio: s.bio,
      tel1: s.tel1,
      tel2: s.tel2,
      cedulaNum: s.cedulaNum,
      cedulaAnversoName: s.cedulaAnversoName,
      cedulaReversoName: s.cedulaReversoName,
      rifNum: s.rifNum,
      rifArchivoName: s.rifArchivoName,
      bancoNombre: s.bancoNombre,
      bancoTitular: s.bancoTitular,
      bancoCedula: s.bancoCedula,
      bancoCuenta: s.bancoCuenta,
      bancoSoporteName: s.bancoSoporteName,
      refPersonales: s.refPersonales,
      refFamiliares: s.refFamiliares,
      emergencia: s.emergencia,
      ubicacion: s.ubicacion,
      direccionDetallada: s.direccionDetallada,
      tengoMascota: s.role === "owner" ? true : s.tengoMascota,
      mascotas: s.mascotas,
      password: s.password,
      role: s.role as "owner" | "caregiver",
      profilePhotoName: s.profilePhotoName,
    };
    const result = await submitOwnerRegistration(payload);
    if (!result.ok) {
      s.successMessage = "";
      if (result.reason === "email_taken") {
        s.fieldErrors = {
          ...s.fieldErrors,
          correo: "Este correo ya está registrado. Intenta iniciar sesión.",
        };
        s.currentStep = 1; // Go to correo step
      } else if (
        result.reason === "cedula_taken" ||
        result.reason === "cedula_blacklisted"
      ) {
        s.fieldErrors = {
          ...s.fieldErrors,
          cedulaNum:
            result.reason === "cedula_blacklisted"
              ? "Esta cédula está bloqueada."
              : "Esta cédula ya está registrada.",
        };
        s.currentStep = 4; // Go to cedula step
      } else if (
        result.reason === "rif_taken" ||
        result.reason === "rif_blacklisted"
      ) {
        s.fieldErrors = {
          ...s.fieldErrors,
          rifNum:
            result.reason === "rif_blacklisted"
              ? "Este RIF está bloqueado."
              : "Este RIF ya está registrado.",
        };
        s.currentStep = 5; // Go to rif step
      } else {
        s.authErrors = ["No se pudo completar el registro."];
      }
      s.isRegistering = false;
      return;
    }
    s.successMessage = "Registro completado exitosamente.";
    const target =
      result.role === "caregiver" ? "/dashboard/caregiver" : "/dashboard/owner";
    if (typeof window !== "undefined") {
      window.location.assign(target);
      return;
    }
    await nav(target);
  });

  if (isLogin) {
    return (
      <div class="auth-wrapper flex min-h-[calc(100vh-4rem)] items-center justify-center px-4 py-24">
        <div class="auth-orb auth-orb--one" />
        <div class="auth-orb auth-orb--two" />
        <div class="auth-orb auth-orb--three" />
        <svg
          class="auth-paw auth-paw--one"
          viewBox="0 0 120 120"
          aria-hidden="true"
        >
          <circle cx="30" cy="38" r="12" fill="#4a2e85" />
          <circle cx="55" cy="28" r="10" fill="#4a2e85" />
          <circle cx="80" cy="38" r="12" fill="#4a2e85" />
          <ellipse cx="55" cy="75" rx="28" ry="22" fill="#4a2e85" />
        </svg>
        <svg
          class="auth-paw auth-paw--two"
          viewBox="0 0 120 120"
          aria-hidden="true"
        >
          <circle cx="30" cy="38" r="12" fill="#ef7c43" />
          <circle cx="55" cy="28" r="10" fill="#ef7c43" />
          <circle cx="80" cy="38" r="12" fill="#ef7c43" />
          <ellipse cx="55" cy="75" rx="28" ry="22" fill="#ef7c43" />
        </svg>
        <div class="relative z-10 mx-auto w-full max-w-md">
          <div class="space-y-8 rounded-2xl border border-[#4a2e85]/10 bg-white/90 px-8 py-12 shadow-xl backdrop-blur">
            <div class="space-y-2 text-center">
              <div class="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-[#4a2e85]/10 text-[#4a2e85]">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  class="h-6 w-6"
                >
                  <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                  <polyline points="10 17 15 12 10 7" />
                  <line x1="15" y1="12" x2="3" y2="12" />
                </svg>
              </div>
              <h2 class="text-2xl font-bold text-[#4a2e85]">Bienvenido</h2>
              <p class="text-sm text-[#4a2e85b3]">
                Ingresa tus datos para continuar
              </p>
            </div>
            <div class="space-y-6">
              <Input
                label="Correo"
                val={s.correo}
                error={Boolean(s.fieldErrors.correo)}
                onValue$={(v) => (s.correo = v)}
                placeholder="correo@dominio.com"
                ring="focus:ring-[#ef7c43]"
              />
              {s.fieldErrors.correo && (
                <p class="text-xs text-red-600">{s.fieldErrors.correo}</p>
              )}
              <Input
                label="Contrasena"
                val={s.password}
                error={Boolean(s.fieldErrors.password)}
                onValue$={(v) => (s.password = v)}
                placeholder="********"
                type="password"
                ring="focus:ring-[#ef7c43]"
              />
              {s.fieldErrors.password && (
                <p class="text-xs text-red-600">{s.fieldErrors.password}</p>
              )}
              {s.successMessage && (
                <Callout tone="success">{s.successMessage}</Callout>
              )}
              {s.authErrors.length > 0 && (
                <Callout tone="info">
                  <ul class="list-disc space-y-1 pl-4">
                    {s.authErrors.map((err) => (
                      <li key={err}>{err}</li>
                    ))}
                  </ul>
                </Callout>
              )}
              <button
                type="button"
                onClick$={doLogin}
                data-no-loader="true"
                class={`${ctaPrimary} mt-2 w-full py-4 text-lg ${s.isLoggingIn ? "cursor-wait opacity-80" : ""}`}
                disabled={s.isLoggingIn}
              >
                {s.isLoggingIn ? "Iniciando..." : "Iniciar sesión"}
              </button>
              <div class="text-center text-sm text-[#4a2e85b3]">
                ¿No tienes cuenta?
                <Link
                  href="/auth?mode=registro"
                  class="ml-1 font-semibold text-[#4a2e85] hover:underline"
                >
                  Regístrate aquí
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div class="auth-wrapper">
      <div class="auth-orb auth-orb--one" />
      <div class="auth-orb auth-orb--two" />
      <div class="auth-orb auth-orb--three" />
      <svg
        class="auth-paw auth-paw--one"
        viewBox="0 0 120 120"
        aria-hidden="true"
      >
        <circle cx="30" cy="38" r="12" fill="#4a2e85" />
        <circle cx="55" cy="28" r="10" fill="#4a2e85" />
        <circle cx="80" cy="38" r="12" fill="#4a2e85" />
        <ellipse cx="55" cy="75" rx="28" ry="22" fill="#4a2e85" />
      </svg>
      <svg
        class="auth-paw auth-paw--two"
        viewBox="0 0 120 120"
        aria-hidden="true"
      >
        <circle cx="30" cy="38" r="12" fill="#ef7c43" />
        <circle cx="55" cy="28" r="10" fill="#ef7c43" />
        <circle cx="80" cy="38" r="12" fill="#ef7c43" />
        <ellipse cx="55" cy="75" rx="28" ry="22" fill="#ef7c43" />
      </svg>
      <div class="auth-content mx-auto max-w-screen-2xl px-4 pt-16 pb-8 sm:px-6 sm:py-14 lg:px-8">
        <header class="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-center sm:justify-between">
          <div class="max-w-2xl space-y-2">
            <p class="text-sm font-semibold tracking-wide text-[#4a2e85] uppercase">
              Registro unico
            </p>
            <h1 class="text-2xl leading-tight font-extrabold text-[#4a2e85] sm:text-4xl">
              Completa tu perfil para conectar cuidadores y duenos
            </h1>
            <p class="text-sm text-[#4a2e85b3] sm:text-base">
              Flujo unificado sin verificaciones. Subes tu soporte bancario y
              datos clave para validar tu identidad.
            </p>
          </div>
          <div class="w-full rounded-2xl border border-[#4a2e85]/10 bg-white/70 p-4 shadow-lg sm:w-64 sm:p-5">
            <p class="mb-2 text-sm font-semibold text-[#4a2e85]">Progreso</p>
            <div class="flex items-center gap-3">
              <div class="relative h-2 flex-1 overflow-hidden rounded-full bg-[#4a2e85]/10">
                <div
                  class="absolute inset-y-0 left-0 bg-gradient-to-r from-[#f6e527] to-[#ef7c43]"
                  style={{
                    width: ((s.currentStep + 1) / steps.length) * 100 + "%",
                  }}
                />
              </div>
              <span class="text-sm font-semibold text-[#4a2e85]">
                {s.currentStep + 1}/{steps.length}
              </span>
            </div>
          </div>
        </header>

        <section class="grid min-w-0 items-start gap-6 lg:grid-cols-[1fr,360px] lg:gap-8">
          <div class="min-w-0 overflow-hidden rounded-2xl border border-[#4a2e85]/10 bg-white/80 p-4 shadow-xl backdrop-blur sm:p-8">
            <div class="no-scrollbar flex flex-wrap items-center gap-1.5 overflow-x-auto pb-3 sm:gap-2">
              {steps.map((title, idx) => (
                <button
                  key={title}
                  type="button"
                  onClick$={() => goToStep(idx)}
                  class={
                    "flex shrink-0 items-center justify-center gap-1 rounded-lg border px-2 py-1.5 text-xs transition-all sm:gap-2 sm:px-3 sm:py-2 sm:text-sm " +
                    (s.currentStep === idx
                      ? "border-transparent bg-gradient-to-r from-[#f6e527] to-[#ef7c43] font-semibold text-[#4a2e85]"
                      : "border-[#4a2e85]/15 bg-white text-[#4a2e85] hover:border-[#ef7c43]")
                  }
                >
                  <span
                    class="flex h-5 w-5 items-center justify-center rounded-full border border-[#4a2e85]/20 bg-white/70 text-[11px] font-bold sm:h-6 sm:w-6 sm:text-xs"
                    style={{ color: brand.primary }}
                  >
                    {idx + 1}
                  </span>
                  <span class="hidden sm:inline">{title}</span>
                </button>
              ))}
            </div>

            <div class="mt-6 space-y-6">
              {s.currentStep === 0 && (
                <div class="space-y-6">
                  <StepTitle
                    icon="<path d='M12 2v20'/><path d='M2 12h20'/>"
                    title="Selecciona tu rol"
                    step={s.currentStep}
                  />
                  <div class="grid gap-4 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick$={() => (s.role = "owner")}
                      class={
                        "rounded-xl border p-4 text-left transition-all " +
                        (s.role === "owner"
                          ? "border-transparent bg-gradient-to-r from-[#f6e527] to-[#ef7c43] text-[#4a2e85]"
                          : "border-[#4a2e85]/15 bg-white text-[#4a2e85] hover:border-[#ef7c43]")
                      }
                    >
                      <p class="font-semibold">Dueno de mascota</p>
                      <p class="text-sm opacity-80">
                        Busco cuidadores para mi mascota
                      </p>
                    </button>
                    <button
                      type="button"
                      onClick$={() => (s.role = "caregiver")}
                      class={
                        "rounded-xl border p-4 text-left transition-all " +
                        (s.role === "caregiver"
                          ? "border-transparent bg-gradient-to-r from-[#f6e527] to-[#ef7c43] text-[#4a2e85]"
                          : "border-[#4a2e85]/15 bg-white text-[#4a2e85] hover:border-[#ef7c43]")
                      }
                    >
                      <p class="font-semibold">Cuidador</p>
                      <p class="text-sm opacity-80">
                        Quiero ofrecer servicios de cuidado
                      </p>
                    </button>
                  </div>
                </div>
              )}
              {s.currentStep === 1 && (
                <div class="space-y-6">
                  <StepTitle
                    icon="<path d='M4 4h16v16H4z'/><polyline points='4 9 12 15 20 9'/>"
                    title="Correo y acceso"
                    step={s.currentStep}
                  />
                  <div class="grid gap-4 sm:grid-cols-2">
                    <div>
                      <Input
                        label="Correo"
                        val={s.correo}
                        error={Boolean(s.fieldErrors.correo)}
                        onValue$={(v) => (s.correo = v)}
                        placeholder="correo@dominio.com"
                        ring="focus:ring-[#ef7c43]"
                      />
                      {s.fieldErrors.correo && (
                        <p class="mt-1 text-xs text-red-600">
                          {s.fieldErrors.correo}
                        </p>
                      )}
                    </div>
                    <div>
                      <Input
                        label="Contrasena"
                        val={s.password}
                        error={Boolean(s.fieldErrors.password)}
                        onValue$={(v) => (s.password = v)}
                        placeholder="********"
                        type="password"
                        ring="focus:ring-[#ef7c43]"
                      />
                      {s.fieldErrors.password && (
                        <p class="mt-1 text-xs text-red-600">
                          {s.fieldErrors.password}
                        </p>
                      )}
                    </div>
                  </div>
                  {s.successMessage && (
                    <Callout tone="success">{s.successMessage}</Callout>
                  )}
                </div>
              )}
              {s.currentStep === 2 && (
                <div class="max-w-2xl space-y-6">
                  <StepTitle
                    icon="<circle cx='12' cy='7' r='4'/><path d='M5.5 21a8.38 8.38 0 0 1 13 0'/>"
                    title="Nombre completo"
                    step={s.currentStep}
                  />
                  <div class="grid gap-4 sm:grid-cols-2">
                    <div>
                      <Input
                        label="Nombres"
                        val={s.nombres}
                        error={Boolean(s.fieldErrors.nombres)}
                        onValue$={(v) => (s.nombres = v)}
                        placeholder="Juan"
                        ring="focus:ring-[#4a2e85]"
                      />
                      {s.fieldErrors.nombres && (
                        <p class="mt-1 text-xs text-red-600">
                          {s.fieldErrors.nombres}
                        </p>
                      )}
                    </div>
                    <div>
                      <Input
                        label="Apellidos"
                        val={s.apellidos}
                        error={Boolean(s.fieldErrors.apellidos)}
                        onValue$={(v) => (s.apellidos = v)}
                        placeholder="Perez"
                        ring="focus:ring-[#4a2e85]"
                      />
                      {s.fieldErrors.apellidos && (
                        <p class="mt-1 text-xs text-red-600">
                          {s.fieldErrors.apellidos}
                        </p>
                      )}
                    </div>
                  </div>
                  <div class="mt-4 space-y-2">
                    <Upload
                      label="Foto de perfil (Opcional)"
                      onFile$={(f) => handleFile(f, "profilePhotoName")}
                      brand={brand}
                    />
                    {renderUploadPreview(s.profilePhotoName)}
                  </div>
                  <div class="mt-4">
                    <label
                      class="block space-y-2 text-sm font-medium"
                      style={{ color: brand.primary }}
                    >
                      <span>Biografía (opcional)</span>
                      <TextArea
                        val={s.bio}
                        placeholder="Cuéntanos un poco sobre ti..."
                        onValue$={(v) => (s.bio = v)}
                      />
                    </label>
                  </div>
                </div>
              )}
              {s.currentStep === 3 && (
                <div class="max-w-2xl space-y-6">
                  <StepTitle
                    icon="<path d='M22 16.92v3a2 2 0 0 1-2.18 2A19.86 19.86 0 0 1 11.19 18a19.5 19.5 0 0 1-6-6A19.86 19.86 0 0 1 2.08 4.18 2 2 0 0 1 4.06 2h3a2 2 0 0 1 2 1.72c.12.81.37 1.6.72 2.34a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.74-1.24a2 2 0 0 1 2.11-.45c.74.35 1.53.6 2.34.72A2 2 0 0 1 22 16.92z'/>"
                    title="Telefonos"
                    step={s.currentStep}
                  />
                  <div class="grid gap-4 sm:grid-cols-2">
                    <div>
                      <Input
                        label="Telefono principal"
                        val={s.tel1}
                        error={Boolean(s.fieldErrors.tel1)}
                        numericOnly
                        onValue$={(v) => (s.tel1 = v)}
                        placeholder="0412-1234567"
                        ring="focus:ring-[#ef7c43]"
                      />
                      {s.fieldErrors.tel1 && (
                        <p class="mt-1 text-xs text-red-600">
                          {s.fieldErrors.tel1}
                        </p>
                      )}
                    </div>
                    <div>
                      <Input
                        label="Telefono alternativo"
                        val={s.tel2}
                        numericOnly
                        onValue$={(v) => (s.tel2 = v)}
                        placeholder="0414-9876543"
                        ring="focus:ring-[#ef7c43]"
                      />
                    </div>
                  </div>
                </div>
              )}
              {s.currentStep === 4 && (
                <div class="max-w-2xl space-y-6">
                  <StepTitle
                    icon="<rect x='3' y='3' width='18' height='14' rx='2' ry='2'/><path d='M7 7h.01'/><path d='M7 11h10'/><path d='M17 7h.01'/>"
                    title="Cedula de identidad"
                    step={s.currentStep}
                  />
                  <Input
                    label="Numero de cedula"
                    val={s.cedulaNum}
                    error={Boolean(s.fieldErrors.cedulaNum)}
                    onValue$={(v) => (s.cedulaNum = v)}
                    placeholder="V-12345678"
                    ring="focus:ring-[#4a2e85]"
                  />
                  {s.fieldErrors.cedulaNum && (
                    <p class="text-xs text-red-600">
                      {s.fieldErrors.cedulaNum}
                    </p>
                  )}
                  <div class="grid gap-4 sm:grid-cols-2">
                    <div class="space-y-2">
                      <Upload
                        label="Foto anverso (frente)"
                        onFile$={(f) => handleFile(f, "cedulaAnversoName")}
                        brand={brand}
                      />
                      {renderUploadPreview(s.cedulaAnversoName)}
                      {s.fieldErrors.cedulaAnversoName && (
                        <p class="text-xs text-red-600">
                          {s.fieldErrors.cedulaAnversoName}
                        </p>
                      )}
                    </div>
                    <div class="space-y-2">
                      <Upload
                        label="Foto reverso (dorso)"
                        onFile$={(f) => handleFile(f, "cedulaReversoName")}
                        brand={brand}
                      />
                      {renderUploadPreview(s.cedulaReversoName)}
                      {s.fieldErrors.cedulaReversoName && (
                        <p class="text-xs text-red-600">
                          {s.fieldErrors.cedulaReversoName}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}
              {s.currentStep === 5 && (
                <div class="max-w-2xl space-y-6">
                  <StepTitle
                    icon="<path d='M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z'/><polyline points='14 2 14 8 20 8'/><line x1='16' y1='13' x2='8' y2='13'/><line x1='16' y1='17' x2='8' y2='17'/><polyline points='10 9 9 9 8 9'/>"
                    title="RIF vigente"
                    step={s.currentStep}
                  />
                  <div class="grid gap-4 sm:grid-cols-2">
                    <div>
                      <Input
                        label="Numero de RIF"
                        val={s.rifNum}
                        error={Boolean(s.fieldErrors.rifNum)}
                        onValue$={(v) => (s.rifNum = v)}
                        placeholder="J-123456789"
                        ring="focus:ring-[#4a2e85]"
                      />
                      {s.fieldErrors.rifNum && (
                        <p class="mt-1 text-xs text-red-600">
                          {s.fieldErrors.rifNum}
                        </p>
                      )}
                    </div>
                    <div class="space-y-2">
                      <Upload
                        label="Documento RIF"
                        onFile$={(f) => handleFile(f, "rifArchivoName")}
                        brand={brand}
                      />
                      {renderUploadPreview(s.rifArchivoName)}
                      {s.fieldErrors.rifArchivoName && (
                        <p class="text-xs text-red-600">
                          {s.fieldErrors.rifArchivoName}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}
              {s.currentStep === 6 && (
                <div class="max-w-3xl space-y-6">
                  <StepTitle
                    icon="<rect x='1' y='4' width='22' height='16' rx='2' ry='2'/><line x1='1' y1='10' x2='23' y2='10'/>"
                    title="Referencia bancaria"
                    step={s.currentStep}
                  />
                  <div class="grid gap-4 sm:grid-cols-2">
                    <div>
                      <Input
                        label="Banco"
                        val={s.bancoNombre}
                        error={Boolean(s.fieldErrors.bancoNombre)}
                        onValue$={(v) => (s.bancoNombre = v)}
                        placeholder="Banco Provincial"
                        ring="focus:ring-[#ef7c43]"
                      />
                      {s.fieldErrors.bancoNombre && (
                        <p class="mt-1 text-xs text-red-600">
                          {s.fieldErrors.bancoNombre}
                        </p>
                      )}
                    </div>
                    <div>
                      <Input
                        label="Titular de la cuenta"
                        val={s.bancoTitular}
                        error={Boolean(s.fieldErrors.bancoTitular)}
                        onValue$={(v) => (s.bancoTitular = v)}
                        placeholder="Nombre completo"
                        ring="focus:ring-[#ef7c43]"
                      />
                      {s.fieldErrors.bancoTitular && (
                        <p class="mt-1 text-xs text-red-600">
                          {s.fieldErrors.bancoTitular}
                        </p>
                      )}
                    </div>
                    <div>
                      <Input
                        label="Cedula del titular"
                        val={s.bancoCedula}
                        error={Boolean(s.fieldErrors.bancoCedula)}
                        onValue$={(v) => (s.bancoCedula = v)}
                        placeholder="V-12345678"
                        ring="focus:ring-[#ef7c43]"
                      />
                      {s.fieldErrors.bancoCedula && (
                        <p class="mt-1 text-xs text-red-600">
                          {s.fieldErrors.bancoCedula}
                        </p>
                      )}
                    </div>
                    <div>
                      <Input
                        label="Cuenta Pago Movil"
                        val={s.bancoCuenta}
                        error={Boolean(s.fieldErrors.bancoCuenta)}
                        numericOnly
                        onValue$={(v) => (s.bancoCuenta = v)}
                        placeholder="04241234567"
                        ring="focus:ring-[#ef7c43]"
                      />
                      {s.fieldErrors.bancoCuenta && (
                        <p class="mt-1 text-xs text-red-600">
                          {s.fieldErrors.bancoCuenta}
                        </p>
                      )}
                    </div>
                    <div class="space-y-2 sm:col-span-2">
                      <Upload
                        label="Soporte bancario (PDF/Imagen)"
                        onFile$={(f) => handleFile(f, "bancoSoporteName")}
                        brand={brand}
                      />
                      {renderUploadPreview(s.bancoSoporteName)}
                      {s.fieldErrors.bancoSoporteName && (
                        <p class="text-xs text-red-600">
                          {s.fieldErrors.bancoSoporteName}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}
              {s.currentStep === 7 && (
                <div class="max-w-3xl space-y-6">
                  <StepTitle
                    icon="<path d='M18 20a6 6 0 0 0-12 0'/><circle cx='12' cy='10' r='4'/>"
                    title="Referencias personales"
                    step={s.currentStep}
                  />
                  <Refs
                    title="Personal"
                    data={s.refPersonales}
                    onChange$={(i, f, v) => updateRef("refPersonales", i, f, v)}
                    errors={s.fieldErrors}
                    kind="personal"
                  />
                </div>
              )}
              {s.currentStep === 8 && (
                <div class="max-w-3xl space-y-6">
                  <StepTitle
                    icon="<path d='M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2'/><circle cx='9' cy='7' r='4'/><line x1='23' y1='11' x2='23' y2='17'/><line x1='20' y1='14' x2='26' y2='14'/>"
                    title="Referencias familiares"
                    step={s.currentStep}
                  />
                  <Refs
                    title="Familiar"
                    data={s.refFamiliares}
                    onChange$={(i, f, v) => updateRef("refFamiliares", i, f, v)}
                    errors={s.fieldErrors}
                    kind="familiar"
                  />
                </div>
              )}
              {s.currentStep === 9 && (
                <div class="max-w-3xl space-y-6">
                  <StepTitle
                    icon="<path d='M3 5a9 9 0 0 1 18 0c0 7-9 14-9 14S3 12 3 5Z'/><circle cx='12' cy='5' r='2'/>"
                    title="Contacto de emergencia"
                    step={s.currentStep}
                  />
                  <div class="grid gap-4 sm:grid-cols-2">
                    <Input
                      label="Nombre"
                      val={s.emergencia.nombre}
                      error={Boolean(s.fieldErrors.emergencia_nombre)}
                      onValue$={(v) => (s.emergencia.nombre = v)}
                      placeholder="Contacto"
                      ring="focus:ring-[#4a2e85]"
                    />
                    {s.fieldErrors.emergencia_nombre && (
                      <p class="text-xs text-red-600">
                        {s.fieldErrors.emergencia_nombre}
                      </p>
                    )}
                    <Input
                      label="Relacion"
                      val={s.emergencia.relacion}
                      onValue$={(v) => (s.emergencia.relacion = v)}
                      placeholder="Hermano"
                      ring="focus:ring-[#4a2e85]"
                    />
                    <Input
                      label="Telefono"
                      val={s.emergencia.telefono}
                      error={Boolean(s.fieldErrors.emergencia_telefono)}
                      numericOnly
                      onValue$={(v) => (s.emergencia.telefono = v)}
                      placeholder="0412-0000000"
                      ring="focus:ring-[#4a2e85]"
                    />
                    {s.fieldErrors.emergencia_telefono && (
                      <p class="text-xs text-red-600">
                        {s.fieldErrors.emergencia_telefono}
                      </p>
                    )}
                    <Input
                      label="Direccion"
                      val={s.emergencia.direccion}
                      error={Boolean(s.fieldErrors.emergencia_direccion)}
                      onValue$={(v) => (s.emergencia.direccion = v)}
                      placeholder="Ciudad, calle"
                      ring="focus:ring-[#4a2e85]"
                    />
                    {s.fieldErrors.emergencia_direccion && (
                      <p class="text-xs text-red-600">
                        {s.fieldErrors.emergencia_direccion}
                      </p>
                    )}
                  </div>
                </div>
              )}
              {s.currentStep === 10 && (
                <div class="space-y-6">
                  <StepTitle
                    icon="<circle cx='12' cy='10' r='3'/><path d='M12 22v-6'/><path d='M16 22l-4-10-4 10'/>"
                    title="Ubicacion"
                    step={s.currentStep}
                  />
                  {(s.fieldErrors.ubicacion_lat ||
                    s.fieldErrors.ubicacion_lng) && (
                      <div class="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                        <p class="font-medium">Ubicación requerida</p>
                        <p>
                          Por favor, usa el buscador, el botón de GPS, o haz clic
                          en el mapa para establecer tu ubicación.
                        </p>
                      </div>
                    )}
                  <div class="relative z-20 flex flex-col gap-2">
                    <div class="relative flex gap-2">
                      <div class="relative flex-1">
                        <input
                          type="text"
                          placeholder="Buscar ciudad (Ej: Valencia)"
                          class="w-full rounded-lg border border-[#4a2e85]/20 px-3 py-2 text-sm focus:ring-2 focus:ring-[#ef7c43] focus:outline-none"
                          value={s.citySearch}
                          onInput$={async (e) => {
                            const qty = (e.target as HTMLInputElement).value;
                            s.citySearch = qty;
                            if (searchDebounce.value)
                              clearTimeout(searchDebounce.value);
                            if (!qty || qty.length < 3) {
                              s.citySearchResults = [];
                              return;
                            }
                            // @ts-ignore
                            searchDebounce.value = setTimeout(async () => {
                              s.isSearchingCity = true;
                              try {
                                const res = await fetch(
                                  `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(qty)}, Venezuela&limit=5`,
                                );
                                s.citySearchResults = await res.json();
                              } catch (e) {
                                console.error(e);
                              } finally {
                                s.isSearchingCity = false;
                              }
                            }, 500);
                          }}
                        />
                        {s.isSearchingCity && (
                          <div class="absolute top-1/2 right-3 -translate-y-1/2">
                            <div class="h-4 w-4 animate-spin rounded-full border-2 border-[#ef7c43] border-t-transparent"></div>
                          </div>
                        )}
                        {s.citySearchResults.length > 0 && (
                          <ul class="absolute top-full right-0 left-0 z-50 mt-1 max-h-60 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-xl">
                            {s.citySearchResults.map((res: any) => (
                              <li
                                key={res.place_id}
                                class="cursor-pointer border-b border-gray-50 px-3 py-2 text-xs text-gray-700 last:border-0 hover:bg-[#ef7c43]/10"
                                onClick$={() => selectCity(res)}
                              >
                                {res.display_name}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                      <button
                        type="button"
                        class="rounded-lg bg-[#4a2e85] px-4 py-2 text-sm font-medium text-white hover:bg-[#3b256b]"
                        onClick$={async () => {
                          if (!s.citySearch.trim()) return;
                          s.geoStatus = "Buscando ciudad...";
                          try {
                            const res = await fetch(
                              `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(s.citySearch)}, Venezuela`,
                            );
                            const data = await res.json();
                            if (data && data.length > 0) {
                              selectCity(data[0]);
                            } else {
                              s.geoStatus = "Ciudad no encontrada.";
                            }
                          } catch {
                            s.geoStatus = "Error de conexión.";
                          }
                        }}
                      >
                        Buscar
                      </button>
                    </div>

                    <div class="flex items-center gap-3">
                      <button
                        type="button"
                        onClick$={getLocation}
                        class={ctaGhost}
                      >
                        Usar mi ubicación GPS
                      </button>
                      <p class="text-sm text-[#4a2e85b3]">
                        Si es impreciso, arrastra el marcador.
                      </p>
                    </div>
                  </div>
                  <div class="space-y-1 rounded-lg border border-[#4a2e85]/10 bg-white/70 p-3 text-xs text-[#4a2e85b3]">
                    <p class="font-semibold text-[#4a2e85]">
                      Si no aparece el permiso de ubicacion:
                    </p>
                    <p>1) Verifica que estas en HTTPS o en localhost.</p>
                    <p>
                      2) Abre el candado del navegador y cambia Ubicacion a
                      Permitir o Preguntar.
                    </p>
                    <p>3) Recarga la pagina y vuelve a intentar.</p>
                  </div>
                  {s.geoStatus && (
                    <p class="text-xs text-[#4a2e85b3]">{s.geoStatus}</p>
                  )}
                  <div
                    class="relative h-[200px] w-full overflow-hidden rounded-2xl border border-[#4a2e85]/15 bg-[#4a2e85]/5 sm:h-[300px]"
                    ref={mapRef}
                  />
                  <TextArea
                    placeholder="Direccion Exacta"
                    val={s.direccionDetallada}
                    onValue$={(v) => (s.direccionDetallada = v)}
                  />
                  {s.fieldErrors.direccionDetallada && (
                    <p class="text-xs text-red-600">
                      {s.fieldErrors.direccionDetallada}
                    </p>
                  )}
                </div>
              )}
              {s.currentStep === 11 && (
                <div class="max-w-3xl space-y-6">
                  <StepTitle
                    icon="<path d='M10 7h.01'/><path d='M14 7h.01'/><path d='M12 12v1'/><path d='M8 14s1.5 2 4 2 4-2 4-2'/>"
                    title="Mascotas"
                    step={s.currentStep}
                  />
                  <div class="flex items-center gap-3">
                    {s.role === "caregiver" && (
                      <label
                        class="flex items-center gap-2 text-sm font-medium"
                        style={{ color: brand.primary }}
                      >
                        <input
                          type="checkbox"
                          checked={s.tengoMascota}
                          onChange$={(ev: any) =>
                            (s.tengoMascota = ev.target.checked)
                          }
                          class="h-4 w-4 rounded border-[#4a2e85]/50"
                        />
                        Tengo mascota
                      </label>
                    )}
                    <span class="text-xs text-[#4a2e85b3]">
                      {s.role === "owner"
                        ? "Registra tus mascotas para continuar."
                        : "Si no tienes mascota, puedes finalizar igual."}
                    </span>
                  </div>

                  {(s.tengoMascota || s.role === "owner") && (
                    <div class="space-y-6">
                      {/* List of added pets */}
                      {s.mascotas.length > 0 && (
                        <div class="grid gap-3 sm:grid-cols-2">
                          {s.mascotas.map((pet, idx) => (
                            <div
                              key={idx}
                              class="flex items-center justify-between rounded-xl border border-[#4a2e85]/10 bg-white p-3 shadow-sm"
                            >
                              <div class="flex items-center gap-3">
                                {pet.photoName ? (
                                  <ImageWithRetry
                                    src={pet.photoName}
                                    class="h-10 w-10 rounded-full border border-[#4a2e85]/10 object-cover"
                                    width={40}
                                    height={40}
                                    layout="constrained"
                                    alt={pet.name || "Mascota"}
                                  />
                                ) : (
                                  <div class="flex h-10 w-10 items-center justify-center rounded-full bg-[#4a2e85]/5 text-[#4a2e85]">
                                    <svg
                                      xmlns="http://www.w3.org/2000/svg"
                                      class="h-5 w-5"
                                      viewBox="0 0 24 24"
                                      fill="none"
                                      stroke="currentColor"
                                      stroke-width="2"
                                      stroke-linecap="round"
                                      stroke-linejoin="round"
                                    >
                                      <path d="M10 7h.01" />
                                      <path d="M14 7h.01" />
                                      <path d="M12 12v1" />
                                      <path d="M8 14s1.5 2 4 2 4-2 4-2" />
                                    </svg>
                                  </div>
                                )}
                                <div>
                                  <p class="text-sm font-bold text-[#4a2e85]">
                                    {pet.name}
                                  </p>
                                  <p class="text-xs text-[#4a2e85b3]">
                                    {pet.species} - {pet.breed}
                                  </p>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick$={() => {
                                  s.mascotas = s.mascotas.filter(
                                    (_, i) => i !== idx,
                                  );
                                }}
                                class="rounded-lg p-1.5 text-red-500 transition-colors hover:bg-red-50 hover:text-red-700"
                                title="Eliminar mascota"
                              >
                                <svg
                                  xmlns="http://www.w3.org/2000/svg"
                                  class="h-4 w-4"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  stroke-width="2"
                                  stroke-linecap="round"
                                  stroke-linejoin="round"
                                >
                                  <path d="M3 6h18" />
                                  <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                                  <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                                </svg>
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      <div class="space-y-4 rounded-xl border border-[#4a2e85]/10 bg-[#4a2e85]/5 p-4">
                        <h4 class="flex items-center gap-2 text-sm font-bold text-[#4a2e85]">
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            class="h-4 w-4"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                          >
                            <line x1="12" y1="5" x2="12" y2="19" />
                            <line x1="5" y1="12" x2="19" y2="12" />
                          </svg>
                          Agregar mascota
                        </h4>
                        <div class="grid gap-4 sm:grid-cols-2">
                          <div>
                            <Input
                              label="Nombre"
                              val={s.mascotaDraft.name}
                              error={Boolean(s.fieldErrors.mascotaNombre)}
                              onValue$={(v) => (s.mascotaDraft.name = v)}
                              placeholder="Firulais"
                              ring="focus:ring-[#4a2e85]"
                            />
                            {s.fieldErrors.mascotaNombre && (
                              <p class="mt-1 text-xs text-red-600">
                                {s.fieldErrors.mascotaNombre}
                              </p>
                            )}
                          </div>
                          <div>
                            <label
                              class="block space-y-2 text-sm font-medium"
                              style={{ color: brand.primary }}
                            >
                              <span>Especie</span>
                              <select
                                class="w-full rounded-xl border border-[#4a2e85]/20 bg-white px-4 py-3 text-sm shadow-sm focus:ring-2 focus:ring-[#4a2e85] focus:outline-none"
                                value={s.mascotaDraft.species}
                                onChange$={(e: any) =>
                                  (s.mascotaDraft.species = e.target.value)
                                }
                              >
                                <option value="perro">Perro</option>
                                <option value="gato">Gato</option>
                                <option value="ave">Ave</option>
                                <option value="conejo">Conejo</option>
                                <option value="cobayo">Cobayo</option>
                                <option value="hamster">Hámster</option>
                                <option value="otro">Otro</option>
                              </select>
                            </label>
                            {s.fieldErrors.mascotaEspecie && (
                              <p class="mt-1 text-xs text-red-600">
                                {s.fieldErrors.mascotaEspecie}
                              </p>
                            )}
                          </div>

                          <Input
                            label="Raza"
                            val={s.mascotaDraft.breed}
                            onValue$={(v) => (s.mascotaDraft.breed = v)}
                            placeholder="Criollo"
                            ring="focus:ring-[#4a2e85]"
                          />
                          <Input
                            label="Edad (años)"
                            val={s.mascotaDraft.age}
                            onValue$={(v) => (s.mascotaDraft.age = v)}
                            placeholder="3"
                            numericOnly
                            ring="focus:ring-[#4a2e85]"
                          />

                          <div>
                            <label
                              class="block space-y-2 text-sm font-medium"
                              style={{ color: brand.primary }}
                            >
                              <span>Sexo</span>
                              <select
                                class="w-full rounded-xl border border-[#4a2e85]/20 bg-white px-4 py-3 text-sm shadow-sm focus:ring-2 focus:ring-[#4a2e85] focus:outline-none"
                                value={s.mascotaDraft.sex}
                                onChange$={(e: any) =>
                                  (s.mascotaDraft.sex = e.target.value)
                                }
                              >
                                <option value="macho">Macho</option>
                                <option value="hembra">Hembra</option>
                              </select>
                            </label>
                          </div>
                          <Input
                            label="Peso (kg)"
                            val={s.mascotaDraft.weight}
                            onValue$={(v) => (s.mascotaDraft.weight = v)}
                            placeholder="10.5"
                            ring="focus:ring-[#4a2e85]"
                          />

                          {s.mascotaDraft.species === "perro" && (
                            <div>
                              <label
                                class="block space-y-2 text-sm font-medium"
                                style={{ color: brand.primary }}
                              >
                                <span>Tamaño</span>
                                <select
                                  class="w-full rounded-xl border border-[#4a2e85]/20 bg-white px-4 py-3 text-sm shadow-sm focus:ring-2 focus:ring-[#4a2e85] focus:outline-none"
                                  value={s.mascotaDraft.size}
                                  onChange$={(e: any) =>
                                    (s.mascotaDraft.size = e.target.value)
                                  }
                                >
                                  <option value="">Seleccionar...</option>
                                  <option value="pequeño">Pequeño</option>
                                  <option value="mediano">Mediano</option>
                                  <option value="grande">Grande</option>
                                </select>
                              </label>
                            </div>
                          )}

                          <Input
                            label="Comportamiento"
                            val={s.mascotaDraft.behavior}
                            onValue$={(v) => (s.mascotaDraft.behavior = v)}
                            placeholder="Amigable, activo (separado por comas)"
                            ring="focus:ring-[#4a2e85]"
                          />
                          <Input
                            label="Condiciones médicas"
                            val={s.mascotaDraft.medicalConditions}
                            onValue$={(v) =>
                              (s.mascotaDraft.medicalConditions = v)
                            }
                            placeholder="Ninguna"
                            ring="focus:ring-[#4a2e85]"
                          />
                          <Input
                            label="Alergias"
                            val={s.mascotaDraft.allergies}
                            onValue$={(v) => (s.mascotaDraft.allergies = v)}
                            placeholder="Ninguna"
                            ring="focus:ring-[#4a2e85]"
                          />

                          <div class="col-span-2 flex flex-col gap-4 sm:flex-row">
                            <label
                              class="flex items-center gap-2 text-sm font-medium"
                              style={{ color: brand.primary }}
                            >
                              <input
                                type="checkbox"
                                checked={s.mascotaDraft.hasIdTag}
                                onChange$={(ev: any) =>
                                  (s.mascotaDraft.hasIdTag = ev.target.checked)
                                }
                                class="h-4 w-4 rounded border-[#4a2e85]/50"
                              />
                              Tiene placa/identificación
                            </label>
                            <label
                              class="flex items-center gap-2 text-sm font-medium"
                              style={{ color: brand.primary }}
                            >
                              <input
                                type="checkbox"
                                checked={s.mascotaDraft.vaccinated}
                                onChange$={(ev: any) =>
                                (s.mascotaDraft.vaccinated =
                                  ev.target.checked)
                                }
                                class="h-4 w-4 rounded border-[#4a2e85]/50"
                              />
                              Vacunas al dia
                            </label>
                          </div>

                          <div class="space-y-2">
                            <Upload
                              label="Carnet de vacunas"
                              onFile$={(f) =>
                                handleFile(f, "mascotaControlName")
                              }
                              brand={brand}
                            />
                            {renderUploadPreview(
                              s.mascotaControlName ||
                              s.mascotaDraft.vaccinationCardName,
                            )}
                            {s.fieldErrors.mascotaControlName && (
                              <p class="text-xs text-red-600">
                                {s.fieldErrors.mascotaControlName}
                              </p>
                            )}
                          </div>
                          <div class="space-y-2">
                            <Upload
                              label="Foto de tu mascota"
                              onFile$={(f) => handleFile(f, "mascotaFotoName")}
                              brand={brand}
                            />
                            {renderUploadPreview(
                              s.mascotaFotoName || s.mascotaDraft.photoName,
                            )}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick$={async () => {
                            if (
                              !s.mascotaDraft.name ||
                              !s.mascotaDraft.species
                            ) {
                              if (!s.mascotaDraft.name)
                                s.fieldErrors.mascotaNombre = "Requerido";
                              if (!s.mascotaDraft.species)
                                s.fieldErrors.mascotaEspecie = "Requerido";
                              return;
                            }

                            // Upload images if pending - checking s.mascotaControlName and s.mascotaFotoName which are confusingly utilized here.
                            // But wait, the handleFile function updates specific state properties, let's check that.
                            // The handleFile updates s.mascotaControlName string with the DATA URL.
                            // And we need to store THAT in the pet draft.

                            // We need to clarify how handleFile works. It sets the state property (string) to data url.
                            // So s.mascotaDraft needs to be populated with those values before pushing.

                            // Wait, the previous implementation used `s.mascotaControlName`.
                            // Let's adapt handleFile to update the draft.
                            // Actually, let's keep using the state properties for the CURRENT upload being processed,
                            // and then move them to the draft object.

                            const petToAdd = {
                              ...s.mascotaDraft,
                              vaccinationCardName:
                                s.mascotaControlName ||
                                s.mascotaDraft.vaccinationCardName, // s.mascotaControlName holds the dataURL from handleFile
                              photoName:
                                s.mascotaFotoName || s.mascotaDraft.photoName, // s.mascotaFotoName holds the dataURL
                            };

                            s.mascotas = [...s.mascotas, petToAdd];

                            // Reset draft and upload state
                            s.mascotaDraft = {
                              name: "",
                              species: "perro",
                              breed: "",
                              age: "",
                              sex: "macho",
                              weight: "",
                              size: "",
                              behavior: "",
                              medicalConditions: "",
                              allergies: "",
                              hasIdTag: false,
                              vaccinated: false,
                              vaccinationCardName: "",
                              photoName: "",
                            };
                            s.mascotaControlName = ""; // clear temp upload state
                            s.mascotaFotoName = ""; // clear temp upload state
                            s.fieldErrors.mascotaNombre = "";
                            s.fieldErrors.mascotaEspecie = "";
                          }}
                          class="w-full rounded-lg bg-[#4a2e85] py-2 text-sm font-bold text-white transition-colors hover:bg-[#3b256b]"
                        >
                          Agregar mascota
                        </button>
                      </div>
                    </div>
                  )}

                  <div class="border-t border-[#4a2e85]/10 pt-6">
                    <label class="group flex cursor-pointer items-start gap-3">
                      <div class="relative mt-0.5">
                        <input
                          type="checkbox"
                          checked={s.aceptoTerminos}
                          onChange$={(ev: any) =>
                            (s.aceptoTerminos = ev.target.checked)
                          }
                          class="peer h-5 w-5 cursor-pointer appearance-none rounded border-2 border-[#4a2e85]/30 text-[#4a2e85] transition-all checked:border-[#4a2e85] checked:bg-[#4a2e85] focus:ring-[#4a2e85]/30"
                        />
                        <svg
                          class="pointer-events-none absolute inset-0 h-5 w-5 scale-0 p-1 text-white transition-transform peer-checked:scale-100"
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          stroke-width="4"
                          stroke-linecap="round"
                          stroke-linejoin="round"
                        >
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      </div>
                      <div class="flex-1">
                        <p
                          class="text-sm font-semibold transition-colors group-hover:text-[#ef7c43]"
                          style={{ color: brand.primary }}
                        >
                          Acepto los términos y condiciones
                        </p>
                        <p class="mt-1 text-xs text-[#4a2e85b3]">
                          Al marcar esta casilla, confirmas que has leído y
                          aceptas nuestros términos de servicio, política de
                          privacidad y normas de la comunidad.
                        </p>
                        {s.fieldErrors.aceptoTerminos && (
                          <p class="mt-1 text-xs font-medium text-red-600">
                            {s.fieldErrors.aceptoTerminos}
                          </p>
                        )}
                      </div>
                    </label>
                  </div>
                </div>
              )}
            </div>

            {s.authErrors.length > 0 && (
              <div class="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 shadow-sm">
                <div class="flex items-start gap-3">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    class="mt-0.5 h-5 w-5 flex-shrink-0"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fill-rule="evenodd"
                      d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                      clip-rule="evenodd"
                    />
                  </svg>
                  <div>
                    <p class="font-bold">Revisa lo siguiente:</p>
                    <ul class="mt-1 list-disc space-y-1 pl-4">
                      {s.authErrors.map((err, i) => (
                        <li key={i}>{err}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}

            <div class="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div class="flex flex-col gap-3 sm:flex-row">
                {s.currentStep > 0 && (
                  <button
                    type="button"
                    onClick$={prevStep}
                    class={ctaGhost + " w-full sm:w-auto"}
                    disabled={s.isNavigating}
                    data-no-loader="true"
                  >
                    {s.isNavigating ? "Cargando..." : "Anterior"}
                  </button>
                )}
                {s.currentStep < steps.length - 1 && (
                  <button
                    type="button"
                    onClick$={nextStep}
                    class={ctaGhost + " w-full sm:w-auto"}
                    disabled={s.isNavigating}
                    data-no-loader="true"
                  >
                    {s.isNavigating ? "Cargando..." : "Siguiente"}
                  </button>
                )}
              </div>
              {s.currentStep === steps.length - 1 && (
                <button
                  type="button"
                  onClick$={submitForm}
                  data-no-loader="true"
                  class={
                    ctaPrimary +
                    (s.isRegistering ? " cursor-wait opacity-90" : "")
                  }
                  disabled={s.isRegistering}
                >
                  {s.isRegistering ? "Procesando..." : "Finalizar registro"}
                </button>
              )}
            </div>
          </div>

          <aside class="space-y-4 rounded-2xl border border-[#4a2e85]/10 bg-gradient-to-b from-[#f6e527]/30 via-white to-[#ef7c43]/10 p-4 shadow-lg sm:p-6">
            <p class="text-sm font-semibold text-[#4a2e85]">Consejos rapidos</p>
            <ul class="space-y-3 text-sm text-[#4a2e85b3]">
              <li>Usa fotos legibles para cedula y RIF.</li>
              <li>
                El soporte bancario es obligatorio para validar identidad.
              </li>
              <li>Las referencias deben ser contactables.</li>
              <li>Comparte ubicacion aproximada, no direcciones sensibles.</li>
            </ul>

            <Callout tone="info">
              Sin verificaciones: solo datos que validan tu perfil.
            </Callout>
          </aside>
        </section>
      </div>
    </div>
  );
});

interface StepTitleProps {
  icon: string;
  title: string;
  step: number;
}

const StepTitle = component$<StepTitleProps>(({ icon, title, step }) => (
  <div class="flex items-center gap-3">
    <div class="flex h-10 w-10 items-center justify-center rounded-xl border border-[#4a2e85]/10 bg-[#4a2e85]/10">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke={brand.primary}
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        class="h-6 w-6"
        dangerouslySetInnerHTML={icon}
      />
    </div>
    <div>
      <p class="text-xs tracking-wide text-[#4a2e85b3] uppercase">
        Paso {step + 1}
      </p>
      <h2 class="text-lg font-bold sm:text-xl" style={{ color: brand.primary }}>
        {title}
      </h2>
    </div>
  </div>
));

interface CalloutProps {
  tone: "info" | "success";
}

const Callout = component$<CalloutProps>(({ tone }) => {
  const styles =
    tone === "success"
      ? "bg-green-50 border-green-200 text-green-800"
      : "bg-[#4a2e85]/5 border-[#4a2e85]/15 text-[#4a2e85]";
  return (
    <div class={"rounded-lg border px-3 py-2 text-sm " + styles}>
      <Slot />
    </div>
  );
});

interface InputProps {
  label: string;
  val: string;
  onValue$: QRL<(value: string) => void>;
  placeholder?: string;
  type?: string;
  ring?: string;
  error?: boolean;
  numericOnly?: boolean;
}

const Input = component$<InputProps>((p) => {
  const {
    label,
    val,
    onValue$,
    placeholder,
    type = "text",
    ring,
    error,
    numericOnly,
  } = p;

  // Local signal prevents typing interruptions/dropped characters in Qwik
  // while still propagating changes to parent.
  const localValue = useSignal(val);
  const inputRef = useSignal<HTMLInputElement>();

  useTask$(({ track }) => {
    track(() => p.val);
    if (localValue.value !== p.val && document.activeElement !== inputRef.value) {
      localValue.value = p.val;
    }
  });

  const handleInput$ = $((ev: Event) => {
    let value = (ev.target as HTMLInputElement).value;
    if (numericOnly) value = value.replace(/[^0-9]/g, "");
    localValue.value = value;
    onValue$(value);
  });

  return (
    <label
      class="block space-y-2 text-sm font-medium"
      style={{ color: brand.primary }}
    >
      <span>{label}</span>
      <input
        ref={inputRef}
        class={
          "w-full rounded-xl border bg-white px-4 py-3 text-sm shadow-sm focus:ring-2 focus:outline-none " +
          (error
            ? "border-red-500 focus:ring-red-300"
            : "border-[#4a2e85]/20") +
          " " +
          (ring || "focus:ring-[#4a2e85]")
        }
        type={type}
        bind:value={localValue}
        placeholder={placeholder}
        inputMode={numericOnly ? "numeric" : undefined}
        pattern={numericOnly ? "[0-9]*" : undefined}
        onInput$={handleInput$}
      />
    </label>
  );
});

interface UploadProps {
  label: string;
  brand: typeof brand;
  short?: boolean;
  accept?: string;
  onFile$: QRL<(file: File | undefined) => void>;
}

const Upload = component$<UploadProps>((p) => {
  const {
    label,
    onFile$,
    brand,
    accept = "application/pdf,image/*",
    short,
  } = p;
  const handleChange$ = $((e: Event) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    onFile$(file);
  });
  return (
    <label
      class={
        "flex w-full cursor-pointer items-center gap-2 rounded-xl border border-dashed border-[#4a2e85]/30 bg-[#4a2e85]/5 px-4 py-3 text-sm hover:border-[#ef7c43]" +
        (short ? " h-full" : "")
      }
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="18"
        height="18"
        fill="none"
        stroke={brand.primary}
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M12 5v14" />
        <path d="M18 13l-6 6-6-6" />
        <path d="M6 9V5a3 3 0 0 1 3-3h6a3 3 0 0 1 3 3v4" />
      </svg>
      <span>{label}</span>
      <input
        type="file"
        accept={accept}
        class="hidden"
        onChange$={handleChange$}
      />
    </label>
  );
});

interface TextAreaProps {
  label?: string;
  val: string;
  onValue$: QRL<(value: string) => void>;
  placeholder?: string;
  rows?: number;
}

const TextArea = component$<TextAreaProps>((p) => {
  const { label, val, onValue$, placeholder, rows = 3 } = p;

  const localValue = useSignal(val);
  const textAreaRef = useSignal<HTMLTextAreaElement>();

  useTask$(({ track }) => {
    track(() => p.val);
    if (localValue.value !== p.val && document.activeElement !== textAreaRef.value) {
      localValue.value = p.val;
    }
  });

  const handleInput$ = $((ev: Event) => {
    const value = (ev.target as HTMLTextAreaElement).value;
    localValue.value = value;
    onValue$(value);
  });

  return (
    <label
      class="block space-y-2 text-sm font-medium"
      style={{ color: brand.primary }}
    >
      {label && <span>{label}</span>}
      <textarea
        ref={textAreaRef}
        class="w-full rounded-xl border border-[#4a2e85]/20 bg-white px-4 py-3 text-sm shadow-sm focus:ring-2 focus:ring-[#4a2e85] focus:outline-none"
        bind:value={localValue}
        placeholder={placeholder}
        rows={rows}
        onInput$={handleInput$}
      />
    </label>
  );
});

interface RefsProps {
  title: string;
  data: RefItem[];
  onChange$: QRL<(index: number, field: keyof RefItem, value: string) => void>;
  errors?: Record<string, string>;
  kind?: "personal" | "familiar";
}

const Refs = component$<RefsProps>((p) => {
  const { title, data, onChange$, errors, kind } = p;
  return (
    <div class="space-y-4">
      {data.map((ref, idx) => (
        <div
          key={title + "-" + idx}
          class="space-y-3 rounded-xl border border-[#4a2e85]/15 bg-white p-4 shadow-sm"
        >
          <p class="text-sm font-semibold" style={{ color: brand.primary }}>
            {title} #{idx + 1}
          </p>
          <div class="grid gap-3 sm:grid-cols-3">
            <Input
              label="Nombre"
              val={ref.nombre}
              onValue$={$((v) => onChange$(idx, "nombre", v))}
              placeholder="Nombre completo"
              error={Boolean(
                kind === "personal"
                  ? errors?.refPersonales_0_nombre
                  : kind === "familiar"
                    ? errors?.refFamiliares_0_nombre
                    : undefined,
              )}
            />
            <Input
              label="Telefono"
              val={ref.telefono}
              onValue$={$((v) => onChange$(idx, "telefono", v))}
              placeholder="0412-1234567"
              numericOnly
              error={Boolean(
                kind === "personal"
                  ? errors?.refPersonales_0_telefono
                  : kind === "familiar"
                    ? errors?.refFamiliares_0_telefono
                    : undefined,
              )}
            />
            <Input
              label="Relacion"
              val={ref.relacion}
              onValue$={$((v) => onChange$(idx, "relacion", v))}
              placeholder="Companero"
            />
          </div>
        </div>
      ))}
    </div>
  );
});

import { getTursoClient } from './turso';
import { ensureCaregiverSchema, type CaregiverRecord } from './caregiver';
import { ensureOwnerSchema, listOwnerPets, type OwnerPetRecord, type OwnerProfileRecord } from './owner';

export interface AdminUserDetail extends AdminUserRecord {
    fullProfile?: OwnerProfileRecord | CaregiverRecord;
    pets?: OwnerPetRecord[];
    emergency?: {
        name: string;
        relation: string;
        phone: string;
        address: string;
    };
    references?: {
        name: string;
        relation: string;
        phone: string;
        type: 'personal' | 'familiar';
    }[];
}

export interface AdminUserRecord {
    userId: string;
    email: string;
    name: string;
    role: 'owner' | 'caregiver';
    isVerified: boolean;
    verifiedLabel: string;
    isBanned: boolean;
    createdAt: string;
    documents: {
        cedulaFront?: string;
        cedulaBack?: string;
        rifDoc?: string;
        bankSupport?: string;
        petVaccine?: string;
    };
    bank?: {
        bankName: string;
        titular: string;
        rif: string;
        paymobile: string;
        verified: boolean;
    };
}

export const listAllRegistrations = async (): Promise<AdminUserRecord[]> => {
    await ensureCaregiverSchema();
    await ensureOwnerSchema();
    const client = getTursoClient();

    // Get all users
    const usersRes = await client.execute('select id, email, role, is_banned, created_at from users order by created_at desc');

    // Get all owner profiles
    const ownerProfilesRes = await client.execute('select user_id, full_name, is_verified from owner_profile_extra');
    const ownerDocsRes = await client.execute('select * from owner_documents');

    // Get all caregiver profiles
    const caregiverProfilesRes = await client.execute('select user_id, name, verified, verified_label from caregiver_profiles');
    const caregiverBankRes = await client.execute('select * from caregiver_bank');

    const ownerProfilesMap = new Map(ownerProfilesRes.rows.map((r: any) => [r.user_id as string, r]));
    const ownerDocsMap = new Map(ownerDocsRes.rows.map((r: any) => [r.user_id as string, r]));
    const caregiverProfilesMap = new Map(caregiverProfilesRes.rows.map((r: any) => [r.user_id as string, r]));
    const caregiverBankMap = new Map(caregiverBankRes.rows.map((r: any) => [r.user_id as string, r]));

    return (usersRes.rows as any[]).map(user => {
        const userId = user.id;
        const role = user.role as 'owner' | 'caregiver';

        let isVerified = false;
        let verifiedLabel = 'No verificado';
        let name = 'Usuario';
        const documents: AdminUserRecord['documents'] = {};
        let bank: AdminUserRecord['bank'] | undefined;

        if (role === 'owner') {
            const profile = ownerProfilesMap.get(userId) as any;
            const docs = ownerDocsMap.get(userId) as any;
            if (profile) {
                name = profile.full_name || 'Dueño';
                isVerified = Boolean(profile.is_verified ?? 0);
                verifiedLabel = isVerified ? 'Verificado' : 'No verificado';
            }
            if (docs) {
                documents.cedulaFront = docs.cedula_front;
                documents.cedulaBack = docs.cedula_back;
                documents.rifDoc = docs.rif_doc;
                documents.bankSupport = docs.bank_support;
                documents.petVaccine = docs.pet_vaccine;
            }
        } else if (role === 'caregiver') {
            const profile = caregiverProfilesMap.get(userId) as any;
            const bankRow = caregiverBankMap.get(userId) as any;
            const docs = ownerDocsMap.get(userId) as any; // Caregivers also have owner_documents because of how registration works

            if (profile) {
                name = profile.name || 'Cuidador';
                isVerified = Boolean(profile.verified ?? 0);
                verifiedLabel = profile.verified_label || (isVerified ? 'Verificado' : 'No verificado');
            }
            if (bankRow) {
                bank = {
                    bankName: bankRow.bank_name || '',
                    titular: bankRow.titular || '',
                    rif: bankRow.rif || '',
                    paymobile: bankRow.paymobile || '',
                    verified: Boolean(bankRow.verified ?? 0),
                };
            }
            if (docs) {
                documents.cedulaFront = docs.cedula_front;
                documents.cedulaBack = docs.cedula_back;
                documents.rifDoc = docs.rif_doc;
                documents.bankSupport = docs.bank_support;
                documents.petVaccine = docs.pet_vaccine;
            }
        }

        return {
            userId,
            email: user.email,
            name,
            role,
            isVerified,
            verifiedLabel,
            isBanned: Boolean(user.is_banned ?? 0),
            createdAt: user.created_at,
            documents,
            bank,
        };
    });
};

export const verifyUserStatus = async (userId: string, role: string, verified: boolean) => {
    const client = getTursoClient();
    const now = new Date().toISOString();

    if (role === 'owner') {
        await client.execute({
            sql: 'update owner_profile_extra set is_verified = ?, updated_at = ? where user_id = ?',
            args: [verified ? 1 : 0, now, userId],
        });
    } else if (role === 'caregiver') {
        await client.execute({
            sql: 'update caregiver_profiles set verified = ?, verified_label = ?, updated_at = ? where user_id = ?',
            args: [verified ? 1 : 0, verified ? 'Verificado' : 'No verificado', now, userId],
        });
        // Also verify bank for caregiver if verifying profile
        if (verified) {
            await client.execute({
                sql: 'update caregiver_bank set verified = 1, updated_at = ? where user_id = ?',
                args: [now, userId],
            });
        }
    }
    return { ok: true };
};

export const banUser = async (userId: string, reason: string) => {
    const client = getTursoClient();
    const now = new Date().toISOString();

    // 1. Mark user as banned
    await client.execute({
        sql: 'update users set is_banned = 1, ban_reason = ? where id = ?',
        args: [reason, userId],
    });

    // 2. Identify and blacklist documents
    // Check owner profile for cedula and rif
    const ownerRes = await client.execute({
        sql: 'select cedula, rif from owner_profile_extra where user_id = ?',
        args: [userId],
    });
    const owner = ownerRes.rows[0];
    if (owner) {
        if (owner.cedula) {
            await client.execute({
                sql: 'insert or replace into blacklisted_identities (type, value, user_id, reason, created_at) values (?, ?, ?, ?, ?)',
                args: ['cedula', owner.cedula, userId, reason, now],
            });
        }
        if (owner.rif) {
            await client.execute({
                sql: 'insert or replace into blacklisted_identities (type, value, user_id, reason, created_at) values (?, ?, ?, ?, ?)',
                args: ['rif', owner.rif, userId, reason, now],
            });
        }
    }

    // Check caregiver bank for RIF if not found in owner_profile
    const bankRes = await client.execute({
        sql: 'select rif from caregiver_bank where user_id = ?',
        args: [userId],
    });
    const bank = bankRes.rows[0];
    if (bank && bank.rif) {
        await client.execute({
            sql: 'insert or replace into blacklisted_identities (type, value, user_id, reason, created_at) values (?, ?, ?, ?, ?)',
            args: ['rif', bank.rif, userId, reason, now],
        });
    }

    return { ok: true };
};

export const unbanUser = async (userId: string) => {
    const client = getTursoClient();

    // 1. Remove ban status
    await client.execute({
        sql: 'update users set is_banned = 0, ban_reason = null where id = ?',
        args: [userId],
    });

    // 2. Remove from blacklist
    await client.execute({
        sql: 'delete from blacklisted_identities where user_id = ?',
        args: [userId],
    });

    return { ok: true };
};

export const getAdminUserDetail = async (userId: string, role: string): Promise<AdminUserDetail | null> => {
    await ensureCaregiverSchema();
    await ensureOwnerSchema();
    const client = getTursoClient();

    // 1. Basic User Data
    const userRes = await client.execute({ sql: 'select * from users where id = ?', args: [userId] });
    if (!userRes.rows.length) return null;
    const user = userRes.rows[0];

    // 2. Role Specific Profile
    let fullProfile: any = null;
    let bank: AdminUserRecord['bank'] | undefined;
    let name = 'Usuario';
    let verifiedLabel = 'No verificado';
    let isVerified = false;

    if (role === 'owner') {
        const profileRes = await client.execute({ sql: 'select * from owner_profile_extra where user_id = ?', args: [userId] });
        if (profileRes.rows[0]) {
            const row = profileRes.rows[0];
            name = (row.full_name as string) || 'Dueño';
            isVerified = Boolean(row.is_verified);
            verifiedLabel = isVerified ? 'Verificado' : 'No verificado';
            fullProfile = {
                userId: row.user_id,
                fullName: row.full_name,
                email: row.email,
                primaryPhone: row.primary_phone,
                alternativePhone: row.alternative_phone,
                cedula: row.cedula,
                address: row.address,
                zone: row.zone,
                biometricSelfie: row.biometric_selfie,
                profilePhoto: row.profile_photo,
                displayName: row.display_name,
                bio: row.bio,
                photoWithPet: row.photo_with_pet,
                isVerified: Boolean(row.is_verified),
                rating: Number(row.rating),
                totalReviews: Number(row.total_reviews),
                completeness: Number(row.completeness),
            };
        }
    } else {
        const profileRes = await client.execute({ sql: 'select * from caregiver_profiles where user_id = ?', args: [userId] });
        if (profileRes.rows[0]) {
            const row = profileRes.rows[0];
            name = (row.name as string) || 'Cuidador';
            isVerified = Boolean(row.verified);
            verifiedLabel = (row.verified_label as string) || (isVerified ? 'Verificado' : 'No verificado');

            // Parse JSON fields for caregiver
            try {
                if (typeof row.accepts === 'string') row.accepts = JSON.parse(row.accepts);
                if (typeof row.sizes === 'string') row.sizes = JSON.parse(row.sizes);
                if (typeof row.services === 'string') row.services = JSON.parse(row.services);
                if (typeof row.availability === 'string') row.availability = JSON.parse(row.availability);
                if (typeof row.photos === 'string') row.photos = JSON.parse(row.photos);
                if (typeof row.reviews === 'string') row.reviews = JSON.parse(row.reviews);
            } catch (e) {
                console.error('Error parsing caregiver JSON fields', e);
            }

            // Create a copy to allow modification and type casting
            fullProfile = { ...row };

            // Ensure defaults
            fullProfile.accepts = fullProfile.accepts || [];
            fullProfile.sizes = fullProfile.sizes || [];
            fullProfile.services = fullProfile.services || {};
            fullProfile.availability = fullProfile.availability || {};
            fullProfile.photos = fullProfile.photos || [];
            fullProfile.reviews = fullProfile.reviews || [];
        }

        const bankRes = await client.execute({ sql: 'select * from caregiver_bank where user_id = ?', args: [userId] });
        if (bankRes.rows[0]) {
            bank = {
                bankName: bankRes.rows[0].bank_name as string,
                titular: bankRes.rows[0].titular as string,
                rif: bankRes.rows[0].rif as string,
                paymobile: bankRes.rows[0].paymobile as string,
                verified: Boolean(bankRes.rows[0].verified),
            };
        }
    }

    // 3. Documents (Common)
    const docsRes = await client.execute({ sql: 'select * from owner_documents where user_id = ?', args: [userId] });
    const docs = docsRes.rows[0] as any || {};
    const documents = {
        cedulaFront: docs.cedula_front,
        cedulaBack: docs.cedula_back,
        rifDoc: docs.rif_doc,
        bankSupport: docs.bank_support,
        petVaccine: docs.pet_vaccine,
    };

    // 4. Extras (Pets, Emergency, Refs)
    const emergencyRes = await client.execute({ sql: 'select * from owner_emergency where user_id = ?', args: [userId] });
    const emergency = emergencyRes.rows[0] ? {
        name: emergencyRes.rows[0].nombre as string,
        relation: emergencyRes.rows[0].relacion as string,
        phone: emergencyRes.rows[0].telefono as string,
        address: emergencyRes.rows[0].direccion as string,
    } : undefined;

    const refsRes = await client.execute({ sql: 'select * from owner_refs where user_id = ?', args: [userId] });
    const references = refsRes.rows.map((r: any) => ({
        name: r.nombre as string,
        relation: r.relacion as string,
        phone: r.telefono as string,
        type: r.kind as 'personal' | 'familiar',
    }));

    const petsRes = await client.execute({ sql: 'select * from owner_pet_profiles where owner_id = ?', args: [userId] });
    const pets = petsRes.rows.map((r: any) => ({
        id: r.id as string,
        ownerId: r.owner_id as string,
        name: r.name as string,
        species: r.species as string,
        breed: r.breed as string,
        photo: r.photo as string,
        age: Number(r.age),
        sex: r.sex as string,
        weight: Number(r.weight),
        size: r.size as string,
        behavior: (r.behavior as string ? (r.behavior as string).split(',') : []),
        medicalConditions: r.medical_conditions as string,
        allergies: r.allergies as string,
        vaccinationCard: r.vaccination_card as string,
        hasIdTag: Boolean(r.has_id_tag),
        active: Boolean(r.active),
    }));

    return {
        userId,
        email: user.email as string,
        name,
        role: role as 'owner' | 'caregiver',
        isVerified,
        verifiedLabel,
        isBanned: Boolean(user.is_banned ?? 0),
        createdAt: user.created_at as string,
        documents,
        bank,
        fullProfile,
        pets,
        emergency,
        references,
    };
};

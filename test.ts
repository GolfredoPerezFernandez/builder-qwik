import { getTursoClient } from './src/lib/turso';

async function main() {
    const client = getTursoClient();
    const res = await client.execute('SELECT id, status, caregiver_id, owner_id, date_from, date_to, pet_id FROM bookings');
    console.log(JSON.stringify(res.rows, null, 2));
}

main().catch(console.error);

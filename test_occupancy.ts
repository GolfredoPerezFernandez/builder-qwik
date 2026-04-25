import 'dotenv/config';
import { getTursoClient } from './src/lib/turso.ts';
import { getCaregiverOccupiedDates } from './src/lib/services.ts';
import fs from 'fs';

async function main() {
    const client = getTursoClient();

    const res = await client.execute(`
    select caregiver_id from bookings
    where status in ('requested', 'accepted', 'paid', 'payment_sent', 'payment_confirmed', 'fee_submitted', 'active', 'in_progress')
    limit 1
  `);

    if (res.rows.length === 0) {
        console.log("No active bookings found");
        return;
    }

    const caregiverId = res.rows[0].caregiver_id as string;
    console.log("Testing caregiverId:", caregiverId);

    const occupiedDates = await getCaregiverOccupiedDates(caregiverId, 1);
    console.log("Occupied Dates (petLimit=1):", occupiedDates);

    const futureDateObj = new Date(new Date().setMonth(new Date().getMonth() + 6));
    const futureDateStr = futureDateObj.toISOString().slice(0, 10);
    const nowDate = '2026-02-01'; // override for testing visibility 

    const bookingsRes = await client.execute({
        sql: `select id, date_from, date_to, pet_id, status from bookings
      where caregiver_id = ?
        and status in ('requested', 'accepted', 'paid', 'payment_sent', 'payment_confirmed', 'fee_submitted', 'active', 'in_progress')
        and date_to >= ?
        and date_from <= ?`,
        args: [caregiverId, nowDate, futureDateStr],
    });

    fs.writeFileSync('test_occupancy_result.json', JSON.stringify({
        caregiverId,
        occupiedDatesLimit1: occupiedDates,
        rawBookings: bookingsRes.rows
    }, null, 2));
}

main().catch(console.error);

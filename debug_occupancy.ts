import { createClient } from '@libsql/client';

const client = createClient({
    url: 'libsql://db-acupatas-golfredo.aws-us-east-1.turso.io',
    authToken: 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NjczNzY3NzYsImlkIjoiNmZiNGVmYjEtNDA1MC00NjEzLTkzNmUtNjUxODlkOTEwZGM1IiwicmlkIjoiNTE2YjIwMTktMjBkOC00NzUxLTk3MTgtYzJmZGJkMmFhZWNkIn0.KVxIcMVOOM6ZE3lC-zjcwhPzvLC-5acdpwZkdUFa46H64Hu0zi__U37Xpm_hZI_gWxb7Q1q4duIhiyUdYaQcCw',
});

async function main() {
    const caregiverId = 'usr_3f27c3cb-b838-4359-85af-0583658b82fb';
    const targetDate = '2026-02-27';

    console.log('Querying bookings for caregiver:', caregiverId, 'on date:', targetDate);

    const res = await client.execute({
        sql: `SELECT id, owner_id, status, date_from, date_to, pet_id FROM bookings 
          WHERE caregiver_id = ? 
          AND date_from <= ? 
          AND date_to >= ?`,
        args: [caregiverId, targetDate, targetDate]
    });

    console.log('Active bookings overlapping with 2026-02-27:');
    console.log(JSON.stringify(res.rows, null, 2));

    const profile = await client.execute({
        sql: 'SELECT pet_limit FROM caregiver_profiles WHERE user_id = ?',
        args: [caregiverId]
    });
    console.log('Caregiver pet_limit:', profile.rows[0]?.pet_limit);
}

main().catch(console.error);

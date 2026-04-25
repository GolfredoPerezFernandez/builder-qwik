import { createClient } from '@libsql/client';

const client = createClient({
    url: 'file:local.db',
});

async function main() {
    const result = await client.execute('SELECT * FROM service_requests ORDER BY created_at DESC LIMIT 2');
    console.log('Service Requests:', JSON.stringify(result.rows, null, 2));
    const bookings = await client.execute('SELECT * FROM bookings ORDER BY created_at DESC LIMIT 2');
    console.log('Bookings:', JSON.stringify(bookings.rows, null, 2));
    const chats = await client.execute('SELECT * FROM chats ORDER BY updated_at DESC LIMIT 2');
    console.log('Chats:', JSON.stringify(chats.rows, null, 2));
}

main().catch(console.error);

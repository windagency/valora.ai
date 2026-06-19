import { connect } from 'nats';

export async function handleTelegramMessage(payload: string): Promise<void> {
	try {
		const nc = await connect({ servers: 'nats://localhost:4222' });
		nc.publish('telegram.out', new TextEncoder().encode(payload));
	} catch (e) {
		console.error('telegram handler error', e);
		throw new Error(String(e));
	}
}

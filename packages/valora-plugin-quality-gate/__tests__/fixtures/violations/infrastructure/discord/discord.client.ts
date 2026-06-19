import { connect } from 'nats';

export async function handleDiscordMessage(payload: string): Promise<void> {
	try {
		const nc = await connect({ servers: 'nats://localhost:4222' });
		nc.publish('discord.out', new TextEncoder().encode(payload));
	} catch (e) {
		console.error('discord handler error', e);
		throw new Error(String(e));
	}
}

import { connect } from 'nats';

export async function dispatchTtsRequest(text: string): Promise<void> {
	try {
		const nc = await connect({ servers: 'nats://localhost:4222' });
		nc.publish('tts.request', new TextEncoder().encode(text));
	} catch (e) {
		console.error('tts dispatch error', e);
		throw new Error(String(e));
	}
}

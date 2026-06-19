import { connect } from 'nats';

export async function dispatchLlmRequest(prompt: string): Promise<void> {
	try {
		const nc = await connect({ servers: 'nats://localhost:4222' });
		nc.publish('llm.request', new TextEncoder().encode(prompt));
	} catch (e) {
		console.error('llm dispatch error', e);
		throw new Error(String(e));
	}
}

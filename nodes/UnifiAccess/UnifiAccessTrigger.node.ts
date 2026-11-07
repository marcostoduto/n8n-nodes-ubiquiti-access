import { createHmac, timingSafeEqual } from 'crypto';

import type {
	IDataObject,
	IHookFunctions,
	INodeType,
	INodeTypeDescription,
	IWebhookFunctions,
	IWebhookResponseData,
} from 'n8n-workflow';

import { webhookEvents } from './descriptions';
import { CREDENTIAL_NAME, accessData, extractList, toStringList } from './GenericFunctions';

/**
 * Trigger basato sui webhook di UniFi Access (Access 2.2.10+).
 * All'attivazione del workflow registra l'URL di n8n in /webhooks/endpoints,
 * alla disattivazione lo elimina.
 */
export class UnifiAccessTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'UniFi Access Trigger',
		name: 'unifiAccessTrigger',
		icon: 'file:unifiaccess.svg',
		group: ['trigger'],
		version: 1,
		subtitle: '={{$parameter["events"].join(", ")}}',
		description: 'Avvia il workflow sugli eventi di UniFi Access (aperture porta, citofono, visitatori...)',
		defaults: { name: 'UniFi Access Trigger' },
		inputs: [],
		outputs: ['main'],
		credentials: [{ name: CREDENTIAL_NAME, required: true }],
		webhooks: [
			{
				name: 'default',
				httpMethod: 'POST',
				responseMode: 'onReceived',
				path: 'webhook',
			},
		],
		properties: [
			{
				displayName:
					'La console UniFi deve poter raggiungere l\'URL del webhook di n8n (Production URL dopo l\'attivazione del workflow).',
				name: 'notice',
				type: 'notice',
				default: '',
			},
			{
				displayName: 'Events',
				name: 'events',
				type: 'multiOptions',
				options: webhookEvents,
				required: true,
				default: ['access.door.unlock'],
			},
			{
				displayName: 'Options',
				name: 'options',
				type: 'collection',
				placeholder: 'Add Option',
				default: {},
				options: [
					{
						displayName: 'Additional Events',
						name: 'additionalEvents',
						type: 'string',
						default: '',
						placeholder: 'access.some.event,access.other.event',
						description: 'Altri nomi di evento non presenti nell\'elenco, separati da virgola',
					},
					{
						displayName: 'Webhook Name',
						name: 'webhookName',
						type: 'string',
						default: '',
						description: 'Nome mostrato in UniFi Access (default: "n8n - nome workflow")',
					},
					{
						displayName: 'Verify Signature',
						name: 'verifySignature',
						type: 'boolean',
						default: false,
						description:
							'Whether to reject requests whose "Signature" header (t=…,v1=HMAC-SHA256 of "t.body") does not match the secret returned when the webhook was created',
					},
				],
			},
		],
	};

	webhookMethods = {
		default: {
			async checkExists(this: IHookFunctions): Promise<boolean> {
				const staticData = this.getWorkflowStaticData('node');
				const url = this.getNodeWebhookUrl('default');
				const endpoints = extractList(await accessData.call(this, 'GET', '/webhooks/endpoints'));
				const existing = endpoints.find((e) => e.id === staticData.webhookId) ?? endpoints.find((e) => e.endpoint === url);
				if (!existing) {
					delete staticData.webhookId;
					return false;
				}

				const wanted = getEvents.call(this).sort().join(',');
				const current = toStringList(existing.events).sort().join(',');
				const options = this.getNodeParameter('options', {}) as IDataObject;
				const missingSecret = options.verifySignature === true && !staticData.webhookSecret && !existing.secret;

				if (existing.endpoint !== url || wanted !== current || missingSecret) {
					// configurazione cambiata: si ricrea il webhook
					await accessData.call(this, 'DELETE', `/webhooks/endpoints/${encodeURIComponent(String(existing.id))}`);
					delete staticData.webhookId;
					delete staticData.webhookSecret;
					return false;
				}

				staticData.webhookId = existing.id;
				if (existing.secret) staticData.webhookSecret = existing.secret;
				return true;
			},

			async create(this: IHookFunctions): Promise<boolean> {
				const staticData = this.getWorkflowStaticData('node');
				const options = this.getNodeParameter('options', {}) as IDataObject;
				const name = String(options.webhookName || `n8n - ${this.getWorkflow().name ?? this.getWorkflow().id}`);

				const data = (await accessData.call(this, 'POST', '/webhooks/endpoints', {}, {
					name,
					endpoint: this.getNodeWebhookUrl('default'),
					events: getEvents.call(this),
				})) as IDataObject;

				if (!data?.id) throw new Error(`UniFi Access non ha restituito l'ID del webhook: ${JSON.stringify(data)}`);
				staticData.webhookId = data.id;
				if (data.secret) staticData.webhookSecret = data.secret;
				return true;
			},

			async delete(this: IHookFunctions): Promise<boolean> {
				const staticData = this.getWorkflowStaticData('node');
				if (staticData.webhookId) {
					try {
						await accessData.call(this, 'DELETE', `/webhooks/endpoints/${encodeURIComponent(String(staticData.webhookId))}`);
					} catch {
						return false;
					}
				}
				delete staticData.webhookId;
				delete staticData.webhookSecret;
				return true;
			},
		},
	};

	async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
		const options = this.getNodeParameter('options', {}) as IDataObject;
		const req = this.getRequestObject() as any;

		if (options.verifySignature === true) {
			const secret = String(this.getWorkflowStaticData('node').webhookSecret ?? '');
			const raw: string = req.rawBody ? req.rawBody.toString('utf8') : JSON.stringify(req.body ?? {});
			if (!verifySignature(String(this.getHeaderData().signature ?? ''), raw, secret)) {
				const res = this.getResponseObject();
				res.status(401).send('Invalid signature');
				return { noWebhookResponse: true };
			}
		}

		const body = this.getBodyData() as IDataObject;
		const events = getEvents.call(this);
		const event = typeof body.event === 'string' ? body.event : undefined;
		if (event && events.length && !events.includes(event)) {
			return {};
		}

		return { workflowData: [this.helpers.returnJsonArray([body])] };
	}
}

function getEvents(this: IHookFunctions | IWebhookFunctions): string[] {
	const events = toStringList(this.getNodeParameter('events', []));
	const options = this.getNodeParameter('options', {}) as IDataObject;
	return [...new Set([...events, ...toStringList(options.additionalEvents)])];
}

/** Header "t=<unix>,v1=<hex>": HMAC-SHA256(secret, "<t>.<raw body>"). */
export function verifySignature(header: string, rawBody: string, secret: string): boolean {
	if (!header || !secret) return false;
	const parts: Record<string, string[]> = {};
	for (const piece of header.split(',')) {
		const [k, ...rest] = piece.split('=');
		if (!k || !rest.length) continue;
		(parts[k.trim()] ??= []).push(rest.join('=').trim());
	}
	const t = parts.t?.[0];
	if (!t || !parts.v1?.length) return false;
	const expected = createHmac('sha256', secret).update(`${t}.${rawBody}`).digest('hex');
	return parts.v1.some((sig) => {
		const a = Buffer.from(sig);
		const b = Buffer.from(expected);
		return a.length === b.length && timingSafeEqual(a, b);
	});
}

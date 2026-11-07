"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UnifiAccessTrigger = void 0;
exports.verifySignature = verifySignature;
const crypto_1 = require("crypto");
const descriptions_1 = require("./descriptions");
const GenericFunctions_1 = require("./GenericFunctions");
/**
 * Trigger basato sui webhook di UniFi Access (Access 2.2.10+).
 * All'attivazione del workflow registra l'URL di n8n in /webhooks/endpoints,
 * alla disattivazione lo elimina.
 */
class UnifiAccessTrigger {
    constructor() {
        this.description = {
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
            credentials: [{ name: GenericFunctions_1.CREDENTIAL_NAME, required: true }],
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
                    displayName: 'La console UniFi deve poter raggiungere l\'URL del webhook di n8n (Production URL dopo l\'attivazione del workflow).',
                    name: 'notice',
                    type: 'notice',
                    default: '',
                },
                {
                    displayName: 'Events',
                    name: 'events',
                    type: 'multiOptions',
                    options: descriptions_1.webhookEvents,
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
                            description: 'Whether to reject requests whose "Signature" header (t=…,v1=HMAC-SHA256 of "t.body") does not match the secret returned when the webhook was created',
                        },
                    ],
                },
            ],
        };
        this.webhookMethods = {
            default: {
                async checkExists() {
                    const staticData = this.getWorkflowStaticData('node');
                    const url = this.getNodeWebhookUrl('default');
                    const endpoints = (0, GenericFunctions_1.extractList)(await GenericFunctions_1.accessData.call(this, 'GET', '/webhooks/endpoints'));
                    const existing = endpoints.find((e) => e.id === staticData.webhookId) ?? endpoints.find((e) => e.endpoint === url);
                    if (!existing) {
                        delete staticData.webhookId;
                        return false;
                    }
                    const wanted = getEvents.call(this).sort().join(',');
                    const current = (0, GenericFunctions_1.toStringList)(existing.events).sort().join(',');
                    const options = this.getNodeParameter('options', {});
                    const missingSecret = options.verifySignature === true && !staticData.webhookSecret && !existing.secret;
                    if (existing.endpoint !== url || wanted !== current || missingSecret) {
                        // configurazione cambiata: si ricrea il webhook
                        await GenericFunctions_1.accessData.call(this, 'DELETE', `/webhooks/endpoints/${encodeURIComponent(String(existing.id))}`);
                        delete staticData.webhookId;
                        delete staticData.webhookSecret;
                        return false;
                    }
                    staticData.webhookId = existing.id;
                    if (existing.secret)
                        staticData.webhookSecret = existing.secret;
                    return true;
                },
                async create() {
                    const staticData = this.getWorkflowStaticData('node');
                    const options = this.getNodeParameter('options', {});
                    const name = String(options.webhookName || `n8n - ${this.getWorkflow().name ?? this.getWorkflow().id}`);
                    const data = (await GenericFunctions_1.accessData.call(this, 'POST', '/webhooks/endpoints', {}, {
                        name,
                        endpoint: this.getNodeWebhookUrl('default'),
                        events: getEvents.call(this),
                    }));
                    if (!data?.id)
                        throw new Error(`UniFi Access non ha restituito l'ID del webhook: ${JSON.stringify(data)}`);
                    staticData.webhookId = data.id;
                    if (data.secret)
                        staticData.webhookSecret = data.secret;
                    return true;
                },
                async delete() {
                    const staticData = this.getWorkflowStaticData('node');
                    if (staticData.webhookId) {
                        try {
                            await GenericFunctions_1.accessData.call(this, 'DELETE', `/webhooks/endpoints/${encodeURIComponent(String(staticData.webhookId))}`);
                        }
                        catch {
                            return false;
                        }
                    }
                    delete staticData.webhookId;
                    delete staticData.webhookSecret;
                    return true;
                },
            },
        };
    }
    async webhook() {
        const options = this.getNodeParameter('options', {});
        const req = this.getRequestObject();
        if (options.verifySignature === true) {
            const secret = String(this.getWorkflowStaticData('node').webhookSecret ?? '');
            const raw = req.rawBody ? req.rawBody.toString('utf8') : JSON.stringify(req.body ?? {});
            if (!verifySignature(String(this.getHeaderData().signature ?? ''), raw, secret)) {
                const res = this.getResponseObject();
                res.status(401).send('Invalid signature');
                return { noWebhookResponse: true };
            }
        }
        const body = this.getBodyData();
        const events = getEvents.call(this);
        const event = typeof body.event === 'string' ? body.event : undefined;
        if (event && events.length && !events.includes(event)) {
            return {};
        }
        return { workflowData: [this.helpers.returnJsonArray([body])] };
    }
}
exports.UnifiAccessTrigger = UnifiAccessTrigger;
function getEvents() {
    const events = (0, GenericFunctions_1.toStringList)(this.getNodeParameter('events', []));
    const options = this.getNodeParameter('options', {});
    return [...new Set([...events, ...(0, GenericFunctions_1.toStringList)(options.additionalEvents)])];
}
/** Header "t=<unix>,v1=<hex>": HMAC-SHA256(secret, "<t>.<raw body>"). */
function verifySignature(header, rawBody, secret) {
    if (!header || !secret)
        return false;
    const parts = {};
    for (const piece of header.split(',')) {
        const [k, ...rest] = piece.split('=');
        if (!k || !rest.length)
            continue;
        (parts[k.trim()] ??= []).push(rest.join('=').trim());
    }
    const t = parts.t?.[0];
    if (!t || !parts.v1?.length)
        return false;
    const expected = (0, crypto_1.createHmac)('sha256', secret).update(`${t}.${rawBody}`).digest('hex');
    return parts.v1.some((sig) => {
        const a = Buffer.from(sig);
        const b = Buffer.from(expected);
        return a.length === b.length && (0, crypto_1.timingSafeEqual)(a, b);
    });
}

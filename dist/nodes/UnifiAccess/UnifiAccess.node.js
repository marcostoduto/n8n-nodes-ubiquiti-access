"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UnifiAccess = void 0;
const descriptions_1 = require("./descriptions");
const GenericFunctions_1 = require("./GenericFunctions");
class UnifiAccess {
    constructor() {
        this.description = {
            displayName: 'UniFi Access',
            name: 'unifiAccess',
            icon: 'file:unifiaccess.svg',
            group: ['transform'],
            version: 1,
            subtitle: '={{$parameter["resource"] === "custom" ? $parameter["method"] + " " + $parameter["endpoint"] : $parameter["operation"] + ": " + $parameter["resource"]}}',
            description: 'Gestisce UniFi Access (Ubiquiti): porte, utenti, visitatori, credenziali, policy, log e webhook',
            defaults: { name: 'UniFi Access' },
            inputs: ['main'],
            outputs: ['main'],
            credentials: [{ name: GenericFunctions_1.CREDENTIAL_NAME, required: true }],
            properties: descriptions_1.nodeProperties,
        };
        this.methods = {
            loadOptions: {
                async getDoors() {
                    const doors = (0, GenericFunctions_1.extractList)(await GenericFunctions_1.accessData.call(this, 'GET', '/doors'));
                    return toOptions(doors, (d) => String(d.full_name ?? d.name ?? d.id));
                },
                async getDevices() {
                    const devices = (0, GenericFunctions_1.extractList)(await GenericFunctions_1.accessData.call(this, 'GET', '/devices'));
                    return toOptions(devices, (d) => `${String(d.alias || d.name || d.id)}${d.type ? ` (${String(d.type)})` : ''}`);
                },
                async getAccessPolicies() {
                    const policies = (0, GenericFunctions_1.extractList)(await GenericFunctions_1.accessData.call(this, 'GET', '/access_policies'));
                    return toOptions(policies, (p) => String(p.name ?? p.id));
                },
                async getSchedules() {
                    const schedules = (0, GenericFunctions_1.extractList)(await GenericFunctions_1.accessData.call(this, 'GET', '/access_policies/schedules'));
                    return toOptions(schedules, (s) => String(s.name ?? s.id));
                },
            },
        };
    }
    async execute() {
        const items = this.getInputData();
        const returnData = [];
        for (let i = 0; i < items.length; i++) {
            try {
                const resource = this.getNodeParameter('resource', i);
                const results = await runOperation.call(this, resource, i);
                for (const json of results) {
                    returnData.push({ json, pairedItem: { item: i } });
                }
            }
            catch (error) {
                if (this.continueOnFail()) {
                    const json = { error: error.message };
                    if (error instanceof GenericFunctions_1.UnifiAccessError)
                        json.code = error.code;
                    returnData.push({ json, pairedItem: { item: i } });
                    continue;
                }
                throw error;
            }
        }
        return [returnData];
    }
}
exports.UnifiAccess = UnifiAccess;
// ---------------------------------------------------------------------- helpers
function toOptions(list, label) {
    return list
        .filter((o) => o.id !== undefined)
        .map((o) => ({ name: label(o), value: String(o.id) }))
        .sort((a, b) => a.name.localeCompare(b.name));
}
/** Normalizza "data" in una lista di oggetti per l'output. */
function asItems(data, fallback = { success: true }) {
    if (data === undefined || data === null || data === '')
        return [fallback];
    if (Array.isArray(data))
        return (0, GenericFunctions_1.extractList)(data);
    if (typeof data !== 'object')
        return [{ ...fallback, data }];
    return [data];
}
/** Copia i campi di una collection nel body, convertendo date e JSON. */
function collectionToBody(fields, dateFields = [], jsonFields = []) {
    const body = {};
    for (const [key, value] of Object.entries(fields)) {
        if (value === '' || value === undefined || value === null)
            continue;
        if (dateFields.includes(key))
            body[key] = (0, GenericFunctions_1.toUnix)(value);
        else if (jsonFields.includes(key))
            body[key] = (0, GenericFunctions_1.parseJson)(value, key, undefined);
        else
            body[key] = value;
    }
    return body;
}
async function getLimit(i) {
    const returnAll = this.getNodeParameter('returnAll', i, false);
    return returnAll ? 0 : this.getNodeParameter('limit', i, 50);
}
const enc = (v) => encodeURIComponent(String(v).trim());
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// ---------------------------------------------------------------------- operations
async function runOperation(resource, i) {
    if (resource === 'custom')
        return customRequest.call(this, i);
    const operation = this.getNodeParameter('operation', i);
    const handler = handlers[resource];
    if (!handler)
        throw new Error(`Risorsa non supportata: ${resource}`);
    return handler.call(this, operation, i);
}
const handlers = {
    // ------------------------------------------------------------------ door
    async door(operation, i) {
        if (operation === 'getAll')
            return (0, GenericFunctions_1.extractList)(await GenericFunctions_1.accessData.call(this, 'GET', '/doors'));
        if (operation === 'getEmergency')
            return asItems(await GenericFunctions_1.accessData.call(this, 'GET', '/doors/settings/emergency'));
        if (operation === 'setEmergency') {
            const body = {
                lockdown: this.getNodeParameter('lockdown', i),
                evacuation: this.getNodeParameter('evacuation', i),
            };
            await GenericFunctions_1.accessData.call(this, 'PUT', '/doors/settings/emergency', {}, body);
            return [{ success: true, ...body }];
        }
        const doorId = enc(this.getNodeParameter('doorId', i));
        if (operation === 'get')
            return asItems(await GenericFunctions_1.accessData.call(this, 'GET', `/doors/${doorId}`));
        if (operation === 'getLockRule')
            return asItems(await GenericFunctions_1.accessData.call(this, 'GET', `/doors/${doorId}/lock_rule`));
        if (operation === 'unlock') {
            const opts = this.getNodeParameter('unlockOptions', i, {});
            const body = collectionToBody(opts, [], ['extra']);
            if (body.extra && !Object.keys(body.extra).length)
                delete body.extra;
            if ((body.actor_id && !body.actor_name) || (!body.actor_id && body.actor_name)) {
                throw new Error('Actor ID e Actor Name vanno indicati insieme');
            }
            await GenericFunctions_1.accessData.call(this, 'PUT', `/doors/${doorId}/unlock`, {}, body);
            return [{ success: true, door_id: decodeURIComponent(doorId), action: 'unlock' }];
        }
        if (operation === 'setLockRule') {
            const type = this.getNodeParameter('lockRuleType', i);
            const body = { type };
            if (type === 'custom')
                body.interval = this.getNodeParameter('interval', i);
            await GenericFunctions_1.accessData.call(this, 'PUT', `/doors/${doorId}/lock_rule`, {}, body);
            return [{ success: true, door_id: decodeURIComponent(doorId), ...body }];
        }
        throw new Error(`Operazione non supportata: ${operation}`);
    },
    // ------------------------------------------------------------------ door group
    async doorGroup(operation, i) {
        if (operation === 'getTopology')
            return (0, GenericFunctions_1.extractList)(await GenericFunctions_1.accessData.call(this, 'GET', '/door_groups/topology'));
        if (operation === 'getAll')
            return (0, GenericFunctions_1.extractList)(await GenericFunctions_1.accessData.call(this, 'GET', '/door_groups'));
        if (operation === 'create' || operation === 'update') {
            const name = this.getNodeParameter('groupName', i, '').trim();
            const doors = (0, GenericFunctions_1.toStringList)(this.getNodeParameter('doorIds', i, []));
            const body = {};
            if (name)
                body.group_name = name;
            if (doors.length)
                body.resources = doors;
            if (operation === 'create') {
                if (!name)
                    throw new Error('Il nome del gruppo è obbligatorio');
                return asItems(await GenericFunctions_1.accessData.call(this, 'POST', '/door_groups', {}, body));
            }
            const id = enc(this.getNodeParameter('doorGroupId', i));
            return asItems(await GenericFunctions_1.accessData.call(this, 'PUT', `/door_groups/${id}`, {}, body));
        }
        const id = enc(this.getNodeParameter('doorGroupId', i));
        if (operation === 'get')
            return asItems(await GenericFunctions_1.accessData.call(this, 'GET', `/door_groups/${id}`));
        if (operation === 'delete') {
            await GenericFunctions_1.accessData.call(this, 'DELETE', `/door_groups/${id}`);
            return [{ success: true, id: decodeURIComponent(id) }];
        }
        throw new Error(`Operazione non supportata: ${operation}`);
    },
    // ------------------------------------------------------------------ user
    async user(operation, i) {
        if (operation === 'create') {
            const extra = this.getNodeParameter('additionalFields', i, {});
            const body = {
                first_name: this.getNodeParameter('firstName', i),
                last_name: this.getNodeParameter('lastName', i),
                ...collectionToBody(extra, ['onboard_time']),
            };
            return asItems(await GenericFunctions_1.accessData.call(this, 'POST', '/users', {}, body));
        }
        if (operation === 'getAll') {
            const qs = {};
            if (this.getNodeParameter('includeAccessPolicies', i, false))
                qs['expand[]'] = 'access_policy';
            return GenericFunctions_1.accessGetAll.call(this, 'GET', '/users', qs, await getLimit.call(this, i));
        }
        if (operation === 'search') {
            const filters = this.getNodeParameter('searchFilters', i, {});
            const qs = {};
            const keyword = this.getNodeParameter('keyword', i, '').trim();
            if (keyword)
                qs.keyword = keyword;
            if (filters.only_admin)
                qs.only_admin = true;
            const status = (0, GenericFunctions_1.toStringList)(filters.status);
            if (status.length)
                qs.status = status.join(',');
            return GenericFunctions_1.accessGetAll.call(this, 'GET', '/users/search', qs, await getLimit.call(this, i));
        }
        const userId = enc(this.getNodeParameter('userId', i));
        const base = `/users/${userId}`;
        const ok = (extra = {}) => [{ success: true, user_id: decodeURIComponent(userId), ...extra }];
        switch (operation) {
            case 'get': {
                const qs = {};
                if (this.getNodeParameter('includeAccessPolicies', i, false))
                    qs['expand[]'] = 'access_policy';
                return asItems(await GenericFunctions_1.accessData.call(this, 'GET', base, qs));
            }
            case 'update': {
                const fields = this.getNodeParameter('updateFields', i, {});
                const body = collectionToBody(fields, ['onboard_time']);
                if (!Object.keys(body).length)
                    throw new Error('Nessun campo da aggiornare');
                await GenericFunctions_1.accessData.call(this, 'PUT', base, {}, body);
                return ok(body);
            }
            case 'delete':
                await GenericFunctions_1.accessData.call(this, 'DELETE', base);
                return ok();
            case 'getAccessPolicies': {
                const qs = {};
                if (this.getNodeParameter('onlyUserPolicies', i, false))
                    qs.only_user_policies = true;
                return (0, GenericFunctions_1.extractList)(await GenericFunctions_1.accessData.call(this, 'GET', `${base}/access_policies`, qs));
            }
            case 'setAccessPolicies': {
                const ids = (0, GenericFunctions_1.toStringList)(this.getNodeParameter('accessPolicyIds', i, []));
                await GenericFunctions_1.accessData.call(this, 'PUT', `${base}/access_policies`, {}, { access_policy_ids: ids });
                return ok({ access_policy_ids: ids });
            }
            default:
                return credentialAssignment.call(this, operation, i, base, ok);
        }
    },
    // ------------------------------------------------------------------ user group
    async userGroup(operation, i) {
        if (operation === 'getAll')
            return (0, GenericFunctions_1.extractList)(await GenericFunctions_1.accessData.call(this, 'GET', '/user_groups'));
        const groupBody = () => {
            const body = { name: this.getNodeParameter('name', i) };
            const upId = this.getNodeParameter('upId', i, '').trim();
            if (upId)
                body.up_id = upId;
            return body;
        };
        if (operation === 'create')
            return asItems(await GenericFunctions_1.accessData.call(this, 'POST', '/user_groups', {}, groupBody()));
        const id = enc(this.getNodeParameter('userGroupId', i));
        const base = `/user_groups/${id}`;
        const ok = (extra = {}) => [{ success: true, user_group_id: decodeURIComponent(id), ...extra }];
        switch (operation) {
            case 'get':
                return asItems(await GenericFunctions_1.accessData.call(this, 'GET', base));
            case 'update':
                return asItems(await GenericFunctions_1.accessData.call(this, 'PUT', base, {}, groupBody()), ok()[0]);
            case 'delete':
                await GenericFunctions_1.accessData.call(this, 'DELETE', base);
                return ok();
            case 'addUsers':
            case 'removeUsers': {
                const userIds = (0, GenericFunctions_1.toStringList)(this.getNodeParameter('userIds', i));
                if (!userIds.length)
                    throw new Error('Indica almeno un User ID');
                const path = operation === 'addUsers' ? `${base}/users` : `${base}/users/delete`;
                await GenericFunctions_1.accessData.call(this, 'POST', path, {}, userIds);
                return ok({ user_ids: userIds });
            }
            case 'getMembers': {
                const all = this.getNodeParameter('includeSubgroups', i, false);
                return (0, GenericFunctions_1.extractList)(await GenericFunctions_1.accessData.call(this, 'GET', all ? `${base}/users/all` : `${base}/users`));
            }
            case 'getAccessPolicies':
                return (0, GenericFunctions_1.extractList)(await GenericFunctions_1.accessData.call(this, 'GET', `${base}/access_policies`));
            case 'setAccessPolicies': {
                const ids = (0, GenericFunctions_1.toStringList)(this.getNodeParameter('accessPolicyIds', i, []));
                await GenericFunctions_1.accessData.call(this, 'PUT', `${base}/access_policies`, {}, { access_policy_ids: ids });
                return ok({ access_policy_ids: ids });
            }
        }
        throw new Error(`Operazione non supportata: ${operation}`);
    },
    // ------------------------------------------------------------------ visitor
    async visitor(operation, i) {
        const dates = ['start_time', 'end_time'];
        const json = ['resources', 'week_schedule'];
        if (operation === 'create') {
            const extra = this.getNodeParameter('additionalFields', i, {});
            const body = {
                first_name: this.getNodeParameter('firstName', i),
                last_name: this.getNodeParameter('lastName', i),
                visit_reason: this.getNodeParameter('visitReason', i),
                start_time: (0, GenericFunctions_1.toUnix)(this.getNodeParameter('startTime', i)),
                end_time: (0, GenericFunctions_1.toUnix)(this.getNodeParameter('endTime', i)),
                ...collectionToBody(extra, dates, json),
            };
            if (body.end_time <= body.start_time) {
                throw new Error('End Time deve essere successivo a Start Time');
            }
            return asItems(await GenericFunctions_1.accessData.call(this, 'POST', '/visitors', {}, body));
        }
        if (operation === 'getAll') {
            const filters = this.getNodeParameter('visitorFilters', i, {});
            const qs = {};
            if (filters.keyword)
                qs.keyword = filters.keyword;
            if (filters.status !== undefined && filters.status !== '')
                qs.status = filters.status;
            const expand = (0, GenericFunctions_1.toStringList)(filters.expand);
            if (expand.length)
                qs['expand[]'] = expand.join(',');
            return GenericFunctions_1.accessGetAll.call(this, 'GET', '/visitors', qs, await getLimit.call(this, i));
        }
        const id = enc(this.getNodeParameter('visitorId', i));
        const base = `/visitors/${id}`;
        const ok = (extra = {}) => [{ success: true, visitor_id: decodeURIComponent(id), ...extra }];
        switch (operation) {
            case 'get':
                return asItems(await GenericFunctions_1.accessData.call(this, 'GET', base));
            case 'update': {
                const fields = this.getNodeParameter('updateFields', i, {});
                const body = collectionToBody(fields, dates, json);
                if (!Object.keys(body).length)
                    throw new Error('Nessun campo da aggiornare');
                return asItems(await GenericFunctions_1.accessData.call(this, 'PUT', base, {}, body), ok()[0]);
            }
            case 'delete': {
                const isForce = this.getNodeParameter('isForce', i, false);
                await GenericFunctions_1.accessData.call(this, 'DELETE', base, isForce ? { is_force: true } : {});
                return ok({ deleted: isForce, canceled: !isForce });
            }
            default:
                return credentialAssignment.call(this, operation, i, base, ok);
        }
    },
    // ------------------------------------------------------------------ access policy
    async accessPolicy(operation, i) {
        if (operation === 'getAll')
            return (0, GenericFunctions_1.extractList)(await GenericFunctions_1.accessData.call(this, 'GET', '/access_policies'));
        if (operation === 'create') {
            const body = {
                name: this.getNodeParameter('name', i),
                schedule_id: this.getNodeParameter('scheduleId', i),
                resources: (0, GenericFunctions_1.parseJson)(this.getNodeParameter('resources', i, '[]'), 'Resources', []),
            };
            return asItems(await GenericFunctions_1.accessData.call(this, 'POST', '/access_policies', {}, body));
        }
        const id = enc(this.getNodeParameter('accessPolicyId', i));
        if (operation === 'get')
            return asItems(await GenericFunctions_1.accessData.call(this, 'GET', `/access_policies/${id}`));
        if (operation === 'update') {
            const body = (0, GenericFunctions_1.parseJson)(this.getNodeParameter('updateJson', i), 'Fields to Update', {});
            return asItems(await GenericFunctions_1.accessData.call(this, 'PUT', `/access_policies/${id}`, {}, body), { success: true, id: decodeURIComponent(id) });
        }
        if (operation === 'delete') {
            await GenericFunctions_1.accessData.call(this, 'DELETE', `/access_policies/${id}`);
            return [{ success: true, id: decodeURIComponent(id) }];
        }
        throw new Error(`Operazione non supportata: ${operation}`);
    },
    // ------------------------------------------------------------------ schedule
    async schedule(operation, i) {
        if (operation === 'getAll')
            return (0, GenericFunctions_1.extractList)(await GenericFunctions_1.accessData.call(this, 'GET', '/access_policies/schedules'));
        const id = enc(this.getNodeParameter('scheduleId', i));
        return asItems(await GenericFunctions_1.accessData.call(this, 'GET', `/access_policies/schedules/${id}`));
    },
    // ------------------------------------------------------------------ credential
    async credential(operation, i) {
        switch (operation) {
            case 'generatePin': {
                const data = await GenericFunctions_1.accessData.call(this, 'POST', '/credentials/pin_codes');
                return [typeof data === 'object' && data !== null ? data : { pin_code: data }];
            }
            case 'startNfcEnrollment': {
                const body = {
                    device_id: String(this.getNodeParameter('deviceId', i)),
                    reset_ua_card: this.getNodeParameter('resetUaCard', i, false),
                };
                const data = (await GenericFunctions_1.accessData.call(this, 'POST', '/credentials/nfc_cards/sessions', {}, body));
                if (!this.getNodeParameter('waitForCard', i, false))
                    return asItems(data);
                const sessionId = String(data?.session_id ?? data?.id ?? '');
                if (!sessionId)
                    throw new Error(`Sessione NFC senza session_id: ${JSON.stringify(data)}`);
                return [await waitForCard.call(this, sessionId, i)];
            }
            case 'getNfcEnrollment': {
                const sessionId = String(this.getNodeParameter('sessionId', i)).trim();
                if (this.getNodeParameter('waitForCard', i, false))
                    return [await waitForCard.call(this, sessionId, i)];
                return asItems(await GenericFunctions_1.accessData.call(this, 'GET', `/credentials/nfc_cards/sessions/${enc(sessionId)}`));
            }
            case 'cancelNfcEnrollment': {
                const sessionId = enc(this.getNodeParameter('sessionId', i));
                await GenericFunctions_1.accessData.call(this, 'DELETE', `/credentials/nfc_cards/sessions/${sessionId}`);
                return [{ success: true, session_id: decodeURIComponent(sessionId) }];
            }
            case 'getAllNfcCards':
                return GenericFunctions_1.accessGetAll.call(this, 'GET', '/credentials/nfc_cards/tokens', {}, await getLimit.call(this, i));
            case 'getNfcCard': {
                const token = enc(this.getNodeParameter('nfcToken', i));
                return asItems(await GenericFunctions_1.accessData.call(this, 'GET', `/credentials/nfc_cards/tokens/${token}`));
            }
            case 'deleteNfcCard': {
                const token = enc(this.getNodeParameter('nfcToken', i));
                await GenericFunctions_1.accessData.call(this, 'DELETE', `/credentials/nfc_cards/tokens/${token}`);
                return [{ success: true, token: decodeURIComponent(token) }];
            }
        }
        throw new Error(`Operazione non supportata: ${operation}`);
    },
    // ------------------------------------------------------------------ device
    async device(operation, i) {
        if (operation === 'getAll')
            return (0, GenericFunctions_1.extractList)(await GenericFunctions_1.accessData.call(this, 'GET', '/devices'));
        const id = enc(this.getNodeParameter('deviceId', i));
        if (operation === 'getSettings')
            return asItems(await GenericFunctions_1.accessData.call(this, 'GET', `/devices/${id}/settings`));
        if (operation === 'updateSettings') {
            const body = (0, GenericFunctions_1.parseJson)(this.getNodeParameter('settingsJson', i), 'Settings', {});
            return asItems(await GenericFunctions_1.accessData.call(this, 'PUT', `/devices/${id}/settings`, {}, body), { success: true, device_id: decodeURIComponent(id) });
        }
        throw new Error(`Operazione non supportata: ${operation}`);
    },
    // ------------------------------------------------------------------ system log
    async systemLog(_operation, i) {
        const filters = this.getNodeParameter('logFilters', i, {});
        const body = {
            topic: this.getNodeParameter('topic', i),
            ...collectionToBody(filters, ['since', 'until']),
        };
        const hits = await GenericFunctions_1.accessGetAll.call(this, 'POST', '/system/logs', {}, await getLimit.call(this, i), body);
        if (!this.getNodeParameter('simplify', i, true))
            return hits;
        return hits.map((h) => ({
            id: h._id,
            timestamp: h['@timestamp'],
            ...(h._source ?? {}),
            tag: h.tag,
        }));
    },
    // ------------------------------------------------------------------ webhook
    async webhook(operation, i) {
        if (operation === 'getAll')
            return (0, GenericFunctions_1.extractList)(await GenericFunctions_1.accessData.call(this, 'GET', '/webhooks/endpoints'));
        if (operation === 'delete') {
            const id = enc(this.getNodeParameter('webhookId', i));
            await GenericFunctions_1.accessData.call(this, 'DELETE', `/webhooks/endpoints/${id}`);
            return [{ success: true, id: decodeURIComponent(id) }];
        }
        const body = {};
        const name = this.getNodeParameter('name', i, '').trim();
        const endpoint = this.getNodeParameter('endpoint', i, '').trim();
        const events = (0, GenericFunctions_1.toStringList)(this.getNodeParameter('events', i, []));
        const headers = (0, GenericFunctions_1.parseJson)(this.getNodeParameter('headers', i, '{}'), 'Headers', {});
        if (name)
            body.name = name;
        if (endpoint)
            body.endpoint = endpoint;
        if (events.length)
            body.events = events;
        if (Object.keys(headers).length)
            body.headers = headers;
        if (operation === 'create') {
            if (!name || !endpoint || !events.length)
                throw new Error('Name, Endpoint URL ed Events sono obbligatori');
            return asItems(await GenericFunctions_1.accessData.call(this, 'POST', '/webhooks/endpoints', {}, body));
        }
        const id = enc(this.getNodeParameter('webhookId', i));
        return asItems(await GenericFunctions_1.accessData.call(this, 'PUT', `/webhooks/endpoints/${id}`, {}, body), { success: true, id: decodeURIComponent(id) });
    },
};
// ---------------------------------------------------------------------- shared
/** Assegna/rimuove NFC e PIN per utenti (/users/:id) e visitatori (/visitors/:id). */
async function credentialAssignment(operation, i, base, ok) {
    switch (operation) {
        case 'assignNfcCard': {
            const token = String(this.getNodeParameter('nfcToken', i)).trim();
            const body = { token };
            if (this.getNodeParameter('forceAdd', i, false))
                body.force_add = true;
            await GenericFunctions_1.accessData.call(this, 'PUT', `${base}/nfc_cards`, {}, body);
            return ok({ token });
        }
        case 'unassignNfcCard': {
            const token = String(this.getNodeParameter('nfcToken', i)).trim();
            await GenericFunctions_1.accessData.call(this, 'PUT', `${base}/nfc_cards/delete`, {}, { token });
            return ok({ token, unassigned: true });
        }
        case 'assignPin': {
            const pin = String(this.getNodeParameter('pinCode', i)).trim();
            await GenericFunctions_1.accessData.call(this, 'PUT', `${base}/pin_codes`, {}, { pin_code: pin });
            return ok();
        }
        case 'unassignPin':
            await GenericFunctions_1.accessData.call(this, 'DELETE', `${base}/pin_codes`);
            return ok({ unassigned: true });
    }
    throw new Error(`Operazione non supportata: ${operation}`);
}
/** Interroga la sessione NFC finché il lettore non restituisce il token della tessera. */
async function waitForCard(sessionId, i) {
    const timeout = this.getNodeParameter('waitTimeout', i, 60) * 1000;
    const deadline = Date.now() + timeout;
    const path = `/credentials/nfc_cards/sessions/${enc(sessionId)}`;
    while (Date.now() < deadline) {
        try {
            const data = (await GenericFunctions_1.accessData.call(this, 'GET', path));
            if (data && typeof data === 'object' && data.token)
                return { session_id: sessionId, ...data };
        }
        catch (error) {
            // Finché nessuna tessera viene avvicinata il server risponde con un codice "token vuoto"
            if (!(error instanceof GenericFunctions_1.UnifiAccessError) || !/EMPTY|NOT_READY|WAIT|PENDING/i.test(error.code))
                throw error;
        }
        await sleep(2000);
    }
    try {
        await GenericFunctions_1.accessData.call(this, 'DELETE', path);
    }
    catch {
        /* sessione già chiusa */
    }
    throw new Error(`Nessuna tessera letta entro ${timeout / 1000} secondi (sessione ${sessionId} annullata)`);
}
async function customRequest(i) {
    const method = this.getNodeParameter('method', i);
    const endpoint = this.getNodeParameter('endpoint', i);
    const qs = (0, GenericFunctions_1.parseJson)(this.getNodeParameter('queryParameters', i, '{}'), 'Query Parameters', {});
    const body = ['POST', 'PATCH', 'PUT'].includes(method)
        ? (0, GenericFunctions_1.parseJson)(this.getNodeParameter('body', i, '{}'), 'Body', {})
        : undefined;
    const splitData = this.getNodeParameter('splitData', i, true);
    const data = await GenericFunctions_1.accessData.call(this, method, endpoint, qs, body);
    if (splitData) {
        const list = (0, GenericFunctions_1.extractList)(data);
        if (list.length)
            return list;
    }
    return asItems(data);
}

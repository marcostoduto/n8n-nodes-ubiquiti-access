"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UnifiAccessError = exports.API_PREFIX = exports.CREDENTIAL_NAME = void 0;
exports.accessRequest = accessRequest;
exports.accessData = accessData;
exports.extractList = extractList;
exports.accessGetAll = accessGetAll;
exports.parseJson = parseJson;
exports.toUnix = toUnix;
exports.toStringList = toStringList;
exports.CREDENTIAL_NAME = 'unifiAccessApi';
exports.API_PREFIX = '/api/v1/developer';
const PAGE_SIZE = 100;
/** Errore restituito da UniFi Access ({ code, msg }) con il codice leggibile. */
class UnifiAccessError extends Error {
    constructor(code, msg, httpCode) {
        super(`UniFi Access: ${msg || code} (${code}${httpCode ? `, HTTP ${httpCode}` : ''})`);
        this.code = code;
        this.httpCode = httpCode;
    }
}
exports.UnifiAccessError = UnifiAccessError;
/** Prova a ricavare { code, msg } dal corpo di una risposta d'errore HTTP. */
function envelopeFromError(error) {
    const candidates = [
        error?.response?.body,
        error?.response?.data,
        error?.cause?.response?.data,
        error?.cause?.response?.body,
        error?.description,
    ];
    for (let c of candidates) {
        if (typeof c === 'string') {
            try {
                c = JSON.parse(c);
            }
            catch {
                continue;
            }
        }
        if (c && typeof c === 'object' && typeof c.code === 'string')
            return c;
    }
    return undefined;
}
/**
 * Chiama l'API UniFi Access e restituisce l'envelope completo { code, msg, data, pagination }.
 * Se code !== "SUCCESS" lancia UnifiAccessError. Gli endpoint senza "/api/" vengono
 * prefissati con /api/v1/developer.
 */
async function accessRequest(method, endpoint, qs = {}, body) {
    const credentials = await this.getCredentials(exports.CREDENTIAL_NAME);
    const baseUrl = String(credentials.serverUrl ?? '').replace(/\/+$/, '');
    let path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    if (!path.startsWith('/api/'))
        path = `${exports.API_PREFIX}${path}`;
    const options = {
        method,
        url: `${baseUrl}${path}`,
        qs,
        json: true,
        headers: { Accept: 'application/json' },
        skipSslCertificateValidation: credentials.allowUnauthorizedCerts !== false,
    };
    if (body !== undefined && (Array.isArray(body) || Object.keys(body).length)) {
        options.body = body;
    }
    else if (method === 'POST' || method === 'PUT') {
        options.body = {};
    }
    let response;
    try {
        response = await this.helpers.httpRequestWithAuthentication.call(this, exports.CREDENTIAL_NAME, options);
    }
    catch (error) {
        const env = envelopeFromError(error);
        if (env) {
            const httpCode = Number(error?.httpCode ?? error?.response?.status) || undefined;
            throw new UnifiAccessError(String(env.code), String(env.msg ?? ''), httpCode);
        }
        throw error;
    }
    if (typeof response === 'string' && response.trim().startsWith('{')) {
        try {
            response = JSON.parse(response);
        }
        catch {
            /* lascia la stringa */
        }
    }
    if (response && typeof response === 'object' && typeof response.code === 'string' && response.code !== 'SUCCESS') {
        throw new UnifiAccessError(response.code, String(response.msg ?? ''));
    }
    return response;
}
/** Come accessRequest ma restituisce solo il campo "data". */
async function accessData(method, endpoint, qs = {}, body) {
    const response = await accessRequest.call(this, method, endpoint, qs, body);
    return response && typeof response === 'object' && 'data' in response ? response.data : response;
}
/** Estrae la lista di elementi da "data" (array, array di array, { hits }, { list }). */
function extractList(data) {
    if (Array.isArray(data))
        return flatten(data);
    if (data && typeof data === 'object') {
        for (const key of ['hits', 'list', 'items', 'data']) {
            if (Array.isArray(data[key]))
                return flatten(data[key]);
        }
    }
    return [];
}
function flatten(list) {
    const out = [];
    for (const el of list) {
        if (Array.isArray(el))
            out.push(...flatten(el));
        else if (el !== null && el !== undefined)
            out.push(el);
    }
    return out;
}
/**
 * Legge una collezione paginata con page_num/page_size. limit = 0 -> tutti.
 * Si ferma quando la pagina è corta, quando si raggiunge "total" o se l'endpoint
 * non riporta informazioni di paginazione.
 */
async function accessGetAll(method, endpoint, qs = {}, limit = 0, body) {
    const results = [];
    let pageNum = 1;
    for (;;) {
        const response = await accessRequest.call(this, method, endpoint, { ...qs, page_num: pageNum, page_size: PAGE_SIZE }, body);
        const data = response?.data ?? response;
        const page = extractList(data);
        results.push(...page);
        const total = Number(response?.pagination?.total ?? data?.total ?? data?.pagination?.total);
        const paginated = response?.pagination !== undefined || Number.isFinite(total);
        if (limit && results.length >= limit)
            break;
        if (!paginated || page.length < PAGE_SIZE || page.length === 0)
            break;
        if (Number.isFinite(total) && results.length >= total)
            break;
        pageNum++;
    }
    return limit ? results.slice(0, limit) : results;
}
/** Converte un parametro JSON (stringa, oggetto o array) nel valore corrispondente. */
function parseJson(value, fieldName, fallback) {
    if (value === undefined || value === null || value === '')
        return fallback;
    if (typeof value === 'object')
        return value;
    try {
        return JSON.parse(String(value));
    }
    catch {
        throw new Error(`Il campo "${fieldName}" non contiene JSON valido`);
    }
}
/** Converte data ISO, millisecondi o secondi in timestamp Unix (secondi). */
function toUnix(value) {
    if (value === undefined || value === null || value === '')
        return undefined;
    if (typeof value === 'number' || /^\d+$/.test(String(value))) {
        const n = Number(value);
        return n > 1e12 ? Math.floor(n / 1000) : n;
    }
    const ms = Date.parse(String(value));
    if (Number.isNaN(ms))
        throw new Error(`Data non valida: ${String(value)}`);
    return Math.floor(ms / 1000);
}
/** Accetta "a,b,c", ["a","b"] o un JSON array e restituisce un array di stringhe. */
function toStringList(value) {
    if (value === undefined || value === null || value === '')
        return [];
    if (Array.isArray(value))
        return value.map((v) => String(v).trim()).filter(Boolean);
    const s = String(value).trim();
    if (s.startsWith('['))
        return toStringList(JSON.parse(s));
    return s
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean);
}

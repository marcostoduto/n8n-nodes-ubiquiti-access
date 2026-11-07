import type {
	IDataObject,
	IExecuteFunctions,
	IHookFunctions,
	IHttpRequestMethods,
	IHttpRequestOptions,
	ILoadOptionsFunctions,
} from 'n8n-workflow';

export const CREDENTIAL_NAME = 'unifiAccessApi';
export const API_PREFIX = '/api/v1/developer';
const PAGE_SIZE = 100;

type Context = IExecuteFunctions | ILoadOptionsFunctions | IHookFunctions;
type Body = IDataObject | IDataObject[] | string[];

/** Errore restituito da UniFi Access ({ code, msg }) con il codice leggibile. */
export class UnifiAccessError extends Error {
	constructor(
		public code: string,
		msg: string,
		public httpCode?: number,
	) {
		super(`UniFi Access: ${msg || code} (${code}${httpCode ? `, HTTP ${httpCode}` : ''})`);
	}
}

/** Prova a ricavare { code, msg } dal corpo di una risposta d'errore HTTP. */
function envelopeFromError(error: any): IDataObject | undefined {
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
			} catch {
				continue;
			}
		}
		if (c && typeof c === 'object' && typeof c.code === 'string') return c as IDataObject;
	}
	return undefined;
}

/**
 * Chiama l'API UniFi Access e restituisce l'envelope completo { code, msg, data, pagination }.
 * Se code !== "SUCCESS" lancia UnifiAccessError. Gli endpoint senza "/api/" vengono
 * prefissati con /api/v1/developer.
 */
export async function accessRequest(
	this: Context,
	method: IHttpRequestMethods,
	endpoint: string,
	qs: IDataObject = {},
	body?: Body,
): Promise<any> {
	const credentials = await this.getCredentials(CREDENTIAL_NAME);
	const baseUrl = String(credentials.serverUrl ?? '').replace(/\/+$/, '');
	let path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
	if (!path.startsWith('/api/')) path = `${API_PREFIX}${path}`;

	const options: IHttpRequestOptions = {
		method,
		url: `${baseUrl}${path}`,
		qs,
		json: true,
		headers: { Accept: 'application/json' },
		skipSslCertificateValidation: credentials.allowUnauthorizedCerts !== false,
	};
	if (body !== undefined && (Array.isArray(body) || Object.keys(body).length)) {
		options.body = body;
	} else if (method === 'POST' || method === 'PUT') {
		options.body = {};
	}

	let response: any;
	try {
		response = await this.helpers.httpRequestWithAuthentication.call(this, CREDENTIAL_NAME, options);
	} catch (error) {
		const env = envelopeFromError(error);
		if (env) {
			const httpCode = Number((error as any)?.httpCode ?? (error as any)?.response?.status) || undefined;
			throw new UnifiAccessError(String(env.code), String(env.msg ?? ''), httpCode);
		}
		throw error;
	}

	if (typeof response === 'string' && response.trim().startsWith('{')) {
		try {
			response = JSON.parse(response);
		} catch {
			/* lascia la stringa */
		}
	}
	if (response && typeof response === 'object' && typeof response.code === 'string' && response.code !== 'SUCCESS') {
		throw new UnifiAccessError(response.code, String(response.msg ?? ''));
	}
	return response;
}

/** Come accessRequest ma restituisce solo il campo "data". */
export async function accessData(
	this: Context,
	method: IHttpRequestMethods,
	endpoint: string,
	qs: IDataObject = {},
	body?: Body,
): Promise<any> {
	const response = await accessRequest.call(this, method, endpoint, qs, body);
	return response && typeof response === 'object' && 'data' in response ? response.data : response;
}

/** Estrae la lista di elementi da "data" (array, array di array, { hits }, { list }). */
export function extractList(data: any): IDataObject[] {
	if (Array.isArray(data)) return flatten(data);
	if (data && typeof data === 'object') {
		for (const key of ['hits', 'list', 'items', 'data']) {
			if (Array.isArray(data[key])) return flatten(data[key]);
		}
	}
	return [];
}

function flatten(list: unknown[]): IDataObject[] {
	const out: IDataObject[] = [];
	for (const el of list) {
		if (Array.isArray(el)) out.push(...flatten(el));
		else if (el !== null && el !== undefined) out.push(el as IDataObject);
	}
	return out;
}

/**
 * Legge una collezione paginata con page_num/page_size. limit = 0 -> tutti.
 * Si ferma quando la pagina è corta, quando si raggiunge "total" o se l'endpoint
 * non riporta informazioni di paginazione.
 */
export async function accessGetAll(
	this: Context,
	method: IHttpRequestMethods,
	endpoint: string,
	qs: IDataObject = {},
	limit = 0,
	body?: IDataObject,
): Promise<IDataObject[]> {
	const results: IDataObject[] = [];
	let pageNum = 1;

	for (;;) {
		const response = await accessRequest.call(this, method, endpoint, { ...qs, page_num: pageNum, page_size: PAGE_SIZE }, body);
		const data = response?.data ?? response;
		const page = extractList(data);
		results.push(...page);

		const total = Number(response?.pagination?.total ?? data?.total ?? data?.pagination?.total);
		const paginated = response?.pagination !== undefined || Number.isFinite(total);

		if (limit && results.length >= limit) break;
		if (!paginated || page.length < PAGE_SIZE || page.length === 0) break;
		if (Number.isFinite(total) && results.length >= total) break;
		pageNum++;
	}
	return limit ? results.slice(0, limit) : results;
}

/** Converte un parametro JSON (stringa, oggetto o array) nel valore corrispondente. */
export function parseJson<T = any>(value: unknown, fieldName: string, fallback: T): T {
	if (value === undefined || value === null || value === '') return fallback;
	if (typeof value === 'object') return value as T;
	try {
		return JSON.parse(String(value)) as T;
	} catch {
		throw new Error(`Il campo "${fieldName}" non contiene JSON valido`);
	}
}

/** Converte data ISO, millisecondi o secondi in timestamp Unix (secondi). */
export function toUnix(value: unknown): number | undefined {
	if (value === undefined || value === null || value === '') return undefined;
	if (typeof value === 'number' || /^\d+$/.test(String(value))) {
		const n = Number(value);
		return n > 1e12 ? Math.floor(n / 1000) : n;
	}
	const ms = Date.parse(String(value));
	if (Number.isNaN(ms)) throw new Error(`Data non valida: ${String(value)}`);
	return Math.floor(ms / 1000);
}

/** Accetta "a,b,c", ["a","b"] o un JSON array e restituisce un array di stringhe. */
export function toStringList(value: unknown): string[] {
	if (value === undefined || value === null || value === '') return [];
	if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean);
	const s = String(value).trim();
	if (s.startsWith('[')) return toStringList(JSON.parse(s));
	return s
		.split(',')
		.map((v) => v.trim())
		.filter(Boolean);
}

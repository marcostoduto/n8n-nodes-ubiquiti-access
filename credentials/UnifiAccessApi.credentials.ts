import type {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

/**
 * Credenziale UniFi Access (API ufficiale "developer").
 *
 * Il token si crea in UniFi Portal > Access > Settings > General > Advanced > API Token,
 * scegliendo i permessi (view:space, edit:space, view:user, edit:user, ...).
 * Il server API è sulla console (UDM, Cloud Key, UNVR...) alla porta 12445, in HTTPS
 * con certificato autofirmato.
 */
export class UnifiAccessApi implements ICredentialType {
	name = 'unifiAccessApi';

	displayName = 'UniFi Access API';

	documentationUrl = 'https://github.com/marcostoduto/n8n-nodes-ubiquiti-access#readme';

	icon = 'file:unifiaccess.svg' as const;

	properties: INodeProperties[] = [
		{
			displayName: 'Server URL',
			name: 'serverUrl',
			type: 'string',
			default: '',
			placeholder: 'https://192.168.1.1:12445',
			description: 'Indirizzo della console con UniFi Access, porta 12445, senza slash finale',
			required: true,
		},
		{
			displayName: 'API Token',
			name: 'apiToken',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			description: 'Token creato in Access > Settings > General > Advanced > API Token',
			required: true,
		},
		{
			displayName: 'Ignore SSL Issues',
			name: 'allowUnauthorizedCerts',
			type: 'boolean',
			default: true,
			description: 'Whether to connect even if the SSL certificate is not valid (la console usa un certificato autofirmato)',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials.apiToken}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.serverUrl.replace(/\\/+$/, "")}}',
			url: '/api/v1/developer/doors',
			skipSslCertificateValidation: '={{$credentials.allowUnauthorizedCerts}}',
		},
	};
}

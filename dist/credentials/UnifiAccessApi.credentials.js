"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UnifiAccessApi = void 0;
/**
 * Credenziale UniFi Access (API ufficiale "developer").
 *
 * Il token si crea in UniFi Portal > Access > Settings > General > Advanced > API Token,
 * scegliendo i permessi (view:space, edit:space, view:user, edit:user, ...).
 * Il server API è sulla console (UDM, Cloud Key, UNVR...) alla porta 12445, in HTTPS
 * con certificato autofirmato.
 */
class UnifiAccessApi {
    constructor() {
        this.name = 'unifiAccessApi';
        this.displayName = 'UniFi Access API';
        this.documentationUrl = 'https://github.com/marcostoduto/n8n-nodes-ubiquiti-access#readme';
        this.icon = 'file:unifiaccess.svg';
        this.properties = [
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
        this.authenticate = {
            type: 'generic',
            properties: {
                headers: {
                    Authorization: '=Bearer {{$credentials.apiToken}}',
                },
            },
        };
        this.test = {
            request: {
                baseURL: '={{$credentials.serverUrl.replace(/\\/+$/, "")}}',
                url: '/api/v1/developer/doors',
                skipSslCertificateValidation: '={{$credentials.allowUnauthorizedCerts}}',
            },
        };
    }
}
exports.UnifiAccessApi = UnifiAccessApi;

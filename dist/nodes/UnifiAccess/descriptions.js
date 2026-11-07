"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.nodeProperties = exports.webhookEvents = exports.resourceProperty = void 0;
// ---------------------------------------------------------------------- helper
function operations(resource, options, def) {
    return {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        noDataExpression: true,
        displayOptions: { show: { resource: [resource] } },
        options,
        default: def,
    };
}
/** Aggiunge displayOptions resource/operation a un campo. */
function on(resource, operation, prop) {
    const show = { ...(prop.displayOptions?.show ?? {}), resource: Array.isArray(resource) ? resource : [resource] };
    if (operation)
        show.operation = operation;
    return { ...prop, displayOptions: { ...(prop.displayOptions ?? {}), show } };
}
function returnAllLimit(resource, ops) {
    return [
        on(resource, ops, {
            displayName: 'Return All',
            name: 'returnAll',
            type: 'boolean',
            default: false,
            description: 'Whether to return all results or only up to a given limit',
        }),
        on(resource, ops, {
            displayName: 'Limit',
            name: 'limit',
            type: 'number',
            typeOptions: { minValue: 1 },
            default: 50,
            description: 'Max number of results to return',
            displayOptions: { show: { returnAll: [false] } },
        }),
    ];
}
const doorIdField = (resource, ops) => on(resource, ops, {
    displayName: 'Door Name or ID',
    name: 'doorId',
    type: 'options',
    typeOptions: { loadOptionsMethod: 'getDoors' },
    required: true,
    default: '',
    description: 'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
});
const deviceIdField = (resource, ops, name = 'deviceId') => on(resource, ops, {
    displayName: 'Device Name or ID',
    name,
    type: 'options',
    typeOptions: { loadOptionsMethod: 'getDevices' },
    required: true,
    default: '',
    description: 'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
});
const policyIdsField = (resource, ops) => on(resource, ops, {
    displayName: 'Access Policy Names or IDs',
    name: 'accessPolicyIds',
    type: 'multiOptions',
    typeOptions: { loadOptionsMethod: 'getAccessPolicies' },
    default: [],
    description: 'Policy da assegnare: sostituiscono quelle attuali, lista vuota = rimuove tutte. Choose from the list, or specify IDs using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
});
const idField = (resource, ops, name, displayName) => on(resource, ops, { displayName, name, type: 'string', required: true, default: '' });
const userCommonFields = [
    { displayName: 'Email', name: 'user_email', type: 'string', placeholder: 'name@email.com', default: '' },
    { displayName: 'Employee Number', name: 'employee_number', type: 'string', default: '' },
    {
        displayName: 'Onboard Time',
        name: 'onboard_time',
        type: 'dateTime',
        default: '',
        description: 'Data di inizio (convertita in timestamp Unix)',
    },
];
const visitorCommonFields = [
    { displayName: 'Email', name: 'email', type: 'string', placeholder: 'name@email.com', default: '' },
    { displayName: 'Mobile Phone', name: 'mobile_phone', type: 'string', default: '' },
    { displayName: 'Company', name: 'visitor_company', type: 'string', default: '' },
    { displayName: 'Remarks', name: 'remarks', type: 'string', default: '' },
    {
        displayName: 'Resources (JSON)',
        name: 'resources',
        type: 'json',
        default: '[\n  { "id": "DOOR_ID", "type": "door" }\n]',
        description: 'Porte o gruppi a cui il visitatore può accedere: [{ "id": "...", "type": "door" | "door_group" }]. ID da Door Group > Get Topology.',
    },
    {
        displayName: 'Week Schedule (JSON)',
        name: 'week_schedule',
        type: 'json',
        default: '{\n  "monday": [{ "start_time": "09:00:00", "end_time": "18:00:59" }]\n}',
        description: 'Fasce orarie per giorno (sunday..saturday). Se omesso l\'accesso vale per tutto il periodo.',
    },
];
const visitReasons = [
    { name: 'Business', value: 'Business' },
    { name: 'Cooperation', value: 'Cooperation' },
    { name: 'Interview', value: 'Interview' },
    { name: 'Others', value: 'Others' },
];
// ---------------------------------------------------------------------- resource
exports.resourceProperty = {
    displayName: 'Resource',
    name: 'resource',
    type: 'options',
    noDataExpression: true,
    options: [
        { name: 'Access Policy', value: 'accessPolicy' },
        { name: 'Credential (NFC / PIN)', value: 'credential' },
        { name: 'Custom API Request', value: 'custom' },
        { name: 'Device', value: 'device' },
        { name: 'Door', value: 'door' },
        { name: 'Door Group', value: 'doorGroup' },
        { name: 'Schedule', value: 'schedule' },
        { name: 'System Log', value: 'systemLog' },
        { name: 'User', value: 'user' },
        { name: 'User Group', value: 'userGroup' },
        { name: 'Visitor', value: 'visitor' },
        { name: 'Webhook', value: 'webhook' },
    ],
    default: 'door',
};
// ---------------------------------------------------------------------- door
const door = [
    operations('door', [
        { name: 'Get', value: 'get', action: 'Get a door' },
        { name: 'Get Emergency Status', value: 'getEmergency', action: 'Get the emergency status of all doors' },
        { name: 'Get Lock Rule', value: 'getLockRule', action: 'Get the temporary lock rule of a door' },
        { name: 'Get Many', value: 'getAll', action: 'Get many doors' },
        { name: 'Set Emergency Status', value: 'setEmergency', action: 'Set lockdown or evacuation on all doors' },
        { name: 'Set Lock Rule', value: 'setLockRule', action: 'Set a temporary lock rule on a door', description: 'Tieni aperta/chiusa la porta, per un periodo o fino a nuovo ordine' },
        { name: 'Unlock', value: 'unlock', action: 'Unlock a door remotely', description: 'Apertura remota (come dal pulsante nell\'app)' },
    ], 'unlock'),
    doorIdField('door', ['get', 'unlock', 'getLockRule', 'setLockRule']),
    on('door', ['unlock'], {
        displayName: 'Options',
        name: 'unlockOptions',
        type: 'collection',
        placeholder: 'Add Option',
        default: {},
        options: [
            { displayName: 'Actor ID', name: 'actor_id', type: 'string', default: '', description: 'ID personalizzato di chi apre, mostrato nei log (insieme ad Actor Name)' },
            { displayName: 'Actor Name', name: 'actor_name', type: 'string', default: '', placeholder: 'n8n', description: 'Nome mostrato nei log di sistema' },
            { displayName: 'Extra (JSON)', name: 'extra', type: 'json', default: '{}', description: 'Dati liberi inoltrati ai webhook "access.door.unlock"' },
        ],
    }),
    on('door', ['setLockRule'], {
        displayName: 'Rule',
        name: 'lockRuleType',
        type: 'options',
        options: [
            { name: 'Keep Unlocked', value: 'keep_unlock', description: 'Resta aperta fino a nuovo ordine' },
            { name: 'Keep Locked', value: 'keep_lock', description: 'Resta chiusa fino a nuovo ordine' },
            { name: 'Unlock for Minutes (Custom)', value: 'custom', description: 'Resta aperta per N minuti' },
            { name: 'Reset', value: 'reset', description: 'Torna allo stato normale' },
            { name: 'Lock Early', value: 'lock_early', description: 'Chiude in anticipo una pianificazione di apertura in corso' },
            { name: 'Lock Now', value: 'lock_now', description: 'Chiude subito durante una regola temporanea' },
        ],
        default: 'custom',
    }),
    on('door', ['setLockRule'], {
        displayName: 'Minutes',
        name: 'interval',
        type: 'number',
        typeOptions: { minValue: 1 },
        default: 10,
        displayOptions: { show: { lockRuleType: ['custom'] } },
    }),
    on('door', ['setEmergency'], {
        displayName: 'Lockdown',
        name: 'lockdown',
        type: 'boolean',
        default: false,
        description: 'Whether to keep all doors locked',
    }),
    on('door', ['setEmergency'], {
        displayName: 'Evacuation',
        name: 'evacuation',
        type: 'boolean',
        default: false,
        description: 'Whether to keep all doors unlocked',
    }),
];
// ---------------------------------------------------------------------- door group
const doorGroup = [
    operations('doorGroup', [
        { name: 'Create', value: 'create', action: 'Create a door group' },
        { name: 'Delete', value: 'delete', action: 'Delete a door group' },
        { name: 'Get', value: 'get', action: 'Get a door group' },
        { name: 'Get Many', value: 'getAll', action: 'Get many door groups' },
        { name: 'Get Topology', value: 'getTopology', action: 'Get the building topology', description: 'Edifici, piani e porte con i relativi ID' },
        { name: 'Update', value: 'update', action: 'Update a door group' },
    ], 'getTopology'),
    idField('doorGroup', ['get', 'update', 'delete'], 'doorGroupId', 'Door Group ID'),
    on('doorGroup', ['create', 'update'], {
        displayName: 'Name',
        name: 'groupName',
        type: 'string',
        default: '',
        description: 'Obbligatorio in creazione; vuoto in modifica = invariato',
    }),
    on('doorGroup', ['create', 'update'], {
        displayName: 'Door Names or IDs',
        name: 'doorIds',
        type: 'multiOptions',
        typeOptions: { loadOptionsMethod: 'getDoors' },
        default: [],
        description: 'Porte del gruppo (in modifica: vuoto = invariato). Choose from the list, or specify IDs using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
    }),
];
// ---------------------------------------------------------------------- user
const userOps = ['get', 'update', 'delete', 'getAccessPolicies', 'setAccessPolicies', 'assignNfcCard', 'unassignNfcCard', 'assignPin', 'unassignPin'];
const user = [
    operations('user', [
        { name: 'Assign NFC Card', value: 'assignNfcCard', action: 'Assign an NFC card to a user' },
        { name: 'Assign PIN', value: 'assignPin', action: 'Assign a PIN code to a user' },
        { name: 'Create', value: 'create', action: 'Create a user' },
        { name: 'Delete', value: 'delete', action: 'Delete a user', description: 'Solo utenti disattivati (Access 3.1.30+)' },
        { name: 'Get', value: 'get', action: 'Get a user' },
        { name: 'Get Access Policies', value: 'getAccessPolicies', action: 'Get the access policies of a user' },
        { name: 'Get Many', value: 'getAll', action: 'Get many users' },
        { name: 'Search', value: 'search', action: 'Search users', description: 'Per nome, email, stato (Access 3.1.30+)' },
        { name: 'Set Access Policies', value: 'setAccessPolicies', action: 'Set the access policies of a user' },
        { name: 'Unassign NFC Card', value: 'unassignNfcCard', action: 'Unassign an NFC card from a user' },
        { name: 'Unassign PIN', value: 'unassignPin', action: 'Remove the PIN code of a user' },
        { name: 'Update', value: 'update', action: 'Update a user' },
    ], 'get'),
    idField('user', userOps, 'userId', 'User ID'),
    on('user', ['create'], { displayName: 'First Name', name: 'firstName', type: 'string', required: true, default: '' }),
    on('user', ['create'], { displayName: 'Last Name', name: 'lastName', type: 'string', required: true, default: '' }),
    on('user', ['create'], {
        displayName: 'Additional Fields',
        name: 'additionalFields',
        type: 'collection',
        placeholder: 'Add Field',
        default: {},
        options: userCommonFields,
    }),
    on('user', ['update'], {
        displayName: 'Update Fields',
        name: 'updateFields',
        type: 'collection',
        placeholder: 'Add Field',
        default: {},
        options: [
            { displayName: 'First Name', name: 'first_name', type: 'string', default: '' },
            { displayName: 'Last Name', name: 'last_name', type: 'string', default: '' },
            ...userCommonFields,
            {
                displayName: 'Status',
                name: 'status',
                type: 'options',
                options: [
                    { name: 'Active', value: 'ACTIVE' },
                    { name: 'Deactivated', value: 'DEACTIVATED' },
                ],
                default: 'ACTIVE',
            },
        ],
    }),
    on('user', ['get', 'getAll'], {
        displayName: 'Include Access Policies',
        name: 'includeAccessPolicies',
        type: 'boolean',
        default: false,
        description: 'Whether to include the access policies assigned to each user (expand[]=access_policy)',
    }),
    on('user', ['search'], { displayName: 'Keyword', name: 'keyword', type: 'string', default: '', description: 'Nome, cognome, email o matricola' }),
    on('user', ['search'], {
        displayName: 'Filters',
        name: 'searchFilters',
        type: 'collection',
        placeholder: 'Add Filter',
        default: {},
        options: [
            { displayName: 'Only Admins', name: 'only_admin', type: 'boolean', default: false, description: 'Whether to return only administrators' },
            {
                displayName: 'Status',
                name: 'status',
                type: 'multiOptions',
                options: [
                    { name: 'Active', value: 'ACTIVE' },
                    { name: 'Deactivated', value: 'DEACTIVATED' },
                    { name: 'Pending', value: 'PENDING' },
                ],
                default: [],
            },
        ],
    }),
    ...returnAllLimit('user', ['getAll', 'search']),
    on('user', ['getAccessPolicies'], {
        displayName: 'Only User Policies',
        name: 'onlyUserPolicies',
        type: 'boolean',
        default: false,
        description: 'Whether to exclude the policies inherited from user groups',
    }),
    policyIdsField('user', ['setAccessPolicies']),
    on(['user', 'visitor'], ['assignNfcCard', 'unassignNfcCard'], {
        displayName: 'NFC Card Token',
        name: 'nfcToken',
        type: 'string',
        required: true,
        default: '',
        description: 'Token della tessera (da Credential > Get NFC Enrollment o Get Many NFC Cards)',
    }),
    on(['user', 'visitor'], ['assignNfcCard'], {
        displayName: 'Force Add',
        name: 'forceAdd',
        type: 'boolean',
        default: false,
        description: 'Whether to reassign the card even if it already belongs to someone else',
    }),
    on(['user', 'visitor'], ['assignPin'], {
        displayName: 'PIN Code',
        name: 'pinCode',
        type: 'string',
        typeOptions: { password: true },
        required: true,
        default: '',
        description: 'PIN numerico. Per generarne uno valido usa Credential > Generate PIN.',
    }),
];
// ---------------------------------------------------------------------- user group
const userGroup = [
    operations('userGroup', [
        { name: 'Add Users', value: 'addUsers', action: 'Add users to a user group' },
        { name: 'Create', value: 'create', action: 'Create a user group' },
        { name: 'Delete', value: 'delete', action: 'Delete a user group' },
        { name: 'Get', value: 'get', action: 'Get a user group' },
        { name: 'Get Access Policies', value: 'getAccessPolicies', action: 'Get the access policies of a user group' },
        { name: 'Get Many', value: 'getAll', action: 'Get many user groups' },
        { name: 'Get Members', value: 'getMembers', action: 'Get the members of a user group' },
        { name: 'Remove Users', value: 'removeUsers', action: 'Remove users from a user group' },
        { name: 'Set Access Policies', value: 'setAccessPolicies', action: 'Set the access policies of a user group' },
        { name: 'Update', value: 'update', action: 'Update a user group' },
    ], 'getAll'),
    idField('userGroup', ['get', 'update', 'delete', 'addUsers', 'removeUsers', 'getMembers', 'getAccessPolicies', 'setAccessPolicies'], 'userGroupId', 'User Group ID'),
    on('userGroup', ['create', 'update'], { displayName: 'Name', name: 'name', type: 'string', required: true, default: '' }),
    on('userGroup', ['create', 'update'], {
        displayName: 'Parent Group ID',
        name: 'upId',
        type: 'string',
        default: '',
        description: 'ID del gruppo padre (opzionale)',
    }),
    on('userGroup', ['addUsers', 'removeUsers'], {
        displayName: 'User IDs',
        name: 'userIds',
        type: 'string',
        required: true,
        default: '',
        placeholder: 'id1,id2',
        description: 'ID separati da virgola o array JSON',
    }),
    on('userGroup', ['getMembers'], {
        displayName: 'Include Subgroups',
        name: 'includeSubgroups',
        type: 'boolean',
        default: false,
        description: 'Whether to include the members of child groups',
    }),
    policyIdsField('userGroup', ['setAccessPolicies']),
];
// ---------------------------------------------------------------------- visitor
const visitor = [
    operations('visitor', [
        { name: 'Assign NFC Card', value: 'assignNfcCard', action: 'Assign an NFC card to a visitor' },
        { name: 'Assign PIN', value: 'assignPin', action: 'Assign a PIN code to a visitor' },
        { name: 'Create', value: 'create', action: 'Create a visitor' },
        { name: 'Delete', value: 'delete', action: 'Delete or cancel a visitor' },
        { name: 'Get', value: 'get', action: 'Get a visitor' },
        { name: 'Get Many', value: 'getAll', action: 'Get many visitors' },
        { name: 'Unassign NFC Card', value: 'unassignNfcCard', action: 'Unassign an NFC card from a visitor' },
        { name: 'Unassign PIN', value: 'unassignPin', action: 'Remove the PIN code of a visitor' },
        { name: 'Update', value: 'update', action: 'Update a visitor' },
    ], 'create'),
    idField('visitor', ['get', 'update', 'delete', 'assignNfcCard', 'unassignNfcCard', 'assignPin', 'unassignPin'], 'visitorId', 'Visitor ID'),
    on('visitor', ['create'], { displayName: 'First Name', name: 'firstName', type: 'string', required: true, default: '' }),
    on('visitor', ['create'], { displayName: 'Last Name', name: 'lastName', type: 'string', required: true, default: '' }),
    on('visitor', ['create'], { displayName: 'Visit Reason', name: 'visitReason', type: 'options', options: visitReasons, default: 'Business' }),
    on('visitor', ['create'], { displayName: 'Start Time', name: 'startTime', type: 'dateTime', required: true, default: '' }),
    on('visitor', ['create'], { displayName: 'End Time', name: 'endTime', type: 'dateTime', required: true, default: '' }),
    on('visitor', ['create'], {
        displayName: 'Additional Fields',
        name: 'additionalFields',
        type: 'collection',
        placeholder: 'Add Field',
        default: {},
        options: visitorCommonFields,
    }),
    on('visitor', ['update'], {
        displayName: 'Update Fields',
        name: 'updateFields',
        type: 'collection',
        placeholder: 'Add Field',
        default: {},
        options: [
            { displayName: 'First Name', name: 'first_name', type: 'string', default: '' },
            { displayName: 'Last Name', name: 'last_name', type: 'string', default: '' },
            { displayName: 'Visit Reason', name: 'visit_reason', type: 'options', options: visitReasons, default: 'Business' },
            { displayName: 'Start Time', name: 'start_time', type: 'dateTime', default: '' },
            { displayName: 'End Time', name: 'end_time', type: 'dateTime', default: '' },
            ...visitorCommonFields,
        ],
    }),
    on('visitor', ['getAll'], {
        displayName: 'Filters',
        name: 'visitorFilters',
        type: 'collection',
        placeholder: 'Add Filter',
        default: {},
        options: [
            { displayName: 'Keyword', name: 'keyword', type: 'string', default: '', description: 'Inizio di nome o cognome (disattiva il filtro per stato)' },
            {
                displayName: 'Status',
                name: 'status',
                type: 'options',
                options: [
                    { name: 'Active', value: 6 },
                    { name: 'Canceled', value: 4 },
                    { name: 'No Visit', value: 5 },
                    { name: 'Upcoming', value: 1 },
                    { name: 'Visited', value: 2 },
                    { name: 'Visiting', value: 3 },
                ],
                default: 1,
            },
            {
                displayName: 'Expand',
                name: 'expand',
                type: 'multiOptions',
                options: [
                    { name: 'Access Policy', value: 'access_policy' },
                    { name: 'NFC Card', value: 'nfc_card' },
                    { name: 'PIN Code', value: 'pin_code' },
                    { name: 'Resource', value: 'resource' },
                    { name: 'Schedule', value: 'schedule' },
                ],
                default: [],
            },
        ],
    }),
    ...returnAllLimit('visitor', ['getAll']),
    on('visitor', ['delete'], {
        displayName: 'Delete Permanently',
        name: 'isForce',
        type: 'boolean',
        default: false,
        description: 'Whether to delete the visitor permanently instead of setting it to canceled',
    }),
];
// ---------------------------------------------------------------------- access policy & schedule
const accessPolicy = [
    operations('accessPolicy', [
        { name: 'Create', value: 'create', action: 'Create an access policy' },
        { name: 'Delete', value: 'delete', action: 'Delete an access policy' },
        { name: 'Get', value: 'get', action: 'Get an access policy' },
        { name: 'Get Many', value: 'getAll', action: 'Get many access policies' },
        { name: 'Update', value: 'update', action: 'Update an access policy' },
    ], 'getAll'),
    on('accessPolicy', ['get', 'update', 'delete'], {
        displayName: 'Access Policy Name or ID',
        name: 'accessPolicyId',
        type: 'options',
        typeOptions: { loadOptionsMethod: 'getAccessPolicies' },
        required: true,
        default: '',
        description: 'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
    }),
    on('accessPolicy', ['create'], { displayName: 'Name', name: 'name', type: 'string', required: true, default: '' }),
    on('accessPolicy', ['create'], {
        displayName: 'Schedule Name or ID',
        name: 'scheduleId',
        type: 'options',
        typeOptions: { loadOptionsMethod: 'getSchedules' },
        required: true,
        default: '',
        description: 'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
    }),
    on('accessPolicy', ['create'], {
        displayName: 'Resources (JSON)',
        name: 'resources',
        type: 'json',
        default: '[\n  { "id": "DOOR_ID", "type": "door" }\n]',
        description: 'Porte o gruppi: [{ "id": "...", "type": "door" | "door_group" }]',
    }),
    on('accessPolicy', ['update'], {
        displayName: 'Fields to Update (JSON)',
        name: 'updateJson',
        type: 'json',
        default: '{\n  "name": "Nuovo nome"\n}',
        description: 'Corpo del PUT: name, resources, schedule_id',
    }),
];
const schedule = [
    operations('schedule', [
        { name: 'Get', value: 'get', action: 'Get a schedule' },
        { name: 'Get Many', value: 'getAll', action: 'Get many schedules' },
    ], 'getAll'),
    idField('schedule', ['get'], 'scheduleId', 'Schedule ID'),
];
// ---------------------------------------------------------------------- credential
const credential = [
    operations('credential', [
        { name: 'Cancel NFC Enrollment', value: 'cancelNfcEnrollment', action: 'Cancel an NFC card enrollment session' },
        { name: 'Delete NFC Card', value: 'deleteNfcCard', action: 'Delete an NFC card' },
        { name: 'Generate PIN', value: 'generatePin', action: 'Generate a PIN code', description: 'PIN casuale valido per le impostazioni del sistema' },
        { name: 'Get Many NFC Cards', value: 'getAllNfcCards', action: 'Get many NFC cards' },
        { name: 'Get NFC Card', value: 'getNfcCard', action: 'Get an NFC card' },
        { name: 'Get NFC Enrollment', value: 'getNfcEnrollment', action: 'Get the result of an NFC enrollment session', description: 'Restituisce il token della tessera letta (con attesa opzionale)' },
        { name: 'Start NFC Enrollment', value: 'startNfcEnrollment', action: 'Start reading an NFC card on a reader', description: 'Mette un lettore in modalità registrazione tessera' },
    ], 'generatePin'),
    deviceIdField('credential', ['startNfcEnrollment']),
    on('credential', ['startNfcEnrollment'], {
        displayName: 'Reset UniFi Card',
        name: 'resetUaCard',
        type: 'boolean',
        default: false,
        description: 'Whether to reset a UniFi Access card that was already enrolled elsewhere',
    }),
    on('credential', ['startNfcEnrollment', 'getNfcEnrollment'], {
        displayName: 'Wait for Card',
        name: 'waitForCard',
        type: 'boolean',
        default: false,
        description: 'Whether to wait until a card is tapped on the reader and return its token',
    }),
    on('credential', ['startNfcEnrollment', 'getNfcEnrollment'], {
        displayName: 'Timeout (Seconds)',
        name: 'waitTimeout',
        type: 'number',
        typeOptions: { minValue: 5, maxValue: 300 },
        default: 60,
        displayOptions: { show: { waitForCard: [true] } },
    }),
    idField('credential', ['getNfcEnrollment', 'cancelNfcEnrollment'], 'sessionId', 'Session ID'),
    idField('credential', ['getNfcCard', 'deleteNfcCard'], 'nfcToken', 'NFC Card Token'),
    ...returnAllLimit('credential', ['getAllNfcCards']),
];
// ---------------------------------------------------------------------- device
const device = [
    operations('device', [
        { name: 'Get Many', value: 'getAll', action: 'Get many devices', description: 'Lettori, hub e intercom (ID necessario per registrare tessere)' },
        { name: 'Get Settings', value: 'getSettings', action: 'Get the access method settings of a device', description: 'Access 3.3.10+' },
        { name: 'Update Settings', value: 'updateSettings', action: 'Update the access method settings of a device', description: 'Access 3.3.10+' },
    ], 'getAll'),
    deviceIdField('device', ['getSettings', 'updateSettings']),
    on('device', ['updateSettings'], {
        displayName: 'Settings (JSON)',
        name: 'settingsJson',
        type: 'json',
        default: '{\n  "nfc": { "enabled": "true" },\n  "pin_code": { "enabled": "true" }\n}',
        description: 'Metodi di accesso da modificare (nfc, pin_code, face, mobile_tap, qr_code, ...). I valori booleani sono stringhe "true"/"false".',
    }),
];
// ---------------------------------------------------------------------- system log
const systemLog = [
    operations('systemLog', [{ name: 'Get Many', value: 'getAll', action: 'Get many system log entries' }], 'getAll'),
    on('systemLog', ['getAll'], {
        displayName: 'Topic',
        name: 'topic',
        type: 'options',
        options: [
            { name: 'Admin Activity', value: 'admin_activity' },
            { name: 'All', value: 'all' },
            { name: 'Critical', value: 'critical' },
            { name: 'Device Events', value: 'device_events' },
            { name: 'Door Openings', value: 'door_openings' },
            { name: 'Updates', value: 'updates' },
            { name: 'Visitor', value: 'visitor' },
        ],
        default: 'door_openings',
    }),
    on('systemLog', ['getAll'], {
        displayName: 'Filters',
        name: 'logFilters',
        type: 'collection',
        placeholder: 'Add Filter',
        default: {},
        options: [
            { displayName: 'Since', name: 'since', type: 'dateTime', default: '' },
            { displayName: 'Until', name: 'until', type: 'dateTime', default: '' },
            { displayName: 'Actor ID', name: 'actor_id', type: 'string', default: '', description: 'ID di utente, visitatore o dispositivo' },
        ],
    }),
    ...returnAllLimit('systemLog', ['getAll']),
    on('systemLog', ['getAll'], {
        displayName: 'Simplify',
        name: 'simplify',
        type: 'boolean',
        default: true,
        description: 'Whether to return only the "_source" of each log entry, with its timestamp and ID',
    }),
];
// ---------------------------------------------------------------------- webhook
exports.webhookEvents = [
    { name: 'Device DPS Status', value: 'access.device.dps_status' },
    { name: 'Device Emergency Status', value: 'access.device.emergency_status' },
    { name: 'Door Unlock', value: 'access.door.unlock' },
    { name: 'Doorbell Completed', value: 'access.doorbell.completed' },
    { name: 'Doorbell Incoming', value: 'access.doorbell.incoming' },
    { name: 'Doorbell Incoming (REN)', value: 'access.doorbell.incoming.REN' },
    { name: 'Temporary Unlock End', value: 'access.temporary_unlock.end' },
    { name: 'Temporary Unlock Start', value: 'access.temporary_unlock.start' },
    { name: 'Unlock Schedule Activate', value: 'access.unlock_schedule.activate' },
    { name: 'Unlock Schedule Deactivate', value: 'access.unlock_schedule.deactivate' },
    { name: 'Visitor Status Changed', value: 'access.visitor.status.changed' },
];
const webhook = [
    operations('webhook', [
        { name: 'Create', value: 'create', action: 'Create a webhook endpoint' },
        { name: 'Delete', value: 'delete', action: 'Delete a webhook endpoint' },
        { name: 'Get Many', value: 'getAll', action: 'Get many webhook endpoints' },
        { name: 'Update', value: 'update', action: 'Update a webhook endpoint' },
    ], 'getAll'),
    idField('webhook', ['update', 'delete'], 'webhookId', 'Webhook ID'),
    on('webhook', ['create', 'update'], { displayName: 'Name', name: 'name', type: 'string', default: '', description: 'Obbligatorio in creazione' }),
    on('webhook', ['create', 'update'], { displayName: 'Endpoint URL', name: 'endpoint', type: 'string', default: '', placeholder: 'https://example.com/webhook', description: 'Obbligatorio in creazione' }),
    on('webhook', ['create', 'update'], {
        displayName: 'Events',
        name: 'events',
        type: 'multiOptions',
        options: exports.webhookEvents,
        default: [],
        description: 'Obbligatorio in creazione; in modifica vuoto = invariato',
    }),
    on('webhook', ['create', 'update'], {
        displayName: 'Headers (JSON)',
        name: 'headers',
        type: 'json',
        default: '{}',
        description: 'Header aggiuntivi inviati all\'endpoint',
    }),
];
// ---------------------------------------------------------------------- custom
const custom = [
    on('custom', undefined, {
        displayName: 'Method',
        name: 'method',
        type: 'options',
        options: [
            { name: 'DELETE', value: 'DELETE' },
            { name: 'GET', value: 'GET' },
            { name: 'PATCH', value: 'PATCH' },
            { name: 'POST', value: 'POST' },
            { name: 'PUT', value: 'PUT' },
        ],
        default: 'GET',
    }),
    on('custom', undefined, {
        displayName: 'Endpoint',
        name: 'endpoint',
        type: 'string',
        required: true,
        default: '/',
        placeholder: '/access_policies/holiday_groups',
        description: 'Percorso dopo /api/v1/developer (o percorso completo che inizia con /api/)',
    }),
    on('custom', undefined, {
        displayName: 'Query Parameters (JSON)',
        name: 'queryParameters',
        type: 'json',
        default: '{}',
    }),
    on('custom', undefined, {
        displayName: 'Body (JSON)',
        name: 'body',
        type: 'json',
        default: '{}',
        displayOptions: { show: { method: ['POST', 'PATCH', 'PUT'] } },
    }),
    on('custom', undefined, {
        displayName: 'Split "data" Into Items',
        name: 'splitData',
        type: 'boolean',
        default: true,
        description: 'Whether to output one item per element when "data" is a list',
    }),
];
exports.nodeProperties = [
    exports.resourceProperty,
    ...accessPolicy,
    ...credential,
    ...device,
    ...door,
    ...doorGroup,
    ...schedule,
    ...systemLog,
    ...user,
    ...userGroup,
    ...visitor,
    ...webhook,
    ...custom,
];

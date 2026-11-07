# n8n-nodes-ubiquiti-access

Nodi n8n per **UniFi Access** (Ubiquiti) che usano l'API ufficiale
(`https://<console>:12445/api/v1/developer/...`) con token Bearer.

- **UniFi Access**: porte, gruppi di porte, utenti, gruppi utenti, visitatori,
  credenziali NFC/PIN, policy di accesso, pianificazioni, dispositivi, log di sistema e webhook.
- **UniFi Access Trigger**: avvia il workflow sugli eventi di Access (apertura porta,
  citofono, visitatori...). Registra da solo il webhook in Access quando attivi il workflow
  e lo elimina quando lo disattivi.

## Credenziale "UniFi Access API"

| Campo | Note |
|---|---|
| Server URL | es. `https://192.168.1.1:12445`: IP della console (UDM, Cloud Key, UNVR...) con porta **12445** |
| API Token | *UniFi Portal > Access > Settings > General > Advanced > API Token*. Viene mostrato una sola volta. Scegli i permessi necessari (es. `view:space`, `edit:space`, `view:user`, `edit:user`, `edit:visitor`, `view:credential`, `edit:credential`, `view:system_log`, `view:webhook`, `edit:webhook`). |
| Ignore SSL Issues | attivo di default: la console usa un certificato autofirmato |

Il pulsante **Test** della credenziale chiama `GET /api/v1/developer/doors`
(serve il permesso di lettura delle porte).

Richiede UniFi Access 1.9.1 o successivo. L'API non è disponibile dopo il passaggio a Identity Enterprise.

## Operazioni

| Risorsa | Operazioni |
|---|---|
| Door | Get, Get Many, **Unlock** (apertura remota, con actor e dati extra per i webhook), Set/Get Lock Rule (tieni aperta/chiusa, apri per N minuti, reset, lock early/now), Set/Get Emergency Status (lockdown/evacuazione) |
| Door Group | Get Topology (edifici, piani, porte con ID), Get, Get Many, Create, Update, Delete |
| User | Create, Get, Get Many, Search, Update (anche attiva/disattiva), Delete, Get/Set Access Policies, Assign/Unassign NFC Card, Assign/Unassign PIN |
| User Group | Create, Get, Get Many, Update, Delete, Add/Remove Users, Get Members (anche dei sottogruppi), Get/Set Access Policies |
| Visitor | Create (date convertite in timestamp Unix, porte e fasce orarie in JSON), Get, Get Many (filtri per stato e nome), Update, Delete (annulla o elimina), Assign/Unassign NFC Card e PIN |
| Access Policy | Get, Get Many, Create, Update, Delete |
| Schedule | Get, Get Many |
| Credential | Generate PIN, Start NFC Enrollment (mette un lettore in registrazione; con **Wait for Card** attende la tessera e restituisce il token), Get/Cancel NFC Enrollment, Get/Get Many/Delete NFC Card |
| Device | Get Many (lettori, hub, intercom), Get/Update Settings dei metodi di accesso (Access 3.3.10+) |
| System Log | Get Many per topic (`door_openings`, `critical`, `device_events`, `admin_activity`, `visitor`, `updates`) con intervallo di date e actor |
| Webhook | Get Many, Create, Update, Delete |
| Custom API Request | qualsiasi endpoint: metodo, percorso (relativo a `/api/v1/developer`), query e body liberi |

Porte, dispositivi, policy e pianificazioni si scelgono da menu a tendina caricati
dalla console, oppure si passano gli ID con un'espressione.

Le risposte di Access hanno la forma `{ code, msg, data }`: il nodo restituisce `data`
e, se `code` non è `SUCCESS`, genera un errore con il codice (es. `CODE_RESOURCE_NOT_FOUND`).
Con *Continue On Fail* l'item in uscita contiene `error` e `code`.

### Esempio: registrare una tessera per un nuovo dipendente

1. **User > Create** (nome, cognome, email)
2. **Credential > Start NFC Enrollment** sul lettore scelto, con *Wait for Card* attivo:
   la persona avvicina la tessera e il nodo restituisce `token`
3. **User > Assign NFC Card** con `{{$json.token}}`
4. **User > Set Access Policies**

## Trigger

Il nodo **UniFi Access Trigger** usa i webhook di Access (versione 2.2.10+).
La console UniFi deve poter raggiungere l'URL di produzione del webhook di n8n.

Eventi disponibili: `access.door.unlock`, `access.doorbell.incoming`, `access.doorbell.completed`,
`access.doorbell.incoming.REN`, `access.device.dps_status`, `access.device.emergency_status`,
`access.unlock_schedule.activate`/`deactivate`, `access.temporary_unlock.start`/`end`,
`access.visitor.status.changed`. Altri nomi si aggiungono in *Options > Additional Events*.

*Verify Signature* (disattivo di default) controlla l'header `Signature`
(`t=…,v1=…`, HMAC-SHA256 di `t.body` con il secret restituito da Access).
Attivalo solo dopo aver verificato che la tua versione di Access firma le richieste in questo modo.

## Installazione in n8n (Docker)

La cartella `dist/` è già compilata nel repository: per usarla non serve fare la build.

1. Copia il repository sul server, ad esempio in `./n8n/custom-nodes/n8n-nodes-ubiquiti-access`.
2. Nel `docker-compose` aggiungi al servizio `n8n`:

   ```yaml
   services:
     n8n:
       volumes:
         - ./n8n/custom-nodes:/home/node/custom-nodes
       environment:
         - N8N_CUSTOM_EXTENSIONS=/home/node/custom-nodes
   ```

3. Riavvia n8n: `docker compose up -d n8n`
4. Nell'editor cerca **UniFi Access** tra i nodi e crea la credenziale **UniFi Access API**.

### In alternativa, dal pacchetto npm

Dopo la pubblicazione il nodo si installa da n8n in *Settings > Community Nodes > Install*
con il nome `@mstoduto/n8n-nodes-ubiquiti-access`.

## Sviluppo

```bash
npm install       # installa typescript e i tipi di n8n-workflow
npm run build     # compila in dist/ e copia le icone
npm test          # build + test contro un finto server UniFi Access (test/mock-test.js)
```

Il codice compilato non richiede dipendenze a runtime: da `n8n-workflow` usa solo i tipi TypeScript.

## Pubblicazione su npm

**Automatica (GitHub Actions):**

1. Su npmjs.com crea un token di tipo *Granular Access Token* con permesso di pubblicazione
   (se lo scope `@mstoduto` esiste già, dagli accesso in scrittura ai pacchetti dello scope).
2. Su GitHub aggiungilo come secret `NPM_TOKEN` (*Settings > Secrets and variables > Actions*).
3. Aggiorna `version` in `package.json`, fai commit e crea il tag corrispondente:

   ```bash
   git tag v1.0.0 && git push origin v1.0.0
   ```

Il workflow `.github/workflows/publish.yml` installa le dipendenze, compila, esegue i test
e pubblica. La provenance npm viene aggiunta solo quando il repository è pubblico
(npm non la accetta da repository privati). Si può lanciare anche a mano da
*Actions > Publish to npm > Run workflow*.

Il workflow `.github/workflows/ci.yml` esegue build e test a ogni push su `main` e a ogni pull request.

**Manuale:**

```bash
npm login
npm publish --access public
```

## Licenza

MIT

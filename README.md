# Central Telefónica VoIP / PBX

PBX empresarial sobre Asterisk 20, Node.js/TypeScript, PostgreSQL, Redis y React, con integración nativa preparada para **VONO / Fale Vono**.

## Integración VONO confirmada

La documentación actual de VONO indica que las credenciales del SIP Trunk se obtienen desde **Meu Vono → Sip Trunk → Ver**, donde aparecen **login, contraseña y dominio/servidor**.

Sus guías actuales muestran:
- Puerto SIP: **5060**
- Autenticación de entrada/salida
- Registro tipo: `usuario:senha@dominio:5060/usuario`
- Codecs publicados en ejemplos: `alaw`, `g722`, `ulaw` y `g729`
- `qualify=yes`, `fromuser=USUARIO`, `context=from-trunk`

Este proyecto usa PJSIP/Asterisk 20 y traduce esos parámetros a una configuración moderna.

> **TLS/SRTP del carrier:** las páginas públicas revisadas no documentan TLS/SRTP para el trunk. Por compatibilidad el perfil VONO predeterminado usa SIP/UDP 5060 + RTP. TLS/WSS + SRTP sí son obligatorios para WebRTC/extensiones remotas. Si VONO confirma TLS/SRTP, basta cambiar transporte y media encryption.

## Arquitectura

- **Asterisk 20**: PJSIP, ARI, AMI, IVR, colas, voicemail, conferencias y grabación opcional.
- **API Node.js + TypeScript**: JWT, REST, WebSocket, ARI + AMI.
- **PostgreSQL**: usuarios, extensiones, rutas DID y CDR.
- **Redis**: caché/eventos.
- **React + TypeScript + Tailwind + SIP.js**: dashboard y softphone WebRTC.
- **Nginx**: HTTPS, API/WebSocket y WSS hacia Asterisk.

## Inicio rápido

1. Copiar `.env.example` a `.env`.
2. En Meu Vono copiar **login, senha y domínio/servidor** a las variables `VONO_*`.
3. Colocar certificados TLS en `secrets/tls/fullchain.pem` y `secrets/tls/privkey.pem`.
4. Ejecutar:
   ```bash
   docker compose up -d --build
   ```
5. Crear administrador:
   ```bash
   docker compose exec api npm run seed:admin
   ```
6. Abrir `https://PBX_DOMAIN`.

## Endpoints API

- `POST /api/auth/login`
- `POST /api/calls/originate`
- `GET /api/calls/active`
- `GET /api/calls/history`
- `POST /api/calls/hangup`
- `POST /api/calls/transfer`
- `GET /api/extensions`
- `POST /api/extensions`
- `GET /api/trunks/vono/status`
- `GET /api/dids`
- `POST /api/dids`

WebSocket: `/socket.io`.

## Pruebas Asterisk

```bash
docker compose exec asterisk asterisk -rvvv
pjsip show endpoints
pjsip show registrations
pjsip show contacts
pjsip show endpoint vono
pjsip set logger on
rtp set debug on
core show channels
queue show
```

> Con PJSIP use `pjsip show endpoints`; `sip show peers` corresponde al antiguo chan_sip.

## Llamadas salientes

Marque **9 + número** desde una extensión. El PBX quita el 9 y envía por `PJSIP/...@vono`.

Para Brasil conviene normalizar después a un único formato (por ejemplo 55 + DDD + número) según lo que VONO acepte en su cuenta.

## Llamadas entrantes / DID

El contexto `from-vono` recibe la llamada del carrier y la entrega al IVR por defecto. Las rutas DID se administran en la API/BD y pueden apuntar a extensión, IVR o cola.

## Seguridad

- Web/API: HTTPS obligatorio.
- Extensiones WebRTC: WSS + DTLS-SRTP.
- AMI/ARI solo dentro de la red Docker.
- JWT + rate limiting.
- Passwords hasheadas con bcrypt.
- Fail2ban.
- Secrets fuera del repositorio.
- Para el carrier, restringir firewall/ACL a las IPs que VONO confirme.

## Datos que todavía conviene confirmar con VONO

- Si el dominio entregado resuelve a varias IP/SBC.
- Si soportan **SIP TLS** y en qué puerto.
- Si soportan **SRTP** y método.
- DTMF exacto (el proyecto usa RFC4733).
- Formato requerido de Caller ID / P-Asserted-Identity.
- Formato exacto del DID entrante.
- Límites de canales/CPS.
- IPs oficiales de señalización y RTP para ACL.

## Troubleshooting SIP

- **401**: challenge normal; si se repite, revisar login/secret/realm.
- **403**: credencial, IP o Caller ID no autorizado.
- **404**: numeración/destino incorrecto.
- **486**: destino ocupado.
- **503**: indisponibilidad/capacidad del carrier.

```bash
docker compose logs -f asterisk api nginx
```

Durante diagnóstico:
```
pjsip set logger on
rtp set debug on
```

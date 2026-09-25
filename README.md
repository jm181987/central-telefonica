# Central Telefónica VoIP / PBX

Plataforma PBX basada en Asterisk 20, Node.js, PostgreSQL, Redis y React.

> **Nota sobre VONO:** al 25/09/2026, `https://vono.com` redirige a un sitio de suministros médicos y no publica documentación SIP. La configuración incluida trata `sip.vono.com` como ejemplo/placeholder. Antes de producción hay que confirmar con el proveedor real: FQDN/IP, puerto, transporte, registro vs. autenticación por IP, realm/auth username, formato de DID/CLI, codecs y soporte de TLS/SRTP.

## Arquitectura

- **Asterisk 20**: PJSIP, ARI, WebRTC, IVR, colas, voicemail, conferencias, grabación opcional.
- **API Node.js + TypeScript**: JWT, REST, WebSocket, ARI + AMI.
- **PostgreSQL**: usuarios, extensiones y CDR.
- **Redis**: bus de eventos y caché de estado.
- **React + TypeScript + Tailwind + SIP.js**: dashboard y softphone WebRTC.
- **Nginx**: HTTPS, proxy API/WebSocket y proxy WSS hacia Asterisk.

## Inicio rápido

1. Copiar `.env.example` a `.env`.
2. Colocar certificados TLS en `secrets/tls/fullchain.pem` y `secrets/tls/privkey.pem`.
3. Confirmar y completar los parámetros VONO en `.env`.
4. Ejecutar:
   ```bash
   docker compose up -d --build
   ```
5. Crear el primer administrador:
   ```bash
   docker compose exec api npm run seed:admin
   ```
6. Abrir `https://PBX_DOMAIN`.

## Puertos

- 443/tcp: frontend, API y WebSocket.
- 5061/tcp: SIP TLS.
- 10000-20000/udp: RTP/SRTP.
- 8088/tcp: ARI HTTP interno (no exponer a Internet).
- 5038/tcp: AMI interno (no exponer a Internet).

## Datos a confirmar con VONO

- Host/FQDN o IPs de SBC.
- Puerto SIP.
- UDP/TCP/TLS aceptados; se recomienda TLS.
- Registro SIP requerido o autenticación por IP.
- `username`, `auth_username`, password/secret y realm.
- `from_user`, `from_domain` y formato de P-Asserted-Identity/Remote-Party-ID.
- Formato de DID entrante y número de destino entregado en Request-URI/To.
- Codecs permitidos y orden preferido.
- DTMF: RFC4733 (`rfc4733`) recomendado.
- Soporte de SRTP y método (SDES/DTLS-SRTP).
- IPs de señalización/RTP para ACL/firewall.
- Reglas de Caller ID saliente y números autorizados.
- Límites de CPS/canales concurrentes.

## Pruebas de Asterisk

Dentro del contenedor:

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

> En PJSIP no se usa `sip show peers` (chan_sip). Su equivalente es `pjsip show endpoints`.

## Llamadas

### Saliente
El dialplan usa `_X.` en el contexto `to-vono` y envía a `PJSIP/${EXTEN}@vono`. Ajuste normalización E.164 según el país/proveedor.

### Entrante
El contexto `from-vono` busca el DID en la tabla `did_routes`; el API puede administrar rutas. Si no existe una ruta, envía al IVR principal.

## Seguridad

- SIP externo por TLS.
- WebRTC mediante WSS + DTLS-SRTP.
- API con JWT y rate limiting.
- AMI/ARI solo en red Docker.
- Fail2ban incluido.
- Credenciales por variables/secrets, nunca hardcodeadas.
- ACL de VONO configurable en PJSIP y firewall.

## Errores SIP frecuentes

- **401 Unauthorized**: challenge normal o credenciales/realm incorrectos si persiste.
- **403 Forbidden**: cuenta/CLI/IP no autorizada.
- **404 Not Found**: destino o formato de numeración inválido.
- **486 Busy Here**: destino ocupado.
- **503 Service Unavailable**: proveedor/SBC sin capacidad o temporalmente fuera de servicio.

Revise `docker compose logs -f asterisk api nginx` y active `pjsip set logger on` durante diagnóstico.

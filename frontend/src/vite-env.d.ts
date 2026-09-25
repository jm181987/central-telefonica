/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_SOCKET_URL?: string;
  readonly VITE_SIP_WS_URL?: string;
  readonly VITE_SIP_DOMAIN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

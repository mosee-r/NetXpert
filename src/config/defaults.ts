export const APP_DEFAULTS = {
  serverId: 'auto',
  dnsDomain: '1.1.1.1',
  port: 3000,
  cloudflareHost: 'speed.cloudflare.com',
} as const;

export const DEFAULT_SERVER_ID = APP_DEFAULTS.serverId;
export const DEFAULT_DNS_DOMAIN = APP_DEFAULTS.dnsDomain;
export const DEFAULT_PORT = APP_DEFAULTS.port;
export const CLOUDFLARE_HOST = APP_DEFAULTS.cloudflareHost;

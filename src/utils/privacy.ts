export function maskIpAddress(ipAddress?: string): string {
  if (!ipAddress) return 'Not available';
  const ipv4 = ipAddress.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) return `${ipv4[1]}.${ipv4[2]}.${ipv4[3]}.***`;
  if (ipAddress.includes(':')) return `${ipAddress.split(':').slice(0, 4).join(':')}:****`;
  return 'Masked for privacy';
}
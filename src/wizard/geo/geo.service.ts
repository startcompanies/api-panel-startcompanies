import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import type { Request } from 'express';
import { isIP } from 'node:net';
import { firstValueFrom } from 'rxjs';

/** Respuesta JSON de ipapi.co (campos usados). */
interface IpApiResponse {
  country_code?: string;
  country_name?: string;
  error?: boolean;
  reason?: string;
}

@Injectable()
export class GeoService {
  private readonly logger = new Logger(GeoService.name);

  constructor(private readonly http: HttpService) {}

  /**
   * IP del cliente para lookup (evita SSRF: solo literales IP).
   */
  extractClientIp(req: Request): string | null {
    const xf = req.headers['x-forwarded-for'];
    if (typeof xf === 'string' && xf.length > 0) {
      const first = xf.split(',')[0]?.trim();
      if (first) {
        const n = this.normalizeIp(first);
        if (isIP(n)) {
          return n;
        }
      }
    }
    const raw = req.socket?.remoteAddress || req.ip;
    if (raw) {
      const n = this.normalizeIp(raw);
      if (isIP(n)) {
        return n;
      }
    }
    return null;
  }

  private stripIpv4MappedPrefix(ip: string): string {
    return ip.startsWith('::ffff:') ? ip.slice(7) : ip;
  }

  private normalizeIp(ip: string): string {
    return this.stripIpv4MappedPrefix(ip.trim());
  }

  /**
   * Solo IPs públicas se pasan a ipapi en la ruta /{ip}/json para geolocalizar al visitante.
   */
  isPublicIpForLookup(ip: string): boolean {
    const host = this.normalizeIp(ip);
    if (!host || isIP(host) === 0) {
      return false;
    }
    if (host === '127.0.0.1' || host === '::1') {
      return false;
    }
    if (host.startsWith('10.')) {
      return false;
    }
    if (host.startsWith('192.168.')) {
      return false;
    }
    if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) {
      return false;
    }
    // IPv6 unique local / link-local (heurística simple)
    if (host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80:')) {
      return false;
    }
    return true;
  }

  async resolveCountry(req: Request): Promise<{ countryCode: string; countryName?: string }> {
    const ip = this.extractClientIp(req);
    const useIp = ip && this.isPublicIpForLookup(ip);
    const url = useIp
      ? `https://ipapi.co/${encodeURIComponent(ip!)}/json/`
      : 'https://ipapi.co/json/';

    const xff = req.headers['x-forwarded-for'];
    const xfStr = typeof xff === 'string' ? xff.split(',')[0]?.trim() : undefined;
    const cfRaw = req.headers['cf-connecting-ip'];
    const cfStr = typeof cfRaw === 'string' ? cfRaw.trim() : undefined;
    const socketIp = req.socket?.remoteAddress

    this.logger.log(
      `[Geo] extractedIp=${ip ?? 'null'} publicForLookup=${useIp} ` +
        `mode=${useIp ? 'ipapi_by_client_ip' : 'ipapi_server_egress'} ` +
        `xffFirst=${xfStr ?? '—'} cfConnectingIp=${cfStr ?? '—'} socket=${socketIp ?? '—'}`,
    );

    try {
      const { data } = await firstValueFrom(
        this.http.get<IpApiResponse>(url, {
          timeout: 8000,
          validateStatus: (s) => s >= 200 && s < 500,
        }),
      );

      if (!data || data.error) {
        this.logger.warn(
          `[Geo] ipapi sin país útil (${useIp ? 'ip cliente' : 'salida servidor'}): ${data?.reason ?? 'unknown'} → fallback us`,
        );
        return { countryCode: 'us' };
      }

      const code = (data.country_code || 'US').toString().toLowerCase();
      this.logger.log(
        `[Geo] resultado ipapi: countryCode=${code} countryName=${data.country_name ?? '—'} (sin fallback)`,
      );
      return {
        countryCode: code,
        countryName: data.country_name,
      };
    } catch (e) {
      this.logger.warn(`Geo lookup failed: ${e instanceof Error ? e.message : e}`);
      return { countryCode: 'us' };
    }
  }
}

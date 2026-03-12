import { prisma } from '../../services/PrismaService.js';

interface SanitizeOptions {
  allowHtml?: boolean;
  allowScripts?: boolean;
  allowUrls?: boolean;
}

export class SanitizeGuard {
  private static readonly DANGEROUS_PATTERNS = [
    /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
    /javascript:/gi,
    /on\w+\s*=/gi,
    /data:/gi,
    /vbscript:/gi,
  ];

  static sanitize(input: unknown, options: SanitizeOptions = {}): unknown {

    if (input === null || input === undefined) {
      return input;
    }

    if (typeof input === 'string') {
      return this.sanitizeString(input, options);
    }

    if (Array.isArray(input)) {
      return input.map(item => this.sanitize(item, options));
    }

    if (typeof input === 'object') {
      return this.sanitizeObject(input as Record<string, unknown>, options);
    }

    return input;
  }

  private static sanitizeString(input: string, options: SanitizeOptions): string {
    let result = input;

    if (!options.allowScripts) {
      for (const pattern of this.DANGEROUS_PATTERNS) {
        result = result.replace(pattern, '');
      }
    }

    if (!options.allowHtml) {
      result = result
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;')
        .replace(/\//g, '&#x2F;');
    }

    if (!options.allowUrls) {
      result = result
        .replace(/javascript:/gi, '')
        .replace(/data:/gi, '')
        .replace(/vbscript:/gi, '');
    }

    return result.trim();
  }

  private static sanitizeObject(
    obj: Record<string, unknown>,
    options: SanitizeOptions
  ): Record<string, unknown> {
    const sanitized: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(obj)) {
      const sanitizedKey = this.sanitizeString(key, options);

      if (key !== key.toLowerCase() && key.toLowerCase().includes('html')) {
        sanitized[sanitizedKey] = this.sanitize(value, { ...options, allowHtml: true });
      } else if (key.toLowerCase().includes('url') || key.toLowerCase().includes('href')) {
        sanitized[sanitizedKey] = this.sanitize(value, { ...options, allowUrls: true });
      } else {
        sanitized[sanitizedKey] = this.sanitize(value, options);
      }
    }

    return sanitized;
  }

  static async checkForXSS(payload: Record<string, unknown>): Promise<{
    valid: boolean;
    sanitized: Record<string, unknown>;
    warnings: string[];
  }> {
    const warnings: string[] = [];
    const originalString = JSON.stringify(payload);

    for (const pattern of this.DANGEROUS_PATTERNS) {
      if (pattern.test(originalString)) {
        const match = originalString.match(pattern);
        if (match) {
          warnings.push(`Potential XSS detected: ${match[0].substring(0, 50)}...`);
        }
      }
    }

    const sanitized = this.sanitize(payload) as Record<string, unknown>;

    return {
      valid: warnings.length === 0,
      sanitized,
      warnings,
    };
  }

  static logSanitization(
    traceId: string,
    warnings: string[]
  ): void {
    if (warnings.length > 0) {
      console.warn(`[SANITIZE] trace_id=${traceId} warnings=`, warnings);
      
      prisma.accessLog.create({
        data: {
          method: 'SANITIZE',
          path: '/sanitize-check',
          statusCode: 200,
          traceId,
        },
      }).catch(console.error);
    }
  }
}

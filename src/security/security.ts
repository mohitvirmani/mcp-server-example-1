import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

export interface SecurityConfig {
  jwtSecret: string;
  jwtExpiration: string;
  rateLimitWindow: number;
  rateLimitMax: number;
}

export class SecurityManager {
  private config: SecurityConfig;

  constructor() {
    this.config = {
      jwtSecret: process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production',
      jwtExpiration: process.env.JWT_EXPIRATION || '24h',
      rateLimitWindow: 15 * 60 * 1000, // 15 minutes
      rateLimitMax: 100 // requests per window
    };
  }

  /**
   * Authenticate incoming MCP request. Supports bearer token in `meta.authToken`
   * and optionally in arguments as `authToken`. Prefer meta over args.
   */
  authenticateRequest(request: any): void {
    const tokenFromMeta = request?.params?.meta?.authToken;
    const tokenFromArgs = request?.params?.arguments?.authToken;
    const token = tokenFromMeta || tokenFromArgs;

    if (!token || typeof token !== 'string') {
      throw new Error('Authentication required: missing token');
    }

    // Will throw on invalid/expired
    const decoded = this.verifyToken(token);

    // Attach principal for downstream usage
    (request as any).principal = decoded;
  }

  async validateRequest(request: any): Promise<boolean> {
    try {
      // Basic request validation
      if (!request || !request.params) {
        throw new Error('Invalid request format');
      }

      // Check for required parameters
      if (!request.params.name || !request.params.arguments) {
        throw new Error('Missing required parameters');
      }

      // Validate tool name
      const validTools = ['business_intelligence'];
      if (!validTools.includes(request.params.name)) {
        throw new Error('Invalid tool name');
      }

      // Basic rate limiting (in production, use Redis or similar)
      // For demo purposes, we'll skip detailed rate limiting

      return true;
    } catch (error) {
      console.error('Security validation error:', error);
      throw error;
    }
  }

  generateToken(payload: any): string {
    return jwt.sign(payload, this.config.jwtSecret, {
      expiresIn: this.config.jwtExpiration
    } as jwt.SignOptions);
  }

  verifyToken(token: string): any {
    try {
      return jwt.verify(token, this.config.jwtSecret);
    } catch (error) {
      throw new Error('Invalid or expired token');
    }
  }

  async hashPassword(password: string): Promise<string> {
    const saltRounds = 12;
    return bcrypt.hash(password, saltRounds);
  }

  async comparePassword(password: string, hashedPassword: string): Promise<boolean> {
    return bcrypt.compare(password, hashedPassword);
  }

  sanitizeInput(input: any): any {
    if (typeof input === 'string') {
      // Basic SQL injection prevention
      return input.replace(/['"\\;]/g, '');
    }
    
    if (typeof input === 'object' && input !== null) {
      const sanitized: any = {};
      for (const [key, value] of Object.entries(input)) {
        sanitized[key] = this.sanitizeInput(value);
      }
      return sanitized;
    }
    
    return input;
  }

  validateDateRange(dateRange: any): boolean {
    if (!dateRange) return true;
    
    if (dateRange.start && !this.isValidDate(dateRange.start)) {
      throw new Error('Invalid start date format');
    }
    
    if (dateRange.end && !this.isValidDate(dateRange.end)) {
      throw new Error('Invalid end date format');
    }
    
    if (dateRange.start && dateRange.end) {
      const start = new Date(dateRange.start);
      const end = new Date(dateRange.end);
      
      if (start > end) {
        throw new Error('Start date cannot be after end date');
      }
    }
    
    return true;
  }

  private isValidDate(dateString: string): boolean {
    const date = new Date(dateString);
    return date instanceof Date && !isNaN(date.getTime());
  }

  validateFilters(filters: any): boolean {
    if (!filters) return true;
    
    const validFilterKeys = [
      'customerTier',
      'industry',
      'region',
      'productCategory',
      'status'
    ];
    
    for (const key of Object.keys(filters)) {
      if (!validFilterKeys.includes(key)) {
        throw new Error(`Invalid filter key: ${key}`);
      }
      
      if (Array.isArray(filters[key])) {
        for (const value of filters[key]) {
          if (typeof value !== 'string') {
            throw new Error(`Invalid filter value type for ${key}`);
          }
        }
      }
    }
    
    return true;
  }

  logSecurityEvent(event: string, details: any): void {
    const timestamp = new Date().toISOString();
    console.log(`[SECURITY] ${timestamp} - ${event}:`, details);
  }

  getSecurityConfig(): SecurityConfig {
    return { ...this.config };
  }
}

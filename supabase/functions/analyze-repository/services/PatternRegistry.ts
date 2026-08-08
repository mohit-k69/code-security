export interface DetectionPattern {
  id: string;
  name: string;
  category: string;
  regex: RegExp;
  description: string;
  examples: string[];
  enabled: boolean;
}

export class PatternRegistry {
  public readonly version: string = "1.0";

  // High precision patterns to minimize false positives
  private readonly patterns: DetectionPattern[] = [
    {
      id: "aws-access-key",
      name: "AWS Access Key ID",
      category: "Cloud Credentials",
      regex: /(A3T[A-Z0-9]|AKIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA|ASIA)[A-Z0-9]{16}/g,
      description: "Detects standard AWS Access Key IDs.",
      examples: ["AKIAIOSFODNN7EXAMPLE"],
      enabled: true,
    },
    {
      id: "github-pat",
      name: "GitHub Personal Access Token",
      category: "Authentication Tokens",
      regex: /ghp_[a-zA-Z0-9]{36}/g,
      description: "Detects standard GitHub Personal Access Tokens.",
      examples: ["ghp_16C7e42k292c1cd5EXAMPLE"],
      enabled: true,
    },
    {
      id: "stripe-secret-key",
      name: "Stripe Secret Key",
      category: "API Keys",
      regex: /sk_(live|test)_[0-9a-zA-Z]{24}/g,
      description: "Detects Stripe Secret Keys.",
      examples: ["sk_live_1234567890abcdefghijklmn"],
      enabled: true,
    },
    {
      id: "rsa-private-key",
      name: "RSA Private Key",
      category: "Private Keys",
      regex: /-----BEGIN RSA PRIVATE KEY-----/g,
      description: "Detects the header of an RSA Private Key block.",
      examples: ["-----BEGIN RSA PRIVATE KEY-----"],
      enabled: true,
    },
    {
      id: "generic-db-uri-password",
      name: "Database URI with Password",
      category: "Database Credentials",
      // Matches standard connection strings (e.g., postgres://user:password@host...)
      // Precision favored: must have the exact URL structure
      regex: /(?:postgres|mysql|mongodb|redis|amqp|postgresql):\/\/[^:\s]+:([^@\s]+)@[^\s]+/g,
      description: "Detects embedded passwords in database connection URIs.",
      examples: ["postgres://admin:secret123@localhost:5432/db"],
      enabled: true,
    },
    {
      id: "env-bearer-token",
      name: "Generic Bearer Token",
      category: "Authentication Tokens",
      regex: /Bearer\s+[a-zA-Z0-9\-\._~+/]+=*/g,
      description: "Detects Bearer authorization tokens.",
      examples: ["Bearer eyJhbGciOiJIUzI1NiIsIn..."],
      enabled: true,
    }
  ];

  /**
   * Exposes only the enabled patterns.
   * The detector must not know how or where patterns are stored.
   */
  public getEnabledPatterns(): DetectionPattern[] {
    return this.patterns.filter(p => p.enabled);
  }
}

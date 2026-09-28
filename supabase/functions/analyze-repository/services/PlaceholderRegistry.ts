export interface PlaceholderContract {
  id: string;
  secretType: string;
  placeholder: string;
  description: string;
  enabled: boolean;
}

export class PlaceholderRegistry {
  private readonly placeholders: PlaceholderContract[] = [
    {
      id: "ph-api-key",
      secretType: "API Keys",
      placeholder: "<REDACTED_API_KEY>",
      description: "Placeholder for general API keys like Stripe, OpenAI, etc.",
      enabled: true
    },
    {
      id: "ph-auth-token",
      secretType: "Authentication Tokens",
      placeholder: "<REDACTED_AUTH_TOKEN>",
      description: "Placeholder for JWTs, Bearer tokens, GitHub PATs.",
      enabled: true
    },
    {
      id: "ph-private-key",
      secretType: "Private Keys",
      placeholder: "<REDACTED_PRIVATE_KEY>",
      description: "Placeholder for RSA, DSA, and other private key blocks.",
      enabled: true
    },
    {
      id: "ph-db-cred",
      secretType: "Database Credentials",
      placeholder: "<REDACTED_DATABASE_PASSWORD>",
      description: "Placeholder for embedded database passwords.",
      enabled: true
    },
    {
      id: "ph-cloud-cred",
      secretType: "Cloud Credentials",
      placeholder: "<REDACTED_CLOUD_CREDENTIAL>",
      description: "Placeholder for AWS, GCP, Azure access keys.",
      enabled: true
    },
    {
      id: "ph-env-secret",
      secretType: "Environment Secrets",
      placeholder: "<REDACTED_ENV_SECRET>",
      description: "Placeholder for generic environment secrets.",
      enabled: true
    },
    {
      id: "ph-cert",
      secretType: "Certificates",
      placeholder: "<REDACTED_CERTIFICATE>",
      description: "Placeholder for X.509 and other certs.",
      enabled: true
    }
  ];

  /**
   * Retrieves the deterministic placeholder for a given secret type.
   * If not found, returns null.
   */
  public getPlaceholder(secretType: string): string | null {
    const p = this.placeholders.find(p => p.secretType === secretType && p.enabled);
    return p ? p.placeholder : null;
  }
}

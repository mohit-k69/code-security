export type ProviderErrorType = 
  | "TIMEOUT"
  | "RATE_LIMIT"
  | "AUTH_FAILURE"
  | "INVALID_RESPONSE"
  | "UNAVAILABLE"
  | "UNKNOWN";

export class ProviderError extends Error {
  public type: ProviderErrorType;
  public provider: string;
  public statusCode?: number;

  constructor(type: ProviderErrorType, provider: string, message: string, statusCode?: number) {
    super(`[${provider}] ${type}: ${message}`);
    this.name = "ProviderError";
    this.type = type;
    this.provider = provider;
    this.statusCode = statusCode;
  }
}

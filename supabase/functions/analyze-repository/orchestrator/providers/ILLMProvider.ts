export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface ProviderResponse {
  text: string;
  usage?: TokenUsage;
}

export interface ILLMProvider {
  /**
   * The unique identifier for this provider (e.g., "gemini", "openrouter")
   */
  readonly name: string;

  /**
   * Generates content from the LLM based on a system and user prompt.
   * Must handle its own API key fetching, request construction, retries, and timeout handling.
   * Must throw standardized ProviderError on failure.
   * 
   * @param systemPrompt The system instruction / framework rules
   * @param userPrompt The specific review task + context + output schema
   * @param model (Optional) The specific model to use, defaults to a provider-specific default
   * @returns The ProviderResponse containing the text and optional token usage
   */
  generateContent(systemPrompt: string, userPrompt: string, model?: string): Promise<ProviderResponse>;
}

import type { ILLMProvider, ProviderResponse } from "./ILLMProvider.ts";
import { ProviderError } from "./ProviderError.ts";

const OPENROUTER_API_BASE = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_TIMEOUT_MS = 60000; // 60 seconds

export class OpenRouterProvider implements ILLMProvider {
  public readonly name = "openrouter";
  private defaultModel?: string;

  /**
   * Initializes the OpenRouter provider.
   * @param defaultModel The model to use if none is specified during execution.
   */
  constructor(defaultModel?: string) {
    this.defaultModel = defaultModel;
  }

  public async generateContent(
    systemPrompt: string, 
    userPrompt: string, 
    model?: string
  ): Promise<ProviderResponse> {
    const apiKey = Deno.env.get("OPENROUTER_API_KEY");
    if (!apiKey) {
      throw new ProviderError("AUTH_FAILURE", this.name, "OPENROUTER_API_KEY environment variable is not set.");
    }

    const targetModel = model || this.defaultModel;
    if (!targetModel) {
      throw new ProviderError("UNKNOWN", this.name, "No model configured. You must specify a model via the constructor or generation request.");
    }

    const requestBody = {
      model: targetModel,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      // Encourages valid JSON generation for supporting models
      response_format: { type: "json_object" },
      temperature: 0.1,
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(OPENROUTER_API_BASE, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          // OpenRouter recommends these headers for routing and analytics
          "HTTP-Referer": "https://code-security.dev",
          "X-Title": "Code Security AI Review",
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (err.name === "AbortError") {
        throw new ProviderError("TIMEOUT", this.name, `Request timed out after ${DEFAULT_TIMEOUT_MS}ms`);
      }
      throw new ProviderError("UNAVAILABLE", this.name, `Fetch failed: ${err.message}`);
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      const errorBody = await response.text();
      let type: import("./ProviderError.ts").ProviderErrorType = "UNKNOWN";
      
      if (response.status === 401 || response.status === 403) type = "AUTH_FAILURE";
      else if (response.status === 429) type = "RATE_LIMIT";
      else if (response.status >= 500) type = "UNAVAILABLE";

      throw new ProviderError(type, this.name, errorBody, response.status);
    }

    let json: any;
    try {
      json = await response.json();
    } catch {
      throw new ProviderError("INVALID_RESPONSE", this.name, "Failed to parse JSON response from provider");
    }

    const choices = json?.choices;
    if (!choices || choices.length === 0) {
      throw new ProviderError("INVALID_RESPONSE", this.name, "OpenRouter returned no choices.");
    }

    const text = choices[0]?.message?.content;
    if (!text) {
      throw new ProviderError("INVALID_RESPONSE", this.name, "OpenRouter response contained no text content.");
    }

    const responseObj: ProviderResponse = { text };

    if (json.usage) {
      responseObj.usage = {
        promptTokens: json.usage.prompt_tokens || 0,
        completionTokens: json.usage.completion_tokens || 0,
        totalTokens: json.usage.total_tokens || 0,
      };
    }

    return responseObj;
  }
}

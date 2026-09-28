import type { ILLMProvider, ProviderResponse } from "./ILLMProvider.ts";
import { ProviderError } from "./ProviderError.ts";

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_TIMEOUT_MS = 60000; // 60 seconds

export class GeminiProvider implements ILLMProvider {
  public readonly name = "gemini";
  private defaultModel?: string;

  constructor(defaultModel?: string) {
    this.defaultModel = defaultModel;
  }

  public async generateContent(
    systemPrompt: string, 
    userPrompt: string, 
    model?: string
  ): Promise<ProviderResponse> {
    const targetModel = model || this.defaultModel;
    if (!targetModel) {
      throw new ProviderError("UNKNOWN", this.name, "No model configured. You must specify a model via the constructor or generation request.");
    }
    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) {
      throw new ProviderError("AUTH_FAILURE", this.name, "GEMINI_API_KEY environment variable is not set.");
    }

    const requestBody = {
      system_instruction: {
        parts: [{ text: systemPrompt }],
      },
      contents: [
        {
          role: "user",
          parts: [{ text: userPrompt }],
        },
      ],
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.1,
      },
    };

    const url = `${GEMINI_API_BASE}/${targetModel}:generateContent?key=${apiKey}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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

    const candidates = json?.candidates;
    if (!candidates || candidates.length === 0) {
      throw new ProviderError("INVALID_RESPONSE", this.name, "Gemini returned no candidates.");
    }

    const text = candidates[0]?.content?.parts?.[0]?.text;
    if (!text) {
      throw new ProviderError("INVALID_RESPONSE", this.name, "Gemini response contained no text content.");
    }

    const responseObj: ProviderResponse = { text };
    
    if (json.usageMetadata) {
      responseObj.usage = {
        promptTokens: json.usageMetadata.promptTokenCount || 0,
        completionTokens: json.usageMetadata.candidatesTokenCount || 0,
        totalTokens: json.usageMetadata.totalTokenCount || 0,
      };
    }

    return responseObj;
  }
}

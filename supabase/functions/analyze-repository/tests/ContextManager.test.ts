import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { ContextManager } from "../services/ContextManager.ts";
import { ProviderService } from "../services/ProviderService.ts";
import { DependencyResolver } from "../services/DependencyResolver.ts";

// Mock ProviderService
class MockProviderService implements ProviderService {
  public mockChangedFiles: any[] = [];
  public mockFileContent: Record<string, string> = {};

  async getOpenPullRequests(owner: string, repo: string) {
    return [];
  }

  async getPullRequestDetails(owner: string, repo: string, prNumber: number) {
    return { number: prNumber, head: { sha: "mocksha" }, updated_at: "now" } as any;
  }

  async getDiff(owner: string, repo: string, prNumber: number) {
    return "";
  }

  async getChangedFiles(owner: string, repo: string, prNumber: number) {
    return this.mockChangedFiles;
  }

  async getFileContent(owner: string, repo: string, path: string, commitSha: string) {
    if (this.mockFileContent[path] !== undefined) {
      return this.mockFileContent[path];
    }
    throw new Error(`File not found: ${path}`);
  }
}

Deno.test("ContextManager - PR with only README.md returns PipelineError", async () => {
  const provider = new MockProviderService();
  provider.mockChangedFiles = [
    { filename: "README.md", status: "modified" }
  ];
  provider.mockFileContent["README.md"] = "# Readme";

  const resolver = new DependencyResolver();
  const manager = new ContextManager(provider, resolver);

  const result = await manager.buildContext("test", "test", 1, "sha");
  
  assertEquals("stage" in result, true);
  if ("stage" in result) {
    assertEquals(result.message, "No supported source files were available for security analysis.");
  }
});

Deno.test("ContextManager - PR with only unsupported files returns PipelineError", async () => {
  const provider = new MockProviderService();
  provider.mockChangedFiles = [
    { filename: "image.png", status: "added" },
    { filename: "config.json", status: "modified" }
  ];
  provider.mockFileContent["image.png"] = "binary";
  provider.mockFileContent["config.json"] = "{}";

  const resolver = new DependencyResolver();
  const manager = new ContextManager(provider, resolver);

  const result = await manager.buildContext("test", "test", 1, "sha");
  
  assertEquals("stage" in result, true);
  if ("stage" in result) {
    assertEquals(result.message, "No supported source files were available for security analysis.");
  }
});

Deno.test("ContextManager - PR with mixed supported and unsupported files processes only supported files", async () => {
  const provider = new MockProviderService();
  provider.mockChangedFiles = [
    { filename: "README.md", status: "modified" },
    { filename: "src/app.ts", status: "added" }
  ];
  provider.mockFileContent["README.md"] = "# Readme";
  provider.mockFileContent["src/app.ts"] = "console.log('hello');";

  const resolver = new DependencyResolver();
  const manager = new ContextManager(provider, resolver);

  const result = await manager.buildContext("test", "test", 1, "sha");
  
  assertEquals("stage" in result, false);
  if (!("stage" in result)) {
    assertEquals(result.changedFiles.length, 1);
    assertEquals(result.changedFiles[0].path, "src/app.ts");
  }
});

Deno.test("ContextManager - PR with supported source files works normally", async () => {
  const provider = new MockProviderService();
  provider.mockChangedFiles = [
    { filename: "src/app.ts", status: "modified" }
  ];
  provider.mockFileContent["src/app.ts"] = "import { auth } from './auth';";
  // We mock the dependency fallback attempt but let it fail gracefully if not needed
  
  const resolver = new DependencyResolver();
  const manager = new ContextManager(provider, resolver);

  const result = await manager.buildContext("test", "test", 1, "sha");
  
  assertEquals("stage" in result, false);
  if (!("stage" in result)) {
    assertEquals(result.changedFiles.length, 1);
    assertEquals(result.changedFiles[0].path, "src/app.ts");
  }
});

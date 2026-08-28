if (typeof globalThis.Deno === 'undefined') {
  (globalThis as any).Deno = {
    test: (name: string, fn: Function) => {
      console.log(`[TEST] ${name}`);
      return fn();
    }
  };
}
import "./supabase/functions/analyze-repository/services/__tests__/CheckpointRunner.test.ts";

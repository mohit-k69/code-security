globalThis.Deno = { env: { get: () => "dummy" } };
console.log(Deno.env.get("test"));

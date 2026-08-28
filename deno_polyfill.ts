const tests: Array<{name: string, fn: Function}> = [];
(globalThis as any).Deno = {
  test: (name: string, fn: Function) => {
    tests.push({name, fn});
  }
};
export { tests };

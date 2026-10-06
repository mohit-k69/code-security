import * as assert from 'assert';
import * as useAuth from '../src/hooks/useAuth';

const tests = [
  function testResolveFlowProviderIgnoresGithub() {
    (global as any).window = {
      location: { search: '', hash: '#access_token=google123&provider_token=google123' },
      sessionStorage: { getItem: () => 'github' },
      localStorage: { getItem: () => 'github' },
    };
    const provider = useAuth.resolveFlowProvider();
    assert.strictEqual(provider, null);
    console.log('✅ resolveFlowProvider ignores github in localStorage');
  },
  function testResolveFlowProviderAllowsGitlabWithCallback() {
    (global as any).window = {
      location: { search: '', hash: '#access_token=gitlab123&provider_token=gitlab123' },
      sessionStorage: { getItem: () => null },
      localStorage: { getItem: () => 'gitlab' },
    };
    const provider = useAuth.resolveFlowProvider();
    assert.strictEqual(provider, 'gitlab');
    console.log('✅ resolveFlowProvider allows gitlab in localStorage if callback params present');
  },
  function testResolveFlowProviderIgnoresGitlabWithoutCallback() {
    (global as any).window = {
      location: { search: '', hash: '' },
      sessionStorage: { getItem: () => null },
      localStorage: { getItem: () => 'gitlab' },
    };
    const provider = useAuth.resolveFlowProvider();
    assert.strictEqual(provider, null);
    console.log('✅ resolveFlowProvider ignores gitlab in localStorage if NO callback params present');
  }
];

let failed = false;
for (const test of tests) {
  try {
    test();
  } catch (e) {
    console.error(`❌ ${test.name} failed:`, e);
    failed = true;
  }
}
if (failed) process.exit(1);

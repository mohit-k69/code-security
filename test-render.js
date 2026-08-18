require('@babel/register')({
  presets: ['@babel/preset-env', '@babel/preset-react', '@babel/preset-typescript'],
  extensions: ['.js', '.jsx', '.ts', '.tsx']
});
const React = require('react');
const { renderToString } = require('react-dom/server');
const { GithubAnalysisModals } = require('./src/components/workflows/github/GithubAnalysisModals.tsx');

const mockState = {
  status: 'success',
  report: {
    verdict: 'FAIL',
    repository: {
      owner: 'test',
      name: 'repo',
      prNumber: 1,
    },
    totalFindings: 1,
    findings: {
      critical: [
        {
          findingId: '123',
          title: 'Test finding',
          vulnerabilityClass: 'XSS',
          description: 'Description',
          suggestion: 'Fix it'
        }
      ],
      warning: [],
      info: []
    }
  }
};

try {
  const html = renderToString(
    React.createElement(GithubAnalysisModals, {
      analysisState: mockState,
      setAnalysisState: () => {},
      githubRepos: [],
      selectedRepoId: 1,
      handleAnalyze: () => {}
    })
  );
  console.log("RENDER SUCCESS. Output size:", html.length);
} catch (e) {
  console.error("RENDER ERROR:", e);
}

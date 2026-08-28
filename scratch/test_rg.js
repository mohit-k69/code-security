const { ReportGenerator } = require('./supabase/functions/analyze-repository/orchestrator/report/ReportGenerator.js') || {};
const fs = require('fs');
const content = fs.readFileSync('supabase/functions/analyze-repository/orchestrator/report/ReportGenerator.ts', 'utf8');
const returnsNotVerified = content.includes('return "NOT_VERIFIED"');
console.log('Does ReportGenerator have return "NOT_VERIFIED"?', returnsNotVerified);

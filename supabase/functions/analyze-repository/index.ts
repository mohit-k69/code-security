import { createClient } from "https://esm.sh/@supabase/supabase-js@2.111.0";
import { PipelineRunner } from "./orchestrator/PipelineRunner.ts";
import { GithubService } from "./services/GithubService.ts";
import { GitlabService } from "./services/GitlabService.ts";
import { BitbucketService } from "./services/BitbucketService.ts";
import { AzureDevOpsService } from "./services/AzureDevOpsService.ts";
import { PRSelector } from "./services/PRSelector.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status,
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return jsonResponse({ error: 'No authorization header' }, 401);
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token);
    
    if (userError || !user) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    const reqBody = await req.json();
    const provider = reqBody.provider || 'github';
    const owner = reqBody.owner || '';
    const repo = reqBody.repo || (reqBody.projectId ? String(reqBody.projectId) : '') || reqBody.repositoryId || '';
    const prNumber = reqBody.prNumber || reqBody.mrIid || reqBody.pullRequestId;

    if (!repo) {
      return jsonResponse({ error: 'Missing repository/project parameters.' }, 400);
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data: connection, error: dbError } = await supabaseAdmin
      .from('oauth_connections')
      .select('provider, access_token')
      .eq('user_id', user.id)
      .eq('provider', provider)
      .single();

    if (dbError || !connection || !connection.access_token) {
      const providerLabels: Record<string, string> = {
        github: 'GitHub',
        gitlab: 'GitLab',
        bitbucket: 'Bitbucket',
        azure: 'Azure DevOps',
      };
      const label = providerLabels[provider] || provider;
      return jsonResponse({ error: `${label} is not connected. Please connect your account.` }, 404);
    }

    const openRouterKey = Deno.env.get('OPENROUTER_API_KEY');
    if (!openRouterKey) {
      return jsonResponse({ error: 'Internal error: OPENROUTER_API_KEY not configured.' }, 500);
    }

    const llmModel = Deno.env.get('LLM_MODEL');
    const standardModel = Deno.env.get('STANDARD_MODEL') || llmModel;
    const majorModel = Deno.env.get('MAJOR_MODEL') || standardModel;
    
    if (!standardModel || !majorModel) {
      return jsonResponse({ error: 'Internal error: LLM_MODEL or STANDARD_MODEL not configured.' }, 500);
    }

    let providerService;
    if (provider === 'gitlab') {
      providerService = new GitlabService(connection.access_token);
    } else if (provider === 'bitbucket') {
      providerService = new BitbucketService(connection.access_token);
    } else if (provider === 'azure') {
      providerService = new AzureDevOpsService(connection.access_token, reqBody.organization || '', reqBody.project || '');
    } else {
      providerService = new GithubService(connection.access_token);
    }

    let prNumberToReview = typeof prNumber === 'number' ? prNumber : null;
    let commitShaToReview = null;

    if (prNumberToReview) {
      try {
        const prDetails = await providerService.getPullRequestDetails(owner, repo, prNumberToReview);
        commitShaToReview = prDetails.head.sha;
      } catch (err: any) {
        return jsonResponse({ error: `Failed to fetch PR details: ${err.message}` }, 400);
      }
    } else {
      const selector = new PRSelector(supabaseAdmin, providerService, provider);
      const sel = await selector.selectNextReview(owner, repo);
      if (sel.status !== 'pr_selected') {
        if (sel.status === 'no_prs' || sel.status === 'all_reviewed') {
          return jsonResponse({ status: 'no_prs', message: sel.message });
        }
        return jsonResponse({ error: sel.message || 'No open Pull Requests available.' }, 400);
      }
      prNumberToReview = sel.prNumber!;
      commitShaToReview = sel.commitSha!;
    }

    // Attempt to reserve the limit (throws if limit exceeded or idempotency conflict)
    const repoFullName = `${owner}/${repo}`;
    const { data: reservationId, error: reserveError } = await supabaseAdmin.rpc('reserve_review_slot', {
      p_user_id: user.id,
      p_limit: 5,
      p_name: repoFullName,
      p_review_type: provider,
      p_repository_owner: owner,
      p_repository_name: repo,
      p_pr_number: prNumberToReview,
      p_commit_sha: commitShaToReview
    });

    if (reserveError) {
      if (reserveError.message?.includes('Limit exceeded')) {
        return jsonResponse({ error: 'You have completed all 5 free reviews. Additional repository scans cannot be started on this account.' }, 429);
      }
      if (reserveError.message?.includes('Idempotency conflict')) {
        return jsonResponse({ error: 'This specific commit is already being scanned or was already scanned.' }, 409);
      }
      console.error('Reservation error:', reserveError);
      return jsonResponse({ error: 'Failed to reserve scan slot.' }, 500);
    }

    let pipelineResult;
    let heartbeatInterval: number | undefined;

    try {
      heartbeatInterval = setInterval(async () => {
        try {
          await supabaseAdmin.rpc('heartbeat_review_reservation', {
            p_reservation_id: reservationId,
            p_user_id: user.id
          });
        } catch (e) {
          console.error('Heartbeat failed:', e);
        }
      }, 5 * 60 * 1000); // 5 minutes

      const runner = new PipelineRunner();
      pipelineResult = await runner.run({
        owner,
        repo,
        supabaseAdmin,
        providerService,
        prNumber: prNumberToReview,
        commitSha: commitShaToReview,
        openRouterKey,
        standardModel,
        majorModel
      });
    } catch (e: any) {
      pipelineResult = { type: 'error', message: e.message, status: 500 };
    } finally {
      if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
      }
    }

    const isDebug = Deno.env.get('DEBUG_INSTRUMENTATION') === 'true';

    if (pipelineResult.type === 'success') {
      const reportData: any = pipelineResult.data;
      const verdict = reportData.report?.verdict || 'NOT_VERIFIED';
      
      let totalFindings = 0;
      if (Array.isArray(reportData.report?.findings)) {
        totalFindings = reportData.report.findings.length;
      } else if (reportData.report?.findings) {
        const f = reportData.report.findings;
        totalFindings = (f.critical?.length || 0) + (f.warning?.length || 0) + (f.info?.length || 0);
      }

      await supabaseAdmin.rpc('finalize_review', {
        p_reservation_id: reservationId,
        p_user_id: user.id,
        p_verdict: verdict,
        p_total_findings: totalFindings,
        p_report: reportData.report || reportData
      });

      return isDebug 
        ? jsonResponse(reportData) 
        : jsonResponse({ report: reportData.report });
    } else {
      await supabaseAdmin.rpc('release_review_reservation', {
        p_reservation_id: reservationId,
        p_user_id: user.id
      });

      if (pipelineResult.type === 'empty') {
        const emptyData: any = pipelineResult.data;
        return isDebug 
          ? jsonResponse({ report: emptyData, message: pipelineResult.message }) 
          : jsonResponse({ report: emptyData });
      } else {
        const errResult: any = pipelineResult;
        return jsonResponse({ error: errResult.message }, errResult.status || 500);
      }
    }

  } catch (error: any) {
    console.error('analyze-repository error:', error.message);
    return jsonResponse({ error: 'Internal server error during analysis orchestration.' }, 500);
  }
});

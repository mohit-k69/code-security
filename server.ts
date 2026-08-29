import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import fs from "fs";
import dotenv from "dotenv";

dotenv.config({ path: '.env.local' });
dotenv.config();

import analyzeRepository from './supabase/functions/analyze-repository/index.ts';
import deleteAccount from './supabase/functions/delete-account/index.ts';
import fetchGithubPullRequests from './supabase/functions/fetch-github-pull-requests/index.ts';
import fetchGithubRepositories from './supabase/functions/fetch-github-repositories/index.ts';
import storeProviderToken from './supabase/functions/store-provider-token/index.ts';

const edgeFunctions = new Map<string, (req: Request) => Promise<Response>>();
edgeFunctions.set('analyze-repository', analyzeRepository);
edgeFunctions.set('delete-account', deleteAccount);
edgeFunctions.set('fetch-github-pull-requests', fetchGithubPullRequests);
edgeFunctions.set('fetch-github-repositories', fetchGithubRepositories);
edgeFunctions.set('store-provider-token', storeProviderToken);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Supabase Edge Functions proxy route
  app.all('/api/functions/:name', async (req, res) => {
    const { name } = req.params;
    
    try {
      const handler = edgeFunctions.get(name);
      if (!handler) {
        return res.status(404).json({ error: 'Function not found' });
      }

      // Convert Express request to Standard Web Request
      const url = `http://localhost:${PORT}${req.originalUrl}`;
      const headers = new Headers();
      for (const [key, value] of Object.entries(req.headers)) {
        if (typeof value === 'string') {
          headers.set(key, value);
        } else if (Array.isArray(value)) {
          value.forEach(v => headers.append(key, v));
        }
      }

      const init: RequestInit = {
        method: req.method,
        headers,
      };
      
      // Pass raw body if applicable
      if (req.method !== 'GET' && req.method !== 'HEAD' && Object.keys(req.body).length > 0) {
        init.body = JSON.stringify(req.body);
      }

      const standardReq = new Request(url, init);
      const standardRes = await handler(standardReq);

      // Apply CORS headers explicitly just in case edge functions expect it to pass through
      standardRes.headers.forEach((value, key) => {
        res.setHeader(key, value);
      });
      
      res.status(standardRes.status);
      const text = await standardRes.text();
      res.send(text);
      
    } catch (err: any) {
      console.error(`Error in Edge function [${name}]:`, err);
      res.status(500).json({ error: err.message || 'Internal Server Error' });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();

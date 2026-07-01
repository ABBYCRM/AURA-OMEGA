# Kimi-Style Workers for AURA-OMEGA

Three Cloudflare Workers that replicate Kimi's agentic capabilities, running on the operator's CF Workers AI account with zero-cost inference.

## Workers

| Worker | Model | Purpose |
|--------|-------|---------|
| `kimi-agent` | Llama 3.3 70B | Task planning + step-by-step execution |
| `kimi-search` | Llama 3.3 70B | Web search + page reading + synthesis |
| `kimi-reasoner` | DeepSeek R1 Qwen 32B | Multi-step reasoning + self-correction |

## Deploy

```bash
cd workers/kimi-agent && npx wrangler deploy
cd workers/kimi-search && npx wrangler deploy
cd workers/kimi-reasoner && npx wrangler deploy
```

## API Usage

### kimi-agent
```bash
curl -X POST https://kimi-agent.<your-subdomain>.workers.dev \
  -H "Content-Type: application/json" \
  -d '{"task": "Analyze the pros and cons of solar energy for residential use", "context": "Homeowner in Florida"}'
```

Returns: `{ task, steps: [{step, result, confidence}], finalAnswer, overallConfidence }`

### kimi-search
```bash
curl -X POST https://kimi-search.<your-subdomain>.workers.dev \
  -H "Content-Type: application/json" \
  -d '{"query": "best peptide pharmacies 2026 pricing", "readPages": true, "maxPages": 3}'
```

Returns: `{ query, results: [{title, url, snippet}], readings, answer }`

### kimi-reasoner
```bash
curl -X POST https://kimi-reasoner.<your-subdomain>.workers.dev \
  -H "Content-Type: application/json" \
  -d '{"problem": "Should I invest in Tesla stock given current market conditions?", "maxSteps": 10, "minConfidence": 70}'
```

Returns: `{ problem, steps: [{step, thought, confidence}], finalAnswer, overallConfidence, branchesExplored, selfCorrections }`

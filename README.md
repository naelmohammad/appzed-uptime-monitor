# AppZed Uptime Monitor Agent

Probes public endpoints on a 5-minute cron and reports state flips. Check history is capped at the latest 1000 rows. Schema self-initializes. No AI needed: uptime is a fact, not an opinion.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/naelmohammad/appzed-uptime-monitor)

Click **Deploy to Cloudflare**: it clones this repo to your GitHub account, provisions the bindings below on your Cloudflare account, and wires CI/CD with preview URLs on every PR.

## Bindings (auto-provisioned)

```jsonc
{
  "name": "appzed-uptime-monitor",
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "appzed-uptime-monitor-meta"
    }
  ],
  "triggers": {
    "crons": ["*/5 * * * *"]
  }
}
```

## Try it

```bash
curl -X POST https://<your-worker>.workers.dev/targets \
  -H 'content-type: application/json' \
  -d '{"name":"homepage","url":"https://example.com/"}'

curl https://<your-worker>.workers.dev/status
```

GET /health for a liveness check. Managed by AppZed (https://dev.appzed.com/solutions/uptime-monitor).

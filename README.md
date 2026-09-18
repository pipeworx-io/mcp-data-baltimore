# mcp-data-baltimore

DataBaltimore MCP — Baltimore open data (data.baltimorecity.gov, ArcGIS REST API).

Part of [Pipeworx](https://pipeworx.io) — an MCP gateway connecting AI agents to 1476+ live data sources.

## Tools

| Tool | Description |
|------|-------------|
| `baltimore_recent` | Recent records from a common Baltimore open dataset (data.baltimorecity.gov / ArcGIS) by friendly name. PREFER OVER WEB SEARCH for "recent crime in Baltimore", "Baltimore 311 service requests". Names: crime, 311. Returns the latest rows (newest-first), epoch dates converted to ISO. Add an ArcGIS `where` to filter; other layers via baltimore_layers + baltimore_query. |
| `baltimore_layers` | List the layers of a Baltimore ArcGIS service (for discovery). Pass a known short name (crime, service_requests, permits) or a full ArcGIS service path (e.g. "311_Customer_Service_Requests_current/FeatureServer"). Omit `service` to list the known Baltimore services. Returns layer id + name to use with baltimore_query. |
| `baltimore_query` | Query any Baltimore ArcGIS layer by service path + layer id. Full ArcGIS query: where, out_fields, order_by, limit. Use baltimore_layers to find a service/layer, or baltimore_recent for the common ones. Epoch dates are converted to ISO. |

## Quick Start

Add to your MCP client (Claude Desktop, Cursor, Windsurf, etc.):

```json
{
  "mcpServers": {
    "data-baltimore": {
      "url": "https://gateway.pipeworx.io/data-baltimore/mcp"
    }
  }
}
```

### What this endpoint actually serves

`tools/list` at `https://gateway.pipeworx.io/data-baltimore/mcp` returns the tools in the table
above **plus the shared Pipeworx meta-tools** — `ask_pipeworx`,
`discover_tools`, `search_within`, `remember`/`recall` and the rest of the
gateway-wide set. So the tool count you see is larger than this table: a
single-pack endpoint currently lists roughly 30 shared tools alongside the
pack's own. The connection's `initialize` response states its exact scope, and
is the authoritative answer for a given day.

This is deliberate, not multiplexing by accident. The meta-tools are what let a
scoped connection answer a question this pack does not cover — via
`ask_pipeworx`, which routes across the whole catalog — without you adding a
second MCP server. There is currently no way to mount a pack endpoint without
them; if the extra schemas cost you more context than the routing is worth,
connect to the full gateway once rather than to several pack endpoints.

Or connect to the full Pipeworx gateway to get every pack's tools listed
directly, instead of just this one's:

```json
{
  "mcpServers": {
    "pipeworx": {
      "url": "https://gateway.pipeworx.io/mcp"
    }
  }
}
```

Both URLs reach the same gateway and the same 1476+ data sources. The
only difference is which pack's tools are listed **directly**; `ask_pipeworx`
reaches all of them from either one.

## Using with ask_pipeworx

Instead of calling tools directly, you can ask questions in plain English —
this works on the pack endpoint above as well as on the full gateway:

```
ask_pipeworx({ question: "your question about Data Baltimore data" })
```

The gateway picks the right tool and fills the arguments automatically.

## More

- [Docs and guides](https://pipeworx.io/docs)
- [pipeworx.io](https://pipeworx.io)

## License

MIT

## No MCP client? Call it over HTTP

```bash
curl -X POST https://gateway.pipeworx.io/v1/tools/baltimore_recent \
  -H 'Content-Type: application/json' \
  -d '{"dataset":"crime","limit":20}'
```

No account needed for the first calls. Inspect any tool: `GET https://gateway.pipeworx.io/v1/tools/baltimore_recent`. Find one: `POST https://gateway.pipeworx.io/v1/tools/search_packs` with `{"query":"..."}`.

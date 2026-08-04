# mcp-data-baltimore

DataBaltimore MCP — Baltimore open data (data.baltimorecity.gov, ArcGIS REST API).

Part of [Pipeworx](https://pipeworx.io) — an MCP gateway connecting AI agents to 1394+ live data sources.

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

Or connect to the full Pipeworx gateway for access to all 1394+ data sources:

```json
{
  "mcpServers": {
    "pipeworx": {
      "url": "https://gateway.pipeworx.io/mcp"
    }
  }
}
```

## Using with ask_pipeworx

Instead of calling tools directly, you can ask questions in plain English:

```
ask_pipeworx({ question: "your question about Data Baltimore data" })
```

The gateway picks the right tool and fills the arguments automatically.

## More

- [Docs and guides](https://pipeworx.io/docs)
- [pipeworx.io](https://pipeworx.io)

## License

MIT

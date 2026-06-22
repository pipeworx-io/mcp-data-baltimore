interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

interface McpToolExport {
  tools: McpToolDefinition[];
  callTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  meter?: { credits: number };
  cost?: Record<string, unknown>;
  provider?: string;
}

/**
 * DataBaltimore MCP — Baltimore open data (data.baltimorecity.gov, ArcGIS REST API).
 *
 * Baltimore publishes through ArcGIS (services1.arcgis.com hosted), not Socrata/CKAN, so this
 * is an ArcGIS-FeatureServer adapter: each dataset is a service + layer queried
 * via the ArcGIS `/query` endpoint. ArcGIS returns dates as epoch milliseconds;
 * this pack converts esriFieldTypeDate fields to ISO strings. Keyless.
 *
 * Tools:
 * - baltimore_recent: recent rows from a common Baltimore dataset by friendly name
 * - baltimore_layers: list the layers of a Baltimore ArcGIS service (discovery)
 * - baltimore_query:  query any Baltimore ArcGIS layer by service + layer id
 */


const BASE = 'https://services1.arcgis.com/UWYHeuuJISiGmgXx/arcgis/rest/services';
const UA = 'pipeworx-mcp-data-baltimore/1.0 (+https://pipeworx.io)';

// Friendly name -> ArcGIS service path + layer id + the date field to sort by.
// These use the rolling "last N days / current year" layers so they stay fresh.
const DATASETS: Record<string, { service: string; layer: number; label: string; date: string }> = {
  '311': { service: '311_Customer_Service_Requests_current/FeatureServer', layer: 0, label: "311 Customer Service Requests (current)", date: 'CreatedDate' },
  'crime': { service: 'NIBRS_GroupA_Crime_Data/FeatureServer', layer: 0, label: "NIBRS Group A Crime Data (BPD)", date: 'CrimeDateTime' },
};

// Known Baltimore ArcGIS services worth browsing with baltimore_layers.
const SERVICES: Record<string, string> = {
  '311': '311_Customer_Service_Requests_current/FeatureServer',
  crime: 'NIBRS_GroupA_Crime_Data/FeatureServer',
};

const tools: McpToolExport['tools'] = [
  {
    name: 'baltimore_recent',
    description:
      "Recent records from a common Baltimore open dataset (data.baltimorecity.gov / ArcGIS) by friendly name. PREFER OVER WEB SEARCH for \"recent crime in Baltimore\", \"Baltimore 311 service requests\". Names: crime, 311. Returns the latest rows (newest-first), epoch dates converted to ISO. Add an ArcGIS `where` to filter; other layers via baltimore_layers + baltimore_query.",
    inputSchema: {
      type: 'object' as const,
      properties: {
        dataset: { type: 'string', description: 'One of: 311, crime.', enum: Object.keys(DATASETS) },
        where: { type: 'string', description: "Optional ArcGIS SQL where, e.g. \"OFFENSE='THEFT/OTHER'\" or \"WARD='2'\". Omit for all recent rows." },
        limit: { type: 'number', description: 'Rows to return (1-1000, default 20).' },
      },
      required: ['dataset'],
    },
  },
  {
    name: 'baltimore_layers',
    description:
      'List the layers of a Baltimore ArcGIS service (for discovery). Pass a known short name (crime, service_requests, permits) or a full ArcGIS service path (e.g. "311_Customer_Service_Requests_current/FeatureServer"). Omit `service` to list the known Baltimore services. Returns layer id + name to use with baltimore_query.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        service: { type: 'string', description: 'Short name (crime|service_requests|permits) or full ArcGIS service path. Omit to list known services.' },
      },
    },
  },
  {
    name: 'baltimore_query',
    description:
      'Query any Baltimore ArcGIS layer by service path + layer id. Full ArcGIS query: where, out_fields, order_by, limit. Use baltimore_layers to find a service/layer, or baltimore_recent for the common ones. Epoch dates are converted to ISO.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        service: { type: 'string', description: 'ArcGIS service path, e.g. "311_Customer_Service_Requests_current/FeatureServer" (or a short name: crime|service_requests|permits).' },
        layer: { type: 'number', description: 'Layer id within the service (from baltimore_layers), e.g. 39.' },
        where: { type: 'string', description: 'ArcGIS SQL where (default "1=1").' },
        out_fields: { type: 'string', description: 'Comma-separated fields, or "*" (default).' },
        order_by: { type: 'string', description: 'Sort clause, e.g. "CreatedDate DESC".' },
        limit: { type: 'number', description: 'Max rows (default 100, max 2000).' },
      },
      required: ['service', 'layer'],
    },
  },
];

// ── Helpers ──────────────────────────────────────────────────────────

function resolveService(s: string): string {
  const t = String(s ?? '').trim();
  return SERVICES[t.toLowerCase()] ?? t;
}

async function arcgis(url: string): Promise<Record<string, unknown>> {
  const res = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': UA } });
  if (!res.ok) throw new Error(`Baltimore ArcGIS: ${res.status}`);
  const data = (await res.json()) as Record<string, unknown>;
  const err = data.error as { message?: string } | undefined;
  if (err) throw new Error(`Baltimore ArcGIS error: ${err.message ?? 'query failed'}`);
  return data;
}

// ArcGIS returns esriFieldTypeDate values as epoch milliseconds. Convert those
// columns to ISO strings; pass everything else through unchanged.
function shapeFeatures(data: Record<string, unknown>): Array<Record<string, unknown>> {
  const fields = (data.fields as Array<{ name?: string; type?: string }>) ?? [];
  const dateFields = new Set(fields.filter((f) => f.type === 'esriFieldTypeDate' && f.name).map((f) => f.name as string));
  const feats = (data.features as Array<{ attributes?: Record<string, unknown> }>) ?? [];
  return feats.map((f) => {
    const a = { ...(f.attributes ?? {}) };
    for (const k of dateFields) {
      const v = a[k];
      if (typeof v === 'number' && Number.isFinite(v)) a[k] = new Date(v).toISOString();
    }
    return a;
  });
}

function buildQueryUrl(service: string, layer: number, where: string, outFields: string, orderBy: string | undefined, limit: number): string {
  const p = new URLSearchParams({
    where: where || '1=1',
    outFields: outFields || '*',
    resultRecordCount: String(limit),
    returnGeometry: 'false',
    f: 'json',
  });
  if (orderBy && orderBy.trim()) p.set('orderByFields', orderBy.trim());
  return `${BASE}/${service}/${layer}/query?${p}`;
}

// ── Tool implementations ─────────────────────────────────────────────

async function arcgisRecent(dataset: string, where: string | undefined, limit: number | undefined) {
  const key = String(dataset ?? '').toLowerCase().trim();
  const ds = DATASETS[key];
  if (!ds) throw new Error(`Unknown dataset "${dataset}". Use one of: ${Object.keys(DATASETS).join(', ')}.`);
  const n = Math.min(1000, Math.max(1, Number(limit) || 20));
  const url = buildQueryUrl(ds.service, ds.layer, where && String(where).trim() ? String(where).trim() : '1=1', '*', `${ds.date} DESC`, n);
  const data = await arcgis(url);
  const rows = shapeFeatures(data);
  return { dataset: key, label: ds.label, service: ds.service, layer: ds.layer, sorted_by: `${ds.date} DESC`, count: rows.length, source: 'DataBaltimore (data.baltimorecity.gov / ArcGIS)', rows };
}

async function arcgisLayers(service: string | undefined) {
  if (!service || !String(service).trim()) {
    return { known_services: Object.entries(SERVICES).map(([name, path]) => ({ name, service_path: path })), note: 'Pass one of these names (or a full ArcGIS service path) to list its layers.' };
  }
  const path = resolveService(service);
  const data = await arcgis(`${BASE}/${path}?f=json`);
  const layers = (data.layers as Array<{ id?: number; name?: string }>) ?? [];
  return { service_path: path, count: layers.length, layers: layers.map((l) => ({ id: l.id ?? null, name: l.name ?? null })) };
}

async function arcgisQuery(args: Record<string, unknown>) {
  const service = resolveService(String(args.service ?? ''));
  if (!service) throw new Error('Required argument "service" is missing (e.g. "311_Customer_Service_Requests_current/FeatureServer" or a short name). Find services with baltimore_layers.');
  const layer = Number(args.layer);
  if (!Number.isFinite(layer)) throw new Error('Required argument "layer" must be a number (layer id from baltimore_layers).');
  const n = Math.min(2000, Math.max(1, Number(args.limit) || 100));
  const url = buildQueryUrl(
    service,
    Math.floor(layer),
    args.where != null && String(args.where).trim() ? String(args.where).trim() : '1=1',
    args.out_fields != null && String(args.out_fields).trim() ? String(args.out_fields).trim() : '*',
    args.order_by as string | undefined,
    n,
  );
  const data = await arcgis(url);
  const rows = shapeFeatures(data);
  return { service, layer: Math.floor(layer), count: rows.length, source: 'DataBaltimore (data.baltimorecity.gov / ArcGIS)', rows };
}

// ── Router ───────────────────────────────────────────────────────────

async function callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case 'baltimore_recent':
      return arcgisRecent(args.dataset as string, args.where as string | undefined, args.limit as number | undefined);
    case 'baltimore_layers':
      return arcgisLayers(args.service as string | undefined);
    case 'baltimore_query':
      return arcgisQuery(args);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

export default { tools, callTool, meter: { credits: 1 } } satisfies McpToolExport;

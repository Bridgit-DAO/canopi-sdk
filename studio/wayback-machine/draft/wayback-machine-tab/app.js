// Wayback Machine: tablication scaffolded by Canopi Studio (project 9f458443-da82-4384-8d81-7b99fecefbce).
// Everything goes through the canopi.tab bridge; data comes only from the hosts in network.connect.
import { connect } from './tab-bridge.js';
import { renderSidebar, createDataSource } from './studio-kit.js';

// Components, layout and data sources from the Studio project. To go live, set a source's
// mode to "live" with live: { baseUrl, host }, and put that host in manifest.json network.connect.
const PROJECT = {
  "design": {
    "sidebar": {
      "tab": {
        "id": "wayback-machine-tab",
        "title": "Wayback",
        "icon": "🏛️"
      },
      "layout": [
        "cmp_header",
        "cmp_latest",
        "cmp_latest_open",
        "cmp_oldest",
        "cmp_oldest_open",
        "cmp_total",
        "cmp_history",
        "cmp_cite_form",
        "cmp_citations"
      ]
    },
    "theme": {
      "accent": "#3b6fb6"
    }
  },
  "components": [
    {
      "id": "cmp_header",
      "surface": "sidebar",
      "type": "header",
      "title": "Wayback Machine",
      "binding": null,
      "props": {
        "title": "Wayback Machine",
        "subtitle": "Archived copies of the page you are on"
      },
      "status": "accepted"
    },
    {
      "id": "cmp_latest",
      "surface": "sidebar",
      "type": "detail",
      "title": "Latest capture",
      "binding": {
        "sourceId": "src_latest",
        "path": "$.archived_snapshots.closest"
      },
      "props": {
        "fields": [
          {
            "field": "timestamp",
            "label": "Captured"
          },
          {
            "field": "status",
            "label": "HTTP status"
          }
        ],
        "emptyText": "Not in the Wayback Machine yet."
      },
      "status": "accepted"
    },
    {
      "id": "cmp_latest_open",
      "surface": "sidebar",
      "type": "action",
      "title": "",
      "binding": {
        "sourceId": "src_latest",
        "path": "$.archived_snapshots.closest"
      },
      "props": {
        "label": "Open the latest capture",
        "kind": "link",
        "urlField": "url"
      },
      "status": "accepted"
    },
    {
      "id": "cmp_oldest",
      "surface": "sidebar",
      "type": "detail",
      "title": "First capture",
      "binding": {
        "sourceId": "src_oldest",
        "path": "$.archived_snapshots.closest"
      },
      "props": {
        "fields": [
          {
            "field": "timestamp",
            "label": "Captured"
          },
          {
            "field": "status",
            "label": "HTTP status"
          }
        ],
        "emptyText": "No captures yet."
      },
      "status": "accepted"
    },
    {
      "id": "cmp_oldest_open",
      "surface": "sidebar",
      "type": "action",
      "title": "",
      "binding": {
        "sourceId": "src_oldest",
        "path": "$.archived_snapshots.closest"
      },
      "props": {
        "label": "Open the first capture",
        "kind": "link",
        "urlField": "url"
      },
      "status": "accepted"
    },
    {
      "id": "cmp_total",
      "surface": "sidebar",
      "type": "stat",
      "title": "Captures",
      "binding": {
        "sourceId": "src_history",
        "path": "$.years[*]"
      },
      "props": {
        "label": "Times this page was saved",
        "field": "captures",
        "aggregate": "sum",
        "format": "number"
      },
      "status": "accepted"
    },
    {
      "id": "cmp_history",
      "surface": "sidebar",
      "type": "sparkline",
      "title": "Captures per year",
      "binding": {
        "sourceId": "src_history",
        "path": "$.years[*]"
      },
      "props": {
        "field": "captures",
        "label": "Captures this year",
        "format": "number"
      },
      "status": "accepted"
    },
    {
      "id": "cmp_cite_form",
      "surface": "sidebar",
      "type": "form",
      "title": "Cite an archived copy",
      "binding": null,
      "props": {
        "fields": [
          {
            "name": "archiveUrl",
            "label": "Archived copy (web.archive.org link)",
            "type": "text",
            "required": true
          },
          {
            "name": "status",
            "label": "The original is",
            "type": "select",
            "options": [
              "live",
              "changed",
              "gone"
            ],
            "required": true
          },
          {
            "name": "note",
            "label": "Why it matters",
            "type": "textarea",
            "required": true
          }
        ],
        "submitLabel": "Cite an archived copy…",
        "composeTagType": "archived-citation"
      },
      "status": "accepted"
    },
    {
      "id": "cmp_citations",
      "surface": "sidebar",
      "type": "tag-feed",
      "title": "Archived citations here",
      "binding": null,
      "props": {
        "tagType": "archived-citation",
        "limit": 5,
        "emptyText": "No archived citations on this page yet."
      },
      "status": "accepted"
    }
  ],
  "dataSources": [
    {
      "id": "src_latest",
      "name": "Latest snapshot of this page",
      "kind": "rest",
      "mode": "mock",
      "request": {
        "method": "GET",
        "urlTemplate": "https://archive.org/wayback/available?url={pageUrl}",
        "auth": "none"
      },
      "live": null,
      "fixtures": []
    },
    {
      "id": "src_oldest",
      "name": "First snapshot of this page",
      "kind": "rest",
      "mode": "mock",
      "request": {
        "method": "GET",
        "urlTemplate": "https://archive.org/wayback/available?url={pageUrl}&timestamp=19960101",
        "auth": "none"
      },
      "live": null,
      "fixtures": []
    },
    {
      "id": "src_history",
      "name": "Captures per year",
      "kind": "rest",
      "mode": "mock",
      "request": {
        "method": "GET",
        "urlTemplate": "https://web.archive.org/cdx/search/cdx?url={pageUrl}&output=json&fl=timestamp",
        "auth": "none"
      },
      "live": null,
      "fixtures": []
    }
  ]
};

const MOCK_BASE_URL = "https://studio-mock.invalid/v1/studio/projects/9f458443-da82-4384-8d81-7b99fecefbce/mock";

const root = document.getElementById('app');
(async () => {
  try {
    const tab = await connect();
    const sources = PROJECT.dataSources.map((d) => createDataSource(d, { mockBaseUrl: MOCK_BASE_URL || undefined }));
    await renderSidebar(root, PROJECT, { tab, sources });
  } catch (e) {
    root.textContent = `Could not connect to Canopi (${e && e.code ? e.code : 'error'})`;
  }
})();

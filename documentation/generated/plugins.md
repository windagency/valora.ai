# Module: `plugins`

_Generated: 2026-04-18_

## File Dependencies

```mermaid
graph LR
  plugin_discovery_service --> plugin_manifest_schema
  plugin_loader_service --> plugin_discovery_service
  plugin_loader_service --> plugin_manifest_schema
```

## Symbol References

| Symbol                           | Kind     | Defined in                  | Used in                                                                                   |
| -------------------------------- | -------- | --------------------------- | ----------------------------------------------------------------------------------------- |
| PLUGIN_BINARY_REQUIREMENT_SCHEMA | constant | plugin-manifest.schema.ts   | —                                                                                         |
| PLUGIN_CONTRIBUTION_TYPE_SCHEMA  | constant | plugin-manifest.schema.ts   | —                                                                                         |
| PLUGIN_HOOKS_FILE                | constant | plugin-manifest.schema.ts   | plugin-loader.service.ts                                                                  |
| PLUGIN_HOOKS_FILE_SCHEMA         | constant | plugin-manifest.schema.ts   | plugin-loader.service.ts                                                                  |
| PLUGIN_MANIFEST_FILE             | constant | plugin-manifest.schema.ts   | plugin-discovery.service.ts, plugin-loader.service.ts                                     |
| PLUGIN_MANIFEST_SCHEMA           | constant | plugin-manifest.schema.ts   | plugin-loader.service.ts                                                                  |
| PLUGIN_PERMISSION_SCHEMA         | constant | plugin-manifest.schema.ts   | —                                                                                         |
| PluginDiscoveryService           | class    | plugin-discovery.service.ts | plugin-loader.service.ts, plugin-discovery.service.test.ts, plugin-loader.service.test.ts |
| PluginLoaderService              | class    | plugin-loader.service.ts    | container.ts, plugin-loader.service.test.ts                                               |

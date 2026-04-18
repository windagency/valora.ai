# Module: `llm`

_Generated: 2026-04-18_

## File Dependencies

```mermaid
graph LR
  model_mapping_registry_test --> model_mapping_registry
  anthropic_provider_test --> anthropic_provider
  anthropic_provider --> model_mapping_registry
  anthropic_provider --> provider_interface
  anthropic_provider --> registry
  cursor_provider_test --> cursor_provider
  cursor_provider --> provider_interface
  cursor_provider --> registry
  google_provider --> provider_interface
  google_provider --> registry
  local_provider --> provider_interface
  local_provider --> registry
  openai_provider --> provider_interface
  openai_provider --> registry
```

## Symbol References

| Symbol               | Kind  | Defined in                | Used in                                                                       |
| -------------------- | ----- | ------------------------- | ----------------------------------------------------------------------------- |
| AnthropicProvider    | class | anthropic.provider.ts     | anthropic.provider.test.ts                                                    |
| CursorProvider       | class | cursor.provider.ts        | provider-fallback-service.ts, cursor.provider.test.ts, registry.ts, server.ts |
| GoogleProvider       | class | google.provider.ts        | —                                                                             |
| LLMProviderRegistry  | class | registry.ts               | —                                                                             |
| LocalProvider        | class | local.provider.ts         | —                                                                             |
| ModelMappingRegistry | class | model-mapping-registry.ts | model-mapping-registry.test.ts, anthropic.provider.ts                         |
| ModelMappingType     | type  | model-mapping-registry.ts | —                                                                             |
| OpenAIProvider       | class | openai.provider.ts        | —                                                                             |

# jq and yq reference

## jq — JSON processor

### Essential patterns for agents

```bash
# Identity — pretty-print (rarely needed, prefer extraction)
jq '.' file.json

# Field extraction (the most common agent operation)
jq '.name' package.json                    # String field
jq '.version' package.json                 # → "1.2.3"
jq -r '.version' package.json             # → 1.2.3 (raw, no quotes)

# Nested access
jq '.scripts.build' package.json
jq '.compilerOptions.strict' tsconfig.json

# Array operations
jq '.dependencies | keys' package.json              # List dependency names
jq '.items | length' data.json                       # Count items
jq '.items[0]' data.json                             # First item
jq '.items[-1]' data.json                            # Last item
jq '.items[2:5]' data.json                           # Slice

# Filtering arrays of objects
jq '.[] | select(.status == "active")' items.json
jq '.[] | select(.age > 30)' people.json
jq '.[] | select(.name | test("^App"))' services.json  # Regex match
jq '[.[] | select(.status == "active")] | length' items.json  # Count matches

# Object construction — reshape output
jq '.[] | {name, version}' packages.json
jq '{total: (.items | length), active: ([.items[] | select(.active)] | length)}' data.json

# Multiple outputs on one line
jq -r '[.name, .version] | @tsv' package.json

# Conditional / fallback
jq -r '.version // "not set"' package.json
jq -r '.scripts.test // .scripts.jest // "no test script"' package.json

# Modify (output only — jq does not edit in place without sponge)
jq '.version = "2.0.0"' package.json > tmp.json && mv tmp.json package.json

# In-place edit alternative using a temp file
jq '.dependencies.typescript = "^5.0.0"' package.json | sponge package.json
# If sponge unavailable:
TMP=$(mktemp) && jq '.dependencies.typescript = "^5.0.0"' package.json > "$TMP" && mv "$TMP" package.json
```

### Advanced patterns

```bash
# Group by
jq 'group_by(.category) | map({key: .[0].category, count: length})' items.json

# Flatten nested structures
jq '[.. | .email? // empty]' users.json  # Recursively find all email fields

# CSV output
jq -r '.[] | [.name, .age, .city] | @csv' people.json

# Combine multiple files
jq -s '.[0] * .[1]' base.json override.json  # Deep merge

# Stream large files (low memory)
jq --stream 'select(.[0][-1] == "name") | .[1]' huge.json
```

### Flags reference

| Flag        | Purpose                           | Example                               |
| ----------- | --------------------------------- | ------------------------------------- |
| `-r`        | Raw output (no quotes on strings) | `jq -r '.name'`                       |
| `-e`        | Exit 1 if output is null/false    | `jq -e '.key'` for conditional checks |
| `-c`        | Compact output (one line)         | `jq -c '.'` for piping                |
| `-s`        | Slurp: read all inputs into array | `jq -s '.' file1.json file2.json`     |
| `-S`        | Sort keys                         | `jq -S '.'` for deterministic output  |
| `--arg`     | Inject string variable            | `jq --arg v "$VAR" '.[$v]'`           |
| `--argjson` | Inject JSON variable              | `jq --argjson n 5 '.items[:$n]'`      |
| `--rawfile` | Read raw file into variable       | `jq --rawfile t template.txt`         |
| `--tab`     | Use tabs for indentation          | `jq --tab '.'`                        |

---

## yq — YAML/TOML/XML processor

yq (mikefarah/yq v4+) uses the same expression syntax as jq but natively handles YAML, TOML, and XML.

### Essential patterns for agents

```bash
# Field extraction (equivalent to jq for YAML)
yq '.metadata.name' deployment.yaml
yq '.spec.replicas' deployment.yaml
yq -r '.image.repository' values.yaml    # Raw output

# Array access
yq '.spec.template.spec.containers[0].image' deployment.yaml
yq '.spec.template.spec.containers[].name' deployment.yaml  # All container names

# Nested with default
yq '.spec.replicas // 1' deployment.yaml

# Multi-document YAML (Kubernetes manifests, Helm output)
yq 'select(.kind == "Deployment")' manifest.yaml
yq 'select(.kind == "Service") | .metadata.name' manifest.yaml
yq 'select(document_index == 0)' multi.yaml  # First document only

# Docker Compose queries
yq '.services | keys' docker-compose.yml
yq '.services.*.image' docker-compose.yml
yq '.services.*.ports[]' docker-compose.yml

# Helm values inspection
yq '.global' values.yaml
yq '.ingress.enabled' values.yaml

# GitHub Actions / CI config
yq '.jobs | keys' .github/workflows/ci.yml
yq '.jobs.build.steps[].uses' .github/workflows/ci.yml
yq '.jobs.*.steps[] | select(.uses != null) | .uses' .github/workflows/ci.yml
```

### Format conversion

```bash
# YAML → JSON
yq -o=json '.' config.yaml

# JSON → YAML
yq -p=json '.' config.json

# TOML → YAML
yq -p=toml '.' config.toml

# XML → YAML
yq -p=xml '.' config.xml

# YAML → JSON → pipe to jq for complex transforms
yq -o=json '.' config.yaml | jq '.complex.transform'

# Properties file → YAML
yq -p=props '.' app.properties
```

### In-place editing

```bash
# yq supports in-place editing natively (unlike jq)
yq -i '.spec.replicas = 3' deployment.yaml
yq -i '.image.tag = "v2.1.0"' values.yaml
yq -i 'del(.metadata.annotations)' resource.yaml

# Add a new field
yq -i '.metadata.labels.team = "platform"' deployment.yaml

# Merge files
yq '. *= load("override.yaml")' base.yaml
```

### Flags reference

| Flag          | Purpose                | Example                   |
| ------------- | ---------------------- | ------------------------- |
| `-r`          | Raw output (no quotes) | `yq -r '.name'`           |
| `-i`          | In-place edit          | `yq -i '.key = "val"'`    |
| `-o=json`     | Output as JSON         | `yq -o=json '.'`          |
| `-p=json`     | Parse input as JSON    | `yq -p=json '.'`          |
| `-p=toml`     | Parse input as TOML    | `yq -p=toml '.'`          |
| `-p=xml`      | Parse input as XML     | `yq -p=xml '.'`           |
| `-e`          | Exit 1 if null/false   | `yq -e '.key'`            |
| `-N`          | No document separators | Suppress `---` in output  |
| `--no-colors` | Disable colour output  | For piping to other tools |

### Multi-document handling tips

Kubernetes manifests and Helm outputs often contain multiple YAML documents separated by `---`. Key patterns:

```bash
# Count documents
yq 'document_index' manifest.yaml | tail -1

# Select by kind
yq 'select(.kind == "ConfigMap")' manifest.yaml

# Select by name
yq 'select(.metadata.name == "my-app")' manifest.yaml

# Extract all images from all deployments
yq 'select(.kind == "Deployment") | .spec.template.spec.containers[].image' manifest.yaml
```

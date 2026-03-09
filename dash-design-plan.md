# Dashboard TUI — Design Document

## Overview

The dashboard TUI is a real-time monitoring interface for Valora sessions, system health, and operational metrics. It is built with React/Ink via a library-agnostic TUI adapter (`getTUIAdapter()`), and decomposed into ~30 modular files under `src/ui/dashboard/`.

The entry point is `startDashboard()` in `src/ui/dashboard-tui.tsx`, which renders the root `<Dashboard />` component and wires up signal handlers.

---

## Navigation Model

### State Machine

Navigation is managed by the `useNavigation()` hook, which tracks four pieces of state:

| State           | Type            | Values                                                          |
| --------------- | --------------- | --------------------------------------------------------------- |
| `viewMode`      | `ViewMode`      | `'dashboard'` or `'details'`                                    |
| `activeTab`     | `DashboardTab`  | `'overview'`, `'performance'`, `'agents'`, `'cache'`, `'audit'` |
| `sessionSubTab` | `SessionSubTab` | `'overview'`, `'optimization'`, `'quality'`, `'tokens'`         |
| `selectedIndex` | `number`        | Row index within the active sessions list                       |

```mermaid
stateDiagram-v2
    direction LR

    state Dashboard {
        [*] --> Overview
        Overview --> Performance : 2 / Tab
        Performance --> Agents : 3 / Tab
        Agents --> Cache : 4 / Tab
        Cache --> Audit : 5 / Tab
        Audit --> Overview : 1 / Shift+Tab

        Overview --> Overview : j/k (navigate)
        Overview --> Overview : r (refresh)
    }

    state Details {
        [*] --> SubOverview
        SubOverview --> Optimization : ]
        Optimization --> Quality : ]
        Quality --> Tokens : ]
        Tokens --> SubOverview : ]
    }

    Dashboard --> Details : Enter (on session)
    Details --> Dashboard : Esc / q
    Dashboard --> [*] : q / Esc / Ctrl+C
    Details --> [*] : Ctrl+C
```

### Key Bindings

#### Dashboard Mode (`viewMode === 'dashboard'`)

| Key          | Action                                          |
| ------------ | ----------------------------------------------- |
| `1`–`5`      | Switch directly to top-level tab                |
| `Tab`        | Next top-level tab (cycles)                     |
| `Shift+Tab`  | Previous top-level tab (cycles)                 |
| `j` / `Down` | Move selection down in session list             |
| `k` / `Up`   | Move selection up in session list               |
| `Enter`      | Drill into selected session (Overview tab only) |
| `r`          | Force refresh data + recompute MetricsSummary   |
| `q` / `Esc`  | Quit dashboard                                  |
| `Ctrl+C`     | Quit dashboard                                  |

#### Details Mode (`viewMode === 'details'`)

| Key         | Action                            |
| ----------- | --------------------------------- |
| `]`         | Next session sub-tab (cycles)     |
| `[`         | Previous session sub-tab (cycles) |
| `q` / `Esc` | Back to dashboard mode            |
| `Ctrl+C`    | Quit dashboard                    |

### Tab Bar

```
 [1:Overview]  2:Performance  3:Agents  4:Cache  5:Audit
```

Active tab is highlighted with `backgroundColor="cyan"` and `color="black"`.

### Session Sub-Tab Bar

```
 [Overview]  Optimization  Quality  Tokens    ([/] switch)
```

Same visual treatment. Shown at the top of the session details view.

---

## Data Flow

### Hook Wiring

```mermaid
graph TD
    D["Dashboard (root)"]

    D --> useNav["useNavigation()"]
    D --> useDash["useDashboardData()"]
    D --> useMetrics["useMetricsData(activeTab)"]

    useNav -->|activeTab, viewMode,<br/>selectedIndex, sessionSubTab| D

    useDash -->|"data: DashboardData"| D
    useDash -->|"fetchData()"| D
    useDash -->|"sessionStore"| D

    useMetrics -->|performanceData| D
    useMetrics -->|agentData| D
    useMetrics -->|cacheData| D
    useMetrics -->|auditData| D
    useMetrics -->|"computeMetricsSummary()"| D

    subgraph "Data Sources (useDashboardData)"
        SS["SessionStore"]
        WM["WorktreeManager"]
        ESM["ExplorationStateManager"]
        MAL1["getMCPAuditLogger()"]
    end

    useDash --> SS
    useDash --> WM
    useDash --> ESM
    useDash --> MAL1

    subgraph "Data Sources (useMetricsData)"
        MC["getMetricsCollector()"]
        ASA["getAgentSelectionAnalytics()"]
        DRC["getDryRunCache()"]
        SOC["getStageOutputCache()"]
        MAL2["getMCPAuditLogger()"]
    end

    useMetrics -->|"tab=performance"| MC
    useMetrics -->|"tab=agents"| ASA
    useMetrics -->|"tab=cache"| DRC
    useMetrics -->|"tab=cache"| SOC
    useMetrics -->|"tab=audit"| MAL2

    style D fill:#1a1a2e,stroke:#16213e,color:#e94560
    style useNav fill:#0f3460,stroke:#16213e,color:#e2e2e2
    style useDash fill:#0f3460,stroke:#16213e,color:#e2e2e2
    style useMetrics fill:#0f3460,stroke:#16213e,color:#e2e2e2
```

### Tiered Refresh Rates

Only the active tab's data is fetched:

| Tab             | Rate | Source                                            |
| --------------- | ---- | ------------------------------------------------- |
| Overview        | 1 s  | `SessionStore`, worktrees, explorations           |
| Performance     | 2 s  | `getMetricsCollector().getSnapshot()`             |
| Audit           | 3 s  | `getMCPAuditLogger().getRecentEntries()`          |
| Agents          | 5 s  | `getAgentSelectionAnalytics().getMetrics()`       |
| Cache           | 5 s  | `getDryRunCache/getStageOutputCache().getStats()` |
| Session details | 1 s  | `sessionStore.loadSession()` on selected session  |

`MetricsSummary` is computed on overview tab activation and on manual refresh (`r`), not every tick.

### Data Interfaces

```mermaid
classDiagram
    class DashboardData {
        activeSessions: SessionSummary[]
        backgroundTasks: BackgroundTask[]
        mcpMetrics: MCPDashboardMetrics | null
        metricsSummary: MetricsSummary | null
        recentCommands: RecentCommand[]
        systemHealth: SystemHealth
        worktrees: WorktreeDiagramEntry[]
    }

    class MetricsSummary {
        totalCommands: number
        totalTokens: number
        cacheHitRate: number
        avgReviewScore: number
        timeSavedMinutes: number
        patterns: number
        earlyExits: number
        errors: number
    }

    class PerformanceData {
        counters: CounterMetric[]
        gauges: GaugeMetric[]
        histograms: HistogramMetric[]
        snapshot: MetricsSnapshot | null
    }

    class AgentAnalyticsData {
        metrics: AgentSelectionMetrics | null
        successMetrics: SuccessMetrics | null
    }

    class CacheData {
        dryRunCache: CacheStats
        stageOutputCache: CacheStats
    }

    class AuditData {
        entries: AuditEntry[]
        stats: AuditStats
    }

    DashboardData --> MetricsSummary
```

---

## Page Composition

### Root Shell (`dashboard-tui.tsx`)

```mermaid
graph TD
    Dashboard["Dashboard (root)"]

    Dashboard --> Header

    Dashboard -->|"viewMode = details<br/>AND selectedSession"| SDV["SessionDetailsView"]
    Dashboard -->|"viewMode = dashboard"| DashMode["Dashboard Mode"]

    DashMode --> TabBar
    DashMode -->|"tab = overview"| DV["DashboardView"]
    DashMode -->|"tab = performance"| PV["PerformanceView"]
    DashMode -->|"tab = agents"| AAV["AgentAnalyticsView"]
    DashMode -->|"tab = cache"| CSV["CacheStatsView"]
    DashMode -->|"tab = audit"| ALV["AuditLogView"]

    Dashboard --> HelpBar

    style Dashboard fill:#1a1a2e,stroke:#533483,color:#e94560
    style Header fill:#16213e,stroke:#0f3460,color:#e2e2e2
    style TabBar fill:#16213e,stroke:#0f3460,color:#e2e2e2
    style HelpBar fill:#16213e,stroke:#0f3460,color:#e2e2e2
    style DV fill:#0f3460,stroke:#533483,color:#e2e2e2
    style PV fill:#0f3460,stroke:#533483,color:#e2e2e2
    style AAV fill:#0f3460,stroke:#533483,color:#e2e2e2
    style CSV fill:#0f3460,stroke:#533483,color:#e2e2e2
    style ALV fill:#0f3460,stroke:#533483,color:#e2e2e2
    style SDV fill:#533483,stroke:#e94560,color:#e2e2e2
```

---

### Tab 1: Overview — `DashboardView`

**Props:** `data: DashboardData`, `selectedIndex: number`

```mermaid
graph TD
    DV["DashboardView"]

    DV -->|"IF metricsSummary"| MSP["MetricsSummaryPanel"]

    DV --> Left["Left Column 65%"]
    DV --> Right["Right Column 35%"]

    Left --> ASP["ActiveSessionsPanel"]
    Left --> BTP["BackgroundTasksPanel"]

    ASP -->|"IF sessions.length > 0"| SR["SessionRow &times; N"]
    ASP -->|"IF sessions.length = 0"| ASPempty["'No sessions yet'"]

    BTP -->|"IF tasks.length > 0"| TaskRows["Task rows"]
    BTP -->|"IF tasks.length = 0"| BTPempty["'No background tasks'"]

    Right --> SHP["SystemHealthPanel"]
    Right --> WDP["WorktreeDiagramPanel"]
    Right -->|"IF mcpMetrics"| MMP["MCPMetricsPanel"]
    Right --> RCP["RecentCommandsPanel"]

    WDP -->|"IF mainWorktree"| WCR["WorktreeChildRow &times; N"]
    WDP -->|"IF !mainWorktree"| WDPempty["'No git repository'"]

    style DV fill:#1a1a2e,stroke:#533483,color:#e94560
    style MSP fill:#0f3460,stroke:#00b4d8,color:#e2e2e2
    style ASP fill:#0f3460,stroke:#533483,color:#e2e2e2
    style BTP fill:#0f3460,stroke:#533483,color:#e2e2e2
    style SHP fill:#0f3460,stroke:#533483,color:#e2e2e2
    style WDP fill:#0f3460,stroke:#533483,color:#e2e2e2
    style MMP fill:#0f3460,stroke:#533483,color:#e2e2e2
    style RCP fill:#0f3460,stroke:#533483,color:#e2e2e2
```

#### Conditional Blocks

| Component             | Condition                     | Renders                   |
| --------------------- | ----------------------------- | ------------------------- |
| `MetricsSummaryPanel` | `data.metricsSummary != null` | Aggregated metrics banner |
| `MCPMetricsPanel`     | `data.mcpMetrics != null`     | MCP summary               |

**`MetricsSummaryPanel` colour thresholds:**

| Metric           | Green  | Yellow | Red |
| ---------------- | ------ | ------ | --- |
| Cache hit rate   | >= 70% | < 70%  | -   |
| Avg review score | >= 80  | < 80   | -   |
| Errors           | = 0    | -      | > 0 |

**`SessionRow` conditionals:**

- `isSelected` -> cyan background, bold, ">" indicator
- `session.status === 'active'` -> green dot, else yellow
- `tokens > 0` -> show token count
- `ctxUsage` present -> show utilisation %

**`BackgroundTasksPanel` per-task conditionals:**

- `status`: completed -> green check, failed -> red X, else yellow spinner
- `progress < 0` (indeterminate) -> "running..." bar, else filled percentage bar
- `elapsedStr` present -> show elapsed time

**`WorktreeDiagramPanel` conditionals:**

- `mainWorktree` exists -> show tree, else "No git repository detected"
- `children.length === 0` -> "No additional worktrees"
- Per child: `prunable` -> red, `isExploration` -> yellow, else white
- Per child: `explorationStatus` present -> coloured status badge
- Per child: `truncatedTask` present -> task text (max 20 chars)
- `overflow` -> "+ N more worktrees" (max 4 shown)

---

### Tab 2: Performance — `PerformanceView`

**Props:** `data: PerformanceData`

```mermaid
graph TD
    PV["PerformanceView"]

    PV -->|"IF all empty"| PVempty["'No metrics collected yet'"]

    PV --> PLeft["Left Column 50%"]
    PV --> PRight["Right Column 50%"]

    PLeft -->|"IF counters.length > 0"| Counters["Counters (max 15)"]
    PLeft -->|"IF histograms.length > 0"| Histograms["Histograms (max 5)"]
    Histograms -->|"IF bucketValues"| SL["Sparkline"]

    PRight -->|"IF gauges.length > 0"| Gauges["Gauges (max 10)"]
    Gauges --> RG["ResourceGauge"]
    PRight -->|"IF snapshot"| Snapshot["Snapshot Info"]

    style PV fill:#1a1a2e,stroke:#533483,color:#e94560
    style SL fill:#533483,stroke:#e94560,color:#e2e2e2
    style RG fill:#533483,stroke:#e94560,color:#e2e2e2
```

#### Conditional Blocks

| Condition                 | Renders                              |
| ------------------------- | ------------------------------------ |
| All arrays empty          | "No metrics collected yet."          |
| `counters.length > 0`     | Counter name:value pairs (max 15)    |
| `counters.length > 15`    | "...and N more" overflow             |
| `histograms.length > 0`   | Histogram with name, count, avg      |
| `bucketValues.length > 0` | Sparkline chart per histogram        |
| `gauges.length > 0`       | ResourceGauge bar per gauge (max 10) |
| `gauges.length > 10`      | "...and N more" overflow             |
| `snapshot` present        | Uptime, collection interval          |

---

### Tab 3: Agents — `AgentAnalyticsView`

**Props:** `data: AgentAnalyticsData`

```mermaid
graph TD
    AAV["AgentAnalyticsView"]

    AAV -->|"IF !metrics OR\ntotalSelections = 0"| AAVempty["'No agent selection events'"]

    AAV --> SH["SummaryHeader"]
    AAV --> ALeft["Left Column 50%"]
    AAV --> ARight["Right Column 50%"]

    ALeft --> AgentDist["Agent Distribution"]
    AgentDist --> Bars1["renderDistribution()"]
    ALeft -->|"IF commandDistribution\nhas entries"| CmdDist["Command Distribution"]
    CmdDist --> Bars2["renderDistribution()"]

    ARight -->|"IF reasonDistribution\nhas entries"| Reasons["Selection Reasons"]
    Reasons --> Bars3["renderDistribution()"]
    ARight -->|"IF successMetrics"| SM["Success Metrics 7d"]
    SM -->|"IF insights.length > 0"| Insights["Insights list"]

    style AAV fill:#1a1a2e,stroke:#533483,color:#e94560
    style SH fill:#0f3460,stroke:#00b4d8,color:#e2e2e2
```

#### Conditional Blocks

| Condition                             | Renders                            |
| ------------------------------------- | ---------------------------------- |
| `!metrics \|\| totalSelections === 0` | Empty state message                |
| `commandDistribution` has keys        | Command Distribution bar chart     |
| `reasonDistribution` has keys         | Selection Reasons bar chart        |
| `successMetrics` present              | Accuracy, Completion, Satisfaction |
| `insights.length > 0`                 | Insights text list                 |

**`SummaryHeader` colour thresholds:**

| Metric         | Green  | Yellow | Red   |
| -------------- | ------ | ------ | ----- |
| Avg confidence | >= 85% | < 85%  | -     |
| Fallback rate  | -      | -      | > 15% |
| Override rate  | -      | -      | > 20% |

---

### Tab 4: Cache — `CacheStatsView`

**Props:** `data: CacheData`

```mermaid
graph TD
    CSV["CacheStatsView"]

    CSV --> DRC["Dry Run Cache Panel"]
    CSV --> SOC["Stage Output Cache Panel"]

    DRC -->|"IF entries.length > 0"| DRClist["Entry list (max 10)"]
    DRC -->|"IF entries.length = 0"| DRCempty["'No cached entries'"]
    DRClist -->|"IF > 10"| DRCoverflow["'...and N more'"]

    SOC -->|"IF entries.length > 0"| SOClist["Entry list (max 10)"]
    SOC -->|"IF entries.length = 0"| SOCempty["'No cached entries'"]
    SOClist -->|"IF > 10"| SOCoverflow["'...and N more'"]
    SOClist -->|"IF savedTime_ms > 0"| Saved["'saved: Xms'"]

    style CSV fill:#1a1a2e,stroke:#533483,color:#e94560
```

#### Conditional Blocks

| Panel        | Condition              | Renders                                 |
| ------------ | ---------------------- | --------------------------------------- |
| Dry Run      | `entries.length > 0`   | key (truncated 20) + command name + age |
| Dry Run      | `entries.length === 0` | "No cached entries"                     |
| Dry Run      | `entries.length > 10`  | "...and N more" overflow                |
| Stage Output | `entries.length > 0`   | stageId (truncated 20) + age            |
| Stage Output | `entries.length === 0` | "No cached entries"                     |
| Stage Output | `entries.length > 10`  | "...and N more" overflow                |
| Stage Output | `savedTime_ms > 0`     | "saved: Xms" per entry                  |

---

### Tab 5: Audit — `AuditLogView`

**Props:** `data: AuditData`

```mermaid
graph TD
    ALV["AuditLogView"]

    ALV --> StatsH["Stats Header"]
    StatsH -->|"IF byOperation\nhas entries"| ByOp["By Operation: op:N ..."]
    StatsH -->|"IF byServer\nhas entries"| BySrv["By Server: srv:N ..."]

    ALV -->|"IF entries.length = 0"| ALVempty["'No audit entries'"]
    ALV -->|"IF entries.length > 0"| EntryList["Entry list (last 20, reversed)"]

    EntryList --> Entry["Per Entry"]
    Entry -->|"IF toolName"| ToolName["Tool name"]
    Entry -->|"IF duration_ms"| Duration["Duration"]
    Entry -->|"IF error"| ErrorLine["Error line (red)"]

    style ALV fill:#1a1a2e,stroke:#533483,color:#e94560
```

#### Conditional Blocks

| Condition                        | Renders                    |
| -------------------------------- | -------------------------- |
| `byOperation` has keys           | "By Operation" breakdown   |
| `byServer` has keys              | "By Server" breakdown      |
| `entries.length === 0`           | "No audit entries"         |
| Per entry: `toolName`            | Tool name label            |
| Per entry: `duration_ms != null` | Duration value             |
| Per entry: `error`               | Error line (red, indented) |
| `successRate >= 0.9`             | Green rate, else yellow    |

---

### Session Details — `SessionDetailsView`

**Props:** `activeSubTab: SessionSubTab`, `onBack`, `onExit`, `session: Session`

```mermaid
graph TD
    SDV["SessionDetailsView"]

    SDV --> SessionHeader["Session ID Header"]
    SDV --> SubTabBar["Sub-Tab Bar"]
    SDV --> STC["SubTabContent (switch)"]
    SDV --> HelpFooter["Help footer"]

    STC -->|"overview"| OC["OverviewContent"]
    STC -->|"optimization"| OP["OptimizationPanel"]
    STC -->|"quality"| QP["QualityPanel"]
    STC -->|"tokens"| TUP["TokenUsagePanel"]

    OC --> SIP["SessionInfoPanel"]
    OC -->|"IF active AND\ncurrent_command"| RTP["RunningTaskPanel"]
    OC --> EIP["ExplorationInfoPanel"]
    OC -->|"IF totalToolCalls > 0"| MCSP["MCPSessionPanel"]
    OC --> CHP["CommandHistoryPanel"]
    OC -->|"IF worktreeStats AND\ntotal_created > 0"| WSP["WorktreeStatsPanel"]

    style SDV fill:#1a1a2e,stroke:#533483,color:#e94560
    style OC fill:#0f3460,stroke:#533483,color:#e2e2e2
    style OP fill:#0f3460,stroke:#533483,color:#e2e2e2
    style QP fill:#0f3460,stroke:#533483,color:#e2e2e2
    style TUP fill:#0f3460,stroke:#533483,color:#e2e2e2
```

#### Sub-Tab: Overview — `OverviewContent`

```mermaid
graph TD
    OC["OverviewContent"]

    OC --> SIP["SessionInfoPanel"]
    SIP -->|"IF total_tokens_used > 0"| SIPtokens["Token count"]
    SIP -->|"IF context_window"| SIPctx["Utilisation %, model"]

    OC -->|"IF status = active<br/>AND current_command"| RTP["RunningTaskPanel"]

    OC --> EIP["ExplorationInfoPanel"]
    EIP -->|"IF exploration found"| EIPdetails["Status, hypothesis, worktrees"]
    EIP -->|"IF duration_ms"| EIPdur["Duration"]
    EIP -->|"IF worktrees.length > 0"| EIPwt["ExplorationWorktreeRow &times; N"]
    EIP -->|"IF no exploration"| EIPempty["(renders nothing)"]

    OC -->|"IF totalToolCalls > 0"| MCSP["MCPSessionPanel"]
    MCSP -->|"IF durationTrend.length > 0"| MCSPsl["Sparkline"]
    MCSP -->|"IF servers.length > 0"| MCSPsrv["Server list (max 3 tools each)"]
    MCSP -->|"IF recentToolCalls.length > 0"| MCSPrc["Recent calls (max 5)"]

    OC --> CHP["CommandHistoryPanel"]
    CHP -->|"IF commands.length = 0"| CHPempty["'No commands executed yet'"]
    CHP -->|"IF commands.length > 0"| CHPlist["Command list (last 10)"]
    CHPlist -->|"IF duration_ms > 0"| CHPdur["Duration"]
    CHPlist -->|"IF tokens_used > 0"| CHPtok["Token count"]
    CHPlist -->|"IF error"| CHPerr["Error message (red)"]
    CHPlist -->|"IF total > 10"| CHPover["'... and N more'"]

    OC -->|"IF worktreeStats<br/>AND total_created > 0"| WSP["WorktreeStatsPanel"]
    WSP -->|"IF exploration_ids.length > 0"| WSPexp["Exploration IDs"]
    WSP -->|"IF summaries.length > 0"| WSPsum["Worktree summaries"]

    style OC fill:#1a1a2e,stroke:#533483,color:#e94560
```

#### Sub-Tab: Optimization — `OptimizationPanel`

```mermaid
graph TD
    OP["OptimizationPanel"]

    OP -->|"IF no commands with\noptimization_metrics"| OPempty["'No optimization metrics'"]

    OP --> OPlist["Command list (last 10)"]
    OPlist --> OR["OptimizationRow"]

    OR --> OMR["OptimizationModeRow"]
    OMR -->|"IF pattern_detected"| Pattern["Pattern name"]
    Pattern -->|"IF pattern_confidence"| PatConf["Confidence %"]

    OR --> ODR["OptimizationDetailsRow"]
    ODR -->|"IF complexity_score"| Complexity["Score/10"]
    ODR -->|"IF early_exit_triggered"| EarlyExit["'Yes'"]
    EarlyExit -->|"IF early_exit_confidence"| ExitConf["Confidence"]
    ODR -->|"IF time_saved_minutes > 0"| TimeSaved["Time saved"]

    OR -->|"IF template_used"| Template["Template name"]

    OP --> OPSummary["Summary Box"]
    OPSummary -->|"IF complexityCount > 0"| AvgCmplx["Avg Complexity"]

    style OP fill:#1a1a2e,stroke:#533483,color:#e94560
    style OR fill:#0f3460,stroke:#533483,color:#e2e2e2
```

**Complexity colour thresholds:** > 7 red, > 4 yellow, else green.

#### Sub-Tab: Quality — `QualityPanel`

```mermaid
graph TD
    QP["QualityPanel"]

    QP -->|"IF no commands with\nquality_metrics"| QPempty["'No quality metrics'"]

    QP --> QPlist["Command list (last 10)"]
    QPlist --> QR["QualityRow"]

    QR --> QPI["QualityPlanInfo"]
    QPI -->|"IF iterations"| Iter["Iteration count"]
    QPI -->|"IF plan_approved"| Plan["Approved/Rejected"]
    QPI -->|"IF files_generated > 0"| Files["File count"]

    QR --> QCI["QualityCodeInfo"]
    QCI --> QLI["QualityLintInfo"]
    QLI -->|"IF lint errors present"| Lint["Assert/Realtime counts"]
    QLI -->|"IF auto_fixes > 0"| Fixes["Fix count (green)"]

    QCI --> QTI["QualityTestInfo"]
    QTI -->|"IF test data present"| Tests["Pass/Fail counts"]
    QTI -->|"IF review_score"| Score["Score"]

    QP -->|"IF reviewScores.length > 1"| Trend["Review Score Trend (Sparkline)"]

    QP --> QS["QualitySummary"]

    style QP fill:#1a1a2e,stroke:#533483,color:#e94560
    style QR fill:#0f3460,stroke:#533483,color:#e2e2e2
    style QCI fill:#16213e,stroke:#0f3460,color:#e2e2e2
```

**Review score colour thresholds:** >= 80 green, >= 60 yellow, else red.

**QualitySummary colour thresholds:**

| Metric         | Green  | Yellow | White    |
| -------------- | ------ | ------ | -------- |
| Avg review     | >= 80  | < 80   | -        |
| Test pass rate | >= 90% | < 90%  | no tests |

#### Sub-Tab: Tokens — `TokenUsagePanel`

```mermaid
graph TD
    TUP["TokenUsagePanel"]

    TUP --> TotalLine["Total Tokens"]
    TUP -->|"IF context_window"| CtxUtil["Utilisation % + Model"]

    TUP -->|"IF commands with\ntokens > 0"| PerCmd["Per-Command Usage (last 10)"]
    PerCmd --> CmdBar["command name + bar chart + count"]

    TUP -->|"IF tokenValues.length > 1"| TokenTrend["Token Usage Trend (Sparkline)"]

    TUP -->|"IF no commands\nwith tokens"| TUPempty["'No token usage recorded'"]

    style TUP fill:#1a1a2e,stroke:#533483,color:#e94560
```

**Context utilisation colour:** > 80% red, else green.

---

## Component Composition Tree

Complete tree showing every component and its children:

```mermaid
graph TD
    D["Dashboard"]
    D --> H["Header"]
    D --> TB["TabBar"]
    D --> HB["HelpBar"]

    D -->|"dashboard mode"| DV["DashboardView"]
    D -->|"details mode"| SDV["SessionDetailsView"]

    DV --> MSP["MetricsSummaryPanel"]
    DV --> ASP["ActiveSessionsPanel"]
    ASP --> SR["SessionRow"]
    DV --> BTP["BackgroundTasksPanel"]
    DV --> SHP["SystemHealthPanel"]
    DV --> WDP["WorktreeDiagramPanel"]
    WDP --> WCR["WorktreeChildRow"]
    DV --> MMP["MCPMetricsPanel"]
    DV --> RCP["RecentCommandsPanel"]

    SDV -->|"overview"| OC["OverviewContent"]
    SDV -->|"optimization"| OP["OptimizationPanel"]
    SDV -->|"quality"| QP["QualityPanel"]
    SDV -->|"tokens"| TUP["TokenUsagePanel"]

    OC --> SIP["SessionInfoPanel"]
    OC --> RTP["RunningTaskPanel"]
    OC --> EIP["ExplorationInfoPanel"]
    EIP --> EWR["ExplorationWorktreeRow"]
    OC --> MCSP["MCPSessionPanel"]
    OC --> CHP["CommandHistoryPanel"]
    OC --> WSP["WorktreeStatsPanel"]

    OP --> OR["OptimizationRow"]
    OR --> OMR["OptimizationModeRow"]
    OR --> ODR["OptimizationDetailsRow"]

    QP --> QR["QualityRow"]
    QR --> QPI["QualityPlanInfo"]
    QR --> QCI["QualityCodeInfo"]
    QCI --> QLI["QualityLintInfo"]
    QCI --> QTI["QualityTestInfo"]
    QP --> QS["QualitySummary"]

    MCSP --> SL1["Sparkline"]
    QP --> SL2["Sparkline"]
    TUP --> SL3["Sparkline"]

    style D fill:#e94560,stroke:#533483,color:#fff
    style DV fill:#0f3460,stroke:#533483,color:#e2e2e2
    style SDV fill:#533483,stroke:#e94560,color:#e2e2e2
    style H fill:#16213e,stroke:#0f3460,color:#e2e2e2
    style TB fill:#16213e,stroke:#0f3460,color:#e2e2e2
    style HB fill:#16213e,stroke:#0f3460,color:#e2e2e2
```

---

## File Structure

```mermaid
graph LR
    subgraph "src/ui"
        DashTUI["dashboard-tui.tsx<br/>(root shell ~260 lines)"]

        subgraph "dashboard/"
            Index["index.ts"]
            Types["types.ts"]

            subgraph "hooks/"
                UDD["use-dashboard-data.ts"]
                UN["use-navigation.ts"]
                UMD["use-metrics-data.ts"]
            end

            subgraph "components/"
                CH["header.tsx"]
                CHB["help-bar.tsx"]
                CTB["tab-bar.tsx"]
            end

            subgraph "panels/"
                PAS["active-sessions-panel.tsx"]
                PBT["background-tasks-panel.tsx"]
                PSH["system-health-panel.tsx"]
                PWD["worktree-diagram-panel.tsx"]
                PMM["mcp-metrics-panel.tsx"]
                PRC["recent-commands-panel.tsx"]
                PMS["metrics-summary-panel.tsx"]
            end

            subgraph "views/"
                VDV["dashboard-view.tsx"]
                VSD["session-details-view.tsx"]
                VPV["performance-view.tsx"]
                VAA["agent-analytics-view.tsx"]
                VCS["cache-stats-view.tsx"]
                VAL["audit-log-view.tsx"]
            end

            subgraph "session-panels/"
                SPSI["session-info-panel.tsx"]
                SPRT["running-task-panel.tsx"]
                SPCH["command-history-panel.tsx"]
                SPEI["exploration-info-panel.tsx"]
                SPMS["mcp-session-panel.tsx"]
                SPWS["worktree-stats-panel.tsx"]
                SPOP["optimization-panel.tsx"]
                SPQP["quality-panel.tsx"]
                SPTU["token-usage-panel.tsx"]
            end

            subgraph "utils/"
                UFH["format-helpers.ts"]
            end
        end
    end

    DashTUI --> Index
    Index --> Types
    Index --> UDD
    Index --> UN
    Index --> UMD

    style DashTUI fill:#e94560,stroke:#533483,color:#fff
    style Index fill:#533483,stroke:#e94560,color:#e2e2e2
```

---

## Reused Components

| Component          | Source                              | Used By                                                                                                                                  |
| ------------------ | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `Sparkline`        | `exploration/dashboard-metrics.tsx` | PerformanceView, MCPSessionPanel, QualityPanel, TokenUsagePanel                                                                          |
| `ResourceGauge`    | `exploration/dashboard-metrics.tsx` | PerformanceView                                                                                                                          |
| `formatNumber`     | `utils/number-format.ts`            | MetricsSummaryPanel, ActiveSessionsPanel, SessionInfoPanel, CommandHistoryPanel, TokenUsagePanel                                         |
| `formatDurationMs` | `dashboard/utils/format-helpers.ts` | BackgroundTasksPanel, SystemHealthPanel, RunningTaskPanel, CommandHistoryPanel, ExplorationInfoPanel, WorktreeStatsPanel, CacheStatsView |
| `formatAge`        | `dashboard/utils/format-helpers.ts` | ActiveSessionsPanel, RecentCommandsPanel, MCPSessionPanel, AuditLogView                                                                  |

## Singleton Data Sources

```mermaid
graph LR
    subgraph "Singletons"
        MC["getMetricsCollector()"]
        ASA["getAgentSelectionAnalytics()"]
        DRC["getDryRunCache()"]
        SOC["getStageOutputCache()"]
        MAL["getMCPAuditLogger()"]
    end

    MC -->|"counters, gauges,<br/>histograms"| PV["PerformanceView"]
    ASA -->|"selection metrics,<br/>success metrics"| AAV["AgentAnalyticsView"]
    DRC -->|"cache stats"| CSV["CacheStatsView"]
    SOC -->|"cache stats"| CSV
    MAL -->|"audit entries,<br/>stats"| ALV["AuditLogView"]
    MAL -->|"dashboard metrics"| OC["OverviewContent"]
    MAL -->|"dashboard metrics"| UDD["useDashboardData"]

    style MC fill:#0f3460,stroke:#00b4d8,color:#e2e2e2
    style ASA fill:#0f3460,stroke:#00b4d8,color:#e2e2e2
    style DRC fill:#0f3460,stroke:#00b4d8,color:#e2e2e2
    style SOC fill:#0f3460,stroke:#00b4d8,color:#e2e2e2
    style MAL fill:#0f3460,stroke:#00b4d8,color:#e2e2e2
```

| Accessor                       | Module                                          | Provides                                |
| ------------------------------ | ----------------------------------------------- | --------------------------------------- |
| `getMetricsCollector()`        | `utils/metrics-collector.ts`                    | Counters, gauges, histograms            |
| `getAgentSelectionAnalytics()` | `services/agent-selection-analytics.service.ts` | Selection metrics, success metrics      |
| `getDryRunCache()`             | `executor/dry-run-cache.ts`                     | Dry-run cache stats                     |
| `getStageOutputCache()`        | `executor/stage-output-cache.ts`                | Stage output cache stats                |
| `getMCPAuditLogger()`          | `mcp/mcp-audit-logger.service.ts`               | Audit entries, stats, dashboard metrics |

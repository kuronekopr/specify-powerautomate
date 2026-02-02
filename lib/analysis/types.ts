// ── Power Automate ZIP structure types ───────────────────────────

/** Root manifest.json */
export interface PackageManifest {
  schema: string;
  details: {
    displayName: string;
    description: string;
    createdTime: string;
    packageTelemetryId: string;
    creator: string;
    sourceEnvironment: string;
  };
  resources: Record<string, PackageResource>;
}

export interface PackageResource {
  type: string;
  id?: string;
  name?: string;
  suggestedCreationType: string;
  creationType?: string;
  details: {
    displayName: string;
    iconUri?: string;
  };
  configurableBy: string;
  hierarchy: string;
  dependsOn: string[];
}

/** Microsoft.Flow/flows/<id>/definition.json */
export interface FlowDefinition {
  name: string;
  id: string;
  type: string;
  properties: FlowProperties;
}

export interface FlowProperties {
  apiId: string;
  displayName: string;
  definition: {
    metadata: Record<string, unknown>;
    $schema: string;
    contentVersion: string;
    parameters: Record<string, unknown>;
    triggers: Record<string, FlowTrigger>;
    actions: Record<string, FlowAction>;
    outputs: Record<string, unknown>;
  };
  connectionReferences: Record<string, ConnectionReference>;
  flowFailureAlertSubscribed: boolean;
  isManaged: boolean;
}

export interface FlowTrigger {
  type: string;
  recurrence?: {
    frequency: string;
    interval: number;
  };
  evaluatedRecurrence?: {
    frequency: string;
    interval: number;
  };
  splitOn?: string;
  metadata?: Record<string, string>;
  inputs: {
    parameters: Record<string, unknown>;
    host: {
      apiId: string;
      connectionName: string;
      operationId: string;
    };
    authentication?: unknown;
  };
  runAfter?: Record<string, string[]>;
}

export interface FlowAction {
  type: string;
  runAfter: Record<string, string[]>;
  inputs: {
    parameters: Record<string, unknown>;
    host: {
      apiId: string;
      connectionName: string;
      operationId: string;
    };
    authentication?: unknown;
  };
  // Control flow actions (conditions, loops, scopes)
  actions?: Record<string, FlowAction>;
  else?: { actions: Record<string, FlowAction> };
  expression?: unknown;
  foreach?: string;
}

export interface ConnectionReference {
  connectionName: string;
  source: string;
  id: string;
  tier: string;
  apiName: string;
}

/** Flows manifest */
export interface FlowsManifest {
  packageSchemaVersion: string;
  flowAssets: {
    assetPaths: string[];
  };
}

// ── Analysis result types ────────────────────────────────────────

/** Parsed result from ZIP */
export interface ParsedPackage {
  manifest: PackageManifest;
  flows: ParsedFlow[];
}

export interface ParsedFlow {
  flowId: string;
  definition: FlowDefinition;
  apisMap: Record<string, string>;
  connectionsMap: Record<string, string>;
}

/** Analysis output */
export interface FlowAnalysisResult {
  flowDisplayName: string;
  connectors: ConnectorInfo[];
  triggers: TriggerInfo[];
  actions: ActionInfo[];
  questions: Question[];
}

export interface ConnectorInfo {
  connectorId: string;
  displayName: string;
  apiName: string;
}

export interface TriggerInfo {
  name: string;
  type: string;
  connectorId: string;
  operationId: string;
  recurrence?: {
    frequency: string;
    interval: number;
  };
  skillMatch: SkillMatch | null;
}

export interface ActionInfo {
  name: string;
  type: string;
  connectorId: string;
  operationId: string;
  dependsOn: string[];
  skillMatch: SkillMatch | null;
}

export interface SkillMatch {
  connectorId: string;
  actionName: string | null;
  businessMeaning: string | null;
  failureImpact: string | null;
}

export interface Question {
  category: "trigger" | "action" | "connection" | "general";
  target: string;
  question: string;
  reason: string;
}

import type {
  ParsedPackage,
  ParsedFlow,
  FlowAnalysisResult,
  ConnectorInfo,
  TriggerInfo,
  ActionInfo,
  Question,
  SkillMatch,
  FlowAction,
} from "./types";

interface SkillDefinitionRow {
  connectorId: string;
  actionName: string | null;
  businessMeaning: string | null;
  failureImpact: string | null;
}

/**
 * Analyze a parsed Power Automate package and produce structured analysis results.
 * `skillDefinitions` should be fetched from the DB before calling this function.
 */
export function analyzePackage(
  parsed: ParsedPackage,
  skillDefinitions: SkillDefinitionRow[]
): FlowAnalysisResult[] {
  return parsed.flows.map((flow) =>
    analyzeFlow(flow, parsed, skillDefinitions)
  );
}

function analyzeFlow(
  flow: ParsedFlow,
  pkg: ParsedPackage,
  skillDefinitions: SkillDefinitionRow[]
): FlowAnalysisResult {
  const { definition } = flow;
  const props = definition.properties;
  const def = props.definition;

  // Extract connectors from connectionReferences
  const connectors = extractConnectors(props.connectionReferences, pkg);

  // Extract triggers
  const triggers = extractTriggers(def.triggers, skillDefinitions);

  // Extract actions (recursive for nested scopes/conditions)
  const actions = extractActions(def.actions, skillDefinitions);

  // Generate questions
  const questions = generateQuestions(triggers, actions, connectors);

  return {
    flowDisplayName: props.displayName,
    connectors,
    triggers,
    actions,
    questions,
  };
}

function extractConnectors(
  connectionRefs: Record<
    string,
    { id: string; apiName: string; connectionName: string }
  >,
  pkg: ParsedPackage
): ConnectorInfo[] {
  return Object.entries(connectionRefs).map(([key, ref]) => {
    // Try to find display name from package manifest resources
    const resource = Object.values(pkg.manifest.resources).find(
      (r) => r.id === ref.id && r.type === "Microsoft.PowerApps/apis"
    );

    return {
      connectorId: key,
      displayName: resource?.details.displayName ?? ref.apiName,
      apiName: ref.apiName,
    };
  });
}

function extractTriggers(
  triggers: Record<string, any>,
  skillDefinitions: SkillDefinitionRow[]
): TriggerInfo[] {
  return Object.entries(triggers).map(([name, trigger]) => {
    const connectorId = trigger.inputs?.host?.connectionName ?? "";
    const operationId = trigger.inputs?.host?.operationId ?? "";

    return {
      name,
      type: trigger.type,
      connectorId,
      operationId,
      recurrence: trigger.recurrence,
      skillMatch: findSkillMatch(connectorId, operationId, skillDefinitions),
    };
  });
}

function extractActions(
  actions: Record<string, FlowAction>,
  skillDefinitions: SkillDefinitionRow[],
  parentDeps: string[] = []
): ActionInfo[] {
  const result: ActionInfo[] = [];

  for (const [name, action] of Object.entries(actions)) {
    const connectorId = action.inputs?.host?.connectionName ?? "";
    const operationId = action.inputs?.host?.operationId ?? "";
    const dependsOn = Object.keys(action.runAfter ?? {});

    result.push({
      name,
      type: action.type,
      connectorId,
      operationId,
      dependsOn: dependsOn.length > 0 ? dependsOn : parentDeps,
      skillMatch: findSkillMatch(connectorId, operationId, skillDefinitions),
    });

    // Recurse into nested actions (scopes, conditions, loops)
    if (action.actions) {
      result.push(
        ...extractActions(action.actions, skillDefinitions, [name])
      );
    }
    if (action.else?.actions) {
      result.push(
        ...extractActions(action.else.actions, skillDefinitions, [name])
      );
    }
  }

  return result;
}

function findSkillMatch(
  connectorId: string,
  operationId: string,
  skillDefinitions: SkillDefinitionRow[]
): SkillMatch | null {
  if (!connectorId) return null;

  // Try exact match with composite key (connector/operation)
  if (operationId) {
    const compositeKey = `${connectorId}/${operationId}`;
    const compositeMatch = skillDefinitions.find(
      (s) => s.connectorId === compositeKey
    );
    if (compositeMatch) {
      return {
        connectorId: compositeMatch.connectorId,
        actionName: compositeMatch.actionName,
        businessMeaning: compositeMatch.businessMeaning,
        failureImpact: compositeMatch.failureImpact,
      };
    }

    // Try field-based exact match (connector + operation)
    const exactMatch = skillDefinitions.find(
      (s) => s.connectorId === connectorId && s.actionName === operationId
    );
    if (exactMatch) {
      return {
        connectorId: exactMatch.connectorId,
        actionName: exactMatch.actionName,
        businessMeaning: exactMatch.businessMeaning,
        failureImpact: exactMatch.failureImpact,
      };
    }
  }

  // Try connector-level match (no specific action)
  const connectorMatch = skillDefinitions.find(
    (s) => s.connectorId === connectorId && !s.actionName
  );
  if (connectorMatch) {
    return {
      connectorId: connectorMatch.connectorId,
      actionName: connectorMatch.actionName,
      businessMeaning: connectorMatch.businessMeaning,
      failureImpact: connectorMatch.failureImpact,
    };
  }

  return null;
}

function generateQuestions(
  triggers: TriggerInfo[],
  actions: ActionInfo[],
  connectors: ConnectorInfo[]
): Question[] {
  const questions: Question[] = [];

  // Questions about triggers without skill definitions
  for (const trigger of triggers) {
    if (!trigger.skillMatch) {
      questions.push({
        category: "trigger",
        target: trigger.name,
        question: `トリガー「${trigger.name}」(${trigger.operationId}) のビジネス上の目的は何ですか？`,
        reason: "スキル定義が未登録のため、業務上の意味を確認する必要があります。",
      });
    }

    if (trigger.recurrence) {
      questions.push({
        category: "trigger",
        target: trigger.name,
        question: `トリガーの実行間隔（${trigger.recurrence.interval}${trigger.recurrence.frequency}ごと）は業務要件として適切ですか？`,
        reason: "実行頻度が業務要件と合致しているか確認が必要です。",
      });
    }
  }

  // Questions about actions without skill definitions
  for (const action of actions) {
    if (!action.skillMatch && action.connectorId) {
      questions.push({
        category: "action",
        target: action.name,
        question: `アクション「${action.name}」(${action.operationId}) のビジネス上の目的は何ですか？`,
        reason: "スキル定義が未登録のため、業務上の意味を確認する必要があります。",
      });
    }
  }

  return questions;
}

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { parseZip } from "@/lib/analysis/parse-zip";

const ZIP_PATH = path.resolve(
  "powerautomate_files/TestCloudflow2026020_20260202070901.zip"
);

describe("parseZip", () => {
  it("should parse root manifest from ZIP", async () => {
    const buffer = readFileSync(ZIP_PATH);
    const result = await parseZip(buffer);

    expect(result.manifest).toBeDefined();
    expect(result.manifest.schema).toBe("1.0");
    expect(result.manifest.details.displayName).toBe(
      "TestCloudflow2026020"
    );
  });

  it("should extract flow definitions", async () => {
    const buffer = readFileSync(ZIP_PATH);
    const result = await parseZip(buffer);

    expect(result.flows).toHaveLength(1);
    const flow = result.flows[0];
    expect(flow.flowId).toBe("cd3b66c2-50b3-412d-a8ca-47d42cbe9d84");
    expect(flow.definition.properties.displayName).toBe(
      "OneDrive に新しいファイルがアップロードされたときに通知とメールを受け取る"
    );
  });

  it("should parse apisMap", async () => {
    const buffer = readFileSync(ZIP_PATH);
    const result = await parseZip(buffer);
    const flow = result.flows[0];

    expect(flow.apisMap).toEqual({
      shared_onedriveforbusiness: "f425ff24-4e2d-40f7-b0c6-34f6d1013e70",
      shared_office365: "e70a0165-b267-4b57-87e9-d6d3de2b1756",
    });
  });

  it("should parse connectionsMap", async () => {
    const buffer = readFileSync(ZIP_PATH);
    const result = await parseZip(buffer);
    const flow = result.flows[0];

    expect(flow.connectionsMap).toEqual({
      shared_onedriveforbusiness: "90dd210a-a5cf-4b9c-8e24-fe8d49f90417",
      shared_office365: "fc68776b-170f-43a7-a263-71b5bd38e3ed",
    });
  });

  it("should parse triggers and actions from definition", async () => {
    const buffer = readFileSync(ZIP_PATH);
    const result = await parseZip(buffer);
    const def = result.flows[0].definition.properties.definition;

    expect(Object.keys(def.triggers)).toContain(
      "When_a_file_is_created_(properties_only)"
    );
    expect(Object.keys(def.actions)).toContain(
      "Send_me_an_email_notification"
    );
  });

  it("should parse connectionReferences", async () => {
    const buffer = readFileSync(ZIP_PATH);
    const result = await parseZip(buffer);
    const refs = result.flows[0].definition.properties.connectionReferences;

    expect(refs.shared_onedriveforbusiness.apiName).toBe(
      "onedriveforbusiness"
    );
    expect(refs.shared_office365.apiName).toBe("office365");
  });

  it("should throw on invalid ZIP", async () => {
    const invalidBuffer = Buffer.from("not a zip file");
    await expect(parseZip(invalidBuffer)).rejects.toThrow();
  });

  it("should extract package resources (connectors)", async () => {
    const buffer = readFileSync(ZIP_PATH);
    const result = await parseZip(buffer);
    const resources = result.manifest.resources;

    const apiResources = Object.values(resources).filter(
      (r) => r.type === "Microsoft.PowerApps/apis"
    );
    expect(apiResources).toHaveLength(2);
    expect(apiResources.map((r) => r.details.displayName)).toContain(
      "OneDrive for Business"
    );
    expect(apiResources.map((r) => r.details.displayName)).toContain(
      "Office 365 Outlook"
    );
  });
});

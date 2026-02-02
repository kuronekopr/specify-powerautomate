import JSZip from "jszip";
import type {
  PackageManifest,
  FlowsManifest,
  FlowDefinition,
  ParsedPackage,
  ParsedFlow,
} from "./types";

/**
 * Parse a Power Automate export ZIP file and return structured data.
 */
export async function parseZip(
  buffer: ArrayBuffer | Buffer
): Promise<ParsedPackage> {
  const zip = await JSZip.loadAsync(buffer);

  // Parse root manifest
  const manifestFile = zip.file("manifest.json");
  if (!manifestFile) {
    throw new Error("manifest.json not found in ZIP");
  }
  const manifest: PackageManifest = JSON.parse(await manifestFile.async("text"));

  // Parse flows manifest
  const flowsManifestFile = zip.file("Microsoft.Flow/flows/manifest.json");
  if (!flowsManifestFile) {
    throw new Error("Microsoft.Flow/flows/manifest.json not found in ZIP");
  }
  const flowsManifest: FlowsManifest = JSON.parse(
    await flowsManifestFile.async("text")
  );

  // Parse each flow
  const flows: ParsedFlow[] = [];
  for (const flowId of flowsManifest.flowAssets.assetPaths) {
    const basePath = `Microsoft.Flow/flows/${flowId}`;

    const definitionFile = zip.file(`${basePath}/definition.json`);
    if (!definitionFile) {
      throw new Error(`definition.json not found for flow ${flowId}`);
    }
    const definition: FlowDefinition = JSON.parse(
      await definitionFile.async("text")
    );

    const apisMapFile = zip.file(`${basePath}/apisMap.json`);
    const apisMap: Record<string, string> = apisMapFile
      ? JSON.parse(await apisMapFile.async("text"))
      : {};

    const connectionsMapFile = zip.file(`${basePath}/connectionsMap.json`);
    const connectionsMap: Record<string, string> = connectionsMapFile
      ? JSON.parse(await connectionsMapFile.async("text"))
      : {};

    flows.push({ flowId, definition, apisMap, connectionsMap });
  }

  return { manifest, flows };
}

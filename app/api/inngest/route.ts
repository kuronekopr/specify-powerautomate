import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import { analyzeUpload } from "@/inngest/functions/analyze-upload";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [analyzeUpload],
});

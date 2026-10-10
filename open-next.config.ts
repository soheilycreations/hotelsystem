import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Default (in-memory) incremental cache. Every page is force-dynamic and the app
// only uses on-demand revalidatePath(), so no R2 cache is needed.
export default defineCloudflareConfig();

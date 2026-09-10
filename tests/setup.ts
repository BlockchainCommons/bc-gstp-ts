/**
 * Runs before every test file (`vitest.config.ts` `setupFiles`).
 *
 * The known-values directory configuration is pinned to no directories, so
 * the global registry never reads the machine's `~/.known-values`; the
 * envelope tags and summarisers are registered, as the reference's tests
 * call `bc_envelope::register_tags()`, so requests, responses and events
 * print as `request(…)`, `«f»`, `❰p❱`.
 */
import { DirectoryConfig, setDirectoryConfig } from "@blockchaincommons/known-values";
import { registerTags } from "@blockchaincommons/envelope/format";

setDirectoryConfig(new DirectoryConfig());
registerTags();

import createClient from "openapi-fetch";

import { apiBaseUrl } from "./base-url";
import type { paths } from "./schema";

/** The one typed API client. Feature hooks in src/features/<f>/api build on this. */
export const apiClient = createClient<paths>({ baseUrl: apiBaseUrl });

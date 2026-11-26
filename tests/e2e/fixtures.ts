/** Test data the e2e server seeds (`tests/e2e/server.ts`). Not secrets. */
export const E2E_JOIN_CODE = "TSTCDE";
export const E2E_ADMIN_PASSWORD = "e2e-admin-password";
/** The TBA key the e2e server gives `next start`; its recorded TBA answers only this key. */
export const E2E_TBA_KEY = "test-key-not-real";
/** The e2e server's in-memory MongoDB, which tests read to check what was stored. */
export const E2E_MONGO_PORT = 47017;
export const E2E_MONGO_URI = `mongodb://127.0.0.1:${E2E_MONGO_PORT}/spot-e2e`;
/** The roster the e2e server seeds: student ID and name. */
export const E2E_ROSTER: [string, string][] = [
  ["700001", "Alex Rivera"],
  ["700002", "Jordan Lee"],
  ["700003", "Zoe Park"],
];

#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();

const requiredMigrations = [
  "20260402100000_harden_payment_slips_storage.sql",
  "20260402120000_add_voice_to_messages.sql",
  "20260402121000_add_theme_preference_to_profiles.sql",
  "20260403150000_restrict_chat_attachments_voice_notes.sql",
  "20260404110000_harden_chat_voice_notes.sql",
];

const functionVerifyJwtExpectations = {
  "payment-reminder-cron": false,
  "notify-unconfirmed-transfers": false,
  "send-chat-push-notification": true,
  "downgrade-expired-trials": false,
  "verify-payment-slip": true,
};

const requiredEdgeFunctions = [
  "payment-reminder-cron",
  "notify-unconfirmed-transfers",
  "downgrade-expired-trials",
  "send-chat-push-notification",
  "verify-payment-slip",
];

const requiredFrontendEnvKeys = [
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_PUBLISHABLE_KEY",
];

const optionalFrontendEnvKeys = [
  "VITE_SENTRY_DSN",
];

const productionManualEnvKeys = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "INTERNAL_FUNCTION_SECRET",
];

let failureCount = 0;

function rel(filePath) {
  return path.relative(repoRoot, filePath);
}

function logSection(title) {
  console.log(`\n== ${title} ==`);
}

function pass(message) {
  console.log(`PASS ${message}`);
}

function warn(message) {
  console.log(`WARN ${message}`);
}

function fail(message) {
  failureCount += 1;
  console.log(`FAIL ${message}`);
}

function runCommand(label, command, args) {
  console.log(`RUN  ${label}`);
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: "pipe",
  });

  if (result.stdout?.trim()) {
    console.log(result.stdout.trim());
  }

  if (result.stderr?.trim()) {
    console.log(result.stderr.trim());
  }

  return result;
}

function loadJson(filePath, fallback) {
  if (!existsSync(filePath)) {
    return fallback;
  }

  return JSON.parse(readFileSync(filePath, "utf8"));
}

function loadEnvMap() {
  const envFiles = [
    ".env",
    ".env.local",
    ".env.production",
    ".env.production.local",
  ];

  const map = new Map();

  for (const file of envFiles) {
    const fullPath = path.join(repoRoot, file);
    if (!existsSync(fullPath)) {
      continue;
    }

    const lines = readFileSync(fullPath, "utf8").split(/\r?\n/);
    for (const line of lines) {
      if (!line || line.trim().startsWith("#")) {
        continue;
      }

      const equalsIndex = line.indexOf("=");
      if (equalsIndex === -1) {
        continue;
      }

      const key = line.slice(0, equalsIndex).trim();
      const rawValue = line.slice(equalsIndex + 1).trim();
      const value = rawValue.replace(/^['"]|['"]$/g, "");
      if (key && !map.has(key)) {
        map.set(key, value);
      }
    }
  }

  return map;
}

function getEnvValue(key, envMap) {
  return process.env[key] ?? envMap.get(key);
}

function runQualityGates() {
  logSection("Quality Gates");

  const qualityCommands = [
    ["typecheck", "npm", ["run", "typecheck"]],
    ["tests", "npm", ["run", "test:run"]],
    ["build", "npm", ["run", "build"]],
  ];

  for (const [label, command, args] of qualityCommands) {
    const result = runCommand(label, command, args);
    if (result.status === 0) {
      pass(`${label} passed`);
    } else {
      fail(`${label} failed with exit code ${result.status ?? "unknown"}`);
    }
  }
}

function runLintBaselineCheck() {
  logSection("Lint Baseline");

  const baselinePath = path.join(repoRoot, "deploy", "lint-warning-baseline.json");
  const baseline = loadJson(baselinePath, {});
  const eslintBin = path.join(repoRoot, "node_modules", "eslint", "bin", "eslint.js");

  if (!existsSync(eslintBin)) {
    fail("Local eslint binary is missing; run npm install before auditing");
    return;
  }

  const result = spawnSync(process.execPath, [eslintBin, ".", "--format", "json"], {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: "pipe",
  });

  if (result.stderr?.trim()) {
    console.log(result.stderr.trim());
  }

  if (result.status !== 0 && !result.stdout?.trim()) {
    fail(`eslint json run failed with exit code ${result.status ?? "unknown"}`);
    return;
  }

  const report = JSON.parse(result.stdout || "[]");
  const warningCounts = {};
  let errorTotal = 0;

  for (const fileReport of report) {
    const relativePath = rel(fileReport.filePath);
    for (const message of fileReport.messages ?? []) {
      if (message.severity === 2) {
        errorTotal += 1;
        continue;
      }

      if (message.severity !== 1) {
        continue;
      }

      const ruleId = message.ruleId ?? "unknown-rule";
      const key = `${relativePath}::${ruleId}`;
      warningCounts[key] = (warningCounts[key] ?? 0) + 1;
    }
  }

  if (errorTotal > 0) {
    fail(`eslint reported ${errorTotal} error(s)`);
  }

  const unexpectedWarnings = [];
  for (const [key, count] of Object.entries(warningCounts)) {
    const baselineCount = baseline[key] ?? 0;
    if (count > baselineCount) {
      unexpectedWarnings.push(`${key} (${count} > baseline ${baselineCount})`);
    }
  }

  if (unexpectedWarnings.length > 0) {
    fail(`New lint warnings detected:\n- ${unexpectedWarnings.join("\n- ")}`);
  } else if (errorTotal === 0) {
    pass("lint warnings are within the approved baseline");
  }
}

function validateRepoInvariants() {
  logSection("Repo Invariants");

  const migrationDir = path.join(repoRoot, "supabase", "migrations");
  const migrations = readdirSync(migrationDir)
    .filter((file) => file.endsWith(".sql"))
    .sort();

  let lastIndex = -1;
  for (const migration of requiredMigrations) {
    const index = migrations.indexOf(migration);
    if (index === -1) {
      fail(`Required migration is missing: ${migration}`);
      continue;
    }

    if (index <= lastIndex) {
      fail(`Migration order is incorrect around ${migration}`);
      continue;
    }

    lastIndex = index;
    pass(`Required migration present in order: ${migration}`);
  }

  for (const functionName of requiredEdgeFunctions) {
    const filePath = path.join(repoRoot, "supabase", "functions", functionName, "index.ts");
    if (existsSync(filePath)) {
      pass(`Edge function entrypoint exists: ${rel(filePath)}`);
    } else {
      fail(`Missing edge function entrypoint: ${rel(filePath)}`);
    }
  }

  const configPath = path.join(repoRoot, "supabase", "config.toml");
  const configText = readFileSync(configPath, "utf8");

  for (const [functionName, expectedValue] of Object.entries(functionVerifyJwtExpectations)) {
    const matcher = new RegExp(
      String.raw`\[functions\.${functionName.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}\][\s\S]*?verify_jwt = ${expectedValue}`,
      "m"
    );

    if (matcher.test(configText)) {
      pass(`verify_jwt matches expectation for ${functionName}`);
    } else {
      fail(`verify_jwt does not match expectation for ${functionName}`);
    }
  }
}

function validateEnvPresence() {
  logSection("Environment");

  const envMap = loadEnvMap();

  for (const key of requiredFrontendEnvKeys) {
    if (getEnvValue(key, envMap)) {
      pass(`Frontend env present: ${key}`);
    } else {
      fail(`Missing required frontend env: ${key}`);
    }
  }

  for (const key of optionalFrontendEnvKeys) {
    if (getEnvValue(key, envMap)) {
      pass(`Optional frontend env present: ${key}`);
    } else {
      warn(`Optional frontend env missing: ${key}`);
    }
  }

  warn(
    `Production secret verification remains manual outside the repo: ${productionManualEnvKeys.join(", ")}`
  );
}

function parseBugReportSections() {
  const bugReportPath = path.join(repoRoot, "BUG_REPORT.md");
  const bugReportText = readFileSync(bugReportPath, "utf8");
  const lines = bugReportText.split(/\r?\n/);

  const blockingSections = new Set(["Partial / Needs Backend", "Still Open"]);
  const items = [];
  let currentSection = "";

  for (const line of lines) {
    const headingMatch = line.match(/^##\s+(.*)$/);
    if (headingMatch) {
      currentSection = headingMatch[1].trim();
      continue;
    }

    if (!blockingSections.has(currentSection)) {
      continue;
    }

    const uncheckedMatch = line.match(/^- \[ \] (?:(?<id>[A-Z]-\d+)\s+)?(?<title>.+)$/);
    if (!uncheckedMatch?.groups?.title) {
      continue;
    }

    const key = uncheckedMatch.groups.id ?? uncheckedMatch.groups.title.trim();
    items.push({
      key,
      title: uncheckedMatch.groups.title.trim(),
      section: currentSection,
    });
  }

  return items;
}

function validateBugReportState() {
  logSection("Release Blockers");

  const waiverPath = path.join(repoRoot, "deploy", "release-waivers.json");
  const waivers = loadJson(waiverPath, {
    approvedWaivers: [],
    disabledFeatures: [],
  });

  const waivedKeys = new Set(
    [...(waivers.approvedWaivers ?? []), ...(waivers.disabledFeatures ?? [])]
      .map((entry) => entry?.key)
      .filter(Boolean)
  );

  const unresolvedItems = parseBugReportSections();
  const blockingItems = unresolvedItems.filter((item) => !waivedKeys.has(item.key));

  if (blockingItems.length === 0) {
    pass("No unresolved bug-report blockers remain without waiver or feature disable");
    return;
  }

  fail(
    `Unresolved production blockers remain:\n- ${blockingItems
      .map((item) =>
        item.key === item.title
          ? `[${item.section}] ${item.title}`
          : `[${item.section}] ${item.key}: ${item.title}`
      )
      .join("\n- ")}`
  );
}

function printManualProductionChecklist() {
  logSection("Manual Production Checks");
  console.log(
    [
      "1. Freeze the release commit/branch and deploy frontend + Supabase from the same revision.",
      "2. Take a production schema backup/snapshot before applying migrations.",
      "3. Verify production secrets in the hosting platform and Supabase dashboard.",
      "4. Deploy the four edge functions and confirm dashboard cron schedules still exist.",
      "5. Run the smoke test checklist in docs/pre-deploy-runbook.md before the final go/no-go.",
    ].join("\n")
  );
}

runQualityGates();
runLintBaselineCheck();
validateRepoInvariants();
validateEnvPresence();
validateBugReportState();
printManualProductionChecklist();

if (failureCount > 0) {
  console.log(`\nPre-deploy audit failed with ${failureCount} blocking issue(s).`);
  process.exit(1);
}

console.log("\nPre-deploy audit passed.");

#!/usr/bin/env node

import { createClient } from "@supabase/supabase-js";

const argv = process.argv.slice(2);
const flags = new Set(argv.filter((arg) => arg.startsWith("--")));
const applyMode = flags.has("--apply");

function getFlagValue(name) {
  const prefix = `${name}=`;
  const entry = argv.find((arg) => arg.startsWith(prefix));
  return entry ? entry.slice(prefix.length) : null;
}

function compareDesc(a, b) {
  if (a === b) return 0;
  return a > b ? -1 : 1;
}

function compareAsc(a, b) {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

function chunk(values, size) {
  const result = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

function groupRows(rows, keyFn) {
  const groups = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(row);
  }
  return [...groups.entries()]
    .filter(([, entries]) => entries.length > 1)
    .map(([key, entries]) => ({ key, entries }));
}

function summarizeDuplicates(groups, keepRowFn) {
  return groups.map(({ key, entries }) => {
    const sorted = [...entries].sort(keepRowFn);
    const keep = sorted[0];
    const remove = sorted.slice(1);

    return {
      key,
      count: entries.length,
      keepId: keep.id,
      removeIds: remove.map((row) => row.id),
      rows: entries,
    };
  });
}

async function fetchRows(supabase, table, columns, { filter = [], pageSize = 1000 } = {}) {
  const rows = [];
  let from = 0;

  while (true) {
    let query = supabase.from(table).select(columns).order("created_at", { ascending: true });

    for (const step of filter) {
      query = step(query);
    }

    const { data, error } = await query.range(from, from + pageSize - 1);
    if (error) {
      throw new Error(`Failed to fetch ${table}: ${error.message}`);
    }

    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) {
      break;
    }

    from += pageSize;
  }

  return rows;
}

function printSection(title) {
  console.log(`\n== ${title} ==`);
}

function printSummary(label, result, extraLines = []) {
  console.log(`${label}: ${result.groups.length} duplicate group(s), ${result.rowsToRemove} row(s) to remove`);
  for (const line of extraLines) {
    console.log(line);
  }

  if (result.samples.length > 0) {
    console.table(result.samples);
  }
}

async function deleteRows(supabase, table, ids) {
  for (const batch of chunk(ids, 100)) {
    const { error } = await supabase.from(table).delete().in("id", batch);
    if (error) {
      throw new Error(`Failed to delete from ${table}: ${error.message}`);
    }
  }
}

function buildReport(rows, { keyFn, keepSortFn }) {
  const groups = summarizeDuplicates(groupRows(rows, keyFn), keepSortFn);
  const rowsToRemove = groups.reduce((total, group) => total + group.removeIds.length, 0);
  const samples = groups.slice(0, 10).map((group) => ({
    key: group.key,
    count: group.count,
    keepId: group.keepId,
    removeIds: group.removeIds.join(", "),
  }));

  return { groups, rowsToRemove, samples };
}

async function main() {
  const supabaseUrl = getFlagValue("--supabase-url")
    ?? process.env.SUPABASE_URL
    ?? process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = getFlagValue("--service-role-key")
    ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.error(
      "Missing Supabase credentials. Set SUPABASE_URL (or VITE_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY, or pass --supabase-url and --service-role-key.",
    );
    process.exitCode = 1;
    return;
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  printSection("Duplicate cleanup readiness");
  console.log(`Mode: ${applyMode ? "apply" : "report only"}`);
  console.log("Retention rules:");
  console.log("- friend_requests: keep the latest row per canonical pair");
  console.log("- friends: keep the latest row per exact directional pair");
  console.log("- slip_verifications: keep the latest pending row per installment");
  console.log("- point_transactions: keep the earliest row per (user_id, action_type, reference_id)");

  const friendRequests = await fetchRows(
    supabase,
    "friend_requests",
    "id, from_user_id, to_user_id, status, created_at, updated_at",
  );
  const friends = await fetchRows(
    supabase,
    "friends",
    "id, user_id, friend_user_id, created_at",
  );
  const slipVerifications = await fetchRows(
    supabase,
    "slip_verifications",
    "id, installment_id, status, created_at",
    { filter: [(query) => query.eq("status", "pending")] },
  );
  const pointTransactions = await fetchRows(
    supabase,
    "point_transactions",
    "id, user_id, action_type, reference_id, created_at",
  );

  const report = {
    friendRequests: buildReport(friendRequests, {
      keyFn: (row) => [row.from_user_id, row.to_user_id].sort().join("::"),
      keepSortFn: (a, b) =>
        compareDesc(a.updated_at, b.updated_at)
        || compareDesc(a.created_at, b.created_at)
        || compareDesc(a.id, b.id),
    }),
    friends: buildReport(friends, {
      keyFn: (row) => `${row.user_id}::${row.friend_user_id}`,
      keepSortFn: (a, b) =>
        compareDesc(a.created_at, b.created_at)
        || compareDesc(a.id, b.id),
    }),
    slipVerifications: buildReport(slipVerifications, {
      keyFn: (row) => row.installment_id,
      keepSortFn: (a, b) =>
        compareDesc(a.created_at, b.created_at)
        || compareDesc(a.id, b.id),
    }),
    pointTransactions: buildReport(
      pointTransactions.filter((row) => row.reference_id !== null),
      {
        keyFn: (row) => `${row.user_id}::${row.action_type}::${row.reference_id}`,
        keepSortFn: (a, b) =>
          compareAsc(a.created_at, b.created_at)
          || compareAsc(a.id, b.id),
      },
    ),
  };

  printSection("Dry-run summary");
  printSummary("friend_requests", report.friendRequests);
  printSummary("friends", report.friends);
  printSummary("slip_verifications (pending only)", report.slipVerifications);
  printSummary("point_transactions (reference_id not null)", report.pointTransactions, [
    `Non-blocking rows with null reference_id: ${pointTransactions.filter((row) => row.reference_id === null).length}`,
  ]);

  if (!applyMode) {
    return;
  }

  printSection("Applying cleanup");
  for (const group of report.friendRequests.groups) {
    await deleteRows(supabase, "friend_requests", group.removeIds);
  }
  for (const group of report.friends.groups) {
    await deleteRows(supabase, "friends", group.removeIds);
  }
  for (const group of report.slipVerifications.groups) {
    await deleteRows(supabase, "slip_verifications", group.removeIds);
  }
  for (const group of report.pointTransactions.groups) {
    await deleteRows(supabase, "point_transactions", group.removeIds);
  }

  printSection("Verification pass");
  const verifyFriendRequests = buildReport(
    await fetchRows(
      supabase,
      "friend_requests",
      "id, from_user_id, to_user_id, status, created_at, updated_at",
    ),
    {
      keyFn: (row) => [row.from_user_id, row.to_user_id].sort().join("::"),
      keepSortFn: (a, b) =>
        compareDesc(a.updated_at, b.updated_at)
        || compareDesc(a.created_at, b.created_at)
        || compareDesc(a.id, b.id),
    },
  );
  const verifyFriends = buildReport(
    await fetchRows(supabase, "friends", "id, user_id, friend_user_id, created_at"),
    {
      keyFn: (row) => `${row.user_id}::${row.friend_user_id}`,
      keepSortFn: (a, b) =>
        compareDesc(a.created_at, b.created_at)
        || compareDesc(a.id, b.id),
    },
  );
  const verifySlipVerifications = buildReport(
    await fetchRows(
      supabase,
      "slip_verifications",
      "id, installment_id, status, created_at",
      { filter: [(query) => query.eq("status", "pending")] },
    ),
    {
      keyFn: (row) => row.installment_id,
      keepSortFn: (a, b) =>
        compareDesc(a.created_at, b.created_at)
        || compareDesc(a.id, b.id),
    },
  );
  const verifyPointTransactions = buildReport(
    (await fetchRows(
      supabase,
      "point_transactions",
      "id, user_id, action_type, reference_id, created_at",
    )).filter((row) => row.reference_id !== null),
    {
      keyFn: (row) => `${row.user_id}::${row.action_type}::${row.reference_id}`,
      keepSortFn: (a, b) =>
        compareAsc(a.created_at, b.created_at)
        || compareAsc(a.id, b.id),
    },
  );

  const remaining = [
    verifyFriendRequests.groups.length,
    verifyFriends.groups.length,
    verifySlipVerifications.groups.length,
    verifyPointTransactions.groups.length,
  ].reduce((total, count) => total + count, 0);

  printSummary("friend_requests", verifyFriendRequests);
  printSummary("friends", verifyFriends);
  printSummary("slip_verifications (pending only)", verifySlipVerifications);
  printSummary("point_transactions (reference_id not null)", verifyPointTransactions);

  if (remaining > 0) {
    throw new Error("Duplicate cleanup did not fully clear the targeted groups");
  }

  console.log("Cleanup completed successfully.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

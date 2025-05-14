// Load environment variables from a `.env` file into process.env
require("dotenv").config();

// Import built-in and third-party modules
const fs = require("fs");
const { Octokit } = require("@octokit/rest"); // GitHub REST API client
const { graphql } = require("@octokit/graphql"); // GitHub GraphQL API client
const { parse } = require("json2csv"); // Utility to convert JSON to CSV

// Ensure a GitHub token is provided in environment variables
if (!process.env.GITHUB_TOKEN) {
  console.error("❌ GITHUB_TOKEN not found in environment.");
  process.exit(1); // Exit the script if token is missing
}

// Initialize authenticated REST client
const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

// Initialize authenticated GraphQL client
const graphqlWithAuth = graphql.defaults({
  headers: {
    authorization: `token ${process.env.GITHUB_TOKEN}`,
  },
});

// List of GitHub repositories 
const REPOS = [
  { owner: "hiero-ledger", repo: "hiero-sdk-go" },
  { owner: "hiero-ledger", repo: "hiero-sdk-Swift" },
  { owner: "hiero-ledger", repo: "hiero-sdk-cpp" },
  { owner: "hiero-ledger", repo: "hiero-sdk-rust" },
  { owner: "hiero-ledger", repo: "hiero-sdk-java" },
  { owner: "hiero-ledger", repo: "hiero-sdk-js" },
  { owner: "hashgraph", repo: "hedera-docs" },
];

// Set of usernames considered project maintainers (not considered community)
const MAINTAINERS = new Set([
  "SimiHunjan",
  "ivaylonikolov7",
  "venilinvasilev",
  "andrewb1269hg",
  "0xivanov",
  "rwalworth",
  "naydenovn",
  "nickeynikolovv",
  "gsstoykov",
  "ivaylogarnev-limechain",
  "RickyLB",
  "theekrystallee",
  "Mark-Swirlds",
  "Neurone",
  "Reccetech",
  "kpachhai",
  "deshmukhpranali",
  "AliNik4n",
  "jaycoolh",
  "svienot",
  "rbarker-dev",
  "quiet-node",
  "hendrikebbers",
  "ericleponner",
  "mgarbs",
  "nathanklick",
  "Sheng-Long",
  "ed-marquez",
  "pathornteng",
  "steven-sheehy",
  "Dosik13",
]);

// Filter issues created from March 2025 onwards
const FROM_YEAR = 2025;
const FROM_MONTH = 2; // 0 represent January

// Date falls on a business day (Mon–Fri)
const isBusinessDay = (date) => {
  const day = date.getUTCDay();
  return day !== 0 && day !== 6; // 0 = Sunday, 6 = Saturday
};

// Count number of business days between two dates
const businessDaysBetween = (start, end) => {
  let count = 0;
  const current = new Date(start);

  while (current <= end) {
    if (isBusinessDay(current)) {
      count++;
    }
    current.setUTCDate(current.getUTCDate() + 1);
  }

  return count;
};

// Fetch all issues from a repo (open/closed) created since FROM_YEAR/FROM_MONTH
async function getAllIssues(owner, repo) {
  const issues = [];
  let hasNextPage = true;
  let cursor = null;

  while (hasNextPage) {
    // Query GitHub GraphQL API for issues
    const data = await graphqlWithAuth(
      `
      query ($owner: String!, $repo: String!, $cursor: String) {
        repository(owner: $owner, name: $repo) {
          issues(first: 100, after: $cursor, orderBy: {field: CREATED_AT, direction: DESC}, states: [OPEN, CLOSED]) {
            pageInfo {
              hasNextPage
              endCursor
            }
            nodes {
              number
              title
              createdAt
              author {
                login
              }
            }
          }
        }
      }
      `,
      { owner, repo, cursor }
    );

    const result = data.repository.issues;

    for (const issue of result.nodes) {
      const createdAt = new Date(issue.createdAt);
      const year = createdAt.getFullYear();
      const month = createdAt.getUTCMonth();

      if (year === FROM_YEAR && month >= FROM_MONTH) {
        // Include relevant issues
        issues.push({
          number: issue.number,
          title: issue.title,
          created_at: createdAt,
          author: issue.author?.login || "ghost",
        });
      } else if (
        year < FROM_YEAR ||
        (year === FROM_YEAR && month < FROM_MONTH)
      ) {
        // Stop fetching if we're past the date range
        hasNextPage = false;
        break;
      }
    }

    hasNextPage = result.pageInfo.hasNextPage;
    cursor = result.pageInfo.endCursor;
  }

  return issues;
}

// Fetch all comments for a specific issue using REST API
async function getComments(owner, repo, issueNumber) {
  const { data } = await octokit.issues.listComments({
    owner,
    repo,
    issue_number: issueNumber,
  });
  return data;
}

// For each community-created issue, calculate time to first maintainer response
async function calculateFirstResponseTimes(owner, repo) {
  const issues = await getAllIssues(owner, repo);
  const results = [];

  for (const issue of issues) {
    const createdAt = new Date(issue.created_at);
    const author = issue.author;

    // Skip issues created by maintainers
    if (MAINTAINERS.has(author)) continue;

    const comments = await getComments(owner, repo, issue.number);

    let firstResponseTime = null;
    let respondedIn48BusinessHours = null;

    for (const comment of comments) {
      const commenter = comment.user.login;
      // First valid response from a maintainer (not the issue author)
      if (MAINTAINERS.has(commenter) && commenter !== author) {
        const commentedAt = new Date(comment.created_at);
        firstResponseTime = (commentedAt - createdAt) / (1000 * 60 * 60); // in hours

        const businessDays = businessDaysBetween(createdAt, commentedAt);
        respondedIn48BusinessHours = businessDays <= 2 ? "yes" : "no";
        break;
      }
    }

    results.push({
      repo,
      issue_number: issue.number,
      title: issue.title,
      author,
      created_at: createdAt.toISOString(),
      first_response_time_hours: firstResponseTime
        ? firstResponseTime.toFixed(2)
        : null,
      responded_in_48_business_hours: respondedIn48BusinessHours,
    });
  }

  // Print summary stats to the console
  const totalIssues = results.length;
  const responded = results.filter(
    (r) => r.responded_in_48_business_hours !== null
  ).length;
  const responseRate =
    totalIssues === 0 ? "100.00" : ((responded / totalIssues) * 100).toFixed(2);

  console.log("\n📊 Summary:");
  console.log(`- Total community issues: ${totalIssues}`);
  console.log(`- Issues with an initial response: ${responded}`);
  console.log(`- Initial response rate: ${responseRate}%`);

  if (parseFloat(responseRate) < 90) {
    console.log("⚠️ Not all issues received a response. Let’s aim for 90%! 🚀");
  } else {
    console.log("🎉 Perfect response coverage! 🔥");
  }

  return {
    rows: results,
    summary: { repo, totalIssues, responded, responseRate },
  };
}

// Print summary table to console and save CSV reports
function printAndSaveSummary(allResults, overallSummary) {
  console.log(`\n\n============================`);
  console.log(`📋 Overall Issue Response Time Summary for All Repos`);
  console.log(`============================\n`);

  console.table(
    overallSummary.map((r) => ({
      Repos: r.repo,
      "Total Issues": r.totalIssues,
      Responded: r.responded,
      "Response Rate (%)": r.responseRate,
    }))
  );

  // Save detailed issue response times
  const resultsCsv = parse(allResults, {
    fields: [
      "repo",
      "issue_number",
      "title",
      "author",
      "created_at",
      "first_response_time_hours",
      "responded_in_48_business_hours",
    ],
  });

  fs.writeFileSync("repo-results-all.csv", resultsCsv);
  console.log("\n✅ repo-results-all.csv saved!");

  // Save repo-level summary
  const summaryCsv = parse(overallSummary, {
    fields: ["repo", "totalIssues", "responded", "responseRate"],
  });

  fs.writeFileSync("repo-summary.csv", summaryCsv);
  console.log("✅ repo-summary.csv saved!");
}

// Run reports for all repositories
async function runAll() {
  const allResults = [];
  const overallSummary = [];

  for (const { owner, repo } of REPOS) {
    console.log(`\n============================`);
    console.log(`📦 Running report for: ${repo}`);
    console.log(`============================\n`);

    const { rows, summary } = await calculateFirstResponseTimes(owner, repo);
    allResults.push(...rows);
    overallSummary.push(summary);
  }

  printAndSaveSummary(allResults, overallSummary);
}

// Execute main function and catch any errors
runAll().catch((err) => {
  console.error("❌ Error:", err);
});

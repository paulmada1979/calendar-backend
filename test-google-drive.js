#!/usr/bin/env node

/**
 * Test script for Google Drive integration
 * Run with: node test-google-drive.js
 */

const BASE_URL = process.env.BACKEND_URL || "http://localhost:4000";
const TEST_USER_ID = process.env.TEST_USER_ID || "test-user-123";

console.log("🧪 Testing Google Drive Integration");
console.log("====================================");
console.log(`Base URL: ${BASE_URL}`);
console.log(`Test User ID: ${TEST_USER_ID}`);
console.log("");

// Test endpoints
const endpoints = [
  {
    name: "Health Check",
    method: "GET",
    path: "/health",
    auth: false,
  },
  {
    name: "Composio Status",
    method: "GET",
    path: "/test-composio",
    auth: false,
  },
  {
    name: "Google Drive Connection Status",
    method: "GET",
    path: `/social/status/googledrive`,
    auth: true,
  },
  {
    name: "List Google Drive Files",
    method: "GET",
    path: "/social/google-drive/files?pageSize=10",
    auth: true,
  },
  {
    name: "Google Drive Storage Quota",
    method: "GET",
    path: "/social/google-drive/quota",
    auth: true,
  },
  {
    name: "Google Drive User Profile",
    method: "GET",
    path: "/social/google-drive/profile",
    auth: true,
  },
  {
    name: "Sync Google Drive Documents",
    method: "POST",
    path: "/social/google-drive/sync-documents",
    auth: true,
  },
  {
    name: "Get User Documents",
    method: "GET",
    path: "/social/google-drive/documents?limit=10",
    auth: true,
  },
  {
    name: "Get Unprocessed Documents",
    method: "GET",
    path: "/social/google-drive/documents/unprocessed?limit=10",
    auth: true,
  },
  {
    name: "Get Document Statistics",
    method: "GET",
    path: "/social/google-drive/documents/stats",
    auth: true,
  },
];

async function testEndpoint(endpoint) {
  console.log(`🔍 Testing: ${endpoint.name}`);
  console.log(`   ${endpoint.method} ${endpoint.path}`);

  try {
    const headers = {
      "Content-Type": "application/json",
    };

    if (endpoint.auth) {
      headers["x-user-id"] = TEST_USER_ID;
      headers["Authorization"] = "Bearer test-token";
    }

    const response = await fetch(`${BASE_URL}${endpoint.path}`, {
      method: endpoint.method,
      headers,
    });

    const status = response.status;
    const statusText = response.statusText;

    if (status === 200) {
      const data = await response.json();
      console.log(`   ✅ Status: ${status} ${statusText}`);
      console.log(
        `   📊 Response: ${JSON.stringify(data, null, 2).substring(0, 200)}...`
      );
    } else if (status === 401) {
      console.log(
        `   🔒 Status: ${status} ${statusText} (Authentication required)`
      );
    } else if (status === 404) {
      console.log(`   ❌ Status: ${status} ${statusText} (Not found)`);
    } else {
      console.log(`   ⚠️  Status: ${status} ${statusText}`);
      try {
        const errorData = await response.json();
        console.log(`   📋 Error: ${JSON.stringify(errorData, null, 2)}`);
      } catch (e) {
        console.log(`   📋 Error: Could not parse error response`);
      }
    }
  } catch (error) {
    console.log(`   💥 Error: ${error.message}`);
  }

  console.log("");
}

async function runTests() {
  console.log("🚀 Starting tests...\n");

  for (const endpoint of endpoints) {
    await testEndpoint(endpoint);
    // Small delay between requests
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  console.log("✨ Tests completed!");
  console.log("");
  console.log("📝 Notes:");
  console.log(
    "- 401 responses are expected for authenticated endpoints without valid tokens"
  );
  console.log("- 404 responses may occur if Google Drive is not connected");
  console.log("- Check the server logs for detailed error information");
  console.log("");
  console.log("🔧 To test with authentication:");
  console.log("1. Set TEST_USER_ID environment variable");
  console.log("2. Connect Google Drive account via OAuth");
  console.log("3. Use valid JWT token in Authorization header");
}

// Check if fetch is available (Node 18+)
if (typeof fetch === "undefined") {
  console.error("❌ Error: fetch is not available");
  console.log(
    "This script requires Node.js 18+ or you can install node-fetch:"
  );
  console.log("npm install node-fetch");
  process.exit(1);
}

// Run tests
runTests().catch((error) => {
  console.error("💥 Test runner failed:", error);
  process.exit(1);
});

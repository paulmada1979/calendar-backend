#!/usr/bin/env node

// Debug script for Google Calendar API issues
const { google } = require("googleapis");

async function debugGoogleCalendar() {
  console.log("🔍 Debugging Google Calendar API...\n");

  // Check environment variables
  console.log("📋 Environment Variables:");
  console.log(
    `  GOOGLE_CLIENT_ID: ${
      process.env.GOOGLE_CLIENT_ID ? "✅ Set" : "❌ Missing"
    }`
  );
  console.log(
    `  GOOGLE_CLIENT_SECRET: ${
      process.env.GOOGLE_CLIENT_SECRET ? "✅ Set" : "❌ Missing"
    }`
  );
  console.log(
    `  GOOGLE_REDIRECT_URI: ${process.env.GOOGLE_REDIRECT_URI || "❌ Missing"}`
  );
  console.log(`  NODE_ENV: ${process.env.NODE_ENV || "development"}`);
  console.log("");

  // Test OAuth client creation
  try {
    console.log("🔐 Testing OAuth client creation...");
    const client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );
    console.log("✅ OAuth client created successfully");

    // Test auth URL generation
    console.log("\n🌐 Testing auth URL generation...");
    const authUrl = client.generateAuthUrl({
      access_type: "offline",
      scope: [
        "https://www.googleapis.com/auth/calendar.readonly",
        "openid",
        "email",
        "profile",
      ],
      prompt: "consent",
    });
    console.log("✅ Auth URL generated successfully");
    console.log(`  URL: ${authUrl.substring(0, 100)}...`);
  } catch (error) {
    console.error("❌ Error creating OAuth client:", error.message);
  }

  console.log("\n📅 Calendar API Scopes:");
  console.log("  - https://www.googleapis.com/auth/calendar.readonly");
  console.log("  - openid");
  console.log("  - email");
  console.log("  - profile");

  console.log("\n🔍 Common Issues:");
  console.log(
    "  1. Check if Google Calendar API is enabled in Google Cloud Console"
  );
  console.log("  2. Verify OAuth consent screen is configured");
  console.log(
    "  3. Check if the calendar has events in the specified date range"
  );
  console.log("  4. Verify timezone settings in Google Calendar");
  console.log("  5. Check if the user has access to the calendar");

  console.log("\n📝 Next Steps:");
  console.log("  1. Test the /calendar/test-connection endpoint");
  console.log("  2. Check the logs for detailed API responses");
  console.log("  3. Verify the date range being sent to Google API");
  console.log(
    "  4. Test with a wider date range (e.g., last 30 days to next 30 days)"
  );
}

// Run the debug function
debugGoogleCalendar().catch(console.error);

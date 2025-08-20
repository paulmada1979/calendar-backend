/**
 * Utility functions for timezone operations
 */

/**
 * Get timezone offset in hours for a given timezone
 * @param timezone - Timezone string (e.g., 'America/New_York')
 * @returns Offset in hours (positive for ahead of UTC, negative for behind)
 */
export function getTimezoneOffset(timezone: string): number {
  try {
    const date = new Date();
    const utc = date.getTime() + date.getTimezoneOffset() * 60000;
    const targetTime = new Date(
      date.toLocaleString("en-US", { timeZone: timezone })
    );
    const targetOffset = targetTime.getTime() - utc;
    return targetOffset / (1000 * 60 * 60);
  } catch (error) {
    console.error(`Error calculating timezone offset for ${timezone}:`, error);
    return 0;
  }
}

/**
 * Get city and country names from timezone string
 * @param timezone - Timezone string (e.g., 'America/New_York')
 * @returns Object with city and country names
 */
export function getPlaceInfo(timezone: string): {
  city: string;
  country: string;
} {
  try {
    const parts = timezone.split("/");
    if (parts.length >= 2) {
      const city = parts[parts.length - 1].replace(/_/g, " ");
      const country = parts[parts.length - 2].replace(/_/g, " ");
      return { city, country };
    }
    return { city: timezone, country: "Unknown" };
  } catch (error) {
    console.error(`Error parsing timezone ${timezone}:`, error);
    return { city: timezone, country: "Unknown" };
  }
}

/**
 * Get system timezone
 * @returns Current system timezone
 */
export function getSystemTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch (error) {
    console.error("Error getting system timezone:", error);
    return "UTC";
  }
}

/**
 * Format timezone offset for display
 * @param offset - Offset in hours
 * @returns Formatted offset string (e.g., "+5:30", "-8:00")
 */
export function formatTimezoneOffset(offset: number): string {
  const sign = offset >= 0 ? "+" : "-";
  const absOffset = Math.abs(offset);
  const hours = Math.floor(absOffset);
  const minutes = Math.round((absOffset - hours) * 60);

  if (minutes === 0) {
    return `${sign}${hours}:00`;
  }
  return `${sign}${hours}:${minutes.toString().padStart(2, "0")}`;
}

/**
 * Check if a timezone is valid
 * @param timezone - Timezone string to validate
 * @returns True if valid, false otherwise
 */
export function isValidTimezone(timezone: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: timezone });
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Get list of common timezones with their offsets
 * @returns Array of timezone objects
 */
export function getCommonTimezones(): Array<{
  value: string;
  label: string;
  timezone_offset: number;
  city: string;
  country: string;
}> {
  const commonTimezones = [
    "UTC",
    "America/New_York",
    "America/Chicago",
    "America/Denver",
    "America/Los_Angeles",
    "Europe/London",
    "Europe/Paris",
    "Europe/Berlin",
    "Asia/Tokyo",
    "Asia/Shanghai",
    "Asia/Kolkata",
    "Australia/Sydney",
    "Pacific/Auckland",
  ];

  return commonTimezones
    .map((timezone) => {
      const timezoneOffset = getTimezoneOffset(timezone);
      const { city, country } = getPlaceInfo(timezone);
      const formattedOffset = formatTimezoneOffset(timezoneOffset);

      return {
        value: timezone,
        label: `${city} (${formattedOffset})`,
        timezone_offset: timezoneOffset,
        city,
        country,
      };
    })
    .sort((a, b) => a.timezone_offset - b.timezone_offset);
}

/**
 * Convert date to a specific timezone
 * @param date - Date to convert
 * @param timezone - Target timezone
 * @returns Date string in the target timezone
 */
export function convertDateToTimezone(date: Date, timezone: string): string {
  try {
    return date.toLocaleString("en-US", { timeZone: timezone });
  } catch (error) {
    console.error(`Error converting date to timezone ${timezone}:`, error);
    return date.toISOString();
  }
}

/**
 * Get current time in a specific timezone
 * @param timezone - Target timezone
 * @returns Current time string in the target timezone
 */
export function getCurrentTimeInTimezone(timezone: string): string {
  try {
    const now = new Date();
    return now.toLocaleString("en-US", {
      timeZone: timezone,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch (error) {
    console.error(`Error getting current time in timezone ${timezone}:`, error);
    return new Date().toISOString();
  }
}

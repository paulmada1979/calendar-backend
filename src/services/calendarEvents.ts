import { supabase } from "../lib/supabaseClient";
import { CalendarEvent } from "./userPreferences";

export interface GoogleCalendarEvent {
  id: string;
  summary: string;
  description?: string;
  location?: string;
  start: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
  end: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
  attendees?: Array<{
    email: string;
    displayName?: string;
    responseStatus?: string;
  }>;
  colorId?: string;
  transparency?: string;
  visibility?: string;
  extendedProperties?: {
    private?: {
      eventType?: string;
    };
  };
}

export class CalendarEventsService {
  /**
   * Store or update a Google Calendar event locally
   */
  static async storeGoogleEvent(
    userId: string,
    calendarId: string,
    googleEvent: GoogleCalendarEvent
  ): Promise<CalendarEvent> {
    try {
      // Check if event already exists
      const { data: existingEvent } = await supabase
        .from("calendar_events")
        .select("*")
        .eq("user_id", userId)
        .eq("google_event_id", googleEvent.id)
        .single();

      // Parse start and end times
      const startTime = this.parseGoogleDateTime(googleEvent.start);
      const endTime = googleEvent.end
        ? this.parseGoogleDateTime(googleEvent.end)
        : null;
      const allDay = !googleEvent.start.dateTime; // If no dateTime, it's all-day

      // Determine event type
      const eventType =
        googleEvent.extendedProperties?.private?.eventType || "meeting";

      const eventData = {
        user_id: userId,
        google_event_id: googleEvent.id,
        calendar_id: calendarId,
        summary: googleEvent.summary,
        description: googleEvent.description,
        location: googleEvent.location,
        start_time: startTime,
        end_time: endTime,
        all_day: allDay,
        attendees: googleEvent.attendees || [],
        color_id: googleEvent.colorId,
        transparency: googleEvent.transparency || "opaque",
        visibility: googleEvent.visibility || "default",
        event_type: eventType,
      };

      if (existingEvent) {
        // Update existing event
        const { data, error } = await supabase
          .from("calendar_events")
          .update(eventData)
          .eq("id", existingEvent.id)
          .select()
          .single();

        if (error) {
          throw new Error(`Failed to update calendar event: ${error.message}`);
        }

        return data;
      } else {
        // Create new event
        const { data, error } = await supabase
          .from("calendar_events")
          .insert(eventData)
          .select()
          .single();

        if (error) {
          throw new Error(`Failed to create calendar event: ${error.message}`);
        }

        return data;
      }
    } catch (error) {
      console.error("Error storing Google Calendar event:", error);
      throw error;
    }
  }

  /**
   * Store multiple Google Calendar events
   */
  static async storeGoogleEvents(
    userId: string,
    calendarId: string,
    googleEvents: GoogleCalendarEvent[]
  ): Promise<CalendarEvent[]> {
    try {
      const storedEvents: CalendarEvent[] = [];

      for (const event of googleEvents) {
        try {
          const storedEvent = await this.storeGoogleEvent(
            userId,
            calendarId,
            event
          );
          storedEvents.push(storedEvent);
        } catch (error) {
          console.error(`Failed to store event ${event.id}:`, error);
          // Continue with other events even if one fails
        }
      }

      return storedEvents;
    } catch (error) {
      console.error("Error storing multiple Google Calendar events:", error);
      throw error;
    }
  }

  /**
   * Get stored calendar events for a user within a date range
   */
  static async getStoredEvents(
    userId: string,
    startDate: string,
    endDate: string,
    calendarIds?: string[]
  ): Promise<CalendarEvent[]> {
    try {
      let query = supabase
        .from("calendar_events")
        .select("*")
        .eq("user_id", userId)
        .gte("start_time", startDate)
        .lte("start_time", endDate);

      if (calendarIds && calendarIds.length > 0) {
        query = query.in("calendar_id", calendarIds);
      }

      const { data, error } = await query.order("start_time", {
        ascending: true,
      });

      if (error) {
        throw new Error(
          `Failed to fetch stored calendar events: ${error.message}`
        );
      }

      return data || [];
    } catch (error) {
      console.error("Error getting stored calendar events:", error);
      throw error;
    }
  }

  /**
   * Delete a stored calendar event
   */
  static async deleteStoredEvent(
    userId: string,
    googleEventId: string
  ): Promise<void> {
    try {
      const { error } = await supabase
        .from("calendar_events")
        .delete()
        .eq("user_id", userId)
        .eq("google_event_id", googleEventId);

      if (error) {
        throw new Error(
          `Failed to delete stored calendar event: ${error.message}`
        );
      }
    } catch (error) {
      console.error("Error deleting stored calendar event:", error);
      throw error;
    }
  }

  /**
   * Clean up old events (optional maintenance function)
   */
  static async cleanupOldEvents(
    userId: string,
    daysOld: number = 30
  ): Promise<number> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysOld);

      const { data, error } = await supabase
        .from("calendar_events")
        .delete()
        .eq("user_id", userId)
        .lt("start_time", cutoffDate.toISOString())
        .select("id");

      if (error) {
        throw new Error(`Failed to cleanup old events: ${error.message}`);
      }

      return data?.length || 0;
    } catch (error) {
      console.error("Error cleaning up old events:", error);
      throw error;
    }
  }

  /**
   * Parse Google Calendar date/time format
   */
  private static parseGoogleDateTime(dateTimeObj: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  }): string {
    if (dateTimeObj.dateTime) {
      // Time-based event
      return dateTimeObj.dateTime;
    } else if (dateTimeObj.date) {
      // All-day event - convert to start of day in UTC
      return `${dateTimeObj.date}T00:00:00.000Z`;
    } else {
      throw new Error("Invalid date/time format from Google Calendar");
    }
  }
}

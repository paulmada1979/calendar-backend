import { supabase } from "../lib/supabaseClient";

export interface UserPreferences {
  id: string;
  user_id: string;
  timezone: string;
  locale: string;
  created_at: string;
  updated_at: string;
}

export interface UserTimeline {
  id: string;
  user_id: string;
  place_id: string;
  city: string;
  country: string;
  zone: string;
  timezone_offset: number;
  locale: string;
  display_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CalendarEvent {
  id: string;
  user_id: string;
  google_event_id: string;
  calendar_id: string;
  summary: string;
  description?: string;
  location?: string;
  start_time: string;
  end_time?: string;
  all_day: boolean;
  attendees?: any[];
  color_id?: string;
  transparency?: string;
  visibility?: string;
  event_type?: string;
  created_at: string;
  updated_at: string;
}

export class UserPreferencesService {
  /**
   * Get or create user preferences
   */
  static async getUserPreferences(userId: string): Promise<UserPreferences> {
    try {
      // Try to get existing preferences
      const { data: existingPrefs, error: fetchError } = await supabase
        .from("user_preferences")
        .select("*")
        .eq("user_id", userId)
        .single();

      if (existingPrefs) {
        return existingPrefs;
      }

      // Create default preferences if none exist
      const { data: newPrefs, error: createError } = await supabase
        .from("user_preferences")
        .insert({
          user_id: userId,
          timezone: "UTC",
          locale: "en-US",
        })
        .select()
        .single();

      if (createError) {
        throw new Error(
          `Failed to create user preferences: ${createError.message}`
        );
      }

      return newPrefs;
    } catch (error) {
      console.error("Error getting user preferences:", error);
      throw error;
    }
  }

  /**
   * Update user preferences
   */
  static async updateUserPreferences(
    userId: string,
    updates: Partial<Pick<UserPreferences, "timezone" | "locale">>
  ): Promise<UserPreferences> {
    try {
      const { data, error } = await supabase
        .from("user_preferences")
        .update(updates)
        .eq("user_id", userId)
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to update user preferences: ${error.message}`);
      }

      return data;
    } catch (error) {
      console.error("Error updating user preferences:", error);
      throw error;
    }
  }

  /**
   * Get user timeline places
   */
  static async getUserTimelines(userId: string): Promise<UserTimeline[]> {
    try {
      const { data, error } = await supabase
        .from("user_timelines")
        .select("*")
        .eq("user_id", userId)
        .eq("is_active", true)
        .order("display_order", { ascending: true });

      if (error) {
        throw new Error(`Failed to fetch user timelines: ${error.message}`);
      }

      return data || [];
    } catch (error) {
      console.error("Error getting user timelines:", error);
      throw error;
    }
  }

  /**
   * Add a new timeline place for user
   */
  static async addTimelinePlace(
    userId: string,
    timelineData: Omit<
      UserTimeline,
      "id" | "user_id" | "created_at" | "updated_at"
    >
  ): Promise<UserTimeline> {
    try {
      // Get the next display order
      const { data: existingTimelines } = await supabase
        .from("user_timelines")
        .select("display_order")
        .eq("user_id", userId)
        .eq("is_active", true)
        .order("display_order", { ascending: false })
        .limit(1);

      const nextOrder =
        existingTimelines && existingTimelines.length > 0
          ? existingTimelines[0].display_order + 1
          : 0;

      const { data, error } = await supabase
        .from("user_timelines")
        .insert({
          ...timelineData,
          user_id: userId,
          display_order: nextOrder,
        })
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to add timeline place: ${error.message}`);
      }

      return data;
    } catch (error) {
      console.error("Error adding timeline place:", error);
      throw error;
    }
  }

  /**
   * Update timeline place
   */
  static async updateTimelinePlace(
    timelineId: string,
    updates: Partial<
      Pick<
        UserTimeline,
        | "city"
        | "country"
        | "zone"
        | "timezone_offset"
        | "locale"
        | "display_order"
        | "is_active"
      >
    >
  ): Promise<UserTimeline> {
    try {
      const { data, error } = await supabase
        .from("user_timelines")
        .update(updates)
        .eq("id", timelineId)
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to update timeline place: ${error.message}`);
      }

      return data;
    } catch (error) {
      console.error("Error updating timeline place:", error);
      throw error;
    }
  }

  /**
   * Remove timeline place (soft delete by setting is_active to false)
   */
  static async removeTimelinePlace(timelineId: string): Promise<void> {
    try {
      const { error } = await supabase
        .from("user_timelines")
        .update({ is_active: false })
        .eq("id", timelineId);

      if (error) {
        throw new Error(`Failed to remove timeline place: ${error.message}`);
      }
    } catch (error) {
      console.error("Error removing timeline place:", error);
      throw error;
    }
  }

  /**
   * Reorder timeline places
   */
  static async reorderTimelinePlaces(
    userId: string,
    timelineIds: string[]
  ): Promise<void> {
    try {
      // Update display order for each timeline
      const updates = timelineIds.map((id, index) => ({
        id,
        display_order: index,
      }));

      for (const update of updates) {
        const { error } = await supabase
          .from("user_timelines")
          .update({ display_order: update.display_order })
          .eq("id", update.id)
          .eq("user_id", userId);

        if (error) {
          throw new Error(`Failed to update timeline order: ${error.message}`);
        }
      }
    } catch (error) {
      console.error("Error reordering timeline places:", error);
      throw error;
    }
  }
}

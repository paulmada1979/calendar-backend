import express from "express";
import { isAuth } from "../middleware/isAuth";
import { UserPreferencesService } from "../services/userPreferences";

const router = express.Router();

// Get user preferences
router.get("/preferences", isAuth, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    const preferences = await UserPreferencesService.getUserPreferences(userId);
    res.json({ preferences });
  } catch (error) {
    console.error("Error getting user preferences:", error);
    res.status(500).json({ error: "Failed to get user preferences" });
  }
});

// Update user preferences
router.put("/preferences", isAuth, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    const { timezone, locale } = req.body;

    if (!timezone && !locale) {
      return res
        .status(400)
        .json({ error: "At least one preference must be provided" });
    }

    const updates: any = {};
    if (timezone) updates.timezone = timezone;
    if (locale) updates.locale = locale;

    const preferences = await UserPreferencesService.updateUserPreferences(
      userId,
      updates
    );
    res.json({ preferences });
  } catch (error) {
    console.error("Error updating user preferences:", error);
    res.status(500).json({ error: "Failed to update user preferences" });
  }
});

// Get user timeline places
router.get("/timelines", isAuth, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    const timelines = await UserPreferencesService.getUserTimelines(userId);
    res.json({ timelines });
  } catch (error) {
    console.error("Error getting user timelines:", error);
    res.status(500).json({ error: "Failed to get user timelines" });
  }
});

// Add timeline place
router.post("/timelines", isAuth, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    const { place_id, city, country, zone, timezone_offset, locale } = req.body;

    if (
      !place_id ||
      !city ||
      !country ||
      !zone ||
      timezone_offset === undefined
    ) {
      return res.status(400).json({
        error:
          "Missing required fields: place_id, city, country, zone, timezone_offset",
      });
    }

    const timeline = await UserPreferencesService.addTimelinePlace(userId, {
      place_id,
      city,
      country,
      zone,
      timezone_offset: parseFloat(timezone_offset),
      locale: locale || "en",
    });

    res.json({ timeline });
  } catch (error) {
    console.error("Error adding timeline place:", error);
    res.status(500).json({ error: "Failed to add timeline place" });
  }
});

// Update timeline place
router.put("/timelines/:id", isAuth, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    const { id } = req.params;
    const updates = req.body;

    // Remove fields that shouldn't be updated
    delete updates.id;
    delete updates.user_id;
    delete updates.created_at;
    delete updates.updated_at;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: "No valid fields to update" });
    }

    const timeline = await UserPreferencesService.updateTimelinePlace(
      id,
      updates
    );
    res.json({ timeline });
  } catch (error) {
    console.error("Error updating timeline place:", error);
    res.status(500).json({ error: "Failed to update timeline place" });
  }
});

// Remove timeline place
router.delete("/timelines/:id", isAuth, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    const { id } = req.params;
    await UserPreferencesService.removeTimelinePlace(id);

    res.json({ message: "Timeline place removed successfully" });
  } catch (error) {
    console.error("Error removing timeline place:", error);
    res.status(500).json({ error: "Failed to remove timeline place" });
  }
});

// Reorder timeline places
router.put("/timelines/reorder", isAuth, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    const { timelineIds } = req.body;

    if (!Array.isArray(timelineIds) || timelineIds.length === 0) {
      return res.status(400).json({ error: "timelineIds array is required" });
    }

    await UserPreferencesService.reorderTimelinePlaces(userId, timelineIds);

    res.json({ message: "Timeline order updated successfully" });
  } catch (error) {
    console.error("Error reordering timeline places:", error);
    res.status(500).json({ error: "Failed to reorder timeline places" });
  }
});

export default router;

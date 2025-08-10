import { calendar_v3 } from "googleapis";

export type FullCalendarEvent = {
  id: string;
  title: string;
  start: string;
  end?: string;
  allDay?: boolean;
  url?: string;
  extendedProps?: Record<string, unknown>;
};

export function mapGoogleEventsToFullCalendar(
  events: calendar_v3.Schema$Event[] = []
): FullCalendarEvent[] {
  return events.map((e) => {
    const start = e.start?.dateTime || e.start?.date;
    const end = e.end?.dateTime || e.end?.date || undefined;
    const isAllDay = Boolean(e.start?.date && !e.start?.dateTime);
    return {
      id: e.id || "",
      title: e.summary || "",
      start: start || "",
      end,
      allDay: isAllDay,
      url: e.htmlLink || undefined,
      extendedProps: {
        location: e.location,
        description: e.description,
        organizer: e.organizer?.email,
        attendees: e.attendees,
        status: e.status,
      },
    };
  });
}

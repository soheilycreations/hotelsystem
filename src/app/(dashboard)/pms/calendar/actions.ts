"use server";

import { revalidatePath } from "next/cache";
import { createClient, getSessionProfile } from "@/lib/supabase/server";
import type { EventStatus } from "@/lib/types";

interface ActionResult {
  ok: boolean;
  error?: string;
}

const CALENDAR_ROLES = ["admin", "manager", "receptionist"];

async function assertCalendarRole() {
  const profile = await getSessionProfile();
  if (!profile || !CALENDAR_ROLES.includes(profile.role)) {
    throw new Error("Not authorized for calendar bookings.");
  }
  return profile;
}

function revalidateCalendar(): void {
  revalidatePath("/pms/calendar");
}

export async function createEventBooking(formData: FormData): Promise<ActionResult> {
  try {
    const profile = await assertCalendarRole();

    const eventName = String(formData.get("event_name") ?? "").trim();
    const description = String(formData.get("description") ?? "").trim();
    const paxRaw = String(formData.get("pax") ?? "").trim();
    const eventDate = String(formData.get("event_date") ?? "");
    const eventTime = String(formData.get("event_time") ?? "").trim();
    const contactName = String(formData.get("contact_name") ?? "").trim();
    const contactNumber = String(formData.get("contact_number") ?? "").trim();
    const status = String(formData.get("status") ?? "confirmed") as EventStatus;

    if (!eventName) return { ok: false, error: "Event name is required." };
    if (!eventDate) return { ok: false, error: "Pick a date." };
    const pax = paxRaw ? Number(paxRaw) : null;
    if (pax !== null && (!Number.isInteger(pax) || pax <= 0))
      return { ok: false, error: "Pax must be a positive number." };

    const supabase = await createClient();
    const { error } = await supabase.from("event_bookings").insert({
      event_name: eventName,
      description: description || null,
      pax,
      event_date: eventDate,
      event_time: eventTime || null,
      contact_name: contactName || null,
      contact_number: contactNumber || null,
      status,
      created_by: profile.id,
    });
    if (error) return { ok: false, error: error.message };

    revalidateCalendar();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}

export async function updateEventBooking(
  eventId: string,
  formData: FormData
): Promise<ActionResult> {
  try {
    await assertCalendarRole();

    const eventName = String(formData.get("event_name") ?? "").trim();
    const description = String(formData.get("description") ?? "").trim();
    const paxRaw = String(formData.get("pax") ?? "").trim();
    const eventDate = String(formData.get("event_date") ?? "");
    const eventTime = String(formData.get("event_time") ?? "").trim();
    const contactName = String(formData.get("contact_name") ?? "").trim();
    const contactNumber = String(formData.get("contact_number") ?? "").trim();
    const status = String(formData.get("status") ?? "confirmed") as EventStatus;

    if (!eventName) return { ok: false, error: "Event name is required." };
    if (!eventDate) return { ok: false, error: "Pick a date." };
    const pax = paxRaw ? Number(paxRaw) : null;
    if (pax !== null && (!Number.isInteger(pax) || pax <= 0))
      return { ok: false, error: "Pax must be a positive number." };

    const supabase = await createClient();
    const { error } = await supabase
      .from("event_bookings")
      .update({
        event_name: eventName,
        description: description || null,
        pax,
        event_date: eventDate,
        event_time: eventTime || null,
        contact_name: contactName || null,
        contact_number: contactNumber || null,
        status,
      })
      .eq("id", eventId);
    if (error) return { ok: false, error: error.message };

    revalidateCalendar();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}

export async function deleteEventBooking(eventId: string): Promise<ActionResult> {
  try {
    await assertCalendarRole();
    const supabase = await createClient();
    const { error } = await supabase.from("event_bookings").delete().eq("id", eventId);
    if (error) return { ok: false, error: error.message };

    revalidateCalendar();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}

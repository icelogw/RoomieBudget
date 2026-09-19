"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getDb } from "@/db";
import { requireUser } from "@/lib/auth/current-user";
import type { FormState } from "@/lib/forms";
import { fieldErrorsFrom } from "@/lib/forms";
import { MoneyError, parseAmount } from "@/lib/money";
import { createSeries, deleteSeries, generateDueBills, setSeriesActive } from "@/server/recurring";

export type RecurringState = FormState & { notice?: string };

const CALENDAR_DATE = /^\d{4}-\d{2}-\d{2}$/;

const schema = z.object({
  description: z
    .string()
    .trim()
    .min(1, "What is this bill for?")
    .max(120, "Keep the description under 120 characters"),
  category: z.string().trim().max(40).optional(),
  amountMode: z.enum(["fixed", "prompt"]),
  frequency: z.enum(["weekly", "fortnightly", "monthly", "quarterly", "yearly"]),
  anchorDate: z.string().regex(CALENDAR_DATE, "Enter a valid start date"),
  dueOffsetDays: z.coerce.number().int().min(0).max(90, "Ninety days is the maximum"),
  splitMode: z.enum(["even", "weights", "single"]),
});

export async function addSeries(
  _previous: RecurringState,
  formData: FormData,
): Promise<RecurringState> {
  const user = await requireUser();

  const parsed = schema.safeParse({
    description: formData.get("description"),
    category: formData.get("category") ?? undefined,
    amountMode: formData.get("amountMode") ?? "fixed",
    frequency: formData.get("frequency") ?? "monthly",
    anchorDate: formData.get("anchorDate"),
    dueOffsetDays: formData.get("dueOffsetDays") ?? 14,
    splitMode: formData.get("splitMode") ?? "even",
  });

  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error) };

  let totalCents: number | null = null;
  if (parsed.data.amountMode === "fixed") {
    try {
      totalCents = parseAmount(String(formData.get("total") ?? ""));
    } catch {
      return { fieldErrors: { total: "Enter an amount, like 620.00" } };
    }
    if (totalCents <= 0) return { fieldErrors: { total: "Enter an amount above zero" } };
  }

  const participantIds = formData.getAll("participant").map(String).filter(Boolean);
  if (participantIds.length === 0) {
    return { message: "Choose at least one person for this bill." };
  }

  // Weights only mean anything in "weights" mode; the other modes ignore them.
  const participants = participantIds.map((userId) => {
    const raw = String(formData.get(`weight:${userId}`) ?? "1").trim();
    const weight = Number.parseInt(raw, 10);
    return { userId, weight: Number.isFinite(weight) && weight >= 0 ? weight : 1 };
  });

  const paidBy = String(formData.get("paidBy") || user.id);

  try {
    createSeries(getDb(), {
      createdBy: user.id,
      paidBy,
      description: parsed.data.description,
      category: parsed.data.category || null,
      amountMode: parsed.data.amountMode,
      totalCents,
      frequency: parsed.data.frequency,
      anchorDate: parsed.data.anchorDate,
      dueOffsetDays: parsed.data.dueOffsetDays,
      splitMode: parsed.data.splitMode,
      participants,
    });
  } catch (error) {
    if (error instanceof MoneyError) return { message: error.message };
    return {
      message: error instanceof Error ? error.message : "That recurring bill could not be saved.",
    };
  }

  // Issue immediately if the start date has already passed, so a series added
  // with a past start does not sit doing nothing until the next check.
  generateDueBills(getDb());

  revalidatePath("/recurring");
  revalidatePath("/");
  redirect("/recurring");
}

export async function toggleSeries(
  _previous: RecurringState,
  formData: FormData,
): Promise<RecurringState> {
  const user = await requireUser();

  const seriesId = String(formData.get("seriesId") ?? "");
  const active = formData.get("active") === "true";

  if (!setSeriesActive(getDb(), { seriesId, actorId: user.id, active })) {
    return { message: "That recurring bill no longer exists." };
  }

  revalidatePath("/recurring");
  return { notice: active ? "Resumed." : "Paused. Nothing more will be issued." };
}

export async function removeSeries(
  _previous: RecurringState,
  formData: FormData,
): Promise<RecurringState> {
  const user = await requireUser();

  const seriesId = String(formData.get("seriesId") ?? "");
  if (!deleteSeries(getDb(), { seriesId, actorId: user.id })) {
    return { message: "That recurring bill no longer exists." };
  }

  revalidatePath("/recurring");
  revalidatePath("/");
  return { notice: "Deleted. Bills it already issued are untouched." };
}

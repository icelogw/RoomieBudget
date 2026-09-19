"use server";

import { revalidatePath } from "next/cache";

import { getDb } from "@/db";
import { requireUser } from "@/lib/auth/current-user";
import type { FormState } from "@/lib/forms";
import { deleteSeries, setSeriesActive } from "@/server/recurring";

export type RecurringState = FormState & { notice?: string };

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

  revalidatePath("/household");
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

  revalidatePath("/household");
  revalidatePath("/");
  return { notice: "Deleted. Bills it already issued are untouched." };
}

"use server";

import { revalidatePath } from "next/cache";

import { getDb } from "@/db";
import { requireUser } from "@/lib/auth/current-user";
import type { FormState } from "@/lib/forms";
import { formatAud } from "@/lib/money";
import { settleBetween } from "@/server/balances";

export type SettleState = FormState & { notice?: string };

export async function settleUp(
  _previous: SettleState,
  formData: FormData,
): Promise<SettleState> {
  const user = await requireUser();

  const debtorId = String(formData.get("debtorId") ?? "");
  const creditorId = String(formData.get("creditorId") ?? "");

  if (!debtorId || !creditorId || debtorId === creditorId) {
    return { message: "That settle-up does not make sense." };
  }

  // Either party can settle up, matching how a single share works, but the
  // person doing it must be one of the two involved — settling a debt between
  // two other people is not anyone else's call.
  if (user.id !== debtorId && user.id !== creditorId) {
    return { message: "Only the two people involved can settle that up." };
  }

  const result = settleBetween(getDb(), { debtorId, creditorId, actorId: user.id });

  if (result.count === 0) {
    return { message: "There was nothing left to settle." };
  }

  revalidatePath("/");
  revalidatePath("/balances");

  return {
    notice: `Settled ${formatAud(result.totalCents)} across ${result.count} ${
      result.count === 1 ? "bill" : "bills"
    }.`,
  };
}

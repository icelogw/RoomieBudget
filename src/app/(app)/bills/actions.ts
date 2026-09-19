"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getDb } from "@/db";
import { requireUser } from "@/lib/auth/current-user";
import { todayIso } from "@/lib/dates";
import { fieldErrorsFrom, type FormState } from "@/lib/forms";
import { MoneyError, parseAmount } from "@/lib/money";
import { parsePercent, type Split } from "@/lib/split";
import { createBill, setShareSettled, voidBill } from "@/server/bills";

export type BillFormState = FormState & { notice?: string };

const CALENDAR_DATE = /^\d{4}-\d{2}-\d{2}$/;

const detailsSchema = z.object({
  description: z
    .string()
    .trim()
    .min(1, "What is this bill for?")
    .max(120, "Keep the description under 120 characters"),
  category: z.string().trim().max(40).optional(),
  issuedOn: z.string().regex(CALENDAR_DATE, "Enter a valid date"),
  dueOn: z.union([z.string().regex(CALENDAR_DATE, "Enter a valid date"), z.literal("")]),
  notes: z.string().trim().max(500, "Keep notes under 500 characters").optional(),
  splitMode: z.enum(["even", "amount", "percent", "single"]),
});

/**
 * Build the split from the form.
 *
 * The browser sends a description of how to split — who is involved and with
 * what weights — never the resulting amounts. The server computes those, so a
 * tampered form cannot store shares that do not add up.
 */
function readSplit(formData: FormData, mode: string): Split {
  const participants = formData.getAll("participant").map(String).filter(Boolean);

  if (mode === "single") {
    const userId = String(formData.get("singleUserId") ?? "");
    if (!userId) throw new MoneyError("Choose who is paying for this");
    return { mode: "single", userId };
  }

  if (participants.length === 0) {
    throw new MoneyError("Choose at least one person to split this between");
  }

  if (mode === "even") {
    return { mode: "even", userIds: participants };
  }

  if (mode === "amount") {
    return {
      mode: "amount",
      entries: participants.map((userId) => {
        const raw = String(formData.get(`amount:${userId}`) ?? "").trim();
        return { userId, amountCents: raw ? parseAmount(raw) : 0 };
      }),
    };
  }

  return {
    mode: "percent",
    entries: participants.map((userId) => {
      const raw = String(formData.get(`percent:${userId}`) ?? "").trim();
      return { userId, basisPoints: raw ? parsePercent(raw) : 0 };
    }),
  };
}

export async function addBill(
  _previous: BillFormState,
  formData: FormData,
): Promise<BillFormState> {
  const user = await requireUser();

  const parsed = detailsSchema.safeParse({
    description: formData.get("description"),
    category: formData.get("category") ?? undefined,
    issuedOn: formData.get("issuedOn") || todayIso(),
    dueOn: formData.get("dueOn") ?? "",
    notes: formData.get("notes") ?? undefined,
    splitMode: formData.get("splitMode") ?? "even",
  });

  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error) };

  let totalCents: number;
  try {
    totalCents = parseAmount(String(formData.get("total") ?? ""));
  } catch {
    return { fieldErrors: { total: "Enter an amount, like 124.50" } };
  }

  if (totalCents <= 0) {
    return { fieldErrors: { total: "A bill must be more than zero" } };
  }

  if (parsed.data.dueOn && parsed.data.dueOn < parsed.data.issuedOn) {
    return { fieldErrors: { dueOn: "The due date cannot be before the issue date" } };
  }

  let billId: string;
  try {
    const split = readSplit(formData, parsed.data.splitMode);
    billId = createBill(getDb(), {
      createdBy: user.id,
      description: parsed.data.description,
      category: parsed.data.category || null,
      totalCents,
      issuedOn: parsed.data.issuedOn,
      dueOn: parsed.data.dueOn || null,
      notes: parsed.data.notes || null,
      split,
    });
  } catch (error) {
    // Split problems are the user's to fix and are phrased for them; anything
    // else is a genuine fault and should not be dressed up as advice.
    if (error instanceof MoneyError) return { message: error.message };
    return {
      message: error instanceof Error ? error.message : "That bill could not be saved.",
    };
  }

  revalidatePath("/");
  revalidatePath("/balances");
  redirect(`/bills/${billId}`);
}

export async function toggleShareSettled(
  _previous: BillFormState,
  formData: FormData,
): Promise<BillFormState> {
  const user = await requireUser();

  const shareId = String(formData.get("shareId") ?? "");
  const settled = formData.get("settled") === "true";

  const ok = setShareSettled(getDb(), { shareId, actorId: user.id, settled });
  if (!ok) return { message: "That share could not be updated." };

  revalidatePath("/");
  revalidatePath("/balances");
  revalidatePath(`/bills/${String(formData.get("billId") ?? "")}`);
  return {};
}

export async function voidBillAction(
  _previous: BillFormState,
  formData: FormData,
): Promise<BillFormState> {
  const user = await requireUser();

  const billId = String(formData.get("billId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();

  if (!reason) return { fieldErrors: { reason: "Say why, so the record makes sense later" } };

  const ok = voidBill(getDb(), { billId, actorId: user.id, reason });
  if (!ok) return { message: "That bill has already been voided." };

  revalidatePath("/");
  revalidatePath("/balances");
  redirect("/");
}

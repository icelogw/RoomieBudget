"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getDb } from "@/db";
import { requireUser } from "@/lib/auth/current-user";
import { todayIso } from "@/lib/dates";
import { fieldErrorsFrom, type FormState } from "@/lib/forms";
import { MoneyError, parseAmount } from "@/lib/money";
import { daysBetween } from "@/lib/dates";
import { FREQUENCIES } from "@/lib/recurrence";
import { parsePercent, type Split } from "@/lib/split";
import { createBill, setShareSettled, voidBill } from "@/server/bills";
import { notifyBillCreated } from "@/server/notifications";
import {
  createSeries,
  finaliseDraftBill,
  generateDueBills,
  type SeriesParticipant,
} from "@/server/recurring";

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

const FREQUENCY_VALUES = FREQUENCIES.map((f) => f.value);

/**
 * Express the chosen split as proportional weights, which is what a series
 * stores.
 *
 * Percentages and hand-entered amounts both map exactly: while the total is
 * the same each time, weights in the ratio of those figures reproduce them.
 * When the amount varies, proportions are the only thing that can carry over.
 */
function splitAsSeries(split: Split): {
  splitMode: "even" | "weights" | "single";
  participants: SeriesParticipant[];
} {
  switch (split.mode) {
    case "even":
      return {
        splitMode: "even",
        participants: split.userIds.map((userId) => ({ userId, weight: 1 })),
      };
    case "single":
      return { splitMode: "single", participants: [{ userId: split.userId, weight: 1 }] };
    case "amount":
      return {
        splitMode: "weights",
        participants: split.entries.map((e) => ({ userId: e.userId, weight: e.amountCents })),
      };
    case "percent":
      return {
        splitMode: "weights",
        participants: split.entries.map((e) => ({ userId: e.userId, weight: e.basisPoints })),
      };
    case "weights":
      return { splitMode: "weights", participants: split.entries };
  }
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

  // A repeating bill whose amount varies has no figure to give yet.
  const amountOmitted =
    formData.get("repeats") !== null && formData.get("amountVaries") !== null;

  let totalCents = 0;
  if (!amountOmitted) {
    try {
      totalCents = parseAmount(String(formData.get("total") ?? ""));
    } catch {
      return { fieldErrors: { total: "Enter an amount, like 124.50" } };
    }

    if (totalCents <= 0) {
      return { fieldErrors: { total: "A bill must be more than zero" } };
    }
  }

  if (parsed.data.dueOn && parsed.data.dueOn < parsed.data.issuedOn) {
    return { fieldErrors: { dueOn: "The due date cannot be before the issue date" } };
  }

  // Who fronted the money. Defaults to whoever is entering the bill, which
  // is nearly always the same person.
  const paidBy = String(formData.get("paidBy") || user.id);

  const repeats = formData.get("repeats") !== null;
  const amountVaries = formData.get("amountVaries") !== null;

  if (repeats) {
    return addRecurring(formData, {
      actorId: user.id,
      paidBy,
      amountVaries,
      totalCents,
      details: parsed.data,
    });
  }

  let billId: string;
  try {
    const split = readSplit(formData, parsed.data.splitMode);
    billId = createBill(getDb(), {
      createdBy: user.id,
      paidBy,
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

  notifyBillCreated(getDb(), billId);

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

export async function finaliseBill(
  _previous: BillFormState,
  formData: FormData,
): Promise<BillFormState> {
  const user = await requireUser();

  const billId = String(formData.get("billId") ?? "");

  let totalCents: number;
  try {
    totalCents = parseAmount(String(formData.get("total") ?? ""));
  } catch {
    return { fieldErrors: { total: "Enter an amount, like 124.50" } };
  }

  const result = finaliseDraftBill(getDb(), { billId, totalCents, actorId: user.id });
  if (!result.ok) return { message: result.reason };

  // Only now does anyone owe anything, so this is when it is worth telling
  // them — not when the empty draft appeared.
  notifyBillCreated(getDb(), billId);

  revalidatePath("/");
  revalidatePath("/balances");
  revalidatePath(`/bills/${billId}`);
  return { notice: "Amount set and split." };
}

/**
 * Turn the bill form into a recurring series.
 *
 * The first bill is not created directly: the series is anchored on the issue
 * date and the generator runs immediately, so a series starting today issues
 * exactly one bill through the same path as every later one. Creating the
 * first bill by hand would risk it differing from the rest.
 */
async function addRecurring(
  formData: FormData,
  context: {
    actorId: string;
    paidBy: string;
    amountVaries: boolean;
    totalCents: number;
    details: {
      description: string;
      category?: string;
      issuedOn: string;
      dueOn: string;
      notes?: string;
      splitMode: "even" | "amount" | "percent" | "single";
    };
  },
): Promise<BillFormState> {
  const { details } = context;

  const frequency = String(formData.get("frequency") ?? "monthly");
  if (!FREQUENCY_VALUES.includes(frequency as (typeof FREQUENCY_VALUES)[number])) {
    return { fieldErrors: { frequency: "Choose how often it repeats" } };
  }

  // The gap the person entered between issue and due becomes how long there is
  // to pay each time, so there is no separate field to fill in.
  const dueOffsetDays = details.dueOn
    ? Math.max(0, Math.min(90, daysBetween(details.issuedOn, details.dueOn)))
    : 14;

  try {
    const split = readSplit(formData, details.splitMode);
    const { splitMode, participants } = splitAsSeries(split);

    createSeries(getDb(), {
      createdBy: context.actorId,
      paidBy: context.paidBy,
      description: details.description,
      category: details.category || null,
      amountMode: context.amountVaries ? "prompt" : "fixed",
      totalCents: context.amountVaries ? null : context.totalCents,
      frequency: frequency as (typeof FREQUENCY_VALUES)[number],
      anchorDate: details.issuedOn,
      dueOffsetDays,
      splitMode,
      participants,
    });
  } catch (error) {
    if (error instanceof MoneyError) return { message: error.message };
    return {
      message:
        error instanceof Error ? error.message : "That recurring bill could not be saved.",
    };
  }

  // Issues the first bill now if the start date has arrived.
  generateDueBills(getDb());

  revalidatePath("/");
  revalidatePath("/household");
  revalidatePath("/balances");
  redirect("/");
}

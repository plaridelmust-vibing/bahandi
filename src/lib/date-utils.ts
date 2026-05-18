/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { format, isValid } from "date-fns";
import { Timestamp } from "firebase/firestore";

/**
 * Returns the current date/time in Manila (UTC+8)
 */
export function getManilaNow(): Date {
  const now = new Date();
  // Get PH time by offset
  const phOffset = 8 * 60; // Manila is UTC+8
  const localOffset = now.getTimezoneOffset(); // in minutes
  const totalOffset = phOffset + localOffset; // adjustment from system local to Manila
  return new Date(now.getTime() + totalOffset * 60 * 1000);
}

/**
 * Safely formats a date, handling Timestamps, Date objects, and invalid inputs.
 */
export function safeFormat(date: Date | Timestamp | null | undefined, formatStr: string, fallback: string = ""): string {
  if (!date) return fallback;
  
  try {
    const d = date instanceof Timestamp ? date.toDate() : date;
    if (!isValid(d)) return fallback;
    return format(d, formatStr);
  } catch (e) {
    return fallback;
  }
}

/**
 * Converts a date input to a valid JS Date object or null if invalid.
 * If a string represents a date only (YYYY-MM-DD), it creates it as local time.
 */
export function toValidDate(date: any): Date | null {
  if (!date) return null;
  
  if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    // For YYYY-MM-DD, parse manually to avoid UTC shift
    const [year, month, day] = date.split('-').map(Number);
    const d = new Date(year, month - 1, day);
    return isValid(d) ? d : null;
  }

  const d = date instanceof Timestamp ? date.toDate() : new Date(date);
  return isValid(d) ? d : null;
}

/**
 * Normalizes a date to the start of the day (00:00:00.000).
 */
export function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Normalizes a date to the end of the day (23:59:59.999).
 */
export function endOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

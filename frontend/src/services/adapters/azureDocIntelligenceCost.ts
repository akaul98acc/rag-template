/**
 * Azure Document Intelligence cost estimation adapter.
 *
 * Based on Azure S0 (Standard) tier pricing for prebuilt-layout model:
 * - Base rate: $0.01 per page
 * - Language detection add-on: $0.001 per page
 * - Total: ~$0.011 per page
 *
 * This is an estimate and may vary by region and pricing changes.
 * Always verify current pricing at the Azure pricing calculator.
 */

const BASE_RATE_PER_PAGE = 0.01;
const LANGUAGE_ADDON_PER_PAGE = 0.001;
const TOTAL_RATE_PER_PAGE = BASE_RATE_PER_PAGE + LANGUAGE_ADDON_PER_PAGE;

export interface CostEstimate {
  amount: number;
  formatted: string;
  currency: string;
}

/**
 * Calculates the estimated cost for processing a document with Azure Document Intelligence.
 *
 * @param pageCount - The number of pages in the document. Returns null if undefined or null.
 * @returns A CostEstimate object with the amount and formatted string, or null if pageCount is unavailable.
 */
export function calculateDocumentProcessingCost(
  pageCount: number | null | undefined
): CostEstimate | null {
  if (pageCount == null || pageCount <= 0) {
    return null;
  }

  const amount = pageCount * TOTAL_RATE_PER_PAGE;

  return {
    amount,
    formatted: `$${amount.toFixed(2)}`,
    currency: "USD",
  };
}

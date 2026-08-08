import { useMutation } from "@tanstack/react-query";
import type { UseMutationOptions, UseMutationResult } from "@tanstack/react-query";
import { customFetch } from "./custom-fetch";
import type { ErrorType } from "./custom-fetch";

export interface ObUploadPreviewBody {
  fileObjectPath: string;
  sheetName?: string;
}

export interface ObUploadPreviewRow {
  rowNumber: number;
  rawName: string;
  savings: number;
  provident: number;
  christmas: number;
  realLoan: number;
  emergencyLoan: number;
  electronics: number;
  sElectronics: number;
  furniture: number;
  commodity: number;
  ghlForm: number;
  fire: number;
  fuelVenture: number;
  landLoan: number;
  total: number;
  warnings: string[];
  errors: string[];
}

export interface ObUploadPreviewResult {
  sheetName: string;
  sheets: Array<{ name: string; rowCount: number; looksValid: boolean }>;
  totalRows: number;
  rows: ObUploadPreviewRow[];
}

export interface ObUploadProcessBody {
  fileObjectPath: string;
  sheetName?: string;
  /** Month (1–12) these balances are effective from. */
  effectiveMonth: number;
  /** Year these balances are effective from. */
  effectiveYear: number;
}

export interface ObUploadProcessResult {
  inserted: number;
  skipped: number;
}

export const previewOpeningBalanceUpload = async (
  body: ObUploadPreviewBody,
): Promise<ObUploadPreviewResult> => {
  return customFetch<ObUploadPreviewResult>("/api/uploads/opening-balances/preview", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
};

export const processOpeningBalanceUpload = async (
  body: ObUploadProcessBody,
): Promise<ObUploadProcessResult> => {
  return customFetch<ObUploadProcessResult>("/api/uploads/opening-balances/process", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
};

export const usePreviewOpeningBalanceUpload = <
  TError = ErrorType<unknown>,
  TContext = unknown,
>(options?: {
  mutation?: UseMutationOptions<
    ObUploadPreviewResult,
    TError,
    ObUploadPreviewBody,
    TContext
  >;
}): UseMutationResult<ObUploadPreviewResult, TError, ObUploadPreviewBody, TContext> => {
  const mutationFn = (body: ObUploadPreviewBody) => previewOpeningBalanceUpload(body);
  return useMutation({ mutationFn, ...options?.mutation });
};

export const useProcessOpeningBalanceUpload = <
  TError = ErrorType<unknown>,
  TContext = unknown,
>(options?: {
  mutation?: UseMutationOptions<
    ObUploadProcessResult,
    TError,
    ObUploadProcessBody,
    TContext
  >;
}): UseMutationResult<ObUploadProcessResult, TError, ObUploadProcessBody, TContext> => {
  const mutationFn = (body: ObUploadProcessBody) => processOpeningBalanceUpload(body);
  return useMutation({ mutationFn, ...options?.mutation });
};

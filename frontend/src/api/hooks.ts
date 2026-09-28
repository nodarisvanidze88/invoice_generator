import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "./client";
import type {
  Company,
  CompanyFields,
  Customer,
  ImportApplyRow,
  ImportPreview,
  ImportResult,
  Invoice,
  InvoiceCreate,
  InvoiceDocument,
  InvoiceSummary,
  Party,
  Product,
  ProductFields,
} from "./types";

export const keys = {
  session: ["session"] as const,
  products: ["products"] as const,
  customers: ["customers"] as const,
  company: ["company"] as const,
  invoices: ["invoices"] as const,
  invoice: (id: number) => ["invoices", id] as const,
  nextNumber: ["invoices", "next-number"] as const,
};

export function useSession() {
  return useQuery({
    queryKey: keys.session,
    queryFn: () => api.get<{ authenticated: boolean }>("/api/auth/me"),
    staleTime: Infinity,
  });
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (password: string) => api.post<{ authenticated: boolean }>("/api/auth/login", { password }),
    onSuccess: (data) => qc.setQueryData(keys.session, data),
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<{ authenticated: boolean }>("/api/auth/logout"),
    onSuccess: (data) => {
      qc.setQueryData(keys.session, data);
      qc.removeQueries({ predicate: (query) => query.queryKey[0] !== keys.session[0] });
    },
  });
}

export function useProducts() {
  return useQuery({ queryKey: keys.products, queryFn: () => api.get<Product[]>("/api/products") });
}

export function useSaveProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id?: number; data: ProductFields }) =>
      id ? api.put<Product>(`/api/products/${id}`, data) : api.post<Product>("/api/products", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.products }),
  });
}

export function useDeleteProducts() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: number[]) =>
      ids.length === 1 ? api.delete(`/api/products/${ids[0]}`) : api.post<void>("/api/products/bulk-delete", { ids }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.products }),
  });
}

export function useCustomers() {
  return useQuery({ queryKey: keys.customers, queryFn: () => api.get<Customer[]>("/api/customers") });
}

export function useSaveCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id?: number; data: Party }) =>
      id ? api.put<Customer>(`/api/customers/${id}`, data) : api.post<Customer>("/api/customers", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.customers }),
  });
}

export function useDeleteCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete(`/api/customers/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.customers }),
  });
}

export function useCompany() {
  return useQuery({ queryKey: keys.company, queryFn: () => api.get<Company>("/api/company") });
}

export function useSaveCompany() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CompanyFields) => api.put<Company>("/api/company", data),
    onSuccess: (data) => {
      qc.setQueryData(keys.company, data);
      qc.invalidateQueries({ queryKey: keys.nextNumber });
    },
  });
}

export function useInvoices() {
  return useQuery({ queryKey: keys.invoices, queryFn: () => api.get<InvoiceSummary[]>("/api/invoices") });
}

export function useNextInvoiceNumber() {
  return useQuery({
    queryKey: keys.nextNumber,
    queryFn: () => api.get<{ number: string }>("/api/invoices/next-number"),
  });
}

export function useInvoice(id: number) {
  return useQuery({ queryKey: keys.invoice(id), queryFn: () => api.get<Invoice>(`/api/invoices/${id}`) });
}

export function useCreateInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: InvoiceCreate) => api.post<Invoice>("/api/invoices", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.invoices });
      qc.invalidateQueries({ queryKey: keys.company });
    },
  });
}

export function useSaveInvoice(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (doc: InvoiceDocument) => api.put<Invoice>(`/api/invoices/${id}`, doc),
    onSuccess: (data) => {
      qc.setQueryData(keys.invoice(id), data);
      qc.invalidateQueries({ queryKey: keys.invoices, exact: true });
    },
  });
}

export function useDuplicateInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.post<Invoice>(`/api/invoices/${id}/duplicate`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.invoices });
      qc.invalidateQueries({ queryKey: keys.company });
    },
  });
}

export function useDeleteInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete(`/api/invoices/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.invoices }),
  });
}

export function usePreviewImport() {
  return useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append("file", file);
      return api.post<ImportPreview>("/api/imports/csv/preview", form);
    },
  });
}

export function useApplyImport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { rows: ImportApplyRow[]; update_prices: boolean }) =>
      api.post<ImportResult>("/api/imports/csv/apply", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.products }),
  });
}

import { Navigate, Route, Routes } from "react-router-dom";

import { useSession } from "./api/hooks";
import { Layout } from "./components/Layout";
import { PageLoader } from "./components/ui";
import { CustomersPage } from "./pages/CustomersPage";
import { ImportPage } from "./pages/ImportPage";
import { InvoiceEditorPage } from "./pages/invoice/InvoiceEditorPage";
import { InvoicesPage } from "./pages/InvoicesPage";
import { LoginPage } from "./pages/LoginPage";
import { ProductsPage } from "./pages/products/ProductsPage";
import { SettingsPage } from "./pages/SettingsPage";

export function App() {
  const session = useSession();
  if (session.isLoading) return <PageLoader />;
  if (!session.data?.authenticated) return <LoginPage />;
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Navigate to="/products" replace />} />
        <Route path="/products" element={<ProductsPage />} />
        <Route path="/invoices" element={<InvoicesPage />} />
        <Route path="/invoices/:id" element={<InvoiceEditorPage />} />
        <Route path="/customers" element={<CustomersPage />} />
        <Route path="/import" element={<ImportPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/products" replace />} />
      </Route>
    </Routes>
  );
}

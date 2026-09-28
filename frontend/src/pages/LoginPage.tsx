import { Building2, FileText, Lock, Package, Truck } from "lucide-react";
import { useState, type FormEvent } from "react";

import { useLogin } from "../api/hooks";
import { Button, Input } from "../components/ui";

const FEATURES = [
  { icon: Package, text: "Manage your product catalogue with HS tariff codes" },
  { icon: FileText, text: "Generate customs-ready commercial invoices as PDF" },
  { icon: Truck, text: "Build packing lists box by box" },
];

export function LoginPage() {
  const [password, setPassword] = useState("");
  const login = useLogin();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    login.mutate(password);
  };

  return (
    <div className="grid min-h-full lg:grid-cols-2">
      <div className="relative hidden overflow-hidden bg-slate-900 lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div className="absolute -left-24 -top-24 size-96 rounded-full bg-brand-600/30 blur-3xl" />
        <div className="absolute -bottom-32 right-0 size-96 rounded-full bg-sky-500/20 blur-3xl" />
        <div className="relative flex items-center gap-3 text-white">
          <div className="flex size-10 items-center justify-center rounded-xl bg-brand-600">
            <Building2 className="size-5" />
          </div>
          <span className="text-lg font-semibold">Invoice Studio</span>
        </div>
        <div className="relative">
          <h2 className="text-3xl font-semibold leading-tight text-white">
            From product list to
            <br />
            shipping documents in minutes.
          </h2>
          <ul className="mt-8 space-y-4">
            {FEATURES.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3 text-slate-300">
                <span className="flex size-8 items-center justify-center rounded-lg bg-white/10">
                  <Icon className="size-4" />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-slate-500">Demo version</p>
      </div>
      <div className="flex items-center justify-center p-6">
        <form onSubmit={submit} className="w-full max-w-sm">
          <div className="mb-8 flex size-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
            <Lock className="size-5" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Welcome back</h1>
          <p className="mt-1 text-sm text-slate-500">Enter the demo password you received to continue.</p>
          <div className="mt-8 space-y-4">
            <Input
              type="password"
              autoFocus
              placeholder="Password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            {login.isError && <p className="text-sm text-rose-600">Incorrect password. Please try again.</p>}
            <Button type="submit" className="w-full" loading={login.isPending} disabled={!password}>
              Sign in
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
